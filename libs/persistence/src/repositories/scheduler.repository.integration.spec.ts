import type { DataSource } from 'typeorm';
import type { RunJobData } from '@opsflow/contracts';
import { ACME, GLOBEX, aWorkflow } from '../testing/integration-db';
import { createTestDataSource, resetDatabase } from '../testing/integration-db';
import { RunEntity } from '../schema/run';
import { WorkflowEntity } from '../schema/workflow';
import { RunRepository } from './run.repository';
import { SchedulerRepository } from './scheduler.repository';
import { WorkflowRepository } from './workflow.repository';

describe('scheduler and outbox against Postgres', () => {
  const overdue = new Date('2000-01-01T00:00:00.000Z');
  let db: DataSource;
  let replica: DataSource;
  let scheduler: SchedulerRepository;
  let second: SchedulerRepository;
  let workflows: WorkflowRepository;
  let runs: RunRepository;

  beforeAll(async () => {
    db = await createTestDataSource();
    replica = await createTestDataSource();
    scheduler = new SchedulerRepository(db);
    second = new SchedulerRepository(replica);
    workflows = new WorkflowRepository(db);
    runs = new RunRepository(db);
  });

  afterAll(async () => {
    await Promise.all([db?.destroy(), replica?.destroy()]);
  });

  beforeEach(async () => {
    await resetDatabase(db);
  });

  async function dueWorkflow(tenant = ACME) {
    const input = aWorkflow({ enabled: true, cronExpr: '* * * * *' });
    const workflow = await workflows.create({ tenantId: tenant }, input);
    await db.query('UPDATE workflows SET next_run_at = $1 WHERE id = $2', [overdue, workflow.id]);
    return workflow;
  }

  function storedWorkflow(id: string) {
    return db.getRepository(WorkflowEntity).findOneByOrFail({ id });
  }

  it('two scheduler replicas create one run and resume in the future after downtime', async () => {
    const workflow = await dueWorkflow();
    const claims = [scheduler.enqueueDue(), second.enqueueDue()];
    const results = await Promise.all(claims);
    expect(results.sort()).toEqual([0, 1]);
    const stored = await db.getRepository(RunEntity).find();
    expect(stored).toHaveLength(1);
    expect(stored[0].scheduledFor).toEqual(overdue);
    const key = `scheduled:${workflow.id}:${overdue.toISOString()}`;
    expect(stored[0].idempotencyKey).toBe(key);
    const advanced = await storedWorkflow(workflow.id);
    expect(advanced.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    expect(advanced.updatedAt.toISOString()).toBe(workflow.updatedAt);
    const events = await db.query('SELECT run_id FROM execution_outbox');
    expect(events).toEqual([{ run_id: stored[0].id }]);

    // same occurrence = same run
    await db.query('UPDATE workflows SET next_run_at = $1 WHERE id = $2', [overdue, workflow.id]);
    await second.enqueueDue();
    expect(await db.getRepository(RunEntity).count()).toBe(1);
    expect(await db.query('SELECT run_id FROM execution_outbox')).toHaveLength(1);
  });

  it('records the claim, the refused duplicate and the handover to the queue', async () => {
    const workflow = await dueWorkflow();
    await scheduler.enqueueDue();
    const [run] = await db.getRepository(RunEntity).find();

    // Replay the same occurrence: uq_runs_occurrence must refuse the second insert.
    await db.query('UPDATE workflows SET next_run_at = $1 WHERE id = $2', [overdue, workflow.id]);
    await second.enqueueDue();

    expect(await db.getRepository(RunEntity).count()).toBe(1);
    await scheduler.publishNext(async () => undefined);

    const rows = await db.query<{ type: string; run_id: string }[]>(
      'SELECT type, run_id FROM run_events WHERE run_id = $1 ORDER BY id', [run.id]
    );
    expect(rows.map((row) => row.type)).toEqual(['run.started', 'scheduler.claimed', 'scheduler.skipped', 'outbox.published']);
    // The blocked duplicate is recorded against the run that won, not a phantom one.
    expect(rows.every((row) => row.run_id === run.id)).toBe(true);
  });

  it('hands over to the queue exactly once even if acknowledge runs again', async () => {
    await dueWorkflow();
    await scheduler.enqueueDue();
    await scheduler.publishNext(async () => undefined);
    const published = () => db.query<unknown[]>("SELECT 1 FROM run_events WHERE type = 'outbox.published'");

    expect(await published()).toHaveLength(1);
    // A second sweep finds nothing pending, so it must not log a second handover.
    expect(await scheduler.publishNext(async () => undefined)).toBe(false);
    expect(await published()).toHaveLength(1);
  });

  it('skips a locked workflow while scheduling another tenant', async () => {
    const locked = await dueWorkflow();
    const available = await dueWorkflow(GLOBEX);
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SELECT id FROM workflows WHERE id = $1 FOR UPDATE', [locked.id]);
      expect(await second.enqueueDue()).toBe(1);
      const [run] = await replica.getRepository(RunEntity).find();
      expect(run.workflowId).toBe(available.id);
      expect(run.tenantId).toBe(GLOBEX);
      expect((await storedWorkflow(locked.id)).nextRunAt).toEqual(overdue);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect(await scheduler.enqueueDue()).toBe(1);
  });

  it('rolls back the run and schedule if the outbox write fails', async () => {
    const workflow = await dueWorkflow();
    await db.query('ALTER TABLE execution_outbox ADD CONSTRAINT test_reject CHECK (false) NOT VALID');
    try {
      expect(await scheduler.enqueueDue()).toBe(0);
      const manual = runs.create({ tenantId: ACME }, workflow.id);
      await expect(manual).rejects.toThrow('test_reject');
      expect(await db.getRepository(RunEntity).count()).toBe(0);
      expect((await storedWorkflow(workflow.id)).nextRunAt).toEqual(overdue);
      expect(await db.query('SELECT run_id FROM execution_outbox')).toHaveLength(0);
    } finally {
      await db.query('ALTER TABLE execution_outbox DROP CONSTRAINT test_reject');
    }
    expect(await scheduler.enqueueDue()).toBe(1);
  });

  it('retains a failed publication and retries the same action snapshot and run id', async () => {
    const workflow = await dueWorkflow();
    const traceparent = '00-11111111111111111111111111111111-2222222222222222-01';
    const traceId = crypto.randomUUID();
    const run = await runs.create({ tenantId: ACME, traceId, traceparent }, workflow.id);
    const snapshot = { type: 'noop' as const };
    const later = { type: 'webhook' as const, url: 'https://example.com/hook', method: 'POST' as const };
    const input = aWorkflow({ action: later });
    await workflows.update({ tenantId: ACME }, workflow.id, input);
    const publish = vi.fn<(job: RunJobData) => Promise<void>>();
    publish.mockRejectedValueOnce(new Error('Redis acknowledgement lost'));
    await expect(scheduler.publishNext(publish)).rejects.toThrow('acknowledgement lost');
    const pending = await db.query('SELECT published_at FROM execution_outbox');
    expect(pending).toEqual([{ published_at: null }]);
    const runRows = db.getRepository(RunEntity);
    const stored = await runRows.findOneByOrFail({ id: run.id });
    expect(stored.status).toBe('queued');

    publish.mockResolvedValueOnce(undefined);
    expect(await second.publishNext(publish)).toBe(true);
    const p1 = { runId: run.id, tenantId: ACME, action: snapshot, workflowId: workflow.id };
    const job = { ...p1, traceparent, requestId: traceId, queuedAt: expect.any(String) };
    expect(publish).toHaveBeenNthCalledWith(1, job);
    expect(publish).toHaveBeenNthCalledWith(2, job);
    expect(await scheduler.publishNext(publish)).toBe(false);
  });

  it('lets a second publisher skip an event already being published', async () => {
    const workflow = await dueWorkflow();
    await runs.create({ tenantId: ACME }, workflow.id);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const first = scheduler.publishNext(async () => {
      entered();
      await blocked;
    });
    await started;
    const publish = vi.fn<() => Promise<void>>();
    try {
      expect(await second.publishNext(publish)).toBe(false);
      expect(publish).not.toHaveBeenCalled();
    } finally {
      release();
      await first;
    }
  });

  it('refuses an action snapshot the worker could not execute', async () => {
    const workflow = await dueWorkflow();
    expect(await scheduler.enqueueDue()).toBe(1);
    const update = (action: string) => db.query(
      'UPDATE execution_outbox SET action = $1::jsonb WHERE tenant_id = $2', [action, ACME]
    );
    const constraint = 'ck_execution_outbox_action_shape';
    expect(workflow.action).toEqual({ type: 'noop' });

    await expect(update('{"type": "webhook", "url": "https://example.com/hook"}')).rejects.toThrow(constraint);
    await expect(update('{"type": "webhook", "method": "POST"}')).rejects.toThrow(constraint);
    await expect(update('{"type": "webhook", "url": "https://example.com/hook", "method": "TRACE"}')).rejects.toThrow(constraint);
    await expect(update('{"type": "noop", "url": "https://example.com/hook"}')).rejects.toThrow(constraint);
    await expect(update('{}')).rejects.toThrow(constraint);
    await expect(update('{"type": null, "url": "https://example.com/hook", "method": "POST"}')).rejects.toThrow(constraint);
    await expect(update('{"type": "webhook", "url": null, "method": "POST"}')).rejects.toThrow(constraint);
    await expect(update('{"url": "https://example.com/hook", "method": "POST"}')).rejects.toThrow(constraint);

    await expect(update('{"type": "webhook", "url": "https://example.com/hook", "method": "POST"}')).resolves.toBeDefined();
  });

  it('parks a schedule the parser refuses without reverting the claims beside it', async () => {
    const healthy = await dueWorkflow();
    const poisoned = crypto.randomUUID();
    const later = new Date(overdue.getTime() + 1_000);
    await db.query(`
      INSERT INTO workflows (id, tenant_id, name, enabled, cron_expr, timezone, action_type, action_config, next_run_at)
      VALUES ($1, $2, 'Unschedulable', true, '0 3 * * *', 'Mars/Olympus', 'noop', '{}', $3)
    `, [poisoned, ACME, later]);

    expect(await scheduler.enqueueDue()).toBe(1);

    const claimed = await storedWorkflow(healthy.id);
    expect(claimed.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    const stored = await db.getRepository(RunEntity).find();
    expect(stored.map((run) => run.workflowId)).toEqual([healthy.id]);

    const parked = await storedWorkflow(poisoned);
    expect(parked.enabled).toBe(false);
    expect(parked.nextRunAt).toBeNull();
    expect(await scheduler.enqueueDue()).toBe(0);
  });

  it('keeps a pending occurrence on rename, resets changed schedules and excludes disabled workflows', async () => {
    const workflow = await dueWorkflow();
    const p1 = { enabled: true, cronExpr: '* * * * *', name: 'Renamed' };
    const input = aWorkflow(p1);
    await workflows.update({ tenantId: ACME }, workflow.id, input);
    expect((await storedWorkflow(workflow.id)).nextRunAt).toEqual(overdue);

    const changed = { ...input, timezone: 'America/New_York' };
    await workflows.update({ tenantId: ACME }, workflow.id, changed);
    expect((await storedWorkflow(workflow.id)).nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await scheduler.enqueueDue()).toBe(0);

    const disabled = { ...changed, enabled: false };
    await workflows.update({ tenantId: ACME }, workflow.id, disabled);
    expect((await storedWorkflow(workflow.id)).nextRunAt).toBeNull();
    expect(await scheduler.enqueueDue()).toBe(0);
  });
});
