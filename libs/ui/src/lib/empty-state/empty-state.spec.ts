import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `
    <ops-empty-state [heading]="heading" [description]="description">
      <button type="button">Clear filters</button>
    </ops-empty-state>
  `,
})
class Host {
  heading = 'No runs match these filters';
  description: string | undefined = 'Try widening the date range.';
}

async function render(mutate?: (host: Host) => void) {
  const fixture = TestBed.createComponent(Host);
  mutate?.(fixture.componentInstance);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('EmptyState', () => {
  it('announces its content and recovery action', async () => {
    const el = await render();
    const paragraphs = el.querySelectorAll('[role="status"] > p');

    expect(paragraphs[0].textContent).toContain('No runs match these filters');
    expect(paragraphs[1].textContent).toContain('Try widening the date range.');
    expect(el.querySelector('[role="status"] button')?.textContent).toContain('Clear filters');
  });

  it('omits the description entirely when none is given', async () => {
    const el = await render((host) => (host.description = undefined));

    expect(el.querySelectorAll('[role="status"] > p')).toHaveLength(1);
  });
});
