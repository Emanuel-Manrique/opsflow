import type { AuditAction, Role } from '@opsflow/domain';

export type { Role, AuditAction };

export interface Membership {
  readonly userId: string;
  readonly email: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly role: Role;
}

export interface SessionDto {
  readonly member: Membership | null;
  readonly memberships: readonly Membership[];
  readonly demoEnabled: boolean;
}

export interface AuditEntry {
  readonly id: string;
  readonly actorId: string;
  readonly action: AuditAction;
  readonly entityId: string;
  readonly traceId: string | null;
  readonly createdAt: string;
}
