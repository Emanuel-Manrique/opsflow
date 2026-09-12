import type { TenantContext } from '@opsflow/contracts';
import type { Action, RunEvent, RunStatus } from '@opsflow/domain';

export type FinishEvent = Extract<RunEvent, 'succeed' | 'fail' | 'backoff'>;

export interface RunStateRow { status: RunStatus; }

export interface DatabaseClock {
  now: Date;
}

export interface InsertedRun {
  id: string;
}

export interface PendingExecution {
  workflow_id: string;
  created_at: Date;
  traceparent: string | null;
  request_id: string | null;
  run_id: string;
  tenant_id: string;
  action: Action;
}

export interface NewExecution {
  tenantId: string;
  workflowId: string;
  action: Action;
  retryOf: string | null;
  scheduledFor: Date | null;
  context: Pick<TenantContext, 'traceId' | 'traceparent'>;
}
