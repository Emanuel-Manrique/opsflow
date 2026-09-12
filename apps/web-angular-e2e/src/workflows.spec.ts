import { expect, test } from '@playwright/test';

const mutationHeaders = { 'x-opsflow-request': '1' };
test.beforeEach(async ({ context }) => {
  const response = await context.request.post('/api/session/demo', { data: { role: 'admin' }, headers: mutationHeaders });
  expect(response.status()).toBe(204);
});

const uniqueName = (label: string) => `E2E ${label} ${Date.now().toString(36)}`;

test('creates, finds and edits a workflow', async ({ page }) => {
  const name = uniqueName('workflow');
  const renamed = `${name} updated`;

  await page.goto('/workflows');
  await page.getByRole('link', { name: 'New workflow' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption('webhook');
  await page.getByRole('textbox', { name: 'Webhook URL' }).fill('invalid');
  await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption('noop');
  await expect(page.getByRole('textbox', { name: 'Webhook URL' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Cron expression' }).fill('30 8 * * 1-5');
  await expect(page.getByRole('status')).toContainText('Valid schedule');
  await page.getByRole('button', { name: 'Create workflow' }).click();

  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(name);
  await page.getByRole('textbox', { name: 'Name' }).fill(renamed);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page.getByRole('row', { name: new RegExp(renamed) })).toBeVisible();
  await page.getByRole('button', { name: `Run ${renamed} now` }).click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]+$/);

  await expect(page.getByRole('status', { name: 'Run status' })).toHaveText('succeeded');
});

test('recovers from a duplicate name without losing the form', async ({ page }) => {
  const name = uniqueName('duplicate');

  const submitWorkflow = async (workflowName: string) => {
    await page.goto('/workflows/new');
    await page.getByRole('textbox', { name: 'Name' }).fill(workflowName);
    await page.getByRole('button', { name: 'Create workflow' }).click();
  };

  await submitWorkflow(name);
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  await submitWorkflow(name);

  await expect(page.getByRole('alert')).toContainText('already exists');
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(name);
  await page.getByRole('textbox', { name: 'Name' }).fill(`${name} v2`);
  await page.getByRole('button', { name: 'Create workflow' }).click();

  await expect(page.getByRole('row', { name: new RegExp(`${name} v2`) })).toBeVisible();
});

test('deletes a workflow from the list after confirmation', async ({ page }) => {
  const name = uniqueName('delete');

  await page.goto('/workflows/new');
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('button', { name: 'Create workflow' }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();

  await page.getByRole('button', { name: `Delete ${name}` }).click();
  await page.getByRole('button', { name: `Confirm delete ${name}` }).click();
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
});
