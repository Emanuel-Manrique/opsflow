import type { DataSource } from 'typeorm';
import { ACME, GLOBEX } from '../testing/integration-db';
import { aWorkflow, createTestDataSource } from '../testing/integration-db';
import { resetDatabase } from '../testing/integration-db';
import { RunNotFoundError, RunStateError } from '../errors';
import { NotFoundInTenantError } from '../errors';
import { parseRunListQuery } from '@opsflow/contracts';
import { RunRepository } from './run.repository';
import { WorkflowRepository } from './workflow.repository';

describe('RunRepository against Postgres', () => {
  let dataSource: DataSource;
  let runs: RunRepository;
  let workflows: WorkflowRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    runs = new RunRepository(dataSource);
    workflows = new WorkflowRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  it('persists a tenant-scoped run lifecycle', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const created = await runs.create({ tenantId: ACME }, workflow.id);

    expect(created).toMatchObject({ status: 'queued', error: null });

    await runs.markRunning({ tenantId: ACME }, created.id, 1);
    await runs.markSucceeded({ tenantId: ACME }, created.id, 1);

    const succeeded = await runs.findById({ tenantId: ACME }, created.id);
    expect(succeeded).toMatchObject({ status: 'succeeded', workflowName: 'Nightly sync' });
    expect(succeeded.startedAt).not.toBeNull();
    expect(succeeded.finishedAt).not.toBeNull();

    const hidden = runs.findById({ tenantId: GLOBEX }, created.id);
    await expect(hidden).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it('allows one worker to claim a run and prevents terminal-state rewrites', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const run = await runs.create({ tenantId: ACME }, workflow.id);
    const claims = [runs.markRunning({ tenantId: ACME }, run.id, 1), runs.markRunning({ tenantId: ACME }, run.id, 1)];
    const results = await Promise.all(claims);
    expect(results.sort()).toEqual([false, true]);
    expect((await runs.findById({ tenantId: ACME }, run.id)).status).toBe('running');
    await runs.markSucceeded({ tenantId: ACME }, run.id, 1);
    expect(await runs.markRunning({ tenantId: ACME }, run.id, 1)).toBe(false);
    const rewrite = runs.markFailed({ tenantId: ACME }, run.id, 'Late failure', 1);
    await expect(rewrite).rejects.toBeInstanceOf(RunStateError);
    expect((await runs.findById({ tenantId: ACME }, run.id)).status).toBe('succeeded');
  });

  it('persists execution failures', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const executed = await runs.create({ tenantId: ACME }, workflow.id);
    await runs.markRunning({ tenantId: ACME }, executed.id, 1);
    await runs.markFailed({ tenantId: ACME }, executed.id, 'Webhook returned HTTP 500.', 1);
    expect((await runs.findById({ tenantId: ACME }, executed.id)).error).toContain('HTTP 500');
  });

  it('rejects cross-tenant creation and state changes', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const run = await runs.create({ tenantId: ACME }, workflow.id);
    const creation = runs.create({ tenantId: GLOBEX }, workflow.id);
    await expect(creation).rejects.toBeInstanceOf(NotFoundInTenantError);
    expect(await runs.markRunning({ tenantId: GLOBEX }, run.id, 1)).toBe(false);
    const unchanged = await runs.findById({ tenantId: ACME }, run.id);
    expect(unchanged.status).toBe('queued');
  });

  it('cancels queued runs without claiming them and keeps cancellation idempotent', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const run = await runs.create({ tenantId: ACME }, workflow.id);
    const cancelled = await runs.cancel({ tenantId: ACME }, run.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.startedAt).toBeNull();
    expect(cancelled.finishedAt).not.toBeNull();
    expect(await runs.markRunning({ tenantId: ACME }, run.id, 1)).toBe(false);
    expect((await runs.cancel({ tenantId: ACME }, run.id)).finishedAt).toBe(cancelled.finishedAt);
    const history = await dataSource.query('SELECT type FROM run_events WHERE run_id = $1 AND type = $2', [run.id, 'run.cancelled']);
    expect(history).toHaveLength(1);
  });

  it('honors cancellation before completion without rewriting a completed run', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const run = await runs.create({ tenantId: ACME }, workflow.id);
    await runs.markRunning({ tenantId: ACME }, run.id, 1);
    expect((await runs.cancel({ tenantId: ACME }, run.id)).status).toBe('cancelling');
    expect(await runs.isCancellationRequested({ tenantId: ACME }, run.id)).toBe(true);
    expect(await runs.markFailed({ tenantId: ACME }, run.id, 'Aborted', 1)).toBe('cancelled');
    expect((await runs.findById({ tenantId: ACME }, run.id)).error).toBeNull();

    const completed = await runs.create({ tenantId: ACME }, workflow.id);
    await runs.markRunning({ tenantId: ACME }, completed.id, 1);
    await runs.markSucceeded({ tenantId: ACME }, completed.id, 1);
    await expect(runs.cancel({ tenantId: ACME }, completed.id)).rejects.toBeInstanceOf(RunStateError);
    expect((await runs.findById({ tenantId: ACME }, completed.id)).status).toBe('succeeded');
  });

  it('serializes worker claims against cancellation and rejects a foreign tenant', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const run = await runs.create({ tenantId: ACME }, workflow.id);
    const foreign = runs.cancel({ tenantId: GLOBEX }, run.id);
    await expect(foreign).rejects.toBeInstanceOf(RunNotFoundError);
    const pending = [runs.cancel({ tenantId: ACME }, run.id), runs.markRunning({ tenantId: ACME }, run.id, 1)];
    const [, claimed] = await Promise.all(pending);
    if (claimed) await runs.markSucceeded({ tenantId: ACME }, run.id, 1);
    expect((await runs.findById({ tenantId: ACME }, run.id)).status).toBe('cancelled');
  });

  it('fences late workers, retries failures and cancels during backoff', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const run = await runs.create({ tenantId: ACME }, workflow.id);
    expect(await runs.markRunning({ tenantId: ACME }, run.id, 1)).toBe(true);
    expect(await runs.markFailed({ tenantId: ACME }, run.id, 'HTTP 503', 1, true)).toBe('retrying');
    expect((await runs.findById({ tenantId: ACME }, run.id)).finishedAt).toBeNull();
    expect(await runs.markRunning({ tenantId: ACME }, run.id, 2)).toBe(true);
    await expect(runs.markSucceeded({ tenantId: ACME }, run.id, 1)).rejects.toBeInstanceOf(RunStateError);
    await runs.markFailed({ tenantId: ACME }, run.id, 'HTTP 503', 2, true);
    expect((await runs.cancel({ tenantId: ACME }, run.id)).status).toBe('cancelled');
    expect(await runs.markRunning({ tenantId: ACME }, run.id, 3)).toBe(false);
  });

  it('resumes a stalled delivery and reconciles exhausted queue failures', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const run = await runs.create({ tenantId: ACME }, workflow.id);
    await runs.markRunning({ tenantId: ACME }, run.id, 1);
    expect(await runs.markRunning({ tenantId: ACME }, run.id, 2)).toBe(true);
    await runs.reconcileFailure({ tenantId: ACME }, run.id, 1, 'Old failure');
    expect((await runs.findById({ tenantId: ACME }, run.id)).status).toBe('running');
    await runs.reconcileFailure({ tenantId: ACME }, run.id, 2, 'Stalled deliveries exhausted');
    expect((await runs.findById({ tenantId: ACME }, run.id)).status).toBe('failed');
    expect(await runs.markRunning({ tenantId: ACME }, run.id, 3)).toBe(false);
  });

  it('deduplicates manual retries and reuses the original action snapshot', async () => {
    const workflow = await workflows.create({ tenantId: ACME }, aWorkflow());
    const original = await runs.create({ tenantId: ACME }, workflow.id);
    await runs.markRunning({ tenantId: ACME }, original.id, 1);
    await runs.markFailed({ tenantId: ACME }, original.id, 'Failed', 1);
    const action = { type: 'webhook' as const, url: 'https://example.com/new-action', method: 'POST' as const };
    await workflows.update({ tenantId: ACME }, workflow.id, aWorkflow({ action }));
    const [first, second] = await Promise.all([runs.retry({ tenantId: ACME }, original.id), runs.retry({ tenantId: ACME }, original.id)]);
    expect(first.id).toBe(second.id);
    expect(first.retryOf).toBe(original.id);
    expect(first.attempt).toBe(0);
    const snapshots = await dataSource.query('SELECT action FROM execution_outbox WHERE run_id = $1', [first.id]);
    expect(snapshots).toEqual([{ action: { type: 'noop' } }]);
    await expect(runs.retry({ tenantId: ACME }, first.id)).rejects.toBeInstanceOf(RunStateError);
    const foreign = runs.retry({ tenantId: GLOBEX }, original.id);
    await expect(foreign).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it('lists tenant runs newest first and hides other tenants', async () => {
    const acmeWf = await workflows.create({ tenantId: ACME }, aWorkflow({ name: 'Acme job' }));
    const globexWf = await workflows.create({ tenantId: GLOBEX }, aWorkflow({ name: 'Globex job' }));
    const older = await runs.create({ tenantId: ACME }, acmeWf.id);
    const newer = await runs.create({ tenantId: ACME }, acmeWf.id);
    const foreign = await runs.create({ tenantId: GLOBEX }, globexWf.id);
    await dataSource.query('UPDATE runs SET created_at = $2 WHERE id = $1', [older.id, '2026-01-01T00:00:00.000Z']);
    await dataSource.query('UPDATE runs SET created_at = $2 WHERE id = $1', [newer.id, '2026-01-02T00:00:00.000Z']);
    const page = await runs.list({ tenantId: ACME }, parseRunListQuery({}));
    expect(page.items.map((run) => run.id)).toEqual([newer.id, older.id]);
    expect(page.items.every((run) => run.workflowName === 'Acme job')).toBe(true);
    expect(page.items.map((run) => run.id)).not.toContain(foreign.id);
    const failed = await runs.list({ tenantId: ACME }, parseRunListQuery({ status: 'failed' }));
    expect(failed.items).toEqual([]);
    const oldest = await runs.list({ tenantId: ACME }, parseRunListQuery({ sort: 'createdAt' }));
    expect(oldest.items.map((run) => run.id)).toEqual([older.id, newer.id]);
  });
});
