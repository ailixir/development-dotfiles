# FOCUS-MUTATION-01 and R1 placement

Recorded by Pax (@po) on 2026-10-16. The machine record is `decision.json` in this folder. It lists the source hashes and the story hashes before and after this change.

Sources:
- Quinn (@qa), `../backend/w3-qa-ack02/review.md` §9.
- Dex-D5, `../backend/w3-d5-diagnosis01/review.md`, "Design observation".
- Aria (@architect), `../backend/w3-window01/aria-lifecycle-ruling01/ruling.md` §4 R1.

What I did and did not do:
- I ran no build or test. All story edits were appended, and no story's Status changed.
- I read the cited anchors in the working tree. They match, with one correction: `observationCollectorInvoke.test.ts:133-159` holds **three** focus-handler refusal cases (retype to password, focus stolen, read-only), not four as Quinn states.
- The L1 `verifyLifecycle`/`sameIdentity` methods are already in the working tree, at `GuidedMaterializationService.java:301/:313`.

## 1. FOCUS-MUTATION-01

How the runner behaves today, verified:
- `observationCollector.ts:734` focuses the field. `:738` then re-checks the target with `matches(…, true)`.
- That check counts every MutationObserver record anywhere in the document (`:42-44`). The only records it tolerates are `class`/`style` attribute changes (`:601-603`).
- When the check fails, the collector raises `POST_FOCUS_CHANGED`. `browser.ts:509` turns that into `UNKNOWN_OUTCOME`, and `runtime.ts:451` stops the session.

Placements:

| Where | What | Status |
|---|---|---|
| **015 Known limitations** (Change Log 0.1.8) | Named limitation; classified as pilot-gating, conditional. The D5-1 fixture change from `focus` to `change` is disclosed. Not a 015 defect. | InProgress, unchanged |
| **010 AC-1 obligation a–d** (Change Log 0.3.7) | Before the pilot, a real-Chromium focus probe of every authored fill target, for each pilot application, on the pinned runner `dist`. A failure blocks the pilot for that application until the check passes with the 009 change. The check is re-run when the application or the `dist` changes. Also an AC-4 row "FOCUS-MUTATION-01", a T0 sub-item and a File List entry. | Ready, unchanged |
| **009 AC-7 obligation a–f** (Change Log 0.3.13) | Backlog item for @architect: limit the post-focus guard to the target field (identity, eligibility, visibility, value, type) and its ancestors, plus an inert-attribute allowlist. At-most-once and the existing refusals stay. Includes fixture-tier positives and negatives, a joined helper-text regression, the `dist` digest, and `focusMutationRefusedFills` in `benchmark.json`. Must land **before the first real-model call of T4**; otherwise a written @pm+@architect record is required. | Ready, unchanged |

**Why the fix goes in 009 AC-7.** This follows the AUTHORED-ECHO-01 precedent.
- The gate the fix protects is the D-C benchmark. That benchmark includes the staging application with real login and enterprise patterns such as SSO and virtualised lists. On those pages, a focus-time page change would end every affected session `UNKNOWN_OUTCOME`. The benchmark would then measure the guard, not learning quality.
- 009 already owns the one runner process (AC-1), the `dist` digest (AC-12 i), the canaries (AC-10), at-most-once and `UNKNOWN_OUTCOME` (AC-11), and benchmark accounting (AC-7).
- The fix can share one `dist` rebuild with AUTHORED-ECHO-01 in the same file.

**Why the check goes in 010 AC-1.** 010 owns pilot preparation and the release record. The check stays needed after the fix, because a narrowed guard still refuses a fill when the target or one of its ancestors changes.

**Homes considered and rejected:**
- 011: it is behaviour-neutral.
- 015: Quinn §9.4 says 015 validates the committed behaviour.
- 010 as the place for the fix: 010 contains no code.
- The GA plan and the README backlog: neither is scheduled before the benchmark.

## 2. R1: recording-evidence identity during a pending append ACK

`GuidedSessionEvidenceService.record:120` compares `contextRevision` only with the head row of the materialization (v(n) while a delivery is pending). So a runner at v(n-1) gets `STALE_FENCE` when it settles its recording after a loss, and the recording is lost.

| Where | What | Status |
|---|---|---|
| **015 Known limitations, KL-015-R1** (0.1.8) | Known limit for Quinn, as the ruling asks. Evidence only, not settlement. Not a blocker. | InProgress, unchanged |
| **009 AC-11 obligation R1 a–e** (0.3.13) | (a) A probe IT first; if it does not reproduce the refusal, close as "not reproduced". (b) Before any code, @architect confirms in writing that the route is non-consuming. Then apply L1's {v(n), v(n-1)} binding from one shared derivation; with no pending delivery the route is unchanged. (c) Named tests plus a mutation check. (d) A joined owner loss at v(n-1): the recording plays and seeks. (e) An OBS-010 AC-4 known-limit row until a–d are done. | Ready, unchanged |

**Why 009 AC-11.**
- AC-11 already owns acknowledgement loss, stale owner and late-callback faults.
- 013 is Done and closed.
- 015 must not be blocked.
- 010 contains no code, and 011 is behaviour-neutral.
- The fix depends on L1 landing in 015, and 009 runs after 015.

## AUTO-DECISIONS

- `[AUTO-DECISION]` Fix R1 or only disclose it? → Fix it in 009, probe first (reason: a lost recording on owner loss removes evidence exactly where diagnosis needs it; the ruling's design is ready and cheap; the route stays disclosed until the fix lands).
- `[AUTO-DECISION]` Allowlist contents and record-count bound → left to @architect. Quinn's four candidates are recorded as direction only (reason: this is a design and safety call, not product scope).
- `[AUTO-DECISION]` Does the focus fix need Security & Compliance acknowledgement? → Only if @architect classifies it as a privacy or security boundary (reason: it is an at-most-once guard, not a data boundary).
- `[AUTO-DECISION]` Pilot check criterion → "the fill does not raise `POST_FOCUS_CHANGED` on the pilot's pinned `dist`" (reason: the criterion stays valid before and after the 009 change, and value-free mutation records are kept for diagnosis).

## Flags for the lead

1. FOCUS-MUTATION-01 is not on the 2026-10-15 OBS-011 start list. It edits `observationCollector.ts`, the same file as AUTHORED-ECHO-01, so the same single-owner rule applies. Adding it to the start list would need a user decision.
2. The real-application exposure is inferred by Quinn and was not checked against any Citi application. The 010 probe is the first real evidence.
3. Quinn's "four" `POST_FOCUS_CHANGED` tests are three in the working tree. The 009 obligation keeps them by name.
