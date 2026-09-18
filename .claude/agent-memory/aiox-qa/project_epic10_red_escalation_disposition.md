---
name: epic10-red-escalation-disposition
description: How to judge a deliberately-red ADR-002 §12 escalation test that has gone green — the 10.7 precedent, and what to demand of story 10.10's open one
metadata:
  type: project
---

A deliberately-red escalation test going green is either the gap closing (the design) or someone
widening the thing it measured (a silent defusal). **Three things must all hold** before accepting
green:

1. The widening lands in an **@architect commit** (`docs(architecture): …`), not in a story commit.
2. ADR-002 **§13 carries an amendment row** naming the class (A/B/C), the author, and a before/after
   measurement.
3. The **test itself is unchanged** — check `git log` on the test file, not just on the artefact.

**The verified precedent:** story 10.7's `ExecutionErrorCodeContractEscalationTest` was written red
because `ExecutionErrorCode` enumerated six values while the dispatcher really persists
`AUTHORIZATION_REVOKED` and `REFERENCE_UNAVAILABLE`. It is green now. `git log -S'AUTHORIZATION_REVOKED'
-- docs/specs/studio/openapi.yaml` returns exactly one commit, **`dd8932d7f`**, an @architect
amendment whose message opens "Story 10.7 escalated the last deliberately-red test on the branch
under ADR-002 §12 rather than widening a public enum itself. §15 rules on it." §13's row records
Class C and "1/2 → **2/2** with no change to the test". All three conditions hold: legitimate.

**10.10's escalation is now CLOSED, and it was verified legitimate** (10.11c gate, 2026-09-16).
`studioEscalation.test.ts` went 2/3 → 3/3 when ADR-002 §21 landed. All three checks hold, and the
third was tightened: the file *was* edited — a comment-only edit — so whole-file hashing alone would
have been ambiguous. **Hash the assertion region, not the file**: `const SPEC_DIR` → EOF is
`a3e77163af217dd032ce631c0589b208a6ef69b9f3c78517c83c1b10eb9f68f0` before and after, and the diff
hunk opening at line 4 proves the imports above it are untouched too. A comment-only edit is exactly
the shape that can hide a moved assertion — always compute the region hash on both sides yourself.

**A third escalation is open now:** story 10.11c's AC-32
(`frontend/src/services/mocks/studio/confirmedRevisionEscalation.test.ts`), committed red at
`24a5ff6c6` *before* the document moved — the **confirmed** revision's artifact and hash are
reachable from no declared response. Verified self-resolving: injecting two qualified properties
turns it 4/4 green untouched, under **two different invented spellings**, because the rule counts
*qualified forms* rather than a spelling. Awaiting @architect (§21.3 invites "a third additive
property on the same body, not a route"). Apply the same three checks when it goes green.

**How to apply:** the cheapest probe is `git log -S'<the symbol the test complains about>' -- <the
artefact>`. One commit, `docs(architecture)`, with a §13 row = closed. A story commit, or a change
to the test file, = defused. Also re-read the enum/value list for *orphans in the other direction* —
`dd8932d7f` swept both ways and said so.

Related: [[epic10-gate-policy]], [[qa-review-verification-depth]]
