import { isConsistentRunClock, isRunStatus } from '@opsflow/domain';
import type { RunDto } from './run.types';

export const RUN_QUEUE = 'workflow-runs';
export const RUN_JOB = 'execute-run';
export const RUN_UPDATED_EVENT = 'run.updated';
export const RUN_ATTEMPTS = 3;

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function isRunDto(value: unknown): value is RunDto {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Record<string, unknown>;
  if (typeof run['id'] !== 'string' || typeof run['workflowId'] !== 'string') return false;
  if (typeof run['workflowName'] !== 'string') return false;
  if (!Number.isInteger(run['attempt']) || (run['attempt'] as number) < 0) return false;
  if (run['retryOf'] !== null && typeof run['retryOf'] !== 'string') return false;
  if (typeof run['status'] !== 'string' || !isRunStatus(run['status'])) return false;
  if (run['error'] !== null && typeof run['error'] !== 'string') return false;
  if (run['scheduledFor'] !== undefined && run['scheduledFor'] !== null && !isTimestamp(run['scheduledFor'])) return false;
  if (!isTimestamp(run['createdAt'])) return false;
  if (run['startedAt'] !== null && !isTimestamp(run['startedAt'])) return false;
  if (run['finishedAt'] !== null && !isTimestamp(run['finishedAt'])) return false;
  // Same clock invariant as ck_runs_timestamps / ck_runs_error; a lying snapshot must not reach the console.
  return isConsistentRunClock(run['status'], run['startedAt'] !== null, run['finishedAt'] !== null, run['error'] !== null);
}
