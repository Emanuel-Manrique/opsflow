import type { CreateWorkflowRequest, Page, TenantContext } from '@opsflow/contracts';
import type { WorkflowDto, WorkflowListQuery } from '@opsflow/contracts';
import { toWorkflowAction } from '@opsflow/contracts';
import { validateAction, validateSchedule } from '@opsflow/domain';
import type { ActionProblem, ScheduleProblem } from '@opsflow/domain';
import type { WorkflowWrite } from '@opsflow/persistence';
import { WorkflowRepository } from '@opsflow/persistence';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';

@Injectable()
export class WorkflowsService {
  constructor(private readonly workflows: WorkflowRepository) {}

  list(context: TenantContext, query: WorkflowListQuery): Promise<Page<WorkflowDto>> {
    return this.workflows.list(context, query);
  }

  findById(context: TenantContext, id: string): Promise<WorkflowDto> {
    return this.workflows.findById(context, id);
  }

  async create(context: TenantContext, input: CreateWorkflowRequest): Promise<WorkflowDto> {
    this.assertScheduleIsUsable(input.cronExpr, input.timezone);
    return this.workflows.create(context, this.toWrite(input));
  }

  async update(context: TenantContext, id: string, input: CreateWorkflowRequest): Promise<WorkflowDto> {
    this.assertScheduleIsUsable(input.cronExpr, input.timezone);
    return this.workflows.update(context, id, this.toWrite(input));
  }

  remove(context: TenantContext, id: string): Promise<void> {
    return this.workflows.remove(context, id);
  }

  private toWrite(input: CreateWorkflowRequest): WorkflowWrite {
    const action = toWorkflowAction(input);
    if (!action) {
      this.reject([{ field: 'url', message: 'A webhook URL is required.' }]);
    }
    const problems = validateAction(action);
    if (problems.length > 0) this.reject(problems);
    const p1 = { name: input.name, enabled: input.enabled, cronExpr: input.cronExpr, timezone: input.timezone };
    return { ...p1, action };
  }

  private assertScheduleIsUsable(cronExpr: string, timezone: string): void {
    const problems = validateSchedule(cronExpr, timezone);
    if (problems.length > 0) this.reject(problems);
  }

  private reject(problems: readonly (ScheduleProblem | ActionProblem)[]): never {
    const errors: Record<string, string[]> = {};
    for (const problem of problems) {
      errors[problem.field] = [...(errors[problem.field] ?? []), problem.message];
    }
    throw new UnprocessableEntityException({ type: 'validation_failed', errors });
  }
}
