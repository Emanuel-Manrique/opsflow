import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RunEventDto, RunEventType } from '@opsflow/contracts';
import { EventStream } from './event-stream';
import { toTimeline } from './domain/battle-timeline';
import type { TimelineRow } from './domain/battle-timeline.types';

let sequence = 0;
function event(type: RunEventType, patch: Partial<RunEventDto> = {}): RunEventDto {
  sequence += 1;
  const p1 = { id: String(sequence), runId: 'run-1', type, attempt: 1, traceId: 'trc' };
  const p2 = { errorCode: null, durationMs: null, detail: null, createdAt: '2026-09-11T12:00:05.000Z' };
  return { ...p1, ...p2, ...patch };
}

@Component({
  imports: [EventStream],
  template: `<ops-event-stream [rows]="rows()" [live]="live()" />`,
})
class Host {
  readonly rows = signal<readonly TimelineRow[]>([]);
  readonly live = signal(false);
}

async function render(rows: readonly TimelineRow[], live = false) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.rows.set(rows);
  fixture.componentInstance.live.set(live);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('EventStream', () => {
  it('says so when there is nothing to show', async () => {
    const { el } = await render([]);

    expect(el.textContent).toContain('No events recorded');
  });

  it('lists events newest first with their own wording', async () => {
    const rows = toTimeline([event('run.started'), event('http.failed', { errorCode: 'HTTP_500', detail: '500' })]);
    const { el } = await render(rows);
    const items = Array.from(el.querySelectorAll('li'));

    expect(items[0].textContent).toContain('http.failed');
    expect(items[0].textContent).toContain('Responded 500');
    expect(items[1].textContent).toContain('run.started');
  });

  it('shows the live indicator only while the stream is connected', async () => {
    const { el: idle } = await render([], false);
    expect(idle.textContent).toContain('Idle');

    const { el: live } = await render([], true);
    expect(live.textContent).toContain('Live');
  });

  it('narrows to failures when asked', async () => {
    const p1 = [event('run.started'), event('http.request'), event('http.failed', { errorCode: 'HTTP_500' })];
    const rows = toTimeline([...p1, event('retry.scheduled')]);
    const { fixture, el } = await render(rows);

    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'failures';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    const types = Array.from(el.querySelectorAll('li code')).map((node) => node.textContent);
    expect(types).toEqual(['retry.scheduled', 'http.failed']);
  });

  it('keeps the list announced for screen readers', async () => {
    const { el } = await render(toTimeline([event('run.started')]));

    expect(el.querySelector('ol')?.getAttribute('aria-live')).toBe('polite');
  });
});
