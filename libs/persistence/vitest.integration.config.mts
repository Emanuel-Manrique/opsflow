import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/persistence-integration',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'persistence-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.spec.ts'],
    globalSetup: ['src/testing/integration-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
}));
