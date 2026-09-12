import type { RunDto, RunEventDto, RunEventType } from '@opsflow/contracts';
import type { RunStatus } from '@opsflow/domain';
import { projectBattle } from './battle-projection';

function run(status: RunStatus, attempt: number, error: string | null = null): RunDto {
  const started = status === 'queued' ? null : '2026-09-11T12:00:00.000Z';
  const finished = ['succeeded', 'failed', 'cancelled'].includes(status) ? '2026-09-11T12:00:30.000Z' : null;
  const p1 = { id: 'run-1', workflowId: 'wf-1', workflowName: 'Daily Billing', status, attempt };
  return { ...p1, retryOf: null, error, createdAt: '2026-09-11T12:00:00.000Z', startedAt: started, finishedAt: finished };
}

let sequence = 0;
function event(type: RunEventType, errorCode: string | null = null, runId = 'run-1'): RunEventDto {
  sequence += 1;
  const p1 = { id: String(sequence), runId, type, attempt: 1, traceId: 'trc' };
  return { ...p1, errorCode, durationMs: null, detail: null, createdAt: '2026-09-11T12:00:05.000Z' };
}

describe('projectBattle', () => {
  it('maps every run status the machine can reach to a stance', () => {
    expect(projectBattle(run('queued', 0)).hero.stance).toBe('idle');
    expect(projectBattle(run('running', 1)).hero.stance).toBe('walking');
    expect(projectBattle(run('retrying', 1, 'Webhook returned HTTP 500.')).hero.stance).toBe('recovering');
    expect(projectBattle(run('succeeded', 1)).hero.stance).toBe('victory');
    expect(projectBattle(run('failed', 3, 'Webhook returned HTTP 500.')).hero.stance).toBe('defeated');
    expect(projectBattle(run('cancelled', 1)).hero.stance).toBe('cancelled');
  });

  it('reads HP as attempts left, spending one only once an attempt has failed', () => {
    expect(projectBattle(run('queued', 0)).hero.hp).toBe(1);
    // Mid-flight on the first attempt: nothing spent yet.
    expect(projectBattle(run('running', 1)).hero.hp).toBe(1);
    expect(projectBattle(run('retrying', 1, 'Webhook returned HTTP 500.')).hero.hp).toBeCloseTo(2 / 3);
    expect(projectBattle(run('running', 2)).hero.hp).toBeCloseTo(2 / 3);
    expect(projectBattle(run('retrying', 2, 'Webhook returned HTTP 500.')).hero.hp).toBeCloseTo(1 / 3);
    expect(projectBattle(run('failed', 3, 'Webhook returned HTTP 500.')).hero.hp).toBe(0);
  });

  it('summons the demon for a 500 and the wraith for a timeout, from the events', () => {
    const demon = projectBattle(run('retrying', 1, 'x'), [event('http.failed', 'HTTP_500')]).enemy;
    expect(demon?.id).toBe('http-demon');
    expect(demon?.name).toBe('500 Demon');
    expect(demon?.hit).toBe('HTTP 500');

    const wraith = projectBattle(run('retrying', 1, 'x'), [event('http.timeout', 'TIMEOUT')]).enemy;
    expect(wraith?.id).toBe('timeout-wraith');
    expect(wraith?.hit).toBe('TIMEOUT!');
  });

  it('labels the demon with the status that actually came back', () => {
    const state = projectBattle(run('failed', 1, 'x'), [event('http.failed', 'HTTP_503')]);

    expect(state.enemy?.name).toBe('503 Demon');
  });

  it('falls back to the run error when the events have not loaded yet', () => {
    expect(projectBattle(run('failed', 3, 'Webhook returned HTTP 500.')).enemy?.name).toBe('500 Demon');
  });

  it('leaves a failure with no enemy implemented without one', () => {
    const state = projectBattle(run('failed', 1, 'Webhook destination is not allowed.'));

    expect(state.enemy).toBeNull();
    expect(state.banner).toBe('DEFEATED');
  });

  it('has no enemy while the run has not failed', () => {
    expect(projectBattle(run('running', 1), [event('http.request')]).enemy).toBeNull();
  });

  // The scenario the whole feature exists to show, replayed from recorded history.
  it('keeps the demon on screen through the retry and kills it on the winning attempt', () => {
    const history = [event('run.started'), event('http.failed', 'HTTP_500'), event('retry.scheduled', 'HTTP_500')];

    const retrying = projectBattle(run('retrying', 1, 'Webhook returned HTTP 500.'), history);
    expect(retrying.enemy?.defeated).toBe(false);
    expect(retrying.banner).toBe('RETRYING…');

    // The run has dropped its error by now; only the events remember the demon.
    const midFight = projectBattle(run('running', 2), history);
    expect(midFight.enemy?.name).toBe('500 Demon');
    expect(midFight.enemy?.hp).toBe(1);

    const victory = projectBattle(run('succeeded', 2), [...history, event('http.succeeded')]);
    expect(victory.enemy?.name).toBe('500 Demon');
    expect(victory.enemy?.defeated).toBe(true);
    expect(victory.enemy?.hp).toBe(0);
    expect(victory.outcome).toBe('victory');
    expect(victory.banner).toBe('VICTORY');
    expect(victory.hero.hp).toBeCloseTo(2 / 3);
  });

  it('keeps the enemy standing when the run runs out of attempts', () => {
    const history = [event('http.failed', 'HTTP_500'), event('run.failed', 'HTTP_500')];
    const exhausted = projectBattle(run('failed', 3, 'Webhook returned HTTP 500.'), history);

    expect(exhausted.outcome).toBe('defeat');
    expect(exhausted.enemy?.defeated).toBe(false);
    expect(exhausted.hero.hp).toBe(0);
  });

  it('ignores events belonging to another run', () => {
    const foreign = [event('http.failed', 'HTTP_500', 'run-2')];

    expect(projectBattle(run('running', 1), foreign).enemy).toBeNull();
  });

  it('takes the most recent collision when a run met more than one', () => {
    const history = [event('http.failed', 'HTTP_500'), event('http.timeout', 'TIMEOUT')];

    expect(projectBattle(run('retrying', 2, 'x'), history).enemy?.id).toBe('timeout-wraith');
  });

  it('blocks the duplicate scheduler instead of letting it land', () => {
    const state = projectBattle(run('queued', 0), [event('scheduler.skipped')]);

    expect(state.enemy?.id).toBe('duplicate-scheduler');
    expect(state.enemy?.blocked).toBe(true);
    expect(state.enemy?.hit).toBe('SKIP LOCKED');
    // The run is untouched: a refused duplicate costs the hero nothing.
    expect(state.hero.hp).toBe(1);
    expect(state.outcome).toBe('pending');
    expect(state.banner).toBe('SKIP LOCKED');
  });

  it('shows the outbox holding the work while the queue is unreachable', () => {
    const environment = { queueReachable: false, outboxPending: 4 };
    const state = projectBattle(run('queued', 0), [], environment);

    expect(state.enemy?.id).toBe('redis-outage');
    expect(state.enemy?.blocked).toBe(true);
    expect(state.enemy?.hit).toBe('OUTBOX 4');
  });

  it('leaves a finished run alone even when the queue is down', () => {
    const environment = { queueReachable: false, outboxPending: 4 };
    const history = [event('http.failed', 'HTTP_500')];

    expect(projectBattle(run('failed', 3, 'x'), history, environment).enemy?.id).toBe('http-demon');
  });

  it('goes back to the real adversary once the queue recovers', () => {
    const history = [event('http.failed', 'HTTP_500')];
    const environment = { queueReachable: true, outboxPending: 0 };

    expect(projectBattle(run('retrying', 1, 'x'), history, environment).enemy?.id).toBe('http-demon');
  });

  it('is a pure function of the run and its events', () => {
    const history = [event('http.failed', 'HTTP_500')];
    const current = run('retrying', 1, 'Webhook returned HTTP 500.');

    expect(projectBattle(current, history)).toEqual(projectBattle(current, history));
  });
});
