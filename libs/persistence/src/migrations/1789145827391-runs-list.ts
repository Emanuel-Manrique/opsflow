import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RunListIndex1789145827391 implements MigrationInterface {
  name = 'RunListIndex1789145827391';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX ix_runs_tenant_created ON runs (tenant_id, created_at DESC, id)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX ix_runs_tenant_created');
  }
}
