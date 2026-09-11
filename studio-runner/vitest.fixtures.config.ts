import { defineConfig } from 'vitest/config';

/**
 * Fixture-corpus tier (ADR-001 §7.1): runs the reference corpus against the pinned Chromium
 * inside the pinned Playwright image. Story 10.3 owns the reference manifest and story 10.12
 * owns the real BrowserAdapter, so this tier currently has no tests and is expected to report
 * "no test files" rather than to pass silently in CI.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/fixtures-tier/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 60_000,
  },
});
