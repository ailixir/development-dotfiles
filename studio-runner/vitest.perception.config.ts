import { defineConfig } from 'vitest/config';

/**
 * Perception tier (ADR-SC-007 WI-2): the real-Chromium tests of the perception modules
 * (`src/run/perceive.ts`, `locatorSynth.ts`, `playwrightEngine.ts`, `privateInventory.ts` and the page
 * programs in `perceptionInPage.ts`).
 *
 * **There is no `globalSetup` here, on purpose.** The fixtures tier (`vitest.fixtures.config.ts`) re-emits
 * `dist/` before it runs because it spawns the browser child from a file on disk; this tier launches
 * Chromium in the test process and never emits, reads or modifies `dist/` (the running runner loads it).
 * Every test file of the tier signs the `dist/` tree before and after and fails if it changed
 * (`test/fixtures-tier/perception/harness.ts`).
 *
 * The unit tier excludes `test/fixtures-tier/**`; `vitest.fixtures.config.ts` excludes this folder.
 * `src/run/perceptionInPage.ts` is excluded from the unit tier's coverage because only this tier can run
 * it, so the tier is wired and watched from the default run (`test/run/importBoundary.test.ts`): delete the
 * config, the `test:perception` script, the exclude, the tier's files or its `ci/stages.md` entry and the
 * default run reddens.
 *
 * `passWithNoTests` is deliberately NOT set: an empty run here would be a silent pass.
 *
 * Linux and macOS only, by plan (ADR-SC-009): the tier is machine-bound (`parity.test.ts` pins a darwin/arm64
 * baseline fingerprint), so it is not run on Windows and its files carry no per-file platform gates.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/fixtures-tier/perception/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One browser at a time: the layout-dependent parts of the tier are machine-bound by design.
    fileParallelism: false,
    coverage: { enabled: false },
    env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  },
});
