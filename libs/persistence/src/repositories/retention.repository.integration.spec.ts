import type { DataSource } from 'typeorm';
import { ACME, aWorkflow, createTestDataSource, resetDatabase } from '../testing/integration-db';
import type { CountRow } from './retention.types';
import { RetentionRepository } from './retention.repository';
import { RunRepository } from './run.repository';
import { WorkflowRepository } from './workflow.repository';

describe('retention against Postgres', () => {
  let dataSource: DataSource;
  let retention: RetentionRepository;
  let runs: RunRepository;
  let workflows: WorkflowRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    retention = new RetentionRepository(dataSource);
    runs = new RunRepository(dataSource);
    workflows = new WorkflowRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  async function count(table: string): Promise<number> {
    const [row] = await dataSource.query<CountRow[]>(`SELECT count(*) FROM ${table}`);
    return Number(row.count);
  }

  async function age(runId: string, days: number): Promise<void> {
    await dataSource.query(`
      UPDATE runs SET
        created_at = created_at - make_interval(days => $2::int),
        started_at = started_at - make_interval(days => $2::int),
        finished_at = finished_at - make_interval(days => $2::int)
      WHERE id = $1
    `, [runId, days]);
  }

  it('removes finished runs past the window with everything hanging off them', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const old = await runs.create({ tenantId: ACME }, workflow.id);
    await runs.markRunning({ tenantId: ACME }, old.id, 1);
    await runs.markSucceeded({ tenantId: ACME }, old.id, 1);
    await age(old.id, 30);
    expect(await count('run_events')).toBeGreaterThan(0);
    expect(await count('execution_outbox')).toBe(1);

    expect(await retention.purge(14)).toEqual({ runs: 1, auditEntries: 0 });

    expect(await count('runs')).toBe(0);
    expect(await count('run_events')).toBe(0);
    expect(await count('execution_outbox')).toBe(0);
    expect(await count('workflows')).toBe(1);
  });

  it('never removes work still in flight, however old the row is', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const queued = await runs.create({ tenantId: ACME }, workflow.id);
    const running = await runs.create({ tenantId: ACME }, workflow.id);
    await runs.markRunning({ tenantId: ACME }, running.id, 1);
    await dataSource.query(
      `UPDATE runs SET created_at = now() - interval '400 days', started_at = started_at - interval '400 days'`
    );

    expect(await retention.purge(1)).toEqual({ runs: 0, auditEntries: 0 });

    const survivors = [queued.id, running.id];
    for (const id of survivors) {
      await expect(runs.findById({ tenantId: ACME }, id)).resolves.toBeDefined();
    }
  });

  it('keeps runs inside the window', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const recent = await runs.create({ tenantId: ACME }, workflow.id);
    await runs.markRunning({ tenantId: ACME }, recent.id, 1);
    await runs.markSucceeded({ tenantId: ACME }, recent.id, 1);
    await age(recent.id, 3);

    expect(await retention.purge(14)).toEqual({ runs: 0, auditEntries: 0 });
    expect(await count('runs')).toBe(1);
  });

  it('preserves retry ancestors and prunes them after their descendants expire', async () => {
    const context = { tenantId: ACME };
    const workflow = await workflows.create(context, aWorkflow());
    const original = await runs.create(context, workflow.id);
    await runs.markRunning(context, original.id, 1);
    await runs.markFailed(context, original.id, 'HTTP 500', 1);
    const retry = await runs.retry(context, original.id);
    await age(original.id, 30);
    expect(await retention.purge(14)).toEqual({ runs: 0, auditEntries: 0 });
    await runs.markRunning(context, retry.id, 1);
    await runs.markSucceeded(context, retry.id, 1);
    await age(retry.id, 30);
    expect(await retention.purge(14)).toEqual({ runs: 1, auditEntries: 0 });
    expect(await retention.purge(14)).toEqual({ runs: 1, auditEntries: 0 });
    expect(await count('runs')).toBe(0);
  });

  it.each([0, -1, 1.5, NaN, Infinity])('rejects an invalid retention window %s', async (days) => {
    await expect(retention.purge(days)).rejects.toThrow('positive integer');
  });
});
