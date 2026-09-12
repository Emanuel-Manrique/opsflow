import { describeCron } from '@opsflow/domain';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef } from '@angular/core';
import { computed, inject, input, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, debounceTime } from 'rxjs';
import { firstValueFrom, map, of, startWith, Subject, switchMap } from 'rxjs';
import type { ApiProblem, WorkflowDto } from '@opsflow/contracts';
import type { WorkflowListQuery } from '@opsflow/contracts';
import { hasActiveFilters, parseWorkflowListQuery } from '@opsflow/contracts';
import { serializeWorkflowListQuery } from '@opsflow/contracts';
import { ACTION_TYPES, isActionType } from '@opsflow/domain';
import { EmptyState } from '@opsflow/ui';
import { toProblem } from '../../core/http/interceptors';
import { WorkflowsApi } from '../data/workflows-api';
import type { WorkflowListState, WorkflowStat } from './workflow-list.types';
import { Session } from '../../core/session';

const LOADING: WorkflowListState = { status: 'loading' };

@Component({
  selector: 'ops-workflow-list',
  imports: [DatePipe, EmptyState, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workflow-list.html',
})
export class WorkflowList {
  protected readonly describeCron = describeCron;
  protected readonly session = inject(Session);
  private readonly api = inject(WorkflowsApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refreshCount = signal(0);
  private readonly searchTerms = new Subject<string>();
  protected readonly startingRunId = signal<string | undefined>(undefined);
  protected readonly pendingDeleteId = signal<string | undefined>(undefined);
  protected readonly deletingId = signal<string | undefined>(undefined);
  protected readonly actionProblem = signal<ApiProblem | undefined>(undefined);

  readonly q = input<string | undefined>();
  readonly enabled = input<string | undefined>();
  readonly actionType = input<string | undefined>();
  readonly sort = input<string | undefined>();
  readonly page = input<string | undefined>();
  readonly pageSize = input<string | undefined>();
  readonly denied = input<string | undefined>();

  protected readonly actionTypes = ACTION_TYPES;

  protected readonly query = computed<WorkflowListQuery>(() => {
    const p1 = { q: this.q(), enabled: this.enabled(), actionType: this.actionType() };
    const p2 = { sort: this.sort(), page: this.page(), pageSize: this.pageSize() };
    return parseWorkflowListQuery({ ...p1, ...p2 });
  });

  private readonly request = computed(() => {
    return [this.query(), this.refreshCount()] as const;
  });

  private readonly states = toObservable(this.request).pipe(
    switchMap(([query]) =>
      this.api.list(query).pipe(
        map((page): WorkflowListState => ({ status: 'ready', page })),
        catchError((error: unknown) => {
          const problem = toProblem(error);
          return of<WorkflowListState>({ status: 'failed', problem });
        }),
        startWith(LOADING)
      )
    )
  );

  private readonly state = toSignal(this.states, { initialValue: LOADING });

  protected readonly isLoading = computed(() => this.state().status === 'loading');
  protected readonly problem = computed<ApiProblem | undefined>(() => {
    const state = this.state();
    return state.status === 'failed' ? state.problem : undefined;
  });

  protected readonly workflows = computed<readonly WorkflowDto[]>(() => {
    const state = this.state();
    return state.status === 'ready' ? state.page.items : [];
  });

  protected readonly total = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.page.total : 0;
  });

  protected readonly totalPages = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.page.totalPages : 0;
  });

  protected readonly searchDraft = linkedSignal(() => this.query().q ?? '');

  protected readonly enabledFilterValue = computed(() => {
    const enabled = this.query().enabled;
    return enabled === undefined ? '' : String(enabled);
  });

  protected readonly editDenied = computed(() => this.denied() === 'edit');
  protected readonly filtered = computed(() => hasActiveFilters(this.query()));
  protected readonly showEmptyState = computed(() => {
    return !this.isLoading() && !this.problem() && this.workflows().length === 0;
  });

  protected readonly stats = computed<readonly WorkflowStat[]>(() => {
    const items = this.workflows();
    const active = items.filter((row) => row.enabled).length;
    const paused = items.length - active;
    const total = { label: this.filtered() ? 'Matching workflows' : 'Total workflows', value: this.total(), scope: 'All matching workflows' };
    return [total, { label: 'Active workflows', value: active, scope: 'This page' }, { label: 'Paused workflows', value: paused, scope: 'This page' }];
  });

  protected blurb(workflow: WorkflowDto): string {
    if (workflow.action.type !== 'webhook') return 'Test run · no side effects';
    try {
      const host = new URL(workflow.action.url).host;
      return host ? `HTTP ${workflow.action.method} · ${host}` : 'HTTP webhook';
    } catch {
      return 'HTTP webhook';
    }
  }

  protected actionLabel(workflow: WorkflowDto): string {
    return workflow.action.type === 'noop' ? 'Test run' : 'HTTP webhook';
  }

  constructor() {
    this.searchTerms
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((value) => this.applySearch(value));
  }

  protected updateSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchDraft.set(value);
    this.searchTerms.next(value);
  }

  protected setEnabledFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const enabled = value === '' ? undefined : value === 'true';
    this.patchQuery({ enabled, page: 1 });
  }

  protected setActionTypeFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const actionType = isActionType(value) ? value : undefined;
    this.patchQuery({ actionType, page: 1 });
  }

  protected toggleSort(column: 'name' | 'updatedAt'): void {
    const descending = this.query().sort === column;
    const sort: WorkflowListQuery['sort'] = descending ? `-${column}` : column;
    this.patchQuery({ sort, page: 1 });
  }

  protected goToPage(page: number): void {
    this.patchQuery({ page });
  }

  protected clearFilters(): void {
    this.searchDraft.set('');
    this.patchQuery({ q: undefined, enabled: undefined, actionType: undefined, page: 1 });
  }

  protected retry(): void {
    this.refreshCount.update((count) => count + 1);
  }

  protected askDelete(workflowId: string): void {
    this.pendingDeleteId.set(workflowId);
  }

  protected cancelDelete(): void {
    this.pendingDeleteId.set(undefined);
  }

  protected async confirmDelete(workflowId: string): Promise<void> {
    if (this.deletingId() || this.startingRunId()) return;
    this.deletingId.set(workflowId);
    this.actionProblem.set(undefined);
    try {
      const request = this.api.remove(workflowId).pipe(takeUntilDestroyed(this.destroyRef));
      await firstValueFrom(request, { defaultValue: undefined });
      if (this.destroyRef.destroyed) return;
      this.pendingDeleteId.set(undefined);
      this.retry();
    } catch (error: unknown) {
      if (!this.destroyRef.destroyed) this.actionProblem.set(toProblem(error));
    } finally {
      if (!this.destroyRef.destroyed) this.deletingId.set(undefined);
    }
  }

  protected async runNow(workflowId: string): Promise<void> {
    if (this.startingRunId()) {
      return;
    }

    this.startingRunId.set(workflowId);
    this.actionProblem.set(undefined);

    try {
      const request = this.api.runNow(workflowId).pipe(takeUntilDestroyed(this.destroyRef));
      const run = await firstValueFrom(request, { defaultValue: undefined });
      if (!run || this.destroyRef.destroyed) return;
      await this.router.navigate(['/runs', run.id]);
    } catch (error: unknown) {
      if (!this.destroyRef.destroyed) this.actionProblem.set(toProblem(error));
    } finally {
      if (!this.destroyRef.destroyed) this.startingRunId.set(undefined);
    }
  }

  protected sortIndicator(
    column: 'name' | 'updatedAt'
  ): 'ascending' | 'descending' | 'none' {
    const sort = this.query().sort;

    if (sort === column) {
      return 'ascending';
    }

    return sort === `-${column}` ? 'descending' : 'none';
  }

  private applySearch(value: string): void {
    const q = value.trim() || undefined;
    if (value !== this.searchDraft() || q === this.query().q) return;
    this.patchQuery({ q, page: 1 });
  }

  private patchQuery(patch: Partial<WorkflowListQuery>): void {
    const query = { ...this.query(), ...patch };
    const queryParams = serializeWorkflowListQuery(query);
    const extras = { queryParams, replaceUrl: true };
    void this.router.navigate([], extras);
  }
}
