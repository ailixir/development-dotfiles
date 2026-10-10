import { defineConfig } from '../../../../studio-runner/node_modules/vitest/dist/config.js';
export default defineConfig({
  root: new URL('../../../../studio-runner/', import.meta.url).pathname,
  test: {
    environment: 'node',
    include: ['test/fixtures-tier/observed-replay.test.ts', 'test/fixtures-tier/observed-replay-privacy.test.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
    env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  },
});
