import { defineConfig } from 'vitest/config';

// Evidence-only private-workspace configuration. No live deployment inventory change.
export default defineConfig({
  cacheDir: '.vite-gateway-independent',
  test: {
    environment: 'node',
    include: ['test/deployment/gateway-independent-mutants.test.ts'],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
