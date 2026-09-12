import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/persistence',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'persistence',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/*.integration.spec.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/persistence',
      provider: 'v8' as const,
    },
  },
}));
