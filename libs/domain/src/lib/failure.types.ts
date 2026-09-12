/**
 * What kind of thing went wrong on the last attempt. Derived from the recorded
 * error, so every consumer (console, alerting, the battle projection) reaches the
 * same verdict instead of each re-reading the message its own way.
 */
export type FailureKind =
  | 'http_server_error'
  | 'http_client_error'
  | 'timeout'
  | 'destination_rejected'
  | 'cancelled'
  | 'unknown';

export interface RunFailure {
  readonly kind: FailureKind;
  /** Present only for `http_server_error` / `http_client_error`. */
  readonly httpStatus?: number;
  /** True when the run machine would keep retrying this kind of failure. */
  readonly retryable: boolean;
}
