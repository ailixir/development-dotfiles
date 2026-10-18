import { describe, expect, it } from 'vitest';

import { createRedactor, safeMessage, REDACTION_PLACEHOLDER } from '../src/executor/redaction.js';

/** A value with characters that change shape under URL and base64 encoding. */
const CANARY = 'p@ss w0rd/+=';

function variantsOf(value: string): string[] {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return [
    value,
    encodeURIComponent(value),
    encodeURI(value),
    encodeURIComponent(encodeURIComponent(value)),
    base64,
    base64.replace(/=+$/u, ''),
    base64.replace(/\+/gu, '-').replace(/\//gu, '_'),
  ];
}

describe('redaction', () => {
  it('scrubs plain, URL-encoded and base64 variants (AC-19)', () => {
    const redactor = createRedactor([CANARY]);
    for (const variant of variantsOf(CANARY)) {
      const redacted = redactor.redact(`prefix ${variant} suffix`);
      expect(redacted).not.toContain(variant);
      expect(redacted).toContain(REDACTION_PLACEHOLDER);
    }
  });

  it('ignores empty values and leaves unrelated text alone', () => {
    const redactor = createRedactor(['', 'abc']);
    expect(redactor.redact('nothing to see')).toBe('nothing to see');
    expect(redactor.variantCount).toBeGreaterThan(0);
  });

  it('bounds and redacts a thrown error message', () => {
    const redactor = createRedactor([CANARY]);
    const message = safeMessage(new Error(`failed with ${CANARY}`), redactor, 200);
    expect(message).not.toContain(CANARY);
    expect(message).toContain(REDACTION_PLACEHOLDER);
  });
});

/**
 * Story 10.17 AC-14 — the JSON-escaped variant, and the variant set stays a tested set.
 *
 * §9.2 asks for *"known values and **tested** encoded variants"*, and the word *tested* is what
 * makes adding one traceable rather than inventive. So the hole is reproduced against the
 * implementation without the variant before it is closed, and the addition is shown not to be a
 * blanket widening that quietly changes what every other run scrubs.
 */
describe('AC-14 — serialize-then-redact needs a JSON-escaped variant, and only that', () => {
  /** Contains all three bytes the serializer escapes: a quote, a backslash and a newline. */
  const ESCAPABLE = 'CANARY-Jsn-pa"ss\\back\nline';

  /** What `src/server/logging.ts` actually searches: the finished, serialized line. */
  function serializedLine(value: string): string {
    return JSON.stringify({ level: 'warn', event: 'run.child_output', output: `saw ${value}` });
  }

  it('reproduces the leak: the plain variant does not match the escaped bytes', () => {
    // A redactor built only from the seven pre-10.17 variants. Written out rather than imported,
    // because the point is what the old implementation could match — a shape that no longer exists
    // in `src/` and therefore cannot be asserted from it.
    const base64 = Buffer.from(ESCAPABLE, 'utf8').toString('base64');
    const sevenVariants = [
      ESCAPABLE,
      encodeURIComponent(ESCAPABLE),
      encodeURI(ESCAPABLE),
      encodeURIComponent(encodeURIComponent(ESCAPABLE)),
      base64,
      base64.replace(/=+$/u, ''),
      base64.replace(/\+/gu, '-').replace(/\//gu, '_'),
    ];

    const line = serializedLine(ESCAPABLE);
    // The value is genuinely on the line — as its escaped bytes, which is the whole problem.
    expect(line).toContain('pa\\"ss');
    for (const variant of sevenVariants) {
      expect(
        line.includes(variant),
        'one of the seven pre-10.17 variants matched, so there was no hole to close',
      ).toBe(false);
    }
  });

  it('closes it: the value is scrubbed from the serialized line it actually appears on', () => {
    const redactor = createRedactor([ESCAPABLE]);
    const line = serializedLine(ESCAPABLE);

    const scrubbed = redactor.redact(line);

    expect(scrubbed).toContain(REDACTION_PLACEHOLDER);
    expect(scrubbed).not.toContain('pa\\"ss');
    expect(scrubbed).not.toContain('CANARY-Jsn-');
  });

  it('leaves variantCount unchanged for a value with no escapable byte', () => {
    // For such a value the escaped form *is* the value, so the set cannot grow. This is what stops
    // the addition being a blanket widening that changes what every other run scrubs.
    for (const plain of ['p@ss w0rd', 'simple', 'CANARY-Zq7-p@ss w0rd/+=', '密码']) {
      const withEscape = createRedactor([plain]);
      const variants = new Set([
        plain,
        encodeURIComponent(plain),
        encodeURI(plain),
        encodeURIComponent(encodeURIComponent(plain)),
        ...(() => {
          const b = Buffer.from(plain, 'utf8').toString('base64');
          return [b, b.replace(/=+$/u, ''), b.replace(/\+/gu, '-').replace(/\//gu, '_'), b.replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')];
        })(),
      ]);
      expect(withEscape.variantCount, `variantCount changed for ${plain}`).toBe(variants.size);
    }
    // …and it does grow for a value that needs it, so the assertion above is not vacuous.
    expect(createRedactor([ESCAPABLE]).variantCount).toBeGreaterThan(
      createRedactor(['CANARY-Jsn-passbackline']).variantCount - 1,
    );
    expect(createRedactor([ESCAPABLE]).redact(JSON.stringify(ESCAPABLE))).not.toContain('CANARY-Jsn-');
  });

  it('keeps redact on split/join, with no RegExp over attacker-influenced text', () => {
    // §4.5 rejects unsafe regex constructs for the same reason. A value that is a valid regex with
    // a very different meaning must be replaced literally, and a value that is not a valid regex at
    // all must not throw.
    const metacharacters = 'CANARY-Rgx-.*+?[](){}|^$';
    const redactor = createRedactor([metacharacters]);

    expect(redactor.redact(`saw ${metacharacters} here`)).toBe(`saw ${REDACTION_PLACEHOLDER} here`);
    // The regex `.*` would have matched everything; the literal does not.
    expect(redactor.redact('saw something else here')).toBe('saw something else here');
    expect(() => createRedactor(['(unclosed']).redact('(unclosed')).not.toThrow();
  });

  it('publishes the longest variant length so a consumer need not recompute the bound (AC-21)', () => {
    const value = 'v'.repeat(300);
    const redactor = createRedactor([value]);
    // Base64 is roughly four-thirds of the value, which is why the raw value is the wrong bound.
    expect(redactor.longestVariantLength).toBeGreaterThan(value.length);
    expect(createRedactor([]).longestVariantLength).toBe(0);
  });
});
