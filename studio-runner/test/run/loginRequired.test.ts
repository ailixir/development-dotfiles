import { describe, expect, it } from 'vitest';
import { loginRequiredSignature } from '../../src/run/loginRequired.js';

const facts = (...roles: string[]) => Object.fromEntries(roles.map((role, i) => [`e${String(i + 1)}`, { role }]));

describe('loginRequiredSignature', () => {
  it('matches the vector table of the WI-3 Java signature', () => {
    // LoginRequiredDetectionTest: a password control plus a button fact is a login page; no password control, or no button, is not.
    expect(loginRequiredSignature({ coverage: { passwordControls: 1 }, facts: facts('textbox', 'button') })).toBe(true);
    expect(loginRequiredSignature({ coverage: { passwordControls: 2 }, facts: facts('button') })).toBe(true);
    expect(loginRequiredSignature({ coverage: { passwordControls: 0 }, facts: facts('button') })).toBe(false);
    expect(loginRequiredSignature({ coverage: { passwordControls: 1 }, facts: facts('link', 'heading') })).toBe(false);
    expect(loginRequiredSignature({ coverage: { passwordControls: 1 }, facts: {} })).toBe(false);
  });

  it('a textbox-only login form no longer matches (disclosed narrowing)', () => {
    expect(loginRequiredSignature({ coverage: { passwordControls: 1 }, facts: facts('textbox', 'textbox') })).toBe(false);
  });
});
