import { describeCron } from '@opsflow/domain';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { inject } from '@angular/core';
import { Session } from '../core/session';
import type { WorkflowDto } from '@opsflow/contracts';

@Component({
  selector: 'ops-workflow-sidebar',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './workflow-sidebar.html',
  host: { class: 'block h-full min-w-0' },
})
export class WorkflowSidebar {
  protected readonly describeCron = describeCron;
  readonly workflows = input.required<readonly WorkflowDto[]>();
  readonly selectedId = input<string | undefined>(undefined);
  readonly loading = input(false);
  readonly select = output<WorkflowDto>();

  protected readonly session = inject(Session);
  protected readonly search = signal('');

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.workflows();
    return this.workflows().filter((workflow) => workflow.name.toLowerCase().includes(term));
  });

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }
}
