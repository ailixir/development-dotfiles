import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import { packageRoot } from './helpers/corpus.js';

/**
 * AC-12: the emitted package contains no construct that turns a string into code.
 *
 * This is a grep over `dist/`, not over `src/`, so a helper injected by the compiler would be
 * caught too. The build is performed here through the TypeScript compiler API rather than a
 * child process, because spawning one is a lint error outside `src/run/**`.
 */

const FORBIDDEN: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: 'eval(', pattern: /(?<![A-Za-z0-9_$.])eval\s*\(/u },
  { label: 'new Function(', pattern: /new\s+Function\s*\(/u },
  { label: 'Function(', pattern: /(?<![A-Za-z0-9_$.])Function\s*\(/u },
  { label: 'node vm', pattern: /require\(\s*['"](?:node:)?vm['"]\s*\)|from\s+['"](?:node:)?vm['"]/u },
  {
    label: 'worker_threads',
    pattern:
      /require\(\s*['"](?:node:)?worker_threads['"]\s*\)|from\s+['"](?:node:)?worker_threads['"]/u,
  },
  { label: 'dynamic import()', pattern: /(?<![A-Za-z0-9_$.])import\s*\(/u },
  { label: 'async IIFE', pattern: /\(\s*async\s*\(\s*\)\s*=>/u },
];

const distDir = join(packageRoot, 'dist');

function emitDist(): void {
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
  expect(emitted.emitSkipped).toBe(false);
}

function jsFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return jsFiles(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

describe('emitted package', () => {
  beforeAll(() => {
    if (!existsSync(join(distDir, 'index.js'))) emitDist();
  });

  it('emits JavaScript', () => {
    expect(jsFiles(distDir).length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN.map((entry) => [entry.label, entry] as const))(
    'contains no %s',
    (_label, entry) => {
      const offenders = jsFiles(distDir)
        .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
        .filter(({ source }) => entry.pattern.test(source))
        .map(({ file }) => file);
      expect(offenders).toEqual([]);
    },
  );
});
