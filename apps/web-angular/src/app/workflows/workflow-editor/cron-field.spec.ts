import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CronField } from './cron-field';

@Component({
  imports: [CronField],
  template: `<ops-cron-field [(value)]="expression" [invalid]="invalid()" />`,
})
class Host {
  readonly expression = signal('0 3 * * *');
  readonly invalid = signal(false);
}

async function render(mutate?: (host: Host) => void) {
  const fixture = TestBed.createComponent(Host);
  mutate?.(fixture.componentInstance);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;

  const p1 = { host: fixture.componentInstance, element };
  const p2 = { input: element.querySelector('input[type="text"]') as HTMLInputElement };
  const p3 = { summary: () => element.querySelector('[role="status"]')?.textContent?.trim() ?? '' };
  return { ...p1, ...p2, ...p3, settle: () => fixture.whenStable() };
}

describe('CronField', () => {
  it('reports user input through its value model', async () => {
    const view = await render();

    view.input.value = '*/15 * * * *';
    view.input.dispatchEvent(new Event('input'));
    await view.settle();

    expect(view.host.expression()).toBe('*/15 * * * *');
  });

  it('builds a weekday schedule with the chosen time', async () => {
    const view = await render();
    const repeat = view.element.querySelector('select')!;
    repeat.value = 'weekdays';
    repeat.dispatchEvent(new Event('change'));
    await view.settle();
    const time = view.element.querySelector('input[type="time"]') as HTMLInputElement;
    time.value = '08:45';
    time.dispatchEvent(new Event('input'));
    await view.settle();
    expect(view.host.expression()).toBe('45 8 * * 1-5');
    expect(view.element.textContent).toContain('Monday–Friday at 08:45');
  });

  it('recognizes a valid expression', async () => {
    const view = await render((host) => host.expression.set('30 8 * * 1-5'));

    expect(view.summary()).toBe('Valid schedule.');
  });

  it.each(['nope', '*/5 * * * * *'])('does not describe invalid expression %s', async (expression) => {
    const view = await render((host) => host.expression.set(expression));

    expect(view.summary()).toBe('Not a schedule we can read yet.');
  });

  it('exposes invalid state and links the accessible description', async () => {
    const view = await render((host) => host.invalid.set(true));
    const describedBy = view.input.getAttribute('aria-describedby');

    expect(view.input.getAttribute('aria-invalid')).toBe('true');
    expect(view.element.querySelector(`#${describedBy}`)).not.toBeNull();
  });
});
