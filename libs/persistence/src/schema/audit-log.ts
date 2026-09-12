import { AUDIT_ACTIONS } from '@opsflow/domain';
import { EntitySchema } from 'typeorm';
import type { AuditLogRow } from './schema.types';
import { sqlLiterals } from './sql';

export const AuditLogEntity = new EntitySchema<AuditLogRow>({
  name: 'AuditLogEntity',
  tableName: 'audit_log',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid', default: () => 'gen_random_uuid()' },
    tenantId: { type: 'uuid', name: 'tenant_id' },
    actorId: { type: 'uuid', name: 'actor_id' },
    action: { type: 'text' },
    entityId: { type: 'uuid', name: 'entity_id' },
    traceId: { type: 'uuid', name: 'trace_id', nullable: true },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true, default: () => 'clock_timestamp()' },
  },
  foreignKeys: [
    { name: 'audit_log_tenant_id_fkey', target: 'TenantEntity', columnNames: ['tenantId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' },
    { name: 'audit_log_actor_id_fkey', target: 'UserEntity', columnNames: ['actorId'], referencedColumnNames: ['id'] },
  ],
  // (tenant_id, created_at DESC, id)
  indices: [{ name: 'ix_audit_log_tenant_created', synchronize: false }],
  checks: [{ name: 'ck_audit_log_action', expression: `action IN (${sqlLiterals(AUDIT_ACTIONS)})` }],
});
