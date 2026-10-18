# new22-b2-diagnosis01: root causes of the five failing B2 methods + apply-ready fix

Dex-D2 (@dev, diagnosis). 2026-10-16. Read-only on backend/frontend/runner/tools/specs; no Gradle, no JUnit,
no commit. Grants no QA credit and changes no lifecycle. Hashes are in `manifest.json`.

## 0. Base and inputs
- Patch base = the **live** files, verified before and after the work:
  - ReplayIT `217950c7…` (= Dex-MERGE `final`, i.e. `7f401b30…` + resolution/registration + H7).
  - `backend/build.gradle.kts` `2d43ae4d…` (= Dex-MERGE `final`).
- Run evidence: `execution/backend-merge-new22-default-attempt02-*` and `-low-attempt01-*` (ran on ReplayIT
  `daa97aee`; stack line N there = line N+10 in the B2 block of `217950c7`, checked method by method).
- Retained per-session failure states in the run's TEMP dir
  `/var/folders/…/obs007-joined-13865693446098963151/failed-test-state-*-enriched.json` (host temp; not copied).
- The text "second explicit learning" is the **generic** message of `awaitFinalizing` (ReplayIT `217950c7`:28474).
  It does not mean the second session failed. For B2A-04 and B2B-02 it was the **base** learning.

## 1. B2A-04 and B2B-02: BUDGET_EXCEEDED. Design flaw (lane choice). Not a production defect.
- **The budget key is the per-session model-output ceiling.** It is not per CSI, not per test/day, and it does
  not include an earlier session.
  - `GuidedSessionService.modelReservationFitsLocked`:252 refuses when `modelOutputTokens + output >
    maxModelOutputTokensTotal`. The limit is 32000 (`GuidedSessionProperties`:18, persisted per session as `limits`).
  - The default lane reserves 4000 per call (`FixtureProfile.ORIGINAL_4000`; ReplayIT:1997 sets
    `translation.max-output-tokens`). So at most **8 model calls fit in one session**.
- **Verified from the run:**
  - B2A-04's only session (ordinal 15) and B2B-02's (ordinal 16) are each `FAILED BUDGET_EXCEEDED`.
  - Counters: `modelProposals 8`, `modelOutputTokens 32000`. Calls: SOURCE_PLAN 1, NEXT_ACTION 7. `extraPolls 0`.
  - The plan has 8 obligations and 7 actions SUCCEEDED (navigate, read, fill ×3, click ×2). The 8th obligation,
    `THREE/2 assert visible`, needed a 9th call: 32000 + 4000 > 32000.
  - The failing frame is `awaitFinalizing(original)`: B2A-04 at daa97aee:7287 = live:7297, B2B-02 at
    daa97aee:8157 = live:8167. That is the base learn, before any edit or cut.
- **CSI is not the cause.** Each case runs on its own `CSI-P3-n` (`p3Case`:20360). The CSI daily caps are the
  application defaults, 640000 output and 5242880 input (application.yml:215-216; ReplayIT does not override
  them), and are far from reached.
- **Root cause.** `b2CreateCombinedSource` adds `read Order reference` and `fill Reference` to the P3 login program.
  That gives SOURCE_PLAN + 8 NEXT_ACTION = **9 calls = 36000 at 4000**, which can never fit 32000.
  - Design §6.1 put these two methods on the default lane "because the P3 family is default-lane" and did not do
    the call-count arithmetic. This is exactly the Core05 situation (`core05-budget-design01/review.md`:3,13).
- **Fix (ruled remedy, no cap change).** Re-lane both methods to the 2048 lane (`guidedIncrementalTest`):
  9 × 2048 = 18432 fits under 32000. The program bytes and every oracle stay unchanged.
  - The patch adds both names to ReplayIT `INCREMENTAL_METHODS`. The `@BeforeEach` guard at :275 requires this.
  - It also moves both names in `build.gradle.kts` from `joinedDefaultMethods` to `joinedAddedLowMethods`.
    `requireFreshGuidedPartitions` derives its expected sets, so the expected partitions become default 46 / low 62.
- **"Secret subjects at 2048 untested" (design §6.1) no longer holds.** B1C-02
  `incrementalPrefixPolicyRefusalsNeverBecomeDrift` runs a P3 LOGIN secret base learn and publish inside
  `p3Case`, and it PASSED in `low-attempt01`. Quinn/Aria should still acknowledge the re-lane, because it
  reverses a written design decision.
- **Rejected alternatives:**
  - Raising 32000, refunding, or using a per-test ceiling: barred by the Core05 ruling.
  - Dropping a step from the combined program: that changes the authored subject, and 8 × 4000 = 32000 would
    leave zero headroom for any repair.

## 2. B2A-02: BUDGET_EXCEEDED. Test bug inherited from the design. Not a production defect.
- **The budget key is the passive-acquisition poll cap, not tokens.**
  - The mixed session (ordinal 4) is `FAILED BUDGET_EXCEEDED` with only `modelProposals 2` and 8000 output.
  - It shows `activeAcquisition.extraPolls 32`, `observations 37` and `coordinate.stepIndex 2`.
  - `GuidedTranslationStore.acquire`:523 refuses when `extraPolls >= 32`.
  - The failing frame is daa97aee:6948 = live:6958 = `awaitFinalizing(id)`, the mixed session. The base
    session (ordinal 3, 7 calls) succeeded.
- **Root cause.** In daa97aee and live:6912 the test sets `p3ExpectedPassword = rotated` (the fixture site's
  accepted password) together with the Vault rotation, at the held v2 ACK.
  - TWO/1 has already filled `used` in the browser at that point; the test asserts this at :6884-6901.
  - After release, the suffix `THREE/0 click Sign in` POSTs `used`. `p3Application`:24906 compares it with
    `rotated` and rejects it, then re-renders the login document.
  - The last observation therefore still shows `passwordControls 1`. `THREE/1 click Reports` never becomes
    available (`acquisitionAvailable`), and 32 polls exhaust the cap.
  - The design §4.2 literal has the same line, `p3ExpectedPassword = rotated; p3Seed(scope, rotated);`, so the
    flaw comes from the design.
  - Evidence status: the code order is verified. That the sign-in was rejected is inferred from
    `passwordControls 1` after a SUCCEEDED Sign-in click; no P3 receipt was retained.
- **Fix:**
  - Keep the real Vault rotation (`p3Seed`) at the cut. The A45-1..3 oracles are unchanged.
  - Rotate the site password only immediately before `p3Execute`. The ordinary-replay oracle, `getLast()` is
    the rotated value, is unchanged.
  - Add a pin: exactly one suffix sign-in, accepted, and it submitted `used` (boolean only).

## 3. B2A-01: 200 ≠ 202 on `/result`. Test bug: the design ordering is wrong. 202 is the product contract.
- **Contract.** `GuidedSessionController#result`:63-70 returns **202 when `publication.status == PENDING`** and 200
  otherwise. `GuidedPublicationResultProjector`:160-168 reports PENDING for a non-terminal, unpublished
  session. `StudioContractTest`:299 lists `200,202` for this route.
  - The failing body was `outcome FINALIZING` with `publication {status: PENDING}`. The 202 is therefore
    contract-correct, and the controller is unchanged against HEAD on this route.
- **Root cause.** `awaitGuidedVideoSettled` pins 200, which is valid only after publication.
  - Every pre-existing caller of `assertGuidedLearnRunRecorded` publishes first, for example
    `actualIncrementalSecretPrefix…`:15718→15719 and :3772→3773.
  - B2A-01 called it, and the `public-result` sink, before `p3Publish(mixed)`. That order is design §4.1
    lines 518-521.
- **Fix.** Move `P3Publication merged = p3Publish(mixed);` above the recording assertion and the public sinks.
  - Nothing is weakened. The 200 pin stays, and the sinks now also contain the published receipt (a superset).
- **Inferred, outside B2 scope, not patched:** B1B-02 and B1D-02 fail with the same 200≠202 and probably have the
  same publish-after-read ordering.

## 4. B2B-01: RUNTIME_INCOMPATIBLE. Test bug. Not a production defect.
- **Verified frames:**
  - `GuidedTranslationStore.state`:650 calls `transaction()`:30, which requires an actual transaction or throws
    `RUNTIME_INCOMPATIBLE` 409.
  - The caller is `b2bAppendAuthority` at daa97aee:7789 = live:7799. It calls `plans.state(session)` four
    times (:7799, :7803, :7807, :7808) with no transaction.
  - Existing callers wrap the read, for example `sessions.transaction(() -> plans.state(id)…)` at :5282, :5514
    and :15397.
- **Fix.** Wrap the four reads in `sessions.transaction(...)`. The values and assertions are unchanged.
- This was the first failure. Phases B and C, and the owner-loss sibling, have not been reached yet.
- **Inferred, outside B2 scope, not patched:** B1B-05 fails with the same error at daa97aee:10380 = live:10390,
  `plans.state(parent.id)` outside a transaction.

## 5. Patch
- `fix.patch` has 2 files and 9 hunks. Apply it from the repo root with `git apply -p0 fix.patch`.
- Its ReplayIT hunks touch only:
  - the `INCREMENTAL_METHODS` constant;
  - B2A-01, B2A-02 and `b2bAppendAuthority`.
- It touches nothing in `confirm-expire`, H7, shared hunks or any non-B2 method.
- The Gradle hunk is two lines added to `joinedAddedLowMethods` and two removed from `joinedDefaultMethods`.
  - Dex-W owns Gradle. Apply the Java and Gradle hunks **together**: either one alone fails the `@BeforeEach`
    lane guard.
- **Verification actually run:**
  - `git apply --check -p0` against the live tree: OK (read-only).
  - javac 21.0.10 `-proc:none` on base and patched ReplayIT, scratch output only: **0 errors** each. The
    classpath was `build/classes` + `build/resources` + the newest `~/.gradle` jars, which approximates
    `testCompileClasspath` but is not it.
  - No added line exceeds 100 columns.
- **Not run:** Gradle, Spotless, any JUnit, PG, runner. Every fix is **unexecuted**. Later assertions in
  B2A-01, B2A-02 and B2B-01, which are past their first failures, have never run.
- **Recommended re-run** (bash arrays, `--no-daemon`):
  - `test`: B2A-01, B2A-02.
  - `guidedIncrementalTest`: B2A-04, B2B-01, B2B-02.
