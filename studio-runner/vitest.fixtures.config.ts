import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Fixture-corpus tier (ADR-001 §7.1, story 10.3 AC-6a).
 *
 * Runs every reference example end to end against the controlled local HTML pages in
 * `fixtures/pages/`, served on loopback by `test/helpers/pageServer.ts` at the paths
 * `fixtures/reference/manifest.json` binds them to. **Story 10.12 swapped the fake adapter for the
 * real one**: this tier now launches pinned Chromium in a real child process, records native webm
 * and measures step-seek accuracy.
 *
 * `globalSetup` emits `dist/` first, because the browser runs in a child process and a child
 * process is started from a file on disk — a tier that ran against a stale `dist/` would be
 * proving something about last week's code.
 *
 * Until the pinned internal image exists, the CI stage that would run this tier *inside it* stays
 * recorded as **skipped**, never as passed (`ci/stages.md`, stage 6; AC-18b, `ED-05`).
 *
 * `passWithNoTests` is deliberately NOT set: an empty run here would be a silent pass, and this is
 * the tier where the real browser lives.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/fixtures-tier/**/*.test.ts'],
    // The perception tier is dist-free and has its own config (vitest.perception.config.ts, `test:perception`).
    exclude: [...configDefaults.exclude, 'test/fixtures-tier/perception/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ['test/fixtures-tier/globalSetup.ts'],
    // One browser at a time: POOL_SIZE is 1 in production (ADR-001 §9) and a tier that launched
    // several at once would be measuring a machine this component never runs on.
    fileParallelism: false,
    // Never fetch a browser at run time: the browsers come from the image, or from a local
    // install at the pinned version (ADR-001 §4.2, `npm run browsers:install`).
    // This tier serves its pages on loopback, reached as `localhost` (a whitelisted domain, see
    // `test/helpers/allowedDomains.ts`); there is no egress proxy and no local-run signal any more.
    env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  },
});
