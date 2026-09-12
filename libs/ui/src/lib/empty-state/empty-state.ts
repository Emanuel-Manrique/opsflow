import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ops-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './empty-state.html',
  host: { class: 'block' },
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly description = input<string>();
}
