# STUDIO-OBS-015 w5-qa-ack04: Quinn (@qa) review of w5-window01 test changes

Date 2026-10-16. Read-only on source; no Gradle. [V] = I read or ran it. [I] = inferred.
Live file hashes equal the manifest "sha256After" values for all four edited files [V]. Production file `GuidedMaterializationEvidence.java` equals its recorded hash [V].
I re-ran `node tools/check-studio-observed-contracts.cjs`: exit 0, "PASS incremental: 140" [V].

## Verdicts
| # | Item | Verdict |
|---|---|---|
| 1 | B3B-3 edge selection by identity | **ACK** (one non-blocking residual) |
| 2 | B3B-1 valid-URI substitute | **ACK**; keep the INVALID_CONTRACT refusal as an extra row (advisory A1) |
| 3 | Ledger 56 E1/E2 | **ACK; clause "missing field and contradictory result refuse" is closed** (PROVEN-BY-RULING aria-ledger56-ruling01) |
| 4 | Observer-skip counter, TFIT (b)(c) | **ACK** |

This ACK covers the test changes only. It does not turn B3B-1 green: `guidedIncrementalTest` is still 61/62, failing on W5-F3 (below).

## 1. B3B-3: lawful, no weakening
- [V] `replayit-w5.diff`: the six `edge-*` mutators now act on `edge.apply(b)`, the replayed edge chosen by `consumerAdmissionId != native0`, then by the minimum UUID-free key `b3EdgeOrder` (step index, ordinal, slot). Mutation bodies are unchanged except the target.
- [V] Oracle untouched. `refuseOffered` is stage-based and does not depend on which edge is attacked. The new preconditions only add: exactly one native0 edge and at least one replayed edge. The old code had no such check, so this is a strengthening.
- [V] The earlier flake is explained: the `edge-native0-excluded-admission` mutation was a no-op when `[0]` was the native0 edge, so `refuseOffered:4524` fired. Selecting the replayed edge also makes that label a real attack (it attaches native0 to a replayed edge).
- [V] `b3Edge0` stays only in B3C-1 `hidden-successful-use`, whose parent is a pre-admission drift. [I] It has no native0 edge, so position is harmless.
- [V] Outcomes of the two post-fix runs (`targets01`, `incr01`) are identical across 13 labels, every attack refused and both positives ACCEPTED.
- Residual R1 (non-blocking): neither post-fix run is recorded as having native0 sorted first, the order that failed in w4. The fix is proven by code reading, not by observing both orders. [I] Cheap closure: log the native0 index in the next run, or accept as is.
- Minor: `INCREMENTAL_STEPS.indexOf` could return -1 for an unknown step and still sort deterministically. Not a defect.

## 2. B3B-1: ACK the fixture; keep the non-URI refusal too
- [V] `GuidedMaterializationEvidence.java:65` runs the `v3/authored-inputs` schema check and :66-68 the hash clause. A non-URI destination is refused at :65 with INVALID_CONTRACT. The refusal is correct and fail-closed, and it is not a product defect. The old pin tested the wrong clause, so the substitute must be schema-valid for the pin to mean "hash reconstruction".
- [V] The `EVIDENCE_MISMATCH` pin is unchanged. `offered.equals(actual)).isFalse()` still guards that a real change was made. The three returned-read labels give `WRITER_REFUSED / EVIDENCE_MISMATCH / readsDelta 1` (targets01 outcomes).
- Not weakening: for v2 and cutoff the fallback string and mutation are unchanged. They now run for the first time and match the design.
- **Advisory A1: yes, keep the old refusal as an extra row.** It is a distinct, correct property: schema-before-hash fail-closed. Replacing it loses coverage of `:65`.
  - Add a label (for example `v1-private-value-non-uri`) that substitutes `"B3-DIFFERENT-PRIVATE-VALUE"` into the destination and expects `INVALID_CONTRACT`.
  - Pin `WRITER_REFUSED` as seen in w4 (that stage assertion passed before the code assertion failed). Do not pin `readsDelta` until it is observed.
  - Place it before gen-2 so it is not hidden by W5-F3.

## 3. Ledger 56: closed
Aria's conditions (ruling §3-§5): E1 and E2 green and recorded, plus the B1D-02 producer pins.
- E1 [V]: two `resultCases` rows, both `RESULT_SWITCH`, `receipt: null`. The diff is additions only. The values are schema-valid (BOUNDARY switch with `{stepId, driftSwitchStepId}`; EMPTY_PREFIX the same), so the `structural('result')` step passes and `same(...)` against `{stepId}` fails with `RESULT_SWITCH` (`check-studio-observed-contracts.cjs:1367-1377`). That discriminates the stated defect, not a schema failure. Checker 138 to 140; every other line identical.
- E2 [V]: the `driftOnBoundary` row is verbatim from the ruling and uses the `reject(..., hasMessageContaining)` helper in a savepoint. Run `w5-w01-e2-migration01` is 55/55 and `publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys` is PASS. Results sha `245ba0a7…` matches the manifest.
- B1D-02 [V]: `incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary` PASS in `w5-w01-full-incr01` on the final source digest `6c7db14b…`.
- "missing field": the existing `required-result-null-cannot-be-omitted` row (expected SCHEMA) remains.
- Disposition: ledger 56 clause becomes **PROVEN-BY-RULING aria-ledger56-ruling01**, and GB-2 closes on the same evidence. The tiers are contract (result), Postgres (receipt) and HTTP producer pins, as ruled.
- Disclosure correction (non-blocking): the review says `GuidedPublicationAuthorityIT` does not read `publication-fixtures.json`. It does (`AuthorityIT:34`), but only via `basis`-style paths. No backend, runner or frontend source references `resultCases` and none pins the old fixture hash [V by grep]. `test01` ran before E1. [I] Impact is nil; re-running AuthorityIT after the next source window is enough.
- Follow-through owed by others: runner checkpoints quoting `86e42679…` need re-anchoring to `a7c9f595…` (ruling §4).
- Advisory A2 (not required by the clause): no `resultCases` row has a non-null `publication.receipt`, so `RECEIPT_SWITCH` in the checker has no negative row. The Postgres receipt rows cover the receipt side. Optional.

## 4. Coordinator extras
- Observer-skip counter [V]: the new branch is logically equivalent to the old one (`isAlive && !stopping`, then skip counts or failure adds). Only a value-free integer is added to `owned-worker-cleanup.json`. `incr01` reports `observerSkippedTerminated: 2`, `cleanupFailureCount: 0`. The race fires and is benign.
- TFIT (b) [V]: `isEqualTo(assignment + "|UNKNOWN_OUTCOME")` is strictly tighter than `startsWith`. (c) [V]: the six terminal states match the exact state set pinned in `w4-qa-ack03` (SUCCEEDED, PUBLICATION_CONFLICT, FAILED, UNKNOWN_OUTCOME, CANCELLED, EXPIRED). TFIT bridge run 60/60 on the final digest.

## 5. Gate impact
- Test-change ACKs: all four granted.
- Still open for the story gate, none are test-change defects:
  - W5-F3 (B3B-1 gen-2): no `PUBLICATION_CONFLICT` transition requests a runtime stop, so `p3AwaitTeardown` times out. Needs the @architect (Aria) lifecycle ruling. I agree the oracle must stay as is. This is a real production gap and blocks APPROVED.
  - Add the A1 row after W5-F3 is fixed or in the same window.
  - Runner checkpoint re-anchoring for the fixture hash.
- Not run by me: Gradle, spotless/checkstyle/spotbugs, CodeRabbit (WSL only), frontend lint.
