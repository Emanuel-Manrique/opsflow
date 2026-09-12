import { waitForHttpOk } from './wait-for-http';

describe('waitForHttpOk', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves when the endpoint returns ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );

    await expect(
      waitForHttpOk('http://localhost:3000/api', { timeoutMs: 500 })
    ).resolves.toBeUndefined();
  });
});
