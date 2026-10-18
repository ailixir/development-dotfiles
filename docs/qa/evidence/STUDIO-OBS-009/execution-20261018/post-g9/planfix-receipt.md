# GuidedPlanningIntegrationTest sizing fix: receipt

Author: Dex (@dev), YOLO, 2026-10-18. No git. Production values untouched (model-sizing ruling stands). Marks: **[V]** I ran it or read it, **[I]** inference.

## Result

`GuidedPlanningIntegrationTest` 57/57 (was 45/57). `GuidedCsiBudgetIT` 5/5 and `GuidedDefaultModelReservationIT` 5/5 in the same invocation. Collector label `obs009-g9b-planfix01`: exit 0, 67/67, sourceStable, testInputStable, distStable (`execution/obs009-g9b-planfix01-results.json`) [V].

## Causes (both test-only)

1. **11 failures, 429 `CSI_DAILY_TOKENS_EXHAUSTED`.** Every test in the class uses the one CSI `CSI-123`. Its day is 640,000 output / 5,242,880 input and `studio_guided_csi_token_days` is append-only (trigger `tr_guided_csi_token_day_guard` rejects DELETE and decrement), so a per-test reset is impossible. At 98,304 per reservation the day lasts about 6 reservations, so the tests ordered later run out [V: GuidedCsiBudget.java, V19 migration]. None of the 57 tests asserts daily-budget behaviour (no `csi_token_days` or `DAILY` reference in the class) [V]; `GuidedCsiBudgetIT` owns that, on a fresh CSI per test, at production defaults.
2. **1 failure, `reportedThoughtOutputOverage...`.** The provider stub hardcoded `thoughtsTokenCount` 40,000 (reported total 40,100), sized to pass the old 32,000 ceiling. The new ceiling is 98,304 so nothing overshot and the session stayed PROPOSING.

## Changes

- `backend/src/test/java/com/citi/put/checks/studio/support/ObservedPublicationFixture.java` (shared helper): new `installGovernance(..., List<String> environmentIds, origins, policy, GuidedCsiBudgetProperties)` overload. The two existing 7-arg variants (single and multiple environments) delegate to it with the same production-default limits (1000, 5242880, 640000), so the other 10 callers behave exactly as before [V by reading; GuidedDefaultModelReservationIT re-run is green].
- `GuidedPlanningIntegrationTest`:
  - `sessions` bean passes a day of `DAILY_SESSION_CEILINGS` (10,000) whole session ceilings, derived from `GuidedSessionProperties` (not literals). Concurrency limit stays 1000 as before.
  - The stub's `reportedThoughtOverage` boolean became `reportedThoughtTokens` (int, 0 = none). The overage test sets it after the session starts: reported output = `outputCeiling(id) + 8_100`, thoughts = that minus the 100 visible; the counter assertion uses the same value. The late-audit test (`thoughtAndToolUsageOnStaleReplyRemainInImmutableLateAudit`) keeps its literal 40,000 / 40,100 on purpose: it tests audit retention on a stale reply, not the ceiling.
  - One stale literal of the same kind replaced: `isLessThanOrEqualTo(262144)` on the session input counter is now `inputCeiling(id)` (it was the old input ceiling; passed either way). Not in the 12, flagging it as a small extra.
- `spotlessApply` only reformatted two blank lines in the Planning test. The four `backend/src` file mtimes show no other source file changed [V].

## Checks

| Check | Result |
|---|---|
| `spotlessCheck checkstyleTest` (under the gradle lock) | exit 0 [V] |
| Collector run, 3 classes, label `obs009-g9b-planfix01` | 67/67 pass: Planning 57, CsiBudgetIT 5, DefaultModelReservationIT 5; 440 s [V] |
| Mutation: `reportedOutput = outputCeiling(id) + 8_100` reverted to `40_100`, only that method | RED, the original symptom (session PROPOSING, expected 409) [V]. Restored from a saved copy; final sha256 matches the green run |

Final sha256: Planning test `9c68ac5bcdc79fba476177cf6bbbab12ee5583e9bfd3fe2c9449fb3a92d41aa9`, fixture `9264ae0ec8f23d2d3544c2e09341d695a8035e77744b28cd116fdee985de1b1a`. Pre-edit (post-g9) hashes: Planning `e4bb59c2...`, fixture `b11b75c5...`.

## Process notes (disclosure)

- Edits were made in a sandbox copy until `G9B-DONE` appeared; both live files were byte-identical to the copies' base at apply time [V by sha].
- `spotlessApply` ran once without the gradle lock, after G9B-DONE, with no other Gradle process alive [V by pgrep]. All later Gradle runs went through `with-gradle-lock.py`.
- My first collector launch used the wrong package for `GuidedDefaultModelReservationIT` (it is `...guided.session`, though the file sits in `translation/`). I noticed it while the run was starting, killed only the processes I had started (collector chain, its gradle launcher and test worker), deleted the two aborted-label artifacts I had created (`obs009-g9b-planfix01-before.json`, `.log`), and relaunched with the right name. The archived evidence is from the second launch only.
- Open [I]: other hand-built-service ITs that share one CSI (`GuidedServiceTransportFaultIT`, `GuidedSessionIT`, the bridge ITs) use the same production-default day via the shared helper and could hit the same 429 if they reserve many full ceilings on one CSI. They were not in this finding, so I did not touch them; the new overload is the ready fix if one shows up.
