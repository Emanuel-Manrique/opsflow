import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RetentionRepository, SchedulerRepository } from '@opsflow/persistence';
import { observe } from '@opsflow/observability';
import { RunQueue } from './run-queue';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<void>;
  private stopped = false;
  private nextSweep = 0;
  private nextPurge = 0;

  constructor(private readonly scheduler: SchedulerRepository, private readonly queue: RunQueue, private readonly retention: RetentionRepository, private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.startTick();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.pending;
  }

  private startTick(): void {
    this.pending = this.tick().finally(() => {
      if (!this.stopped) this.timer = setTimeout(() => this.startTick(), 1_000);
    });
  }

  private async purge(): Promise<void> {
    const days = this.config.get<number>('RETENTION_DAYS');
    if (!days || Date.now() < this.nextPurge) return;
    this.nextPurge = Date.now() + 3_600_000;
    try {
      await this.retention.purge(days);
    } catch (error) {
      const errorCode = error instanceof Error ? error.name : 'Error';
      this.logger.error({ event: 'retention.failure', errorCode });
    }
  }

  private async tick(): Promise<void> {
    if (Date.now() >= this.nextSweep) {
      try {
        const attributes = { claimed: 0 };
        await observe('scheduler.claim', attributes, async ({ traceparent }) => {
          attributes.claimed = await this.scheduler.enqueueDue(traceparent);
        });
        await this.queue.logDepth();
      } catch {
        // observe records the failure; the next sweep retries.
      }
      this.nextSweep = Date.now() + 30_000;
    }

    await this.purge();

    try {
      await this.queue.reconcileFailures();
      for (let i = 0; i < 50 && !this.stopped; i++) {
        const published = await this.scheduler.publishNext((job) => this.queue.enqueue(job));
        if (!published) break;
      }
    } catch (error) {
      // rolled back, next tick retries
      this.logger.error({ event: 'outbox.failure', errorCode: error instanceof Error ? error.name : 'Error' });
    }
  }
}
