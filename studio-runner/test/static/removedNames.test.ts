/**
 * SC008-E6 AC1: what ADR-SC-008 D7 removed stays removed, and nothing the rewrite left behind is exported without a reader.
 * A static test over `src/`, in the manner of noRunnerSinks: a name that returns, or a file that returns, fails here.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { packageRoot } from '../helpers/corpus.js';

const SRC = join(packageRoot, 'src');
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? sources(full) : full.endsWith('.ts') && !full.endsWith('.d.ts') ? [full] : [];
  });
}
const files = sources(SRC);
const text = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));

/** The per-case workarounds the user removed (no flag, no kill switch, no renamed equivalent) and the typed-operation executor paths. */
const REMOVED_NAMES = [
  'focusedSuccessor', 'replacedFocusedField', 'PAGE_STALE_RETRIES', 'CERTIFICATE_ATTEMPTS', 'FILL_FIRST_ATTEMPT_MS', 'KEY_FIRST_ATTEMPT_MS',
  'ACQUISITION_LIMITS', 'ReplayAcquisitionBudget',
  'performOnTarget', 'performWithNavigation', 'prepareObservedAction', 'performPreparedObservedAction', 'hasTableContext',
] as const;
const REMOVED_FILES = [
  'run/targetAction.ts', 'run/locatorSynth.ts', 'run/targetOptions.ts', 'run/targetIdentity.ts', 'run/observationReadProfile.ts',
  'validator/pressInheritance.ts', 'validator/operationPreimage.ts',
] as const;

describe('removed names and files', () => {
  it.each(REMOVED_NAMES)('%s appears nowhere in src', (name) => {
    const hits = files.filter((file) => new RegExp(String.raw`\b${name}\b`, 'u').test(text.get(file) ?? '')).map((file) => relative(packageRoot, file));
    expect(hits).toEqual([]);
  });

  it.each(REMOVED_FILES)('%s does not exist', (file) => {
    expect(existsSync(join(SRC, file))).toBe(false);
  });

  it('detects a removed name (planted positive control)', () => {
    expect(/\bfocusedSuccessor\b/u.test('const x = await focusedSuccessor(run);')).toBe(true);
    expect(/\bfocusedSuccessor\b/u.test('const focusedSuccessors = 1;')).toBe(false);
  });
});

/**
 * Exports with no reader. tsc does not flag an unused export, so a deletion that leaves a helper behind is invisible to it. An export
 * is dead when no other src file mentions its name, its own file mentions it only at the declaration, and no test reads it. The tests
 * count as readers on purpose: a helper that only a test still calls is the next thing to delete, and this list says so when it appears.
 */
function exportsOf(file: string): string[] {
  const source = ts.createSourceFile(file, text.get(file) ?? '', ts.ScriptTarget.ES2022, true);
  const names: string[] = [];
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(statement)) { for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text); }
    else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) && statement.name) names.push(statement.name.text);
  }
  return names;
}
function testSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? testSources(full) : full.endsWith('.ts') || full.endsWith('.mjs') ? [readFileSync(full, 'utf8')] : [];
  });
}
const mentions = (haystack: string, name: string): number => (haystack.match(new RegExp(String.raw`\b${name}\b`, 'gu')) ?? []).length;
/** The exports of `module` that nothing reads. */
function deadExports(module: string, others: readonly string[], own: string, tests: string, declared: readonly string[]): string[] {
  void module;
  return declared.filter((name) => !others.some((other) => mentions(other, name) > 0) && mentions(own, name) <= 1 && mentions(tests, name) === 0);
}

/** The modules this work item rewrote or trimmed. */
const TOUCHED = [
  'run/observationFlow.ts', 'run/observationTypes.ts', 'run/observationSanitizer.ts', 'run/playwrightEngine.ts', 'run/perceptionInPage.ts', 'run/pageStateInPage.ts',
  'run/browser.ts', 'run/browserFactory.ts', 'run/guidedBrowser.ts', 'run/observedReplayAdapter.ts', 'run/protocol.ts',
  'executor/observedReplay.ts', 'validator/observedReplay.ts', 'validator/observedHistory.ts', 'validator/observedSnapshots.ts', 'guided/runtime.ts',
] as const;

describe('no dead export in the modules this work item rewrote', () => {
  const tests = testSources(join(packageRoot, 'test')).join('\n');
  it.each(TOUCHED)('%s', (module) => {
    const file = join(SRC, module);
    const others = files.filter((other) => other !== file).map((other) => text.get(other) ?? '');
    expect(deadExports(module, others, text.get(file) ?? '', tests, exportsOf(file))).toEqual([]);
  });

  it('flags an export nothing reads (planted positive control)', () => {
    const own = 'export function lonely(): void { /* nobody calls me */ }\nexport const read = 1;';
    expect(deadExports('x.ts', ['const y = read;'], own, '', ['lonely', 'read'])).toEqual(['lonely']);
    expect(deadExports('x.ts', [], own, 'lonely();', ['lonely'])).toEqual([]);
    expect(deadExports('x.ts', [], `${own}\nlonely();`, '', ['lonely'])).toEqual([]);
  });

  it('reads the exports of a real module (the declaration scan finds protocol.ts stepReceiptAgrees)', () => {
    expect(exportsOf(join(SRC, 'run', 'protocol.ts'))).toContain('stepReceiptAgrees');
  });
});
