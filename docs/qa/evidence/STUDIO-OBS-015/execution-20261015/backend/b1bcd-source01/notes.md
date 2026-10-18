# B1bcd source 01: apply-ready patch for B1b + B1c + B1d (11 methods)

Dex (@dev, JOIN). 2026-10-16. Test-only patch to one file. Nothing under `backend/`, `frontend/`,
`studio-runner/`, `tools/`, `docs/specs/` or `.github/` was modified. No Gradle, JVM test, database,
runner or browser ran. This is not QA credit and not a lifecycle change. HOLD.

**This patch must not land alone.** Without the registration lines below, the 11 new `@Test`
methods run in the default lane and fail `beginFixtureInvocation` (not in `SINGLETON_METHODS`).

## Files
| Path (repo-root) | Base sha256 | Patched sha256 |
|---|---|---|
| `backend/src/test/java/.../publication/GuidedPublicationReplayIT.java` | `4242ac27020814fe57355116a06ef1271b4a0c2f247d2847ea3c28888ec55b33` (live, verified; B1a applied) | `b888d4738adaa91d123312d84793e84e5711d4c09c798ba902fde144012bec07` |

- Patch: `b1bcd.patch`, sha256 `248d4a2f5462376b27b92d7f0f446eaaa908994da811b50cb2cc8ee33267243b`, 12 hunks,
  2 removed lines (both inside the observer JS text block, H5a/H5c).
- Apply: `git apply -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/b1bcd-source01/b1bcd.patch`.
- Rebuild from scratch: `work/build.py` (base copy `work/base/`, own block `work/block.java.txt`).
  Every edit is anchored by identifier text and must match exactly once.

## Placement (parallel-merge rules)
**Own block (1 hunk, +2834 lines):** inserted immediately after the closing brace of
`incrementalPrefixCallbacksKeepStateAndFenceBothReservations`, before `private record B1aControl`.
It holds all 11 methods, then every new field, class and helper, between the markers
`// STUDIO-OBS-015 B1b/B1c/B1d (b1bcd-design01 ...` and `// ---- end STUDIO-OBS-015 B1b/B1c/B1d`.

**Shared hunks (11 small hunks outside the block).** Each one calls into the block and is inert unless a
B1 parent or cut arms it.
| ID | Anchor (identifier) | Change | Lines |
|---|---|---|---|
| H1 | `RuntimeHooks.observedOriginalSessionRepository` execute: after the B1A-CB-01 branch's `return result; }`, before `if (observer == null` | New branch `capture == null && b1Armed() && no tx`. It uses the same commit-detection wrapper as B1a, then `b1AfterCommit(result)`. | +21 |
| H2 | `observedReportCapture` lambda: immediately before `UUID target = preReadyId;` | `if (b1Selected(http)) { b1Filter(...); return; }` | +4 |
| H3 | `APP` `/flow` handler: after the `assert-fail` block, before `byte[] bytes = html.getBytes` | `if (b1FlowRedirect(exchange)) return; html = b1FlowPage(html);` | +5 |
| H4a | `incrementalTenModel` SOURCE_PLAN: before `var references = result.putArray("sourceReferences");` | B1D-02 mixed planning failure (UNSUPPORTED/INSUFFICIENT_EVIDENCE) | +4 |
| H4b | same: after the step-1 `fill.value` bindingConsumers line | B1C-01 `assert.expected` consumer | +6 |
| H4c | same: after the step-1 `contains("click Submit")` obligation line | B1C-01 step-2 `containsText` obligation | +5 |
| H4d | same: before the final `} else {` (`String target = ...`) | B1C-03 guard obligation (`b1GuardObligation`) | +2 |
| H4e | NEXT_ACTION op chain: after the final `else if (op.equals("assert"))` branch | `press` → `key: Enter` | +2 |
| H5a | `incrementalNativeFaultObserver` JS `RevRuntime.prototype.start` line | `b1PairEvent('START')` before, `await b1HoldEmptyStart(this)` after the real start | 1→2 |
| H5b/c | JS `RevRuntime.prototype.update` | `UPDATE_ENTER` first; `UPDATE_ACCEPTED` after the real update | +1, 1→1 |
| H5d | JS: end of template, after the dispatch wrapper `};`, before `""".formatted(` | `b1PairControl/b1PairEvents/b1Held`, `b1PairArmed`, `b1PairEvent`, `b1HoldEmptyStart` | +26 |

Conflict notes for the B2/B3 drafters (same base):
- **No new `.formatted` argument.** The B1 paths are built from the existing `pfxRoot`, so B2's appended
  argument does not collide; the placeholder count is still 10.
- **H2 is not the filter's first statement**, so it stays away from B3's first-statement branch.
- **H4a sits before `var references`**, not at the top of SOURCE_PLAN, so it stays away from B3's
  `b3FirstSuffixHold` line.
- H5b sits next to `pfxSelect`. If B2 inserts right after `pfxSelect`, the hunk needs a 3-way merge.
  That is expected.

## Registration (NOT in the patch; the lead applies it in the same window)
All 11 methods are low-lane (`guidedIncrementalTest`, profile `incremental2048`). This follows the B1a
`joinedAddedLowMethods` pattern, so no new Gradle set is needed. None of them is default-lane.

`backend/build.gradle.kts`: in `joinedAddedLowMethods`, change
`    "incrementalPrefixCallbacksKeepStateAndFenceBothReservations"` to the same line with a trailing comma,
and insert these lines after it:
```kotlin
    "incrementalPrefixRecoveryUsesNextUnconsumedCoordinate",
    "incrementalConcurrentAuthenticatedDriftCommitsOneSwitch",
    "incrementalDriftAuthorityRejectsEveryExactJoin",
    "incrementalExcludedAttemptCannotHideOtherUnsettledActions",
    "incrementalPrefixContinuationMatrixDoneAndRefreshRows",
    "incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned",
    "incrementalPrefixPolicyRefusalsNeverBecomeDrift",
    "incrementalFreshPostConsentGuardsDenyDangerousProposals",
    "incrementalWaitingAnswerRejectsChangedContextGenerationAndNaturalLeaseExpiry",
    "incrementalEmptyPrefixProgramPairSurvivesEveryContextDelivery",
    "incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary"
```
That set is already wired into the include filter, the `tasks.test` exclude and the
`requireFreshGuidedPartitions` expected set.

ReplayIT `SINGLETON_METHODS` **and** `INCREMENTAL_METHODS`: in each, insert these 11 lines immediately
after `      "incrementalPrefixCallbacksKeepStateAndFenceBothReservations",`:
```java
      "incrementalPrefixRecoveryUsesNextUnconsumedCoordinate",
      "incrementalConcurrentAuthenticatedDriftCommitsOneSwitch",
      "incrementalDriftAuthorityRejectsEveryExactJoin",
      "incrementalExcludedAttemptCannotHideOtherUnsettledActions",
      "incrementalPrefixContinuationMatrixDoneAndRefreshRows",
      "incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned",
      "incrementalPrefixPolicyRefusalsNeverBecomeDrift",
      "incrementalFreshPostConsentGuardsDenyDangerousProposals",
      "incrementalWaitingAnswerRejectsChangedContextGenerationAndNaturalLeaseExpiry",
      "incrementalEmptyPrefixProgramPairSurvivesEveryContextDelivery",
      "incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary",
```
Inventory after B1a + this batch: 43 default + 54 low = 97 JOIN identities, before any B2/B3 additions.
Selector: `guidedIncrementalTest --tests com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.<method>`.

| ID | Method | Lane |
|---|---|---|
| B1B-01 | `incrementalPrefixRecoveryUsesNextUnconsumedCoordinate` | low |
| B1B-02 | `incrementalConcurrentAuthenticatedDriftCommitsOneSwitch` | low |
| B1B-03 | `incrementalDriftAuthorityRejectsEveryExactJoin` | low |
| B1B-04 | `incrementalExcludedAttemptCannotHideOtherUnsettledActions` | low |
| B1B-05 | `incrementalPrefixContinuationMatrixDoneAndRefreshRows` | low |
| B1C-01 | `incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned` | low |
| B1C-02 | `incrementalPrefixPolicyRefusalsNeverBecomeDrift` | low |
| B1C-03 | `incrementalFreshPostConsentGuardsDenyDangerousProposals` | low |
| B1C-04 | `incrementalWaitingAnswerRejectsChangedContextGenerationAndNaturalLeaseExpiry` | low |
| B1D-01 | `incrementalEmptyPrefixProgramPairSurvivesEveryContextDelivery` | low |
| B1D-02 | `incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary` | low |

## Corrections applied
- **D1 fixed (qa-d1-review01 §1.5; production `verifyPrefixReceipt`, `GuidedMaterializationService` `ad8742a8…`).**
  - B1B-03 now pins **409 STALE_FENCE** for all 9 Java-bound fields it forges: `workerId, ownerFence,
    scopeHash, contextId, contextRevision, sourceRevision, configurationRevision, authoredInputsHash,
    prefixProgramHash`.
  - The design's UNKNOWN_OUTCOME for `authoredInputsHash`/`prefixProgramHash` is corrected; those two are
    bound now.
  - Every "red until D1" note is removed. B1B-02, the B1B-03 positive rows and B1B-04 are expected
    green at the current source.
- **R3 pin semantics (qa-source-review02 §5).** `requestDigest`, `operationHash` and `evidenceHash` are
  refused only by the V21 guard or FK. They are pinned exactly as **409 UNKNOWN_OUTCOME**, the static
  trace through `GuidedInternalController.unexpected`, which is also the code the live
  `assertActualDriftCallbackAuthorityThenRelease` already pins. If the first run shows a different code,
  that is a finding to rule on and re-pin. It is not a reason to widen the assertion.
- **F2 fixed (qa-d1-review01 §2.3; `committedRefresh` predicate at `GuidedSessionService` `055081ff…`).**
  B1B-05 REFRESH now asserts all of the following:
  - exactly one `observation-refresh` and one `observation-refresh-result` command;
  - exactly one `/plans` call in which a `committedObservationRefresh` transaction committed a non-null
    result, and that call's status is **202**;
  - **zero** `STALE_GENERATION` diagnostics whose frames include `GuidedSessionService#committedRefresh`;
  - the remaining row asserts, unchanged.
  - [AUTO-DECISION] QA wrote "`/plans` 200" → pinned **202**. Reason: `GuidedPlanningController.plan`
    returns `ResponseEntity.accepted()` (`554179db…`). 202 is the production success status, and
    200 can never occur.
- **F3 (qa-d1-review01 §3).**
  - B1C-02 keeps the strict `b1AssertNeverDrift` assertions.
  - Added: no `/observations` callback of the mixed session carries an origin outside the session's
    `scope.approvedOrigins`. An unreadable body is recorded as `UNPARSED` and fails the check. The base
    session's captured observations prove the capture was live, because a refused redirect may send none.
  - Added: `b1RecordTerminalLabel` writes the actual terminal state, errorCode and action
    state/outcomeCode (value-free) to `TEMP/obs015-prefix-sync-b1-terminal-labels.jsonl` (0600).
    That is evidence for the wording ruling, and it is written before the state assertion.
  - The state assertion stays `isIn(FAILED, UNKNOWN_OUTCOME)`, as designed. The ledger does not fix the
    code.

## Deviations from the design (each one deliberate)
1. **Edit and step helpers.**
   - `b1Edit(index, text)` → **REUSE** `prefixSyncEdit`. Every B1 edit is the step-4 edit
     " Verify it remains visible.", which is byte-identical. `B1Spec.edit(...)` became `edit4()`.
   - `S(i)` → `b1Step(i)`, plus `b1Coordinate(i, ordinal)`.
2. **The RuntimeHooks branch (H1) uses B1a's reviewed commit detection**
   (`isNewTransaction && !isRollbackOnly`), not the design's bare `super.execute`. It sits after the B1a
   branch: the two are mutually exclusive (`B1Cut.arm` asserts `b1aCallbackCut == null`).
3. **The filter (H2) also records state.** It records `/plans` (key, final status, refresh-committed) and
   the `/observations` origin, which F2 and F3 need. The PLANS_ENTRY hold and the request-key ThreadLocal
   come from the design. A single `B1_PLANS_CALL` ThreadLocal replaces `B1_REQUEST_KEY`.
4. **The cut-selection switch moved into `B1Cut.selects`, and `b1WonLedger` was added.** The inline switch
   expression broke checkstyle `Indentation` under gjf. Behaviour is unchanged.
5. **T3 navigate-away replaces the whole Submit handler** (`B1_SUBMIT_HANDLER`), not just `hidden=false;`.
   With the design's replacement, `fetch('/receipt')` would still run after `location.assign` and race
   the "RECEIPTS unchanged" assertion. A missing handler fails loudly.
6. **T4 #1 is a separate `if` before `var references`.** It does not replace the `drift-plan-fail` line
   (merge distance from B3). It also uses null-safe `equals`, because `List.of(...).contains(null)` throws
   an NPE. T4 #2–#5 call two block helpers, `b1StepTwoAssertion` and `b1GuardObligation`.
7. **T5 has no new `.formatted` arguments.** The paths derive from `pfxRoot` (= TEMP), the block sits at
   the template end, and the empty-start hold is the function `b1HoldEmptyStart`.
8. **`b1Parent` failure cleanup follows the B1a pattern** (`b1ResetInstruments`).
   - The native mode is written as `{}` before base learning, so no stale mode can affect the base start.
   - A default `nativeMode` writes `{}`, not `{"mode":"{}"}`.
   - `INCREMENTAL_MODEL_CONTEXTS` is not cleared; B1a does not clear it either.
9. **B1C-02 password policy: two additions.**
   - `p3CleanupOwnedResources()` and the cookie clears now run before `p4StartObserverPhase(2)`. The
     reason: `p4StartObserverPhase` asserts that `p3OwnedGuidedCookies` is empty, and `p3Start`
     registered the base session. This is the same sequence `p4PositiveNativeControl` uses.
   - Added `P4_PASSWORD_WRITES == 0` for the "no secret dispatch" clause.
10. **The B1B-03 matrix uses a `B1Probe` record**, not `Object[]` rows. Rows are labelled
    `bound-<field>` and `trigger-<field>`. Two more changes:
    - the `late-identical` row asserts that the committed switch reason is `DRIFT`;
    - the unused `committed` string was dropped.

## Verification actually run
- **Live base hash.** `4242ac27…` was verified before any work and again at patch time. The live file was
  never written.
- **`git apply --check -p0 b1bcd.patch` against the live tree: OK.** This check is read-only.
  - The patch was also applied to a scratch copy of the live file. The result equals `work/` (`b888d473…`).
- **javac 21.0.10 (`-proc:none`), base and patched: 0 errors each.**
  - Output went to the session scratchpad only.
  - Classpath: `backend/build/classes/java/{main,test}`, `backend/build/resources/{main,test}`, and the
    newest-version Gradle-cache jars. This approximates the real classpath; it is **not** Gradle's
    resolved `testCompileClasspath`.
  - `javap` lists all 11 methods.
- **google-java-format 1.22.0 (`--skip-reflowing-long-strings`): stable.** It was run `--lines` on the
  block, H1 and H2. No added Java line exceeds 100 columns.
  - H3 and H4 sit inside pre-existing non-gjf statements. They are hand-wrapped to gjf style and were not
    run through gjf, because running gjf `--lines` there reflows the pre-existing lines.
- **Checkstyle 10.18.1 CLI with `backend/config/checkstyle`: base 1010, patched 1010.** There are 0
  violations on added lines. The 1010 are pre-existing.
- **Observer JS: `node --check` passes on both the base and the patched template.** The `%s` were
  substituted for the check. The placeholder count is 10 before and 10 after.

## Not verified / OPEN (report, do not credit)
- **Runtime reachability of every row is unverified.** It needs a source-frozen `guidedIncrementalTest
  --no-daemon` run after the registration lands. R1 open items E and G still gate any joined run, and every
  parent depends on base learning (FIX-R1).
- **The exact codes in B1B-03 are static traces (Aria) and are not run-proven.** The codes in question:
  - the trigger rows' UNKNOWN_OUTCOME;
  - IDEMPOTENCY_CONFLICT on `crossed-adm`;
  - EVIDENCE_MISMATCH on `ledger-state`;
  - the 401 and 422 codes on the transport/contract rows.
- **B1C-03: "Press Enter in Destination" may raise a second question.** It is side-effecting under
  CLARIFY_FIRST (`GuidedActionGuard.sideEffecting`, Enter), and the design expects none. If a second
  question comes, the allowed row times out waiting for the switch. That would be a design finding.
- **B1C-02 password sub-case: P4 phase settling and the low lane are unproven.**
  - It reuses the P4 phase machinery outside its P4 family. `p3Case` cleanup will assert
    `p4AssertObserverPhaseCompleted` for that phase.
  - The P3 family has so far run only in the default (4000) lane.
- **B1C-04 and B1B-03 parent D SIGSTOP the owned guided node process.** The pid is verified equal to the
  readiness marker pid. The owned-process observer's reaction to a stopped process is unverified.
- **B1D-01's rebootstrap depends on the unchanged 15 s start client deadline** being shorter than the
  16 s withhold.
- **The `/observations` capture may record `UNPARSED`** if a request is refused before the body is read.
  That fails closed.

## IDS log
- **REUSE:**
  - fixture and run helpers: `prefixSyncEdit`, `startLearning`, `awaitFinalizing`, `p3AwaitTeardown`,
    `seedGovernedPolicies`, `startWorkers`, `versions`, `token`, `refreshFixtureCredentials`,
    `throwTeardownFailures`;
  - snapshots and probes: `incrementalPendingSnapshot`, `incrementalImmutableSnapshot`,
    `incrementalDriftProbe`, `incrementalControllerProbe`;
  - the existing `/obs015-drift` hold, plus the `INCREMENTAL_*` maps;
  - the P3 and P4 helpers;
  - the `persistFinalizeDiagnostic` files;
  - the B1a constants `B1A_SESSION_SERVICE` and `B1A_TRANSLATION`.
- **ADAPT:**
  - the RuntimeHooks TransactionTemplate (H1, B1a pattern);
  - the `observedReportCapture` filter (H2);
  - the `/flow` handler (H3);
  - `incrementalTenModel` (H4);
  - the `incrementalNativeFaultObserver` JS (H5).
- **CREATE** (nothing existing does these jobs):
  - cuts and request capture: `B1Cut`, `B1PlansCall`, `B1Probe`, `B1Chain`;
  - the parent recipe: `B1Spec`, `B1Parent`, `b1Parent`, `b1Policy` (`ensurePolicy` has no vocabulary
    argument);
  - stall and pair instruments: `b1StallWorker` / `b1ResumeWorker` / `b1AwaitNaturalLeaseExpiry`, and the
    pair-log helpers;
  - the token forgers;
  - assertion helpers: `b1AssertApprovedObservationOrigins`, `b1RecordTerminalLabel`, `b1Diagnostics`;
  - small SQL counters.

What already exists does not cover these needs:
- request-entry and post-commit holds for the admit, consume and plan-continuation frames;
- per-request refresh attribution;
- origin capture;
- a governed vocabulary delta;
- a worker stall.

- [AUTO-DECISION] Low lane vs default lane for all 11 → low (design §0), via `joinedAddedLowMethods`
  (B1a pattern). Reason: every parent is the ten-step incremental family.
- [AUTO-DECISION] Leave the live `assertActualDriftCallbackAuthorityThenRelease` alone. Reason: it
  already pins exact R3 codes in the live file and is outside this block.
