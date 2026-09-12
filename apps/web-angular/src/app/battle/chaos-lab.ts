import { ChangeDetectionStrategy, Component, DestroyRef } from '@angular/core';
import { computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ApiProblem, ChaosScenario, RunDto, WorkflowDto } from '@opsflow/contracts';
import { toProblem } from '../core/http/interceptors';
import { Session } from '../core/session';
import { WorkflowsApi } from '../workflows/data/workflows-api';
import { chaosScenarioList } from '@opsflow/contracts';

@Component({
  selector: 'ops-chaos-lab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chaos-lab.html',
  host: { class: 'block min-w-0' },
})
export class ChaosLab {
  readonly target = input<WorkflowDto | undefined>();
  readonly busy = input(false);
  readonly injected = output<RunDto>();
  readonly recovered = output<void>();

  private readonly api = inject(WorkflowsApi);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly session = inject(Session);
  protected readonly running = signal<string | undefined>(undefined);
  protected readonly problem = signal<ApiProblem | undefined>(undefined);

  protected readonly scenarios = chaosScenarioList();
  protected readonly allowed = computed(() => this.session.canOperate() && !!this.target());

  protected inject(id: ChaosScenario): void {
    const target = this.target();
    if (!this.allowed() || !target || this.busy() || this.running()) return;
    this.running.set(id);
    this.problem.set(undefined);
    const done = () => this.running.set(undefined);
    const next = (run: RunDto) => {
      done();
      this.injected.emit(run);
    };
    const error = (failure: unknown) => {
      done();
      this.problem.set(toProblem(failure));
    };
    this.api.runNow(target.id, { scenario: id }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next, error });
  }
}
