import { ChangeDetectionStrategy, Component, DestroyRef } from '@angular/core';
import { computed, effect, inject, input, isDevMode, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, expand, map, of, reduce, startWith, switchMap, timer } from 'rxjs';
import type { ApiProblem, RunDto, WorkflowDto } from '@opsflow/contracts';
import { describeCron, describeTimezone, isTerminalRun } from '@opsflow/domain';
import { parseWorkflowListQuery } from '@opsflow/contracts';
import { toProblem } from '../core/http/interceptors';
import { Session } from '../core/session';
import { RunsApi } from '../runs/data/runs-api';
import { WorkflowsApi } from '../workflows/data/workflows-api';
import { BattleStore } from './data/battle-store';
import { BattleArena } from './battle-arena';
import { EventStream } from './event-stream';
import { RunInspector } from './run-inspector';
import { SystemHealth } from './system-health';
import { ChaosLab } from './chaos-lab';
import { WorkflowSidebar } from './workflow-sidebar';
import type { BattleViewMode, WorkflowCatalogueState, WorkflowSelectionState } from './battle-page.types';

@Component({
  selector: 'ops-battle-page',
  imports: [BattleArena, EventStream, RunInspector, SystemHealth, ChaosLab, WorkflowSidebar, RouterLink],
  providers: [BattleStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './battle-page.html',
})
export class BattlePage {
  /** Deep-linkable: `/battle?workflow=…&run=…` restores the same fight. */
  readonly workflow = input<string | undefined>();
  readonly run = input<string | undefined>();

  protected readonly store = inject(BattleStore);
  protected readonly session = inject(Session);
  private readonly workflows = inject(WorkflowsApi);
  private readonly runs = inject(RunsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly showChaosLab = isDevMode();
  protected readonly mode = signal<BattleViewMode>('battle');
  protected readonly busy = signal(false);
  protected readonly actionProblem = signal<ApiProblem | undefined>(undefined);

  protected readonly refresh = signal(0);
  private readonly query = parseWorkflowListQuery({ pageSize: '50', sort: 'name' });
  // Loads the small catalogue once. Thousands of workflows would need server-side search.
  private readonly catalogue = toObservable(this.refresh).pipe(
    switchMap(() => this.workflows.list(this.query).pipe(
      expand((page) => page.page < page.totalPages ? this.workflows.list({ ...this.query, page: page.page + 1 }) : EMPTY),
      reduce((items, page) => [...items, ...page.items], [] as readonly WorkflowDto[]),
      map((items): WorkflowCatalogueState => ({ loading: false, items })),
      catchError((error: unknown) => of<WorkflowCatalogueState>({ loading: false, items: [], problem: toProblem(error) })),
      startWith<WorkflowCatalogueState>({ loading: true, items: [] }),
    )),
  );
  private readonly catalogueState = toSignal(this.catalogue);
  protected readonly allWorkflows = computed(() => this.catalogueState()?.items ?? []);
  protected readonly loadingWorkflows = computed(() => this.catalogueState()?.loading ?? true);
  protected readonly catalogueProblem = computed(() => this.catalogueState()?.problem);
  protected readonly latestProblem = signal<ApiProblem | undefined>(undefined);

  /** Follows the URL, but a click can move it without a navigation round trip. */
  protected readonly selectedId = linkedSignal(() => this.workflow() ?? this.allWorkflows()[0]?.id);
  private readonly selectedFromCatalogue = computed(() => this.allWorkflows().find((row) => row.id === this.selectedId()));

  private readonly workflowUpdates = toObservable(this.selectedId).pipe(
    switchMap((id) => {
      if (!id) return of<WorkflowSelectionState>({});
      return timer(0, 5_000).pipe(
        switchMap(() => this.workflows.findById(id).pipe(
          map((workflow): WorkflowSelectionState => ({ workflow })),
          catchError((error: unknown) => of<WorkflowSelectionState>({ problem: toProblem(error) })),
        )),
        startWith<WorkflowSelectionState>({}),
      );
    }),
  );
  private readonly currentWorkflow = toSignal(this.workflowUpdates);
  protected readonly selected = computed(() => {
    const workflow = this.currentWorkflow()?.workflow;
    return workflow?.id === this.selectedId() ? workflow : this.selectedFromCatalogue();
  });
  protected readonly describeCron = describeCron;
  protected readonly describeTimezone = describeTimezone;
  private readonly now = toSignal(timer(0, 1_000).pipe(map(() => Date.now())), { initialValue: Date.now() });
  protected readonly nextStart = computed(() => {
    const selected = this.selected();
    if (this.currentWorkflow()?.problem) return 'Schedule unavailable · retrying automatically';
    if (!selected?.enabled) return 'Schedule paused · Run now is still available';
    if (!selected.nextRunAt) return 'Waiting for scheduler information';
    const seconds = Math.ceil((Date.parse(selected.nextRunAt) - this.now()) / 1000);
    if (seconds <= 0) return 'Due now · waiting for the scheduler (up to 30s)';
    const time = new Intl.DateTimeFormat('en', { timeZone: selected.timezone, hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(new Date(selected.nextRunAt));
    const minutes = Math.ceil(seconds / 60);
    const remaining = seconds < 60 ? `${seconds}s` : minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    return `Next automatic run in ${remaining} · ${time} · ${describeTimezone(selected.timezone, new Date(selected.nextRunAt))}`;
  });
  private readonly resumeAfterRun = signal(false);

  // The run under inspection: the one in the URL, else the workflow's most recent.
  protected readonly pinned = linkedSignal(() => this.run());
  private readonly latest = toObservable(computed(() => [this.selectedId(), this.pinned()] as const)).pipe(
    switchMap(([workflowId, pinnedRun]) => {
      this.latestProblem.set(undefined);
      if (pinnedRun) return of(pinnedRun);
      if (!workflowId) return of(undefined);
      const listing = { workflowId, sort: '-createdAt' as const, page: 1, pageSize: 1 };
      return timer(0, 5_000).pipe(switchMap(() => this.runs.list(listing).pipe(
        map((page) => { this.latestProblem.set(undefined); return page.items[0]?.id; }),
        catchError((error: unknown) => { this.latestProblem.set(toProblem(error)); return EMPTY; }),
      )), startWith(this.store.run()?.workflowId === workflowId ? this.store.runId() : undefined));
    }),
  );
  private readonly activeRunId = toSignal(this.latest, { initialValue: undefined });

  protected readonly battle = computed(() => this.store.battle());
  protected readonly currentRun = computed(() => this.store.run());
  protected readonly schedule = computed(() => this.selected()?.cronExpr);

  constructor() {
    effect(() => this.store.watch(this.activeRunId()));
    effect(() => {
      const current = this.currentRun();
      if (current && this.resumeAfterRun() && current.id === this.pinned() && isTerminalRun(current.status)) this.followLatest();
    });
  }

  protected choose(workflow: WorkflowDto): void {
    this.resumeAfterRun.set(false);
    this.selectedId.set(workflow.id);
    // Dropping the pin lets the sidebar fall back to that workflow's latest run.
    this.pinned.set(undefined);
    this.actionProblem.set(undefined);
    void this.router.navigate([], { queryParams: { workflow: workflow.id, run: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected reloadWorkflows(): void {
    this.refresh.update((value) => value + 1);
  }

  protected followLatest(): void {
    this.resumeAfterRun.set(false);
    this.pinned.set(undefined);
    void this.router.navigate([], { queryParams: { run: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected setMode(mode: BattleViewMode): void {
    this.mode.set(mode);
  }

  protected onInjected(run: RunDto): void {
    this.resumeAfterRun.set(true);
    this.pinned.set(run.id);
    void this.router.navigate([], { queryParams: { run: run.id }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected runNow(): void {
    const workflow = this.selected();
    if (!workflow || this.busy()) return;
    this.start(this.workflows.runNow(workflow.id));
  }

  protected retry(runId: string): void {
    if (this.busy()) return;
    this.start(this.runs.retry(runId));
  }

  protected cancel(runId: string): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionProblem.set(undefined);
    const request = this.runs.cancel(runId).pipe(takeUntilDestroyed(this.destroyRef));
    request.subscribe({ next: () => this.busy.set(false), error: (error: unknown) => this.fail(error) });
  }

  private start(request: ReturnType<RunsApi['retry']>): void {
    this.busy.set(true);
    this.actionProblem.set(undefined);
    const next = (created: RunDto) => {
      this.busy.set(false);
      this.resumeAfterRun.set(true);
      this.pinned.set(created.id);
      void this.router.navigate([], { queryParams: { run: created.id }, queryParamsHandling: 'merge', replaceUrl: true });
    };
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next, error: (error: unknown) => this.fail(error) });
  }

  private fail(error: unknown): void {
    this.busy.set(false);
    this.actionProblem.set(toProblem(error));
  }
}
