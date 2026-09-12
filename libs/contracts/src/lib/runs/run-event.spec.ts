import { isRunEventDto, isRunEventType, RUN_EVENT_TYPES } from './run-event';

const valid = {
  id: '42',
  runId: '0be9f2a9-7c82-48f5-963d-95b0c80ce2c6',
  type: 'http.failed',
  attempt: 1,
  traceId: '8f3a9d2e4b1c7a05',
  errorCode: 'HTTP_500',
  durationMs: 128,
  detail: 'POST api.stripe.com',
  createdAt: '2026-09-11T12:09:14.000Z',
};

describe('run event contract', () => {
  it('accepts a well-formed event', () => {
    expect(isRunEventDto(valid)).toBe(true);
  });

  it('accepts the nullable fields being absent', () => {
    const p1 = { attempt: null, traceId: null, errorCode: null };
    expect(isRunEventDto({ ...valid, ...p1, durationMs: null, detail: null })).toBe(true);
  });

  it.each(['', '0', '-1', '1.5', 'NaN', 'event-1'])('rejects invalid event cursor %s', (id) => {
    expect(isRunEventDto({ ...valid, id })).toBe(false);
  });

  it('accepts a Postgres bigint cursor without converting it to a number', () => {
    expect(isRunEventDto({ ...valid, id: '9007199254740993' })).toBe(true);
  });

  it('rejects a type outside the vocabulary', () => {
    expect(isRunEventDto({ ...valid, type: 'run.exploded' })).toBe(false);
    expect(isRunEventType('run.exploded')).toBe(false);
  });

  it('rejects a malformed timestamp or attempt', () => {
    expect(isRunEventDto({ ...valid, createdAt: 'yesterday' })).toBe(false);
    expect(isRunEventDto({ ...valid, attempt: -1 })).toBe(false);
    expect(isRunEventDto({ ...valid, attempt: 1.5 })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isRunEventDto(null)).toBe(false);
    expect(isRunEventDto('run.started')).toBe(false);
  });

  it('keeps the vocabulary and the guard in step', () => {
    for (const type of RUN_EVENT_TYPES) expect(isRunEventDto({ ...valid, type })).toBe(true);
  });
});
