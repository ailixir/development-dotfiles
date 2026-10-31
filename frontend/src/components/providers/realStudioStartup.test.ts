import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('full-stack Studio startup', () => {
  it('starts the production-alpha backend and runner with local evidence storage', () => {
    const script = readFileSync(resolve(process.cwd(), '..', 'dev.sh'), 'utf8');
    expect(script).toContain('Studio production alpha: backend + runner connected');
    expect(script).toContain('export STUDIO_EVIDENCE_PROVIDER="local"');
    expect(script).toContain('export STUDIO_EVIDENCE_DIRECTORY="$RUNNER_WORK_DIR/objects"');
    // The runner environment is built by the local TLS helper that dev.sh runs, not by dev.sh itself.
    const runnerEnv = readFileSync(resolve(process.cwd(), '..', 'tools', 'studio-local-tls.mjs'), 'utf8');
    expect(runnerEnv).toContain("STUDIO_RUNNER_OBJECT_STORE_PROVIDER: 'local'");
    expect(script).toContain('rm -rf -- "$RUNNER_WORK_DIR"');
    expect(script).not.toContain('VITE_ENABLE_MSW');
  });

  it('has no runtime mock gate, worker, flag, or browser service-worker asset', () => {
    const sources = [
      'src/bootstrap.tsx',
      'src/ChecksModule.tsx',
      'vite.config.ts',
      'webpack.config.js',
      '.env.development',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');
    expect(sources).not.toContain('MswGate');
    expect(sources).not.toContain('VITE_ENABLE_MSW');
    expect(sources).not.toContain('MSW_BUNDLED');
    expect(existsSync(resolve(process.cwd(), 'public', 'mockServiceWorker.js'))).toBe(false);
    expect(
      existsSync(resolve(process.cwd(), 'src', 'services', 'mocks', 'studio', 'browser.ts')),
    ).toBe(false);
  });
});
