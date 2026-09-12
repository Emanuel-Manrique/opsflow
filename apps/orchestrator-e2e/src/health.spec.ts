import { serviceBaseUrl } from '@opsflow/testing';

describe('orchestrator over HTTP', () => {
  it('answers the liveness probe once it has booted', async () => {
    const res = await fetch(`${serviceBaseUrl('orchestrator')}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'orchestrator' });
  });

  it('checks Postgres, migrations and Redis before reporting ready', async () => {
    const res = await fetch(`${serviceBaseUrl('orchestrator')}/api/ready`);
    expect(res.status).toBe(200);
    const checks = { database: 'up', migrations: 'up', queue: 'up' };
    expect(await res.json()).toEqual({ status: 'ready', checks });
  });
});
