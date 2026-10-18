// Copy of studio-runner/vitest.fixtures.config.ts WITHOUT globalSetup (which re-emits dist/ in place).
// W2 brief: no dist rebuild before the F-merge. These cases import src/ directly and spawn no dist child.
// Usage: pnpm --config.package-manager-strict=false exec vitest run --config <this file> <test files> --minWorkers=1 --maxWorkers=1
export default {
  root: process.env.R2_RUNNER_ROOT ?? '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner',
  test: {
    environment: 'node',
    include: ['test/fixtures-tier/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  },
};
