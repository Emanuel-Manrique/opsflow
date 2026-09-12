import type { RunEventDto, RunEventType } from '@opsflow/contracts';
import { RUN_EVENT_TYPES } from '@opsflow/contracts';
import { toTimeline, toTimelineRow } from './battle-timeline';

function event(type: RunEventType, patch: Partial<RunEventDto> = {}): RunEventDto {
  const p1 = { id: '1', runId: 'run-1', type, attempt: 2, traceId: 'trc' };
  const p2 = { errorCode: null, durationMs: null, detail: null, createdAt: '2026-09-11T12:00:05.000Z' };
  return { ...p1, ...p2, ...patch };
}

describe('battle timeline', () => {
  it('describes every event type in the vocabulary', () => {
    for (const type of RUN_EVENT_TYPES) {
      const row = toTimelineRow(event(type));
      expect(row.message.length).toBeGreaterThan(0);
      expect(row.message).not.toContain('undefined');
      expect(row.message).not.toContain('null');
    }
  });

  it('reads the detail and duration the event carries', () => {
    const p1 = { detail: '204', durationMs: 128 };
    expect(toTimelineRow(event('http.succeeded', p1)).message).toBe('Responded 204 in 128ms');
    expect(toTimelineRow(event('http.request', { detail: 'POST api.stripe.com' })).message).toBe('POST api.stripe.com');
    expect(toTimelineRow(event('http.timeout', { durationMs: 5_000 })).message).toBe('Request timed out in 5000ms');
  });

  it('names the attempt and the error code', () => {
    expect(toTimelineRow(event('attempt.started')).message).toBe('Attempt 2 started');
    expect(toTimelineRow(event('worker.failed', { errorCode: 'HTTP_500' })).message).toBe('Attempt failed: HTTP_500');
    expect(toTimelineRow(event('retry.scheduled', { detail: 'attempt 3/3' })).message).toBe('Scheduling attempt 3/3');
  });

  it('tones failures apart from successes', () => {
    expect(toTimelineRow(event('http.failed')).tone).toBe('danger');
    expect(toTimelineRow(event('run.succeeded')).tone).toBe('success');
    expect(toTimelineRow(event('retry.scheduled')).tone).toBe('warning');
  });

  it('reads newest first', () => {
    const rows = toTimeline([event('run.started', { id: '1' }), event('run.succeeded', { id: '2' })]);

    expect(rows.map((row) => row.id)).toEqual(['2', '1']);
  });
});
