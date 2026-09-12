import { DEMO_TENANTS, DEMO_USERS } from '@opsflow/contracts';
import { nextRuns } from '@opsflow/domain';
import type { DataSource } from 'typeorm';
import type { SeedWorkflow } from './demo.types';

const ACME = DEMO_TENANTS.acme;
const GLOBEX = DEMO_TENANTS.globex;

// The console starts with one optional example; additional workflows are user-created.
const ACME_WORKFLOWS: readonly SeedWorkflow[] = [
  { name: 'Health canary', enabled: false, cronExpr: '*/5 * * * *', timezone: 'UTC', actionType: 'noop', actionConfig: {} },
];
const GLOBEX_WORKFLOWS: readonly SeedWorkflow[] = [];

export async function seedDemo(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO tenants (id, slug, name) VALUES ($1, 'acme', 'Acme Corp'), ($2, 'globex', 'Globex') ON CONFLICT (slug) DO NOTHING`,
      [ACME, GLOBEX]
    );

    for (const [role, userId] of Object.entries(DEMO_USERS)) {
      await manager.query('INSERT INTO users (id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, `${role}@opsflow.local`]);
      const tenants = role === 'admin' ? [ACME, GLOBEX] : [ACME];
      for (const tenantId of tenants) {
        await manager.query('INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, tenantId, role]);
      }
    }

    for (const [tenantId, workflows] of [[ACME, ACME_WORKFLOWS], [GLOBEX, GLOBEX_WORKFLOWS]] as const) {
      for (const workflow of workflows) {
        const args = [workflow.cronExpr, workflow.timezone, 1] as const;
        const nextRunAt = workflow.enabled ? nextRuns(...args)[0] : null;
        await manager.query(
          `
            INSERT INTO workflows (tenant_id, name, enabled, cron_expr, timezone, action_type, action_config, next_run_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
            ON CONFLICT (tenant_id, lower(name)) DO NOTHING
          `,
          [tenantId, workflow.name, workflow.enabled, workflow.cronExpr, workflow.timezone, workflow.actionType, JSON.stringify(workflow.actionConfig), nextRunAt]
        );
      }
    }

  });

}
