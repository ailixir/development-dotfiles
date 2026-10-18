import { defineConfig, mergeConfig } from 'vitest/config';
import base from '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/frontend/vitest.config';
export default mergeConfig(base, defineConfig({
  root: '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/frontend',
  server: { fs: { strict: false } },
  test: { dir: '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-015/execution-20261015/frontend-contract-diagnosis01/probe', include: ['**/*.{baseline,patched}.test.ts'] },
}));
