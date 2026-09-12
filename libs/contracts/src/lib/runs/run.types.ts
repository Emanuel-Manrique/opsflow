import type { Action, RunStatus } from '@opsflow/domain';
import type { ChaosScenario } from '../chaos.types';

export interface StartRunRequest {
  readonly scenario?: ChaosScenario;
}

export interface RunDto {
  readonly scheduledFor?: string | null;
  readonly id: string;
  readonly workflowId: string;
  readonly workflowName: string;
  readonly status: RunStatus;
  readonly attempt: number;
  readonly retryOf: string | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export type RunListSort = 'createdAt' | '-createdAt';

export interface RunListQuery {
  readonly status?: RunStatus;
  readonly workflowId?: string;
  readonly sort: RunListSort;
  readonly page: number;
  readonly pageSize: number;
}

export interface RunJobData {
  readonly traceparent?: string;
  readonly requestId?: string;
  readonly workflowId?: string;
  readonly queuedAt?: string;
  readonly runId: string;
  readonly tenantId: string;
  readonly action: Action;
}
