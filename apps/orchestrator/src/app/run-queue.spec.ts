import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import type { RunRepository } from '@opsflow/persistence';
import { RunQueue } from './run-queue';

const queue = vi.hoisted(() => ({ getJobs: vi.fn<Queue['getJobs']>(), on: vi.fn<Queue['on']>() }));
vi.mock('bullmq', () => ({ Queue: class { getJobs = queue.getJobs; on = queue.on; } }));

it('keeps failed queue jobs until their state is reconciled in the correct tenant', async () => {
  const tenantId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const job = { data: { tenantId, runId }, attemptsStarted: 3, failedReason: 'Worker stalled', remove };
  queue.getJobs.mockResolvedValue([job as unknown as Job]);
  const reconcileFailure = vi.fn<RunRepository['reconcileFailure']>();
  const runs = { reconcileFailure } as unknown as RunRepository;
  const config = new ConfigService({ REDIS_URL: 'redis://localhost:6379' });
  const publisher = new RunQueue(config, runs);
  reconcileFailure.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(publisher.reconcileFailures()).rejects.toThrow('Database unavailable');
  expect(remove).not.toHaveBeenCalled();
  reconcileFailure.mockImplementationOnce(async (context) => { expect(context.tenantId).toBe(tenantId); });
  await publisher.reconcileFailures();
  expect(reconcileFailure).toHaveBeenLastCalledWith({ tenantId }, runId, 3, 'Worker stalled');
  expect(remove).toHaveBeenCalledOnce();
});
