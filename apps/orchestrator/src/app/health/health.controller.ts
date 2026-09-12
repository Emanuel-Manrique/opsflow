import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse, ReadinessResponse } from '@opsflow/contracts';
import { RunQueue } from '../run-queue';
import { PersistenceHealth } from '@opsflow/persistence';

@Controller()
export class HealthController {
  constructor(private readonly persistence: PersistenceHealth, private readonly queue: RunQueue) {}

  @Get('health')
  health(): HealthResponse {
    return { status: 'ok', service: 'orchestrator' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const pending = [this.persistence.check(), this.queue.check()] as const;
    const [persistence, queue] = await Promise.all(pending);
    const checks = { ...persistence, queue };
    const ready = Object.values(checks).every((value) => value === 'up');
    res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return { status: ready ? 'ready' : 'not_ready', checks };
  }
}
