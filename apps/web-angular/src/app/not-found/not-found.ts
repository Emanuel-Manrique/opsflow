import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '@opsflow/ui';

@Component({
  selector: 'ops-not-found',
  imports: [EmptyState, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Page not found</h1>
    <ops-empty-state
      heading="That page does not exist"
      description="The link may be out of date, or the workflow it pointed at may have been deleted."
    >
      <a routerLink="/workflows">Back to workflows</a>
    </ops-empty-state>
  `,
})
export class NotFound {}
