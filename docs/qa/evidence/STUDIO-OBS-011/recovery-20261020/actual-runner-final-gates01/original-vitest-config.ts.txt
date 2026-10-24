import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Unit tier (ADR-001 §7.1): no browser, fake Playwright adapters, runs on a plain Node image.
 *
 * `test/fixtures-tier/**` is excluded here: that tier has its own config and its own CI stage,
 * which is gated by `ED-05` (see `ci/stages.md`).
 *
 * `test/deployment/**` is excluded for the same reason and **not** for a more convenient one: its
 * prerequisites are an external `helm` binary and a built container image, neither of which a plain
 * Node image has. It has its own config (`vitest.deployment.config.ts`), its own script
 * (`npm run test:deployment`) and its own stage (`ci/stages.md` stage 9), and — unlike the version
 * QA reviewed — it **fails** rather than skips when a prerequisite is absent.
 *
 * Moving a tier out of the default run is how a tier gets quietly lost, so the move is watched:
 * `test/deployment-tier-wiring.test.ts` runs *here* and reddens if the config, the script, the
 * stage entry or any of the tier's files disappears. The deferral record
 * (`test/deferred.test.ts`) deliberately stays in the default run — it needs no prerequisite, and
 * the asymmetry QA found was precisely that the blocked halves could not self-arm while the passed
 * halves silently disarmed.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/fixtures-tier/**', 'test/deployment/**'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary'],
      include: [
        'src/guided/**',
        'src/validator/**',
        'src/executor/**',
        'src/compat/**',
        'src/server/**',
        'src/reporting/**',
        'src/run/**',
        'src/main.ts',
        'scripts/**',
      ],
      // Declaration files carry no statements; v8 reports them as 0% and drags the gate down.
      // STUDIO-OBS-012A: the two files below launch the real browser, and AC-25
      // (confinement.test.ts) forbids any unit test from loading them. Where they run differs
      // (STUDIO-OBS-009 AC-11 k, comment-only correction; guidedMain.ts is gone since the fold, D1):
      //   - browser.ts runs in the fixtures tier twice over: in-process (those tests import
      //     launchGuidedBrowser and the browser factory directly) and inside the forked child;
      //   - child.ts runs in the fixtures tier only as that forked child, from dist/;
      // Their coverage can only come from real Chromium, which the unit tier's v8 run cannot see.
      // Counting them here made src/run/** pass only while the deleted artifact-1 playwrightAdapter
      // padded the total. Thresholds are unchanged.
      exclude: [
        '**/*.d.ts',
        '**/*.d.mts',
        'src/run/browser.ts',
        'src/run/child.ts',
      ],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 80,
        branches: 80,
        // Story 10.3 AC-12 gates the two directories it adds at 80%. Glob thresholds are checked
        // separately from the global ones above, so the validator/executor gate stays at 85/80.
        'src/compat/**': { lines: 80, statements: 80, functions: 80, branches: 80 },
        'scripts/**': { lines: 80, statements: 80, functions: 80, branches: 80 },
        // Story 10.6 AC-24 gates the two directories it adds at the thresholds already enforced
        // for src/validator/** and src/executor/**, stated explicitly so they cannot hide inside
        // the global figure.
        'src/server/**': { lines: 85, statements: 85, functions: 80, branches: 80 },
        'src/reporting/**': { lines: 85, statements: 85, functions: 80, branches: 80 },
        'src/main.ts': { lines: 85, statements: 85, functions: 80, branches: 80 },
        // Story 10.12 AC-25 gates the directory it adds at the thresholds already enforced for
        // src/server/** and src/reporting/**. No threshold anywhere above is lowered to make room
        // for it: the run package is covered by the unit tier against a fake browser factory and
        // a fake spawn seam, and again by the fixtures tier against real Chromium.
        'src/run/**': { lines: 85, statements: 85, functions: 80, branches: 80 },
      },
    },
  },
});
