import type { ApiProblem, WorkflowDto } from '@opsflow/contracts';

export type BattleViewMode = 'battle' | 'operations';

export interface WorkflowCatalogueState {
  readonly loading: boolean;
  readonly items: readonly WorkflowDto[];
  readonly problem?: ApiProblem;
}
export interface WorkflowSelectionState {
  readonly workflow?: WorkflowDto;
  readonly problem?: ApiProblem;
}
