import { EventStream } from '../../battle/event-stream';
import { toTimeline } from '../../battle/domain/battle-timeline';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { computed, inject, input, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { finalize, switchMap, timer } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
import type { ApiProblem, RunDto } from '@opsflow/contracts';
import { isRunDto } from '@opsflow/contracts';
import { isCancellableRun, isRetryableRun, isStaleRunSnapshot, isTerminalRun } from '@opsflow/domain';
import { StatusBadge } from '@opsflow/ui';
import { toProblem } from '../../core/http/interceptors';
import { watchRun } from './run-updates';
import type { RunSnapshotSource, RunUpdatesState } from './run-updates.types';
import { Session } from '../../core/session';

const STALL_AFTER_MS = 5_000;

@Component({
  selector: 'ops-run-detail',
  imports: [DatePipe, RouterLink, StatusBadge, EventStream],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-detail.html',
})
export class RunDetail {
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly startingRetry = signal(false);
  readonly id = input.required<string>();
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly cancelling = signal(false);
  protected readonly actionProblem = linkedSignal<ApiProblem | undefined>(() => {
    this.id();
    return undefined;
  });

  private readonly refreshCount = signal(0);
  private readonly request = computed(() => [this.id(), this.refreshCount()] as const);
  private readonly updates = toObservable(this.request).pipe(
    switchMap(([id]) => watchRun(this.http, id)),
  );
  private readonly initial: RunUpdatesState = { connection: 'connecting', events: [] };
  private readonly state = toSignal(this.updates, { initialValue: this.initial });
  protected readonly timeline = computed(() => toTimeline(this.state().events));
  protected readonly live = computed(() => {
    const run = this.run();
    return this.state().connection === 'live' && run !== undefined && !isTerminalRun(run.status);
  });
  protected readonly loading = computed(() => this.state().connection === 'connecting');
  private readonly runSource = () => ({ id: this.id(), run: this.state().run });
  private readonly reconcileRun = ({ id, run }: RunSnapshotSource, previous?: { value: RunDto | undefined }): RunDto | undefined => {
    if (run?.id === id) {
      const shown = previous?.value;
      if (shown?.id === id && isStaleRunSnapshot(run.status, shown.status)) return shown;
      return run;
    }
    if (previous?.value?.id === id) return previous.value;
    return undefined;
  };
  protected readonly run = linkedSignal({ source: this.runSource, computation: this.reconcileRun });
  protected readonly reconnecting = computed(() => this.state().connection === 'reconnecting');
  protected readonly problem = computed(() => this.state().problem);
  protected readonly cancellable = computed(() => {
    const run = this.run();
    return Boolean(run && this.session.canOperate() && isCancellableRun(run.status));
  });
  protected readonly retryable = computed(() => {
    const run = this.run();
    return Boolean(run && this.session.canOperate() && isRetryableRun(run.status));
  });
  private readonly tick = toSignal(timer(0, 1_000), { initialValue: 0 });

  protected readonly waiting = computed<string | undefined>(() => {
    this.tick();
    const run = this.run();
    if (!run || run.status !== 'queued' || run.startedAt) return undefined;
    if (Date.now() - Date.parse(run.createdAt) < STALL_AFTER_MS) return undefined;
    const dispatch = this.state().events.findLast((event) => event.type === 'outbox.held' || event.type === 'outbox.published');
    if (dispatch?.type === 'outbox.held') {
      return 'The queue is unreachable. This run is held in the outbox and starts on its own once Redis is back.';
    }
    if (!dispatch) {
      return 'Accepted and recorded. Waiting for the orchestrator to publish it to the queue.';
    }
    return 'On the queue. Waiting for a worker to pick it up.';
  });

  protected refresh(): void {
    this.refreshCount.update((count) => count + 1);
  }

  protected cancel(): void {
    const current = this.run();
    if (!current || this.cancelling() || this.loading()) return;
    if (!isCancellableRun(current.status)) return;
    this.cancelling.set(true);
    this.actionProblem.set(undefined);
    const next = (updated: RunDto) => {
      if (this.id() !== current.id || !isRunDto(updated)) return;
      this.run.set(updated);
    };
    const error = (failure: unknown) => {
      if (this.id() === current.id) this.actionProblem.set(toProblem(failure));
    };
    this.http.post<RunDto>(`/api/runs/${current.id}/cancel`, null).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.cancelling.set(false)),
    ).subscribe({ next, error });
  }

  protected retry(): void {
    const run = this.run();
    if (!run || !isRetryableRun(run.status) || this.startingRetry()) return;
    this.startingRetry.set(true);
    this.actionProblem.set(undefined);
    const next = (created: RunDto) => {
      if (this.id() === run.id) void this.router.navigate(['/runs', created.id]);
    };
    const error = (failure: unknown) => {
      if (this.id() === run.id) this.actionProblem.set(toProblem(failure));
    };
    this.http.post<RunDto>(`/api/runs/${run.id}/retry`, null).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.startingRetry.set(false)),
    ).subscribe({ next, error });
  }
}
