import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { GuidedResult } from '@/types/studio/studioGuidedTypes';
import type { AuthoringStep } from '@/types/studio/studioTypes';
import {
  authoredLiteralHintStep,
  failedStepIdOf,
  stepCarriesAuthoredLiteral,
} from './authoredLiteralHint';

/**
 * STUDIO-OBS-008 KL-015-Q4 (conditional items c–d), the rule on its own. The payload is the landed
 * `contracts/v3/fixtures.json` `loginResult`: a FAILED result whose second step is not completed and
 * has no admitted action, which is the shape an unobservable target leaves. Only its cause is varied.
 */

const V3 = path.resolve(__dirname, '../../../../docs/specs/studio-observed-authoring/contracts/v3');
const fixtures = JSON.parse(fs.readFileSync(path.join(V3, 'fixtures.json'), 'utf8'));
const STEP = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

/**
 * A FAILED result ending in `code`. Like the backend, only `TARGET_MISMATCH` (the contract's own
 * target code) carries a `failure`; every other code is `errorCode` alone (ruling Q9, section 1 row 3e).
 * `LOGIN_REQUIRED` keeps the fixture's own `failure` and `detail`.
 */
function failedWith(code: string): GuidedResult {
  const result = structuredClone(fixtures.documents.loginResult) as GuidedResult;
  if (code === 'LOGIN_REQUIRED') return result;
  delete result.detail;
  result.errorCode = code;
  result.failure = code === 'TARGET_MISMATCH' ? ({ code } as GuidedResult['failure']) : null;
  return result;
}

const draft = (second: string): AuthoringStep[] => [
  { id: STEP(1), text: 'Go to "https://shop.example.test/orders"' },
  { id: STEP(2), text: second },
];

describe('KL-015-Q4 rule: target not found on an assertion, selection or typed literal', () => {
  it('the failing step is the first one the result reports not completed (no admitted action)', () => {
    expect(failedStepIdOf(failedWith('TARGET_MISMATCH'))).toBe(STEP(2));
  });

  it('a step with a failed action is the failing step', () => {
    const result = failedWith('TARGET_MISMATCH');
    result.explanation.steps[0].actions[0].outcome = 'FAILED';
    expect(failedStepIdOf(result)).toBe(STEP(1));
  });

  const PHRASINGS = [
    'Check the heading says Order confirmed',
    'Verify "Total" shows 3',
    'Select London from City',
    'Type ORD-1 in the Order field',
    'Enter 42 into "Quantity"',
  ];
  // The sentence of the real 015 D3 run, which ended FAILED BUDGET_EXCEEDED (ruling Q9, section 1 row 4).
  const D3_SENTENCE =
    'Click Sign in, click the Reports link and check protected Reports heading. Check page title is Reports.';

  it.each(['TARGET_MISMATCH', 'BUDGET_EXCEEDED'])('applies on %s for each literal phrasing', (code) => {
    for (const text of PHRASINGS) {
      expect(authoredLiteralHintStep(failedWith(code), draft(text)), text).toBe(2);
    }
  });

  it('applies on BUDGET_EXCEEDED for "Check the heading says Order confirmed" (the backend shape: no failure, no admitted action)', () => {
    const result = failedWith('BUDGET_EXCEEDED');
    expect(result.failure).toBeNull();
    expect(result.errorCode).toBe('BUDGET_EXCEEDED');
    expect(authoredLiteralHintStep(result, draft('Check the heading says Order confirmed'))).toBe(2);
  });

  it('applies on BUDGET_EXCEEDED for the 015 D3 sentence, whose literal is in a later clause', () => {
    expect(authoredLiteralHintStep(failedWith('BUDGET_EXCEEDED'), draft(D3_SENTENCE))).toBe(2);
  });

  it.each(['Click "Sign On"', 'Go to "https://shop.example.test"', 'Press Enter', 'Check', 'Hover over Reports'])(
    'never for a step without such a literal: "%s"',
    (text) => {
      expect(stepCarriesAuthoredLiteral(text)).toBe(false);
      for (const code of ['TARGET_MISMATCH', 'BUDGET_EXCEEDED']) {
        expect(authoredLiteralHintStep(failedWith(code), draft(text))).toBeNull();
      }
    },
  );

  it.each([
    'Click the Check out button',
    'Click Terms and Conditions',
    'Go to "https://select.example.test"',
  ])('never when a verb is only a word inside another step kind: "%s"', (text) => {
    expect(stepCarriesAuthoredLiteral(text)).toBe(false);
    expect(authoredLiteralHintStep(failedWith('BUDGET_EXCEEDED'), draft(text))).toBeNull();
  });

  it.each([
    'RUNTIME_INCOMPATIBLE',
    'UNSUPPORTED_SURFACE',
    'ASSERTION_FAILED',
    'POLICY_DENIED',
    'INVALID_CONTRACT',
    'MISSING_SOURCE',
    'AMBIGUOUS_TARGET',
    'LOGIN_REQUIRED',
  ])('never for a different cause in the landed data, even on a literal step: %s', (code) => {
    const result = failedWith(code);
    if (code === 'LOGIN_REQUIRED') expect(result.detail).toBeDefined();
    expect(authoredLiteralHintStep(result, draft('Check the heading says Order confirmed'))).toBeNull();
  });

  it.each(['EXPIRED', 'UNKNOWN_OUTCOME', 'SUCCEEDED'] as const)('never outside FAILED: %s', (outcome) => {
    for (const code of ['TARGET_MISMATCH', 'BUDGET_EXCEEDED']) {
      const result = { ...failedWith(code), outcome };
      expect(authoredLiteralHintStep(result, draft('Check the heading says Order confirmed'))).toBeNull();
    }
  });

  it('N is the failing step\'s position in the current draft, 1-based (W5 UX-03)', () => {
    const steps: AuthoringStep[] = [
      { id: STEP(3), text: 'Click "Sign On"' },
      { id: STEP(1), text: 'Go to "https://shop.example.test/orders"' },
      { id: STEP(2), text: 'Check the heading says Order confirmed' },
    ];
    expect(authoredLiteralHintStep(failedWith('TARGET_MISMATCH'), steps)).toBe(3);
    expect(authoredLiteralHintStep(failedWith('BUDGET_EXCEEDED'), [steps[2]])).toBe(1);
  });

  it('never for a step the current draft no longer has', () => {
    for (const code of ['TARGET_MISMATCH', 'BUDGET_EXCEEDED']) {
      expect(
        authoredLiteralHintStep(failedWith(code), [{ id: STEP(1), text: 'Check the heading says Done' }]),
      ).toBeNull();
    }
  });
});
