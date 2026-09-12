import { DEMO_TENANTS } from '@opsflow/contracts';
import { expect, test } from '@playwright/test';

test('switches demo identities and applies viewer/operator permissions in the console', async ({ page, context }) => {
  await page.goto('/workflows');
  await page.getByRole('button', { name: 'Continue as admin' }).click();
  await expect(page.getByRole('link', { name: 'New workflow', exact: true })).toBeVisible();
  const name = `Permissions ${crypto.randomUUID()}`;
  const data = { name, enabled: false, cronExpr: '0 3 * * *', timezone: 'UTC', actionType: 'noop' };
  const headers = { 'x-opsflow-request': '1', 'x-tenant-id': DEMO_TENANTS.acme };
  const created = await context.request.post('/api/workflows', { data, headers });
  expect(created.status()).toBe(201);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Continue as viewer' }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'New workflow', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Run .* now$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
  await page.goto('/workflows/new');
  await expect(page).toHaveURL(/\/workflows\?denied=edit/);
  await expect(page.getByText('Your role can view workflows, not create or edit them.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Continue as operator' }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0);
  await page.goto(`/workflows?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: `Run ${name} now` }).click();
  await expect(page.getByRole('status', { name: 'Run status' })).toHaveText('succeeded');
  await page.getByRole('link', { name: 'Back to runs' }).click();
  await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name })).toBeVisible();
});
