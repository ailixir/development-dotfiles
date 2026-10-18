# STUDIO-OBS-015 fullsuite-fix01: independent review (Quinn, @qa)

2026-10-16. Read-only on source. No Gradle, JUnit, vitest or Chromium was run by me.
[V] = I read the code, or ran a read-only check (shasum, python JSON/hash loops, `patch -R` on scratch copies, google-java-format 1.22.0 as a plain jar in the scratchpad, never writing to the repo). [I] = inferred, not executed.

## Verdicts

| # | Item | Verdict |
|---|------|---------|
| 0 | Live hashes = manifest after-hashes | PASS |
| 1 | Triage A (`GuidedLedgerSeed` + 4 callers) | PASS |
| 2 | Triage BC (`latest` target; `@Transactional`, superseded by TF-1) | PASS |
| 3 | Triage D (v3 codec fixtures, URL fixes, DispatcherIT, empty-vs-space, AcceptanceIT real edit) | PASS |
| 4 | Triage E + R1/R2 | PASS |
| 5 | Aria cap ruling (500; `maxLineChars` deleted; openapi; ADR-002 row; contract + confinement re-anchor) | PASS |
| 6 | Crash-reaper harness race fix | PASS |
| 7 | TF-1 (`findAuthoringV2ById`) | PASS |
| 8 | TF-2 (dead `auth != null` guards) | PASS |
| 9 | Coordinator R-1 / R-2 / R-3 | PASS |
| 10 | Beyond-spec edits (MigrationIT URL step; ScheduleApiIT real edit) | PASS |
| 11 | No assertion weakened | PASS (two notes, A1 and A2) |
| 12 | The 3 dropped tests are lawfully obsolete | PASS |
| 13 | The 25 skips are the same historical multiset | PASS |
| 14 | Window as a whole (evidence of a green final tree) | PASS_WITH_REQUIRED_CHANGES (RC-1, RC-2) |

## Required changes (exact)

- **RC-1 (14, no full `test` run exists on the final tree).** `fix01-full-test02` is the last full run. The tree changed after it in three files (compared the receipts' `before` hashes with the manifest after-hashes [V]): `StudioService.java` (TF-1/TF-2), `StudioServiceWriteAuthorizationTest.java` (new test (d)) and `GuidedPublicationReplayIT.java` (harness patch). Every other scoped input (1647 files) equals the `fix01-full-incr01-after.json` snapshot [V]. Dex states this gap himself (review.md line 34). Run one full `test` through the collector on the current tree. Expected: 2412 total, 2387 pass, 0 fail, 25 skip, and the skip multiset in section 13 unchanged. The crash-reaper test must pass in it (the race is about 1 in 3000 registrations by Dex's own measurement, so the single green 73/73 lane is weak evidence for the fix by itself [I]).
- **RC-2 (12, rename bookkeeping).** Dex's "Count deltas" (2412 - 3 + 1 + 1 = 2411) is arithmetically right but hides two renames. The name-set difference between `final-w02-full-test04-results.json` and `fix01-full-test02-results.json` is 5 names out and 4 in [V]: out = the 3 drops plus `AcceptanceIT#anEditedDraftWhoseConfirmationNoLongerMatchesIsCompileRequired` and `GuidedSourceClassifierTest#canonicalWhitespaceAndVaultIdMatchingRemainOpaqueWithNameFallbackAndConflictChecks`; in = their renamed successors (`...IsLearnRequired`, `...OpaqueAndTheNameFallbackIsRetired`) plus the two new tests. Record both renames as `RENAMED_BY_NAME` in the inventory next to the 3 `DROPPED_BY_NAME`. Documentation only; no code change.

## Advisory (not blocking; owners named)

- **A1 (Pax/Dex).** The three "real edit" fixtures (`AcceptanceIT`, `DeReadyCarryForwardTest`, `ExecutionReadinessTest`, `StudioScheduleApiIT`) write `ui_tests.steps` only and leave `authoring` untouched. Production edits write both. So `ExecutionReadinessService` does not return the term-5 semantic-identity message; it falls through to the term-6 hash backstop. The assertion `contains("no longer match the text that was learned")` proves this [V: that string is term 6, `ExecutionReadinessService.java:209`]. The LEARN_REQUIRED outcome is correct and the new R-2 test discriminates it from the counter-only bump, so nothing is weakened. But no readiness-level test now goes through the production edit path (`updateAuthoringDraft`). `ChangeDetectionTest` covers term 5 at the change-service level [per Dex]. Optional: make one of the four use `CanonicalAuthoringFixture.update` and assert the term-5 message.
- **A2 (009 owner).** `StudioScheduleApiIT.rawReadinessChangesRefuseExplicitlyAnd...` (`@Disabled`, line 996) still uses the retired counter-only bump while its `@Disabled` text says "re-enable unchanged". It will fail for the same reason as D's tests when re-enabled. Note on the DEFERRED item.
- **A3.** `ADR-002` section 34 body (lines 2938, 2956) still states 1024. The changelog row supersedes it (it is the right place for it), but a one-line "superseded 2026-10-16, see changelog" next to section 34.2 would stop a reader trusting the stale table.
- **A4.** `VariableReferenceValidator` class Javadoc (lines 16-18) still says "falling back to its name", and private `isBlank` (line 168) is uncalled. Dex flagged both. Spotbugs runs at `reportLevel HIGH`, so I expect no failure [I]; confirm in the next `check`.
- **A5.** Stale names: `anUnconfirmedDraftIsCompileRequired`, `...WithTheCompileMessage` (x2). Kept on purpose for inventory delta 0; fine.
- **A6.** R1's assertion is inside `if (moved)`. The race decides whether the branch runs. Red-before proves it ran at least once (12/13, `expected "PUBLICATION_CONFLICT" but was null`) [V in `fix01-r1-red01-results.json`: 1 FAIL in `twoSessionsContend...`]. Residual: on a run where the loser never moves FINALIZING the assertion is vacuous. Acceptable.
- **A7 (carried, not this window).** (a) `studio_guided_materialization_snapshots` is now read by the V17 audit trigger functions, so a table-by-table-granted non-owner runtime role needs SELECT on the view (Dex-TA section 5; @devops/@architect question still open). (b) `frontend/src/services/mocks/studio/studioContract.test.ts` has 3 failures (`/variables/1/secretId` pattern, `/steps/N` type). Dex's log shows them on the original `openapi.yaml`, and both failing schema paths are untouched by the cap edit (text-only), so I accept "pre-existing" [I; I could not re-run]. A red frontend lane still needs a Pax disposition before any APPROVED.

## 0. Hash verification [V]

All 37 `files[].sha256After` in `manifest.json` equal the live file hashes (python sha256 loop, 0 missing, 0 mismatch). Stronger: all 1647 files in the `fix01-full-incr01-after.json` scope equal live now. `ADR-002` is outside that scope and equals its manifest hash.

I also reverse-applied the four triage patches and the harness patch on a scratch copy of the 37 files. 16 of the files returned exactly to their `sha256Before` (`SecretUseAuditIT`, `SecretAuditLifecycleIT`, `GuidedRecordingSeed`, `GuidedTranslationTest`, `GuidedGatewayPrivacyTest`, `GuidedSourceClassifierTest`, `DeReadyCarryForwardTest`, `StudioApiIT`, `DispatcherIT`, `VariableReferenceValidatorTest`, `StudioAuthorizationIT`, `StudioSchedulingSchemaIT`, `RevisionMigrationIT`, `ExecutionSnapshotMapperTest`, `StudioAuthoringMapper`, `ExecutionSnapshotMapper`). So for those, live = base + the reviewed patch, byte for byte, with no hidden edits. The other files carry Dex's disclosed manual edits (wraps, cap, TF, R1, R-2); I read those directly.

## 1. Triage A: PASS
- [V] `GuidedLedgerSeed` is byte-identical to the patch's new file and is google-java-format 1.22.0 clean (ran the jar; diff empty) with no line over 100 columns.
- Writes only `studio_guided_preparations` (insert), `studio_guided_actions` (insert), then the preparation's `admission_id` link (the production order) and, in `retire()`, the reverse delete. It writes no `studio_guided_translation_plans`, `_obligation_admissions`, `_source_manifests` or `_translation_state` row, and calls no store method (`acceptPlan`, `reserveObligation`, `attachAdmission`). That is the whole of Aria's R-1 list (`w2-window01/aria-bridge-ruling01/ruling.md:26`). The preparation `proof` and `request_digest` are computed with `GuidedContracts.hash`, the same canonicalizer the V21 guard compares, so the guard still decides.
- [V] No trigger is disabled by the helper or its callers. `grep` over `backend/src/test` shows `session_replication_role='replica'` only in files and lines that predate this window (`GuidedSessionEvidenceTest:271,329`, `GuidedPublicationReplayIT:14492`, the migration ITs, `GuidedObservationPrunerIT`); none is added by A.
- [V] `GuidedRecordingSeed` switching the materialization from `live=false` to `live=true` is disclosed and lawful: V21's action guard admits a row only against the live head, and the evidence repository deliberately does not filter `live` (`GuidedSessionEvidenceRepository.java:53`).
- [V] `GuidedTranslationTest`: `insert(1, ...)` agrees with `GuidedTranslationStore.sourceCoordinates` (`at > previousStep || (at == previousStep && ordinal > previousOrdinal)`), so `[A:0, A:1, B:0]` is lawful. The assertions are unchanged.
- [V] `SecretUseAuditIT`'s least-writer GRANT gains the snapshots view because the V17 audit function now reads it. The test's subject (cannot rewrite or prune partitions) is untouched.

## 2. Triage BC: PASS
`target("18")` and `migrate("18")` become `latest`, comments reworded; the assertions are unchanged. `StudioSchedulingSchemaIT` still takes V16 over a populated V15 first. The only trade-off is that these ITs now float with the head, which is what single-path wants. The `@Transactional` hunk was replaced by TF-1 (section 7), so its former "read path takes a write lock" flag is closed.

## 3. Triage D: PASS
- [V] `CanonicalStudioCodec` (lines 63-72): a plain `value` that is not text, or a `secretRef` that carries a `value` or lacks a valid `secretId`, raises `INVALID_VARIABLES` in the codec. `IncrementalAuthoringIdentity` raises `409 MISSING_SOURCE / AUTHORING_REFERENCE_MISSING` for an undeclared reference and `422 INVALID_CONTRACT / AUTHORING_REFERENCE_AMBIGUOUS` for a name/secretId clash. The new `GuidedSourceClassifierTest` expectations match production and are stricter than before (status, messageCode and code are all asserted). `null` and absent values still assert `MISSING_SOURCE`.
- [V] `GuidedGatewayPrivacyTest`: a v3 `secretRef` cannot carry a value, so the secret canary moved to `session.secretValue`. It is still in `progress.error`, and the "no canary on the wire" loops (lines 317, 376) are unchanged. The old planting site is unreachable in production.
- [V] `DispatcherIT`: `QUERY` is now found through `artifact.inputRecipes[].provenance.referenceName`; a missing recipe leaves the key absent, so `containsEntry("QUERY","studio")` fails. `doesNotContainValue("changed")` is kept.
- [V] Empty-vs-space: `VariableReferenceValidator` line 103 (unvalued only when the declared value is `null` and nothing supplied) matches the ruling. The old " " test became `null`, and a new test pins both `""` and `" "` as valid. `StudioApiIT` `value:""` became "no value", with the same assertions; the "no declarations" control moved to an unpublished `seedTest` draft, assertions unchanged.
- `AcceptanceIT` / `DeReadyCarryForwardTest` / `ExecutionReadinessTest`: real edit, `LEARN_REQUIRED` assertion unchanged, see A1.
- [V] `GuidedPublicationEvidenceFixture`: the URL regex excludes `"`, and the destination fallback now takes the first destination that fully matches. Fixture-only.

## 4. Triage E + R1/R2: PASS
Prior review `qa-source-review-final02` passed these hunks; I re-read them against the live tree.
- [V] `createAuthoringDraft` no longer calls `requireWrite` first. `createTest` still runs `requireRegisteredCsi` then `requireWrite` before any save, in ADR-002 s27.2 order.
- [V] `StudioAuthoringMapper`: fixed `List.of` order, and the message names the field from a constant, never from the request.
- [V] R1: `GuidedPublicationRaceTest.race()` asserts `progress->>'errorCode' = PUBLICATION_CONFLICT` when `moved`. Red-before is recorded (`fix01-r1-red01`: 13 total, 1 FAIL). `GuidedPublicationRepository.java` is `1dab60f7...` now, equal to the manifest's "identical before and after".
- [V] R2: `StudioVisibilityIT` has no line over 100, and the hunk is gjf clean.
- [V] I ran gjf over the touched hunks of `StudioService`, `StudioServiceWriteAuthorizationTest`, `StudioWriteValidationControllerTest`, `StudioAuthoringMapper`, `GuidedPublicationRaceTest`, `AcceptanceIT`, `ExecutionReadinessTest`, `StudioScheduleApiIT`, `StudioVisibilityIT`, `AuthoringLimits`, `StudioAuthoringProperties`, `AuthoringStep` and `ExecutionSnapshotMapper`. Every gjf difference sits in lines this window did not write. No line over 100 columns was added anywhere in the 37 files (set difference against the reverse-applied copy).

## 5. Aria cap ruling: PASS
- [V] `AuthoringStep.MAX_TEXT_CHARS = 500`; `@Size(max = MAX_TEXT_CHARS)`; `AuthoringLimits` and `StudioService:557-560` use the constant; order (count, blank, length) unchanged; the message shape is as ruled.
- [V] `StudioAuthoringProperties(@DefaultValue("100") int maxSteps)`: `maxLineChars`, its `@param` and its check are gone. `application.yml` keeps only `max-steps`. No alias.
- [V] Grep gate `max-line-chars|maxLineChars|STUDIO_AUTHORING_MAX_LINE_CHARS|1024 char` over `backend/src`, `frontend/src`, `docs/specs/studio`: 0 hits. A wider repo grep (excluding evidence) hits only historical story/gate files and the ADR changelog and section 34 text (A3).
- [V] `openapi.yaml:363` and `:3338-3342` match O1/O2. `shasum -a 256 openapi.yaml` = `c053a7f7...5d70f`; `StudioContractTest:82` and `confinement.test.ts:287` carry exactly that, with old/new comments. The old digest `54fd12cd` survives only in those two comments. Extending the pin to `StudioContractTest` was necessary (it pins the same file); not a deviation to object to.
- [V] ADR-002 row (line 359) is dated 2026-10-16, Class C, cites the ruling, and its content is the O5 text. `No request accepted on the single path becomes refused` is true: 501-1024 was already a `400`.
- [V] Tests: 501 and 600 inside `aStepOverTheLineCapIsRefused...` (both `SOURCE_LINE_TOO_LONG`); `exactlyTheCapsAreAcceptedAtSave` at 500 (the accept side) with 501 as the refuse side, so both sides of the boundary are pinned. `saveErrorMessage.test.ts` fixture carries the real 501 text; 12/12.

## 6. Crash-reaper harness: PASS
[V] One hunk in `registerOwnedProcess`. It reads `startInstant` and `commandLine` from a single `info()` snapshot, calls the existing `ownedCommandHash(String)` overload, and treats a `RuntimeException` from `info()` as "retry within the same 500 ms window". The fail-closed check is intact: a live process whose identity is never observed still throws "Live owned process identity unavailable; no signal authorized". Nothing is touched in production. The diagnosis (a second `info()` read races a `/bin/ps` or `/bin/kill` exit) is backed by the live log excerpt and a reproduction (2 in 6000). The post-patch lane is 73/73 with 0 skip (`fix01-replay-authority01`), but see RC-1 on its evidentiary weight.

## 7-8. TF-1 and TF-2: PASS
- [V] `findAuthoringV2ById`: `studioRepository.findById` (no lock), `requireRead`, authoring-null check, `authoringResponse`. No `@Transactional` (class-level read-only applies). This is the HEAD behaviour, and it removes the lock-in-a-read-only-transaction defect without a write lock on a GET. The unit test (d) refuses a stranger and an absent id with an admin, and verifies `findByIdForUpdate` is never called. Red-before holds by construction [I]: the old body called the locking reader, so `verify(tests).findById(id)` and `never().findByIdForUpdate` could not both hold.
- [V] `tf01` (final `StudioService`) ran all 11 former cluster-C callers green: `StudioAuthoringRevisionTest` 5, `StudioAuthoringPersistenceIT` 3, `RevisionRetentionIT` 2, `StudioScheduleApiIT` 6 pass (+16 historical skips), plus `StudioAuthorizationIT` 28, `OptimisticSaveIT` 3, `StudioSaveInCallerTransactionIT` 4. The single fail was Dex's own new test, fixed (`tf02`: 7/7 on the final tree).
- [V] TF-2: no `auth != null` remains in `lockForAuthoringWrite`; `entityManager != null` kept as stated. `CsiOwnershipEvaluator.canWrite` is fail-closed for a null or identity-less caller. No production caller passes a null `Authentication` (callers: `StudioController` and the service itself), and the test callers pass real principals.
- The `(c)` unit tests that exercised the dead branch were already dropped under E; (d) and the retained `(c)` cases cover the live paths.

## 9. Coordinator decisions: PASS
- R-1: name fallback is gone from code, not only the test. `VariableReferenceValidator` collects `secretIds` from `variable.secretId()` only; the codec refuses a null `secretId`. The test asserts the codec refusal and the ambiguity case.
- R-2: `aCounterOnlyBumpWithIdenticalSemanticContentStaysReady` bumps both counters with no content change and asserts the execute is accepted (`PENDING`, `revisionId` non-null). It passed in both full runs. It cannot be red-before (it guards retained behaviour); it does discriminate against the edited-draft test next to it.
- R-3: non-string values assert `StudioValidationException` code `INVALID_VARIABLES`; `null`/absent still `MISSING_SOURCE`. Matches `CanonicalStudioCodec` lines 63-65.

## 10. Beyond-spec edits: PASS
- `StudioAuthoringMigrationIT`: first step now `Open https://orders.example.test/start 雪\n  "q"`. The Unicode, newline and quote bytes under test are kept, and the assertions compare stored vs revision bytes, so a URL prefix cannot change their meaning. Needed by the observed fixture. 3/3 in `targeted03` and green in `full-test02`.
- `StudioScheduleApiIT.rawReadinessChangeRefusesWithLearnRequiredAndNoExecution`: real edit (steps changed plus counter), same pattern as D, Javadoc adjusted, assertions (`LEARN_REQUIRED`, `REFUSED`, no execution) unchanged. See A1 and A2.

## 11. Assertions: PASS
Every changed expectation falls into one of: production now says something else by ruling (codec/identity codes, readiness message, 500 bound); a fixture that cannot be built any more (v3 `secretRef`, URL, open origin); or a rename. None removes a check without a replacement: the canary stays on the wire check, the null/absent cases stay, boundary coverage on the cap gains a case, and the `""`/`" "` semantics gain a test. A1 is the one place where the path exercised moved from term 5 to term 6.

## 12. Dropped tests: PASS
- [V] `ExecutionSnapshotMapperTest.legacyStatusesAreReadThroughTheCanonicalVocabulary`: `toSnapshot` reads status and error code as stored; V13 `ck_ui_test_executions_status` allows only PENDING/RUNNING/PASSED/FAILED/ERROR (V13:203-204), so COMPLETED and TIMEOUT-as-status cannot be stored. The `ExecutionErrorCode.TIMEOUT` constant that remains is the error code, which is kept.
- [V] `StudioServiceWriteAuthorizationTest` (c) x2: their oracle was the deleted no-auth internal `updateTest`; the replacement path passes an admin `Authentication`, so the assertion could no longer be true. The internal-delete (c) case remains. Replacement coverage is (d) and the surviving lock-order tests. Their ordering is recorded in `final-w02` via the `qa-source-review-final02` item 2c.

## 13. Skips: PASS
[V] The skip multiset in `fix01-full-test02-results.json` equals the one in `final-w02-full-test04-results.json` exactly (Counter equality, 25 = 25): `StudioScheduleApiIT` 16, `ExternallyGatedCriteriaTest` 3, `SharedSchedulingIT` 2, `ExecutionVideoExternallyGatedCriteriaTest` 2, `GuidedProviderEvaluationTest` 1, `ExecutionReadinessTest` 1. As Dex says, `historical-skips-from-test04.json` is derived from test04 and is not an independently approved list. The skip identity matches, but nothing ratifies the list yet.

## Verification not done
No test, lint, typecheck or Gradle lane was run by me. I took the collector receipts and logs at face value after checking that their input hashes match the live tree (section 0 and RC-1). The 138/138 and 70/70 figures in the earlier triage reviews were run outside Gradle by their authors and I treated them as supporting evidence only.
