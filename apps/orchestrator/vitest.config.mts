import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  test: {
    name: 'orchestrator',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
