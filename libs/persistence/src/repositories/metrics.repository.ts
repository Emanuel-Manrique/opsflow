import type { DataSource } from 'typeorm';
import { RUN_ATTEMPTS } from '@opsflow/contracts';
import type { TenantContext } from '@opsflow/contracts';
import type { RunStatsRow } from './metrics.types';

/** How far back the console's health numbers look. */
const WINDOW_HOURS = 24;

export class MetricsRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Aggregates over the tenant's recent runs, counted in SQL from rows the system
   * actually wrote. Nothing is estimated, and an empty window returns nulls.
   */
  async runStats(context: TenantContext): Promise<RunStatsRow & { windowHours: number }> {
    const [row] = await this.dataSource.query<RunStatsRow[]>(`
      SELECT
        count(*)::int AS "sampleSize",
        count(*) FILTER (WHERE status IN ('succeeded', 'failed', 'cancelled'))::int AS "finished",
        count(*) FILTER (WHERE status = 'succeeded')::int AS "succeeded",
        count(*) FILTER (WHERE attempt > 1)::int AS "retried",
        count(*) FILTER (WHERE status = 'failed' AND attempt >= $2)::int AS "exhausted",
        (SELECT count(*)::int FROM execution_outbox
          WHERE tenant_id = $1 AND published_at IS NULL) AS "outboxPending",
        percentile_cont(0.95) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000
        ) FILTER (WHERE finished_at IS NOT NULL AND started_at IS NOT NULL) AS "p95DurationMs"
      FROM runs
      WHERE tenant_id = $1 AND created_at > now() - interval '${WINDOW_HOURS} hours'
    `, [context.tenantId, RUN_ATTEMPTS]);
    return { ...row, windowHours: WINDOW_HOURS };
  }
}
