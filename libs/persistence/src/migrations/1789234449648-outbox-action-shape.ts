import type { MigrationInterface, QueryRunner } from 'typeorm';
import { sqlActionSnapshot } from '../schema/sql';

export class OutboxActionShape1789234449648 implements MigrationInterface {
  name = 'OutboxActionShape1789234449648';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE execution_outbox DROP CONSTRAINT execution_outbox_action_check');
    await queryRunner.query(`
      ALTER TABLE execution_outbox
        ADD CONSTRAINT ck_execution_outbox_action_shape CHECK (${sqlActionSnapshot('action')})
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE execution_outbox DROP CONSTRAINT ck_execution_outbox_action_shape');
    await queryRunner.query(`
      ALTER TABLE execution_outbox
        ADD CONSTRAINT execution_outbox_action_check CHECK (jsonb_typeof(action) = 'object')
    `);
  }
}
