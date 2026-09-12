import type { ActionType, HttpMethod } from '@opsflow/domain';

export interface WorkflowFormModel {
  name: string;
  enabled: boolean;
  cronExpr: string;
  timezone: string;
  actionType: ActionType;
  webhookUrl: string;
  webhookMethod: HttpMethod;
}
