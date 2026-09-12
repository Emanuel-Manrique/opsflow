import type { MigrationInterface, QueryRunner } from 'typeorm';
import { nextRuns } from '@opsflow/domain';
import type { ScheduledWorkflow } from './migration.types';

export class SchedulerOutbox1788712868294 implements MigrationInterface {
  name = 'SchedulerOutbox1788712868294';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workflows ADD COLUMN next_run_at timestamptz`);
    const [clock]: Array<{ now: Date }> = await queryRunner.query('SELECT now() AS now');
    const workflows: ScheduledWorkflow[] = await queryRunner.query(`
      SELECT id, cron_expr, timezone FROM workflows WHERE enabled
    `);
    for (const workflow of workflows) {
      const args = [workflow.cron_expr, workflow.timezone, 1, clock.now] as const;
      const next = nextRuns(...args)[0];
      await queryRunner.query(`UPDATE workflows SET next_run_at = $1 WHERE id = $2`, [next, workflow.id]);
    }
    await queryRunner.query(`
      ALTER TABLE workflows ADD CONSTRAINT ck_workflows_schedule_state
        CHECK (enabled = (next_run_at IS NOT NULL));
      CREATE INDEX ix_workflows_due ON workflows (next_run_at, id) WHERE enabled;
      ALTER TABLE runs ADD COLUMN scheduled_for timestamptz;
      ALTER TABLE runs ADD COLUMN idempotency_key text;
      UPDATE runs SET idempotency_key = id::text;
      ALTER TABLE runs ALTER COLUMN idempotency_key SET NOT NULL;
      ALTER TABLE runs ADD CONSTRAINT uq_runs_idempotency UNIQUE (tenant_id, idempotency_key);
      ALTER TABLE runs ADD CONSTRAINT uq_runs_tenant_id UNIQUE (tenant_id, id);
      CREATE UNIQUE INDEX uq_runs_occurrence ON runs (tenant_id, workflow_id, scheduled_for)
        WHERE scheduled_for IS NOT NULL;
      CREATE INDEX ix_runs_workflow_created ON runs (tenant_id, workflow_id, created_at DESC);
      CREATE TABLE execution_outbox (
        run_id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        action jsonb NOT NULL CHECK (jsonb_typeof(action) = 'object'),
        created_at timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz,
        FOREIGN KEY (tenant_id, run_id) REFERENCES runs (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX ix_execution_outbox_pending ON execution_outbox (created_at, run_id)
        WHERE published_at IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE execution_outbox;
      DROP INDEX ix_runs_workflow_created;
      DROP INDEX uq_runs_occurrence;
      ALTER TABLE runs DROP CONSTRAINT uq_runs_tenant_id;
      ALTER TABLE runs DROP CONSTRAINT uq_runs_idempotency;
      ALTER TABLE runs DROP COLUMN idempotency_key;
      ALTER TABLE runs DROP COLUMN scheduled_for;
      DROP INDEX ix_workflows_due;
      ALTER TABLE workflows DROP CONSTRAINT ck_workflows_schedule_state;
      ALTER TABLE workflows DROP COLUMN next_run_at
    `);
  }
}
