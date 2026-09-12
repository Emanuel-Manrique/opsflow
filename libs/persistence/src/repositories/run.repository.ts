import type { RunRow } from '../schema/schema.types';
import type { DataSource } from 'typeorm';
import type { Page, RunDto, RunListQuery, TenantContext } from '@opsflow/contracts';
import { isRetryableRun } from '@opsflow/domain';
import type { Action, RunStatus } from '@opsflow/domain';
import { createExecution, createExecutionFromSnapshot } from './create-execution';
import { NotFoundInTenantError, RunNotFoundError, RunStateError } from '../errors';
import { WorkflowEntity } from '../schema/workflow';
import { RunEntity } from '../schema/run';
import { sqlMachine } from '../schema/sql';
import type { FinishEvent, PendingExecution, RunStateRow } from './execution.types';
import { RunEventRepository } from './run-event.repository';
import { audit } from './audit';
import { totalPages } from '@opsflow/contracts';

const start = sqlMachine('start');
const cancel = sqlMachine('cancel');
const succeed = sqlMachine('succeed');
const fail = sqlMachine('fail');
const backoff = sqlMachine('backoff');
const exhaust = sqlMachine('exhaust');
const finishMachines = { succeed, fail, backoff } as const;

function toRunDto(row: RunRow): RunDto {
  if (!row.workflow) {
    throw new Error(`Run ${row.id} was loaded without its workflow`);
  }

  const p1 = { id: row.id, workflowId: row.workflowId, workflowName: row.workflow.name };
  const p2 = { status: row.status, error: row.errorMessage, createdAt: row.createdAt.toISOString() };
  const p3 = { startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null };
  return { ...p1, ...p2, ...p3, attempt: row.attempt, retryOf: row.retryOf, scheduledFor: row.scheduledFor?.toISOString() ?? null };
}

export class RunRepository {
  constructor(private readonly dataSource: DataSource) {}

  async create(context: TenantContext, workflowId: string, action?: Action): Promise<RunDto> {
    const tenantId = context.tenantId;
    return this.dataSource.transaction(async (manager) => {
      const where = { id: workflowId, tenantId };
      const lock = { mode: 'pessimistic_read' as const };
      const workflow = await manager.findOne(WorkflowEntity, { where, lock });
      if (!workflow) throw new NotFoundInTenantError(workflowId);
      const id = await createExecution(manager, workflow, null, context, action);
      if (!id) throw new Error('Could not allocate a run id');
      await audit(manager, context, 'run.started', id);
      const row = await manager.findOneByOrFail(RunEntity, { id, tenantId });
      row.workflow = workflow;
      return toRunDto(row);
    });
  }

  async findById(context: TenantContext, id: string): Promise<RunDto> {
    const where = { id, tenantId: context.tenantId };
    const options = { where, relations: { workflow: true } };
    const row = await this.repository().findOne(options);

    if (!row) {
      throw new RunNotFoundError(id);
    }

    return toRunDto(row);
  }

  async list(context: TenantContext, query: RunListQuery): Promise<Page<RunDto>> {
    const tenantId = context.tenantId;
    const offset = (query.page - 1) * query.pageSize;
    const builder = this.repository().createQueryBuilder('run').innerJoinAndSelect('run.workflow', 'workflow');
    builder.where('run.tenantId = :tenantId', { tenantId });
    if (query.status) builder.andWhere('run.status = :status', { status: query.status });
    if (query.workflowId) builder.andWhere('run.workflowId = :workflowId', { workflowId: query.workflowId });
    const direction = query.sort === 'createdAt' ? 'ASC' : 'DESC';
    const [rows, total] = await builder
      .orderBy('run.createdAt', direction)
      .addOrderBy('run.id', direction)
      .skip(offset)
      .take(query.pageSize)
      .getManyAndCount();
    const p1 = { items: rows.map(toRunDto), page: query.page, pageSize: query.pageSize };
    return { ...p1, total, totalPages: totalPages(total, query.pageSize) };
  }

  async markRunning(context: TenantContext, id: string, attempt: number): Promise<boolean> {
    // attempt < $3 is the delivery fence: the first worker to raise attempt wins; a late replica is a no-op.
    const rows = await this.dataSource.query<RunStateRow[]>(`
      WITH changed AS (UPDATE runs SET status = ${start.status},
        attempt = $3, started_at = COALESCE(started_at, clock_timestamp()), error_message = NULL
      WHERE id = $1 AND tenant_id = $2 AND attempt < $3
        AND status IN (${start.sources}) RETURNING status)
      SELECT status FROM changed
    `, [id, context.tenantId, attempt]);
    return rows.length === 1;
  }

  async cancel(context: TenantContext, id: string): Promise<RunDto> {
    const tenantId = context.tenantId;
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<RunStateRow[]>(`
        WITH changed AS (UPDATE runs SET
          status = ${cancel.status},
          error_message = NULL,
          finished_at = ${cancel.finishedAt}
        WHERE id = $1 AND tenant_id = $2 AND status IN (${cancel.sources})
        RETURNING status)
        SELECT status FROM changed
      `, [id, context.tenantId]);
      const row = await manager.findOne(RunEntity, { where: { id, tenantId }, relations: { workflow: true } });
      if (!row) throw new RunNotFoundError(id);
      const run = toRunDto(row);
      if (!rows.length && run.status !== 'cancelled' && run.status !== 'cancelling') {
        throw new RunStateError(id, 'cancellable');
      }
      if (rows.length) await audit(manager, context, 'run.cancel_requested', id);
      if (rows.length && run.status === 'cancelled') {
        const event = { runId: id, type: 'run.cancelled' as const, attempt: run.attempt };
        await new RunEventRepository(this.dataSource).append(context, event, manager);
      }
      return run;
    });
  }

  isCancellationRequested(context: TenantContext, id: string): Promise<boolean> {
    const where = { id, tenantId: context.tenantId, status: 'cancelling' as const };
    return this.repository().existsBy(where);
  }

  markSucceeded(context: TenantContext, id: string, attempt: number): Promise<RunStatus> {
    return this.finish(context, id, 'succeed', null, attempt);
  }

  markFailed(context: TenantContext, id: string, errorMessage: string, attempt: number, retry = false): Promise<RunStatus> {
    return this.finish(context, id, retry ? 'backoff' : 'fail', errorMessage, attempt);
  }

  async reconcileFailure(context: TenantContext, id: string, attempt: number, message: string): Promise<void> {
    // Also closes a run when BullMQ exhausts stalled deliveries before invoking the handler.
    await this.dataSource.query(`
      UPDATE runs SET status = ${exhaust.status},
        started_at = COALESCE(started_at, clock_timestamp()), finished_at = ${exhaust.finishedAt},
        error_message = ${exhaust.error}
      WHERE id = $1 AND tenant_id = $2 AND attempt <= $3
        AND status IN (${exhaust.sources})
    `, [id, context.tenantId, attempt, message]);
  }

  async retry(context: TenantContext, id: string): Promise<RunDto> {
    const tenantId = context.tenantId;
    return this.dataSource.transaction(async (manager) => {
      const where = { id, tenantId };
      const lock = { mode: 'pessimistic_write' as const };
      const original = await manager.findOne(RunEntity, { where, lock });
      if (!original) throw new RunNotFoundError(id);
      if (!isRetryableRun(original.status)) throw new RunStateError(id, 'failed');
      const prior = await manager.findOneBy(RunEntity, { tenantId, retryOf: id });
      if (prior) {
        prior.workflow = await manager.findOneByOrFail(WorkflowEntity, { id: prior.workflowId, tenantId });
        return toRunDto(prior);
      }
      const [snapshot] = await manager.query<Pick<PendingExecution, 'action'>[]>(`
        SELECT action FROM execution_outbox WHERE run_id = $1 AND tenant_id = $2
      `, [id, tenantId]);
      if (!snapshot) throw new RunStateError(id, 'replayable');
      const p1 = { tenantId, workflowId: original.workflowId, action: snapshot.action };
      const p2 = { retryOf: id, scheduledFor: null, context };
      const newId = await createExecutionFromSnapshot(manager, { ...p1, ...p2 });
      if (!newId) throw new Error('Could not allocate a run id');
      await audit(manager, context, 'run.retried', newId);
      const workflow = await manager.findOneByOrFail(WorkflowEntity, { id: original.workflowId, tenantId });
      const row = await manager.findOneByOrFail(RunEntity, { id: newId, tenantId });
      row.workflow = workflow;
      return toRunDto(row);
    });
  }

  private repository() {
    return this.dataSource.getRepository(RunEntity);
  }

  private async finish(context: TenantContext, id: string, event: FinishEvent, error: string | null, attempt: number): Promise<RunStatus> {
    // first write wins: complete vs cancel
    const machine = finishMachines[event];
    const values = [id, context.tenantId, attempt, error];
    const [row] = await this.dataSource.query<RunStateRow[]>(`
      WITH changed AS (UPDATE runs SET
        status = ${machine.status},
        error_message = ${machine.error},
        finished_at = ${machine.finishedAt}
      WHERE id = $1 AND tenant_id = $2 AND attempt = $3 AND status IN (${machine.sources})
      RETURNING status)
      SELECT status FROM changed
    `, values);
    if (!row) throw new RunStateError(id, 'running');
    return row.status;
  }
}
