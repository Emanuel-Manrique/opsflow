import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/orchestrator-e2e',
    resolve: { tsconfigPaths: true },
  test: {
    name: 'orchestrator-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'],
    globalSetup: ['src/support/global-setup.ts'],
    reporters: ['default'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
}));
