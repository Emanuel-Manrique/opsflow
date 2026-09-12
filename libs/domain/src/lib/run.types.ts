export type RunStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'cancelling'
  | 'cancelled'
  | 'succeeded'
  | 'failed';

export type RunEvent = 'start' | 'cancel' | 'succeed' | 'fail' | 'backoff' | 'exhaust';

export type CancelOutcome = 'cancelled' | 'cancelling';

/** One enabled edge of the run machine. Persistence projects these rows into SQL CASE; it does not invent outcomes. */
export interface RunTransition {
  readonly event: RunEvent;
  readonly from: RunStatus;
  readonly to: RunStatus;
  readonly setsFinishedAt: boolean;
}
