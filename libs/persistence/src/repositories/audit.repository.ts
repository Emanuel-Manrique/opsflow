import type { DataSource } from 'typeorm';
import type { AuditEntry, TenantContext } from '@opsflow/contracts';

export class AuditRepository {
  constructor(private readonly dataSource: DataSource) {}

  list(context: TenantContext): Promise<AuditEntry[]> {
    return this.dataSource.query<AuditEntry[]>(`
      SELECT id, actor_id AS "actorId", action, entity_id AS "entityId", trace_id AS "traceId",
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100
    `, [context.tenantId]);
  }
}
