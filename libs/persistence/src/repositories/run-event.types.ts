import type { RunEventType } from '@opsflow/contracts';

export interface NewRunEvent {
  readonly runId: string;
  readonly type: RunEventType;
  readonly attempt?: number | null;
  readonly traceId?: string | null;
  readonly errorCode?: string | null;
  readonly durationMs?: number | null;
  readonly detail?: string | null;
}
