# merge-new22-01: B1bcd + B2ab + B3bc merge, registration, H7 and H3 follow-ups

Dex-MERGE (@dev). 2026-10-16. Sole backend writer and sole Gradle user for this window. No commit.
This is merge, compile and registration evidence only. It grants no QA credit and changes no lifecycle.
All hashes are in `manifest.json`.

## 1. Base and apply
- Live ReplayIT verified at `9d13eeb7…` before any write. `build.gradle.kts` was at `92bfae6d…`.
- I applied `b1bcd.patch`, then `b2ab.patch`, then `b3bc.patch` with `git apply -p0` to a scratch copy, in that order.
  - All 12 + 7 + 9 hunks applied with exact context. There were line offsets only: no fuzz and no textual conflict.
  - Result after the three patches: `7f401b30…`.
- The shared hunks were then read in their merged form. They all look coherent:
  - `incrementalTenModel` SOURCE_PLAN: B3 S4 hold and partialRead, then B1 H4a `b1d-*` refusal before `var references`, then H4b–e.
  - `model()`: B2 S6 `b2bHoldSuffixPlan`.
  - Observer JS: B1 H5 START/UPDATE pair events and the B1d block before `.formatted`. B2 adds a separate `b2SecretContextObserver()` layer in `p3GuidedLaunchCounter`.
  - Filter lambda: B1 H2 and B3 S5 sit apart.

## 2. Semantic conflict resolved by hand: the H1 per-case CSI vs the B3 CSI
- **Conflict.** B3 methods set `CSI-B3-n` and then call `incrementalJoined`. Since Dex-FIX H1, `incrementalJoined` allocates `CSI-INC-m` itself and restores `CSI-123` on success.
- **Consequences without a fix:**
  - B3B-1's generation 2 (`b3OlderEqualHashBaseAndChangedSourceCas`) would have run on the shared `CSI-123`. That spends the shared daily budget, which is the very H1 defect, and it is a foreign CSI for a gen-1 test.
  - `b3RestoreCsi` also restored immediately in `finally`, which defeats H1's "keep the CSI until @AfterEach cancels as owner".
- **Resolution** (`replayit-resolution-and-registration.diff`):
  1. `incrementalJoined`: if `primaryCsi` is not `CSI-123` on entry, it runs `incrementalJoinedCase` on the caller's isolated CSI and does not allocate or restore. Only B3 parents reach this branch. Every other caller enters on `CSI-123`, which the @BeforeEach guard asserts.
  2. `b3RestoreCsi` now sets `incrementalCsiRestorePending = true`, so @AfterEach restores the CSI after cleanup (the H1 pattern).
- **Budget isolation of the other batches (checked; left unchanged):**
  - B1 parents use `CSI-B1-n` (`b1Parent`, B1a pattern).
  - B2A-0x and B2B-02 use `p3Case` → `CSI-P3-n`.
  - B2B-01 uses `CSI-B2B-n`.
  - Every one of the 22 methods therefore consumes model budget on its own CSI.

## 3. Registration: one pattern for all three notes
- Low lane = `joinedAddedLowMethods` + `SINGLETON_METHODS` + `INCREMENTAL_METHODS`. Default lane = `joinedDefaultMethods` + `SINGLETON_METHODS`. The three notes agree on this, so no reconciliation was needed beyond ordering.
- I inserted the 17 low methods after `incrementalPrefixCallbacksKeepStateAndFenceBothReservations`, in batch order B1 (11), B2B-01 (1), B3 (5). The 5 default methods go before `auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass`.
- Counts after the change:
  - `joinedAddedLowMethods` is 18 and `joinedDefaultMethods` is 48.
  - `SINGLETON_METHODS` went from 51 to 73 and `INCREMENTAL_METHODS` from 9 to 26. No duplicates.
- **JOIN partition check (`requireFreshGuidedPartitions`)** expects:
  - default = 48;
  - low = 60, made up of 2 indexed + 5 PFX + 18 added + 35 labels.
  - This was not exercised: I made focused runs only.

## 4. Coordinator addendum (qa-review01)
- **H7** (`replayit-h7.diff`):
  - `cancelFailedTestOwnedSessions` keys the tally as `method[displayName]` for `incremental joined …` invocations, and by method name otherwise.
  - The planted set is exactly `incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser[incremental joined policy-prefix]`. The bare method name is not planted.
  - `assertPolicyPrefixPlantedRefusal(mixed)` runs after `assertIncrementalTerminalRefusal`. It requires exactly one `GUIDED_ACTION_REFUSED` since `tallyAuditStart`, with `reasonCode=SIDE_EFFECT_DENIED` and `sessionId=mixed`.
  - The audit event has no step or coordinate field (`StudioActionAudit.KEYS`), so the binding is to the session only.
- **H3** (`evidence-repository-h3-followup.diff`, `evidence-test-h3-regression.diff`):
  - The binding loop was extracted, with unchanged logic, into the package-private `GuidedPublicationEvidenceRepository.prefixRequestObservations(contracts, id, incremental, observations)`.
  - The stale comment now names the prefix-request binding.
  - New `GuidedPublicationEvidenceTest.prefixRequestBindsOnlyTheObservationItsOwnSessionContextAndHashCommitTo`. Its own-session request binds only `observation-a`, and an uncommitted row stays out. Each of the following binds nothing: wrong session, wrong context, wrong or forged hash, and null incremental.
  - This is a pure unit test with no database. It does not pin the downstream 422 that Quinn suggested, because no existing DB fixture produces incremental evidence.
  - Checkstyle on main: the repository's over-120 lines are 5 before and 5 after. There are no new over-100 lines.

## 5. Verification actually run
- `./gradlew --no-daemon compileTestJava`: BUILD SUCCESSFUL after the merge. It ran again after H7/H3 and again after the final one-line reformat.
- `default-attempt01` is invalid: my zsh call passed the `--tests` arguments as one word, so 0 tests ran. It was replaced by attempt02, run under bash arrays.
- New-22 results, run on ReplayIT `daa97aee` (before H7): **8 PASS / 14 FAIL**. Per-method first failures are in `manifest.json`. Grouped:
  - **Default: 1 of 5 PASS** (B2A-03).
    - `BUDGET_EXCEEDED` on the second explicit learning: B2A-02, B2A-04, B2B-02. These run on their own `CSI-P3-n`, so the cause is not the shared daily CSI. Inferred, not verified.
    - 200≠202 on `/result` while FINALIZING with video PROCESSING: B2A-01.
  - **Low: 7 of 17 PASS** (B1B-01, B1B-03, B1C-02, B1C-04, B3B-3, B3C-1, B3C-2).
    - 200≠202 `/result`: B1B-02, B1D-02.
    - Second explicit learning FAILED: B1B-04, B1C-01.
    - `RUNTIME_INCOMPATIBLE`: B1B-05, B2B-01.
    - AC-4 unplanted `{DESTRUCTIVE_VERB:3}`: B1C-03. Its refusals are the oracle, but they are not planted. This needs a QA ruling and was not added.
    - Pair events size 0, expected 2: B1D-01.
    - Switch reason BOUNDARY, expected DRIFT: B3B-2.
    - 404 `SECRET_UNAVAILABLE` at the alias start: B3B-1.
  - **Class-level `executionError`** in both lanes:
    - default: the subset run has no replay-dispatch audit events;
    - low: Testcontainers "Mapped port can only be obtained after the container is started".
- `backend-merge-h7h3-attempt01`, run on ReplayIT `217950c7` and repository `5d3cdcde`:
  - The H3 unit test PASSES.
  - **`incremental joined policy-prefix` PASSES** with the H7 exactness check.
  - The joined variants are 17 PASS and 18 FAIL:
    - `assert-fail`: the second learning FAILED with `OTHER` (open item H6).
    - The 17 variants from `confirm-source-change` to `equal4` are a cascade. The restart guard refused after `confirm-expire` left an EXPIRED session with teardown PENDING (`open-generation-18.json`), which is open item H8.
  - The run also had the same Testcontainers `executionError`.
- **Not run:** Spotless (the ReplayIT is already not gjf-clean), the full lanes, and `requireFreshGuidedPartitions`. CodeRabbit is WSL-only and SYNAPSE diagnostics do not apply here.
- **Last change after the runs:** the repository's final `8f5c0e0c…` differs from the run copy `5d3cdcde…` by one statement joined onto a single line. It was recompiled but not re-run.
