import type { RunEventDto, RunEventType } from './run-event.types';

export const RUN_EVENT_TYPES = [
  'run.started', 'run.succeeded', 'run.failed', 'run.cancelled',
  'attempt.started', 'http.request', 'http.succeeded', 'http.failed', 'http.timeout',
  'worker.failed', 'retry.scheduled', 'outbox.published', 'outbox.held', 'scheduler.claimed', 'scheduler.skipped',
] as const satisfies readonly RunEventType[];

/** SSE frame carrying one appended event, alongside the existing `run.updated` snapshots. */
export const RUN_EVENT_APPENDED = 'run.event';

export function isRunEventType(value: string): value is RunEventType {
  return (RUN_EVENT_TYPES as readonly string[]).includes(value);
}

function isOptionalInteger(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && (value as number) >= 0);
}

function isOptionalString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

export function isRunEventDto(value: unknown): value is RunEventDto {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event['id'] !== 'string' || !/^[1-9]\d*$/.test(event['id'])) return false;
  if (typeof event['runId'] !== 'string') return false;
  if (typeof event['type'] !== 'string' || !isRunEventType(event['type'])) return false;
  if (!isOptionalInteger(event['attempt']) || !isOptionalInteger(event['durationMs'])) return false;
  if (!isOptionalString(event['traceId']) || !isOptionalString(event['errorCode'])) return false;
  if (!isOptionalString(event['detail'])) return false;
  return typeof event['createdAt'] === 'string' && Number.isFinite(Date.parse(event['createdAt']));
}
