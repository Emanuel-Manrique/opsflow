import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RunStatus } from '@opsflow/domain';
import { RUN_STATUSES } from '@opsflow/domain';
import { StatusBadge } from './status-badge';

@Component({
  imports: [StatusBadge],
  template: `<ops-status-badge [status]="status()" />`,
})
class Host {
  readonly status = signal<RunStatus>('running');
}

async function render(status: RunStatus) {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.status.set(status);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('StatusBadge', () => {
  it('labels every run status the machine can produce', async () => {
    for (const status of RUN_STATUSES) {
      const el = await render(status);
      expect(el.textContent?.trim()).toBe(status);
    }
  });

  it('pulses while the run is still in flight', async () => {
    const el = await render('retrying');

    expect(el.querySelector('[aria-hidden="true"]')?.classList).toContain('animate-pulse');
  });

  it('holds steady once the run reaches a terminal status', async () => {
    const el = await render('succeeded');

    expect(el.querySelector('[aria-hidden="true"]')?.classList).not.toContain('animate-pulse');
  });
});
