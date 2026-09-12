import { RUN_STATUSES } from '@opsflow/domain';
import { EntitySchema } from 'typeorm';
import type { RunRow } from './schema.types';
import { sqlLiterals } from './sql';

const statuses = sqlLiterals(RUN_STATUSES);

export const RunEntity = new EntitySchema<RunRow>({
  name: 'RunEntity',
  tableName: 'runs',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid', default: () => 'gen_random_uuid()' },
    tenantId: { type: 'uuid', name: 'tenant_id' },
    workflowId: { type: 'uuid', name: 'workflow_id' },
    status: { type: 'text', default: 'queued' },
    attempt: { type: 'integer', default: 0 },
    retryOf: { type: 'uuid', name: 'retry_of', nullable: true },
    scheduledFor: { type: 'timestamptz', name: 'scheduled_for', nullable: true },
    idempotencyKey: { type: 'text', name: 'idempotency_key' },
    errorMessage: { type: 'text', name: 'error_message', nullable: true },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true, default: () => 'now()' },
    startedAt: { type: 'timestamptz', name: 'started_at', nullable: true },
    finishedAt: { type: 'timestamptz', name: 'finished_at', nullable: true },
  },
  relations: {
    workflow: {
      type: 'many-to-one', target: 'WorkflowEntity', onDelete: 'CASCADE', nullable: false,
      joinColumn: [
        // Composite (tenant_id, workflow_id): a run cannot point at another tenant's workflow.
        { name: 'tenant_id', referencedColumnName: 'tenantId', foreignKeyConstraintName: 'fk_runs_workflow_tenant' },
        { name: 'workflow_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_runs_workflow_tenant' },
      ],
    },
  },
  foreignKeys: [
    { name: 'fk_runs_retry', target: 'RunEntity', columnNames: ['tenantId', 'retryOf'], referencedColumnNames: ['tenantId', 'id'] },
  ],
  uniques: [
    { name: 'uq_runs_tenant_id', columns: ['tenantId', 'id'] },
    { name: 'uq_runs_idempotency', columns: ['tenantId', 'idempotencyKey'] },
  ],
  indices: [
    { name: 'uq_runs_retry', columns: ['retryOf'], unique: true, where: 'retry_of IS NOT NULL' },
    { name: 'uq_runs_occurrence', columns: ['tenantId', 'workflowId', 'scheduledFor'], unique: true, where: 'scheduled_for IS NOT NULL' },
    // (tenant_id, workflow_id, created_at DESC)
    { name: 'ix_runs_workflow_created', synchronize: false },
    // (tenant_id, created_at DESC, id)
    { name: 'ix_runs_tenant_created', synchronize: false },
  ],
  checks: [
    { name: 'runs_attempt_check', expression: 'attempt >= 0' },
    { name: 'ck_runs_status', expression: `status IN (${statuses})` },
    { name: 'ck_runs_finished_after_started', expression: 'finished_at IS NULL OR finished_at >= started_at' },
    // ck_runs_error / ck_runs_timestamps mirror isConsistentRunClock; the wire guard uses the same predicate.
    { name: 'ck_runs_error', expression: `
      (status IN ('failed', 'retrying') AND error_message IS NOT NULL)
      OR (status NOT IN ('failed', 'retrying') AND error_message IS NULL)
    ` },
    { name: 'ck_runs_timestamps', expression: `
      (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
      OR (status IN ('running', 'retrying', 'cancelling') AND started_at IS NOT NULL AND finished_at IS NULL)
      OR (status IN ('succeeded', 'failed') AND started_at IS NOT NULL AND finished_at IS NOT NULL)
      OR (status = 'cancelled' AND finished_at IS NOT NULL)
    ` },
  ],
});
