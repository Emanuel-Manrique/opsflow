import type { Action, ActionType, HttpMethod } from '@opsflow/domain';

export interface WebhookActionInput {
  readonly url: string;
  readonly method: HttpMethod;
}

export interface CreateWorkflowRequest {
  readonly name: string;
  readonly enabled: boolean;
  readonly cronExpr: string;
  readonly timezone: string;
  readonly actionType: ActionType;
  readonly webhook?: WebhookActionInput;
}

export interface WorkflowDto {
  readonly nextRunAt?: string | null;
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly cronExpr: string;
  readonly timezone: string;
  readonly action: Action;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type WorkflowSort = 'name' | '-name' | 'updatedAt' | '-updatedAt';

export interface WorkflowListQuery {
  readonly q?: string;
  readonly enabled?: boolean;
  readonly actionType?: ActionType;
  readonly sort: WorkflowSort;
  readonly page: number;
  readonly pageSize: number;
}

export type RawQueryParams = Readonly<Record<string, unknown>>;
