import { EntitySchema } from 'typeorm';
import type { ExecutionOutboxRow } from './schema.types';
import { sqlActionSnapshot } from './sql';

export const ExecutionOutboxEntity = new EntitySchema<ExecutionOutboxRow>({
  name: 'ExecutionOutboxEntity',
  tableName: 'execution_outbox',
  columns: {
    traceparent: { type: 'text', nullable: true },
    requestId: { type: 'uuid', name: 'request_id', nullable: true },
    runId: { type: 'uuid', name: 'run_id', primary: true },
    tenantId: { type: 'uuid', name: 'tenant_id' },
    action: { type: 'jsonb' },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true, default: () => 'now()' },
    publishedAt: { type: 'timestamptz', name: 'published_at', nullable: true },
    // Lease, not a lock held across Redis I/O. Stale claims (30s) are eligible again.
    claimedAt: { type: 'timestamptz', name: 'claimed_at', nullable: true },
  },
  foreignKeys: [
    { name: 'execution_outbox_tenant_id_run_id_fkey', target: 'RunEntity', columnNames: ['tenantId', 'runId'], referencedColumnNames: ['tenantId', 'id'], onDelete: 'CASCADE' },
  ],
  indices: [{ name: 'ix_execution_outbox_pending', columns: ['createdAt', 'runId'], where: 'published_at IS NULL' }],
  checks: [{ name: 'ck_execution_outbox_action_shape', expression: sqlActionSnapshot('action') }],
});
