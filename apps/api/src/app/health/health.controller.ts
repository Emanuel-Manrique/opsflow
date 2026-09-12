import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse, ReadinessResponse } from '@opsflow/contracts';
import { PersistenceHealth } from '@opsflow/persistence';
import { RuntimeClientService } from '../runtime-client.service';

@Controller()
export class HealthController {
  constructor(private readonly persistence: PersistenceHealth, private readonly runtime: RuntimeClientService) {}

  @Get('health')
  health(): HealthResponse {
    return { status: 'ok', service: 'api' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    const runtimeCheck = this.runtime.health()
      .then((health) => health.status === 'ready').catch(() => false);
    const pending = [this.persistence.check(), runtimeCheck] as const;
    const [database, runtime] = await Promise.all(pending);
    // redis can be down; the run is already in the outbox
    const checks = { ...database, runtime: runtime ? 'up' as const : 'down' as const };
    const ready = Object.values(checks).every((value) => value === 'up');
    res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return { status: ready ? 'ready' : 'not_ready', checks };
  }
}
