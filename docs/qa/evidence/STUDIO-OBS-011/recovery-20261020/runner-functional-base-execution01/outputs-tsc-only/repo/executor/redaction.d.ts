/**
 * Outbound redaction (AC-13, AC-19, architecture §9.2).
 *
 * Every diagnostic, error message and reporter payload the executor produces passes through a
 * redactor built from the values the resolver can produce. Known values are scrubbed in plain,
 * URL-encoded and base64 forms, because those are the shapes a value takes after a browser or
 * an HTTP client has touched it.
 *
 * This is a scrubbing step for *known* values. It cannot prove that an arbitrary string is free
 * of secrets, and it is not described as one.
 *
 * ## Why there is a JSON-escaped variant
 *
 * `src/server/logging.ts` is **serialize-then-redact** by design — it redacts the finished JSON
 * string precisely so that a field nobody enumerated is still caught. That is the right trade and
 * it is not reversed here. It has one consequence, though, and until story 10.17 nobody had paid
 * for it: the *bytes* in that finished string are JSON-escaped, so a value containing `"`, `\` or a
 * newline is no longer the value this redactor is looking for. `pa"ss` is `pa\"ss` on the line, and
 * the plain variant does not match it.
 *
 * So the escaped form is a variant beside the other seven, never instead of any of them. §9.2 asks
 * for *"known values and **tested** encoded variants"*, and the word *tested* is what makes adding
 * one traceable rather than inventive: the leak it closes is reproduced against the
 * implementation without it. For a value with no escapable byte the escaped form **is** the value,
 * so `variantCount` is unchanged — the addition cannot be a blanket widening that quietly changes
 * what every other run scrubs.
 */
export declare const REDACTION_PLACEHOLDER = "[REDACTED]";
export interface Redactor {
    /** Replaces every known value variant in `text`. */
    redact(text: string): string;
    /** Number of distinct variants this redactor scrubs; used by tests and diagnostics. */
    readonly variantCount: number;
    /**
     * Length of the longest variant this redactor could match, or 0 when it holds none.
     *
     * A consumer that has to cut a stream needs to know how much to hold back before cutting, and
     * that bound is *the longest thing this redactor could possibly match* — not the longest known
     * value. Base64 of a value is roughly four-thirds of it and double URL-encoding can be longer
     * still, so a tail sized to the raw value leaves exactly the same hole for the encoded form of a
     * value near the cap.
     *
     * It is published here rather than recomputed by the consumer because `ordered` already holds
     * it: two derivations of one bound in two modules is this codebase's most-repeated defect. See
     * `src/run/outputRelay.ts`, which reads this and computes nothing.
     */
    readonly longestVariantLength: number;
}
/**
 * Builds a redactor for the given values. Longer variants are replaced first so a value that is
 * a prefix of another cannot leave a partial match behind.
 */
export declare function createRedactor(values: readonly string[]): Redactor;
/** Redactor for a run with no secret material; still used so call sites have no branch. */
export declare const NULL_REDACTOR: Redactor;
/** Truncates and redacts a failure message before it leaves the executor (AC-15). */
export declare function safeMessage(error: unknown, redactor: Redactor, maxLength: number): string;
