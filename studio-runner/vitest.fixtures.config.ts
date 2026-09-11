import { defineConfig } from 'vitest/config';

/**
 * Fixture-corpus tier (ADR-001 §7.1, story 10.3 AC-6a).
 *
 * Runs every reference example end to end through the `BrowserAdapter` seam against the controlled
 * local HTML pages in `fixtures/pages/`. Today the adapter is the fake from 10.2: `ED-05` (the
 * internal Playwright image) is open, so there is no pinned Chromium to launch. Story 10.12 swaps
 * in the real adapter and serves the pages at the URLs in `fixtures/reference/manifest.json`
 * (AC-6b), and until the pinned image exists the CI stage that would run this tier inside it is
 * recorded as **skipped**, never as passed (`ci/stages.md`, stage 6).
 *
 * `passWithNoTests` is deliberately NOT set: an empty run here would be a silent pass.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/fixtures-tier/**/*.test.ts'],
    testTimeout: 60_000,
    // Never fetch a browser: the browsers come from the image (ADR-001 §4.2).
    env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  },
});
