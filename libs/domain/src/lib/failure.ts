import type { FailureKind, RunFailure } from './failure.types';

export const FAILURE_KINDS = [
  'http_server_error', 'http_client_error', 'timeout', 'destination_rejected', 'cancelled', 'unknown',
] as const satisfies readonly FailureKind[];

const HTTP = /\bHTTP (\d{3})\b/;

/** Fallback for run snapshots whose structured events are unavailable. */
export function classifyFailure(message: string | null | undefined): RunFailure | null {
  if (!message) return null;

  const http = HTTP.exec(message);
  if (http) {
    const httpStatus = Number(http[1]);
    const kind = httpStatus >= 500 ? 'http_server_error' : 'http_client_error';
    const retryable = httpStatus >= 500 || httpStatus === 408 || httpStatus === 429;
    return { kind, httpStatus, retryable };
  }
  if (/\btimed out\b|\btimeout\b/i.test(message)) return { kind: 'timeout', retryable: true };
  if (/\bnot allowed\b/i.test(message)) return { kind: 'destination_rejected', retryable: false };
  if (/\bcancelled\b/i.test(message)) return { kind: 'cancelled', retryable: false };
  return { kind: 'unknown', retryable: true };
}

export function isFailureKind(value: string): value is FailureKind {
  return (FAILURE_KINDS as readonly string[]).includes(value);
}
