import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenants1756909371847 implements MigrationInterface {
  name = 'CreateTenants1756909371847';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tenants (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        slug        text        NOT NULL,
        name        text        NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT ck_tenants_slug_shape
          CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT ck_tenants_name_not_blank
          CHECK (length(btrim(name)) > 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_tenants_slug ON tenants (slug)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE tenants`);
  }
}
