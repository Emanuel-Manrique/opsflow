import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RunRetries1788953283918 implements MigrationInterface {
  name = 'RunRetries1788953283918';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE runs ADD COLUMN attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0);
      UPDATE runs SET attempt = 1 WHERE started_at IS NOT NULL;
      ALTER TABLE runs ADD COLUMN retry_of uuid;
      ALTER TABLE runs ADD CONSTRAINT fk_runs_retry FOREIGN KEY (tenant_id, retry_of) REFERENCES runs (tenant_id, id);
      CREATE UNIQUE INDEX uq_runs_retry ON runs (retry_of) WHERE retry_of IS NOT NULL;
      ALTER TABLE runs DROP CONSTRAINT ck_runs_status;
      ALTER TABLE runs DROP CONSTRAINT ck_runs_timestamps;
      ALTER TABLE runs DROP CONSTRAINT ck_runs_error;
      ALTER TABLE runs ADD CONSTRAINT ck_runs_error CHECK (
        (status IN ('failed', 'retrying') AND error_message IS NOT NULL)
        OR (status NOT IN ('failed', 'retrying') AND error_message IS NULL)
      );
      ALTER TABLE runs ADD CONSTRAINT ck_runs_status
        CHECK (status IN ('queued', 'running', 'retrying', 'cancelling', 'cancelled', 'succeeded', 'failed'));
      ALTER TABLE runs ADD CONSTRAINT ck_runs_timestamps CHECK (
        (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
        OR (status IN ('running', 'retrying', 'cancelling') AND started_at IS NOT NULL AND finished_at IS NULL)
        OR (status IN ('succeeded', 'failed') AND started_at IS NOT NULL AND finished_at IS NOT NULL)
        OR (status = 'cancelled' AND finished_at IS NOT NULL)
      )
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE runs DROP CONSTRAINT ck_runs_status;
      ALTER TABLE runs DROP CONSTRAINT ck_runs_timestamps;
      UPDATE runs SET status = 'failed', finished_at = clock_timestamp() WHERE status = 'retrying';
      ALTER TABLE runs DROP CONSTRAINT ck_runs_error;
      ALTER TABLE runs ADD CONSTRAINT ck_runs_error CHECK (
        (status = 'failed' AND error_message IS NOT NULL) OR (status <> 'failed' AND error_message IS NULL)
      );
      ALTER TABLE runs ADD CONSTRAINT ck_runs_status
        CHECK (status IN ('queued', 'running', 'cancelling', 'cancelled', 'succeeded', 'failed'));
      ALTER TABLE runs ADD CONSTRAINT ck_runs_timestamps CHECK (
        (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
        OR (status IN ('running', 'cancelling') AND started_at IS NOT NULL AND finished_at IS NULL)
        OR (status IN ('succeeded', 'failed') AND started_at IS NOT NULL AND finished_at IS NOT NULL)
        OR (status = 'cancelled' AND finished_at IS NOT NULL)
      );
      ALTER TABLE runs DROP COLUMN retry_of;
      ALTER TABLE runs DROP COLUMN attempt
    `);
  }
}
