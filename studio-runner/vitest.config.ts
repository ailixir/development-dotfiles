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
      include: ['src/validator/**', 'src/executor/**', 'src/compat/**', 'scripts/**'],
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
      },
    },
  },
});
