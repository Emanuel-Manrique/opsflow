import type { WorkflowDto } from '@opsflow/contracts';
import { isHttpMethod } from '@opsflow/domain';
import type { Action } from '@opsflow/domain';
import type { WorkflowRow } from '../schema/schema.types';

function toAction(row: WorkflowRow): Action {
  if (row.actionType === 'noop') {
    return { type: 'noop' };
  }

  const config = row.actionConfig;
  const url = config['url'];
  const method = config['method'];
  if (typeof url !== 'string' || typeof method !== 'string' || !isHttpMethod(method)) {
    throw new Error(`Workflow ${row.id} has invalid webhook configuration`);
  }

  return { type: 'webhook', url, method };
}

export function toWorkflowDto(row: WorkflowRow): WorkflowDto {
  const p1 = { id: row.id, name: row.name, enabled: row.enabled };
  const p2 = { cronExpr: row.cronExpr, timezone: row.timezone, action: toAction(row) };
  const p3 = { createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  return { ...p1, ...p2, ...p3, nextRunAt: row.nextRunAt?.toISOString() ?? null };
}

export function toActionConfig(action: Action): Record<string, unknown> {
  if (action.type === 'noop') return {};
  return { url: action.url, method: action.method };
}
