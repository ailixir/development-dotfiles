# STUDIO-OBS-009 W2 lane S receipt: AC-6 a-f, observed schedules re-enabled

Agent: Dex (@dev). Date: 2026-10-18. Mode: YOLO. Marks: [V] verified (ran it / read it), [I] inferred.

## Verdict

**GREEN with one baton; the real tree is RED until the baton lands.**

- [V] 34/34 green (22 `StudioScheduleApiIT`, 4 `SharedSchedulingIT`, 8 new `ObservedScheduleAuthorityIT`) on a fresh copy of the current real tree plus the one out-of-set patch (`logs/scratch-sc07.log`).
- [V] The same three classes on the real tree as it stands: 34 run, **12 pass, 22 fail**, because `StudioAcceptanceService` is outside lane S's write set and still throws `OBSERVED_SCHEDULE_AUTH_REQUIRED` for every scheduled run (`execution/obs009-s-real01-results.json`).
- Why a baton: a scheduled observed run needs an observed replay grant. `StudioAcceptanceService.acceptCore` (not in the S write set; `lanes.json` lists it read-only) has an unconditional `if (scheduled != null) throw OBSERVED_SCHEDULE_AUTH_REQUIRED` and then requires a manual `Prepared` grant. Nothing in the S write set can bypass that. The brief says to report this instead of editing, so I did not touch the file. The one hunk is `baton-acceptance-scheduled-grant.patch` (`git apply --check -p1` OK on the current tree).

## The 18 (explicit)

[V] All 18 `DEFERRED STUDIO-OBS-009 AC-6/T3` methods (16 `StudioScheduleApiIT`, 2 `SharedSchedulingIT`) had only their `@Disabled` removed and are green.

- Red first (`execution/obs009-s-red01*`, real tree, annotations removed, no fix): 28 run, 11 pass, 17 fail, 0 skipped. 17 fail with `OBSERVED_SCHEDULE_AUTH_REQUIRED` and friends. The 18th, `editedWriterRace...`, passes vacuously (the R7 case).
- Green, every assertion of the 18 unchanged (`logs/scratch-sc05.log`, `scratch-sc05-xml`): 34/34. This run had the original `editedWriterRace` assertion, only the 2 interim `SharedSchedulingIT` ports cut, and the new IT.
- Green with the R7 conditioning (`logs/scratch-sc06.log`, `scratch-sc07.log`): 34/34.
- `grep -rn '@Disabled' backend/src/test | wc -l` = **6**; `grep -rn 'DEFERRED STUDIO-OBS-009' backend/src/test` = **0**; `grep -n 'studio.updateTest('` in the two classes = **0**.

## Design (what changed)

1. `ObservedReplayAuthorization.prepareScheduled(test, revision, principal)` (new). It mints the same `ExecutionBinding` and replay grant as `ObservedReplayAuthorizer.authorize`, on the database clock and the same `authorizationTtlMs` window, with no caller session and no Core read. Background authority is the processor's live `require(principal, csi, environment)`, repeated in `beforeWrite` and at every dispatch recheck. `bind()` pins it to the locked test and revision as for a manual Run. Secrets are not touched here; they resolve per run at dispatch for this principal through the secret-use authorization (parity with the ordinary scheduler, A17).
2. `StudioScheduleProcessor`: the `artifactFamily >= 2 -> OBSERVED_SCHEDULE_AUTH_REQUIRED` refusal is removed. It is replaced by **G-3**: if the activated revision declares any secret and `authorization.localOnly()` is false, the occurrence is refused `BACKGROUND_AUTHORIZATION_DENIED` (an existing V16 code, no migration) and the schedule blocks. A `GuidedSessionException` from the binding (before any write) is stored as a `RUNTIME_INCOMPATIBLE` refusal instead of rolling the occurrence back and retrying every pass.
3. `StudioScheduledDispatchAuthorization`: `declaresSecrets(jdbc, revisionId)` (static, fail-closed: unreadable declaration or missing revision = true) and the same G-3 check in `recheck`, so a run accepted under the fixture policy is revoked at dispatch if the policy stops being local/test.
4. `ACTIVATION_REVISION_MISMATCH` and activation semantics are untouched and now tested live (`activationSemanticsArePreservedWhenTheConfirmedRevisionMovesOn`).
5. [I] `localOnly()` is the profile test. `ConfiguredBackgroundAuthorization.localOnly()` is `local/test profile && localGrantsEnabled`; a future production source answers false. That stays false-by-default, so G-3 holds for any secret-referencing revision regardless of what the production source grants.

No change to `ExecutionReadinessService`, `StudioScheduleService`, `ObservedReplayRuntimeConfiguration` (all hashes unchanged). No migration. No V16 edit.

## AC-6 a-f

| Sub-item | Result |
|---|---|
| a. Re-enable the 18 and get them green | [V] done; 18 green (sc05/sc06/sc07) |
| b. Unchanged; forced `saveAuthoring` and `withObservedReplay` edits kept; comments updated | [V] only `@Disabled` and the now-unused import removed. Comment-only edits, by name: `StudioScheduleApiIT` javadoc of `sourceMutationBlocksTheScheduleWithLearnRequired` (was `:444` area), the `input` branch comment in `updateRemovalAndInputInvalidationSettleDeferredWithoutOrphans` (was `:615`), the comment in `editedWriterRaceSerializesWithAcceptanceAndKeepsTheAcceptedRevision` (was `:929`). All three now cite the missing v1 `updateTest` (STUDIO-OBS-015 ruling1) instead of `AUTHORING_V2_REQUIRED`. `studio.updateTest(` count = 0. |
| c. R7 non-vacuous | [V] `editedWriter...` first green unchanged (sc05), then the final assertion is conditioned: `ACCEPTED` -> `containsExactly(originalRevision)`, else `isEmpty()`; `hasSizeLessThanOrEqualTo(1)` is gone. New `editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision`: acceptance holds the row until its transaction commits, the edit is started inside it and proven waiting (ungranted `pg_locks`, not done) before the commit; result: processor `ACCEPTED`, exactly one run on `originalRevision`, schedule `BLOCKED`. |
| d. Retire/re-point the 4 interim ports, by name | [V] **Deleted:** `StudioScheduleApiIT.rawReadinessChangeRefusesWithLearnRequiredAndNoExecution` (duplicate of the first half of re-enabled `rawReadinessChangesRefuseExplicitly...`, which adds the ACCEPTED continuation); `SharedSchedulingIT.sameCoordinatorRunsHttpTcpSplunkAndReachesTheStudioPipeline` and `SharedSchedulingIT.studioOnlyReplicaRunsWhenCatalogFlagIsOffAndDeduplicatesOccurrences` (assert the lifted `REFUSED OBSERVED_SCHEDULE_AUTH_REQUIRED`; both fail on the lifted tree (sc02). [I] The first one's extra `/api/v1/execute` call is why `sameCoordinatorRunsHttpTcpSplunkAndStudioThrough...` saw 2 requests instead of 1 in sc02; with the ports deleted it passes (sc01, sc05)). **Re-pointed:** `StudioScheduleApiIT.sourceMutationBlocksTheScheduleWithLearnRequired` now has an `ACCEPTED` control before the edit, assertions after it unchanged. **Tripwire:** `GuidedPublicationReplayIT` `:18521` is a baton (`baton-replayit-tripwire.patch`), not applied, see Batons. |
| e. QA grep | [V] `@Disabled` = 6, `DEFERRED STUDIO-OBS-009` = 0. |
| f. R9-OBS-1 | [V] **T3 did not change the `acceptedAt` / `pending_deadline_at` stamping.** The baton hunk touches only the grant derivation; `clock.instant()`, `row.setPendingDeadlineAt(acceptedAt.plus(...))`, the 600 s SLA and every deadline are byte-identical. No clock-source change, so no @architect ruling is needed. The new grant uses the database clock (`DatabaseClock`, R9 option B precedent) for its own `issuedAt/expiresAt` only. |

## Test count reconciliation (skipped is not passed)

Set = `StudioScheduleApiIT` + `SharedSchedulingIT` (+ the new IT).

- Before (deferrals in place): 28 declared methods, 18 skipped, 10 executed.
- Named deletions (3): `rawReadinessChangeRefusesWithLearnRequiredAndNoExecution`, `sameCoordinatorRunsHttpTcpSplunkAndReachesTheStudioPipeline`, `studioOnlyReplicaRunsWhenCatalogFlagIsOffAndDeduplicatesOccurrences`.
- Named ports (1, re-pointed in place): `sourceMutationBlocksTheScheduleWithLearnRequired`.
- Named additions (9): `editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision` and the 8 methods of `ObservedScheduleAuthorityIT`.
- After = 28 - 3 + 9 = **34**, 34 executed, 0 skipped (`StudioScheduleApiIT` 22, `SharedSchedulingIT` 4, `ObservedScheduleAuthorityIT` 8).
- Do not use raw `grep -c '@Test'`: it also counts `@TestConfiguration` and `@Testcontainers`.

## Commands run (exit, counts)

| Label | What | Exit | Counts |
|---|---|---|---|
| `obs009-s-red01` (real tree, collector) | annotations removed, no fix | 1 | 28 run, 11 pass, 17 fail, 0 skip |
| `obs009-s-real01` (real tree, collector) | S files applied, baton NOT applied | 1 | 34 run, 12 pass, 22 fail, 0 skip; `sourceStable` true |
| scratch `sc01` | S files + baton, ports cut, R7 + new ordering test | 0 | 26/26 (before the new IT existed) |
| scratch `sc02` | base tests (ports in), new IT | 1 | Api 22/22 pass; Shared 3 fail (2 deleted ports + WireMock contamination); new IT failed to load (`WebEnvironment.NONE`, my bug, fixed) |
| scratch `sc04` | same, new IT `RANDOM_PORT` | 1 | new IT 8/8; Shared 3 fail as above |
| scratch `sc05` | **base 18 unchanged**, ports cut, new IT | 0 | **34/34** |
| scratch `sc06` | final formatted files + `spotlessJavaCheck checkstyleMain checkstyleTest spotbugsMain` | 0 | **34/34; all four gates green** |
| scratch `sc07` | fresh rsync of the current real tree + baton patch | 0 | **34/34** |

The collector exits 1 on the real tree because of the missing baton, not because of source drift. The scratch tree (`scratchpad/obs009-s/tree`, `tree2`) is an rsync copy with the same Gradle lock; it was used only so the shared checkout was not edited outside the write set. [I] Collector runs during W2 are non-evidentiary (root R3); evidence comes from F-merge and G9.

## Mutation spot-checks (scratch tree only, `mutations.json`)

| Mutation | Result |
|---|---|
| M1 drop the processor G-3 refusal | caught: `g3RefusesAScheduledSecretReferencingRunOutsideLocalAndTestEvenWhenTheGrantStands` fails (only that one) |
| M2 drop the G-3 check in `recheck` | caught: `g3HoldsAgainAtDispatchRecheck...` fails (only that one) |
| M3 bind the grant to a wrong principal | caught: 17 fail, including the new IT's acceptance test and `editedWriterQueuedBehindAnAcceptance...` |
| M4 remove the `ui_tests` row locks (processor `FOR UPDATE SKIP LOCKED` and acceptance `findByIdForUpdate`) | **NOT caught (0 failures)** |

M4 is reported, not hidden. [I] The edit still waits behind the acceptance, because `saveAuthoring`'s schedule invalidation updates the same `studio_schedules` row the processor has just updated, so the ordering test proves "edit serializes behind an in-flight acceptance", not "via the `ui_tests` row lock specifically". The old `editedWriterRace` is by design insensitive to M3 (refused -> no runs), and the new ordering test is what carries non-vacuity.

## Deviations

1. Out-of-set file needed: `StudioAcceptanceService.java`. Not edited; shipped as a patch (baton 1). `lanes.json` marks it read-only for S, written when acceptance did not yet throw for scheduled observed runs.
2. `GuidedPublicationReplayIT` tripwire not edited (outside the write set, and `lanes.json` makes it a baton at F-merge). Patch shipped (baton 2).
3. I added `GuidedSessionException -> RUNTIME_INCOMPATIBLE` handling in the processor. It is not named in AC-6; it keeps a refused binding from re-rolling back every pass. Revert if @architect disagrees.
4. The new IT mocks `StudioReferenceResolver` so that a secret-declaring revision needs no Vault; the secret-use decision itself is not under test there.

## Batons (F-merge must land these atomically with the S files)

1. `baton-acceptance-scheduled-grant.patch` (`StudioAcceptanceService.java`, 1 hunk). Without it the lifted tests are red (real01).
2. `baton-replayit-tripwire.patch` (`GuidedPublicationReplayIT.java`, `:18521`, expects `BACKGROUND_AUTHORIZATION_DENIED`). [I] The code is inferred: the class sets no `studio.scheduling.local-grants`, so the same authority check denies the principal. Not run (browser-backed class). F-merge must run `obs009-s-replay01` (ReplayIT alone, full class); if the code differs (`OVERLAP`, `DISPATCH_DISABLED`), adjust only that expected string. The ReplayIT hash moved during my lane (`533fbee2...` to `b3df5185...`) by another lane; I did not edit it.
3. `qa/approved-skips.json` already omits the 18 [V], so the zero-skip policy matches.

## Findings for root / @architect

1. [I] Scheduled grant TTL is the manual one (`authorizationTtlMs`, max 30 s) from bind time. Admission by the dispatcher after that window is `AUTHORIZATION_EXPIRED`, and `refreshRetry` only re-mints after a definite refusal or zero-send. Unverified against a slow dispatcher; same as manual, but a scheduled run has no user to retry.
2. `prepareScheduled` duplicates ~50 lines of `ObservedReplayAuthorizer.authorize` binding construction, because the Authorizer is outside the write set. A shared builder is the follow-up (11-FOLD owns both files).
3. G-3 depends on `StudioBackgroundAuthorization.localOnly()` as the profile answer. A production source must return false; documenting that on the interface is OBS-011/OBS-010 work (release gate), not done here.
4. The only remaining `OBSERVED_SCHEDULE_AUTH_REQUIRED` in `backend/src/main` after baton 1 is the historical V16 CHECK. OBS-011's emitter removal then has nothing left in Java.
5. `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/s/` is the receipt folder; logs were copied from scratch with absolute paths and no secret material (the secret name `LOGIN_PW` appears only as a declaration name).

## Files

Written (sha256 before / after in `sha256-before.txt` / `sha256-after.txt`):

- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java`
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduledDispatchAuthorization.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReplayAuthorization.java`
- `backend/src/test/java/com/citi/put/checks/studio/scheduling/StudioScheduleApiIT.java`
- `backend/src/test/java/com/citi/put/checks/scheduling/SharedSchedulingIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/scheduling/ObservedScheduleAuthorityIT.java` (new)

Unchanged (hash equal): `StudioScheduleService.java`, `ObservedReplayRuntimeConfiguration.java`, `ExecutionReadinessService.java`, `StudioAcceptanceService.java`.
