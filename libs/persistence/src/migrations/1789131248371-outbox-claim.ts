import type { MigrationInterface, QueryRunner } from 'typeorm';
import { sqlLiterals } from '../schema/sql';

export class OutboxClaim1789131248371 implements MigrationInterface {
  name = 'OutboxClaim1789131248371';

  private readonly actions = [
    'workflow.created', 'workflow.updated', 'workflow.enabled', 'workflow.disabled',
    'run.started', 'run.cancel_requested', 'run.retried',
  ];

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE execution_outbox ADD COLUMN claimed_at timestamptz');
    await queryRunner.query(`ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_action CHECK (action IN (${sqlLiterals(this.actions)}))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_action');
    await queryRunner.query('ALTER TABLE execution_outbox DROP COLUMN claimed_at');
  }
}
