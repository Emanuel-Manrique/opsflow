import { isRunStatus } from '@opsflow/domain';
import { PAGE_SIZE_DEFAULT, clampPage, clampPageSize } from '../http/pagination';
import type { RawQueryParams } from '../workflows/workflow.types';
import type { RunListQuery, RunListSort } from './run.types';

export const DEFAULT_RUN_SORT: RunListSort = '-createdAt';
export const RUN_SORTS = ['createdAt', '-createdAt'] as const satisfies readonly RunListSort[];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRunSort(value: string): value is RunListSort {
  return (RUN_SORTS as readonly string[]).includes(value);
}

function text(params: RawQueryParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseRunListQuery(params: RawQueryParams): RunListQuery {
  const status = text(params, 'status');
  const workflowId = text(params, 'workflowId');
  const sort = text(params, 'sort');
  const p1 = { status: status && isRunStatus(status) ? status : undefined };
  const p2 = { workflowId: workflowId && UUID.test(workflowId) ? workflowId : undefined };
  const p3 = { sort: sort && isRunSort(sort) ? sort : DEFAULT_RUN_SORT };
  const p4 = { page: clampPage(Number(text(params, 'page') ?? 1)), pageSize: clampPageSize(Number(text(params, 'pageSize') ?? PAGE_SIZE_DEFAULT)) };
  return { ...p1, ...p2, ...p3, ...p4 };
}

export function serializeRunListQuery(query: RunListQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.status) params['status'] = query.status;
  if (query.workflowId) params['workflowId'] = query.workflowId;
  if (query.sort !== DEFAULT_RUN_SORT) params['sort'] = query.sort;
  if (query.page !== 1) params['page'] = String(query.page);
  if (query.pageSize !== PAGE_SIZE_DEFAULT) params['pageSize'] = String(query.pageSize);
  return params;
}

export function hasActiveRunFilters(query: RunListQuery): boolean {
  return Boolean(query.status) || Boolean(query.workflowId);
}
