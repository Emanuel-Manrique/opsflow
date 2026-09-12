import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessAudit1788980062440 implements MigrationInterface {
  name = 'AccessAudit1788980062440';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE);
      CREATE TABLE memberships (
        user_id uuid NOT NULL REFERENCES users(id), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')), PRIMARY KEY (user_id, tenant_id)
      );
      CREATE TABLE sessions (
        token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
      );
      CREATE INDEX ix_sessions_expiry ON sessions (expires_at);
      CREATE TABLE audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        actor_id uuid NOT NULL REFERENCES users(id), action text NOT NULL, entity_id uuid NOT NULL,
        trace_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX ix_audit_log_tenant_created ON audit_log (tenant_id, created_at DESC, id)
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE audit_log; DROP TABLE sessions; DROP TABLE memberships; DROP TABLE users');
  }
}
