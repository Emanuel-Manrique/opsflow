import { classifyFailure, isFailureKind } from './failure';

describe('classifyFailure', () => {
  it('has nothing to classify when the run carries no error', () => {
    expect(classifyFailure(null)).toBeNull();
    expect(classifyFailure(undefined)).toBeNull();
    expect(classifyFailure('')).toBeNull();
  });

  it('reads the status out of the message the worker writes for a webhook', () => {
    const failure = classifyFailure('Webhook returned HTTP 503.');

    expect(failure).toEqual({ kind: 'http_server_error', httpStatus: 503, retryable: true });
  });

  it('separates a client error, which the worker will not retry', () => {
    const failure = classifyFailure('Webhook returned HTTP 404.');

    expect(failure).toEqual({ kind: 'http_client_error', httpStatus: 404, retryable: false });
  });

  it('keeps the two client statuses the worker does retry retryable', () => {
    expect(classifyFailure('Webhook returned HTTP 408.')?.retryable).toBe(true);
    expect(classifyFailure('Webhook returned HTTP 429.')?.retryable).toBe(true);
  });

  it('recognizes the abort the webhook deadline raises', () => {
    const failure = classifyFailure('The operation was aborted due to timeout');

    expect(failure).toEqual({ kind: 'timeout', retryable: true });
  });

  it('recognizes a destination the allowlist refused', () => {
    const failure = classifyFailure('Webhook destination is not allowed.');

    expect(failure).toEqual({ kind: 'destination_rejected', retryable: false });
  });

  it('recognizes a cancelled run', () => {
    expect(classifyFailure('Run cancelled.')?.kind).toBe('cancelled');
  });

  it('leaves an unfamiliar message unknown instead of guessing', () => {
    const failure = classifyFailure('Something nobody has seen before');

    expect(failure).toEqual({ kind: 'unknown', retryable: true });
  });

  it('guards the vocabulary', () => {
    expect(isFailureKind('timeout')).toBe(true);
    expect(isFailureKind('nonsense')).toBe(false);
  });
});
