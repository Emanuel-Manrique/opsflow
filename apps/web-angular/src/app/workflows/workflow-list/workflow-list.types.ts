import type { ApiProblem, Page, WorkflowDto } from '@opsflow/contracts';

export type WorkflowListState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly page: Page<WorkflowDto> }
  | { readonly status: 'failed'; readonly problem: ApiProblem };

export interface WorkflowStat {
  readonly label: string;
  readonly scope: string;
  readonly value: number;
}
