import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RunDto, RunEventDto, RunEventType } from '@opsflow/contracts';
import { BattleArena } from './battle-arena';
import { projectBattle } from './domain/battle-projection';
import type { BattleState } from './domain/battle.types';

function run(status: RunDto['status'], attempt: number, error: string | null = null): RunDto {
  const started = status === 'queued' ? null : '2026-09-11T12:00:00.000Z';
  const finished = ['succeeded', 'failed'].includes(status) ? '2026-09-11T12:00:30.000Z' : null;
  const p1 = { id: 'run-1', workflowId: 'wf-1', workflowName: 'Daily Billing', status, attempt };
  return { ...p1, retryOf: null, error, createdAt: '2026-09-11T12:00:00.000Z', startedAt: started, finishedAt: finished };
}

function event(type: RunEventType, errorCode: string | null = null): RunEventDto {
  const p1 = { id: '1', runId: 'run-1', type, attempt: 1, traceId: 'trc' };
  return { ...p1, errorCode, durationMs: null, detail: null, createdAt: '2026-09-11T12:00:05.000Z' };
}

@Component({
  imports: [BattleArena],
  template: `<ops-battle-arena [battle]="battle()" />`,
})
class Host {
  readonly battle = signal<BattleState>(projectBattle(run('queued', 0)));
}

async function render(state: BattleState) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.battle.set(state);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('BattleArena', () => {
  it('names the workflow and its attempt budget', async () => {
    const el = await render(projectBattle(run('running', 2)));

    expect(el.textContent).toContain('Daily Billing');
    expect(el.textContent).toContain('Attempt 2/3');
  });

  it('draws the enemy the run actually met, labeled with the real status', async () => {
    const state = projectBattle(run('retrying', 1, 'x'), [event('http.failed', 'HTTP_503')]);
    const el = await render(state);

    expect(el.textContent).toContain('503 Demon');
    expect(el.textContent).toContain('HTTP 503');
    expect(el.textContent).toContain('RETRYING');
  });

  it('shows no enemy while nothing has gone wrong', async () => {
    const el = await render(projectBattle(run('running', 1)));

    expect(el.textContent).not.toContain('Demon');
    expect(el.textContent).not.toContain('Wraith');
  });

  it('reports a failure that has no sprite rather than hiding it', async () => {
    const el = await render(projectBattle(run('failed', 1, 'Webhook destination is not allowed.')));

    expect(el.textContent).toContain('Unknown adversary');
  });

  it('shows HP falling as attempts are spent', async () => {
    const healthy = await render(projectBattle(run('running', 1)));
    expect(healthy.textContent).toContain('100%');

    const hurt = await render(projectBattle(run('retrying', 2, 'x'), [event('http.failed', 'HTTP_500')]));
    expect(hurt.textContent).toContain('33%');
  });

  it('announces victory and empties the enemy bar', async () => {
    const state = projectBattle(run('succeeded', 2), [event('http.failed', 'HTTP_500')]);
    const el = await render(state);

    expect(el.querySelector('[role="status"]')?.textContent).toContain('VICTORY');
    expect(state.enemy?.hp).toBe(0);
  });

  it('labels a blocked duplicate as a guarantee, not a hit', async () => {
    const el = await render(projectBattle(run('queued', 0), [event('scheduler.skipped')]));

    expect(el.textContent).toContain('SKIP LOCKED');
    expect(el.textContent).toContain('Duplicate Scheduler');
  });

  it('gives the sprites accessible names', async () => {
    const el = await render(projectBattle(run('retrying', 1, 'x'), [event('http.timeout')]));
    const labels = Array.from(el.querySelectorAll('[role="img"]')).map((node) => node.getAttribute('aria-label'));

    expect(labels).toContain('Timeout Wraith');
    expect(labels).toContain('Workflow Daily Billing');
  });
});
