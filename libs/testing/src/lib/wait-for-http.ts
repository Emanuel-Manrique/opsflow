import type { WaitForHttpOptions } from './service-url.types';

export async function waitForHttpOk(url: string, options: WaitForHttpOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 200;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
      lastError = new Error(`${url} responded ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${url}`, { cause: lastError });
}
