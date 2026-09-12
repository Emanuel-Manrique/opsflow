import type { MigrationInterface, QueryRunner } from 'typeorm';
import { sqlLiterals } from '../schema/sql';

export class OutboxHeldEvent1789234449649 implements MigrationInterface {
  name = 'OutboxHeldEvent1789234449649';

  private readonly current = [
    'run.started', 'run.succeeded', 'run.failed', 'run.cancelled',
    'attempt.started', 'http.request', 'http.succeeded', 'http.failed', 'http.timeout',
    'worker.failed', 'retry.scheduled', 'outbox.published', 'outbox.held',
    'scheduler.claimed', 'scheduler.skipped',
  ];

  private readonly previous = [
    'run.started', 'run.succeeded', 'run.failed', 'run.cancelled',
    'attempt.started', 'http.request', 'http.succeeded', 'http.failed', 'http.timeout',
    'worker.failed', 'retry.scheduled', 'outbox.published', 'scheduler.claimed', 'scheduler.skipped',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replace(queryRunner, sqlLiterals(this.current));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM run_events WHERE type NOT IN (${sqlLiterals(this.previous)})`);
    await this.replace(queryRunner, sqlLiterals(this.previous));
  }

  private async replace(queryRunner: QueryRunner, literals: string): Promise<void> {
    await queryRunner.query('ALTER TABLE run_events DROP CONSTRAINT ck_run_events_type');
    await queryRunner.query(`ALTER TABLE run_events ADD CONSTRAINT ck_run_events_type CHECK (type IN (${literals}))`);
  }
}
