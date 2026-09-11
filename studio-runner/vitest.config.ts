import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Unit tier (ADR-001 §7.1): no browser, fake Playwright adapters, runs on a plain Node image.
 *
 * `test/fixtures-tier/**` is excluded here: that tier has its own config and its own CI stage,
 * which is gated by `ED-05` (see `ci/stages.md`).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/fixtures-tier/**'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary'],
      include: [
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
      exclude: ['**/*.d.ts', '**/*.d.mts'],
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
