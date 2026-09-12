import type { ActionType } from '@opsflow/domain';

export interface SeedWorkflow {
  readonly name: string;
  readonly enabled: boolean;
  readonly cronExpr: string;
  readonly timezone: string;
  readonly actionType: ActionType;
  readonly actionConfig: Record<string, unknown>;
}
