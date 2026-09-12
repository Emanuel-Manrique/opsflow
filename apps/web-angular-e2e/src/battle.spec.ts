import { DEMO_TENANTS } from '@opsflow/contracts';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

const mutationHeaders = { 'x-opsflow-request': '1', 'x-tenant-id': DEMO_TENANTS.acme };

const chaosLab = (page: Page) => page.getByRole('region', { name: 'Chaos Lab' });
const inspector = (page: Page) => page.getByRole('region', { name: 'Run Inspector' });
const stream = (page: Page) => page.getByRole('region', { name: 'Event Stream' });
const arena = (page: Page) => page.getByRole('region', { name: 'Battle arena' });
const overview = (page: Page) => page.getByRole('region', { name: 'Run overview' });
const runStatus = (page: Page) => page.getByRole('status', { name: 'Run status' });

test.beforeEach(async ({ context }) => {
  const response = await context.request.post('/api/session/demo', { data: { role: 'admin' }, headers: mutationHeaders });
  expect(response.status()).toBe(204);
});

async function ownWorkflow(page: Page, context: BrowserContext, label: string): Promise<string> {
  const name = `z Chaos ${label} ${crypto.randomUUID()}`;
  const data = { name, enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC', actionType: 'noop' };
  const created = await context.request.post('/api/workflows', { data, headers: mutationHeaders });
  expect(created.status()).toBe(201);
  await page.goto('/battle');
  const sidebar = page.getByRole('navigation', { name: 'Workflows', exact: true });
  await sidebar.getByRole('searchbox', { name: 'Search workflows' }).fill(name);
  await sidebar.getByRole('button', { name: new RegExp(name) }).click();
  await expect(chaosLab(page)).toContainText(name);
  return name;
}

test('a chaos injection drives a real failure all the way to the arena', async ({ page, context }) => {
  await ownWorkflow(page, context, 'arena');

  await chaosLab(page).getByRole('button', { name: /^HTTP 500/ }).click();

  // The demon is named after the status that actually came back, not a guess.
  await expect(arena(page).getByText('500 Demon')).toBeVisible({ timeout: 20_000 });
  await expect(arena(page).getByText('HTTP 500', { exact: true })).toBeVisible();

  // Every attempt is recorded by the worker and streamed here.
  await expect(stream(page).getByText('http.failed').first()).toBeVisible({ timeout: 20_000 });
  await expect(stream(page).getByText('retry.scheduled').first()).toBeVisible({ timeout: 20_000 });

  // Three attempts, then the run is spent: HP reaches zero and defeat is shown.
  await expect(stream(page).getByText('run.failed').first()).toBeVisible({ timeout: 30_000 });
  await expect(arena(page).getByText('0%', { exact: true })).toBeVisible();
  await expect(arena(page).getByText('DEFEATED', { exact: true })).toBeVisible();

  // The inspector describes the same run, with the trace id the services recorded.
  await expect(inspector(page).getByText('Failed')).toBeVisible();
  await expect(inspector(page).getByText(/^[0-9a-f]{32}$/)).toBeVisible();
  const original = (await inspector(page).getByRole('link', { name: 'Open run', exact: true }).getAttribute('href'))!.split('/').at(-1)!;
  await inspector(page).getByRole('button', { name: 'Retry now' }).click();
  await expect(inspector(page).getByRole('link', { name: original!.slice(0, 8) })).toBeVisible();
  await expect(inspector(page).getByRole('status', { name: 'Run status' })).toHaveText('failed', { timeout: 20_000 });
});

// The timeout scenario deliberately stalls for 8s per attempt, which would occupy
// the single-concurrency worker and starve every other spec. The failure being real
// is what this test needs, not which failure it is.
test('Operations View shows the same run without the arena', async ({ page, context }) => {
  await ownWorkflow(page, context, 'operations');
  await chaosLab(page).getByRole('button', { name: /^HTTP 500/ }).click();
  await expect(arena(page).getByText('500 Demon')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Operations View' }).click();

  // Same state, plain presentation: no sprites, the numbers still there.
  await expect(overview(page)).toBeVisible();
  await expect(arena(page)).toHaveCount(0);
  await expect(overview(page).getByText('Attempts remaining')).toBeVisible();
  await expect(overview(page).getByText('HTTP 500', { exact: true })).toBeVisible();
});

test('a viewer can watch a battle but not start or stop one', async ({ page, context }) => {
  const response = await context.request.post('/api/session/demo', { data: { role: 'viewer' }, headers: mutationHeaders });
  expect(response.status()).toBe(204);

  await page.goto('/battle');

  await expect(page.getByRole('button', { name: 'Run now' })).toHaveCount(0);
  await expect(page.getByText('Your role can watch runs, not start them.')).toBeVisible();
  await expect(chaosLab(page).getByRole('button', { name: /^HTTP 500/ })).toBeDisabled();
});

test('the run detail page shows the events recorded for a run', async ({ page, context }) => {
  const data = { name: `z Chaos detail ${crypto.randomUUID()}`, enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC', actionType: 'noop' };
  const made = await context.request.post('/api/workflows', { data, headers: mutationHeaders });
  const workflow = await made.json();
  const path = `/api/workflows/${workflow.id}/runs`;
  const started = await context.request.post(path, { data: { scenario: 'http-500' }, headers: mutationHeaders });
  expect(started.status()).toBe(202);
  const run = await started.json();
  expect(run.workflowId).toBe(workflow.id);

  await page.goto(`/runs/${run.id}`);
  await expect(runStatus(page)).toHaveText('failed', { timeout: 30_000 });
  await expect(page.getByRole('alert')).toContainText('HTTP 500');
});


test('opens on Battle View, runs a workflow and configures its schedule separately', async ({ page, context }) => {
  const name = `z Battle flow ${crypto.randomUUID()}`;
  const data = { name, enabled: false, cronExpr: '15 4 * * *', timezone: 'UTC', actionType: 'noop' };
  const created = await context.request.post('/api/workflows', { data, headers: mutationHeaders });
  expect(created.status()).toBe(201);
  await page.goto('/');
  await expect(page).toHaveURL(/\/battle$/);
  const sidebar = page.getByRole('navigation', { name: 'Workflows', exact: true });
  await sidebar.getByRole('searchbox', { name: 'Search workflows' }).fill(name);
  await sidebar.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByText('No run to show yet')).toBeVisible();
  await page.getByRole('button', { name: 'Run now', exact: true }).click();
  await expect(inspector(page).getByRole('status', { name: 'Run status' })).toHaveText('succeeded', { timeout: 20_000 });
  await expect(stream(page).getByText('Recorded', { exact: true })).toBeVisible();
  await stream(page).locator('summary').filter({ hasText: 'run.succeeded' }).click();
  await expect(stream(page).locator('details[open]').getByText(/Trace:/)).toBeVisible();
  await expect(page.getByText('Following latest run · every 5s')).toBeVisible();
  const workflow = await created.json();
  const started = await context.request.post(`/api/workflows/${workflow.id}/runs`, { headers: mutationHeaders });
  expect(started.status()).toBe(202);
  const latest = await started.json();
  await expect(inspector(page).getByText(`RUN-${latest.id.slice(0, 8)}`)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Operations View' }).click();
  await expect(overview(page).getByText(name)).toBeVisible();
  await inspector(page).getByRole('link', { name: 'Configure workflow' }).click();
  await expect(page.getByRole('textbox', { name: 'Cron expression' })).toHaveValue('15 4 * * *');
  await page.getByRole('textbox', { name: 'Cron expression' }).fill('30 6 * * 1-5');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText('30 6 * * 1-5');
});

test('reports unavailable metrics and recovers on the next poll', async ({ page }) => {
  let available = false;
  await page.route('**/api/metrics', async (route) => {
    if (available) return route.continue();
    await route.fulfill({ status: 503, json: { title: 'Metrics unavailable', status: 503 } });
  });
  await page.goto('/battle');
  const health = page.getByRole('region', { name: 'System Health' });
  await expect(health).toContainText('Metrics unavailable');
  available = true;
  await expect(health).toContainText('Queue reachable', { timeout: 15_000 });
});

test('shows Redis outages without treating missing queue counters as zero', async ({ page }) => {
  const queue = { reachable: false, waiting: 0, active: 0, delayed: 0, failed: 0, workers: 0 };
  const sample = { sampleSize: 0, windowHours: 24, successRate: null, retryRate: null, p95DurationMs: null };
  const metrics = { ...sample, exhaustedRuns: 0, outboxPending: 7, queue };
  await page.route('**/api/metrics', (route) => route.fulfill({ json: metrics }));
  await page.goto('/battle');
  const backend = page.getByRole('region', { name: 'Backend flow' });
  await expect(backend).toContainText('7 pending dispatch');
  await expect(backend).toContainText('Unreachable');
  const health = page.getByRole('region', { name: 'System Health' });
  await expect(health).toContainText('Queue unreachable');
  await expect(health.getByText('unavailable', { exact: true }).first()).toBeVisible();
});

test('recovers a failed catalogue and stays usable on narrow screens', async ({ page }) => {
  let fail = true;
  await page.route('**/api/workflows?*', async (route) => {
    if (!fail) return route.continue();
    await route.fulfill({ status: 503, json: { title: 'Try later', status: 503 } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Could not load workflows');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  for (const width of [390, 768, 1280, 1672]) {
    await page.setViewportSize({ width, height: 941 });
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits, `no horizontal overflow at ${width}px`).toBe(true);
  }
});


test('records a real timeout and cancels the remaining attempts', async ({ page, context }) => {
  await ownWorkflow(page, context, 'timeout');
  await chaosLab(page).getByRole('button', { name: /Inject timeout/ }).click();
  await expect(stream(page).getByText('http.timeout', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(arena(page).getByText('Timeout Wraith')).toBeVisible();
  await inspector(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(inspector(page).getByRole('status', { name: 'Run status' })).toHaveText('cancelled', { timeout: 10_000 });
  await expect(stream(page).getByText('run.cancelled', { exact: true })).toBeVisible();
});


test('recovers a real HTTP failure automatically and clears the active error', async ({ page, context }) => {
  await ownWorkflow(page, context, 'recovery');
  await chaosLab(page).getByRole('button', { name: /^Recover HTTP 500/ }).click();
  await expect(arena(page).getByText('500 Demon')).toBeVisible({ timeout: 15_000 });
  await expect(stream(page).getByText('retry.scheduled').first()).toBeVisible();
  await expect(inspector(page).getByRole('status', { name: 'Run status' })).toHaveText('succeeded', { timeout: 20_000 });
  await expect(inspector(page)).toContainText('Recovered automatically on attempt 2. No active error.');
  await expect(inspector(page).getByText('Current error')).toHaveCount(0);
  await expect(arena(page).getByText('Obstacle cleared')).toBeVisible();
  await expect(arena(page).getByRole('list', { name: 'Attempt history' })).toContainText('HTTP_500');
  await expect(arena(page).getByRole('list', { name: 'Attempt history' })).toContainText('Succeeded');
  await page.getByRole('button', { name: 'Operations View' }).click();
  await expect(overview(page)).toContainText('Resolved · no active error');
});

test('a cron starts automatically and Battle View follows it without Run now', async ({ page, context }) => {
  test.setTimeout(120_000);
  const name = `z Battle flow cron ${crypto.randomUUID()}`;
  await page.goto('/workflows/new');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('minute');
  await page.getByRole('combobox', { name: 'Timezone', exact: true }).selectOption('UTC');
  await page.getByRole('checkbox', { name: 'Enabled' }).check();
  const saved = page.waitForResponse((response) => response.url().endsWith('/api/workflows') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const workflow = { id: (await response.headerValue('location'))?.split('/').at(-1) };
  expect(workflow.id).toBeTruthy();
  try {
    await page.goto(`/battle?workflow=${workflow.id}`);
    await expect(page.locator('[aria-label="Automatic schedule"]')).toContainText('Next automatic run');
    await expect(inspector(page).getByRole('status', { name: 'Run status' })).toHaveText('succeeded', { timeout: 95_000 });
    await expect(inspector(page)).toContainText('Automatic cron');
    await expect(stream(page).getByText('scheduler.claimed', { exact: true })).toBeVisible();
    await expect(stream(page).getByText('run.succeeded', { exact: true })).toBeVisible();
    await expect(arena(page).getByText('VICTORY', { exact: true })).toBeVisible();
  } finally {
    const data = { name, enabled: false, cronExpr: '* * * * *', timezone: 'UTC', actionType: 'noop' };
    const disabled = await context.request.put(`/api/workflows/${workflow.id}`, { data, headers: mutationHeaders });
    expect(disabled.status()).toBe(200);
  }
});
