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
 */

export const REDACTION_PLACEHOLDER = '[REDACTED]';

export interface Redactor {
  /** Replaces every known value variant in `text`. */
  redact(text: string): string;
  /** Number of distinct variants this redactor scrubs; used by tests and diagnostics. */
  readonly variantCount: number;
}

function base64Variants(value: string): string[] {
  const standard = Buffer.from(value, 'utf8').toString('base64');
  const unpadded = standard.replace(/=+$/u, '');
  const urlSafe = standard.replace(/\+/gu, '-').replace(/\//gu, '_');
  const urlSafeUnpadded = urlSafe.replace(/=+$/u, '');
  return [standard, unpadded, urlSafe, urlSafeUnpadded];
}

function variantsFor(value: string): string[] {
  const variants = new Set<string>([value]);
  variants.add(encodeURIComponent(value));
  variants.add(encodeURI(value));
  // Double encoding survives one proxy hop and still reveals the value.
  variants.add(encodeURIComponent(encodeURIComponent(value)));
  for (const encoded of base64Variants(value)) variants.add(encoded);
  return [...variants].filter((variant) => variant.length > 0);
}

/**
 * Builds a redactor for the given values. Longer variants are replaced first so a value that is
 * a prefix of another cannot leave a partial match behind.
 */
export function createRedactor(values: readonly string[]): Redactor {
  const variants = new Set<string>();
  for (const value of values) {
    if (value.length === 0) continue;
    for (const variant of variantsFor(value)) variants.add(variant);
  }
  const ordered = [...variants].sort((a, b) => b.length - a.length);

  return {
    variantCount: ordered.length,
    redact(text: string): string {
      let result = text;
      for (const variant of ordered) {
        if (result.includes(variant)) result = result.split(variant).join(REDACTION_PLACEHOLDER);
      }
      return result;
    },
  };
}

/** Redactor for a run with no secret material; still used so call sites have no branch. */
export const NULL_REDACTOR: Redactor = createRedactor([]);

/** Truncates and redacts a failure message before it leaves the executor (AC-15). */
export function safeMessage(error: unknown, redactor: Redactor, maxLength: number): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : `Non-error thrown: ${typeof error}`;
  const redacted = redactor.redact(raw).replace(/\s+/gu, ' ').trim();
  return redacted.length <= maxLength
    ? redacted
    : `${redacted.slice(0, Math.max(0, maxLength - 1))}…`;
}
