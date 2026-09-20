/**
 * Service identity for the four internal routes (AC-2a, architecture §8.4, §9.1).
 *
 * The check runs on the request head, **before** the body is read: no parsing, no validation and
 * no slot reservation happens for an unauthenticated caller, so an unauthenticated request costs
 * the process one string comparison and nothing else.
 *
 * Comparison is constant-time. Both sides are hashed to a fixed 32-byte digest first, so
 * `timingSafeEqual` — which throws on length mismatch and would otherwise leak the credential
 * length through that throw — always sees equal lengths. Comparing digests rather than raw bytes
 * is what makes "wrong length" and "wrong value" indistinguishable from the outside.
 *
 * **AC-2b is not verified here.** This proves the runner rejects a missing, blank, malformed or
 * wrong credential against a configured stub. Verification against a real platform-issued
 * identity through the real ingress belongs to story 10.18, which `ED-02` gates.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export type IdentityVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 401 | 403; readonly code: string };

const MISSING: IdentityVerdict = { ok: false, status: 401, code: 'IDENTITY_MISSING' };
const MALFORMED: IdentityVerdict = { ok: false, status: 401, code: 'IDENTITY_MALFORMED' };
const REJECTED: IdentityVerdict = { ok: false, status: 403, code: 'IDENTITY_REJECTED' };

/** Header carrying the restricted service identity. Never a query parameter (AC-3). */
export const IDENTITY_HEADER = 'authorization';

const BEARER = /^Bearer (\S+)$/u;

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export interface IdentityChecker {
  /** Verdict for one request's raw header value. `undefined` means the header was absent. */
  check(headerValue: string | undefined): IdentityVerdict;
}

export function createIdentityChecker(expectedToken: string): IdentityChecker {
  if (expectedToken.trim() === '') {
    // A blank configured credential would accept a blank presented one. Fail at construction.
    throw new Error('The configured service identity must not be blank.');
  }
  const expected = digest(expectedToken);

  return {
    check(headerValue: string | undefined): IdentityVerdict {
      if (headerValue === undefined || headerValue.trim() === '') return MISSING;
      const match = BEARER.exec(headerValue.trim());
      if (match === null) return MALFORMED;
      const presented = match[1];
      if (presented === undefined) return MALFORMED;
      // Equal-length digests: the comparison time does not depend on where the first byte
      // differs, and a wrong-length credential is indistinguishable from a wrong-value one.
      return timingSafeEqual(digest(presented), expected) ? { ok: true } : REJECTED;
    },
  };
}
