import { describe, expect, it } from 'vitest';

import { validateArtifact } from '../src/validator/index.js';
import { parseExpectedIntent } from '../src/validator/expectedIntent.js';

const stepId = '11111111-1111-4111-8111-111111111111';
const refs = { variables: ['LOGIN_USER'], secrets: ['LOGIN_PASSWORD'] };

function validate(code: string, operation: unknown, source = 'context-selected login input') {
  return validateArtifact(
    { version: 1, steps: [{ stepIndex: 0, originalText: source, code }] },
    [source], refs, undefined,
    { schemaVersion: 1, steps: [{ stepIndex: 0, stepId, operations: [operation] }] },
  );
}

describe('expected intent correspondence', () => {
  it('deeply accepts a closed operation, locator, matcher and option shape', () => {
    const parsed = parseExpectedIntent({ schemaVersion: 1, steps: [{
      stepIndex: 0,
      stepId,
      operations: [{
        op: 'click',
        locator: { segments: [{ kind: 'getByRole', role: 'button', options: { name: { kind: 'literal', value: 'Save' }, exact: true } }] },
        options: { force: false, trial: false, button: 'left', clickCount: 1, timeout: 30_000 },
      }],
    }] }, 1, 64 * 1024);
    expect(parsed.ok).toBe(true);
  });

  it.each([
    ['root force', { op: 'goto', url: { kind: 'literal', value: 'https://example.test/' }, force: false }, '$.steps[0].operations[0]'],
    ['root exact', { op: 'goto', url: { kind: 'literal', value: 'https://example.test/' }, exact: false }, '$.steps[0].operations[0]'],
    ['misplaced option', { op: 'goto', url: { kind: 'literal', value: 'https://example.test/' }, options: { force: false } }, '$.steps[0].operations[0].options'],
    ['locator field', { op: 'click', locator: { segments: [{ kind: 'getByText', text: { kind: 'literal', value: 'x' }, force: false }] } }, '$.steps[0].operations[0].locator'],
    ['matcher field', { op: 'goto', url: { kind: 'literal', value: 'https://example.test/', exact: false } }, '$.steps[0].operations[0].url'],
    ['unknown operation', { op: 'launchMissiles' }, '$.steps[0].operations[0]'],
  ])('fails closed before normalization for %s', (_label, operation, path) => {
    const parsed = parseExpectedIntent({
      schemaVersion: 1,
      steps: [{ stepIndex: 0, stepId, operations: [operation] }],
    }, 1, 64 * 1024);
    expect(parsed).toMatchObject({
      ok: false,
      code: 'EXPECTED_INTENT_OPERATION_INVALID',
      path,
    });
  });
  it('accepts exact Unicode, whitespace, empty and escaped literals', () => {
    for (const value of ['', '  spaced  ', '東京', 'line\n"quoted"']) {
      const result = validate(
        `await page.getByLabel('Field', { exact: true }).fill(${JSON.stringify(value)});`,
        {
          op: 'fill',
          locator: { segments: [{ kind: 'getByLabel', text: { kind: 'literal', value: 'Field' }, options: { exact: true } }] },
          value: { kind: 'literal', value },
        },
        `fill ${value}`,
      );
      expect(result.ok).toBe(true);
    }
  });

  it.each([
    ['extra before', `await page.goto('https://example.test/extra');\nawait page.getByText('Submit', { exact: true }).click();`],
    ['extra after', `await page.getByText('Submit', { exact: true }).click();\nawait page.goto('https://example.test/extra');`],
    ['wrong target', `await page.getByText('Cancel', { exact: true }).click();`],
    ['changed force', `await page.getByText('Submit', { exact: true }).click({ force: true });`],
    ['changed click count', `await page.getByText('Submit', { exact: true }).click({ clickCount: 2 });`],
    ['changed trial', `await page.getByText('Submit', { exact: true }).click({ trial: true });`],
    ['changed button', `await page.getByText('Submit', { exact: true }).click({ button: 'right' });`],
    ['relaxed exact', `await page.getByText('Submit', { exact: false }).click();`],
  ])('rejects %s', (_name, code) => {
    const result = validate(code, {
      op: 'click',
      locator: { segments: [{ kind: 'getByText', text: { kind: 'literal', value: 'Submit' }, options: { exact: true } }] },
    });
    expect(result.ok).toBe(false);
    expect(result.steps[0]?.diagnostics.map((item) => item.code)).toContain('EXPECTED_INTENT_MISMATCH');
  });

  it('rejects a behavior-changing timeout but permits the exact policy default', () => {
    const operation = {
      op: 'click',
      locator: { segments: [{ kind: 'getByText', text: { kind: 'literal', value: 'Submit' }, options: { exact: true } }] },
    };
    expect(validate(`await page.getByText('Submit', { exact: true }).click({ timeout: 1 });`, operation).ok).toBe(false);
    const exactDefault = validateArtifact(
      { version: 1, steps: [{ stepIndex: 0, originalText: 'x', code: `await page.getByText('Submit', { exact: true }).click({ timeout: 30000 });` }] },
      ['x'], refs, { defaultTimeoutMs: 30_000 },
      { schemaVersion: 1, steps: [{ stepIndex: 0, stepId, operations: [operation] }] },
    );
    expect(exactDefault.ok).toBe(true);
  });

  it.each([
    [
      'wrong key',
      `await page.getByLabel('Search', { exact: true }).press('Tab');`,
      { op: 'press', locator: { segments: [{ kind: 'getByLabel', text: { kind: 'literal', value: 'Search' }, options: { exact: true } }] }, key: { kind: 'literal', value: 'Enter' } },
    ],
    [
      'changed assertion kind',
      `await expect(page.getByText('Ready', { exact: true })).toContainText('Ready');`,
      { op: 'expectVisible', locator: { segments: [{ kind: 'getByText', text: { kind: 'literal', value: 'Ready' }, options: { exact: true } }] } },
    ],
    [
      'changed assertion option',
      `await expect(page).toHaveURL('https://example.test/', { ignoreCase: true });`,
      { op: 'expectUrl', expected: { kind: 'literal', value: 'https://example.test/' } },
    ],
  ])('rejects %s', (_name, code, operation) => {
    expect(validate(code, operation).ok).toBe(false);
  });

  it('rejects reordered actions and an action inserted between expected operations', () => {
    const click = { op: 'click', locator: { segments: [{ kind: 'getByText', text: { kind: 'literal', value: 'Submit' }, options: { exact: true } }] } };
    const visible = { op: 'expectVisible', locator: { segments: [{ kind: 'getByText', text: { kind: 'literal', value: 'Ready' }, options: { exact: true } }] } };
    const expectation = { schemaVersion: 1, steps: [{ stepIndex: 0, stepId, operations: [click, visible] }] };
    const run = (code: string) => validateArtifact(
      { version: 1, steps: [{ stepIndex: 0, originalText: 'flow', code }] }, ['flow'], refs, undefined, expectation,
    );
    expect(run(`await expect(page.getByText('Ready', { exact: true })).toBeVisible();\nawait page.getByText('Submit', { exact: true }).click();`).ok).toBe(false);
    expect(run(`await page.getByText('Submit', { exact: true }).click();\nawait page.getByText('Other', { exact: true }).click();\nawait expect(page.getByText('Ready', { exact: true })).toBeVisible();`).ok).toBe(false);
  });

  it('rejects wrong, cross-step and unused contextual references', () => {
    const source = ['first', 'second'];
    const secretFill = (id: string) => ({ op: 'fill', locator: { segments: [{ kind: 'getByLabel', text: { kind: 'literal', value: 'Password' }, options: { exact: true } }] }, value: { kind: 'secret', id } });
    const expectedIntent = { schemaVersion: 1, steps: [
      { stepIndex: 0, stepId, operations: [{ op: 'goto', url: { kind: 'literal', value: 'https://example.test/' } }] },
      { stepIndex: 1, stepId: '22222222-2222-4222-8222-222222222222', operations: [secretFill('LOGIN_PASSWORD')] },
    ] };
    const crossStep = validateArtifact(
      { version: 1, steps: [
        { stepIndex: 0, originalText: 'first', code: `await page.getByLabel('Password', { exact: true }).fill(vars.secret('LOGIN_PASSWORD'));` },
        { stepIndex: 1, originalText: 'second', code: `await page.getByLabel('Password', { exact: true }).fill('literal');` },
      ] }, source, refs, undefined, expectedIntent,
    );
    expect(crossStep.ok).toBe(false);
    expect(crossStep.steps.flatMap((step) => step.diagnostics.map((item) => item.code)))
      .toEqual(expect.arrayContaining(['REFERENCE_EXTRA', 'REFERENCE_MISSING']));

    const wrongReference = validateArtifact(
      { version: 1, steps: [{ stepIndex: 0, originalText: 'input', code: `await page.getByLabel('Password', { exact: true }).fill(vars.secret('OTHER_PASSWORD'));` }] },
      ['input'], { variables: [], secrets: ['LOGIN_PASSWORD', 'OTHER_PASSWORD'] }, undefined,
      { schemaVersion: 1, steps: [{ stepIndex: 0, stepId, operations: [secretFill('LOGIN_PASSWORD')] }] },
    );
    expect(wrongReference.ok).toBe(false);
  });

  it('rejects changed locator scope and regex broadening', () => {
    const scoped = validate(
      `await page.getByRole('main').getByText('Submit', { exact: true }).click();`,
      { op: 'click', locator: { segments: [{ kind: 'getByText', text: { kind: 'literal', value: 'Submit' }, options: { exact: true } }] } },
    );
    expect(scoped.ok).toBe(false);
    const broadened = validate(
      `await expect(page).toHaveURL(/example/);`,
      { op: 'expectUrl', expected: { kind: 'literal', value: 'https://example.test/' } },
    );
    expect(broadened.ok).toBe(false);
  });

  it('authorizes a context-only secret while preserving declaration and position rules', () => {
    const accepted = validate(
      `await page.getByLabel('Password', { exact: true }).fill(vars.secret('LOGIN_PASSWORD'));`,
      {
        op: 'fill',
        locator: { segments: [{ kind: 'getByLabel', text: { kind: 'literal', value: 'Password' }, options: { exact: true } }] },
        value: { kind: 'secret', id: 'LOGIN_PASSWORD' },
      },
    );
    expect(accepted.ok).toBe(true);
    const wrongPosition = validate(
      `await page.goto(vars.secret('LOGIN_PASSWORD'));`,
      {
        op: 'fill',
        locator: { segments: [{ kind: 'getByLabel', text: { kind: 'literal', value: 'Password' }, options: { exact: true } }] },
        value: { kind: 'secret', id: 'LOGIN_PASSWORD' },
      },
    );
    expect(wrongPosition.ok).toBe(false);
    expect(wrongPosition.steps[0]?.diagnostics.map((item) => item.code)).toContain('REFERENCE_POSITION_NOT_PERMITTED');
  });

  it.each([
    { schemaVersion: 2, steps: [] },
    { schemaVersion: 1, steps: [] },
    { schemaVersion: 1, steps: [{ stepIndex: 1, stepId, operations: [] }] },
  ])('fails closed for malformed expectation %j', (expectedIntent) => {
    const result = validateArtifact(
      { version: 1, steps: [{ stepIndex: 0, originalText: 'x', code: `await page.goto('https://example.test/');` }] },
      ['x'], refs, undefined, expectedIntent,
    );
    expect(result.ok).toBe(false);
  });

  it('keeps legacy omission compatible', () => {
    expect(validateArtifact(
      { version: 1, steps: [{ stepIndex: 0, originalText: 'x', code: `await page.goto('https://example.test/');` }] },
      ['x'], refs,
    ).ok).toBe(true);
  });
});
