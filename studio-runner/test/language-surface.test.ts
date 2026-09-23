import { describe, expect, it } from 'vitest';

import { EMPTY_REFERENCES, validateArtifact } from '../src/validator/index.js';
import type { ReferenceDeclarations, ValidationPolicyInput } from '../src/validator/index.js';
import * as executorBarrel from '../src/executor/index.js';

/** Validates a single step and returns its diagnostic codes (empty when accepted). */
function codesFor(
  line: string,
  code: string,
  references: ReferenceDeclarations = EMPTY_REFERENCES,
  policy?: ValidationPolicyInput,
): string[] {
  const result = validateArtifact(
    { version: 1, steps: [{ stepIndex: 0, originalText: line, code }] },
    [line],
    references,
    policy,
  );
  return [
    ...result.diagnostics.map((diagnostic) => diagnostic.code),
    ...result.steps.flatMap((step) => step.diagnostics.map((diagnostic) => diagnostic.code)),
  ];
}

const LINE = 'Do the thing';

describe('option schemas', () => {
  it.each([
    ["await page.goto('https://a.example/', { timeout: 1000 });", []],
    ["await page.goto('https://a.example/', { waitUntil: 'commit' });", []],
    ["await page.goto('https://a.example/', { waitUntil: 'whenever' });", ['OPTION_VALUE_TYPE']],
    ["await page.goto('https://a.example/', { timeout: -1 });", ['OPTION_VALUE_TYPE']],
    ["await page.goto('https://a.example/', { timeout: 1.5 });", ['OPTION_VALUE_TYPE']],
    ["await page.goto('https://a.example/', { timeout: 10000000 });", ['OPTION_VALUE_TYPE']],
    ["await page.goto('https://a.example/', { waitUntil: 42 });", ['ARGUMENT_TYPE']],
    ["await page.goto('https://a.example/', { __proto__: 1 });", ['PROTOTYPE_ACCESS']],
    ["await page.goto('https://a.example/', { ...extra });", ['EXPRESSION_SPREAD']],
    ["await page.goto('https://a.example/', { run() { return 1; } });", ['EXPRESSION_FUNCTION']],
    ["await page.goto('https://a.example/', {});", []],
  ])('%s', (code, expected) => {
    expect(codesFor(LINE, code)).toEqual(expected);
  });
});

describe('locator argument schemas', () => {
  it.each([
    ["await page.getByRole('button', { level: 3 }).click();", []],
    ["await page.getByRole('heading', { name: /Welcome/i }).click();", []],
    ["await page.getByRole('heading', { name: 42 }).click();", ['ARGUMENT_TYPE']],
    ["await page.getByRole('wizard').click();", ['ARGUMENT_VALUE_NOT_PERMITTED']],
    ["await page.getByRole(role).click();", ['ARGUMENT_TYPE']],
    ["await page.getByTestId('a').fill(`plain template`);", []],
    ["await page.getByText('x').check({ trial: false, force: false });", []],
    ["await page.getByText('x').check({ trial: true });", ['OPTION_VALUE_TYPE']],
    ["await page.getByLabel('x').press('Control+Shift+A');", []],
    ["await page.getByLabel('x').press('DoTheThing');", ['ARGUMENT_VALUE_NOT_PERMITTED']],
    ["await page.getByLabel('x').press('Enter', { delay: 10 });", []],
    ["await page.locator('div[data-id=\"42\"] > span').click();", []],
    ["await page.locator('  ').click();", ['SELECTOR_NOT_CSS']],
    ["await page.locator('div:has-text(\"hi\")').click();", ['SELECTOR_NOT_CSS']],
    ["await page.locator('div\\\\.escaped').click();", ['SELECTOR_NOT_CSS']],
    ["await page.getByLabel('x').selectOption('GBP', { timeout: 1 });", []],
  ])('%s', (code, expected) => {
    expect(codesFor(LINE, code)).toEqual(expected);
  });

  it('bounds a long string literal', () => {
    expect(codesFor(LINE, `await page.getByLabel('${'x'.repeat(40)}').click();`, EMPTY_REFERENCES, {
      bounds: { maxStringLength: 10 },
    })).toEqual(['ARGUMENT_TOO_LONG']);
  });

  it('bounds a long selector', () => {
    expect(
      codesFor(LINE, `await page.locator('${'a'.repeat(40)}').click();`, EMPTY_REFERENCES, {
        bounds: { maxSelectorLength: 10 },
      }),
    ).toEqual(['ARGUMENT_TOO_LONG']);
  });
});

describe('assertion shapes', () => {
  it.each([
    ["await expect(page.getByText('x')).toHaveValue('y');", []],
    ["await expect(page).toHaveTitle('Checks');", []],
    ["await expect(page).toBeVisible();", ['METHOD_NOT_PERMITTED']],
    ["await expect(page.getByText('x')).toHaveURL('https://a.example/');", ['METHOD_NOT_PERMITTED']],
    ["await expect(page, page).toHaveTitle('Checks');", ['ARGUMENT_COUNT']],
    ["await assert(page).toHaveTitle('Checks');", ['RECEIVER_NOT_PERMITTED']],
    ["await expect(page.getByText('x')).not.toBeVisible();", ['RECEIVER_NOT_PERMITTED']],
    ["await page.toHaveTitle('Checks');", ['RECEIVER_NOT_PERMITTED']],
    ["await expect('literal').toHaveTitle('Checks');", ['LOCATOR_CHAIN_INVALID']],
  ])('%s', (code, expected) => {
    expect(codesFor(LINE, code)).toEqual(expected);
  });
});

describe('reference positions', () => {
  const refs: ReferenceDeclarations = { variables: ['BASE'], secrets: ['PW'] };

  it('accepts a variable as a goto URL', () => {
    expect(codesFor('Go to "<var BASE>"', "await page.goto(vars.get('BASE'));", refs)).toEqual([]);
  });

  it('rejects a secret in a selector', () => {
    expect(
      codesFor('Click "<secret PW>"', "await page.locator(vars.secret('PW')).click();", refs),
    ).toEqual(['REFERENCE_POSITION_NOT_PERMITTED']);
  });

  it('rejects a variable in a selector as a type error', () => {
    expect(
      codesFor('Click "<var BASE>"', "await page.locator(vars.get('BASE')).click();", refs),
    ).toEqual(['ARGUMENT_TYPE']);
  });

  it('rejects a secret in an option value', () => {
    expect(
      codesFor(
        'Click the "<secret PW>" button',
        "await page.getByRole('button', { name: vars.secret('PW') }).click();",
        refs,
      ),
    ).toEqual(['REFERENCE_POSITION_NOT_PERMITTED']);
  });

  it('rejects a reference name longer than the bound', () => {
    const long = 'A'.repeat(80);
    expect(
      codesFor(
        `Type "<var ${long}>"`,
        `await page.getByLabel('x').fill(vars.get('${long}'));`,
        { variables: [long], secrets: [] },
      ),
      // The token regex bounds the name too, so an over-long name is also an unmatched reference.
    ).toEqual(['REFERENCE_ARGUMENT_INVALID', 'REFERENCE_EXTRA']);
  });

  it('rejects a non-literal reference name', () => {
    expect(codesFor(LINE, "await page.getByLabel('x').fill(vars.get(name));")).toEqual([
      'REFERENCE_ARGUMENT_INVALID',
    ]);
  });
});

describe('chain and receiver edge cases', () => {
  it.each([
    ["await page.getByRole('button').getByFoo('x').click();", ['METHOD_NOT_PERMITTED']],
    ["await page.getByRole('button').__proto__.click();", ['PROTOTYPE_ACCESS']],
    ["await page.getByRole('button')['click']();", ['EXPRESSION_COMPUTED_MEMBER']],
    ["await page.getByRole('button')?.click();", ['EXPRESSION_OPTIONAL_CHAIN']],
    // Outside a module context `await (` parses as a call to an identifier named `await`,
    // so the parenthesised forms below are rejected as "not an awaited call". Fail-closed.
    ["await ('literal').click();", ['STATEMENT_NOT_AWAITED']],
    ["await new Date().click();", ['EXPRESSION_NEW']],
    // Type arguments are denied in every call position, not just on the outer call.
    ["await page.goto<string>('https://a.example/');", ['UNSUPPORTED_TYPESCRIPT']],
    ["await page.locator<string>('div').click();", ['UNSUPPORTED_TYPESCRIPT']],
    ["await expect<string>(page).toHaveTitle('t');", ['UNSUPPORTED_TYPESCRIPT']],
    ["await (() => page)().click();", ['STATEMENT_NOT_AWAITED']],
  ])('%s', (code, expected) => {
    expect(codesFor(LINE, code)).toEqual(expected);
  });
});

describe('diagnostic bounds', () => {
  it('suppresses diagnostics beyond the per-step cap', () => {
    const codes = codesFor(
      LINE,
      "await page.goto('https://a.example/', { one: 1, two: 2, three: 3 });",
      EMPTY_REFERENCES,
      { bounds: { maxDiagnosticsPerStep: 1 } },
    );
    expect(codes).toEqual(['OPTION_UNKNOWN_KEY', 'DIAGNOSTICS_TRUNCATED']);
  });
});

describe('executor barrel', () => {
  it('re-exports the public executor surface', () => {
    expect(typeof executorBarrel.executeSteps).toBe('function');
    expect(typeof executorBarrel.createValueResolver).toBe('function');
    expect(typeof executorBarrel.createRedactor).toBe('function');
    expect(executorBarrel.REDACTION_PLACEHOLDER).toBe('[REDACTED]');
    expect(executorBarrel.NULL_REDACTOR.redact('unchanged')).toBe('unchanged');
  });
});
