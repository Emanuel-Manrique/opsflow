import type { DataSource, EntityManager } from 'typeorm';
import type { RunEventDto, TenantContext } from '@opsflow/contracts';
import type { NewRunEvent } from './run-event.types';

const COLUMNS = `
  id::text AS "id", run_id AS "runId", type, attempt, trace_id AS "traceId",
  error_code AS "errorCode", duration_ms AS "durationMs", detail,
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
`;

/** One page of history. A run that produced more than this has bigger problems than the console. */
const LIMIT = 500;

export class RunEventRepository {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Appends one event. Takes an optional manager so a caller inside a transaction
   * records the event and its state change together, or not at all.
   */
  async append(context: TenantContext, event: NewRunEvent, manager?: EntityManager): Promise<void> {
    const db = manager ?? this.dataSource;
    const p1 = [context.tenantId, event.runId, event.type, event.attempt ?? null];
    const p2 = [event.traceId ?? null, event.errorCode ?? null, event.durationMs ?? null, event.detail ?? null];
    // workflow_id is read off the run rather than passed in, so an event can never
    // disagree with the run it belongs to. An unknown run inserts nothing.
    await db.query(`
      INSERT INTO run_events (tenant_id, run_id, workflow_id, type, attempt, trace_id, error_code, duration_ms, detail)
      SELECT r.tenant_id, r.id, r.workflow_id, $3, $4, $5, $6, $7, $8
      FROM runs r WHERE r.tenant_id = $1 AND r.id = $2
    `, [...p1, ...p2]);
  }

  /** Events for one run in order. `after` is the last id the caller already holds. */
  list(context: TenantContext, runId: string, after?: string): Promise<RunEventDto[]> {
    const cursor = after ?? '0';
    return this.dataSource.query<RunEventDto[]>(`
      SELECT ${COLUMNS} FROM run_events
      WHERE tenant_id = $1 AND run_id = $2 AND id > $3::bigint
      ORDER BY id ASC LIMIT ${LIMIT}
    `, [context.tenantId, runId, cursor]);
  }
}
