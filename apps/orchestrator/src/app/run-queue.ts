import { Injectable, Logger } from '@nestjs/common';
import { observe } from '@opsflow/observability';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { RUN_ATTEMPTS, RUN_JOB, RUN_QUEUE } from '@opsflow/contracts';
import { RunRepository } from '@opsflow/persistence';
import type { DependencyStatus, RunJobData, RuntimeMetrics } from '@opsflow/contracts';

@Injectable()
export class RunQueue implements OnApplicationShutdown {
  private readonly logger = new Logger(RunQueue.name);
  private readonly queue: Queue<RunJobData, void, typeof RUN_JOB>;

  constructor(config: ConfigService, private readonly runs: RunRepository) {
    const url = config.getOrThrow<string>('REDIS_URL');
    const p1 = { url, maxRetriesPerRequest: 1, enableOfflineQueue: false };
    const connection = { ...p1, connectTimeout: 2_000, commandTimeout: 2_000 };
    // compose pins redis
    const p2 = { skipWaitingForReady: true, skipVersionCheck: true };
    this.queue = new Queue(RUN_QUEUE, { connection, ...p2 });
    this.queue.on('error', (error) => this.logger.warn({ event: 'redis.error', errorCode: error.name }));
  }

  async enqueue(data: RunJobData): Promise<void> {
    const p1 = { jobId: data.runId, removeOnComplete: true };
    const backoff = { type: 'exponential', delay: 1_000 };
    const options = { ...p1, removeOnFail: false, attempts: RUN_ATTEMPTS, backoff };
    const attributes = { tenantId: data.tenantId, workflowId: data.workflowId, runId: data.runId, requestId: data.requestId };
    await observe('queue.publish', attributes, async ({ traceparent }) => {
      await this.queue.add(RUN_JOB, { ...data, traceparent }, options);
    }, data.traceparent);
  }

  async logDepth(): Promise<void> {
    const attributes: Record<string, number> = {};
    await observe('queue.depth', attributes, async () => {
      Object.assign(attributes, await this.queue.getJobCounts('wait', 'active', 'delayed', 'failed'));
    });
  }

  async reconcileFailures(): Promise<void> {
    const jobs = await this.queue.getJobs(['failed'], 0, 49, true);
    for (const job of jobs) {
      const context = { tenantId: job.data.tenantId };
      await this.runs.reconcileFailure(context, job.data.runId, job.attemptsStarted, job.failedReason);
      // PostgreSQL keeps the dead letter; remove Redis data only after the DB write succeeds.
      await job.remove();
    }
  }

  /** Live counters. Redis being down is reported, never rounded down to zeros. */
  async metrics(): Promise<RuntimeMetrics> {
    const empty = { waiting: 0, active: 0, delayed: 0, failed: 0, workers: 0 };
    try {
      const counts = await this.queue.getJobCounts('wait', 'active', 'delayed', 'failed');
      const workers = await this.queue.getWorkers();
      const p1 = { waiting: counts['wait'] ?? 0, active: counts['active'] ?? 0 };
      return { reachable: true, ...p1, delayed: counts['delayed'] ?? 0, failed: counts['failed'] ?? 0, workers: workers.length };
    } catch {
      return { reachable: false, ...empty };
    }
  }

  async check(): Promise<DependencyStatus> {
    try {
      await this.queue.getJobCounts('wait');
      return 'up';
    } catch {
      return 'down';
    }
  }

  async onApplicationShutdown(): Promise<void> {
    // nothing to drain
    await this.queue.disconnect();
  }
}
