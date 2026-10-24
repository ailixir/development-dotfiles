// INERT PROPOSAL ONLY. Copy into a future sealed owned repo; not released or executed.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.vite-gateway80',
  test: {
    environment: 'node',
    include: ['test/deployment/integrations.test.ts'],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
