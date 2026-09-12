import type { EntityManager } from 'typeorm';
import type { TenantContext } from '@opsflow/contracts';
import type { AuditAction } from '@opsflow/domain';

export async function audit(manager: EntityManager, context: TenantContext, action: AuditAction, entityId: string): Promise<void> {
  const actorId = context.actorId;
  if (!actorId) return; // Scheduler executions have no human actor.
  const values = [context.tenantId, actorId, action, entityId, context.traceId ?? null];
  await manager.query(`
    INSERT INTO audit_log (tenant_id, actor_id, action, entity_id, trace_id) VALUES ($1, $2, $3, $4, $5)
  `, values);
}
