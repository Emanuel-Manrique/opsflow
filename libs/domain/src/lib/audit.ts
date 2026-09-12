import type { AuditAction } from './audit.types';

export const AUDIT_ACTIONS = [
  'workflow.created',
  'workflow.updated',
  'workflow.enabled',
  'workflow.disabled',
  'workflow.deleted',
  'run.started',
  'run.cancel_requested',
  'run.retried',
] as const satisfies readonly AuditAction[];

export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}
