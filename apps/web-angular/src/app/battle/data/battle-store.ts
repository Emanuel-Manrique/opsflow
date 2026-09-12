import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap, timer } from 'rxjs';
import type { HealthMetrics } from '@opsflow/contracts';
import { isTerminalRun } from '@opsflow/domain';
import { MetricsApi } from './metrics-api';
import type { BattleEnvironment } from '../domain/battle.types';
import { projectBattle } from '../domain/battle-projection';
import { toTimeline } from '../domain/battle-timeline';
import { watchRun } from '../../runs/run-detail/run-updates';
import type { RunUpdatesState } from '../../runs/run-detail/run-updates.types';

const IDLE: RunUpdatesState = { connection: 'connecting', events: [] };

/**
 * The one place the battle gets its data. It holds no battle state of its own: the run
 * and its events come off the same SSE stream the Operations view uses, and everything
 * the arena draws is computed from them.
 */
@Injectable()
export class BattleStore {
  private readonly http = inject(HttpClient);
  private readonly metricsApi = inject(MetricsApi);
  readonly runId = signal<string | undefined>(undefined);

  private readonly updates = toObservable(this.runId).pipe(
    switchMap((id) => (id ? watchRun(this.http, id) : of(IDLE))),
  );
  private readonly state = toSignal(this.updates, { initialValue: IDLE });

  readonly run = computed(() => this.state().run);
  readonly events = computed(() => this.state().events);
  readonly connection = computed(() => this.state().connection);
  readonly problem = computed(() => this.state().problem);
  readonly live = computed(() => {
    const run = this.run();
    return this.connection() === 'live' && run !== undefined && !isTerminalRun(run.status);
  });
  readonly metricsLoading = signal(true);

  /**
   * Queue reachability is the one thing a run's own rows cannot tell you, so it is
   * polled separately and handed to the projection rather than guessed at.
   */
  private readonly metricsPoll = timer(0, 10_000).pipe(
    switchMap(() => this.metricsApi.health().pipe(catchError(() => of(null)))),
    tap(() => this.metricsLoading.set(false)),
  );
  readonly metrics = toSignal<HealthMetrics | null>(this.metricsPoll, { initialValue: null });

  readonly environment = computed<BattleEnvironment | undefined>(() => {
    const metrics = this.metrics();
    if (!metrics) return undefined;
    return { queueReachable: metrics.queue.reachable, outboxPending: metrics.outboxPending };
  });

  readonly battle = computed(() => {
    const run = this.run();
    return run ? projectBattle(run, this.events(), this.environment()) : null;
  });
  readonly timeline = computed(() => toTimeline(this.events()));

  watch(runId: string | undefined): void {
    if (runId !== this.runId()) this.runId.set(runId);
  }
}
