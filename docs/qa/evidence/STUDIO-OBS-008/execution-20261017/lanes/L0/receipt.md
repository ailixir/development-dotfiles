# STUDIO-OBS-008 L0 receipt (W1 contract integrator)

Agent: Dex (aiox-dev), 2026-10-17, YOLO. **Exit status: GREEN** (only reds are ledger R2 and R3). Node v24.20.0 (N24). Runs taken while other lanes edit are non-evidentiary (root R1); `sourceStable` is stated per run.

## Result in one paragraph
All L0 content is written. New OpenAPI sha256 `c377e480aa1b87e438b6270486e0f83c843cdb7f590c7721cc5300e3f99ce515` (old `c053a7f75656628a1b3e031e02f40f4982aa3a85fc241a4c87c7229460f5d70f`); operations 43 -> 44 (measured). Generator `check()` unchanged. Runner pin green. `StudioContractTest` is red on 2 tests, both ledger R2. Two items need root because they are outside the L0 write list: `tools/check-studio-observed-contracts.cjs:963` still asserts 43, and two `ExecutionVideoContractTest` pins go red (not in the ledger).

## Files, before and after sha256
| File | Before | After | |
|---|---|---|---|
| `docs/specs/studio/openapi.yaml` | `c053a7f75656628a1b3e031e02f40f4982aa3a85fc241a4c87c7229460f5d70f` | `c377e480aa1b87e438b6270486e0f83c843cdb7f590c7721cc5300e3f99ce515` | changed |
| `docs/specs/studio-observed-authoring/contracts/v3/session-view.schema.json` | `378ab88d0abedb156990f414c0b44ac8a8bdebfcbb791efb12fe0e6723401b26` | `38dd5dddc4e48003b93a674a90f03ee70c4c89094aafe97dca4bd55f044069e8` | changed |
| `docs/specs/studio-observed-authoring/contracts/v3/result.schema.json` | `7accd138c4b8385142e9c2b20f308912e2d0cc7b9afccf2d4aac4155ea0197ca` | `22ce88aeeac00de3f5e1202bdfa58e62c756e9cb39e72e00deb7b2e216c41b55` | changed |
| `docs/specs/studio-observed-authoring/contracts/v3/public-ui-projections.schema.json` | (new) | `a435e034f7dd0910dc8fe583f5c8592ae9a75797f50619dbc545998412fffb9d` | changed |
| `docs/specs/studio-observed-authoring/contracts/v3/fixtures.json` | `b5942f63eaa520fe80ed7cde10018586a29c5e314283c79051009626bc1716f8` | `fb1f9856353fef07825bf28ce72b4ed69e54f1cd5b78dc1d9fbb097c06ef2fc6` | changed |
| `docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json` | `a7c9f5956bb153694ea08730adde1ac0d3c47042f14a87819ed4089458c0885f` | `861619da6c3118364977c90641ef67191c633d546ee2024cc25e4e8dbdf20144` | changed |
| `docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json` | `38d30dc9fa01b7148bacf81be786f260457dfa59f283e116d38cef2dcde45629` | `38d30dc9fa01b7148bacf81be786f260457dfa59f283e116d38cef2dcde45629` | unchanged (not written) |
| `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java` | `00feb38cddf89c352143c59465cdd215be121cc80eba541747771b7d75f672a7` | `da31be64d700199efe13c2538aeb135d7cee2547e1f8ba474dfb7e88c6b58830` | changed |
| `studio-runner/test/run/confinement.test.ts` | `126fdbc8e0fb4585f83e139ff0f31210ad32dcc1d075f9a6bd2e019be08381a0` | `1108c729504d9aa08f3e43359b0ee4e8d5d15d5fbeb0965a63a1462a914caba1` | changed |
| `docs/architecture/ADR-002-internal-contract-surface.md` | `c56f7160482dfdf5775494486c449e916222442cd1d0f0e4185f4b145d4e9f87` | `b0c8c21682182b99441f4820e6967bdbd3fd8a2940665cc66285205732971270` | changed |
| `docs/architecture/studio-inference-contract-v1.md` | `68f67d605102aa34932b68f0bd0785fbc1dd4d98b85859e09e7725b936953629` | `5ff06f4a0d48f73ab2000663643bd8eba79cb0e1e50c46d36076bb38510e7d03` | changed |
| `docs/runbooks/studio-guided-authoring.md` | `53aee1dea748e110391e1499cc9b9c29ca6dc90d7eaae8075f81150b5c7a0773` | `9727657a78268acda3e95d634da1eeeeaff36680b4691ab3f0f3d5fcb6d00855` | changed |
| `tools/check-studio-observed-contracts.cjs` | `685d92275f7057df877d95f644aab0f7f04b1d7446881eecb6e2f42e0fe0acc9` | `685d92275f7057df877d95f644aab0f7f04b1d7446881eecb6e2f42e0fe0acc9` | unchanged (not written) |
| `tools/build-studio-observed-schemas.cjs` | `6557931cf566b5346c4b3eb88ed27a5fef279749934c853288202ebf615ca68f` | `6557931cf566b5346c4b3eb88ed27a5fef279749934c853288202ebf615ca68f` | unchanged (not written) |

Edits in one line each:
- `openapi.yaml`: pure additions (0 removed lines). `getStudioTestCapabilities` (`GET /tests/{id}/capabilities`, tag `tests`, `x-implemented-by: STUDIO-OBS-008`, 200/400/401/403, `Cache-Control: no-store`, 3 examples); `ReplayFailure` component and `ExecutionSnapshot.replayFailure` (verbatim from ruling A1.1); 3 `getExecution` examples (`loginRequiredNoLoginSteps`, `loginRequiredLoginStepsFailed`, `targetDrift`); `progress` added to the 4 session examples; `progress` and `explanation` added to the 2 result examples; descriptions on `readGuidedSession` and `readGuidedResult`. NOT added: `replayFailure: null` on `SnapshotFailed` (descoped).
- `session-view.schema.json`: `PublicSession.progress` (required). `result.schema.json`: `progress` and `explanation` (required). Both round-trip byte-exact through `json.dumps(indent=2)` before the edit.
- `public-ui-projections.schema.json` (new): `StudioCapabilities`, `PublicProgress`, `PublicExplanation`, from `execution-20261015/architect-public-projections.schema.json`.
- `fixtures.json`: `progress`/`explanation` added to the 3 result documents (`recordingResult`, `loginResult`, `tooLongResult`) so existing cases stay attributable; 4 documents and 29 `OBS-008` cases appended at the end of `cases` (indices of existing cases unchanged).
- `publication-fixtures.json`: `progress`/`explanation` added to `positive[0]`, `negative[0]`, the 11 `incrementalContracts.resultCases`; `progress` added to the 4 `publicWaitingCases` that validate `PublicSession`. Round-trips exactly with `ensure_ascii=False`.
- `wire-parity.fixtures.json`: not written (it holds date-time vectors only; P2/P3 add none).
- `StudioContractTest.java` and `confinement.test.ts`: BASE_SHA256 re-anchored and 4 comment lines quoting old and new digest above each (the Java comment shifts later line numbers by 4).
- ADR-002 §13: 2 class C rows appended after the last row (P1-P3; A1).
- `studio-inference-contract-v1.md`: F4 note added as its own paragraph at line 126, directly under the F4 paragraph (line 124), text verbatim; F4's own bytes unchanged. @architect still to confirm.
- Runbook: the P7 finalize paragraph (line 31) rewritten from ruling P7 (public v1 path, schemaVersion 3, header/body/latch/pending rules, receipt via GET result).

## Generator and checker
- `node -e "require('./tools/build-studio-observed-schemas.cjs').check()"`: PASS before and after: 25 guided, 32 replay schemas, four byte-identical outputs. The new schema is not reachable from any generator root.
- `node tools/check-studio-observed-contracts.cjs` as it stands: FAILS at line 963 (`assert.equal(operations.length, 43, ...)`, got 44). Not edited (outside list). In a scratch mirror under the scratchpad with only that number changed to 44, all 7 sections PASS: 44 schemas, 481 checks (452 before), 44 operations, 40 validated examples. Baseline before my edits: PASS with 43 / 452 / 43 / 40.
- My own scratch checks (not part of the lane commands): all 29 new fixture cases fail/pass on the intended Ajv keyword; the 3 capability examples and all 12 `getExecution` examples validate against the schemas with the checker's conversion; 6 negative `ReplayFailure` controls refused; `replayFailure` null and absent accepted; each new example has exactly one FAIL step at `stepIndex` and null timings on SKIPPED steps.

## Runs (cite these paths)
- Runner pin `obs008-c-confinement01`: exit 0, sourceStable and distStable true. `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-confinement01-results.json`
- Runner `obs008-c-runner-contract01` (confinement, contract, errors): 47 passed. `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-runner-contract01-results.json`
- Runner `obs008-c-runner-fixtures01` (21 files that read the fixtures): 898 passed. `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-runner-fixtures01-results.json`
- Backend `obs008-c-pins01` (command superset: StudioContractTest + ExecutionVideoContractTest, via `with-gradle-lock.py`, `--no-daemon`): 35 run, 31 passed, 4 failed, sourceStable true. Files are in the 015 folder (pre-fix collector, root moves them): `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/obs008-c-pins01-results.json`, `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/obs008-c-pins01-xml/`. Exit 1 here is the genuine Gradle failure.
- Backend `obs008-c-r3-01`: 57 run, 9 passed, 48 failed, sourceStable false (non-evidentiary). `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/obs008-c-r3-01-results.json`

## StudioContractTest red names -> ledger
11 of 13 pass, including `theWholeReviewedOpenApiDocumentMatchesTheContractOwnerPin`.
- `declaredOperationStatusSetsAndMarkersMatchTheReviewedContract()` -> R2. `hasSize(43)` and no expected row for the new op. L1-P adds `GET /tests/{id}/capabilities` = `200,400,401,403` and moves the counts to 44.
- `everyRouteTheContractPresentsAsShippedIsActuallyReachable()` -> R2 (no controller yet).
- R1 is not red: L1-A's `ExecutionSnapshotDto`/`ReplayFailure` were already in backend main when the run was taken. The `assertSchemaMatchesRecord("ReplayFailure", ...)` assertion (ruling A1.5 item 15) is not in the test yet; that is L1's baton line.

## Reds outside the ledger (need an owner)
- `ExecutionVideoContractTest.everyOperationsUnauthenticatedResponsePointsAtItsOwnProducersEnvelope()`: public-401 count 35 -> 36, set lacks `getStudioTestCapabilities`.
- `ExecutionVideoContractTest.theSetOfOperationsCarryingAnAttributionIsPinnedBothWays()`: attribution set lacks `getStudioTestCapabilities` (I set `x-implemented-by: STUDIO-OBS-008`, as ledger R2 expects). Omitting it would clear only this one.
- Both are the "new op = pinned copies" case. File is not in L0's list.

## R3 (session-view/result body validation): exact red names, obs008-c-r3-01
Attribution is inferred from stacks (`GuidedSessionException: INVALID_CONTRACT` at `GuidedSessionService.result`, the `v3/result` validation, and 422 `INVALID_CONTRACT` on start), not from a counterfactual run. `GuidedHttpSecurityIT` 6/6 green.
  - ObservedProfileDriftTest.ChecksApplication publication=false replay=false
  - ObservedProfileDriftTest.ChecksApplication publication=false replay=true
  - ObservedProfileDriftTest.ChecksApplication publication=true replay=false
  - ObservedProfileDriftTest.ChecksApplication publication=true replay=true
  - GuidedObservationPrunerIT.aNeverPublishedFailedSessionIsPrunedAndItsResultIsUnchanged()
  - GuidedObservationPrunerIT.aPublishedSessionKeepsItsPublicationRowsAndItsRevisionStillVerifies()
  - GuidedSessionIT.accessIsolationRechecksPrincipalCsiAccountAndScope()
  - GuidedSessionIT.atomicRenewalPreservesExactProgressAndCommittedCommandSnapshot()
  - GuidedSessionIT.completeContextLeaseArraysRepresentationRevisionAndForeignProofFallBack()
  - GuidedSessionIT.clarificationSelectionAndPauseChangeRollBackTogether()
  - GuidedSessionIT.atomicRenewalExternalCallerRollbackLeavesNoLeaseOrCommandCommit()
  - GuidedSessionIT.takeoverAfterEffectsOrLostAcknowledgmentStopsUnknown()
  - GuidedSessionIT.theRunnerContextOfASessionStartedAfterV2CarriesV2AndItsHash()
  - GuidedSessionIT.gatewayOverrunIsDurablyChargedAndStopsFurtherWork()
  - GuidedSessionIT.renewalAndRecoverableTakeoverPreserveClarificationUntilActualAnswer()
  - GuidedSessionIT.expiryCannotBeExtendedAndTrustedReaperRevokes()
  - GuidedSessionIT.clarificationIsBoundToGenerationChoiceAndOriginalDeadline()
  - GuidedSessionIT.duplicateAdmissionAndConcurrentConsumptionNeverRedispatch()
  - GuidedSessionIT.outcomeCannotRewriteAdmissionAndIdenticalDeliveryIsIdempotent()
  - GuidedSessionIT.unsupportedObservationEnvelopeUsesOriginalLockedValidation()
  - GuidedSessionIT.conflictingAdmissionAndUniqueCoordinatesFail()
  - GuidedSessionIT.observationBudgetAndGenerationAreSharedAcrossActions()
  - GuidedSessionIT.protectedAuthAndFinalizingStatesSurviveRenewalAndUndispatchedRecovery()
  - GuidedSessionIT.sourceChangesRejectInternalTransitionsAndUnavailableAccountsFailClosed()
  - GuidedSessionIT.outcomeSaveProofPreservesRealRollbackFreshFenceAndIdempotentWrite()
  - GuidedSessionIT.sameCallbackContextSuccessStillReadsAllRowsAndDefaultsStayStrict()
  - GuidedSessionIT.unavailableObservationPreparationFallsBackAndFatalRemainsEarly()
  - GuidedSessionIT.workerSubjectFenceAndLeaseAreIndependent()
  - GuidedSessionIT.rollbackBeforeDispatchLeavesNoAdmissionAndNoBudgetCharge()
  - GuidedSessionIT.entireSessionBudgetsAreReservedAndMissingUsageIsConservative()
  - GuidedSessionIT.atomicRenewalRejectsInvalidSchemaAndMissingRowWithoutCommand()
  - GuidedSessionIT.concurrentConflictingStartsHaveOneWinner()
  - GuidedSessionIT.contextProofCannotSkipFirstIdentityCanonicalOrFreshLiveRefusal()
  - GuidedSessionIT.noStateCanPublishWithoutExactVerifier()
  - GuidedSessionIT.successfulLedgerStillCannotPublishWithoutExactPlanVerifier()
  - GuidedSessionIT.observeV2ReusesOnlySecondSchemaAndUnavailableCaptureDefaults()
  - GuidedSessionIT.cancelRevokesUnconsumedAndRetainsUncertainConsumedEvidence()
  - GuidedSessionIT.lostAckNeverRetriesAndDelayedCallbackCannotRevive()
  - GuidedSessionIT.evidenceReferencesAreScopedAndDoNotClaimReplay()
  - GuidedSessionIT.acceptedSelectionSurvivesRestartAndKeepsSafeScopedMapping()
  - GuidedSessionIT.atomicRenewalUniqueCommandConflictRollsBackOwnerUpdate()
  - GuidedSessionIT.liveOwnerRenewalPreservesAdmittedAndDispatchedActions()
  - GuidedSessionIT.actionBudgetAndFalseAssertionReportsFailClosed()
  - GuidedSessionIT.concurrentIdenticalStartsAndChangedDigestAreDurable()
  - GuidedSessionIT.selectionHandoffRechecksScopeFenceRevisionDeadlineAndTerminalState()
  - GuidedSessionIT.preparedObservationFailureKeepsOwnerMaterializationRefreshAndDuplicatePriority()
  - GuidedSessionIT.preparedObservationOwnsTheWholeEnvelopeBeforeCallerMutation()
  - GuidedSessionIT.takeoverCannotReopenFinalizingAfterExecutedEffects()
Not run, same mechanism expected: `GuidedSessionVideoIT`, `GuidedPublicationReplayIT`, `ObservationPolicyIT`, `GuidedCsiBudgetIT`, `GuidedServiceTransportFaultIT`, `GuidedBridge*IT`. All turn green when L1-P's projector writes `progress`/`explanation`.

## Deviations and decisions
- [AUTO-DECISION] uuid fields in `public-ui-projections.schema.json` carry the same lowercase `pattern` as the existing uuid fields in `session-view`, besides `format: uuid` (the runner audit and Java validators do not assert `format`). Architect's design file had `format` only.
- [AUTO-DECISION] Design file key `classification` dropped (unknown keyword under Ajv strict); `title` and descriptions added.
- [AUTO-DECISION] ADR rows: P2/P3 labelled class C with the lane file's "class C rows" instruction, although 013 C1 labelled a v3 result shape change class B. Same authority (architect) either way.
- Backend run used a superset command (adds `ExecutionVideoContractTest`) and a second run (`obs008-c-r3-01`); both beyond the lane's single command.
- `tools/check-studio-observed-contracts.cjs:963` not edited (outside list); needs `43` -> `44`.
- One stray redirect to `/tmp/ignore.out` early on (deleted).
- Not run: frontend `studioContract.test.ts` (frontend held by U2; ledger R4); `GuidedContracts` epochs not overlay-measured (inferred unchanged from byte-identical bundles).
- No git operation, no story edit, no signal to any PID.

## Open questions for root
1. Who edits `tools/check-studio-observed-contracts.cjs:963` and the two `ExecutionVideoContractTest` pin sets?
2. @architect to confirm the F4 note placement (own paragraph at line 126).

## Update after root decision (pinned copies closed)
- `tools/check-studio-observed-contracts.cjs` line 963 only: 43 -> 44 (root-authorized). sha256 `685d9227…` -> `758787d4…`. Checker with N24 as-is: all 7 sections PASS (44 schemas, 481 checks, 44 operations, 40 examples).
- `ExecutionVideoContractTest.java`: `getStudioTestCapabilities` added to the attribution set and the public-401 set, and the count 35 -> 36; nothing else. sha256 `0c85617c…` -> `1e867b1a…`.
- Backend `obs008-c-pins02` (StudioContractTest + ExecutionVideoContractTest, lock wrapper, `--no-daemon`): 35 run, 33 passed, 2 failed, sourceStable/testInputStable/distStable true. Results in the 008 folder: `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-pins02-results.json`. The two reds are exactly the ledger R2 rows: `declaredOperationStatusSetsAndMarkersMatchTheReviewedContract()` and `everyRouteTheContractPresentsAsShippedIsActuallyReachable()`. Exit 1 is the genuine Gradle exit. `ExecutionVideoContractTest` is fully green.
- The "Reds outside the ledger" section above is closed. R3 (48 reds in `obs008-c-r3-01`) is root-accepted ledger R3, closed by L1-P; `GuidedSessionIT` not edited.
- `obs008-c-pins01` and `obs008-c-r3-01` files remain in the 015 folder for root to move.

## C-int fix unit 2 (ReplayFailure null)
- **Bug (found by L2a).** `ReplayFailure.allOf[0]` had `else: { type: object, ... }`, so `replayFailure: null` failed under a nullable-to-type-array mapping (the checker's `anyOf` conversion hid it).
- **Fix.** `openapi.yaml` line 4319 only: `else: { properties: { loginStepsPresent: { not: {} } } }`. Scan of my other additions found no other nullable + if/else instance (`PublicProgress`, `PublicExplanation`, `StudioCapabilities`, the `session-view`/`result` additions).
- **sha256.** openapi `c377e480aa1b87e438b6270486e0f83c843cdb7f590c7721cc5300e3f99ce515` -> `2f4041aec633c69d5614ff6b5dbba74048a52341c58acb9116ec47af1cd61700`. Pin comment and constant updated in `StudioContractTest.java` and `confinement.test.ts` (both quote old and new digest). `confinement.test.ts` `1108c729…` -> `ca795045…`. `StudioContractTest.java` is shared with L1-P: sha256 at my exit `b6c94da70ad8e4bbbbfc58311df07eae265d93cf0b71dfbf44caa416b3adcaf8`.
- **Ajv check** (scratch `replayfailure-null.cjs` in the scratchpad, two nullable mappings): the pre-fix document refuses `ReplayFailure` null and a snapshot with `replayFailure: null` under the type-array mapping; the fixed document accepts null, absent and the 3 examples under both mappings, and still refuses LOGIN_REQUIRED without `loginStepsPresent`, TARGET_DRIFT with it, an unknown code and an extra key.
- **Generator** `check()` PASS unchanged. **Checker** PASS 7 sections (44 schemas, 481 checks, 44 operations, 40 examples).
- **Runner pin** `obs008-c-confinement02`: exit 0, sourceStable and distStable true, 1 passed. `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-confinement02-results.json`.
- **Backend** `obs008-c-pins03` (StudioContractTest only): Gradle exit 0, 14/14 passed including the pin test and, now, both R2 tests (L1-P had landed by then). The wrapper exited 2 because `sourceStable` was false (other lanes edited during the run after a 637.8 s lock wait), so this run is non-evidentiary; decide from `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-pins03-results.json`.

## C-int fix unit 3 (secret value bound 4096)
Per @architect ruling W1 confirmations section 5 (`docs/qa/evidence/STUDIO-OBS-008/prep-20261016/t0-rulings/w1-confirmations.md`).
- `openapi.yaml`: `CreateStudioSecretRequest.value.maxLength` 8192 -> 4096; nothing else. Operations stay 44. New digest `b5ecdcad4c5e152d0edde5ad14af1a04438f3d9153b04037ef9ce5bc0ae29244`.
- ADR-002 section 13: one class C row appended (old and new digests quoted).
- `docs/runbooks/studio-runner.md`: "Response size" bullet rewritten as specified (4096; `SECRET_TOO_LONG`; keep the 64 KiB default; about 34 KiB and about 57 KiB thresholds).
- Pins re-anchored: `StudioContractTest.java` (pin comment and constant only) and `confinement.test.ts` (same), each quoting "STUDIO-OBS-008 C-int unit 3 (secret value bound 4096, OBS-007 AC-12)" and the previous digest.

| File | Before | After |
|---|---|---|
| `docs/specs/studio/openapi.yaml` | `2f4041aec633c69d5614ff6b5dbba74048a52341c58acb9116ec47af1cd61700` | `b5ecdcad4c5e152d0edde5ad14af1a04438f3d9153b04037ef9ce5bc0ae29244` |
| `docs/runbooks/studio-runner.md` | `baa762585b8e8328c59722cdc7330a5f79bf946d8f189ea2c4d50ae2ca400051` | `9b80b5c1538eb71806f531dbd60c2b918fa9014428ea4d34629c4b9ca7f558ee` |
| `docs/architecture/ADR-002-internal-contract-surface.md` | `b0c8c21682182b99441f4820e6967bdbd3fd8a2940665cc66285205732971270` | `1f8e5fbd94c8034cdca77dd5bf2e20d3863147133077f03286c4cbde9e7b9695` |
| `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java` | `b6c94da70ad8e4bbbbfc58311df07eae265d93cf0b71dfbf44caa416b3adcaf8` | `fdb4123fb50a008a5f672421f802f2d41c990fdb842652e097bb663ff5b1fed9` |
| `studio-runner/test/run/confinement.test.ts` | `ca795045a760b1ff0cd80eda5d0437b880fba1b9cb6fd57ab53c84d1b5571b2a` | `5df2b6535ebd0907552b4e75c28a4e8ffa36ecfd4152aa57cd5cf0d03c5d9720` |

Verification (N24):
- Generator `check()`: PASS unchanged. Checker: PASS 7 sections (44 schemas, 481 checks, 44 operations, 40 examples).
- Runner pin `obs008-c-confinement03`: exit 0, sourceStable and distStable true. `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-confinement03-results.json`
- Backend `obs008-c-pins04` (StudioContractTest only, lock wrapper, `--no-daemon`, 239.9 s lock wait): exit 0, 14/14 passed including the pin test, sourceStable, testInputStable and distStable all true. `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-pins04-results.json`
- Not done by L0 (other lanes per section 5.3): frontend rows 5-7 (L4), optional `studioContract.test.ts` parity line (L2a), C-OBS008-1/2 carry-forwards to 011.

## L0-F1 (C-int-2: legacy fixture cases)
- Deleted case `legacy-empty-context` from `context-authoring-valid.json` and `mixed-legacy-v2-steps` from `context-authoring-invalid.json`, by text surgery (rest of both files byte-identical, still valid JSON; 6 valid and 8 invalid cases remain).
- `StudioAuthoringApiIT`: the v1 body is now built inline by `validLegacy()` (same two step strings, verbatim), and `invalidFixtures()` appends the mixed-legacy case inline, so both the "v1 write refused and writes nothing" test and the shared-invalid loop (HTTP 400 and category) run on the same bodies as before. Removed the unused private `validExpectedLegacy()`.
- `StudioContextContractTest`: `legacyBody()` carries the former `legacy` member; the refusal assertion (`InvalidAuthoringException`, categories exactly `[INVALID_AUTHORING]`) now runs once on it before the valid loop; `invalidCases()` appends the mixed-legacy case so the `MIXED_STEP_SHAPES` category check (containsExactlyInAnyOrder) still runs. No assertion weakened.

| File | Before | After |
|---|---|---|
| `docs/specs/studio/examples/context-authoring-valid.json` | `2ae890db47b89a384bd62bc1d9c3c6c76b3e3cdf6623bd4cc536bf8044bfc4b1` | `9892317ceef4830b4cb0d5a291678b6ec94020f40e74086dea46e4a5ad99f36f` |
| `docs/specs/studio/examples/context-authoring-invalid.json` | `d301a48606e64f84322a926029dbb2652ef8d1c6a71b2618f9d26d3e170045e3` | `bec852d2d94372ceac736f378814379f14d85a175bcd6a54eb14065eb0f9f932` |
| `backend/src/test/java/com/citi/put/checks/studio/StudioAuthoringApiIT.java` | `41a12c5f57f6cb8d05ee2310754e3dd2d22d3984fa6fdcfbeea9932ffa094a85` | `6c6aaa36b4c58a7e87c8b2d530afbe5a93276b3f8cfc7e2f9a2c41e0b8d01b9b` |
| `backend/src/test/java/com/citi/put/checks/studio/contract/StudioContextContractTest.java` | `9805c33f24412bc9a6e57945857dcacdd25499fbddf33c3dc81cf09c04eb849c` | `84fb333c3c478ed4bfe33a03a0902dede3bfbed39b1ce9428038c30c9835875a` |

- Other consumers: none in studio-runner or tools. Frontend (left to L2a): `studioContextContract.test.ts`, `studioContract.test.ts`, `authoringHandlers.test.ts`, `studioAuthoringTransport.test.ts`.
- Checker (N24) PASS; generator `check()` PASS (it does not cover the examples). google-java-format clean on both Java files.
- Backend `obs008-c-f1-01` (StudioAuthoringApiIT + StudioContextContractTest, lock wrapper, 604.5 s lock wait): 12/12 passed, source, test inputs and dist stable, exit 0. `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-c-f1-01-results.json`
- Frontend read-only (`pnpm exec vitest run src/types/studio src/services/mocks/studio --minWorkers=1 --maxWorkers=2`, node 23.10): 10 files, 269 passed, 0 failed.
