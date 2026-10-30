import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards of the one-resolver, one-executor design (ADR-SC-007 WI-4, plan invariants I-1, I-2, I-4, I-11).
 * Each rule has a planted positive control: the scanner is run on a string that must be flagged.
 */
const SRC = join(__dirname, '../../src');
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
});
const read = (path: string): string => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
const rel = (path: string): string => relative(SRC, path);

const ACTIONS = /\.(?:click|hover|uncheck|fill|selectOption|press|innerText|inputValue)\s*\(|\.check\s*\(\s*(?:\{|opts)/u;
const MAIN_WORLD = /\b(?:evaluate|evaluateAll|evaluateHandle)\s*\(|\$\$?eval\s*\(|\.on\s*\(\s*['"]|\ballInnerTexts\b|\ballTextContents\b/u;
const MESSAGE = /\.message\b/u;
const CLARIFICATION = /\bselectedChoice\b|\bmatchingRefs\b|\.evidence\s*(?:===|!==)|\.evidence\.includes\(/u;

describe('the executor guards', () => {
  it('only targetAction.ts calls the locator actions', () => {
    expect(ACTIONS.test('await locator.click({ timeout: 1 })')).toBe(true); // planted positive control
    expect(ACTIONS.test('control.check()')).toBe(false);
    const offenders = files(SRC).filter(path => rel(path) !== join('run', 'targetAction.ts') && ACTIONS.test(read(path))).map(rel);
    // The old collector holds the in-page invoke until the deletion stage removes it.
    expect(offenders).toEqual([]);
  });

  it('no evaluate and no main-world read in the action files', () => {
    for (const forbidden of ['page.evaluate(x)', 'locator.evaluateAll(f)', 'h.evaluateHandle(f)', 'p.$eval(a, f)', "p.$$eval('a', f)", "page.on('console', f)", 'await l.allInnerTexts()', 'await l.allTextContents()']) {
      expect(MAIN_WORLD.test(forbidden), forbidden).toBe(true); // planted positive controls
    }
    expect(MAIN_WORLD.test('await locator.innerText({ timeout: 1 }); await locator.textContent({ timeout: 1 })')).toBe(false);
    for (const name of ['run/targetAction.ts', 'run/targetOptions.ts', 'run/targetIdentity.ts', 'run/observedReplayAdapter.ts', 'executor/observedReplay.ts']) {
      expect(MAIN_WORLD.test(read(join(SRC, name))), name).toBe(false);
    }
  });

  it('.message is used in no call-site file', () => {
    expect(MESSAGE.test('throw new Error(error.message)')).toBe(true); // planted positive control
    // Only closedError.ts classifies an incoming error; no call site copies or tests its text. (pageStateInPage.ts runs inside the page and
    // reads only the message of its own PasswordPrewriteRefusal; it never sees a Playwright or CDP error.)
    for (const name of ['run/targetAction.ts', 'run/targetOptions.ts', 'run/targetIdentity.ts', 'run/observationFlow.ts', 'run/browser.ts', 'run/observedReplayAdapter.ts'].filter(n => existsSync(join(SRC, n)))) {
      expect(MESSAGE.test(read(join(SRC, name))), name).toBe(false);
    }
  });

  it('the runner does no clarification matching', () => {
    expect(CLARIFICATION.test('if (fact.evidence === stored.evidence)')).toBe(true); // planted positive control
    for (const path of [...files(join(SRC, 'run')), ...files(join(SRC, 'guided'))].filter(p => !p.endsWith('types.ts'))) expect(CLARIFICATION.test(read(path)), rel(path)).toBe(false);
  });
});
