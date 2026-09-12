import type { HealthMetrics, QueueMetrics, TenantContext } from '@opsflow/contracts';
import { CurrentTenant } from '../../common/tenant/current-tenant';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { MetricsRepository } from '@opsflow/persistence';
import { TenantGuard } from '../../common/tenant/tenant.guard';
import { RuntimeClientService } from '../runtime-client.service';

const UNREACHABLE: QueueMetrics = { reachable: false, waiting: 0, active: 0, delayed: 0, failed: 0, workers: 0 };

@Controller('metrics')
@UseGuards(TenantGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsRepository, private readonly runtime: RuntimeClientService) {}

  @Get()
  async health(@CurrentTenant() context: TenantContext): Promise<HealthMetrics> {
    const stats = await this.metrics.runStats(context);
    // A queue we cannot reach is reported as such; the run stats still stand on their own.
    const queue = await this.runtime.metrics().catch((): QueueMetrics => UNREACHABLE);
    const ratio = (part: number, whole: number) => (whole === 0 ? null : part / whole);
    const p95 = stats.p95DurationMs === null ? null : Math.round(Number(stats.p95DurationMs));
    const p1 = { sampleSize: stats.sampleSize, windowHours: stats.windowHours };
    const p2 = { successRate: ratio(stats.succeeded, stats.finished), retryRate: ratio(stats.retried, stats.sampleSize) };
    const p3 = { p95DurationMs: p95, exhaustedRuns: stats.exhausted, outboxPending: stats.outboxPending };
    return { ...p1, ...p2, ...p3, queue };
  }
}
