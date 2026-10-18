import { describe, expect, it } from 'vitest';
import { AUTHOR_FACING_SAVE_ERRORS, GENERIC_SAVE_ERROR, saveErrorMessage } from './saveErrorMessage';

/** VAL-027 — which save refusals reach the author in the server's own words. */

const refusal = (status: number, data: unknown) => ({ message: 'Request failed', response: { status, data } });

describe('saveErrorMessage', () => {
  it.each([
    ['INVALID_STEPS', 'Step 2 is blank. Write what the step should do, or remove it.'],
    ['INVALID_CONFIGURATION', 'configuration.timeoutSeconds must be between 1 and 120.'],
    ['INLINE_CREDENTIAL', 'Step 1 has a password in its address. Store it as a secret and use {{secret.NAME}}.'],
    [
      'SOURCE_LINE_TOO_LONG',
      'Step 2 is 501 characters long; the maximum is 500. Shorten it or split it into two steps.',
    ],
    ['SOURCE_TOO_MANY_STEPS', 'This test has more than 100 steps. Split it into smaller tests.'],
  ])('shows the server message for a 400 %s', (error, message) => {
    expect(AUTHOR_FACING_SAVE_ERRORS.has(error)).toBe(true);
    expect(saveErrorMessage(refusal(400, { error, message }))).toBe(message);
  });

  it.each([
    ['a 500', refusal(500, { error: 'INTERNAL_ERROR', message: 'stack trace' })],
    ['a 503 with a declared code', refusal(503, { error: 'INVALID_STEPS', message: 'x' })],
    ['an unknown 400 code', refusal(400, { error: 'SOMETHING_ELSE', message: 'internal detail' })],
    ['a declared 400 code with no message', refusal(400, { error: 'INVALID_STEPS', message: '  ' })],
    ['a 400 with no body', refusal(400, null)],
    ['a network failure', new Error('Network Error')],
    ['a non-error', undefined],
  ])('keeps the generic text for %s', (_label, error) => {
    expect(saveErrorMessage(error)).toBe(GENERIC_SAVE_ERROR);
  });
});
