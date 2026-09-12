import { isActionType } from '@opsflow/domain';
import { PAGE_SIZE_DEFAULT, clampPage } from '../http/pagination';
import { clampPageSize } from '../http/pagination';
import type { RawQueryParams, WorkflowListQuery } from './workflow.types';
import type { WorkflowSort } from './workflow.types';

export const WORKFLOW_SORTS = ['name', '-name', 'updatedAt', '-updatedAt'] as const;

export const DEFAULT_WORKFLOW_SORT: WorkflowSort = 'name';

function isWorkflowSort(value: string): value is WorkflowSort {
  return (WORKFLOW_SORTS as readonly string[]).includes(value);
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

export function parseWorkflowListQuery(params: RawQueryParams): WorkflowListQuery {
  const text = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  };
  const q = text('q')?.trim();
  const actionType = text('actionType');
  const sort = text('sort');

  const p1 = { q: q ? q : undefined, enabled: parseBoolean(text('enabled')) };
  const p2 = { actionType: actionType && isActionType(actionType) ? actionType : undefined };
  const p3 = { sort: sort && isWorkflowSort(sort) ? sort : DEFAULT_WORKFLOW_SORT };
  const p4 = { page: clampPage(Number(text('page') ?? 1)), pageSize: clampPageSize(Number(text('pageSize') ?? PAGE_SIZE_DEFAULT)) };
  return { ...p1, ...p2, ...p3, ...p4 };
}

export function serializeWorkflowListQuery(query: WorkflowListQuery): Record<string, string> {
  const params: Record<string, string> = {};

  if (query.q) {
    params['q'] = query.q;
  }

  if (query.enabled !== undefined) {
    params['enabled'] = String(query.enabled);
  }

  if (query.actionType) {
    params['actionType'] = query.actionType;
  }

  if (query.sort !== DEFAULT_WORKFLOW_SORT) {
    params['sort'] = query.sort;
  }

  if (query.page !== 1) {
    params['page'] = String(query.page);
  }

  if (query.pageSize !== PAGE_SIZE_DEFAULT) {
    params['pageSize'] = String(query.pageSize);
  }

  return params;
}

export function hasActiveFilters(query: WorkflowListQuery): boolean {
  return Boolean(query.q) || query.enabled !== undefined || Boolean(query.actionType);
}
