// Copy of studio-runner/vitest.fixtures.config.ts WITHOUT globalSetup (which re-emits dist/ in place).
// Lane PR-RT must not rebuild dist; this probe imports src/ directly and spawns no dist child.
export default {
  root: '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/studio-runner',
  test: {
    environment: 'node',
    include: ['test/fixtures-tier/guidedCloseProbe.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
  },
};
