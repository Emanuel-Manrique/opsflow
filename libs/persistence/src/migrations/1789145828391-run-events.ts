import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RunEvents1789145828391 implements MigrationInterface {
  name = 'RunEvents1789145828391';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE run_events (
        id bigserial PRIMARY KEY,
        tenant_id uuid NOT NULL,
        run_id uuid NOT NULL,
        workflow_id uuid NOT NULL,
        type text NOT NULL,
        attempt integer,
        trace_id text,
        error_code text,
        duration_ms integer,
        detail text,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT fk_run_events_run FOREIGN KEY (tenant_id, run_id)
          REFERENCES runs (tenant_id, id) ON DELETE CASCADE,
        CONSTRAINT ck_run_events_type CHECK (type IN (
          'run.started', 'run.succeeded', 'run.failed', 'run.cancelled',
          'attempt.started', 'http.request', 'http.succeeded', 'http.failed', 'http.timeout',
          'worker.failed', 'retry.scheduled', 'outbox.published', 'scheduler.claimed', 'scheduler.skipped'
        )),
        CONSTRAINT ck_run_events_attempt CHECK (attempt IS NULL OR attempt >= 0),
        CONSTRAINT ck_run_events_duration CHECK (duration_ms IS NULL OR duration_ms >= 0)
      )
    `);
    await queryRunner.query('CREATE INDEX ix_run_events_run ON run_events (tenant_id, run_id, id)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE run_events');
  }
}
