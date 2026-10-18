# STUDIO-OBS-015 fullsuite-fix01 (Dex-G, @dev)

2026-10-16. Verified = a command I ran and its output. Inferred = reasoned, not run. Every changed file has sha256 before/after in `manifest.json` (37 files). No spotlessApply, no commit.

## Applied, in order
1. triage-A (`GuidedLedgerSeed` + 4 test files), `git apply --check -p0` then apply: clean.
2. triage-E: clean. R2: StudioVisibilityIT comment wrapped to 2 lines. R1: `GuidedPublicationRaceTest.race()` asserts `progress->>'errorCode' = PUBLICATION_CONFLICT` when `moved`. Red-before verified (`fix01-r1-red01`): with the errorCode `jsonb_set` removed from `GuidedPublicationRepository.conflict`, RaceTest is 12/13 and fails with `expected "PUBLICATION_CONFLICT" but was null`. Repository restored, sha `1dab60f7...` identical before and after.
3. triage-BC: clean (no overlap with E in StudioService).
4. triage-D: clean. R-1 confirmed, R-3 accepted as written. R-2: new `AcceptanceIT.aCounterOnlyBumpWithIdenticalSemanticContentStaysReady` bumps `source_revision` and `configuration_revision` with no content change, then `executeTest` is accepted (PENDING, revision snapshotted). Passed in the full run. It guards retained behaviour, so it cannot be red-before.
5. Aria cap ruling: `AuthoringStep.MAX_TEXT_CHARS = 500` (used by `@Size`, `AuthoringLimits`, `StudioService`); `maxLineChars` removed from `StudioAuthoringProperties` and `application.yml` with no alias; openapi `:363` text and `AuthoringStep.text` description; ADR-002 changelog row (2026-10-16); tests 501 and 600 inside `aStepOverTheLineCapIsRefused...`, 500 in `exactlyTheCapsAreAcceptedAtSave` with the ruling's comment; frontend `saveErrorMessage.test.ts` fixture. Grep gate `max-line-chars|maxLineChars|STUDIO_AUTHORING_MAX_LINE_CHARS|1024 char` over `backend/src frontend/src docs/specs/studio`: 0 hits.
6. Coordinator add-ons: `crash-reaper-diagnosis01/fix.patch` (ReplayIT harness), Pax TF-1 and TF-2.

## Decisions beyond the written spec
- `StudioContractTest.BASE_SHA256` also pins `openapi.yaml` (ruling named only the runner's `confinement.test.ts`). Both re-anchored `54fd12cd...` -> `c053a7f7...` (shasum). Without it the backend contract test goes red.
- Line wraps for the gjf 100-col limit on added lines (ExecutionReadinessTest, the evidence fixture, ReplayIT comments/statement). No behaviour change.
- Two failures that BC and D could not see until a head run, fixed in the test side only, assertions unchanged:
  - `StudioAuthoringMigrationIT.publicationCapturesTheExactV2InputsAndTheyAreWriteOnce`: the fixture needs an authored URL in step 1. The step text is now `Open https://orders.example.test/start 雪\n  "q"` (the Unicode/newline/quote bytes under test are kept). BC had flagged this as residual risk.
  - `StudioScheduleApiIT.rawReadinessChangeRefusesWithLearnRequiredAndNoExecution`: a fourth user of the retired counter-only mechanism (after the three in D). Now a real edit (steps changed plus counter bump), same pattern as D. Its Javadoc is adjusted.
- TF-1: `findAuthoringV2ById` is now `findById` -> `requireRead` -> authoring null check -> `authoringResponse`, no lock, and the cluster-C `@Transactional` is dropped (class-level readOnly is enough). New unit test `(d)` in `StudioServiceWriteAuthorizationTest`: stranger and absent-with-admin are refused and `findByIdForUpdate` is never called. Red-before is inferred, not run (the old body called the locking reader). The positive owner read is covered by the cluster-C ITs, not by this unit test (its mock draft has no revision inputs).
- TF-2: `auth != null` removed from the visible read, `requireWrite` and the refresh in `lockForAuthoringWrite`; `entityManager != null` kept (out of scope per Pax). Grep for `auth != null` in the method: 0.

## Results (collector receipts under `execution/`)
| Run | Result |
|---|---|
| `compile01` (compileJava + compileTestJava) | BUILD SUCCESSFUL |
| `fix01-full-test01`, full `test` | 2411 total, 2385 pass, 1 fail, 25 skip; the fail was `StudioScheduleApiIT.rawReadinessChange...`, fixed afterwards |
| `fix01-full-test02`, full `test` (after that fix) | 2411 total, **2385 pass, 1 fail, 25 skip**, sourceStable, collection complete. The one fail is `GuidedPublicationReplayIT.actualCommittedSecretProgressSurvivesOwnedChildAndParentCrashThenRunningReaper` (the harness race); this run predates the harness patch and TF-1/TF-2 |
| `fix01-replay-authority01` (ReplayIT + AuthorityIT after the harness patch) | **73/73**, 0 skip, complete (1208 s) |
| `fix01-tf01` + `fix01-tf02` (StudioAuthoringRevisionTest, StudioAuthoringPersistenceIT, StudioScheduleApiIT, RevisionRetentionIT, StudioAuthorizationIT, StudioServiceWriteAuthorizationTest, OptimisticSaveIT, StudioSaveInCallerTransactionIT, StudioWriteValidationControllerTest) | 82 total, 65 pass, 16 skip (historical @Disabled), 1 fail in my own new unit test (draft fixture), fixed; `StudioServiceWriteAuthorizationTest` then 7/7 |
| `fix01-full-incr01`, `guidedIncrementalTest` | **62/62**, complete (2513 s) |
| Runner unit tier (`pnpm run test`, alone) | 104 files pass, **2229 pass / 0 fail / 29 skip**; `confinement.test.ts` 19/19. A first run alongside the frontend suite had 2 five-second timeouts under load; the rerun alone was clean |
| Frontend `saveErrorMessage.test.ts` | 12/12; `type-check` exit 0; `lint` 0 errors (302 existing warnings) |

Not run as one combined final tree: the full `test` lane is `fix01-full-test02`; the harness patch and TF-1/TF-2 were confirmed by the lanes above rather than by a third full run.

## Skips, by name (25, all in `final-w02-full-test04` too; same multiset)
- `StudioScheduleApiIT` x16 (DEFERRED STUDIO-OBS-009 AC-6/T3 `@Disabled`)
- `SharedSchedulingIT` x2
- `ExecutionVideoExternallyGatedCriteriaTest` x2
- `ExternallyGatedCriteriaTest` x3
- `GuidedProviderEvaluationTest` x1 (`approvedProviderEvaluationIsReportedUnavailableWithoutExplicitConfiguration`, env-gated assume)
- `ExecutionReadinessTest` x1 (`targetPolicySelectionAdvancesTheConfigurationRevision`, `@Disabled`)
The approved-skips file `historical-skips-from-test04.json` is derived from test04, not independently approved.

## Count deltas
2412 (test04) - 3 (DROPPED_BY_NAME: ExecutionSnapshotMapperTest -1, StudioServiceWriteAuthorizationTest -2) + 1 (VariableReferenceValidatorTest, D) + 1 (AcceptanceIT, R-2) = 2411, which both full runs show. The TF-1 test `(d)` was added after `fix01-full-test02`, so the next full run should show 2412.

## Open observations (not changed by me)
- `frontend/src/services/mocks/studio/studioContract.test.ts`: 3 failures (mock fixtures vs TestDto: `/variables/1/secretId` pattern, `/steps/N` type). Verified pre-existing by running that file against the pre-edit `openapi.yaml` (`54fd12cd...`): the same 3 fail. Outside this story's scope.
- Stale javadoc in `ExecutionReadinessService` (term 5) and `VariableReferenceValidator` (D's production observations) untouched.
- `StudioContractTest` / ADR row say "results in this review"; the counts are above.
