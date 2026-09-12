export type ProblemType =
  | 'validation_failed'
  | 'tenant_required'
  | 'workflow_not_found'
  | 'run_not_found'
  | 'run_not_retryable'
  | 'session_required'
  | 'forbidden'
  | 'run_not_cancellable'
  | 'runtime_unavailable'
  | 'runtime_timeout'
  | 'name_taken'
  | 'unknown_tenant'
  | 'not_found'
  | 'bad_request'
  | 'internal';

export interface ApiProblem {
  readonly type: ProblemType;
  readonly title: string;
  readonly status: number;
  readonly errors?: Readonly<Record<string, readonly string[]>>;
}
