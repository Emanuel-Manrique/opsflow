import type { RunEventType } from '@opsflow/contracts';
import type { Action, ActionType, AuditAction, Role, RunStatus } from '@opsflow/domain';

export interface UserRow { id: string; email: string; }
export interface MembershipRow { userId: string; tenantId: string; role: Role; }
export interface SessionRow { tokenHash: string; userId: string; expiresAt: Date; }
export interface ExecutionOutboxRow {
  traceparent: string | null;
  requestId: string | null;
  runId: string;
  tenantId: string;
  action: Action;
  createdAt: Date;
  publishedAt: Date | null;
  claimedAt: Date | null;
}
export interface RunEventRow {
  id: string;
  tenantId: string;
  runId: string;
  workflowId: string;
  type: RunEventType;
  attempt: number | null;
  traceId: string | null;
  errorCode: string | null;
  durationMs: number | null;
  detail: string | null;
  createdAt: Date;
}
export interface AuditLogRow {
  id: string;
  tenantId: string;
  actorId: string;
  action: AuditAction;
  entityId: string;
  traceId: string | null;
  createdAt: Date;
}

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
}

export interface WorkflowRow {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  nextRunAt: Date | null;
  cronExpr: string;
  timezone: string;
  actionType: ActionType;
  actionConfig: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunRow {
  id: string;
  tenantId: string;
  workflowId: string;
  workflow?: WorkflowRow;
  status: RunStatus;
  attempt: number;
  retryOf: string | null;
  scheduledFor: Date | null;
  idempotencyKey: string;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}
