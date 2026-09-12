import { isRunDto } from './run';

describe('run snapshot validation', () => {
  const run = {
    id: 'run-id', workflowId: 'workflow-id', workflowName: 'Nightly',
    status: 'queued', attempt: 0, retryOf: null, error: null, createdAt: '2026-09-09T00:00:00.000Z',
    startedAt: null, finishedAt: null,
  };

  it('accepts a complete snapshot', () => {
    expect(isRunDto(run)).toBe(true);
  });

  it('accepts a succeeded run whose clock matches the status', () => {
    const p1 = { ...run, status: 'succeeded', startedAt: run.createdAt, finishedAt: run.createdAt };
    expect(isRunDto(p1)).toBe(true);
  });

  it('rejects a queued run that already has a clock or error', () => {
    expect(isRunDto({ ...run, startedAt: run.createdAt })).toBe(false);
    expect(isRunDto({ ...run, error: 'nope' })).toBe(false);
  });

  it.each([
    { status: 'unknown' }, { createdAt: 'not a date' }, { startedAt: 123 },
    { error: {} }, { workflowName: undefined }, { finishedAt: [] },
  ])('rejects malformed data before the UI uses it: %j', (patch) => {
    expect(isRunDto({ ...run, ...patch })).toBe(false);
  });
});
