import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('full-stack Studio startup', () => {
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
