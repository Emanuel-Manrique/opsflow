import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { Action } from '@opsflow/domain';
import type { WorkflowRow } from '../schema/schema.types';
import type { InsertedRun, NewExecution } from './execution.types';
import { toWorkflowDto } from './workflow.mapper';

const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;

/**
 * The trace id out of a W3C traceparent. Run events carry the OpenTelemetry id, not
 * the request id, so a row in the console and a span in the collector are the same
 * lookup. Persistence cannot reach the observability lib, hence the local parse.
 */
function traceIdOf(traceparent: string | undefined): string | null {
  return TRACEPARENT.exec(traceparent ?? '')?.[1] ?? null;
}

export async function createExecution(manager: EntityManager, workflow: WorkflowRow, scheduledFor: Date | null, context: NewExecution['context'] = {}, action?: Action): Promise<string | undefined> {
  const p1 = { tenantId: workflow.tenantId, workflowId: workflow.id, action: action ?? toWorkflowDto(workflow).action };
  const p2 = { retryOf: null, scheduledFor, context };
  return createExecutionFromSnapshot(manager, { ...p1, ...p2 });
}

export async function createExecutionFromSnapshot(manager: EntityManager, input: NewExecution): Promise<string | undefined> {
  const id = randomUUID();
  const occurrence = input.scheduledFor?.toISOString();
  const key = occurrence ? `scheduled:${input.workflowId}:${occurrence}` : id;
  const values = [id, input.tenantId, input.workflowId, key, input.scheduledFor, input.retryOf];
  const rows = await manager.query<InsertedRun[]>(`
    INSERT INTO runs (id, tenant_id, workflow_id, idempotency_key, scheduled_for, retry_of)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id
  `, values);
  if (rows.length === 0) return undefined;

  const payload = [id, input.tenantId, JSON.stringify(input.action), input.context.traceparent ?? null, input.context.traceId ?? null];
  await manager.query(`
    INSERT INTO execution_outbox (run_id, tenant_id, action, traceparent, request_id) VALUES ($1, $2, $3::jsonb, $4, $5)
  `, payload);
  // Same transaction as the run and its outbox row: a run that exists has a start event.
  const trace = [input.tenantId, id, input.workflowId, traceIdOf(input.context.traceparent)];
  await manager.query(`
    INSERT INTO run_events (tenant_id, run_id, workflow_id, type, trace_id) VALUES ($1, $2, $3, 'run.started', $4)
  `, trace);
  return id;
}
