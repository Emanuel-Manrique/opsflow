import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { RunEventType } from '@opsflow/contracts';
import type { EventFilter, TimelineRow, TimelineTone } from './domain/battle-timeline.types';

const DOT: Record<TimelineTone, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const TEXT: Record<TimelineTone, string> = {
  neutral: 'text-muted',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};


const LIFECYCLE: readonly RunEventType[] = ['run.started', 'run.succeeded', 'run.failed', 'run.cancelled', 'attempt.started'];

@Component({
  selector: 'ops-event-stream',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-stream.html',
  host: { class: 'block min-w-0' },
})
export class EventStream {
  readonly rows = input.required<readonly TimelineRow[]>();
  readonly live = input(false);

  protected readonly filter = signal<EventFilter>('all');
  protected readonly filters = ['all', 'failures', 'http', 'lifecycle'] as const;

  protected readonly visible = computed(() => {
    const rows = this.rows();
    switch (this.filter()) {
      case 'failures':
        return rows.filter((row) => row.tone === 'danger' || row.tone === 'warning');
      case 'http':
        return rows.filter((row) => row.type.startsWith('http.'));
      case 'lifecycle':
        return rows.filter((row) => LIFECYCLE.includes(row.type));
      default:
        return rows;
    }
  });

  protected dot(row: TimelineRow): string {
    return DOT[row.tone];
  }

  protected text(row: TimelineRow): string {
    return TEXT[row.tone];
  }

  protected select(event: Event): void {
    this.filter.set((event.target as HTMLSelectElement).value as EventFilter);
  }
}
