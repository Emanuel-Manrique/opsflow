import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ExecutionTracing1789040940608 implements MigrationInterface {
  name = 'ExecutionTracing1789040940608';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE execution_outbox ADD COLUMN traceparent text, ADD COLUMN request_id uuid');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE execution_outbox DROP COLUMN request_id, DROP COLUMN traceparent');
  }
}
