import type { ApiProblem, ProblemType } from './problem.types';

export const PROBLEM_TYPES = [
  'validation_failed',
  'tenant_required',
  'workflow_not_found',
  'run_not_found',
  'run_not_retryable',
  'session_required',
  'forbidden',
  'run_not_cancellable',
  'runtime_unavailable',
  'runtime_timeout',
  'name_taken',
  'unknown_tenant',
  'not_found',
  'bad_request',
  'internal',
] as const satisfies readonly ProblemType[];

export function isApiProblem(value: unknown): value is ApiProblem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const errors = candidate['errors'];
  if (errors !== undefined) {
    if (typeof errors !== 'object' || errors === null || Array.isArray(errors)) {
      return false;
    }
    const valid = Object.values(errors).every((messages: unknown) => {
      return Array.isArray(messages) && messages.every((message: unknown) => typeof message === 'string');
    });
    if (!valid) return false;
  }

  return (
    typeof candidate['type'] === 'string' &&
    (PROBLEM_TYPES as readonly string[]).includes(candidate['type']) &&
    typeof candidate['title'] === 'string' &&
    typeof candidate['status'] === 'number' && Number.isFinite(candidate['status'])
  );
}
