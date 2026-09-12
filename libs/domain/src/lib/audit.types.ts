export type AuditAction =
  | 'workflow.created'
  | 'workflow.updated'
  | 'workflow.enabled'
  | 'workflow.disabled'
  | 'workflow.deleted'
  | 'run.started'
  | 'run.cancel_requested'
  | 'run.retried';
