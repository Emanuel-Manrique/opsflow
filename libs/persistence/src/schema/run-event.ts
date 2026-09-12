import { RUN_EVENT_TYPES } from '@opsflow/contracts';
import { EntitySchema } from 'typeorm';
import type { RunEventRow } from './schema.types';
import { sqlLiterals } from './sql';

/**
 * Append-only record of what each run actually did. Nothing updates a row here; the
 * console reads it forward. `id` is a bigserial so a reader can resume from a cursor
 * without tie-breaking on a timestamp.
 */
export const RunEventEntity = new EntitySchema<RunEventRow>({
  name: 'RunEventEntity',
  tableName: 'run_events',
  columns: {
    id: { type: 'bigint', primary: true, generated: 'increment' },
    tenantId: { type: 'uuid', name: 'tenant_id' },
    runId: { type: 'uuid', name: 'run_id' },
    workflowId: { type: 'uuid', name: 'workflow_id' },
    type: { type: 'text' },
    attempt: { type: 'integer', nullable: true },
    traceId: { type: 'text', name: 'trace_id', nullable: true },
    errorCode: { type: 'text', name: 'error_code', nullable: true },
    durationMs: { type: 'integer', name: 'duration_ms', nullable: true },
    detail: { type: 'text', nullable: true },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true, default: () => 'clock_timestamp()' },
  },
  foreignKeys: [
    { name: 'fk_run_events_run', target: 'RunEntity', columnNames: ['tenantId', 'runId'], referencedColumnNames: ['tenantId', 'id'], onDelete: 'CASCADE' },
  ],
  // (tenant_id, run_id, id): the stream read, and the only one that matters.
  indices: [{ name: 'ix_run_events_run', synchronize: false }],
  checks: [
    { name: 'ck_run_events_type', expression: `type IN (${sqlLiterals(RUN_EVENT_TYPES)})` },
    { name: 'ck_run_events_attempt', expression: 'attempt IS NULL OR attempt >= 0' },
    { name: 'ck_run_events_duration', expression: 'duration_ms IS NULL OR duration_ms >= 0' },
  ],
});
