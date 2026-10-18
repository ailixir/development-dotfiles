# STUDIO-OBS-009 D2: @qa local-validation record (G9, 2026-10-18)

**This record is not a verdict and not a gate decision.** `isVerdict: false`. `storyStatusChange: none`. `doneClaimed: false`. No PASS, CONCERNS, FAIL or WAIVED is used here. The 009 QA Results section is untouched.

- **Author:** Quinn (@qa), 2026-10-18. Draft from the skeleton `execution-20261018/qa/pre-g9-review/local-validation-record.skeleton.{md,json}`. Machine form: `qa-local-validation-record.json` (same folder).
- **Inputs:** G9 (`obs009-g9-check01`, DONE per `status.txt`) at source digest `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b`, plus the image add-on (C4b, D2 smoke) and QA's own C10 run. `G` = `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/`, `X` = `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/`.
- **Legend:** every number below was read from the named file or computed from it by @qa today. `[I]` marks an inference.

## 1. Trigger

```
trigger: NOT_MET   (pending G9b, the post-fix full gate at a new digest)
```

**Targets:** the OBS-011 T0 start and the OBS-010 T2 start. This is a start trigger, not a quality verdict.

**Why NOT_MET, by my own rule** ("MET only if every REQUIRED row is VALIDATED, C0 to C10 meet their criteria, the freeze held"):

1. **C8 fails its criterion** ("collector exit 0; 0 failed, 0 errors; `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions` EXECUTED"). Exit 1, two failed cases, and neither coverage task ran. Coverage was not evaluated, so the 70% bundle floor and the package floors are unproven, not "probably fine".
2. **C10 is MET**, see section 6.
3. **Everything else holds:** C0, C1, C2, C3, C5, C6, C7, C9 MET; **C4 is now MET by C4b** (section 3); the freeze held file by file (section 2).

**Why not "MET-WITH-CONDITIONS":** that value does not exist in my record and I cannot create it. Only the user or @po can change an OBS-011 start condition (skeleton section 3, reasoning 3, still stands). Beyond that, three facts weigh against conditions even if someone offered them:

- F2 is a diagnosed test defect, but F1 is an **unexplained transient**: Dex puts the load-sensitive branch at about 50% and says the exact branch cannot be determined from retained data. I will not write "benign" for a cause that is unproven.
- The JaCoCo verification did not run at G9. The G9 `.exec` files are kept, so a reading is possible (section 5.2), but a reading is not the gate.
- @dev is about to land test fixes plus the 009 residue patches. That produces a new digest, which makes G9 an old-bytes result for every row whose files change. Starting 010 T2 or 011 on bytes that are about to move would hand them an unvalidated base.

**If the coordinator wants to start 011 T0 before G9b anyway,** that needs a decision file from the user or @po. I would then record C8 as `OWED_BY_DECISION`, cite the file, and keep the trigger text "NOT_MET pending G9b". The decision should say, by name, that it accepts: the two C8 reds (F1 unproven), unmeasured coverage, and that rows lapse at the new digest.

**Root plan (G9b):** one full gate, C0 to C10, at a new digest after @dev lands (1) the F2 test fix, (2) the F1 test-side diagnostic, (3) the 009 residue patches. Details in section 8.

## 2. Freeze and identity

| Item | Before (C0) | After (C9) | Identical? |
|---|---|---|---|
| Source digest (1805 files) | `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b` | `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b` | yes, 1805 of 1805 files equal by path and sha256 |
| `studio-runner/dist` digest D_F (238 files) | `4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3` | `4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3` | yes, 238 of 238 |
| Helm digest (g9.sh supplement) | `8dbe073c706c80b8e560ecc60593ceb550cc93fd6c4ca6486016829899dd04a6` | `8dbe073c706c80b8e560ecc60593ceb550cc93fd6c4ca6486016829899dd04a6` | yes |
| `git rev-parse HEAD` | `734ad704f6ae508dbb10d9b5127a315bb0df5f81` | same | the tree is dirty; the digest, not HEAD, is the identity |
| `qa/approved-skips.json` sha256 | `c6f16987430a332b80a065308a2c9b0ef9adccd478b9be64a02e1cb459cd09dc` |  | 9 entries |

Image add-on captures (`G/image/summary.json`): `imageBefore` and `imageAfter` equal the G9 digests at source, dist and head. Dist rules: `dist/main.js` present, `dist/run/guidedMain.js` absent (C7 line "guidedMain src/dist: 0"); the collector reports `sourceStable`, `distStable` and `testInputStable` all true. I re-compared the two capture files myself, file by file, with a short script (not only the digest line).

## 3. C4: now MET (the skeleton decision is superseded)

The skeleton set C4 to NOT_MET "until the image tests pass at the frozen digest". That condition is met:

- U22 authorized Docker. @devops built `put-checks-studio-runner:obs009-g9-local` (id `sha256:af96bee8ebf2ebcf9c68db6a98e4f7e208e3f07f99c688d47440ad4dfdbebd8f`) from the cached base `mcr.microsoft.com/playwright:v1.63.0-noble`, `--pull=false`.
- C4b (`obs009-g9-runner-deploy02`), `STUDIO_RUNNER_IMAGE` set: **581 passed, 0 failed, 0 pending, 56 suites**, exit 0, 77 s, `sourceStable` and `distStable` true. The six earlier failures (four chart tests, SEC-2 registry, and both 009 Q4 assertions) are green.
- deploy01 (575/6, no image) stays on file as history. Same digest, so no repeat of the long gate was needed. This is the delta addendum the skeleton promised.
- D2 smoke: 14 assertions, 0 failed (single process under `--init` with node pid 7; no-`--init` launch refused exit 78 `CONFIGURATION_DENIED LAUNCH_TREE`; `NODE_OPTIONS` refused exit 78 `DEBUG_ENV`; stop drained then exited 0 inside the 30 s grace; TLS key mode `-r--r-----` gid 1001). **Step 6 (one real guided assign on Linux) is not scripted and is OWED, not passed.**

## 4. Steps C0 to C10

| Step | State | What was observed | Evidence |
|---|---|---|---|
| C0 | MET | capture-before taken; helm digest recorded; listeners: no java or postgres ephemeral listener (node, codex, Orca, rapportd only); checks-guided orphans: exactly the protected four (5083, 5095, 13577, 13581); Gradle daemons file empty | G/capture-before.json, c0-*.txt |
| C1 | MET | runner type-check and lint exit 0 | G/c1.log |
| C2 | MET | runner unit tier: 2635 total, 2606 passed, 0 failed, 29 pending; equals EP's last count (2606 passed / 29 skipped); exit 0 (the vitest config enforces coverage thresholds, so exit 0 means they held) | X/execution/obs009-g9-runner-unit01-* |
| C3 | MET | runner fixtures, real Chromium: 305 total, 296 passed, 0 failed, 9 pending; guidedCloseBound F1-F4 and H, 10 browser-profile-safety cases and observed-secret-control lost-control-body all passed by name | X/execution/obs009-g9-runner-fixtures01-* |
| C4 | MET | deploy01 (no image): 575 passed / 6 failed (image absent), kept as history. C4b (deploy02) against image put-checks-studio-runner:obs009-g9-local (id sha256:af96bee8...), STUDIO_RUNNER_IMAGE set, same frozen digest: 581/581 passed, 0 failed, 0 pending, 56 suites, sourceStable and distStable true, exit 0. The six earlier failures, including both 009 Q4 assertions, are green. See section 3 | X/execution/obs009-g9-runner-deploy01-*, deploy02-*; G/image/summary.json |
| C5 | MET | pins, contracts, codegen exit 0 x3. NOT ASSERTED (listed, never counted as pass): dist/runtime-versions.json chromiumBuild and image are null because the build did not run in the pinned Playwright image (ED-05); the in-image check-pins (015 row 5c) was not run in the image add-on | G/c5-*.log |
| C6 | MET | frontend type-check, lint, vitest 70 files / 1386 tests passed, build exit 0 (one webpack asset-size warning) | G/c6-frontend.log |
| C7 | MET | P2 0; DEFERRED 0; guidedMain 0; start:guided 0; studio-guided-worker templates 0; sameIdentity bodies 1; SSLContext.getDefault 0; @Disabled (parsed) 6; plus the one-off grep studio.updateTest( = 0 in backend/src/test of the frozen tree (run by @qa in the C10 scratch copy) | G/c7-greps.txt |
| C8 | NOT_MET | collector exit 1. test 2709 total / 2698 passed / 2 failed / 9 skipped; guidedIncrementalTest 62/62; crossReplicaTest 2/2 (overall 2773 / 2762 / 2 / 9). The skipped multiset equals qa/approved-skips.json exactly (9 of 9 by task, class and name). Two failures: (F1) GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel, video "AVAILABLE" expected, was "FAILED"; (F2) GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost, stage marker "READ_BEFORE_DECISION" expected, was "". Because :test failed, jacocoTestCoverageVerification and requireFreshGuidedPartitions did NOT execute (absent from the Gradle task list), so coverage was not evaluated. spotlessCheck, checkstyleMain/Test, spotbugsMain, rdsParityLint, testcontainersAlignmentCheck, antiRegressionCheck ran and did not fail. Every required class had executed tests except VaultPolicyIT (0 executed, 1 approved skip); GuidedPublicationReplayIT ran as a full class in both lanes | G/c8-backend.collector.log, X/execution/obs009-g9-check01-*, G/c8-test-results/, X/g9-failures/diagnosis.md |
| C9 | MET | capture-after equals capture-before file by file: 1805 of 1805 source files and 238 of 238 dist files identical; source, dist and helm digests equal | G/capture-after.json |
| C10 | MET | 9 of 9 mutations red as named (B3: only its one test), each scratch file restored to the frozen sha256, baseline and final both green (33/33), scratch copy re-verified against capture-after (0 mismatches). Detail in section 6 | X/qa/c10-run/c10-results.json, c10.v2.sh |

### 4.1 C8 detail

| Failed case | Class | Diagnosis (Dex, `X/g9-failures/diagnosis.md`) |
|---|---|---|
| F1 `GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel` | transient, environment-suspected, **cause branch not proven** | run 1 was PASSED with `evidenceState FAILED` and no upload attempt; `studio-runner/src` and the 238 dist files are byte-identical to the run where it passed; 1 of about 1,600 retained manifests |
| F2 `GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost` | **test defect** | the parent reads the stage marker between the child's `createFile` and `writeString` (empty file, failed after 1.0 s); the sibling `ObservedResolverProcessCrashIT.awaitStage` polls on content and is race-free |

- **Skips:** the observed skipped `(task, class, name)` multiset equals `qa/approved-skips.json` exactly (9 of 9). The 18 AC-6 deferrals are not on it and ran (see 4.2).
- **Coverage:** `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions` are absent from the Gradle task list because `:test` failed. **`G/c8-jacoco/` is a stale copy**: its `jacocoTestReport.xml` has session timestamps from 2026-10-17 21:43 to 23:24 and is not G9 coverage. Do not cite it.
- The required class list (T0) was checked against the XML: every class ran at least one test except `VaultPolicyIT` (0 executed, 1 approved skip). `GuidedPublicationReplayIT` ran as a full class in `test` (46 cases) and in `guidedIncrementalTest` (62).

### 4.2 Count reconciliation

Baseline: STUDIO-OBS-008 final check (`STUDIO-OBS-008/execution-20261017/execution/obs008-final-check01-task-outputs`, source digest `50692d55...`): **2531 total / 2506 passed / 25 skipped** (`test` 2467, `guidedIncrementalTest` 62, `crossReplicaTest` 2). After (G9): **2773 total / 2762 passed / 2 failed / 9 skipped**.

Name-level multiset diff (task, class, name), computed by @qa: **4 removed, 246 added**; 2531 - 4 + 246 = 2773.

- **Removed (4):** `StudioScheduleApiIT.rawReadinessChangeRefusesWithLearnRequiredAndNoExecution`, `SharedSchedulingIT.sameCoordinatorRunsHttpTcpSplunkAndReachesTheStudioPipeline`, `SharedSchedulingIT.studioOnlyReplicaRunsWhenCatalogFlagIsOffAndDeduplicatesOccurrences` (three of the four interim 012A ports, deleted by name in `s/receipt.md`), and `RunnerReportProjectionTest.theRunnersChromiumBuildKeyProjectsOntoRuntimeChromium` (removed by lane B because it pinned the artifact-1 key that P2 b stops reading, `b/receipt.md`).
- **Ported (1):** `StudioScheduleApiIT.sourceMutationBlocksTheScheduleWithLearnRequired`, re-pointed in place.
- **Skipped to run (18):** `StudioScheduleApiIT` 16 and `SharedSchedulingIT` 2. Skipped fell from 25 to 9: 25 - 18 + 2 new approved skips (the `VaultPolicyIT` rehearsal and the `GuidedSchemaProbeIT` external half).
- **Added (246):** largest classes `StudioRunnerPropertiesProfileTest` +44, `GuidedScheduledBeansProfileTest` +34 (with nested classes), `RunnerProcessHarnessTest` +34, `GuidedConnectorScopeTest` +23, `StudioRunnerTlsTest` +19, `RunnerTlsClientCertIT` +16 (with nested classes), `ObservedCoRunIT` +12, `GuidedSchemaProbeIT` +10, `GuidedEvidencePendingAppendIT` +8, `ObservedScheduleAuthorityIT` +8, `RunnerReportProjectionTest` +7; the rest are 6 or fewer per class (full list in the JSON). I did not tie each addition to an AC in this draft.

## 5. Coverage and the two red cases, as far as can be said without a gate run

### 5.1 What the two reds do and do not touch

- F2 lives in `GuidedServiceTransportFaultIT`, which is not on the T0 required-class list. [I] It maps to no 009 required row by name; its subject (a controller JVM crash around a secret decision) is closest to the OBS-007 secret path.
- F1 is the OBS-007 login case inside `GuidedPublicationReplayIT`. Its video leg failed after `PASSED`. [I] It is not one of the AC-6, AC-11 or AC-4 cases credited in section 7.
- Neither red changes a credited row's own tests, which all passed (section 7). They fail C8 as an aggregate criterion.

### 5.2 Informational coverage reading (not the gate)

The G9 `.exec` files were kept (`X/execution/obs009-g9-check01-task-outputs/{test,guidedIncrementalTest}/jacoco/*.exec`). @qa analyzed them with the JaCoCo 0.8.12 core API against the classes compiled from the frozen source in the C10 scratch copy, with the same excludes as `build.gradle.kts` (`ChecksApplication`, `dto`, `entity`, `generated`). `test.exec` + `guidedIncrementalTest.exec` merged, as `jacocoTestCoverageVerification` does. This is a reading, with `test.exec` coming from a run in which two cases failed. It is **not** the gate, and I do not count C8 as met because of it.

```
classesAnalyzed=576 execSessions=28
BUNDLE line covered=23341 missed=2125 ratio=0.9166
com/citi/put/checks/studio/compile/gateway ABSENT (rule vacuous)
com/citi/put/checks/studio/dispatch covered=1151 missed=135 ratio=0.8950
com/citi/put/checks/studio/internal covered=747 missed=74 ratio=0.9099
com/citi/put/checks/studio/recovery covered=232 missed=29 ratio=0.8889
com/citi/put/checks/studio/sse covered=237 missed=19 ratio=0.9258
com/citi/put/checks/studio/compile ABSENT (rule vacuous)
```

## 6. C10: mutation reproductions in a scratch copy

- **Attempt 01** (`qa/c10-run/attempt01/`) aborted at its baseline: 27 selected tests, 2 failed. The v1 S4 selection named `GuidedPublicationReplayIT.editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness`, an `@Order(3)` method that reads `publishedTestId`, which only the `@Order(1)` method sets. Alone it fails at `:18379` ("expected not null") and the class `AfterAll` scan then fails ("the OBS-007 case registered its canaries"). That is the TEST-001 order-dependence class, not a faithfulness problem of the scratch copy.
- **My v1 plan had the S4 target wrong.** The `BACKGROUND_AUTHORIZATION_DENIED` tripwire is asserted in `schedulerAndNewHead(...)`, which the `@Order(1)` method `actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues` calls, not in the `@Order(3)` method.
- **v2 (`qa/c10-run/c10.v2.sh`)** changes: S4 selects the `@Order(1)` method plus the `@Order(9)` OBS-007 canary method (so the class scan finds its canaries) and drops `@Order(3)`; the mutation files are checked against the **frozen** `capture-after` sha256 instead of the live tree, which @dev edits; S4 requires the red message to contain `BACKGROUND_AUTHORIZATION_DENIED`; every red test's first failure line is recorded; the extended tier (S1, LR, F2) is included. LR is the T0 C10 minimum.
- **Scratch copy** re-verified against `capture-after.json` before the run (`qa/c10-run/frozen-reverify.txt`): 1721 files plus 238 dist files, 0 mismatches. The driver repeated the check at run start, and I ran it again after the final run (`c10.v2.sh frozen`: FROZEN_OK, 0 mismatches), so the batch left the scratch copy equal to the frozen digest. Digest `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b`.
- **Credit note:** the C10 selections include single-method `GuidedPublicationReplayIT` runs. They reproduce mutations only; they are never regression credit (AC-12 clarification: a single-test ReplayIT rerun is never credited). The baseline and final greens prove the selection, not AC-12.

Baseline (unmutated, scratch): **GREEN**, {"total": 33, "failed": 0, "errors": 0, "skipped": 0}, 123 s.

| Mut | Lane | Verdict | Red tests | Restored to frozen sha | Seconds |
|---|---|---|---|---|---|
| S3 | S-W3 (AC-6 b/c, R7 non-vacuity) | RED_AS_EXPECTED | ObservedScheduleAuthorityIT.g3DoesNotRefuseASecretFreeObservedScheduleOnAProductionBackgroundSource; ObservedScheduleAuthorityIT.g3AcceptsTheSameSecretReferencingRunUnderTheLocalFixturePolicy; ObservedScheduleAuthorityIT.anObservedScheduleIsAcceptedUnderBackgroundAuthorityForTheSchedulePrincipal; ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARunThatWasAcceptedUnderTheFixturePolicy; StudioScheduleApiIT.editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision | yes | 32 |
| S4 | S-W3 (AC-6 d tripwire, grant check) | RED_AS_EXPECTED | GuidedPublicationReplayIT.actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues; GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel; ObservedScheduleAuthorityIT.theRefusalNoLongerExistsAndAWithdrawnGrantStillFailsClosed | yes | 124 |
| B1 | B-W3 / R1 d (and R1 a-c) | RED_AS_EXPECTED | GuidedEvidencePendingAppendIT.aSecondRecordingAtTheOtherAcceptedRevisionIsStillAConflict; GuidedEvidencePendingAppendIT.recordingAtThePreviousRevisionIsAcceptedWhileAnAppendIsPending; GuidedEvidencePendingAppendJoinedIT.aSessionEndedWhileAnAppendIsPendingKeepsARecordingThatSettlesPlaysAndSeeks; GuidedEvidencePendingAppendJoinedIT.aSessionLosingItsBrowserWhileAnAppendIsPendingStillRecordsTheRunnersOwnFact | yes | 213 |
| B2 | ADJ-1 c (joined) | RED_AS_EXPECTED | PreReadyRevocationJoinedIT.aPreReadyRevocationOfARealHeldRunIsSettledAsAuthorizationRevoked; PreReadyRevocationProbeIT.aPreReadyRevocationIsSettledAsAuthorizationRevoked | yes | 89 |
| B3 | ADJ-1 narrowness (security co-sign dependency) | RED_AS_EXPECTED | PreReadyRevocationProbeIT.aRevokedRowsOtherPreReadyFinalIsStillRefusedAndTheReaperSettlesIt | yes | 22 |
| F1 | F (AC-11 ACK-loss leg) | RED_AS_EXPECTED | ObservedCoRunIT.aLostAcknowledgmentIsNeverAResend | yes | 26 |
| S1 | S-W3 (G-3 at dispatch recheck) | RED_AS_EXPECTED | ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARunThatWasAcceptedUnderTheFixturePolicy | yes | 24 |
| LR | BL / LR c (T0 C10 minimum) | RED_AS_EXPECTED | GuidedLifecycleReasonIT.anExpiredReportAcceptedBeforeTheBackendExpiryEndsExpired | yes | 16 |
| F2 | F (AC-11 public-cancel leg) | RED_AS_EXPECTED | ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot | yes | 34 |

Final (all selections, unmutated, after the reverts): **GREEN**, {"total": 33, "failed": 0, "errors": 0, "skipped": 0}, 125 s.

`allAsExpected`: **True**. C10 is **MET**.

Notes on the reds (first failure lines are in `c10-results.json`, `redMessages`):

- **S3** (scheduled acceptance no longer mints the background grant binding): 5 red. Collateral red beyond the named tests: ObservedScheduleAuthorityIT.g3DoesNotRefuseASecretFreeObservedScheduleOnAProductionBackgroundSource; ObservedScheduleAuthorityIT.g3AcceptsTheSameSecretReferencingRunUnderTheLocalFixturePolicy; ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARunThatWasAcceptedUnderTheFixturePolicy. First failure: `org.springframework.dao.DataIntegrityViolationException: PreparedStatementCallback; SQL [UPDATE studio_schedule_occurrences SET decision=?,code=?,retry_at=NULL,retry_attempts=0,updated_at=now() WHERE id=? AND decision='DEFERRED'];`
- **S4** (the background-grant check is removed (the ReplayIT tripwire expects BACKGROUND_AUTHORIZATION_DENIED)): 3 red. Collateral red beyond the named tests: GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel. First failure: `org.opentest4j.AssertionFailedError: expected: "BACKGROUND_AUTHORIZATION_DENIED" but was: "ACCEPTED" org.opentest4j.AssertionFailedError: expected: "BACKGROUND_AUTHORIZATION_DENIED" but was: "ACCEPTED" at java.base@21.0.10/jdk.int`
- **B1** (evidence acceptance back to the head revision only (the pre-R1 behaviour)): 4 red. Collateral red beyond the named tests: GuidedEvidencePendingAppendIT.aSecondRecordingAtTheOtherAcceptedRevisionIsStillAConflict. First failure: `org.opentest4j.AssertionFailedError: expected: null but was: com.citi.put.checks.studio.guided.session.GuidedSessionException: STALE_FENCE at com.citi.put.checks.studio.guided.session.GuidedSessionException.require(GuidedSessionEx`
- **B2** (the revoked-ADMITTED disjunct is unreachable (the pre-ADJ-1 behaviour)): 2 red. First failure: `org.opentest4j.AssertionFailedError: Expecting value to be true but was false org.opentest4j.AssertionFailedError: Expecting value to be true but was false at java.base@21.0.10/jdk.internal.reflect.DirectConstructorHandleAccessor.`
- **B3** (the outcome binding is dropped: any pre-Ready FINAL on a revoked row is accepted): 1 red. First failure: `org.opentest4j.AssertionFailedError: expected: "409 TRANSITION_REJECTED" but was: null org.opentest4j.AssertionFailedError: expected: "409 TRANSITION_REJECTED" but was: null at java.base@21.0.10/jdk.internal.reflect.DirectConstruc`
- **F1** (the dispatcher resends on an AMBIGUOUS answer): 1 red. First failure: `org.opentest4j.AssertionFailedError: [dispatcher sends for ackLoss: [send:ACCEPTED, acknowledgment-lost, send:DEFINITE_REFUSAL]] expected: 1 but was: 2 org.opentest4j.AssertionFailedError: [dispatcher sends for ackLoss: [send:ACCE`
- **S1** (the G-3 secret refusal at the dispatch recheck is skipped): 1 red. First failure: `java.lang.AssertionError: Expecting code to raise a throwable. java.lang.AssertionError: Expecting code to raise a throwable. at com.citi.put.checks.studio.scheduling.ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARu`
- **LR** (the lifecycle route ignores the reported reason again (EXPIRED ends FAILED)): 1 red. First failure: `org.opentest4j.AssertionFailedError: expected: "EXPIRED" but was: "FAILED" org.opentest4j.AssertionFailedError: expected: "EXPIRED" but was: "FAILED" at java.base@21.0.10/jdk.internal.reflect.DirectConstructorHandleAccessor.newIns`
- **F2** (the guided stop sender is swallowed, so the runner is never told to stop): 1 red. First failure: `java.lang.AssertionError: [the runner was told to stop] Expecting actual: 0 to be greater than: 0 java.lang.AssertionError: [the runner was told to stop] Expecting actual: 0 to be greater than: 0 at com.citi.put.checks.corun.Obser`

## 7. Required rows (the OBS-011 start list), at digest `6fcc12eef193...`

Each row ends `VALIDATED`, `NOT_VALIDATED` or `VALIDATED_WITH_DISCLOSURE`, never PASS. These states hold at the G9 digest only and lapse where @dev changes a file the row owns. The trigger is NOT_MET because of steps C8, not because of a row.

| Row | State | Evidence (G9 digest) | Disclosure | Owed externally |
|---|---|---|---|---|
| AC-1 | VALIDATED | C1 C2 C3 exit 0; C4b 581/581 with the built image (includes the chart assertions that need the image and 009 Q4); C5 exit 0 x3; C7 on target; D2 image smoke: single process in one image, listener, pid 7 under --init, launch-tree refusal exit 78 without --init | D2 smoke step 6 (one real guided assign on Linux) is owed, not passed. DEPLOY-OBSERVED-01 (the chart cannot run observed work) is a carried residue against AC-1, not an AC pass (story, AC-1 residue, 2026-10-18) | deployed Deployment; PID-1 a-c on the stack; smoke step 6 |
| AC-2 | VALIDATED | C2, C8 StudioRunnerPropertiesProfileTest 44/44 and GuidedScheduledBeansProfileTest 32/32 passed at G9; C4b | - | G-1 in a shared environment |
| AC-3 | VALIDATED | C7 SSLContext.getDefault = 0; C8 RunnerTlsClientCertIT 12/12 passed at G9 | - | G-2 in 010 |
| AC-4 | VALIDATED_WITH_DISCLOSURE | C2, C4b (Q4 tmp/TMPDIR/NODE_OPTIONS assertions green in the image), C8 DatabaseCanaryScanIT 2/2 passed at G9 | VaultPolicyIT is skipped by name and is REHEARSAL_ONLY_NON_CREDITING (approved-skips entry 8); it is not a pass. The two ReplayIT/TransportFault reds at G9 are not AC-4 cases [I: AC-4 canary scan is DatabaseCanaryScanIT; the F1 case is the OBS-007 login video leg] | Vault policy test (U5, ED-02); TF-5 a, c, e |
| AC-5 | VALIDATED | C8 GuidedScheduledBeansProfileTest 32/32 passed at G9 | - | SIEM sink |
| AC-6 | VALIDATED_WITH_DISCLOSURE | C7 (P2 0, DEFERRED 0, @Disabled 6 parsed, studio.updateTest( 0 in the frozen tree); C8 StudioScheduleApiIT 22/22, SharedSchedulingIT 4/4, ObservedScheduleAuthorityIT 8/8 passed at G9; the 18 deferrals moved skipped to passed by name; C10 S3 and S4 red as named | S M4 (dropping the ui_tests row locks) is caught by no test; the ordering test proves "an edit serializes behind an in-flight acceptance", not "through the ui_tests row lock". S3 turns red through a database error (the occurrence update is rejected by check constraint ck_studio_schedule_occurrences_code), not through an assertion that names the grant binding; the catching guard is the constraint. [I: why the constraint rejects it was not traced] Question for @po and @architect, not a QA fail | none |
| AC-11 | VALIDATED_WITH_DISCLOSURE | C3 (guidedCloseBound F1-F4 and H, browser-profile-safety, observed-secret-control lost-control-body: all passed by name); C8 ObservedCoRunIT 12/12, PreReadyRevocationProbeIT 4/4, PreReadyRevocationJoinedIT 1/1, GuidedEvidencePendingAppendIT 8/8, GuidedEvidencePendingAppendJoinedIT 2/2, GuidedLifecycleReasonIT 5/5, GuidedFocusMutationJoinedIT 2/2 passed at G9; C10 B1 B2 B3 F1 LR F2 all red as named | Wording used: (1) the runner-kill leg is credited for "zero repeats, settled STALE", not for "no survivor"; (2) ADJ-1 c is credited on the observed UNKNOWN_OUTCOME with the AUTHORIZATION_REVOKED label, never NOT_USED, and the joined IT's either-value assertion is weak; (3) the failed-launch survivor property is proved on doubles plus a source pin, not on a real wedged browser; (4) S-W3's replay collector run exited 2 on sourceStable:false only, and the credit rests on the G9 run at the frozen digest. B2 and B3 rulings and the N-RS1 case or disclosure sentence are owed to @po and @architect | live revocation; worker-profile dispatch on pods; R8.2 e; RUN-ORPHAN-01 in-pod check |
| AC-12 f-j | VALIDATED_WITH_DISCLOSURE | C0 listeners and orphan listing; C8 collector sourceStable, distStable, testInputStable all true; the verifyRunnerDist task ran in the G9 and C10 Gradle logs | the G9 C8 run has no per-run lsof-before file of its own; the only G9 listener evidence is C0 (c0-listeners.txt, taken before C1). Per-run lsof-before files exist for the i lane (execution-20261018/i/lsof-before-obs009-i-api01/02.txt). The C10 run wrote its own (qa/c10-run/lsof-before.txt) | none |

**Rulings on file for AC-11 (cite with sha256 in the final record):** `w1.5/ruling-part1.md`, `w1.5/ruling-part2.md`, `w3/pre-g9-rulings.md`, `f-merge/pre-rulings.md`, `prep-20261016/t0-rulings/ruling.md`. **QA co-signs on file:** `qa/pre-g9-review/adj1-security-cosign.md` (SIGN-WITH-NOTES), `qa/pre-g9-review/f-r2-1-oracle-cosign.md` (SIGN-WITH-NOTES).

### 7.1 Informational rows (state only, never blocking)

| Row | State |
|---|---|
| AC-1 PID-1 a-c | smoke steps 2, 3, 4, 5, 7 passed (14 assertions) in a local container; step 6 and the deployed Deployment are OWED |
| AC-4 Vault rehearsal (A18) | skipped by name, REHEARSAL_ONLY_NON_CREDITING (approved-skips entry 8) |
| AC-11 REL-001 pointer | NOT_COMPUTED in this draft. Classification rule: rel001-pointer-ruling.md. Must be stated as recurrences by classification, never as "0 lines" |
| AC-12 D4 15 s edge | NOT_COMPUTED in this draft (no elapsedMs >= 15000 scan of the G9 logs was run) |
| AC-12 a-d IPC observation | NOT_COMPUTED in this draft |
| AC-9 TF-3 | not examined in this draft |
| AC-7 AUTHORED-ECHO-01 | not landed: no o-ae, c9-ae or fe9 receipt folder under execution-20261018; gates the first real call, not this trigger |
| AC-7 FOCUS-MUTATION-01 | GuidedFocusMutationJoinedIT 2/2 passed at G9 |

**Never covered by this record:** AC-7 (benchmark), AC-8 (live probe), AC-10, the live halves of AC-4/5/11/12, deployed-stack proofs, TF-5 a/c/e.

## 8. G9b: what has to be true, and what it costs

- **Preconditions:** @dev lands the F2 test fix (the consumer waits for stage content, as `awaitStage` does), the F1 test-side diagnostic in `awaitJoinedVideo`, and the 009 residue patches. If `studio-runner/src` or `dist` changes, the image is rebuilt and C4b re-run (U22 must still cover that).
- **Scope:** a full gate, C0 to C10, at the new digest. C8 must be a full `check --rerun-tasks` (1h52m on this host at G9): `requireFreshGuidedPartitions` needs fresh `test` and `guidedIncrementalTest` exec data from one build, so no targeted rerun can substitute and no single-method rerun is credited.
- **Other steps:** C1-C3, C5, C6 and the D2 smoke rerun only if their inputs changed; a step may be carried by a delta addendum only with a file-by-file proof that its input set is unchanged. The simplest honest course is to rerun them all, because the record binds to one digest.
- **C10:** rerun on a fresh scratch copy at the new digest. `c10.v2.sh plan` first: every mutation string must still occur exactly once.
- **Host:** one Gradle at a time through `with-gradle-lock.py`; the machine ran at load 5 to 6 during C10, so timing-sensitive cases (F1 class) can flake. A flake is recorded by name, not retried blindly.

## 9. Owed, with owner (never blocking, never passed)

| Item | Owner |
|---|---|
| Docker-dependent smoke step 6 (real guided assign on Linux) | @dev/@devops with a signed token |
| Gateway price list, thoughts-token billing | ED-01 gateway owner (TBD) |
| Headroom R under the USD 500 wave authorization | user (U17/U18) |
| MODEL-SIZING ruling (per-call ceiling at or below 2461, or a v3 limits change; schema maximum 32000) | @architect + @pm |
| B2, B3 rulings; N-RS1 case or disclosure sentence | @po, @architect |
| Staging application, SSO case, dev Vault secret (D2, E1) | user, app owner, Platform/SRE |
| AE-01 landing, U13 acknowledgement | @dev, user |
| RUN-ORPHAN-01 in-pod check | @devops |
| C-17 masked-video human reviewer | user |

## 10. Carried items

| Id | What | Owner |
|---|---|---|
| G9-F2 | GuidedServiceTransportFaultIT stage-marker read races the child's write (both controller-cut tests share the protocol) | @dev (test-only fix proposed in g9-failures/diagnosis.md) |
| G9-F1 | ReplayIT video FAILED on a PASSED run; cause branch unproven; test-side diagnostic proposed so the next occurrence names itself; small product-robustness smell (one failed ps sample discards a good recording) | @dev; runner change would reopen the runner and image gates |
| TEST-001 | GuidedPublicationReplayIT is order-dependent; confirmed again by C10 attempt01 (an Order(3) method run alone failed on the null publishedTestId). Placed in OBS-011 AC-5 cleanup | @dev/@qa |
| C8-JACOCO-STALE-COPY | local-gate-20261018/c8-jacoco/ is a copy of build/reports/jacoco from 2026-10-17, not G9 | @devops (g9.sh copy step) or note only |
| DEPLOY-OBSERVED-01 | the chart cannot run observed work; blocks every deployed-stack leg | per story AC-1 residue |
| RUN-ORPHAN-01 | replay child outlives a runner SIGKILL up to the step timeout | @dev runner; in-pod check @devops |
| SEC-AUDIT-PREREADY-01 | see prior records | - |
| RUNNER-LOG-REFUSAL-01 | see prior records | - |
| LEDGER-REVOKED-WRITE-ONCE | optional: no database trigger on studio_dispatch_ledger.revoked_at | - |
| EP-F1 | dead compile-era files in evaluation/ | - |

## 11. Validity

bound to digest 6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b. A later edit to a file owned by a VALIDATED row voids that row. OBS-011's own edits do not void a trigger already given. Before any 009 Done review the addendum must be current.

Signed: Quinn (@qa), 2026-10-18.
