import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { DataSource } from 'typeorm';
import { createTestDataSource } from '../testing/integration-db';
import { ACME, resetDatabase } from '../testing/integration-db';
import { WorkflowEntity } from '../schema/workflow';
import { RunEntity } from '../schema/run';
import type { ConstraintRow, DatabaseIndexRow, DatabaseTableRow, LedgerRow } from './migration.types';
import { ACTION_TYPES, AUDIT_ACTIONS, HTTP_METHODS, ROLES, RUN_STATUSES } from '@opsflow/domain';
import { RUN_EVENT_TYPES } from '@opsflow/contracts';
import { migrations } from './index';

const LEDGER = [
  'CreateTenants1756909371847',
  'CreateWorkflows1756926434392',
  'CreateRuns1788551185171',
  'SchedulerOutbox1788712868294',
  'RunCancellation1788880427651',
  'RunRetries1788953283918',
  'AccessAudit1788980062440',
  'ExecutionTracing1789040940608',
  'OutboxClaim1789131248371',
  'RunListIndex1789145827391',
  'RunEvents1789145828391',
  'OutboxActionShape1789234449648',
  'OutboxHeldEvent1789234449649',
  'WorkflowDeleted1789320000000',
];

const UNION_CONSTRAINTS = [
  ['ck_run_events_type', RUN_EVENT_TYPES],
  ['ck_runs_status', RUN_STATUSES],
  ['ck_workflows_action_type', ACTION_TYPES],
  ['ck_audit_log_action', AUDIT_ACTIONS],
  ['memberships_role_check', ROLES],
  ['ck_workflows_action_config_shape', HTTP_METHODS],
  ['ck_execution_outbox_action_shape', HTTP_METHODS],
] as const satisfies readonly (readonly [string, readonly string[]])[];

const CONSTRAINTS_SQL = `
  SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND c.contype = 'c' AND t.relname <> 'migrations'
  ORDER BY c.conname
`;

const INDEX_DEFINITIONS: Record<string, string> = {
  audit_log_pkey: 'CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)',
  execution_outbox_pkey: 'CREATE UNIQUE INDEX execution_outbox_pkey ON public.execution_outbox USING btree (run_id)',
  ix_audit_log_tenant_created: 'CREATE INDEX ix_audit_log_tenant_created ON public.audit_log USING btree (tenant_id, created_at DESC, id)',
  ix_execution_outbox_pending: 'CREATE INDEX ix_execution_outbox_pending ON public.execution_outbox USING btree (created_at, run_id) WHERE (published_at IS NULL)',
  ix_run_events_run: 'CREATE INDEX ix_run_events_run ON public.run_events USING btree (tenant_id, run_id, id)',
  ix_runs_tenant_created: 'CREATE INDEX ix_runs_tenant_created ON public.runs USING btree (tenant_id, created_at DESC, id)',
  ix_runs_workflow_created: 'CREATE INDEX ix_runs_workflow_created ON public.runs USING btree (tenant_id, workflow_id, created_at DESC)',
  ix_sessions_expiry: 'CREATE INDEX ix_sessions_expiry ON public.sessions USING btree (expires_at)',
  ix_workflows_due: 'CREATE INDEX ix_workflows_due ON public.workflows USING btree (next_run_at, id) WHERE enabled',
  ix_workflows_tenant_updated_at: 'CREATE INDEX ix_workflows_tenant_updated_at ON public.workflows USING btree (tenant_id, updated_at DESC, id DESC)',
  memberships_pkey: 'CREATE UNIQUE INDEX memberships_pkey ON public.memberships USING btree (user_id, tenant_id)',
  run_events_pkey: 'CREATE UNIQUE INDEX run_events_pkey ON public.run_events USING btree (id)',
  runs_pkey: 'CREATE UNIQUE INDEX runs_pkey ON public.runs USING btree (id)',
  sessions_pkey: 'CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (token_hash)',
  tenants_pkey: 'CREATE UNIQUE INDEX tenants_pkey ON public.tenants USING btree (id)',
  uq_runs_idempotency: 'CREATE UNIQUE INDEX uq_runs_idempotency ON public.runs USING btree (tenant_id, idempotency_key)',
  uq_runs_occurrence: 'CREATE UNIQUE INDEX uq_runs_occurrence ON public.runs USING btree (tenant_id, workflow_id, scheduled_for) WHERE (scheduled_for IS NOT NULL)',
  uq_runs_retry: 'CREATE UNIQUE INDEX uq_runs_retry ON public.runs USING btree (retry_of) WHERE (retry_of IS NOT NULL)',
  uq_runs_tenant_id: 'CREATE UNIQUE INDEX uq_runs_tenant_id ON public.runs USING btree (tenant_id, id)',
  uq_tenants_slug: 'CREATE UNIQUE INDEX uq_tenants_slug ON public.tenants USING btree (slug)',
  uq_workflows_tenant_id: 'CREATE UNIQUE INDEX uq_workflows_tenant_id ON public.workflows USING btree (tenant_id, id)',
  uq_workflows_tenant_name: 'CREATE UNIQUE INDEX uq_workflows_tenant_name ON public.workflows USING btree (tenant_id, lower(name))',
  users_email_key: 'CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)',
  users_pkey: 'CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)',
  workflows_pkey: 'CREATE UNIQUE INDEX workflows_pkey ON public.workflows USING btree (id)',
};

describe('migrations', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  it('leaves nothing pending once it has run', async () => {
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('keeps the migration ledger append-only, ordered and never renamed', async () => {
    expect(migrations.map((migration) => migration.name)).toEqual(LEDGER);

    const timestamps = LEDGER.map((name) => Number(/\d+$/.exec(name)![0]));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(new Set(timestamps).size).toBe(timestamps.length);

    const applied = await dataSource.query<LedgerRow[]>('SELECT name FROM migrations ORDER BY timestamp, id');
    expect(applied.map((row) => row.name)).toEqual(LEDGER);
  });

  it('freezes the SQL of every migration instead of reading a live union', async () => {
    const directory = fileURLToPath(new URL('.', import.meta.url));
    const files = (await readdir(directory)).filter((file) => /^\d+-.+\.ts$/.test(file));
    expect(files).toHaveLength(migrations.length);

    for (const file of files) {
      const source = await readFile(directory + file, 'utf8');
      const live = source.match(/sqlLiterals\(\s*[A-Z][A-Z0-9_]+\s*\)/g);
      expect({ file, live }).toEqual({ file, live: null });
    }
  });

  it('keeps every union CHECK equal to the union it was derived from', async () => {
    const rows = await dataSource.query<ConstraintRow[]>(CONSTRAINTS_SQL);
    const definitions = new Map(rows.map((row) => [row.conname, row.definition]));

    for (const [name, union] of UNION_CONSTRAINTS) {
      const arrays = [...(definitions.get(name) ?? '').matchAll(/ARRAY\[([^\]]*)\]/g)];
      const quoted = arrays.flatMap((array) => [...array[1].matchAll(/'((?:[^']|'')*)'::text/g)]);
      const literals = [...new Set(quoted.map((match) => match[1]))].sort();
      expect({ name, literals }).toEqual({ name, literals: [...union].sort() });
    }
  });

  it('matches the recorded SQL of every index, not only its name', async () => {
    const rows = await dataSource.query<DatabaseIndexRow[]>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename <> 'migrations' ORDER BY indexname`
    );

    const stored = Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]));
    expect(stored).toEqual(INDEX_DEFINITIONS);
  });

  it('maps every application table, column and constraint in the migrated database', async () => {
    const runner = dataSource.createQueryRunner();
    try {
      const rows = await dataSource.query<DatabaseTableRow[]>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'migrations'`);
      const tables = await runner.getTables(rows.map((row) => row.table_name));
      const metadata = dataSource.entityMetadatas;
      expect(tables.map((table) => table.name).sort()).toEqual(metadata.map((entity) => entity.tableName).sort());
      for (const entity of metadata) {
        const table = tables.find((table) => table.name === entity.tableName)!;
        expect(table.columns.map((column) => column.name).sort()).toEqual(entity.columns.map((column) => column.databaseName).sort());
        for (const column of entity.columns) {
          const stored = table.columns.find((candidate) => candidate.name === column.databaseName)!;
          expect(stored.type, `${entity.tableName}.${column.databaseName}`).toBe(dataSource.driver.normalizeType(column));
          expect(stored.isNullable).toBe(column.isNullable);
          expect(stored.isPrimary).toBe(column.isPrimary);
        }
        expect(table.checks.map((check) => check.name).sort()).toEqual(entity.checks.map((check) => check.name).sort());
        expect(table.uniques.map((unique) => unique.name).sort()).toEqual(entity.uniques.map((unique) => unique.name).sort());
        expect(table.indices.map((index) => index.name).sort()).toEqual(entity.indices.map((index) => index.name).sort());
        expect(table.foreignKeys.map((key) => key.name).sort()).toEqual(entity.foreignKeys.map((key) => key.name).sort());
        for (const key of entity.foreignKeys) {
          const stored = table.foreignKeys.find((candidate) => candidate.name === key.name)!;
          const actualPairs = stored.columnNames.map((column, index) => [column, stored.referencedColumnNames[index]]).sort();
          const expectedPairs = key.columnNames.map((column, index) => [column, key.referencedColumnNames[index]]).sort();
          expect(actualPairs).toEqual(expectedPairs);
          expect(stored.referencedTableName).toBe(key.referencedTablePath);
          expect(stored.onDelete).toBe(key.onDelete ?? 'NO ACTION');
        }
      }
    } finally {
      await runner.release();
    }
  });

  it('upgrades existing schedules and runs from phase C', async () => {
    await resetDatabase(dataSource);
    for (let index = 3; index < migrations.length; index++) {
      await dataSource.undoLastMigration();
    }
    const workflowId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    try {
      await dataSource.query(`
        INSERT INTO workflows (id, tenant_id, name, enabled, cron_expr, timezone, action_type, action_config)
        VALUES ($1, $2, 'Existing schedule', true, '* * * * *', 'UTC', 'noop', '{}')
      `, [workflowId, ACME]);
      await dataSource.query(`
        INSERT INTO runs (id, tenant_id, workflow_id) VALUES ($1, $2, $3)
      `, [runId, ACME, workflowId]);
    } finally {
      await dataSource.runMigrations();
    }
    const workflows = dataSource.getRepository(WorkflowEntity);
    const runs = dataSource.getRepository(RunEntity);
    const workflow = await workflows.findOneByOrFail({ id: workflowId });
    const run = await runs.findOneByOrFail({ id: runId });
    expect(workflow.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    expect(run.idempotencyKey).toBe(runId);
    expect(run.status).toBe('queued');
    expect(run.scheduledFor).toBeNull();
    expect(await dataSource.query('SELECT * FROM execution_outbox')).toEqual([]);
  });

  it('reverts all the way back to an empty schema and forward again', async () => {
    await resetDatabase(dataSource);
    const tableNames = async (): Promise<string[]> => {
      const rows = await dataSource.query<DatabaseTableRow[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'migrations' ORDER BY table_name`
      );

      return rows.map((r) => r.table_name);
    };

    const expected = ['audit_log', 'execution_outbox', 'memberships', 'run_events', 'runs', 'sessions', 'tenants', 'users', 'workflows'];
    expect(await tableNames()).toEqual(expected);

    for (let index = 0; index < migrations.length; index++) {
      await dataSource.undoLastMigration();
    }

    expect(await tableNames()).toEqual([]);

    await dataSource.runMigrations();

    expect(await tableNames()).toEqual(expected);
  });
});
