/**
 * Fixtures-tier global setup: make sure the compiled child entry exists.
 *
 * The browser runs in a **child process** (AC-5), and a child process is started from a file on
 * disk — `dist/run/child.js` — not from a TypeScript module in the test runner's graph. So this
 * tier needs a build, and it produces one itself rather than depending on a `npm run build` having
 * happened first: a tier that silently ran against a stale `dist/` would be proving something
 * about last week's code.
 *
 * The emit goes through the TypeScript compiler API rather than a child process, exactly as
 * `test/no-dynamic-evaluation.test.ts` does, because spawning one is a lint error outside
 * `src/run/**` (ADR-001 §6).
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function emitDist(): void {
  const configPath = join(packageRoot, 'tsconfig.build.json');
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
    },
  });
  if (parsed === undefined) throw new Error('could not read tsconfig.build.json');
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const emitted = program.emit();
  if (emitted.emitSkipped) {
    throw new Error('the build emitted nothing; the fixtures tier has no child entry to spawn');
  }
}

export default function setup(): void {
  emitDist();
}

/** The compiled child entry the real launcher spawns. */
export const CHILD_MODULE_PATH = join(packageRoot, 'dist', 'run', 'child.js');
