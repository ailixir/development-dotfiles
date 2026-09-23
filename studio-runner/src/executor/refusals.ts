/**
 * Policy refusals a step can end in.
 *
 * A refusal is not an assertion outcome: the runner declined to perform the action at all,
 * because the value it would have acted on is outside what the run is permitted to do. Each code
 * is also a run-level `errorCode` (`src/run/errors.ts`), so an operator sees the named condition
 * rather than a generic `STEP_FAILED`.
 *
 * The error's `name` **is** the code, so `safeMessage` renders `CODE: message` without a second
 * spelling. Messages name the reference or the rule and never the value (AC-13).
 */

export const STEP_REFUSAL_CODES = {
  /** A `goto` whose URL came from a variable resolved to something other than absolute http(s). */
  URL_SCHEME_NOT_PERMITTED: 'URL_SCHEME_NOT_PERMITTED',
  /** A secret was about to be filled on a page whose origin the secret is not bound to. */
  SECRET_ORIGIN_NOT_ALLOWED: 'SECRET_ORIGIN_NOT_ALLOWED',
} as const;

export type StepRefusalCode = (typeof STEP_REFUSAL_CODES)[keyof typeof STEP_REFUSAL_CODES];

export class StepRefusal extends Error {
  readonly code: StepRefusalCode;

  constructor(code: StepRefusalCode, message: string) {
    super(message);
    this.name = code;
    this.code = code;
  }
}

/**
 * Whether `value` is an absolute `http:` or `https:` URL — the same rule the validator applies to
 * a literal `goto` URL (`validator/arguments.ts`, `readUrlLiteral`).
 */
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
