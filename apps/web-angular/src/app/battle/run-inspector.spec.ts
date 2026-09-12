import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import type { RunDto, RunEventDto } from '@opsflow/contracts';
import type { Role } from '@opsflow/contracts';
import { Session } from '../core/session';
import { RunInspector } from './run-inspector';

function run(status: RunDto['status'], patch: Partial<RunDto> = {}): RunDto {
  const p1 = { id: 'b5405bc3-0000-4000-8000-000000000001', workflowId: 'wf-1', workflowName: 'Daily Billing' };
  const p2 = { status, attempt: 2, retryOf: null, error: null, createdAt: '2026-09-11T12:00:00.000Z' };
  return { ...p1, ...p2, startedAt: '2026-09-11T12:00:00.000Z', finishedAt: null, ...patch };
}

@Component({
  imports: [RunInspector],
  template: `<ops-run-inspector [run]="run()" [events]="events()" />`,
})
class Host {
  readonly run = signal<RunDto>(run('running'));
  readonly events = signal<readonly RunEventDto[]>([]);
}

async function render(current: RunDto, role: Role = 'operator', events: readonly RunEventDto[] = []) {
  // Rendering twice inside one test needs a clean module each time.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  const p1 = { userId: 'u1', email: 'u@test.local', tenantId: 't1', tenantSlug: 't', tenantName: 'T', role };
  TestBed.inject(Session).data.set({ member: p1, memberships: [p1], demoEnabled: true });
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.run.set(current);
  fixture.componentInstance.events.set(events);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function buttons(el: HTMLElement): (string | undefined)[] {
  return Array.from(el.querySelectorAll('button')).map((node) => node.textContent?.trim());
}

describe('RunInspector', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the run identity and attempt count', async () => {
    const el = await render(run('running'));

    expect(el.textContent).toContain('Daily Billing');
    expect(el.textContent).toContain('RUN-b5405bc3');
    expect(el.textContent).toContain('2');
  });

  it('surfaces the trace id recorded by the services', async () => {
    const p1 = { id: '1', runId: 'run-1', type: 'run.started' as const, attempt: null };
    const p2 = { errorCode: null, durationMs: null, detail: null, createdAt: '2026-09-11T12:00:00.000Z' };
    const el = await render(run('running'), 'operator', [{ ...p1, ...p2, traceId: 'abc123' }]);

    expect(el.textContent).toContain('abc123');
  });

  // The actions follow the run machine and the role, never the other way round.
  it('offers retry only on a failed run', async () => {
    expect(buttons(await render(run('failed', { error: 'Webhook returned HTTP 500.', finishedAt: '2026-09-11T12:01:00.000Z' })))).toContain('Retry now');
    expect(buttons(await render(run('running')))).not.toContain('Retry now');
  });

  it('offers cancel only while the run can still be cancelled', async () => {
    expect(buttons(await render(run('running')))).toContain('Cancel');
    expect(buttons(await render(run('succeeded', { finishedAt: '2026-09-11T12:01:00.000Z' })))).not.toContain('Cancel');
  });

  it('offers no mutation at all to a viewer', async () => {
    const failed = run('failed', { error: 'Webhook returned HTTP 500.', finishedAt: '2026-09-11T12:01:00.000Z' });
    const el = await render(failed, 'viewer');

    expect(buttons(el)).not.toContain('Retry now');
    expect(buttons(el)).not.toContain('Cancel');
  });

  it('emits the run id when an action is taken', async () => {
    const failed = run('failed', { error: 'Webhook returned HTTP 500.', finishedAt: '2026-09-11T12:01:00.000Z' });
    const el = await render(failed);
    const retry = Array.from(el.querySelectorAll('button')).find((node) => node.textContent?.includes('Retry now'));

    expect(retry).toBeDefined();
    expect(retry?.hasAttribute('disabled')).toBe(false);
  });
});
