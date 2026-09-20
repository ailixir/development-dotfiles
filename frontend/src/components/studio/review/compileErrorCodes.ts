/**
 * The one copy of the `compileError` vocabulary in this repository's frontend (story 10.10, AC-4).
 *
 * ADR-002 §18.3: *"Whichever lands first should install the document-reading assertion once, and
 * the other should extend it rather than write a second one. Two hand-maintained copies of one
 * vocabulary in two languages is the arrangement that produced INT-4."* The assertion lives in
 * `studioContract.test.ts` and compares this map against `CompileError.x-compile-error-codes`
 * **in both directions** — a code with no explanation and an explanation for a code the document
 * does not declare are both red. Story 10.11 extends that assertion for `ExecutionErrorCode`; it
 * does not write a second one.
 *
 * Every condition here is the server's, not the author's: the draft is saved and unchanged, any
 * revision already confirmed still runs, and asking for the translation again is the whole remedy
 * (`CompileError`'s own description, §4.7).
 *
 * The set is open by design. §14.7 lets a story that lands a new compile failure condition add its
 * code in its own PR, so `code` stays a free string on the wire and an unrecognized code renders
 * the generic narrative **plus the code verbatim** rather than an empty panel (AC-5).
 */
export const COMPILE_ERROR_NARRATIVES: Readonly<Record<string, string>> = {
  COMPILE_POOL_SATURATED:
    'Too many translations were running at once, so this one was not started. Nothing in your steps caused it.',
  COMPILE_BUDGET_EXCEEDED:
    'The translation ran longer than the time it is allowed and was stopped part-way.',
  VALIDATOR_UNAVAILABLE:
    'The service that checks a translation could not be reached, so the result could not be accepted.',
  COMPILE_INTERNAL_ERROR:
    'Something failed inside the translation service. The failure has been recorded on our side.',
  GATEWAY_UNAVAILABLE: 'The translation service was not reachable when we called it.',
  GATEWAY_BUSY: 'The translation service was too busy to take this request.',
  GATEWAY_TIMEOUT: 'The translation service did not answer in time.',
  GATEWAY_TRANSPORT: 'The connection to the translation service broke while we were waiting.',
  GATEWAY_PARSE_FAILURE:
    'The translation service answered with something we could not read, so nothing was kept.',
  COMPILE_INPUT_TOO_LARGE:
    'Your steps were too large to send for translation. Splitting the test into smaller ones is the way past it.',
  GATEWAY_OUTPUT_TOO_LARGE:
    'The translation came back larger than we accept, so it was discarded rather than stored part-way.',
};

/**
 * What the surface says about a code the deployed API has learned and this build has not.
 * §14.7 makes that expected rather than a defect, and §16.4 keeps `code` a string for it.
 */
export const UNDECLARED_COMPILE_ERROR_NARRATIVE =
  'The translation stopped for a reason this page does not have wording for yet. The draft is saved and unchanged, anything already confirmed still runs, and asking for the translation again is the remedy. The reason the server gave is shown below so it can be quoted in a ticket.';

export function compileErrorNarrative(code: string): string {
  return COMPILE_ERROR_NARRATIVES[code] ?? UNDECLARED_COMPILE_ERROR_NARRATIVE;
}

export function isDeclaredCompileErrorCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMPILE_ERROR_NARRATIVES, code);
}
