/**
 * SC008-E1 AC1: the import boundary of the step-code module. stepCode.ts is imported only by the one function that runs step code for
 * learning (prepare and dispatch) and for every replay: performStep in run/observedReplayAdapter.ts (SC008-E6 amended the list; the
 * guided runtime and the replay child reach it through that file). stepCodeBinding.ts is imported only by stepCode.ts.
 *
 * SC008-E15: performStep is hosted by exactly two places, the replay adapter and the guided child's step service; the guided runtime
 * (the server) no longer runs steps and imports neither performStep, createSecretRun nor launchGuidedBrowser.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { packageRoot } from '../helpers/corpus.js';

const SRC = join(packageRoot, 'src');
const STEP_CODE_IMPORTERS: readonly string[] = [join('src', 'run', 'observedReplayAdapter.ts')];
const PERFORM_STEP_HOSTS: readonly string[] = [join('src', 'run', 'guidedChildService.ts'), join('src', 'run', 'observedReplayAdapter.ts')];

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? sources(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** Static and type-level imports of a module named `name`, with or without the directory. */
function imports(source: string, name: string): boolean {
  return new RegExp(String.raw`(?:from|import)\s*\(?\s*['"][^'"]*/${name}\.js['"]`, 'u').test(source);
}

describe('the step-code import boundary', () => {
  it('detects an import (planted positive control)', () => {
    expect(imports("import { runStep } from './stepCode.js';", 'stepCode')).toBe(true);
    expect(imports("import type { X } from '../run/stepCode.js';", 'stepCode')).toBe(true);
    expect(imports("import { y } from './stepCodeBinding.js';", 'stepCode')).toBe(false);
  });

  it('exists, and is imported only by the listed callers', () => {
    expect(existsSync(join(SRC, 'run', 'stepCode.ts'))).toBe(true);
    const importers = sources(SRC)
      .filter((file) => relative(packageRoot, file) !== join('src', 'run', 'stepCode.ts'))
      .filter((file) => imports(readFileSync(file, 'utf8'), 'stepCode'))
      .map((file) => relative(packageRoot, file));
    expect(importers).toEqual([...STEP_CODE_IMPORTERS]);
  });

  it('keeps the binding private to stepCode.ts (the secret hook names its call and take-over types; the child protocol reads one constant, the effect cap; the adapter imports none of it)', () => {
    const importers = sources(SRC)
      .filter((file) => imports(readFileSync(file, 'utf8'), 'stepCodeBinding'))
      .map((file) => relative(packageRoot, file));
    expect(importers).toEqual([join('src', 'run', 'guidedChildProtocol.ts'), join('src', 'run', 'secretStep.ts'), join('src', 'run', 'stepCode.ts')]);
  });

  it('is hosted (performStep called) by exactly the replay adapter and the guided child step service, never by the guided runtime', () => {
    const hosts = sources(SRC)
      .filter((file) => /\bperformStep\s*\(/u.test(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '')))
      .map((file) => relative(packageRoot, file));
    expect(hosts).toEqual([...PERFORM_STEP_HOSTS]);
    const runtime = readFileSync(join(SRC, 'guided', 'runtime.ts'), 'utf8');
    expect(runtime).not.toMatch(/\b(?:performStep|createSecretRun|launchGuidedBrowser)\b/u);
    expect(runtime).not.toContain('beforeSecretFill');
  });

  it('imports no Playwright package, so src/run/browser.ts stays the only importer', () => {
    for (const name of ['stepCode', 'stepCodeBinding']) {
      expect(readFileSync(join(SRC, 'run', `${name}.ts`), 'utf8')).not.toMatch(/from\s+['"]playwright(?:-core)?(?:\/[^'"]*)?['"]/u);
    }
  });
});
