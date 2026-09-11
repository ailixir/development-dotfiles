import { defineConfig } from 'vitest/config';

/**
 * Unit tier (ADR-001 §7.1): no browser, fake Playwright adapters, runs on a plain Node image.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary'],
      include: ['src/validator/**', 'src/executor/**'],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 80,
        branches: 80,
      },
    },
  },
});
