import { serviceBaseUrl } from '@opsflow/testing';

describe('worker over HTTP', () => {
  it('answers the liveness probe once it has booted', async () => {
    const res = await fetch(`${serviceBaseUrl('worker')}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'worker' });
  });
});
