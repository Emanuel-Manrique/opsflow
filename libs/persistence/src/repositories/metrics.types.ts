export interface RunStatsRow {
  readonly sampleSize: number;
  readonly finished: number;
  readonly succeeded: number;
  readonly retried: number;
  readonly exhausted: number;
  readonly outboxPending: number;
  /** Postgres returns numeric percentiles as strings. */
  readonly p95DurationMs: string | number | null;
}
