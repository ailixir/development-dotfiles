# STUDIO-OBS-009 W2 lane B: receipt

- **Author:** Dex (@dev, backend). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No migration, no dist rebuild, no OpenAPI change, no new vocabulary.
- **Inputs read first:** `w2-brief.md`; `lanes.json` `w0Refold20261017` lanes B and BL; `w1.5/ruling-part2.md` (R1 GO, ADJ-1 option (a) GO); `t0-rulings/ruling.md` A7, A8, A11, A12; `pr-be/receipt.md`.
- **Legend:** [V] verified by running or reading; [I] inference, not run.
- **Verdict: GREEN.** 413 / 413 on the final bytes (`obs009-b-04`), red logs for the behaviour changes, four production behaviours each with a recorded mutation that goes red.

## 1. What changed (IDS: every file REUSE or ADAPT; the only CREATE is a test)

| Area (AC) | Change | IDS |
|---|---|---|
| **AC-9 TF-3** | `StudioService.readAuthoringDraft`: visible `findById`, `requireRead`, **then** `findByIdForUpdate`, `flush()` + `refresh()`, `requireRead` again. Mirrors `lockForAuthoringWrite` with the read check (T0 A8 option ii). Unknown, withheld and unreadable ids still all give `StudioAccessDeniedException` (403 `STUDIO_FORBIDDEN`). | ADAPT `lockForAuthoringWrite` |
| **AC-11 R1 a-d** | `GuidedMaterializationService.acceptedContextRevisions(int head, boolean appendPending)` (static, the pure derivation) and `acceptedContextRevisions(String sessionId, int head)` (reads the one existing pending query). `verifyLifecycle` is re-expressed through it with identical behaviour. `GuidedSessionEvidenceService` gains a `GuidedMaterializationService` argument (after `evidence`) and replaces **only** the `contextRevision ==` term with membership. `GuidedEvidenceConfiguration` builds `new GuidedMaterializationService(jdbc, contracts)` (same stateless construction `GuidedSessionConfiguration` uses). `sameIdentity` keeps its one body. | REUSE the L1 derivation; no second copy |
| **AC-11 ADJ-1 a-c** | `StudioDispatchLedgerStatements.applyFinal`: one added disjunct on the owner CTE, `OR (state = 'ADMITTED' AND revoked_at IS NOT NULL AND CAST(? AS boolean))`, bound right after `runnerSequence` to `ExecutionErrorCode.AUTHORIZATION_REVOKED.equals(errorCode)`. Javadoc says "the two recorded ADMITTED paths". **No migration, no V23, no ProgressReportService change.** | ADAPT the cancel disjunct |
| **AC-1 P2 b** | `RunnerReportProjection.projectRuntime`: `chromium` <- `observedChromiumBuild`; `validator` <- `"3:" + observedSchemaBundleHash` (null if the hash is absent); `executor` <- `observedBrowserLauncherSha256`; `playwright` and `image` unchanged. No fallback read of `chromiumBuild`, `validator`, `validatorSchema` or `executor`. | ADAPT |
| **AC-11 f-h (backend) incl. D-11** | **No production change was needed.** The projection already admits the post-Ready self-stop shape (outer `ERROR / RUN_ERROR / CANCELLED`, interrupted step failure `STOPPED_STEP_MESSAGE`); API outcome is `ERROR` with null `error_code`; `replayFailure` is null by construction (the 008 A1 TARGET_DRIFT branch is untouched). `RunnerOutcomeCodes.java` is **byte-identical** to before (sha below). Pinned by four new `RunnerReportProjectionTest` cases. | REUSE (pins only) |

IDS note on lane scope: `ProgressReportService.java` is **not** touched (brief delta), `RunnerOutcomeCodes.java` is not touched, no file outside the B write set (plus the three root deltas) was edited. Lane BL's `GuidedSessionService.java` edit is in `../bl/receipt.md`.

## 2. Files written (sha256 before and after)

| File (under `backend/src/`) | before | after |
|---|---|---|
| `main/java/com/citi/put/checks/studio/StudioService.java` | `27b972be0d98e0f792acd9ad18c13dddbc2ab8c95e3a97dfa60a7a97950c381c` | `c9b8019dfc341633b8647fdce492814b31682a9ed2d5fd61a8516384ffafbfab` |
| `main/java/com/citi/put/checks/studio/dispatch/StudioDispatchLedgerStatements.java` | `e2cd2f6c6e3c4aae1a5597134c5372eab38d8d92be6a3260826d74f0bec4beb1` | `ebb679fc8ccf3e2e5df0252c1e27b54471e22388541bd3e35b82f90f007ed86f` |
| `main/java/com/citi/put/checks/studio/guided/bridge/GuidedMaterializationService.java` | `c17c52985de22d762a4afd96b68d6e42b661af89a963f44273c74ccbf27e259d` | `0be7b180d7ea483a0b99abca38a03a63f6518d6e3f23f5d833c5e12b67b26cc2` |
| `main/java/com/citi/put/checks/studio/guided/evidence/GuidedEvidenceConfiguration.java` | `a44f726528edf8c60956717603299c6a480ceb3fa4b7021b3adced7d3660bdc7` | `27f9415d7a763f45f8297e1dec841953e41f3922ee8ffa1126110fe16ba9f639` |
| `main/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionEvidenceService.java` | `0f3be7586414f80debcc704d1ef65374bf5f108487a590cbf7018398bf867c12` | `19578626f97f05314dd3b7ec9bd91f79e1011d70838df425653b0d2f2f9cb5a2` |
| `main/java/com/citi/put/checks/studio/internal/RunnerReportProjection.java` | `a753b6eeae60c87ec617e1cfcf810702d4c18bab3d2e6d463b9f3b93ed12155b` | `66a3dd75faabd8a4645e8df6d7767e1ed274d8a698ab3e750c945fde7d12bd66` |
| `main/java/com/citi/put/checks/studio/internal/RunnerOutcomeCodes.java` (**not edited**) | `7e994ec1bcc7542f7cab05e7e8f448d542713ef90940fe018bf424864b993ebd` | same |
| `test/java/com/citi/put/checks/studio/StudioServiceWriteAuthorizationTest.java` | `6139389c230e19c69909610c774f132cec267c9f9992d8cd99973471d44cbcd8` | `b7d546e86b9a15971d2bcef99625a46dbb3058b08ae31f1367759af1e3f98aae` |
| `test/java/com/citi/put/checks/studio/StudioReadLockOrderIT.java` (new, 184 lines) | none | `2c138ff645fa051e6a2548b745a47e43372687897b9e5fc4a9393568692752f0` |
| `test/java/com/citi/put/checks/studio/guided/session/GuidedEvidencePendingAppendIT.java` (PR-BE baton, extended) | `9f2d3deb0741838593aebc33ff063e09631341950607dcf853171f53130a5487` | `89c2656553437dfb3d54e62c642165e966f6ddee1c2a385da254a3237dd3c974` |
| `test/java/com/citi/put/checks/studio/dispatch/PreReadyRevocationProbeIT.java` (PR-BE baton, restructured) | `6adce6065b88ef12ab84d9a983fa978cac4f34d7a255876aea81fade68536851` | `68b01220ee3c422619d7fd6ef0bb8879157929cbe3e373e26bebade31c656a5c` |
| `test/java/com/citi/put/checks/studio/internal/RunnerReportProjectionTest.java` | `99f8e744a84185fa03e136c1d6c01fdb536ee2621b3e9702aaada7ec4338ff4c` | `8dc5e41c2d8592fa791c7fbf3c0cf006c9aae6ae4e847d501967a8697e4ae622` |
| `test/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionEvidenceTest.java` (constructor only) | `7204b45fa9249060c80a55db91adb76a29d13e367ced25e85aa58cb1ec44af98` | `cd8eb34ad78c6ea20a2b14734dee5440461e1484610768de14ad505010789c8f` |

`sha256-before.txt` and `sha256-after.txt` in this folder carry the same table. `sha256-after-green-obs009-b-04.txt` is the bytes the credited run saw; [V] it is identical to the final bytes (`diff` clean). The mutation runs restored every file byte-identically (sha asserted by the script; the `[mutate] restored ... match=True` lines are in `mutations/mut0*.out`).

Every file above is google-java-format 1.22.0 clean ([V] `gjf -n` on all 14 files, including BL's, exit 0). `RunnerReportProjectionTest.java` also passed `--skip-reflowing-long-strings`, as spotless does.

## 3. Cases (the named ones the exit asks for)

**TF-3** (`StudioServiceWriteAuthorizationTest` (e) x3, `StudioReadLockOrderIT` x3)
- (e) a stranger and an absent id are refused on the visible read and `findByIdForUpdate` is never called.
- (e) the owner's read goes visible read, lock, `flush`, `refresh(locked)`, never `detach`.
- (e) a draft gone, or moved to an unreadable CSI, by the time the lock is taken is 403.
- IT: with another connection holding `FOR NO KEY UPDATE` on the row, a caller who may not read is refused 403 and does not wait (it settles inside 10 s; before the change it blocked behind the holder).
- IT control: an authorized read **does** queue behind the same lock (observed in `pg_stat_activity`, `wait_event_type = 'Lock'`, not inferred from a sleep), then returns the draft once the holder rolls back. This is what keeps a "fix" that just drops the lock from passing.
- IT: an unknown id and an unreadable draft give the same exception type and message.
- Unchanged and green: `StudioVisibilityIT` (3), `StudioAuthorizationIT` (28), `StudioAuthoringApiIT` (5), `StudioSaveInCallerTransactionIT` (4), `OptimisticSaveIT` (3). `createAuthoringDraft` now goes through the new sequence in its own transaction (flush then refresh of a just-created row); that path is exercised by `CanonicalAuthoringFixture.create`, which calls the real `createAuthoringDraft`, in `OptimisticSaveIT`, `StudioAuthorizationIT` and `CancelIT`, all green [V].

**R1** (`GuidedEvidencePendingAppendIT`, 8 cases; ruling table R1-1..R1-7)
- R1-1 v(n-1) accepted while pending; the stored row is the report's own (`recording_id`, `state AVAILABLE`, `partial true`, `owner_fence 1`, worker, `timings []`); the delivery stays `PENDING`.
- R1-2 v(n) accepted while pending (control).
- R1-3 n-2 refused (a real head-3 session: v2 acknowledged through `GuidedMaterializationService.acknowledge`, v3 pending). R1-4 n+1 refused. Both: `STALE_FENCE 409`, no evidence row, no command row, the delivery untouched.
- R1-5 foreign `contextId` at v(n-1) refused, nothing written.
- R1-6 foreign fence at v(n-1): header and body both foreign, header only, body only. All `STALE_FENCE`, nothing written.
- R1-7 with no pending delivery, v(n-1) is refused as before and the head is accepted.
- Extra: a second recording at the other accepted revision is still `IDEMPOTENCY_CONFLICT` (write-once kept).
- R1-8 (the L1 regressions): `GuidedServiceTransportFaultIT` 39 / 39 and `GuidedSessionIT` 44 / 44 green and **unchanged** [V].
- Tripwires [V]: `grep -rn 'boolean sameIdentity' backend/src/main` = 1 (`GuidedMaterializationService.java:422`); `grep -rn 'contextRevision() ==' backend/src/main/java/com/citi/put/checks/studio/guided/evidence` = 0.

**ADJ-1** (`PreReadyRevocationProbeIT`, 4 cases; ruling A1-A5)
- A1 target: the revocation FINAL is accepted; ledger `FINALIZING`; execution `ERROR / AUTHORIZATION_REVOKED`; `revoked_at` was written by the real `SecretRevocationSweep`; the secret-use terminal audit replays (`usage_outcome NOT_USED`, 1 row); `closeFinalized` gives `DONE`; `reapOnce()` changes 0 rows after the start deadline.
- A2 (renamed and inverted from the characterization): a FINAL on a revoked ADMITTED row whose outer code is not `CANCELLED` (`RUN_ERROR / INTERNAL_ERROR`) gets `409 TRANSITION_REJECTED`; the reaper settles `START_TIMEOUT`, as before.
- A3 revoked and cancel-requested: `CANCELLED` (precedence unchanged).
- A4 not revoked, not cancelled, outer `CANCELLED`: `400 INVALID_REPORT` from the OBS-006 pre-Ready rule, ledger stays `ADMITTED`.
- A5 regressions, all green and unchanged: `AdmissionCasIT` 14, `CancelIT` 16, `DispatcherIT` 26, `SecretRevocationSweepIT` 3, `LedgerStateMachineIT` 8, `LedgerStateMachineMigrationIT` 5 (the matrix agreement), `LedgerCancelTransitionsIT` 14, `ObservedTerminalSettlementIT` 20 [V].

**AC-11 f-h, D-11 and P2 b** (`RunnerReportProjectionTest`, 49 cases: 43 before, 1 removed, 7 added; one of the 43 rewritten)
- `anUnrecordedPostReadySelfStopProjectsErrorWithNoCodeAndNoReplayFailure` (both interrupted-step failures: `STOPPED_STEP_MESSAGE` and `CANCELLED`).
- `aSelfStopCannotBeMistakenForDriftEvenWhenTheInterruptedStepSaysTargetDrift` (D-11).
- `aRecordedRevocationWhoseControlReadIsLostStillProjectsAuthorizationRevoked` (the mandatory regression; cancel keeps precedence).
- `theRevocationMappingIsKeyedOnTheRunnersOuterCancelledNotOnTheSelfStopShape`.
- `runtimeVersionsProjectOntoTheObservedIdentitiesAndKeepPlaywrightAndImage`, `theRemovedArtifactOneKeysAreNeverReadAsAFallback`, `anAbsentObservedKeyLeavesItsFieldNullAndNeverBuildsAHalfString`, and the rewritten `runtimeVersionsIsNarrowedToTheSection46Subset`. I removed `theRunnersChromiumBuildKeyProjectsOntoRuntimeChromium` (it pinned the artifact-1 key the ruling says to stop reading); its intent (VAL-018, the runner's build id reaches `runtime.chromium`) is now `runtimeVersionsProject...`.

## 4. Runs (every command goes through the shared lock, `--no-daemon`, `PATH` with Node 24.20.0)

Command shape: `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py <label> --test-tasks test -- test --tests ... --no-daemon`. Result files and logs are in `../execution/`; `lsof` and Gradle-process listings before each run are in this folder. No run failed on a connect error, `role does not exist` or a Testcontainers hang, so no run is attributed to a host collision. The `dist` digest is `897182d5...` before and after every run (no rebuild).

| Label | Purpose | Total / passed / failed | wrapper exit | results sha256 (first 16) |
|---|---|---|---|---|
| `obs009-b-red01` | **Red log**, new tests against the unchanged main | 79 / 66 / 13 | 1 | `5eab9e0c8b7ac162` |
| `obs009-b-01` | first green attempt (superseded) | 187 / 185 / 2 | 1 | `413d2216352d5ec0` |
| `obs009-b-02` | fixture fix attempt (superseded; `GuidedLifecycleReasonIT` 5 / 5 here) | 13 / 5 / 8 | 1 | `48b7d69b434aa6be` |
| `obs009-b-03` | `GuidedEvidencePendingAppendIT` | 8 / 8 / 0 | 2 | `631ccfd2c2d21f08` |
| **`obs009-b-04`** | **Final bytes, credited**: B classes + BL classes + regressions (33 classes) | **413 / 413 / 0 / 0 skipped** | 2 | `3bb5a563cacb6dbe` |

- Wrapper exit 2 on `-03` and `-04` is `sourceStable:false` only (other lanes edited source during the run, root R3); the Gradle exit inside was 0 and every case passed. Collector runs in W2 are non-evidentiary by R3: report the counts, evidence comes from F-merge and G9.
- `-01` failed two head-3 fixture cases (`INVALID_CONTRACT`: the context acknowledgement schema pins both revisions to decimal strings, the PR-BE fixture used `"source-1"`); `-02` failed all 8 with `REVISION_CONFLICT` (the fixture reference named `config-1`). Both were fixture errors in my test, fixed by moving the fixture to numeric revisions and rewriting the reference's `configurationRevision`. Not product findings.
- Red log content (`-red01`, 13 red) [V]: `StudioReadLockOrderIT` stranger-waits (1); `StudioServiceWriteAuthorizationTest` (e) x2 (2); `PreReadyRevocationProbeIT` A1 (1); `GuidedEvidencePendingAppendIT` R1-1 plus 3 more that were red for fixture reasons or because they depend on R1-1 (4); `RunnerReportProjectionTest` P2 x4 (4); `GuidedLifecycleReasonIT` case 1 (1, BL). R1-1 and A1 were also credited red by PR-BE (`obs009-prbe-r1-02`, `-adj1-02`).
- Static gates [V], one Gradle run under the lock (`obs009-b-static-gates-gradle.log`): `spotlessCheck` pass, `checkstyleTest` pass, `spotbugsMain` pass, **`checkstyleMain` FAILED on a file outside lane B**: `guided/session/GuidedSessionConfiguration.java:292:27-28` `WhitespaceAround` on `factory -> {};` (D3's in-progress wiring; I did not touch it). No violation in any B or BL file. See the finding below.

## 5. Mutation checks (key assertions; each restored and sha-verified)

Run with `mutations/mutate_multi.py` under the lock; the specs are `mutations/spec-mut0*.json`, the console output `mutations/mut0*.out`, and the result XML and Gradle logs are in `mutations/obs009-b-mut0*`.

| Id | Mutation | Expected red | Seen (`mutations/obs009-b-mut01..03`) |
|---|---|---|---|
| R1-M | `acceptedContextRevisions` returns `{head}` while pending | R1-1 | **red**: `recordingAtThePreviousRevisionIsAcceptedWhileAnAppendIsPending` (STALE_FENCE) and `aSecondRecording...` |
| R1-M2 | widen to `{head, head-1, head-2}` | R1-3 | **red**: `twoRevisionsBehindTheHeadIsRefused...` (accepted) |
| R1-M3 | ignore `appendPending` (always `{head, head-1}`) | R1-7 | **red**: `withNoPendingDeliveryThePreviousRevisionIsStillRefused...` (accepted) |
| A-M | drop the `AND ?` outcome binding (`OR true`) | A2 | **red**: `aRevokedRowsOtherPreReadyFinalIsStillRefused...` (expected `409`, was accepted). A1 stays green, as it should |
| TF-3-M | lock moved before `requireRead` | unit (e) + IT stranger | **red**: `theDraftReadAuthorizesBeforeAnyRowLock` (`NeverWantedButInvoked findByIdForUpdate`) and `aCallerWhoMayNotReadTheDraftIsRefusedWithoutWaitingForItsRowLock` |
| P2-M | fallback read of `chromiumBuild` | removed-keys case | **red**: `theRemovedArtifactOneKeysAreNeverReadAsAFallback` |
| D-11-M | drop the `errorMessage == TARGET_DRIFT` term in the A1 derivation | self-stop-vs-drift pin | **red**: `aSelfStopCannotBeMistakenForDriftEvenWhenTheInterruptedStepSaysTargetDrift`, and the existing `targetDriftWithADifferentReasonNamesNothing` |
| LR-M (BL) | ignore `reason` in `lifecycle` | LR case 1 | **red**: `anExpiredReportAcceptedBeforeTheBackendExpiryEndsExpired` |

Mutation run 01 combined the R1-M, A-M, TF-3-M, P2-M, D-11-M and LR-M edits (six files, disjoint test classes) and read each failure by class; runs 02 and 03 are R1-M2 and R1-M3 alone. Run 01: 79 cases, 9 red, every red one named above, no unexpected red [V].

## 6. ACs covered (local half) and owed

- **AC-9 TF-3 a-d:** covered locally. b (the ruling) is T0 A8; c, d implemented and tested. e (timing: before the first human pilot) is satisfied by landing in W2 [I].
- **AC-11 R1 a-c:** covered. **R1 d (joined proof: owner loss at v(n-1); the recording plays and seeks): OWED to B-W3 after F-merge**, and R1 e (KL-015-R1 disclosure) stays until R1 d is evidenced, per ruling §1.4.
- **AC-11 ADJ-1 a-c:** covered at the report boundary (A1-A5 plus the mutation). **Owed:** (i) the joined real-runner leg with the initial-context pause seam, B-W3 in `PreReadyRevocationProbeIT`, credited on the F-merge `dist` digest; (ii) **@qa's security co-sign on ADJ-1 at the B gate** (ruling §2.3): the analysis it signs is ruling §2.2, and the code matches it: recorded fact only (`revoked_at`, write-once by trigger), outcome-bound (`AUTHORIZATION_REVOKED` from the API's own projection), no edge, reaper, deadline or OBS-006 widening; (iii) **Aria's ADR-002 note** (one sentence under §29.2 item 7, one §13 row) is hers, dated when B lands.
- **AC-11 f-h (backend) and D-11:** covered by pins (no production change). The runner half (outer `RUN_ERROR / CANCELLED`, interrupted-step message, the `recorded` upgrade over revocation facts, the four control-window branch labels) is the runner lane's.
- **AC-1 P2 b (projection):** covered. The five-field stamp removal, contract descriptions, examples and digest re-anchor are C9 and the runner lane.

## 7. Deviations

1. `RunnerOutcomeCodes.java` and `ProgressReportService.java` are in `lanes.json`'s B write set; the brief drops the second, and the first needed no change. Both are byte-identical. Not a deviation from the brief; noted so the diff is not searched for them.
2. I removed one existing test (`theRunnersChromiumBuildKeyProjectsOntoRuntimeChromium`) and rewrote another (`runtimeVersionsIsNarrowedToTheSection46Subset`) because they pinned the artifact-1 mapping P2 b removes. Both are in my write set.
3. `PreReadyRevocationProbeIT`: the characterization case was renamed and inverted as ruling A2 says; the structure was refactored around a `Run` helper to host A1-A4. The reaper path is still asserted (A2).
4. The head-3 fixture acknowledges the pending delivery with `GuidedMaterializationService.acknowledge` inside a repository transaction, not `GuidedSessionService.acknowledgeContext`, because `acknowledgeContext` needs the translation service this fixture does not install (`RUNTIME_INCOMPATIBLE`). The acknowledgement body is the real one (schema-validated).

## 8. Findings for root or @architect

1. **`checkstyleMain` is red on D3's file** `GuidedSessionConfiguration.java:292` (`factory -> {};` `WhitespaceAround`). Not mine; D3 should fix before F-merge. [V in the static-gates log]
2. **LR side effect, for @architect's awareness (BL):** an `EXPIRED` context lifecycle now also changes the durable stop request's `reason` to `EXPIRED` (it was `UNKNOWN_OUTCOME` for `FAILED`). Same as `assignmentLifecycle`. See `../bl/`.
3. **R10c, runner lane contract:** the backend maps `AUTHORIZATION_REVOKED` only from the runner's outer `CANCELLED` (pinned). If the runner lane, in extending the `recorded` upgrade to revocation facts, ever sends outer `RUN_ERROR` for a revoked run, the API gives `error_code` null. The mandatory regression must keep outer `CANCELLED` for a recorded revocation.
4. **P2 landing order:** the backend now reads only `observed*` keys. With today's `dist` (`897182d5`) the fields fill, because `write-runtime-versions.mjs` stamps the observed keys when the schema bundle exists [I from reading the script, not re-run]. A runner build without the observed stamps gives null `chromium`/`validator`/`executor`. Public `validator` is now `3:<64 hex>` and `executor` a 64-hex launcher digest instead of `1.0.0`; the contract text and examples are C9's.
5. **R1 corner:** in the impossible case of a pending delivery at head 1 the evidence route now answers `409 RUNTIME_INCOMPATIBLE` instead of `STALE_FENCE` (ruling §1.3 notes it; [I] unreachable).

## 9. Batons (for F-merge and later lanes)

1. **Land atomically:** `GuidedMaterializationService` (new `acceptedContextRevisions`), `GuidedSessionEvidenceService` (new constructor argument), `GuidedEvidenceConfiguration` (wiring), `GuidedSessionEvidenceTest` and `GuidedEvidencePendingAppendIT` (constructor calls). Any other code that constructs `GuidedSessionEvidenceService` needs the 6-argument form [V by grep: only the configuration and those two tests].
2. **B-W3 (after F-merge):** R1 d joined proof and the ADJ-1 real-runner leg, both on the F-merge `dist` digest.
3. **@qa:** ADJ-1 security co-sign (B gate).
4. **Aria:** ADR-002 §29.2 item 7 sentence and §13 row.
5. **Runner lane:** finding 3 above.
6. **C9 / runner lane:** finding 4 above (P2 stamp removal, contract text, digest pins move once).
7. **Not run, by scope:** `GuidedPublicationReplayIT`, `guidedIncrementalTest`, `crossReplicaTest`, `StudioContractTest` (no OpenAPI change), the frontend. [V that no file I changed is in their sets only through `GuidedEvidenceConfiguration`, which `GuidedPublicationReplayIT` boots; that IT was not run in this lane.]
