import type { RunEventDto, RunEventType } from '@opsflow/contracts';
import type { TimelineRow, TimelineTone } from './battle-timeline.types';

const TONES: Record<RunEventType, TimelineTone> = {
  'run.started': 'accent',
  'run.succeeded': 'success',
  'run.failed': 'danger',
  'run.cancelled': 'neutral',
  'attempt.started': 'accent',
  'http.request': 'neutral',
  'http.succeeded': 'success',
  'http.failed': 'danger',
  'http.timeout': 'danger',
  'worker.failed': 'warning',
  'retry.scheduled': 'warning',
  'outbox.published': 'success',
  'outbox.held': 'warning',
  'scheduler.claimed': 'accent',
  'scheduler.skipped': 'warning',
};

function took(event: RunEventDto): string {
  return event.durationMs === null ? '' : ` in ${event.durationMs}ms`;
}

/**
 * Turns one recorded event into the line the stream shows. Everything here comes off
 * the event's own fields, so there is nothing to look up and nothing to invent.
 */
function describe(event: RunEventDto): string {
  switch (event.type) {
    case 'run.started':
      return 'Run queued for execution';
    case 'attempt.started':
      return `Attempt ${event.attempt} started`;
    case 'http.request':
      return event.detail ?? 'Request sent';
    case 'http.succeeded':
      return `Responded ${event.detail ?? 'OK'}${took(event)}`;
    case 'http.failed':
      return `Responded ${event.detail ?? event.errorCode ?? 'error'}${took(event)}`;
    case 'http.timeout':
      return `Request timed out${took(event)}`;
    case 'worker.failed':
      return `Attempt failed${event.errorCode ? `: ${event.errorCode}` : ''}`;
    case 'retry.scheduled':
      return event.detail ? `Scheduling ${event.detail}` : 'Scheduling retry';
    case 'run.succeeded':
      return 'Run succeeded';
    case 'run.failed':
      return `Run failed after ${event.attempt ?? 0} attempts`;
    case 'run.cancelled':
      return 'Run cancelled';
    case 'outbox.published':
      return 'Queued from the outbox';
    case 'outbox.held':
      return 'Held in the outbox: the queue is unreachable';
    case 'scheduler.claimed':
      return 'Occurrence claimed';
    case 'scheduler.skipped':
      return 'Occurrence already claimed elsewhere';
    default: {
      const exhaustive: never = event.type;
      return exhaustive;
    }
  }
}

export function toTimelineRow(event: RunEventDto): TimelineRow {
  const p1 = { id: event.id, type: event.type, tone: TONES[event.type] };
  return { ...p1, message: describe(event), at: event.createdAt, event };
}

/** Newest first, which is how the stream reads. */
export function toTimeline(events: readonly RunEventDto[]): readonly TimelineRow[] {
  return events.map(toTimelineRow).reverse();
}
