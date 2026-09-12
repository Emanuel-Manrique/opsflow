import type { CancelOutcome, RunEvent, RunStatus, RunTransition } from './run.types';

export const RUN_STATUSES = [
  'queued', 'running', 'retrying', 'cancelling', 'cancelled', 'succeeded', 'failed',
] as const satisfies readonly RunStatus[];

export const RUN_EVENTS = [
  'start', 'cancel', 'succeed', 'fail', 'backoff', 'exhaust',
] as const satisfies readonly RunEvent[];

/** Single source of truth for run status. Predicates below and SQL CASE in persistence are projections of this table. */
export const RUN_TRANSITIONS = [
  { event: 'start', from: 'queued', to: 'running', setsFinishedAt: false },
  { event: 'start', from: 'running', to: 'running', setsFinishedAt: false },
  { event: 'start', from: 'retrying', to: 'running', setsFinishedAt: false },
  { event: 'start', from: 'cancelling', to: 'cancelling', setsFinishedAt: false },
  { event: 'cancel', from: 'queued', to: 'cancelled', setsFinishedAt: true },
  { event: 'cancel', from: 'retrying', to: 'cancelled', setsFinishedAt: true },
  { event: 'cancel', from: 'running', to: 'cancelling', setsFinishedAt: false },
  { event: 'succeed', from: 'running', to: 'succeeded', setsFinishedAt: true },
  { event: 'succeed', from: 'cancelling', to: 'cancelled', setsFinishedAt: true },
  { event: 'fail', from: 'running', to: 'failed', setsFinishedAt: true },
  { event: 'fail', from: 'cancelling', to: 'cancelled', setsFinishedAt: true },
  { event: 'backoff', from: 'running', to: 'retrying', setsFinishedAt: false },
  { event: 'backoff', from: 'cancelling', to: 'cancelled', setsFinishedAt: true },
  { event: 'exhaust', from: 'queued', to: 'failed', setsFinishedAt: true },
  { event: 'exhaust', from: 'running', to: 'failed', setsFinishedAt: true },
  { event: 'exhaust', from: 'retrying', to: 'failed', setsFinishedAt: true },
  { event: 'exhaust', from: 'cancelling', to: 'cancelled', setsFinishedAt: true },
] as const satisfies readonly RunTransition[];

export function transitionsFor(event: RunEvent): readonly RunTransition[] {
  return RUN_TRANSITIONS.filter((row) => row.event === event);
}

export function sources(event: RunEvent): readonly RunStatus[] {
  return [...new Set(transitionsFor(event).map((row) => row.from))];
}

export function applyTransition(from: RunStatus, event: RunEvent): RunStatus | null {
  return transitionsFor(event).find((row) => row.from === from)?.to ?? null;
}

export const TERMINAL_RUN_STATUSES = RUN_STATUSES.filter((status) => applyTransition(status, 'start') === null);

export const CANCELLABLE_RUN_STATUSES = sources('cancel');

export const IMMEDIATE_CANCEL_STATUSES = transitionsFor('cancel').filter((row) => row.to === 'cancelled').map((row) => row.from);

export const STARTABLE_RUN_STATUSES = sources('start');

export const FINISHABLE_RUN_STATUSES = sources('succeed');

export function isRunStatus(value: string): value is RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(value);
}

export function isTerminalRun(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.includes(status);
}

export function isCancellableRun(status: RunStatus): boolean {
  return CANCELLABLE_RUN_STATUSES.includes(status);
}

export function isRetryableRun(status: RunStatus): boolean {
  return status === 'failed';
}

export function cancelOutcome(status: RunStatus): CancelOutcome | null {
  const to = applyTransition(status, 'cancel');
  if (to === 'cancelled' || to === 'cancelling') return to;
  return null;
}

export function isStaleRunSnapshot(incoming: RunStatus, shown: RunStatus): boolean {
  if (shown === incoming) return false;
  if (isTerminalRun(shown)) return true;
  return shown === 'cancelling' && (incoming === 'queued' || incoming === 'running' || incoming === 'retrying');
}

export function isConsistentRunClock(status: RunStatus, started: boolean, finished: boolean, hasError: boolean): boolean {
  switch (status) {
    case 'queued':
      return !started && !finished && !hasError;
    case 'running':
    case 'cancelling':
      return started && !finished && !hasError;
    case 'retrying':
      return started && !finished && hasError;
    case 'succeeded':
      return started && finished && !hasError;
    case 'failed':
      return started && finished && hasError;
    case 'cancelled':
      // A queued cancel never started; a running cancel did. Both must finish without an error.
      return finished && !hasError;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
