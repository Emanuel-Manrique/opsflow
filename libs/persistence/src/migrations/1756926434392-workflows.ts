import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflows1756926434392 implements MigrationInterface {
  name = 'CreateWorkflows1756926434392';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE workflows (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     uuid        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
        name          text        NOT NULL,
        enabled       boolean     NOT NULL DEFAULT false,
        cron_expr     text        NOT NULL,
        timezone      text        NOT NULL DEFAULT 'UTC',
        action_type   text        NOT NULL,
        action_config jsonb       NOT NULL DEFAULT '{}'::jsonb,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT ck_workflows_name_not_blank
          CHECK (length(btrim(name)) > 0),

        CONSTRAINT ck_workflows_name_length
          CHECK (char_length(name) <= 120),

        CONSTRAINT ck_workflows_cron_shape
          CHECK (cron_expr ~ '^\\S+(\\s+\\S+){4}$'),

        CONSTRAINT ck_workflows_timezone_not_blank
          CHECK (length(btrim(timezone)) > 0),

        CONSTRAINT ck_workflows_action_type
          CHECK (action_type IN ('webhook', 'noop')),

        CONSTRAINT ck_workflows_action_config_object
          CHECK (jsonb_typeof(action_config) = 'object'),

        CONSTRAINT ck_workflows_action_config_shape
          CHECK (
            (action_type = 'noop' AND action_config = '{}'::jsonb)
            OR
            (
              action_type = 'webhook'
              AND action_config ? 'url'
              AND jsonb_typeof(action_config -> 'url') = 'string'
              AND action_config ? 'method'
              AND action_config ->> 'method' IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
            )
          )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_workflows_tenant_name
        ON workflows (tenant_id, lower(name))
    `);

    await queryRunner.query(`
      CREATE INDEX ix_workflows_tenant_updated_at
        ON workflows (tenant_id, updated_at DESC, id DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE workflows`);
  }
}
