import { toSignal } from '@angular/core/rxjs-interop';
import { map, timer } from 'rxjs';
import { RUN_ATTEMPTS, RUN_QUEUE } from '@opsflow/contracts';
import type { WorkflowDto } from '@opsflow/contracts';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ApiProblem, RunDto, RunEventDto } from '@opsflow/contracts';
import { describeCron, describeTimezone, isCancellableRun, isRetryableRun } from '@opsflow/domain';
import { StatusBadge } from '@opsflow/ui';
import { Session } from '../core/session';

@Component({
  selector: 'ops-run-inspector',
  imports: [DatePipe, RouterLink, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-inspector.html',
  host: { class: 'block min-w-0' },
})
export class RunInspector {
  readonly workflow = input<WorkflowDto>();
  readonly run = input.required<RunDto>();
  readonly events = input<readonly RunEventDto[]>([]);
  readonly busy = input(false);
  readonly problem = input<ApiProblem | undefined>(undefined);
  readonly retry = output<string>();
  readonly cancel = output<string>();

  protected readonly describeCron = describeCron;
  protected readonly describeTimezone = describeTimezone;
  protected readonly recovered = computed(() => this.run().status === 'succeeded' && this.run().attempt > 1);
  protected readonly maxAttempts = RUN_ATTEMPTS;
  protected readonly queue = RUN_QUEUE;
  private readonly now = toSignal(timer(0, 1_000).pipe(map(() => Date.now())), { initialValue: Date.now() });
  protected readonly backoff = computed(() => [...this.events()].reverse().find((event) => event.type === 'retry.scheduled')?.detail);
  protected readonly session = inject(Session);

  protected readonly shortId = computed(() => this.run().id.slice(0, 8));
  protected readonly traceId = computed(() => this.events().find((event) => event.traceId)?.traceId ?? null);
  /** Only ever enabled when the run machine and the role both allow it. */
  protected readonly canCancel = computed(() => this.session.canOperate() && isCancellableRun(this.run().status));
  protected readonly canRetry = computed(() => this.session.canOperate() && isRetryableRun(this.run().status));

  protected readonly duration = computed(() => {
    const run = this.run();
    if (!run.startedAt) return null;
    const end = run.finishedAt ? Date.parse(run.finishedAt) : this.now();
    const seconds = Math.max(0, Math.round((end - Date.parse(run.startedAt)) / 1_000));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  });

  protected readonly lastError = computed(() => {
    return this.run().status === 'succeeded' ? null : this.run().error;
  });
}
