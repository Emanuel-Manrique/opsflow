import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, scan, startWith, switchMap, timer } from 'rxjs';
import type { ApiProblem, RunDto, RunListQuery } from '@opsflow/contracts';
import { hasActiveRunFilters, parseRunListQuery, serializeRunListQuery } from '@opsflow/contracts';
import { RUN_ATTEMPTS, RUN_SORTS } from '@opsflow/contracts';
import type { RunListSort } from '@opsflow/contracts';
import { RUN_STATUSES, isRunStatus, isTerminalRun } from '@opsflow/domain';
import { EmptyState, StatusBadge } from '@opsflow/ui';
import { toProblem } from '../../core/http/interceptors';
import { Session } from '../../core/session';
import { RunsApi } from '../data/runs-api';
import type { RunGlyph, RunListState, RunStat } from './run-list.types';

const LOADING: RunListState = { status: 'loading' };

@Component({
  selector: 'ops-run-list',
  imports: [DatePipe, EmptyState, RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-list.html',
})
export class RunList {
  protected readonly session = inject(Session);
  private readonly api = inject(RunsApi);
  private readonly router = inject(Router);
  private readonly refreshCount = signal(0);
  protected readonly maxAttempts = RUN_ATTEMPTS;
  protected readonly statuses = RUN_STATUSES;
  protected readonly sorts = RUN_SORTS;

  readonly status = input<string | undefined>();
  readonly workflowId = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly pageSize = input<string | undefined>();

  protected readonly query = computed<RunListQuery>(() => {
    const p1 = { status: this.status(), workflowId: this.workflowId() };
    const p2 = { sort: this.sort(), page: this.page(), pageSize: this.pageSize() };
    return parseRunListQuery({ ...p1, ...p2 });
  });

  private readonly request = computed(() => [this.query(), this.refreshCount()] as const);
  private readonly states = toObservable(this.request).pipe(
    switchMap(([query]) =>
      timer(5_000, 5_000).pipe(
        startWith(0),
        switchMap(() => this.api.list(query).pipe(
          map((page): RunListState => ({ status: 'ready', page })),
          catchError((error: unknown) => of<RunListState>({ status: 'failed', problem: toProblem(error) })),
        )),
        scan((previous: RunListState, current) => current.status === 'failed' && 'page' in previous ? { ...current, page: previous.page } : current, LOADING),
        startWith(LOADING),
      ),
    ),
  );
  private readonly state = toSignal(this.states, { initialValue: LOADING });

  protected readonly isLoading = computed(() => this.state().status === 'loading');
  protected readonly problem = computed<ApiProblem | undefined>(() => {
    const state = this.state();
    return state.status === 'failed' ? state.problem : undefined;
  });
  private readonly currentPage = computed(() => {
    const state = this.state();
    return state.status === 'loading' ? undefined : state.page;
  });
  protected readonly runs = computed(() => this.currentPage()?.items ?? []);
  protected readonly total = computed(() => this.currentPage()?.total ?? 0);
  protected readonly totalPages = computed(() => this.currentPage()?.totalPages ?? 0);
  protected readonly filtered = computed(() => hasActiveRunFilters(this.query()));

  protected readonly workflowFilter = computed<string | undefined>(() => {
    if (!this.query().workflowId) return undefined;
    return this.runs()[0]?.workflowName ?? 'one workflow';
  });
  protected readonly showEmptyState = computed(() => !this.isLoading() && !this.problem() && this.runs().length === 0);

  protected readonly stats = computed<readonly RunStat[]>(() => {
    const items = this.runs();
    const live = items.filter((row) => !isTerminalRun(row.status)).length;
    const failed = items.filter((row) => row.status === 'failed').length;
    const total = { label: this.filtered() ? 'Matching runs' : 'Total runs', value: this.total(), scope: 'All matching runs' };
    return [total, { label: 'In flight', value: live, scope: 'This page' }, { label: 'Failed', value: failed, scope: 'This page' }];
  });

  protected triggerLabel(run: RunDto): string {
    if (run.scheduledFor) return 'Automatic cron';
    if (run.retryOf) return 'Manual retry';
    return 'Manual';
  }

  protected blurb(run: RunDto): string {
    return `${this.triggerLabel(run)} · attempt ${run.attempt} / ${RUN_ATTEMPTS}`;
  }

  protected glyph(run: RunDto): RunGlyph {
    if (run.status === 'failed') return 'failed';
    if (run.status === 'succeeded') return 'ok';
    if (run.status === 'cancelled' || run.status === 'cancelling') return 'cancelled';
    return 'live';
  }

  protected setStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.patchQuery({ status: isRunStatus(value) ? value : undefined, page: 1 });
  }

  protected setSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as RunListSort;
    this.patchQuery({ sort: value, page: 1 });
  }

  protected clearWorkflow(): void {
    this.patchQuery({ workflowId: undefined, page: 1 });
  }

  protected goToPage(page: number): void {
    this.patchQuery({ page });
  }

  protected clearFilters(): void {
    this.patchQuery({ status: undefined, workflowId: undefined, page: 1 });
  }

  protected retry(): void {
    this.refreshCount.update((count) => count + 1);
  }

  private patchQuery(patch: Partial<RunListQuery>): void {
    const queryParams = serializeRunListQuery({ ...this.query(), ...patch });
    void this.router.navigate([], { queryParams, replaceUrl: true });
  }
}
