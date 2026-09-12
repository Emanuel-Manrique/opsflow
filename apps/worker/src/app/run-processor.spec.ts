import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { Job } from 'bullmq';
import type { RunJobData } from '@opsflow/contracts';
import type { RunEventRepository, RunRepository } from '@opsflow/persistence';
import { RunProcessor } from './run-processor';

vi.mock('bullmq', async (original) => ({
  ...await original<typeof import('bullmq')>(),
  Worker: vi.fn<typeof Worker>(class {
    on = vi.fn<() => void>();
    waitUntilReady = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  } as unknown as typeof Worker),
}));

describe('RunProcessor', () => {
  const tenantId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const url = 'http://localhost:8081/hooks/demo';
  const action = { type: 'webhook' as const, url, method: 'POST' as const };
  const data: RunJobData = { tenantId, runId, action };
  const r1 = { markRunning: vi.fn<RunRepository['markRunning']>(), markSucceeded: vi.fn<RunRepository['markSucceeded']>() };
  const r2 = { markFailed: vi.fn<RunRepository['markFailed']>(), isCancellationRequested: vi.fn<RunRepository['isCancellationRequested']>() };
  const runs = { ...r1, ...r2 };
  const events = { append: vi.fn<RunEventRepository['append']>() };
  const fetchMock = vi.fn<typeof fetch>();
  let processor: RunProcessor;

  beforeEach(async () => {
    vi.clearAllMocks();
    runs.markRunning.mockResolvedValue(true);
    runs.markSucceeded.mockResolvedValue('succeeded');
    runs.markFailed.mockResolvedValue('retrying');
    runs.isCancellationRequested.mockResolvedValue(false);
    events.append.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock);
    const p1 = { REDIS_URL: 'redis://localhost:6379' };
    const p2 = { WEBHOOK_ALLOWED_ORIGINS: 'http://localhost:8081' };
    const config = new ConfigService({ ...p1, ...p2 });
    const store = events as unknown as RunEventRepository;
    processor = new RunProcessor(config, runs as unknown as RunRepository, store);
    await processor.onModuleInit();
  });

  afterEach(async () => {
    await processor.onModuleDestroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function process(jobData = data, attempt = 1) {
    const handler = vi.mocked(Worker).mock.calls[0][1];
    if (typeof handler !== 'function') throw new Error('Missing processor');
    await handler({ data: jobData, attemptsStarted: attempt } as Job<RunJobData>);
  }

  it('executes under the job tenant and releases the response body', async () => {
    runs.markRunning.mockImplementationOnce(async (context) => {
      expect(context.tenantId).toBe(tenantId);
      return true;
    });
    const response = new Response('ignored');
    const cancel = vi.spyOn(response.body!, 'cancel');
    fetchMock.mockResolvedValueOnce(response);

    await process();

    const p1 = { method: 'POST', redirect: 'manual', headers: { 'Idempotency-Key': runId, 'X-Opsflow-Attempt': '1' } };
    const options = { ...p1, signal: expect.any(AbortSignal) };
    expect(fetchMock).toHaveBeenCalledWith(new URL(url), options);
    expect(cancel).toHaveBeenCalledOnce();
    expect(runs.markSucceeded).toHaveBeenCalledWith({ tenantId }, runId, 1);
    expect(runs.markFailed).not.toHaveBeenCalled();
  });

  it('completes a noop without making an HTTP request', async () => {
    await process({ ...data, action: { type: 'noop' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runs.markSucceeded).toHaveBeenCalledWith({ tenantId }, runId, 1);
  });

  it.each([500, 302])('classifies HTTP %s without following redirects', async (status) => {
    const headers = { location: 'http://169.254.169.254/latest' };
    fetchMock.mockResolvedValueOnce(new Response('', { status, headers }));

    const message = `Webhook returned HTTP ${status}.`;
    await expect(process()).rejects.toThrow(message);
    expect(runs.markFailed).toHaveBeenCalledWith({ tenantId }, runId, message, 1, status === 500);
    expect(runs.markSucceeded).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    'http://169.254.169.254/latest',
    'http://localhost.evil.example:8081/hooks',
    'http://user:secret@localhost:8081/hooks',
    'ftp://localhost:8081/hooks',
  ])('rejects an untrusted destination before sending: %s', async (url) => {
    const job = { ...data, action: { ...action, url } };
    await expect(process(job)).rejects.toThrow('not allowed');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runs.markFailed).toHaveBeenCalledOnce();
  });

  it('aborts a slow webhook and records the failure', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(controller.signal);
    fetchMock.mockImplementationOnce(async (_url, options) => {
      return new Promise((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => {
          reject(options!.signal!.reason);
        });
        queueMicrotask(() => controller.abort(new Error('Webhook timed out.')));
      });
    });

    await expect(process()).rejects.toThrow('Webhook timed out.');

    expect(AbortSignal.timeout).toHaveBeenCalledWith(5_000);
    expect(runs.markFailed).toHaveBeenCalledWith({ tenantId }, runId, 'Webhook timed out.', 1, true);
  });

  function recorded() {
    return events.append.mock.calls.map(([, event]) => event.type);
  }

  it('records the attempt, the request and the win', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await process();

    expect(recorded()).toEqual(['attempt.started', 'http.request', 'http.succeeded', 'run.succeeded']);
    const [, success] = events.append.mock.calls[2];
    expect(success).toMatchObject({ runId, attempt: 1, detail: '204' });
    expect(success.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records a 500 as a failed exchange and a scheduled retry', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(process()).rejects.toThrow('HTTP 500');

    expect(recorded()).toEqual(['attempt.started', 'http.request', 'http.failed', 'worker.failed', 'retry.scheduled']);
    const [, http] = events.append.mock.calls[2];
    expect(http).toMatchObject({ errorCode: 'HTTP_500', detail: '500' });
    const [, retry] = events.append.mock.calls[4];
    expect(retry).toMatchObject({ errorCode: 'HTTP_500', detail: 'attempt 2/3' });
  });

  it('uses the network failure code without parsing or persisting the transport message', async () => {
    fetchMock.mockRejectedValueOnce(new Error('private transport detail HTTP 500'));
    await expect(process()).rejects.toThrow('Webhook request failed.');
    expect(runs.markFailed).toHaveBeenCalledWith({ tenantId }, runId, 'Webhook request failed.', 1, true);
    const failures = events.append.mock.calls.map(([, event]) => event).filter((event) => event.errorCode);
    expect(failures.map((event) => event.errorCode)).toEqual(['NETWORK', 'NETWORK', 'NETWORK']);
  });

  it('recovers on the next attempt with the same idempotency key', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(process()).rejects.toThrow('HTTP 500');
    await process(data, 2);
    const headers = fetchMock.mock.calls.map(([, options]) => options?.headers);
    expect(headers).toEqual([{ 'Idempotency-Key': runId, 'X-Opsflow-Attempt': '1' }, { 'Idempotency-Key': runId, 'X-Opsflow-Attempt': '2' }]);
    expect(runs.markSucceeded).toHaveBeenCalledWith({ tenantId }, runId, 2);
    expect(recorded()).toContain('retry.scheduled');
    expect(recorded().at(-1)).toBe('run.succeeded');
  });

  it('records the last attempt as a failed run, not another retry', async () => {
    runs.markFailed.mockResolvedValueOnce('failed');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(process()).rejects.toThrow('HTTP 500');

    expect(recorded()).toContain('run.failed');
    expect(recorded()).not.toContain('retry.scheduled');
  });

  it('never puts the request path or query in an event', async () => {
    const secret = { ...action, url: 'http://localhost:8081/hooks/demo?token=s3cret' };
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await process({ ...data, action: secret });

    const details = events.append.mock.calls.map(([, event]) => event.detail).filter(Boolean);
    expect(details).toContain('POST localhost:8081');
    for (const detail of details) expect(detail).not.toContain('s3cret');
  });

  it('completes the attempt even when the event log is unavailable', async () => {
    events.append.mockRejectedValue(new Error('run_events is gone'));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(process()).resolves.toBeUndefined();
    expect(runs.markSucceeded).toHaveBeenCalledOnce();
  });

  it('does not execute if the run cannot transition to running', async () => {
    runs.markRunning.mockResolvedValueOnce(false);
    await process();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runs.markFailed).not.toHaveBeenCalled();
  });

  it('aborts an in-flight webhook when cancellation is requested', async () => {
    runs.isCancellationRequested.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    runs.isCancellationRequested.mockResolvedValue(true);
    runs.markFailed.mockResolvedValueOnce('cancelled');
    fetchMock.mockImplementationOnce(async (_url, options) => {
      return new Promise((_resolve, reject) => {
        const signal = options!.signal!;
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    });
    await process();
    expect(runs.markFailed).toHaveBeenCalledWith({ tenantId }, runId, 'Run cancelled.', 1, false);
    expect(runs.markSucceeded).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(recorded()).not.toContain('worker.failed');
    expect(recorded()).not.toContain('retry.scheduled');
    expect(recorded().at(-1)).toBe('run.cancelled');
  });

  it('logs the persisted cancellation if it wins against action completion', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    runs.markSucceeded.mockResolvedValueOnce('cancelled');
    await process({ ...data, action: { type: 'noop' } });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'run.attempt', runId, outcome: 'cancelled' }));
  });

  it('does not record a database failure as a failed external action', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    runs.markSucceeded.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(process()).rejects.toThrow('Database unavailable');
    expect(runs.markFailed).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ event: 'run.attempt', runId, outcome: 'error' }));
  });
});
