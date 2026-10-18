import { defineConfig, devices } from '@playwright/test';

/**
 * Browser specs (STUDIO-OBS-008, P5). `e2e/` is Playwright's alone: `vitest.config.ts` excludes it.
 *
 * Two projects, one chosen per run by `CHECKS_E2E_REAL_BACKEND`:
 *
 * - `msw` (default). Specs run against the real Vite app, whose `/api/v1` is answered by the MSW
 *   handlers in a Node process (`e2e/mswProxy.ts`). No browser service worker exists. This proves the
 *   page against the mocks; it is never evidence of live integration.
 * - `real-backend` (`CHECKS_E2E_REAL_BACKEND=1`). Only `e2e/*-real-backend.spec.ts` runs, against the
 *   backend at `CHECKS_E2E_BACKEND_URL` (default http://127.0.0.1:8080), which the caller has started:
 *   `CHECKS_E2E_REAL_BACKEND=1 pnpm exec playwright test --project=real-backend e2e/<name>-real-backend.spec.ts`.
 *
 * Both modes use `e2e/start-servers.mjs`. One worker: the proxy's mock state is shared per process.
 */
const realBackend = ['1', 'true'].includes(process.env.CHECKS_E2E_REAL_BACKEND ?? '');
const appPort = Number(process.env.CHECKS_E2E_APP_PORT ?? 4177);
const baseURL = `http://127.0.0.1:${appPort}`;
const realBackendSpecs = /.*-real-backend\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Kept inside node_modules so reports and traces never reach `git status`.
  outputDir: './node_modules/.cache/playwright-e2e/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: realBackend
    ? [
        {
          name: 'real-backend',
          testMatch: realBackendSpecs,
          use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
        },
      ]
    : [
        {
          name: 'msw',
          testIgnore: realBackendSpecs,
          use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
        },
      ],
  webServer: {
    command: 'node e2e/start-servers.mjs',
    url: baseURL,
    // A leftover server could belong to the other mode or to another lane; never adopt one.
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
