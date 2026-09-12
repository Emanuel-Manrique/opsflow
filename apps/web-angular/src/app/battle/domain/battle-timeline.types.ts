import type { RunEventDto, RunEventType } from '@opsflow/contracts';

export type TimelineTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface TimelineRow {
  readonly id: string;
  readonly type: RunEventType;
  readonly tone: TimelineTone;
  /** Plain-language line, derived from the event's own fields. */
  readonly message: string;
  readonly at: string;
  readonly event: RunEventDto;
}

export type EventFilter = 'all' | 'failures' | 'http' | 'lifecycle';
