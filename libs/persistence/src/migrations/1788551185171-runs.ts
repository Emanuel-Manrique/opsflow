import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRuns1788551185171 implements MigrationInterface {
  name = 'CreateRuns1788551185171';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workflows
        ADD CONSTRAINT uq_workflows_tenant_id UNIQUE (tenant_id, id)
    `);

    await queryRunner.query(`
      CREATE TABLE runs (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     uuid        NOT NULL,
        workflow_id   uuid        NOT NULL,
        status        text        NOT NULL DEFAULT 'queued',
        error_message text,
        created_at    timestamptz NOT NULL DEFAULT now(),
        started_at    timestamptz,
        finished_at   timestamptz,

        CONSTRAINT ck_runs_status
          CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),

        CONSTRAINT fk_runs_workflow_tenant
          FOREIGN KEY (tenant_id, workflow_id)
          REFERENCES workflows (tenant_id, id)
          ON DELETE CASCADE,

        CONSTRAINT ck_runs_timestamps
          CHECK (
            (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
            OR
            (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL)
            OR
            (status IN ('succeeded', 'failed') AND started_at IS NOT NULL AND finished_at IS NOT NULL)
          ),

        CONSTRAINT ck_runs_finished_after_started
          CHECK (finished_at IS NULL OR finished_at >= started_at),

        CONSTRAINT ck_runs_error
          CHECK (
            (status = 'failed' AND error_message IS NOT NULL)
            OR
            (status <> 'failed' AND error_message IS NULL)
          )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE runs`);
    await queryRunner.query(`ALTER TABLE workflows DROP CONSTRAINT uq_workflows_tenant_id`);
  }
}
