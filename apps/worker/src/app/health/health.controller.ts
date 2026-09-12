import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse, ReadinessResponse } from '@opsflow/contracts';
import { PersistenceHealth } from '@opsflow/persistence';
import { RunProcessor } from '../run-processor';

@Controller()
export class HealthController {
  constructor(private readonly persistence: PersistenceHealth, private readonly processor: RunProcessor) {}

  @Get('health')
  health(): HealthResponse {
    return { status: 'ok', service: 'worker' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const pending = [this.persistence.check(), this.processor.check()] as const;
    const [database, queue] = await Promise.all(pending);
    const checks = { ...database, queue };
    const ready = Object.values(checks).every((value) => value === 'up');
    res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return { status: ready ? 'ready' : 'not_ready', checks };
  }
}
