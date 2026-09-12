import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RetentionRepository, SchedulerRepository } from '@opsflow/persistence';
import type { RunQueue } from './run-queue';
import { SchedulerService } from './scheduler.service';

describe('SchedulerService', () => {
  const r1 = { enqueueDue: vi.fn<SchedulerRepository['enqueueDue']>() };
  const repository = { ...r1, publishNext: vi.fn<SchedulerRepository['publishNext']>() };
  const queue = { logDepth: vi.fn<RunQueue['logDepth']>(), reconcileFailures: vi.fn<RunQueue['reconcileFailures']>().mockResolvedValue(undefined), enqueue: vi.fn<RunQueue['enqueue']>() };
  const retention = { purge: vi.fn<RetentionRepository['purge']>() };
  let service: SchedulerService;

  function schedulerWith(env: Record<string, unknown> = {}): SchedulerService {
    const repo = repository as unknown as SchedulerRepository;
    const store = retention as unknown as RetentionRepository;
    return new SchedulerService(repo, queue as unknown as RunQueue, store, new ConfigService(env));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    repository.enqueueDue.mockResolvedValue(0);
    repository.publishNext.mockResolvedValue(false);
    retention.purge.mockResolvedValue({ runs: 0, auditEntries: 0 });
    service = schedulerWith();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sweeps every 30 seconds and retries publication on the next tick', async () => {
    const job = { runId: 'run', tenantId: 'tenant', action: { type: 'noop' as const } };
    repository.enqueueDue.mockRejectedValueOnce(new Error('Database down'));
    repository.publishNext.mockImplementationOnce(async (publish) => {
      await publish(job);
      return true;
    });
    queue.enqueue.mockRejectedValueOnce(new Error('Redis down'));
    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.enqueue).toHaveBeenCalledWith(job);
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'scheduler.claim', errorCode: 'Error' }));
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'outbox.failure', errorCode: 'Error' }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(repository.publishNext).toHaveBeenCalledTimes(2);
    expect(repository.enqueueDue).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(repository.enqueueDue).toHaveBeenCalledTimes(2);
  });

  it('does not overlap ticks and drains an in-flight publish on shutdown', async () => {
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { release = resolve; });
    repository.publishNext.mockReturnValueOnce(pending);
    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repository.enqueueDue).toHaveBeenCalledOnce();
    expect(repository.publishNext).toHaveBeenCalledOnce();
    const shutdown = service.onModuleDestroy();
    release(true);
    await shutdown;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(repository.publishNext).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps every run unless a retention window is configured', async () => {
    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(retention.purge).not.toHaveBeenCalled();

    await service.onModuleDestroy();
    service = schedulerWith({ RETENTION_DAYS: 14 });
    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(retention.purge).toHaveBeenCalledExactlyOnceWith(14);
  });

  it('keeps sweeping when a purge fails', async () => {
    service = schedulerWith({ RETENTION_DAYS: 14 });
    retention.purge.mockRejectedValue(new Error('Deadlock detected'));
    service.onModuleInit();

    await vi.advanceTimersByTimeAsync(2_000);

    expect(repository.publishNext).toHaveBeenCalled();
  });
});
