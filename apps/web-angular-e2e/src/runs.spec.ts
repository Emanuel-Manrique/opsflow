import { DEMO_TENANTS } from '@opsflow/contracts';
import { createServer } from 'node:http';
import type { ExportedSpan, TraceExport } from './tracing.types';
import { expect, test } from '@playwright/test';

const mutationHeaders = { 'x-opsflow-request': '1', 'x-tenant-id': DEMO_TENANTS.acme };
test.beforeEach(async ({ context }) => {
  const response = await context.request.post('/api/session/demo', { data: { role: 'admin' }, headers: mutationHeaders });
  expect(response.status()).toBe(204);
});

// same sink as the worker
test.describe.configure({ mode: 'default' });

const attempts = new Map<string, { key: string | undefined; at: number }[]>();
const recovered = new Set<string>();
const received = new Map<string, string | undefined>();
const sink = createServer((request, response) => {
  received.set(request.url!, request.method);
  const path = request.url!;
  const history = attempts.get(path) ?? [];
  history.push({ key: request.headers['idempotency-key'] as string | undefined, at: Date.now() });
  attempts.set(path, history);
  if (request.url!.startsWith('/slow/')) return;
  const transient = path.startsWith('/flaky/') && history.length < 3;
  response.statusCode = (path.startsWith('/fail/') && !recovered.has(path)) || transient ? 500 : 204;
  response.end();
});

const spans: ExportedSpan[] = [];
const collector = createServer(async (request, response) => {
  try {
    let body = '';
    for await (const chunk of request) body += chunk.toString();
    const payload = JSON.parse(body) as TraceExport;
    for (const resource of payload.resourceSpans ?? []) {
      for (const scope of resource.scopeSpans ?? []) spans.push(...scope.spans);
    }
    response.setHeader('content-type', 'application/json');
    response.end('{}');
  } catch {
    response.statusCode = 400;
    response.end();
  }
});

test.beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    collector.once('error', reject);
    collector.listen(18082, '127.0.0.1', resolve);
  });
  await new Promise<void>((resolve, reject) => {
    sink.once('error', reject);
    sink.listen(18081, '127.0.0.1', resolve);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    collector.close((error) => error ? reject(error) : resolve());
    collector.closeAllConnections();
  });
  await new Promise<void>((resolve, reject) => {
    sink.close((error) => error ? reject(error) : resolve());
    sink.closeAllConnections();
  });
});

for (const status of ['succeeded', 'failed'] as const) {
  test(`executes a real webhook and displays ${status}`, async ({ page }) => {
    const name = `E2E webhook ${status} ${crypto.randomUUID()}`;
    const path = `/${status === 'failed' ? 'fail' : 'ok'}/${name}`;
    const url = `http://127.0.0.1:18081${encodeURI(path)}`;

    await page.goto('/workflows/new');
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    const action = page.getByRole('combobox', { name: 'Action', exact: true });
    await action.selectOption('webhook');
    await page.getByRole('textbox', { name: 'Webhook URL' }).fill(url);
    await page.getByRole('combobox', { name: 'Method' }).selectOption('POST');
    await page.getByRole('button', { name: 'Create workflow' }).click();
    await page.getByRole('button', { name: `Run ${name} now` }).click();
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/);

    await expect(page.getByRole('status', { name: 'Run status' })).toHaveText(status, { timeout: 15_000 });

    expect(received.get(encodeURI(path))).toBe('POST');
    if (status === 'failed') {
      await expect(page.getByRole('alert')).toContainText('HTTP 500');
      const history = attempts.get(encodeURI(path))!;
      expect(history).toHaveLength(3);
      expect(new Set(history.map((attempt) => attempt.key)).size).toBe(1);
      expect(history[1].at - history[0].at).toBeGreaterThanOrEqual(900);
      expect(history[2].at - history[1].at).toBeGreaterThanOrEqual(1_900);
    }
    await page.reload();
    const persisted = page.getByRole('status', { name: 'Run status' });
    await expect(persisted).toHaveText(status, { timeout: 15_000 });
    if (status === 'failed') {
      const original = page.url();
      recovered.add(encodeURI(path));
      await page.getByRole('button', { name: 'Retry run', exact: true }).click();
      await expect(page).not.toHaveURL(original);
      await expect(page.getByRole('status', { name: 'Run status' })).toHaveText('succeeded');
      await expect(page.getByRole('link', { name: 'View original run' })).toBeVisible();
      const history = attempts.get(encodeURI(path))!;
      expect(history).toHaveLength(4);
      expect(history[3].key).not.toBe(history[0].key);
    }
  });
}

test('cancels an active webhook through REST and gRPC and persists the result', async ({ page, context }) => {
  const request = context.request;
  const name = `E2E cancel ${crypto.randomUUID()}`;
  const path = `/slow/${crypto.randomUUID()}`;
  const webhook = { url: `http://127.0.0.1:18081${path}`, method: 'POST' };
  const p1 = { name, enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC' };
  const data = { ...p1, actionType: 'webhook', webhook };
  const created = await request.post('/api/workflows', { data, headers: mutationHeaders });
  expect(created.status()).toBe(201);
  const workflow = await created.json();
  const started = await request.post(`/api/workflows/${workflow.id}/runs`, { headers: mutationHeaders });
  expect(started.status()).toBe(202);
  const run = await started.json();
  await expect.poll(() => received.has(path)).toBe(true);

  let connections = 0;
  await page.route(`**/api/runs/${run.id}/events`, async (route) => {
    connections++;
    expect(route.request().headers()['x-tenant-id']).toBe(DEMO_TENANTS.acme);
    if (connections === 1) await route.abort('failed');
    else await route.continue();
  });
  await page.goto(`/runs/${run.id}`);
  await page.getByRole('button', { name: 'Cancel run', exact: true }).click();
  expect(connections).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('status', { name: 'Run status' })).toHaveText('cancelled');
  await page.reload();
  await expect(page.getByRole('status', { name: 'Run status' })).toHaveText('cancelled');
  await expect(page.getByRole('button', { name: 'Cancel run', exact: true })).toHaveCount(0);
});

test('recovers a transient webhook failure on the third automatic attempt', async ({ page, context }, testInfo) => {
  const name = `E2E recovery ${crypto.randomUUID()}`;
  const path = `/flaky/${crypto.randomUUID()}`;
  const webhook = { url: `http://127.0.0.1:18081${path}`, method: 'POST' };
  const p1 = { name, enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC' };
  const data = { ...p1, actionType: 'webhook', webhook };
  const created = await context.request.post('/api/workflows', { data, headers: mutationHeaders });
  expect(created.status()).toBe(201);
  const workflow = await created.json();
  const traceId = crypto.randomUUID().replaceAll('-', '');
  const traceparent = ['00', traceId, '2222222222222222', '01'].join('-');
  const headers = { ...mutationHeaders, traceparent };
  const started = await context.request.post(`/api/workflows/${workflow.id}/runs`, { headers });
  expect(started.status()).toBe(202);
  expect(started.headers()['traceparent'].split('-')[1]).toBe(traceId);
  const run = await started.json();
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByRole('status', { name: 'Run status' })).toHaveText('succeeded', { timeout: 15_000 });
  await expect(page.getByText('Attempts started: 3')).toBeVisible();
  expect(attempts.get(path)).toHaveLength(3);
  const exported = () => spans.filter((span) => span.traceId === traceId);
  await expect.poll(() => exported().filter((span) => span.name === 'run.attempt').length, { timeout: 15_000 }).toBe(3);
  await expect.poll(() => exported().length, { timeout: 15_000 }).toBe(7);
  const chain = ['http.request', 'rpc.client.RunNow', 'rpc.server.RunNow', 'queue.publish'];
  let parentSpanId = '2222222222222222';
  for (const name of chain) {
    const span = exported().find((span) => span.name === name)!;
    expect(span, name).toBeDefined();
    expect(span.parentSpanId, name).toBe(parentSpanId);
    parentSpanId = span.spanId;
  }
  const workers = exported().filter((span) => span.name === 'run.attempt');
  for (const worker of workers) {
    expect(worker.parentSpanId).toBe(parentSpanId);
    expect(worker.attributes).toContainEqual({ key: 'runId', value: { stringValue: run.id } });
    expect(worker.attributes).toContainEqual({ key: 'tenantId', value: { stringValue: DEMO_TENANTS.acme } });
  }
  expect(workers.map((span) => span.status.code).sort()).toEqual([0, 2, 2]);
  const body = Buffer.from(JSON.stringify(exported(), null, 2));
  await testInfo.attach('execution-trace.json', { body, contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('recovered-run.png'), fullPage: true });
});
