import { describe, expect, it } from 'vitest';

import { validateArtifact } from '../src/validator/index.js';
import type { ReferenceDeclarations } from '../src/validator/index.js';

/**
 * ADR-SC-003: a structural reference policy, not the English of the step, authorizes the
 * references a step selects through its context.
 */
const SOURCE = ['Sign in with the saved credentials'];
const REFERENCES: ReferenceDeclarations = {
  variables: ['LOGIN_USER', 'REGION'],
  secrets: ['LOGIN_PASSWORD', 'OTHER_SECRET'],
};

function artifact(code: string): unknown {
  return { version: 1, steps: [{ stepIndex: 0, originalText: SOURCE[0], code }] };
}

function policy(
  required: { variables?: string[]; secrets?: string[] },
  allowed: { variables?: string[]; secrets?: string[] } = required,
): unknown {
  return {
    version: 2,
    steps: [
      {
        stepIndex: 0,
        required: { variables: required.variables ?? [], secrets: required.secrets ?? [] },
        allowed: { variables: allowed.variables ?? [], secrets: allowed.secrets ?? [] },
      },
    ],
  };
}

function codes(result: ReturnType<typeof validateArtifact>): string[] {
  return [
    ...result.diagnostics.map((diagnostic) => diagnostic.code),
    ...result.steps.flatMap((step) => step.diagnostics.map((diagnostic) => diagnostic.code)),
  ];
}

const FILL_USER_AND_PASSWORD =
  "await page.getByLabel('Username').fill(vars.get('LOGIN_USER'));\n"
  + "await page.getByLabel('Password').fill(vars.secret('LOGIN_PASSWORD'));";

describe('structural reference policy', () => {
  it('accepts references the step selects through its context, with no token in its text', () => {
    const result = validateArtifact(
      artifact(FILL_USER_AND_PASSWORD),
      SOURCE,
      REFERENCES,
      undefined,
      policy({ variables: ['LOGIN_USER'], secrets: ['LOGIN_PASSWORD'] }),
    );
    expect(codes(result)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects the same references without a policy, under the source-token rule', () => {
    const result = validateArtifact(artifact(FILL_USER_AND_PASSWORD), SOURCE, REFERENCES);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain('REFERENCE_EXTRA');
  });

  it('rejects a declared secret the policy does not allow with REFERENCE_EXTRA', () => {
    const result = validateArtifact(
      artifact("await page.getByLabel('Password').fill(vars.secret('OTHER_SECRET'));"),
      SOURCE,
      REFERENCES,
      undefined,
      policy({ secrets: [] }, { variables: ['REGION'], secrets: ['LOGIN_PASSWORD'] }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['REFERENCE_EXTRA']);
    expect(result.steps[0]?.operations).toBeNull();
  });

  it('rejects a required reference the code never uses with REFERENCE_MISSING', () => {
    const result = validateArtifact(
      artifact("await page.getByLabel('Username').fill(vars.get('LOGIN_USER'));"),
      SOURCE,
      REFERENCES,
      undefined,
      policy({ variables: ['LOGIN_USER'], secrets: ['LOGIN_PASSWORD'] }),
    );
    expect(result.ok).toBe(false);
    expect(codes(result)).toEqual(['REFERENCE_MISSING']);
  });

  it('lets an allowed-but-not-required contextual default go unused or be used', () => {
    const allowed = { variables: ['REGION'], secrets: [] };
    const unused = validateArtifact(
      artifact("await page.getByRole('button', { name: 'Go' }).click();"),
      SOURCE,
      REFERENCES,
      undefined,
      policy({}, allowed),
    );
    expect(unused.ok).toBe(true);
    const used = validateArtifact(
      artifact("await page.getByLabel('Region').fill(vars.get('REGION'));"),
      SOURCE,
      REFERENCES,
      undefined,
      policy({}, allowed),
    );
    expect(used.ok).toBe(true);
  });

  it.each([
    ['a retired version', { version: 1, steps: [] }],
    ['an unknown key', { version: 2, steps: [], extra: true }],
    ['a step count that does not match the source', { version: 2, steps: [] }],
    ['a required set outside the allowed set', policy({ secrets: ['LOGIN_PASSWORD'] }, {})],
    ['a non-string name', policy({ variables: [42 as unknown as string] })],
  ])('rejects %s as REFERENCE_POLICY_INVALID without running step checks', (_name, invalid) => {
    const result = validateArtifact(
      artifact(FILL_USER_AND_PASSWORD),
      SOURCE,
      REFERENCES,
      undefined,
      invalid,
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'REFERENCE_POLICY_INVALID',
    ]);
    expect(result.steps.every((step) => step.operations === null)).toBe(true);
  });
});
