import type { WorkflowRow } from '../schema/schema.types';
import type { DataSource, SelectQueryBuilder } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { nextRuns } from '@opsflow/domain';
import type { DatabaseClock } from './execution.types';
import type { Page, WorkflowDto, WorkflowListQuery, WorkflowSort } from '@opsflow/contracts';
import type { TenantContext } from '@opsflow/contracts';
import { totalPages } from '@opsflow/contracts';
import { NameTakenError, NotFoundInTenantError, UnknownTenantError } from '../errors';
import { WorkflowEntity } from '../schema/workflow';
import { toActionConfig, toWorkflowDto } from './workflow.mapper';
import type { WorkflowWrite } from './workflow.types';
import { audit } from './audit';

const UNIQUE_VIOLATION = '23505';
const LIKE_WILDCARDS = /[\\%_]/g;
const FOREIGN_KEY_VIOLATION = '23503';

const ORDER_BY = {
  name: ['LOWER(workflow.name)', 'ASC'],
  '-name': ['LOWER(workflow.name)', 'DESC'],
  updatedAt: ['workflow.updatedAt', 'ASC'],
  '-updatedAt': ['workflow.updatedAt', 'DESC'],
} as const satisfies Record<WorkflowSort, readonly [string, 'ASC' | 'DESC']>;

function likeContains(term: string): string {
  return `%${term.replace(LIKE_WILDCARDS, String.raw`\$&`)}%`;
}

function isPgError(error: unknown, code: string, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ('code' in error && error.code === code && 'constraint' in error && error.constraint === constraint) return true;
  return 'driverError' in error && isPgError(error.driverError, code, constraint);
}

export class WorkflowRepository {
  constructor(private readonly dataSource: DataSource) {}

  async list(context: TenantContext, query: WorkflowListQuery): Promise<Page<WorkflowDto>> {
    const tenantId = context.tenantId;
    const offset = (query.page - 1) * query.pageSize;
    const builder = this.repository().createQueryBuilder('workflow');

    builder.where('workflow.tenantId = :tenantId', { tenantId });
    this.applyFilters(builder, query);

    const [column, direction] = ORDER_BY[query.sort];
    const [rows, total] = await builder
      .orderBy(column, direction)
      .addOrderBy('workflow.id', direction)
      .skip(offset)
      .take(query.pageSize)
      .getManyAndCount();

    const p1 = { items: rows.map(toWorkflowDto), page: query.page, pageSize: query.pageSize };
    const p2 = { total, totalPages: totalPages(total, query.pageSize) };
    return { ...p1, ...p2 };
  }

  async findById(context: TenantContext, id: string): Promise<WorkflowDto> {
    const row = await this.findEntity(id, context.tenantId);
    return toWorkflowDto(row);
  }

  async create(context: TenantContext, input: WorkflowWrite): Promise<WorkflowDto> {
    const p1 = { tenantId: context.tenantId, name: input.name.trim() };
    const p2 = { enabled: input.enabled, cronExpr: input.cronExpr.trim() };
    const p3 = { timezone: input.timezone.trim(), actionType: input.action.type };
    const nextRunAt = await this.nextRunAt(input, this.dataSource.manager);
    const p4 = { actionConfig: toActionConfig(input.action), nextRunAt };
    const row = this.repository().create({ ...p1, ...p2, ...p3, ...p4 });

    try {
      return await this.dataSource.transaction(async (manager) => {
        const created = await manager.save(WorkflowEntity, row);
        await audit(manager, context, 'workflow.created', created.id);
        return toWorkflowDto(created);
      });
    } catch (error) {
      throw this.translateWriteError(error, input.name);
    }
  }

  async update(context: TenantContext, id: string, input: WorkflowWrite): Promise<WorkflowDto> {
    const tenantId = context.tenantId;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const where = { id, tenantId };
        const lock = { mode: 'pessimistic_write' as const };
        const row = await manager.findOne(WorkflowEntity, { where, lock });
        if (!row) throw new NotFoundInTenantError(id);
        const enabledChanged = row.enabled !== input.enabled;
        const cronExpr = input.cronExpr.trim();
        const timezone = input.timezone.trim();
        if (row.enabled !== input.enabled || row.cronExpr !== cronExpr || row.timezone !== timezone) {
          row.nextRunAt = await this.nextRunAt(input, manager);
        }
        row.name = input.name.trim();
        row.enabled = input.enabled;
        row.cronExpr = cronExpr;
        row.timezone = timezone;
        row.actionType = input.action.type;
        row.actionConfig = toActionConfig(input.action);
        const updated = await manager.save(WorkflowEntity, row);
        await audit(manager, context, 'workflow.updated', id);
        if (enabledChanged) await audit(manager, context, input.enabled ? 'workflow.enabled' : 'workflow.disabled', id);
        return toWorkflowDto(updated);
      });
    } catch (error) {
      throw this.translateWriteError(error, input.name);
    }
  }

  async remove(context: TenantContext, id: string): Promise<void> {
    const tenantId = context.tenantId;
    await this.dataSource.transaction(async (manager) => {
      const where = { id, tenantId };
      const lock = { mode: 'pessimistic_write' as const };
      const row = await manager.findOne(WorkflowEntity, { where, lock });
      if (!row) throw new NotFoundInTenantError(id);
      await audit(manager, context, 'workflow.deleted', id);
      await manager.remove(WorkflowEntity, row);
    });
  }

  private repository() {
    return this.dataSource.getRepository(WorkflowEntity);
  }

  private async nextRunAt(input: WorkflowWrite, manager: EntityManager): Promise<Date | null> {
    if (!input.enabled) return null;
    const [clock] = await manager.query<DatabaseClock[]>('SELECT now() AS now');
    const args = [input.cronExpr, input.timezone, 1, clock.now] as const;
    return nextRuns(...args)[0];
  }

  private applyFilters(
    builder: SelectQueryBuilder<WorkflowRow>,
    query: WorkflowListQuery
  ): void {
    if (query.enabled !== undefined) {
      builder.andWhere('workflow.enabled = :enabled', { enabled: query.enabled });
    }

    if (query.actionType) {
      builder.andWhere('workflow.actionType = :actionType', { actionType: query.actionType });
    }

    if (query.q) {
      builder.andWhere('workflow.name ILIKE :q', { q: likeContains(query.q) });
    }
  }

  private async findEntity(id: string, tenantId: string): Promise<WorkflowRow> {
    const row = await this.repository().findOneBy({ id, tenantId });

    if (!row) {
      throw new NotFoundInTenantError(id);
    }

    return row;
  }

  private translateWriteError(error: unknown, workflowName: string): unknown {
    if (isPgError(error, UNIQUE_VIOLATION, 'uq_workflows_tenant_name')) {
      return new NameTakenError(workflowName);
    }

    if (isPgError(error, FOREIGN_KEY_VIOLATION, 'workflows_tenant_id_fkey')) {
      return new UnknownTenantError();
    }

    return error;
  }
}
