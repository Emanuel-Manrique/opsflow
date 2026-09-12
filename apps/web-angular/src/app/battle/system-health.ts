import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BattleStore } from './data/battle-store';
import type { HealthTile } from './system-health.types';

@Component({
  selector: 'ops-system-health',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './system-health.html',
  host: { class: 'block min-w-0' },
})
export class SystemHealth {
  protected readonly store = inject(BattleStore);
  private readonly metrics = this.store.metrics;

  protected readonly loaded = computed(() => this.metrics() !== null);
  protected readonly queueReachable = computed(() => this.metrics()?.queue.reachable ?? false);
  protected readonly sample = computed(() => this.metrics());

  /**
   * Every tile is measured. A value that cannot be measured right now shows as
   * "unavailable".
   */
  protected readonly tiles = computed<readonly HealthTile[]>(() => {
    const metrics = this.metrics();
    if (!metrics) return [];
    const queue = metrics.queue;
    const percent = (value: number | null) => (value === null ? null : `${(value * 100).toFixed(1)}%`);
    const counter = (value: number) => (queue.reachable ? String(value) : null);
    return [
      { label: 'Queue depth', value: counter(queue.waiting + queue.delayed), hint: 'waiting + delayed' },
      { label: 'Success rate', value: percent(metrics.successRate), hint: `${metrics.windowHours}h window` },
      { label: 'P95 duration', value: metrics.p95DurationMs === null ? null : `${(metrics.p95DurationMs / 1000).toFixed(2)}s`, hint: 'finished runs' },
      { label: 'Exhausted runs', value: String(metrics.exhaustedRuns), hint: 'failed after every attempt' },
      { label: 'Workers active', value: counter(queue.workers), hint: 'connected to the queue' },
      { label: 'Retry rate', value: percent(metrics.retryRate), hint: 'runs needing attempt 2+' },
    ];
  });
}
