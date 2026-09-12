import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

const baseURL = process.env['BASE_URL'] || 'http://localhost:4300';

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
