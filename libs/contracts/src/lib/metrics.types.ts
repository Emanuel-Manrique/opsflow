/**
 * What the console shows under System Health. Every field is measured; a number that
 * cannot be measured right now arrives as null so the UI says "unavailable" rather
 * than drawing a zero.
 */
export interface HealthMetrics {
  /** Runs considered, and the window they were taken from. */
  readonly sampleSize: number;
  readonly windowHours: number;
  /** Share of finished runs that succeeded, 0..1. Null when nothing has finished. */
  readonly successRate: number | null;
  /** Share of runs that needed more than one attempt, 0..1. */
  readonly retryRate: number | null;
  /** 95th percentile of run duration in milliseconds. */
  readonly p95DurationMs: number | null;
  /** Runs that failed after exhausting every attempt: this system's dead letters. */
  readonly exhaustedRuns: number;
  /**
   * Executions written to the outbox but not yet handed to the queue. Stays above
   * zero while Redis is unreachable, which is exactly how the outbox proves it did
   * not lose the work.
   */
  readonly outboxPending: number;
  readonly queue: QueueMetrics;
}

export interface QueueMetrics {
  /** False when Redis could not be reached; the counters below are then meaningless. */
  readonly reachable: boolean;
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  /** Jobs parked in the failed set, awaiting reconciliation. */
  readonly failed: number;
  readonly workers: number;
}
