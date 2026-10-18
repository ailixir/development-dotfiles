# L1-A receipt: replayFailure derivation, persistence, mapping (STUDIO-OBS-008, wave W1)

Agent: Dex (@dev), YOLO. Machine-readable twin: `receipt.json` (same directory). Status: **unit GREEN; A1 ITs GREEN (a1-it01).**

## What changed (sha256 in receipt.json)
- `dto/ReplayFailure.java` (new): closed record, constructor enforces the schema's if/then/else (login flag exactly for LOGIN_REQUIRED), `values()`.
- `internal/RunnerReportProjection.java`: `Projected.replayFailure`; new `project(report, original, revisionStepIds, retention, now, cancelRequested, revoked)`; the 4/5/6-arg overloads kept (delegate with `List.of()`), so `EvidenceRetentionTest.java:112` compiles unchanged. Exact-equality derivation per A1.2; `mayNameReplayFailure` pre-check.
- `internal/ProgressReportService.java`: `revisionStepIds(...)` reads the confirmed revision's artifact `steps[].stepId` (observed FINAL, candidate outcome shapes only, not the pre-Ready path); passes four values to `applyFinal`.
- `dispatch/StudioDispatchLedgerStatements.java` (`applyFinal` only): four `replay_failure_*` columns set in the same UPDATE as status and error_code. Other writers untouched.
- `entity/UITestExecution.java`: four columns (`updatable = false`), getters, fixture setter.
- `ExecutionSnapshotMapper.java` and `dto/ExecutionSnapshotDto.java`: `replayFailure` component (last), mapped for GET, list, SSE through the one mapper. No other native mapper of `ui_test_executions` exists (grep of `getErrorCode()` consumers).

## A1.5 case map
| Case | Test(s) | Result |
|---|---|---|
| 1 | RunnerReportProjectionTest#loginRequiredFinalNamesTheFailedStepWithLoginStepsFalse, #loginRequiredFinalCarriesLoginStepsPresentTrueWhenAnEarlierStepFilledASecret | GREEN |
| 2 | #loginNamingAStepTheRevisionDoesNotHaveIsA400InvalidReport | GREEN |
| 3 | #loginWhoseNamedStepIsNotFailIsA400InvalidReport | GREEN |
| 4 | #targetDriftFinalNamesTheFailedStepAndCarriesNoLoginFlag | GREEN |
| 5 | #targetDriftWithADifferentReasonNamesNothing, #targetDriftWithTwoFailedStepsNamesNothing, #targetDriftWhoseFailedStepCarriesAnotherFailureNamesNothing | GREEN |
| 6 | #otherFailuresNameNothing | GREEN |
| 7 | #cancelRevocationAndParentTimeoutNameNothing | GREEN |
| 8 | #nonFinalReportsNameNothing, #aPreReadyTargetDriftNamesNothingBecauseNoStepOwnsIt, #noRevisionStepIdsMeansNoCauseAndNeverARefusal | GREEN |
| 9 / canary | #replayFailureCarriesNoReportedValueAndExactlyTheDeclaredKeys | GREEN |
| 10 | ProgressCallbackIT#aReplayLoginFinalPersistsTheNamedCauseAndGetListAndFrameCarryTheSamePayload, #aReplayTargetDriftFinalPersistsTheCauseWithNoLoginFlag; SseStreamingIT#aReplayCauseIsInTheStreamedFrameIdenticallyToTheGetSnapshotAndIsNeverRewritten; unit half ExecutionSnapshotMapperTest (3 tests) | GREEN (a1-it01) |
| 11 | ProgressCallbackIT#aDuplicateReplayFinalDoesNotChangeThePersistedCause, #aReapedRowReadsNoReplayCause (+ #aReplayLoginNamingAStepOutsideTheRevisionIsRefusedAndWritesNothing) | GREEN (a1-it01) |
| 12 | ProgressCallbackIT#theReplayCauseStepIdIsTheConfirmedRevisionsAuthoringStepIdAtThatIndex | GREEN (a1-it01) |
| 13 | cited: GuidedPublicationReplayIT#incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser, variant `ready6` (unedited READY draft, base + firstLearnStepId start) | not run by L1-A |

## Runs (what I ran and what it returned)
- `obs008-be-a1-unit01`: RunnerReportProjectionTest + ExecutionSnapshotMapperTest, 57/57, gradle exit 0, sourceStable false (R1).
- `obs008-be-a1-unit02`: same plus EvidenceRetentionTest, 60/60, sourceStable true, gradle exit 0. Collector exit **2** in both (see deviation 1).
- Evidence: `collector/obs008-be-a1-unit0{1,2}-*` in this directory.
- `compileJava`, `compileTestJava`, `checkstyleMain`, `checkstyleTest`, `spotbugsMain`: exit 0. Spotless IDE hook applied per file; diffs limited to this lane's hunks.
- ITs (DE exited): `obs008-be-a1-it01`, ProgressCallbackIT + SseStreamingIT, 41/41 passed, gradle exit 0, sourceStable false (L1-P editing, root R1). `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-be-a1-it01-results.json`. Case 12 is verified: artifact `steps[].stepId` equal the authoring step ids.
- Correction (Aria, w1-confirmations 2c): the four `replay_failure_*` columns are now `insertable=false, updatable=false`; the FINAL native update is the only writer.

## Deviations
See `deviations` in receipt.json. The main one: the 008 collector writes into the 015 evidence directory and exits 2 on green runs.

## Update 2026-10-17 (L1-P session)
- Correction applied (Aria w1-confirmations 2c): `UITestExecution` `replay_failure_*` are `insertable = false, updatable = false`. Re-run in `obs008-be-close01` (sourceStable false): ProgressCallbackIT 27/27, SseStreamingIT 14/14, RunnerReportProjectionTest 43/43, ExecutionSnapshotMapperTest 14/14, EvidenceRetentionTest 3/3. File sha256 in receipt.json refreshed.
