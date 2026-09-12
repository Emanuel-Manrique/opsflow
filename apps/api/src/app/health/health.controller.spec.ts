import type { Response } from 'express';
import type { PersistenceHealth } from '@opsflow/persistence';
import { HealthController } from './health.controller';
import type { RuntimeClientService } from '../runtime-client.service';

const health = vi.fn<RuntimeClientService['health']>().mockRejectedValue(new Error('Down'));
const runtime = { health } as unknown as RuntimeClientService;

describe('HealthController', () => {
  it('keeps liveness independent from persistence', () => {
    const persistence = { check: vi.fn<PersistenceHealth['check']>() } as unknown as PersistenceHealth;
    const controller = new HealthController(persistence, runtime);

    expect(controller.health()).toEqual({ status: 'ok', service: 'api' });
    expect(persistence.check).not.toHaveBeenCalled();
  });

  it('returns 503 when a dependency is down', async () => {
    const report = { database: 'down', migrations: 'up' } as const;
    const persistence = { check: vi.fn<PersistenceHealth['check']>().mockResolvedValue(report) } as unknown as PersistenceHealth;
    const response = { status: vi.fn<Response['status']>() } as unknown as Response;
    vi.mocked(response.status).mockReturnValue(response);
    const controller = new HealthController(persistence, runtime);

    expect((await controller.ready(response)).status).toBe('not_ready');
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
