import { ACTION_URL_MAX_LENGTH } from '@opsflow/domain';
import type { Action } from '@opsflow/domain';
import type { CreateWorkflowRequest } from './workflow.types';

export const WORKFLOW_LIMITS = {
  nameMaxLength: 120,
  urlMaxLength: ACTION_URL_MAX_LENGTH,
  cronMaxLength: 200,
  timezoneMaxLength: 64,
} as const;

export function toWorkflowAction(input: CreateWorkflowRequest): Action | null {
  if (input.actionType === 'noop') return { type: 'noop' };
  if (input.actionType === 'webhook' && input.webhook) {
    return { type: 'webhook', url: input.webhook.url, method: input.webhook.method };
  }
  return null;
}
