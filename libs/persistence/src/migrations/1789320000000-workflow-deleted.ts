import type { MigrationInterface, QueryRunner } from 'typeorm';
import { sqlLiterals } from '../schema/sql';

export class WorkflowDeleted1789320000000 implements MigrationInterface {
  name = 'WorkflowDeleted1789320000000';

  // Frozen at the values this migration applied. Reading AUDIT_ACTIONS would let a
  // from-scratch database and a migrated one disagree the next time an action is added.
  private readonly previous = [
    'workflow.created', 'workflow.updated', 'workflow.enabled', 'workflow.disabled',
    'run.started', 'run.cancel_requested', 'run.retried',
  ];
  private readonly next = [...this.previous, 'workflow.deleted'];

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_action');
    await queryRunner.query(`ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_action CHECK (action IN (${sqlLiterals(this.next)}))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE audit_log DROP CONSTRAINT ck_audit_log_action');
    await queryRunner.query(`ALTER TABLE audit_log ADD CONSTRAINT ck_audit_log_action CHECK (action IN (${sqlLiterals(this.previous)}))`);
  }
}
