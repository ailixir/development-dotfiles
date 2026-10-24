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
export const REDACTION_PLACEHOLDER = '[REDACTED]';
function base64Variants(value) {
    const standard = Buffer.from(value, 'utf8').toString('base64');
    const unpadded = standard.replace(/=+$/u, '');
    const urlSafe = standard.replace(/\+/gu, '-').replace(/\//gu, '_');
    const urlSafeUnpadded = urlSafe.replace(/=+$/u, '');
    return [standard, unpadded, urlSafe, urlSafeUnpadded];
}
/**
 * The value as it appears *inside* a JSON string literal.
 *
 * `JSON.stringify` returns the quoted literal; the quotes are not part of what the serializer wrote
 * around the value, so they are stripped. For a value with nothing to escape this returns the value
 * unchanged, which is what keeps `variantCount` stable for every run that does not need it.
 */
function jsonEscaped(value) {
    const literal = JSON.stringify(value);
    return literal.slice(1, -1);
}
function variantsFor(value) {
    const variants = new Set([value]);
    variants.add(encodeURIComponent(value));
    variants.add(encodeURI(value));
    // Double encoding survives one proxy hop and still reveals the value.
    variants.add(encodeURIComponent(encodeURIComponent(value)));
    // Serialize-then-redact means the line being searched is JSON-escaped (AC-14).
    variants.add(jsonEscaped(value));
    for (const encoded of base64Variants(value))
        variants.add(encoded);
    return [...variants].filter((variant) => variant.length > 0);
}
/**
 * Builds a redactor for the given values. Longer variants are replaced first so a value that is
 * a prefix of another cannot leave a partial match behind.
 */
export function createRedactor(values) {
    const variants = new Set();
    for (const value of values) {
        if (value.length === 0)
            continue;
        for (const variant of variantsFor(value))
            variants.add(variant);
    }
    const ordered = [...variants].sort((a, b) => b.length - a.length);
    const longest = ordered[0] ?? '';
    return {
        variantCount: ordered.length,
        // `ordered` is sorted descending by length, so the first entry is the bound (AC-21).
        longestVariantLength: longest.length,
        redact(text) {
            let result = text;
            for (const variant of ordered) {
                if (result.includes(variant))
                    result = result.split(variant).join(REDACTION_PLACEHOLDER);
            }
            return result;
        },
    };
}
/** Redactor for a run with no secret material; still used so call sites have no branch. */
export const NULL_REDACTOR = createRedactor([]);
/** Truncates and redacts a failure message before it leaves the executor (AC-15). */
export function safeMessage(error, redactor, maxLength) {
    const raw = error instanceof Error
        ? `${error.name}: ${error.message}`
        : `Non-error thrown: ${typeof error}`;
    const redacted = redactor.redact(raw).replace(/\s+/gu, ' ').trim();
    return redacted.length <= maxLength
        ? redacted
        : `${redacted.slice(0, Math.max(0, maxLength - 1))}…`;
}
//# sourceMappingURL=redaction.js.map