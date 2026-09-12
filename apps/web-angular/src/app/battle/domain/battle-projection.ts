import { RUN_ATTEMPTS } from '@opsflow/contracts';
import type { RunDto, RunEventDto } from '@opsflow/contracts';
import { classifyFailure, isTerminalRun } from '@opsflow/domain';
import type { RunFailure, RunStatus } from '@opsflow/domain';
import type { BattleEnemy, BattleEnvironment, BattleHero } from './battle.types';
import type { BattleOutcome, BattleState, HeroStance } from './battle.types';

const STANCES: Record<RunStatus, HeroStance> = {
  queued: 'idle',
  running: 'walking',
  retrying: 'recovering',
  cancelling: 'cancelled',
  cancelled: 'cancelled',
  succeeded: 'victory',
  failed: 'defeated',
};

const OUTCOMES: Record<RunStatus, BattleOutcome> = {
  queued: 'pending',
  running: 'fighting',
  retrying: 'fighting',
  cancelling: 'fighting',
  cancelled: 'cancelled',
  succeeded: 'victory',
  failed: 'defeat',
};

const HTTP_CODE = /^HTTP_(\d{3})$/;

/**
 * Attempts already consumed by a failure. `attempt` counts attempts *started*, so a
 * run that is mid-flight has not yet spent the attempt it is on, while one sitting in
 * `retrying` or `failed` has.
 */
function spentAttempts(status: RunStatus, attempt: number): number {
  if (status === 'retrying' || status === 'failed') return attempt;
  return Math.max(0, attempt - 1);
}

const OPEN = { hp: 1, defeated: false, blocked: false };

function wraith(): BattleEnemy {
  const p1 = { id: 'timeout-wraith' as const, name: 'Timeout Wraith', kind: 'timeout' as const };
  return { ...p1, ...OPEN, hit: 'TIMEOUT!' };
}

function demon(status: number, kind: BattleEnemy['kind']): BattleEnemy {
  const p1 = { id: 'http-demon' as const, name: `${status} Demon`, kind };
  return { ...p1, ...OPEN, hit: `HTTP ${status}` };
}

/**
 * Two schedulers reached the same occurrence and the unique constraint let exactly
 * one through. The attack landed on a wall, so it is drawn blocked.
 */
function duplicateScheduler(): BattleEnemy {
  const p1 = { id: 'duplicate-scheduler' as const, name: 'Duplicate Scheduler', kind: 'unknown' as const };
  return { ...p1, hp: 1, defeated: false, blocked: true, hit: 'SKIP LOCKED' };
}

/** The queue is unreachable. The outbox is holding the work, so nothing is lost. */
function redisOutage(pending: number): BattleEnemy {
  const p1 = { id: 'redis-outage' as const, name: 'Redis Outage', kind: 'unknown' as const };
  return { ...p1, hp: 1, defeated: false, blocked: true, hit: `OUTBOX ${pending}` };
}

/**
 * The enemy is whatever the run last collided with, read from its recorded events.
 * Taking it from history rather than the run's current row is what lets the demon
 * stay on screen to be beaten: the run drops `error_message` the moment it retries
 * or succeeds, but the event that caused it is permanent.
 */
function fromEvents(events: readonly RunEventDto[]): BattleEnemy | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === 'scheduler.skipped') return duplicateScheduler();
    if (event.type === 'http.timeout') return wraith();
    if (event.type === 'http.failed') {
      const code = HTTP_CODE.exec(event.errorCode ?? '');
      if (!code) return null;
      const status = Number(code[1]);
      return demon(status, status >= 500 ? 'http_server_error' : 'http_client_error');
    }
  }
  return null;
}

/** Fallback for a run whose events have not been loaded, or that failed before sending. */
function fromError(failure: RunFailure | null): BattleEnemy | null {
  if (!failure) return null;
  if (failure.kind === 'timeout') return wraith();
  if (failure.httpStatus) return demon(failure.httpStatus, failure.kind);
  return null;
}

function toBanner(status: RunStatus, enemy: BattleEnemy | null): string | null {
  if (enemy?.blocked && status !== 'succeeded') return enemy.hit;
  if (status === 'retrying') return 'RETRYING…';
  if (status === 'succeeded') return 'VICTORY';
  if (status === 'cancelled' || status === 'cancelling') return 'CANCELLED';
  if (status === 'failed') return 'DEFEATED';
  return null;
}

/**
 * Projects a run and its recorded events into what the arena draws. Pure and total:
 * the same inputs always give the same battle. Retries, outcomes and attempt counts
 * are the backend's, already settled by the time they reach here.
 */
export function projectBattle(run: RunDto, events: readonly RunEventDto[] = [], environment?: BattleEnvironment, maxAttempts: number = RUN_ATTEMPTS): BattleState {
  const mine = events.filter((event) => event.runId === run.id);
  const spent = Math.min(spentAttempts(run.status, run.attempt), maxAttempts);
  const remaining = Math.max(0, maxAttempts - spent);
  const p1 = { name: run.workflowName, stance: STANCES[run.status], attempt: run.attempt };
  const hero: BattleHero = { ...p1, maxAttempts, spentAttempts: spent, hp: remaining / maxAttempts };

  // A run that cannot reach the queue is held by the outbox; that outranks whatever
  // it last collided with, because it is what is happening to it right now.
  const stuck = environment && !environment.queueReachable && !isTerminalRun(run.status);
  const found = stuck ? redisOutage(environment.outboxPending) : fromEvents(mine) ?? fromError(classifyFailure(run.error));
  const beaten = run.status === 'succeeded';
  const enemy = found && beaten ? { ...found, hp: 0, defeated: true } : found;
  const p2 = { runId: run.id, status: run.status, hero, enemy };
  return { ...p2, outcome: OUTCOMES[run.status], banner: toBanner(run.status, enemy) };
}
