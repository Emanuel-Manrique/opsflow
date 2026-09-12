import { ACTION_TYPES, HTTP_METHODS } from '@opsflow/domain';
import { EntitySchema } from 'typeorm';
import { WORKFLOW_LIMITS } from '@opsflow/contracts';
import type { WorkflowRow } from './schema.types';
import { sqlLiterals } from './sql';

const actionTypes = sqlLiterals(ACTION_TYPES);
const httpMethods = sqlLiterals(HTTP_METHODS);
const webhookShape = `(action_type = 'webhook' AND action_config ? 'url' AND jsonb_typeof(action_config -> 'url') = 'string' AND action_config ? 'method' AND action_config ->> 'method' IN (${httpMethods}))`;

export const WorkflowEntity = new EntitySchema<WorkflowRow>({
  name: 'WorkflowEntity',
  tableName: 'workflows',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid', default: () => 'gen_random_uuid()' },
    tenantId: { type: 'uuid', name: 'tenant_id' },
    name: { type: 'text' },
    enabled: { type: 'boolean', default: false },
    nextRunAt: { type: 'timestamptz', name: 'next_run_at', nullable: true },
    cronExpr: { type: 'text', name: 'cron_expr' },
    timezone: { type: 'text', default: 'UTC' },
    actionType: { type: 'text', name: 'action_type' },
    actionConfig: { type: 'jsonb', name: 'action_config', default: () => "'{}'::jsonb" },
    createdAt: { type: 'timestamptz', name: 'created_at', createDate: true, default: () => 'now()' },
    updatedAt: { type: 'timestamptz', name: 'updated_at', updateDate: true, default: () => 'now()' },
  },
  foreignKeys: [
    { name: 'workflows_tenant_id_fkey', target: 'TenantEntity', columnNames: ['tenantId'], referencedColumnNames: ['id'], onDelete: 'CASCADE' },
  ],
  uniques: [{ name: 'uq_workflows_tenant_id', columns: ['tenantId', 'id'] }],
  indices: [
    // SQL expression and DESC ordering are maintained by migrations.
    // UNIQUE (tenant_id, lower(name))
    { name: 'uq_workflows_tenant_name', synchronize: false },
    // (tenant_id, updated_at DESC, id DESC)
    { name: 'ix_workflows_tenant_updated_at', synchronize: false },
    { name: 'ix_workflows_due', columns: ['nextRunAt', 'id'], where: 'enabled' },
  ],
  checks: [
    { name: 'ck_workflows_name_not_blank', expression: 'length(btrim(name)) > 0' },
    { name: 'ck_workflows_name_length', expression: `char_length(name) <= ${WORKFLOW_LIMITS.nameMaxLength}` },
    { name: 'ck_workflows_cron_shape', expression: "cron_expr ~ '^\\S+(\\s+\\S+){4}$'" },
    { name: 'ck_workflows_timezone_not_blank', expression: 'length(btrim(timezone)) > 0' },
    { name: 'ck_workflows_action_type', expression: `action_type IN (${actionTypes})` },
    { name: 'ck_workflows_action_config_object', expression: "jsonb_typeof(action_config) = 'object'" },
    { name: 'ck_workflows_action_config_shape', expression: `(action_type = 'noop' AND action_config = '{}'::jsonb) OR ${webhookShape}` },
    { name: 'ck_workflows_schedule_state', expression: 'enabled = (next_run_at IS NOT NULL)' },
  ],
});
