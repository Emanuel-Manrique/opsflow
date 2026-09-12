import type { Response } from 'express';
import type { PersistenceHealth } from '@opsflow/persistence';
import type { RunProcessor } from '../run-processor';
import { HealthController } from './health.controller';

const up = { database: 'up', migrations: 'up' } as const;

function controllerFor(report: typeof up, queue: 'up' | 'down') {
  const persistence = { check: vi.fn<PersistenceHealth['check']>().mockResolvedValue(report) };
  const processor = { check: vi.fn<RunProcessor['check']>().mockResolvedValue(queue) };
  const db = persistence as unknown as PersistenceHealth;
  return new HealthController(db, processor as unknown as RunProcessor);
}

function response(): Response {
  const res = { status: vi.fn<Response['status']>() } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe('worker HealthController', () => {
  it('keeps liveness independent from the queue', () => {
    expect(controllerFor(up, 'down').health()).toEqual({ status: 'ok', service: 'worker' });
  });

  it('is not ready while it is detached from the queue', async () => {
    const res = response();

    const readiness = await controllerFor(up, 'down').ready(res);

    expect(readiness).toEqual({ status: 'not_ready', checks: { ...up, queue: 'down' } });
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('is ready when it is attached to both the database and the queue', async () => {
    const res = response();

    const readiness = await controllerFor(up, 'up').ready(res);

    expect(readiness.status).toBe('ready');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
