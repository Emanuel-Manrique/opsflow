import type { Action } from '@opsflow/domain';

export interface WorkflowWrite {
  readonly name: string;
  readonly enabled: boolean;
  readonly cronExpr: string;
  readonly timezone: string;
  readonly action: Action;
}
