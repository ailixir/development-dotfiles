/**
 * AC-7a, AC-9 — redaction stated as an **experiment**, not as a property — and the blocked halves.
 *
 * The AC-7a and AC-9 experiments drove a naive artifact-1 child that handed resolved job values
 * back raw on its streams, its exceptions and its step failures, and asserted every surface the
 * parent relayed them to. That child protocol, the relay of its output and the artifact-1 job's
 * resolved values were deleted by STUDIO-OBS-012A AC-3, and so were those cases: the observed child
 * speaks closed frames only, and the observed launcher drains and discards its raw streams
 * (`test/server/hung-child.test.ts` asserts nothing of a flood reaches the pod log). Observed secret
 * privacy is asserted in `test/fixtures-tier/observed-replay-privacy.test.ts` and
 * `test/run/secretReplay.test.ts`.
 *
 * What remains here is the record of the halves that are blocked on external dependencies,
 * recorded as live skips and never as passes, and the gate-shut tripwire over the production
 * `ACCEPTED_JOB_KEYS` that `test/deferred.test.ts` names as re-run unchanged.
 */
import { describe, expect, it } from 'vitest';

import { ACCEPTED_JOB_KEYS } from '../../src/reporting/envelope.js';

describe('Blocked halves — recorded as live skips, never as passes', () => {
  it.skip(
    'AC-13b (ED-02, owner 10.19, the other half of 10.13 AC-7b) — the same canaries through the ' +
      'integrated path with real vault material: nothing the API persists carries them, across ' +
      'progress rows, the persisted snapshot, structured log storage and 10.14’s terminal result ' +
      'manifest. The runner can only assert on what leaves it; the API half needs real material, ' +
      'which needs a real vault. ED-02 is status: open.',
    () => undefined,
  );

  for (const drafted of [
    'a variable URL resolving to an unapproved origin is refused at dispatch',
    'the same resolved URL is refused again during execution',
    'a redirect from an approved origin to an unapproved one is refused',
    'a subresource request to an unapproved origin is refused',
    'a secret submitted to an approved origin over an unapproved scheme is refused',
    'a local file URL is refused',
    'a cloud metadata endpoint is refused',
  ]) {
    it.skip(
      `AC-16b (ED-04 + ADR-002 O-6; mechanism owner 10.18 SPK-05, integrated proof 10.19) — ${drafted}`,
      () => undefined,
    );
  }

  it('records why AC-16b cannot be implemented here rather than leaving it to be re-derived', () => {
    // Not a skip: this one asserts a fact about this branch, which is that the mechanism the tests
    // above would drive does not exist and may not be invented here.
    //
    // §9.3 requires variable URL destinations to be resolved against policy "at dispatch and again
    // during execution", over "redirects and browser-initiated traffic, not just initial `goto`".
    // ADR-002 O-6 — whether that policy travels **on the job** or is enforced only at the **egress
    // layer** — is unresolved and solely 10.18's. Adding such a field to the closed `RunJob` is
    // §12 Class B: proposable by a story, landable only after an architect rules. So the contract
    // deliberately declares reference names and no policy field, and this story neither invents
    // one nor absorbs O-6.
    //
    // The assertion, over the **production** key set (QA LOW-2). The first version of this
    // iterated `validJob()` — a hand-built test fixture — so adding `targetPolicy` to the real
    // `ACCEPTED_JOB_KEYS` left it green. A tripwire pointed at a stand-in is a statement about the
    // stand-in; this is the sixteenth vacuous-guard shape and this file shipped two of them.
    for (const key of ['approvedOrigins', 'targetPolicy', 'secretUsePolicy', 'destinations']) {
      expect(
        [...ACCEPTED_JOB_KEYS],
        `the envelope accepts '${key}', so ADR-002 O-6 has been ruled and AC-16b is no longer blocked`,
      ).not.toContain(key);
    }
    // …and the set is the real one, not an empty stand-in that would satisfy the above.
    expect(ACCEPTED_JOB_KEYS.has('resolvedSecrets')).toBe(true);
    // `expect(ACCEPTED_JOB_KEYS.size).toBe(14)` stood here and is **replaced**, not moved beside
    // a stronger check: a hand-maintained count next to a derived comparison is ADR-002 §15.6's
    // arrangement. The set is now pinned against `components.schemas.RunJob.properties` read from
    // the frozen document — set equality, so a rename or a swap on either side reddens where the
    // count stayed at fourteen and green (ADR-002 O-15, story 10.18a). The named test is
    // `test/contract.test.ts` > "accepts exactly the job keys the frozen RunJob declares".
    //
    // The tripwire above is untouched and is still 10.17's (AC-16b): it asserts over the
    // production set, not a fixture, and it must stay green until ADR-002 O-6 is ruled.
  });
});
