import { applyTransition, cancelOutcome, isCancellableRun, isConsistentRunClock } from './run';
import { isRetryableRun, isRunStatus, isStaleRunSnapshot, isTerminalRun, RUN_TRANSITIONS, sources } from './run';
import { CANCELLABLE_RUN_STATUSES, FINISHABLE_RUN_STATUSES, IMMEDIATE_CANCEL_STATUSES } from './run';
import { RUN_EVENTS, RUN_STATUSES, STARTABLE_RUN_STATUSES, TERMINAL_RUN_STATUSES, transitionsFor } from './run';
import type { RunStatus } from './run.types';

describe('run status machine', () => {
  it.each(RUN_STATUSES)('accepts status %s', (status) => {
    expect(isRunStatus(status)).toBe(true);
  });

  it('rejects a status that is not on the machine', () => {
    expect(isRunStatus('pending')).toBe(false);
  });

  it.each(TERMINAL_RUN_STATUSES)('%s is terminal', (status) => {
    expect(isTerminalRun(status)).toBe(true);
    expect(isCancellableRun(status)).toBe(false);
  });

  it.each(CANCELLABLE_RUN_STATUSES)('%s can be cancelled', (status) => {
    expect(isCancellableRun(status)).toBe(true);
    expect(isTerminalRun(status)).toBe(false);
  });

  it('only a failed run can be retried manually', () => {
    const retryable = RUN_STATUSES.filter((status) => isRetryableRun(status));
    expect(retryable).toEqual(['failed']);
  });

  it.each<[RunStatus, ReturnType<typeof cancelOutcome>]>([
    ['queued', 'cancelled'],
    ['retrying', 'cancelled'],
    ['running', 'cancelling'],
    ['cancelling', null],
    ['cancelled', null],
    ['succeeded', null],
    ['failed', null],
  ])('cancel of %s becomes %s', (status, outcome) => {
    expect(cancelOutcome(status)).toBe(outcome);
    expect(applyTransition(status, 'cancel')).toBe(outcome);
  });

  it('derives startable, finishable and immediate-cancel from the transition table', () => {
    expect([...STARTABLE_RUN_STATUSES].sort()).toEqual(RUN_STATUSES.filter((status) => !isTerminalRun(status)).sort());
    expect(STARTABLE_RUN_STATUSES).toEqual(sources('start'));
    expect(FINISHABLE_RUN_STATUSES).toEqual(sources('succeed'));
    expect(IMMEDIATE_CANCEL_STATUSES).toEqual(['queued', 'retrying']);
    expect(FINISHABLE_RUN_STATUSES).toEqual(['running', 'cancelling']);
  });

  it('includes every RunEvent in the table so SQL cannot grow a branch the domain does not know', () => {
    expect([...new Set(RUN_TRANSITIONS.map((row) => row.event))].sort()).toEqual([...RUN_EVENTS].sort());
  });

  it('has exactly one outcome per from+event and no transitions out of a terminal status', () => {
    const keys = RUN_TRANSITIONS.map((row) => `${row.event}:${row.from}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const status of TERMINAL_RUN_STATUSES) {
      for (const event of RUN_EVENTS) {
        expect(applyTransition(status, event)).toBeNull();
      }
    }
  });

  it('keeps cancelling through start, succeed, fail, backoff and exhaust', () => {
    expect(applyTransition('cancelling', 'start')).toBe('cancelling');
    expect(applyTransition('cancelling', 'succeed')).toBe('cancelled');
    expect(applyTransition('cancelling', 'fail')).toBe('cancelled');
    expect(applyTransition('cancelling', 'backoff')).toBe('cancelled');
    expect(applyTransition('cancelling', 'exhaust')).toBe('cancelled');
  });

  it('uses setsFinishedAt for every transition that lands on a terminal status', () => {
    for (const row of RUN_TRANSITIONS) {
      expect(row.setsFinishedAt).toBe(isTerminalRun(row.to));
    }
    expect(transitionsFor('backoff').find((row) => row.from === 'running')?.setsFinishedAt).toBe(false);
  });

  it.each([
    ['queued', 'cancelled', true],
    ['running', 'cancelling', true],
    ['cancelled', 'cancelling', false],
    ['running', 'queued', false],
  ] as const)('treats incoming %s vs shown %s as stale=%s', (incoming, shown, stale) => {
    expect(isStaleRunSnapshot(incoming, shown)).toBe(stale);
  });

  it.each([
    ['queued', false, false, false, true],
    ['queued', true, false, false, false],
    ['running', true, false, false, true],
    ['retrying', true, false, true, true],
    ['retrying', true, false, false, false],
    ['cancelling', true, false, false, true],
    ['succeeded', true, true, false, true],
    ['failed', true, true, true, true],
    ['failed', true, true, false, false],
    ['cancelled', false, true, false, true],
    ['cancelled', true, true, false, true],
    ['cancelled', true, true, true, false],
  ] as const)('%s started=%s finished=%s error=%s is consistent=%s', (status, started, finished, hasError, expected) => {
    expect(isConsistentRunClock(status, started, finished, hasError)).toBe(expected);
  });
});
