import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LOCATOR_ACTIONS,
  LOCATOR_ASSERTION_MATCHERS,
  LOCATOR_FACTORIES,
  PAGE_ACTIONS,
  PAGE_ASSERTION_MATCHERS,
  readOperation,
  summaryLine,
} from './artifactSummary';

/**
 * Story 10.11c AC-28 — the summary reader, and the provenance of the vocabulary it reads with.
 *
 * Two separable things are asserted here, and only the first is a guard over production behaviour.
 * The second is a provenance check: `artifactSummary.ts` holds a **copy** of the runner's accepted
 * language, because the frontend cannot import from the runner package, and a pinned copy whose
 * provenance nothing checks is a shape this epic has catalogued twice (VAC-11, VAC-12).
 */

const LANGUAGE = path.resolve(
  __dirname,
  '../../../../../studio-runner/src/validator/language.ts',
);

/**
 * The top-level keys of one exported table in the runner's language file.
 *
 * A **key-position** match, not a search for the words anywhere in the file: option names, prose
 * and the file's own examples all contain method-like words, and a loose scan would find them.
 * Top-level keys are indented two spaces and nested option keys four or more, which is the
 * property this anchors on.
 */
function tableKeys(source: string, constName: string): string[] {
  const start = source.indexOf(`export const ${constName}`);
  expect(start, `${constName} is no longer exported from the runner's language file`)
    .toBeGreaterThan(-1);
  const open = source.indexOf('= {', start);
  const end = source.indexOf('\n};', open);
  expect(end, `${constName} is no longer an object literal`).toBeGreaterThan(open);
  const body = source.slice(open, end);
  return [...body.matchAll(/^ {2}([A-Za-z]\w*):/gmu)].map((match) => match[1] ?? '').sort();
}

describe('the summary vocabulary is the runner’s accepted language, both ways', () => {
  const source = fs.readFileSync(LANGUAGE, 'utf8');

  it('the runner’s language file is still the exhaustive data this control assumes it is', () => {
    // The control's premise. If the language stops being enumerated data and becomes branching
    // code, the comparisons below would silently start checking nothing, and the right response is
    // to re-derive this module rather than to keep a green test.
    expect(source).toContain('There is no wildcard and no fallthrough.');
    expect(source).toContain('Anything absent from these tables is rejected.');
  });

  it.each([
    ['PAGE_METHODS', PAGE_ACTIONS],
    ['ACTION_METHODS', LOCATOR_ACTIONS],
    ['LOCATOR_METHODS', LOCATOR_FACTORIES],
    ['LOCATOR_ASSERTIONS', LOCATOR_ASSERTION_MATCHERS],
    ['PAGE_ASSERTIONS', PAGE_ASSERTION_MATCHERS],
  ])('%s matches this module’s copy in both directions', (constName, mirrored) => {
    const declared = tableKeys(source, constName as string);
    const copy = [...(mirrored as readonly string[])].sort();

    expect(declared.length, `${constName} parsed as empty; the key-position scan broke`)
      .toBeGreaterThan(0);
    expect(
      declared.filter((name) => !copy.includes(name)),
      `${constName}: the runner permits an operation this summary cannot describe`,
    ).toEqual([]);
    expect(
      copy.filter((name) => !declared.includes(name)),
      `${constName}: this summary describes an operation the runner no longer permits`,
    ).toEqual([]);
  });
});

describe('one validated statement is read into an action, a target and an operand', () => {
  it('a page navigation', () => {
    const operation = readOperation("await page.goto('https://www.citi.com');");
    expect(operation.recognized).toBe(true);
    if (!operation.recognized) return;
    expect(operation.kind).toBe('action');
    expect(operation.target).toBe('the page');
    expect(summaryLine(operation)).toContain('https://www.citi.com');
  });

  it('a click on a role locator, with the accessible name', () => {
    const operation = readOperation(
      "await page.getByRole('button', { name: 'Log On' }).click();",
    );
    expect(operation.recognized).toBe(true);
    if (!operation.recognized) return;
    expect(operation.target).toBe("the button named 'Log On'");
    expect(summaryLine(operation)).toMatch(/^Click the button named 'Log On'$/u);
  });

  it('a fill whose value is a secret reference names the reference and never a value', () => {
    const operation = readOperation(
      "await page.getByLabel('Password').fill(vars.secret('LOGIN_PW'));",
    );
    expect(operation.recognized).toBe(true);
    if (!operation.recognized) return;
    expect(operation.detail).toBe("vars.secret('LOGIN_PW')");
    // There is no resolved value on this contract to leak (architecture §9.2), and this module
    // echoes source text rather than resolving anything — asserted so a future "helpful"
    // rendering that looked one up would land here.
    expect(summaryLine(operation)).toContain('LOGIN_PW');
  });

  it('a page assertion', () => {
    const operation = readOperation('await expect(page).toHaveURL(/dashboard/);');
    expect(operation.recognized).toBe(true);
    if (!operation.recognized) return;
    expect(operation.kind).toBe('assertion');
    expect(operation.target).toBe('the page');
    expect(operation.detail).toBe('/dashboard/');
  });

  it('a locator assertion', () => {
    const operation = readOperation(
      "await expect(page.getByTestId('account-summary')).toBeVisible();",
    );
    expect(operation.recognized).toBe(true);
    if (!operation.recognized) return;
    expect(operation.kind).toBe('assertion');
    expect(operation.target).toBe("the element with test id 'account-summary'");
  });

  it('refuses to summarize what it does not recognize, and says what it could not read', () => {
    // The whole point of the module: an approximation at the human control point is worse than an
    // absence. Three shapes, each unrecognized for a different reason.
    for (const [code, fragment] of [
      ["await page.evaluate('1+1');", 'evaluate'],
      ["await page.getByAltText('logo').click();", 'getByAltText'],
      ["page.getByRole('button').click();", 'awaited'],
    ] as const) {
      const operation = readOperation(code);
      expect(operation.recognized, code).toBe(false);
      if (operation.recognized) continue;
      expect(operation.reason).toContain(fragment);
    }
  });

  it('never returns a summary built from anything but the code it was given', () => {
    // A constancy check, the same shape story 10.10 used on the hash accessor: the function has
    // one input and no ambient source to fall back on.
    const first = readOperation("await page.goto('https://a/');");
    const second = readOperation("await page.goto('https://b/');");
    expect(first).not.toEqual(second);
    expect(readOperation("await page.goto('https://a/');")).toEqual(first);
  });
});
