import type { TestDto } from '@/types/studio/studioTypes';

/**
 * The one accessor for `ConfirmCompileRequest.artifactHash` (story 10.10, AC-11b / AC-15).
 *
 * **It has exactly one implementation and it returns unavailable.** `artifactHash` is `required`
 * on the confirmation body, and it is reachable from no declared `2xx` response schema of any
 * `tests`-tagged operation: it appears on a request *example*, on `ConfirmCompileRequest` itself
 * and on the internal `RunJob`, and an example is not a schema (ADR-002 §14.6). So the client is
 * required to send a value it has no declared way to obtain. That is a Class C divergence this
 * story may raise and may not fix (§12), and `studioEscalation.test.ts` carries it as a live,
 * self-resolving contract test that is **committed red**.
 *
 * A hash is never fabricated, never recomputed client-side from anything, and never defaulted.
 * A client-computed `artifactHash` would be the client asserting what the server canonicalized,
 * which is the one thing the conditional transaction exists to check.
 *
 * When the ruling lands and the document is amended, this function reads the declared field and
 * the confirm control stops being blocked. Nothing else on this surface changes.
 */
export type ArtifactHashResult =
  | { readonly available: true; readonly value: string }
  | { readonly available: false; readonly reason: string };

export const ARTIFACT_HASH_BLOCKED_REASON =
  'Confirming needs a fingerprint of the translated steps, and the API does not yet return one on any response this page can read. This is raised with the architecture owner as story 10.10 AC-15; until it is settled, confirming is blocked here rather than guessed at.';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function readArtifactHash(_test: TestDto): ArtifactHashResult {
  return { available: false, reason: ARTIFACT_HASH_BLOCKED_REASON };
}
