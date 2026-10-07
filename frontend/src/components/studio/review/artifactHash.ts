import type { TestDto } from '@/types/studio/studioTypes';

/**
 * The one accessor for `ConfirmCompileRequest.artifactHash` (story 10.10 AC-11b; story 10.11c
 * AC-27).
 *
 * **It has exactly one implementation and it reads the declared field.** ADR-002 §21 ruled
 * candidate A and story 10.11c landed it: `TestDto.currentCandidateArtifactHash` is the canonical
 * hash of the revision `currentCandidateRevisionId` already names, and it is the field this value
 * comes from. Before that ruling this function returned *unavailable* for every input and the
 * confirm control was blocked, which is what an escalation looks like from the consumer's side.
 *
 * **The prohibition story 10.10 wrote is carried verbatim and is not relaxed.** A hash is never
 * fabricated, never recomputed client-side from anything — including from
 * `currentCandidateArtifact`, which is now on the same body and is the obvious thing to hash — and
 * never defaulted. A client-computed `artifactHash` would be the client asserting what the server
 * canonicalized, which is the one thing the conditional transaction exists to check; ADR-002 §21.8
 * rejects it by name. So this function reads one field and does nothing else: no normalization, no
 * trimming, no fallback to another field, no derivation.
 *
 * **Absence is still a first-class answer.** A draft with no candidate carries no hash, and so does
 * a body from an older server, and so does a list entry — the list projection nulls this field
 * deliberately (§21.2). In every one of those the answer is *unavailable* and the confirm control
 * stays blocked, because a confirmation cannot be assembled without it.
 */
export type ArtifactHashResult =
  | { readonly available: true; readonly value: string }
  | { readonly available: false; readonly reason: string };

export const ARTIFACT_HASH_UNAVAILABLE_REASON =
  'Confirming needs the fingerprint of the translated steps, and this draft did not come back with one. That happens when there is no translated candidate to confirm yet. Nothing is computed here in its place. The fingerprint is the server’s statement about what it produced, and a guess would defeat the check that confirmation exists to make.';

export function readArtifactHash(test: TestDto): ArtifactHashResult {
  const declared = test.currentCandidateArtifactHash;
  if (typeof declared !== 'string' || declared.length === 0) {
    return { available: false, reason: ARTIFACT_HASH_UNAVAILABLE_REASON };
  }
  return { available: true, value: declared };
}
