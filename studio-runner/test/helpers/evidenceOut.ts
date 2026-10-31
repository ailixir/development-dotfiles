import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Where the fixtures tier writes its recorded oracle facts. Default: the OS temp dir, so a test
 * run never dirties the tracked evidence tree. CHECKS_WRITE_EVIDENCE=1 writes to docs/qa/evidence.
 */
export function evidenceRoot(): string {
  const root =
    process.env.CHECKS_WRITE_EVIDENCE === '1'
      ? resolve('../docs/qa/evidence')
      : join(tmpdir(), 'studio-runner-evidence');
  mkdirSync(root, { recursive: true });
  return root;
}

/** Path under the evidence root; its parent directory exists on return. */
export function evidencePath(relative: string): string {
  const path = join(evidenceRoot(), relative);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
