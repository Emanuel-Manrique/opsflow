import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RunCancellation1788880427651 implements MigrationInterface {
  name = 'RunCancellation1788880427651';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE runs DROP CONSTRAINT ck_runs_status;
      ALTER TABLE runs DROP CONSTRAINT ck_runs_timestamps;
      ALTER TABLE runs ADD CONSTRAINT ck_runs_status
        CHECK (status IN ('queued', 'running', 'cancelling', 'cancelled', 'succeeded', 'failed'));
      ALTER TABLE runs ADD CONSTRAINT ck_runs_timestamps CHECK (
        (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
        OR (status IN ('running', 'cancelling') AND started_at IS NOT NULL AND finished_at IS NULL)
        OR (status IN ('succeeded', 'failed') AND started_at IS NOT NULL AND finished_at IS NOT NULL)
        OR (status = 'cancelled' AND finished_at IS NOT NULL)
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    // keep cancel history
    await runner.query(`
      ALTER TABLE runs DROP CONSTRAINT ck_runs_status;
      ALTER TABLE runs DROP CONSTRAINT ck_runs_timestamps;
      ALTER TABLE runs ADD CONSTRAINT ck_runs_status
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));
      ALTER TABLE runs ADD CONSTRAINT ck_runs_timestamps CHECK (
        (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
        OR (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL)
        OR (status IN ('succeeded', 'failed') AND started_at IS NOT NULL AND finished_at IS NOT NULL)
      )
    `);
  }
}
