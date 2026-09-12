/**
 * What a run did, as it happened. These are recorded by the service that performed the
 * work, so the console replays fact rather than re-deriving a story from the run's
 * current row. Names match the span names in `observe()`.
 */
export type RunEventType =
  | 'run.started'
  | 'run.succeeded'
  | 'run.failed'
  | 'run.cancelled'
  | 'attempt.started'
  | 'http.request'
  | 'http.succeeded'
  | 'http.failed'
  | 'http.timeout'
  | 'worker.failed'
  | 'retry.scheduled'
  | 'outbox.published'
  | 'outbox.held'
  | 'scheduler.claimed'
  | 'scheduler.skipped';

export interface RunEventDto {
  /** Monotonic within a run; doubles as the stream cursor. */
  readonly id: string;
  readonly runId: string;
  readonly type: RunEventType;
  readonly attempt: number | null;
  /** OpenTelemetry trace id, so a row in the console leads straight to the span. */
  readonly traceId: string | null;
  readonly errorCode: string | null;
  readonly durationMs: number | null;
  /**
   * Short, non-sensitive descriptor: `POST api.stripe.com`, `503`. Never a URL with
   * credentials or a query string, and never a raw error message.
   */
  readonly detail: string | null;
  readonly createdAt: string;
}
