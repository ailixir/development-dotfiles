# STUDIO-OBS-015 qa-source-review-final02: independent source review (Quinn, @qa)

2026-10-16. Read-only on source. No Gradle, JUnit, vitest or Chromium was run by me.
[V] = I read the code or ran a read-only check (shasum, `git apply --check`, a scratch-copy apply, python JSON parse). [I] = inferred, not executed.
Scratch apply of both patches: `/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/qaf02` (copies only; the repo was not touched).

## Verdicts

| # | Item | Verdict |
|---|------|---------|
| 1a | Ledger 83/84: runner code-point comparator + shared vector | PASS |
| 1b | WARN count-query rate limit (aria-warn-ruling01) | PASS |
| 1c | PO R4: empty expected never passes | PASS |
| 1d | Conflict-stop hook, `conflict()` boolean, both publisher sites, leftovers (a) and (b), RaceTest fixture fix | PASS_WITH_REQUIRED_CHANGES (R1) |
| 2 | Cluster E patch (create authz order, revision message, 3 obsolete-test removals, other hunks) | PASS_WITH_REQUIRED_CHANGES (R2, R3) |
| 2a | of which: removal of the early `requireWrite` in `createAuthoringDraft` (security-sensitive) | PASS |
| 3 | Cluster B/C patch (`latest` target, `@Transactional` on `findAuthoringV2ById`) | PASS |

## Required changes (exact)

- **R1 (1d, leftover (b) has no failing-first test).** `GuidedPublicationRaceTest.race(...)`, in the loser branch right after the `assertThat(moved)` block (about line 274), add:
  `if (moved) { assertThat(db.jdbc.queryForObject("SELECT progress->>'errorCode' FROM studio_guided_sessions WHERE session_id=?", String.class, command.sessionId())).isEqualTo("PUBLICATION_CONFLICT"); }`
  Why: the only places that assert `errorCode` after a conflict are TFIT `conflictThenHook`, which writes the errorCode itself in its fixture, and the joined B3B-1 row, which goes through `conflictBeforeClaim` (pre-claim, already wrote it). Removing `progress=jsonb_set(progress,'{errorCode}',...)` from `GuidedPublicationRepository.conflict` (the post-claim path, leftover (b)) fails no test. [V by grep: RaceTest asserts only the boolean.] Re-run `GuidedPublicationRaceTest`.
- **R2 (2, format).** `StudioVisibilityIT` hunk: the new comment line is 101 columns (`// Production has no implicit identity creation: a row without authoring is not a readable draft.`). Wrap it to <= 100. [V by awk over the added lines; all other added lines are <= 100.] `java.util.List.of` fully qualified in `StudioAuthoringMapper` is legal (the `Set` import is still used at :17/:109/:100) but an import would be tidier; optional.
- **R3 (2, hold one hunk).** Do not apply the `StudioWriteValidationControllerTest.exactlyTheCapsAreAcceptedAtSave` hunk (1024 -> 500) until @architect rules on the step-text bound. [V] `AuthoringStep.text` is `@Size(max = 500)` while `studio.authoring.max-line-chars` is 1024 and the contract names `SOURCE_LINE_TOO_LONG` above 1024. Lowering the accepting boundary in the test makes it green without deciding which side is wrong, and it would hide a real contract inconsistency if 1024 is the intended bound. Dex-TE already flagged it as needing a ruling; this review agrees and asks that the hunk not be applied before the ruling. The other six hunks may be applied.

## 1. Final-window production changes

Hashes [V]: all 17 files in `backend/final-window01/manifest.json` and `sha-after.txt` match the live tree (0 mismatches, checked with shasum and a python loop). `dist/run/observationCollector.js` is `6e00578d...` as reported, and `dist/guided/evidence.js` contains `compareCodePoints` and `dist/run/observationCollector.js` contains the `expected !== ''` guard. The `sha256Before` values cannot be re-derived (the files are changed); I accept them as the recorded pre-image. The 127 full-lane failures are not part of this review.

### 1a. Ledger 83/84 parity: PASS
- [V] `compareCodePoints` in `studio-runner/src/guided/evidence.ts:139-150` mirrors Java `GuidedRecordingTimings.codePoints` (:157-170): `codePointAt`, step by 1 or 2 code units, tie on remaining length. A lone surrogate is handled identically in both (it is its own code point). `wireTimings` applies it to stepId and admissionId only; rounding, key order and wire fields are unchanged. `ordinal` stays numeric.
- [V] Vector `contracts/v3/timing-order-vectors.json` parses: 5 cases, 8 refused bodies; the ledger-84 case has U+FFFD vs U+1F600, the discriminating pair. Notes record RED before the fix (2 failures) and a Java mutation (`String::compareTo`) failing 4 tests, so the vector does discriminate.
- Runs recorded (not rerun by me): TS 23/23; Java `GuidedRecordingTimingsTest` 11/11 through Gradle (`final-w01-warn-parity01`).
- No value leakage (ids are UUID-minted today, latent divergence only); no memory change.

### 1b. WARN rate limit: PASS
- [V] `abandonedTeardowns` is `SELECT count(*) ... pruned_at IS NULL AND state IN (terminal) AND PENDING_TEARDOWN AND expires_at<=?` returning `int`; no id list is read. `warnedTeardowns` is gone, so the unbounded id set is removed. State is one `AtomicReference<Instant>` (O(1)); the CAS lets exactly one caller run per due instant; `Instant.MIN` makes the first tick report; the `stopSender == null` guard keeps H8 parity. The log argument is a single `Integer`; message text unchanged.
- [V] `GuidedSessionReaper` rejects a zero or negative interval with the existing message; `expire()` order is expire, redrive, report. Tests: T1 (sweep never warns, 1 per interval, 2 after), T2 (query gate, silent at 0, `verifyNoMoreInteractions`), T3 (`GuidedSessionReaperTest`, 2 tests with `inOrder`). Adequate for the ruling.
- Accepted costs (per ruling): the slot is consumed before the query, so a throwing count waits one interval; volume scales with replicas. Red-before is by construction only (T2 does not compile on the old code), as disclosed.

### 1c. PO R4: PASS
- [V] `observationCollector.ts:753`: `const expected = normalizeName(value()); return { assertionPassed: expected !== '' && normalizeName(innerText).includes(expected) }`. It returns a boolean in-page (no throw, so no `TARGET_CHANGED` misreport), `value()` still refuses null, nothing new leaves the page, and `normalizeName` (:52) strips U+200B/U+00AD and collapses `\s`, so the binding-path case (a capture that is only U+200B or U+00AD) is covered.
- [V] Tests: rows `'   '`, `'​'`, `' \n\t­'` all `false`; the empty-element `it` at :248; the parity file moved the `'   '` row out of the parity table into a labelled `PO R4 divergence` test. Red-before against `e073909b` is recorded (4 + 1 failures, exactly the changed rows).
- Non-blocking: other invisible code points not stripped by `normalizeName` (U+200C, U+200D, U+2060) leave `expected` non-empty, so the match is a real substring comparison and not vacuous. The F4 note in `docs/architecture/studio-inference-contract-v1.md` is still owed by @architect (PO decision, non-blocking).

### 1d. Conflict-stop: PASS_WITH_REQUIRED_CHANGES (R1)
Correct against the ruling, [V] by reading the code at the live hashes:
- `GuidedSessionService.publicationConflicted` (:2516-2527) is the twin of `publicationCommitted`: requires an active transaction, locks the row, requires `PUBLICATION_CONFLICT`, and calls `stop(session, "PUBLICATION_CONFLICT")` only if `teardownStatus` is absent. The reason maps to `UNKNOWN_OUTCOME` through the unchanged ternary. `stop()` is unchanged except leftover (a).
- `GuidedPublicationRepository.conflict` (:410-430) returns `boolean`, true iff the guarded `UPDATE ... WHERE session_id=? AND state='FINALIZING'` affected 1 row; the early returns (receipt present, state not FINALIZING) return false.
- `GuidedPlanPublisher`: post-claim catch (:235-246) runs under `sessions.lock(id)` and calls the hook only when `conflict(...)` returned true; `conflictBeforeClaim` (:250-269) calls it after `sessions.save(current)` in the same lambda, after the FINALIZING re-check under the lock.
- **At-most-once and concurrent stops.** Every terminal writer serializes on the session row lock. If cancel, expire, lifecycle or lost-ack wins, `conflict()` sees a non-FINALIZING state and returns false (no hook); if the conflict wins, later callers see a terminal row. The hook latch (`!has("teardownStatus")`) plus `TEARDOWNS_IN_FLIGHT` plus the runner's keyed idempotent stop make a repeat harmless. TFIT `publicationConflictedIsIdempotentAndFailsClosed` covers repeat call (no extra stub call, progress byte-identical), call outside a transaction (`RUNTIME_INCOMPATIBLE`), and a CANCELLED session (`PUBLICATION_CONFLICT`, no extra stop).
- **Leftover (a).** `stop()` now forms the target first and writes `PENDING` only together with `teardownRequest` (the block at :2553-2576). A target-less stop records nothing, so no request-less PENDING row that the reaper and the abandoned count cannot see. Test `stopWithoutAStopTargetRecordsNoPendingTeardown` pins it. Consequence [I]: for a session with no stop target the runner is never told and cleanup falls back to the runner's lease timer (<= 30 s per Aria); that was already the effective behaviour of the invisible PENDING row.
- **Leftover (b).** `conflict()` also writes `progress.errorCode = PUBLICATION_CONFLICT`. Correct by reading; untested on this path, hence R1.
- **No value leakage.** The request is `{target, reason}` where the target is the assignment/context identity from `teardownTarget`; no authored input, secret, or runner context is added by this change. [V] Not re-audited: the content of the stored assignment object (unchanged by this window).
- **Bounded memory.** `TEARDOWNS_IN_FLIGHT` is removed in `finally`; the teardown executor is bounded (2 threads, queue 64, `DiscardPolicy`), and a discarded attempt is recovered by the reaper because the durable request is committed.
- **RaceTest fixture fix.** `secondSession` copies the primary's `studio_guided_session_policies` row (V19 evidence fixture needs it). Test-only, correct, and the class is 13/13. Three return-value asserts match the ruling §4.1; the loser branch asserts the iff relation.
- Security note accepted from the ruling: if `guidedTerminal` throws, the conflict transaction rolls back and the session stays FINALIZING until `expire()` (fails closed).
- Advisory A1 (not blocking): no test removes the `if (conflict(...))` gate or the hook call from the post-claim catch and fails; that path has no joined body (disclosed) and the RaceTest asserts only the boolean. A publisher-level test with a mock `lifecycle` (as `ObservedArtifactLowererTest` does) would pin it. Recommended before GA, not required for this gate.
- Reported runs: TFIT+StopKey+Bridge 66/66, RaceTest 13/13, full `guidedIncrementalTest` 62/62 (not rerun by me). The full `test` lane is red (127 failures, taskCollectionComplete=false); Dex-F classifies it as pre-existing fixture/schema drift without a baseline run [I]. Triage E and BC explain 34 of them [V by reading their evidence, not by running]; the rest is outside this review. The gate must not be called green on the `test` lane.

## 2. Cluster E patch (not yet applied)

Patch sha256 `b4b628e1...` [V]; base hashes in its manifest match the live files (`StudioService` 7bb9a5b0, `StudioAuthoringMapper` d57c72ca, `ExecutionSnapshotMapper` 5f40a0a1). `git apply --check -p0` passes, and a real apply on the scratch copy succeeds; BC applies cleanly on top of E (the `StudioService` hunks are at different lines).

### 2a. Removing the early `requireWrite` in `createAuthoringDraft`: PASS
Is write authorization still enforced before any write or side effect? Yes, on every create path [V]:
- There is exactly one HTTP create route: `StudioController.createTest` -> `StudioService.createAuthoringDraft` (grep of `src/main`: no other caller of `createTest` or `createAuthoringDraft`). `createAuthoringDraft` -> public 3-arg `createTest` -> private 4-arg `createTest`.
- Order inside the private `createTest` after the patch: `extractIdentity` (pure; throws `AccessDeniedException` for a non-BFF token) -> csiId required (400) -> `requireRegisteredCsi` (read-only `existsById`, 400) -> **`requireWrite` (403)** -> `validateAuthoring` -> `userProvisioningService.ensureMirrored` (the first write) -> `studioRepository.save`. Everything before `requireWrite` is read-only. `createAuthoringDraft` itself does only `CanonicalStudioCodec.validateForWrite(metadata)` and `variablesToJson` before delegating, which are pure shape checks that were already ahead of the removed check.
- The public 3-arg `createTest` is reachable from non-HTTP callers and carries the same check, so the removal does not open an internal bypass.
- Null `csiId`: was 403 (`requireWrite` denies null); now 400 "csiId is required" from `createTest`. That is a shape check independent of stored state (ADR-002 §27.2 rule 1), so it is not an oracle.

Does an unauthorized caller learn more than allowed? One new bit: for a non-writer, a registered CSI answers 403 and an unregistered one answers 400, so CSI registration is observable through POST. [V] This is exactly what the product already rules and tests:
- ADR-002 §27.2: "`POST /tests` must also check `canWrite` on the request's `csiId`, after the registered-CSI check. That check's `400` does not depend on who is asking, so it reveals nothing about a particular draft."
- `createTest` Javadoc (:193-195) and the existing AC-9 test (`StudioAuthorizationIT.creatingOnARegisteredCsi...`, third block): a non-administrator POST on an unregistered CSI must be 400, not 403.
- [V] CSI registration is not a secret in this product: `GET /api/v1/csi/search` and `GET /api/v1/csi` carry no CSI-scoped `@PreAuthorize` (any authenticated principal can search the registry). [I] The registry is a corporate inventory, not per-owner data. The 400 text echoes only the caller's own submitted id, as JSON.
- The early check was therefore the deviation (it was also in HEAD at :319); the patch restores §27.2/AC-9 on the single v2 route. The 403 control (registered CSI, no write, no row created) is still asserted by `creatingOnARegisteredCsiTheCallerMayNotWriteIsForbiddenAndCreatesNoRow`, and that test counts `ui_tests` rows only (see advisory S3).

Ordering vs other endpoints [V]: PUT (`lockForAuthoringWrite`) reads the visible draft, `requireWrite`, then locks, then compares revisions; DELETE (`softDeleteTest(id, auth)`) the same; GET is the deviation (S1 below). POST now matches §27.2.

### 2b. Revision-token message: PASS
`Set.of(...)` (iteration order unspecified) -> `List.of("sourceRevision", "configurationRevision")`; message `<field> must be a positive integer` with the field name taken from a constant, never from the request. [V] Both consumers assert `contains("sourceRevision")` (`OptimisticSaveIT:116`, `StudioAuthorizationIT:927`), and a body missing both always names `sourceRevision`. No other user of the old text (grep of `src/main`, `src/test`, frontend). Still a 400 before any state read, so the "malformed save rejected before authorization" ordering is unchanged and reveals nothing.

### 2c. The 3 obsolete-test removals: PASS
- `ExecutionSnapshotMapperTest.legacyStatusesAreReadThroughTheCanonicalVocabulary` [V]: `toSnapshot` reads `execution.getStatus()` and `getErrorCode()` directly; V13 `ck_ui_test_executions_status` allows only PENDING/RUNNING/PASSED/FAILED/ERROR (V13:203-204), so COMPLETED/TIMEOUT cannot be stored; `LegacyStudioAdapter` has no references in `src/main` or `src/test`. The oracle is a deleted v1 behaviour; the sibling `aLegacyRowExposesNullRevisionAndUnknownRuntime` stays. The Javadoc rewrite and the one-line `errorCode` join are accurate.
- `StudioServiceWriteAuthorizationTest` (c) `theInternalSaveNeverTouchesThePersistenceContext` and `theInternalSaveStillReportsAnUnknownTest` [V]: there is no no-auth `updateTest(id, request)` overload any more (only `softDeleteTest(UUID)` remains as an internal overload, and its (c) case stays). The fixture used instead passes an admin `Authentication`, so the visible read and flush/refresh path runs and the test would assert something else. The authorized-path equivalents ((a), (b), AC-8 step 3, flush-then-refresh) are intact. The `verifyNoInteractions` import is removed and is otherwise unused [V].
- Count delta to record as `DROPPED_BY_NAME`: ExecutionSnapshotMapperTest -1, StudioServiceWriteAuthorizationTest -2.

### 2d. Other hunks (not asked, read anyway)
- `nameOnlySaveBody` (StudioAuthorizationIT): sound; carries stored steps, global context and variables with current revisions so the "control" save is name-only. [I] expected result [1,1]; not run.
- `StudioVisibilityIT.seedTest` calling `CanonicalAuthoringFixture.seed`: matches `StudioExecutionFixtures.seedTest`; fine (format: R2).
- `StudioWriteValidationControllerTest` caps hunk: held (R3).

### Security advisories on code the patch leaves alone (none blocks this patch)
- **S1 (pre-existing, GET).** `readAuthoringDraft` takes `findByIdForUpdate` (a row write lock) **before** `requireRead`. Against ADR-002 §27.2 ("authorization before anything that depends on the stored row"; PUT/DELETE read visibly, authorize, then lock) this lets any authenticated caller take a write lock on a draft it cannot read (brief lock, no data returned; a contention/timing difference between an existing and absent id while a writer holds the row is the only signal). [V by code] Suggest @architect rules whether GET should read through `findById`, authorize, then (only if a lock is truly needed) lock. Triage BC flagged the same lock-on-read as "not decided".
- **S2 (dead branch).** `lockForAuthoringWrite` keeps `auth != null` guards (:460, :465) but `requireWrite(auth, ...)` at :469 is unconditional. With a null `auth` it would take the row lock before denying. No caller passes null (the controller always has an `Authentication`, and the no-auth overloads were deleted) [V by grep], so it is dead code in a security-sensitive function; remove it in the 015 sweep.
- **S3 (test hardening, optional).** Add an assertion to the denied-create IT that no `users` mirror row or other row appears for the denied caller, to pin "authorization before `ensureMirrored`". The current test counts `ui_tests` only.

## 3. Cluster B/C patch: PASS
Patch sha256 `fe2b005d...`; applies after E on the scratch copy [V].

- **C (`@Transactional` on `findAuthoringV2ById`).** [V] `StudioService` is `@Transactional(readOnly = true)` at class level (:53); `findAuthoringV2ById` (:339) is un-annotated and calls `this.readAuthoringDraft`, whose `@Transactional` read-write is bypassed by self-invocation, so `findByIdForUpdate` runs in a read-only transaction (SQLState 25006, as in the XML). The method-level `@Transactional` makes the entry point read-write. I checked the other un-annotated public methods of `StudioService`: no other one calls `readAuthoringDraft` or `findByIdForUpdate` (`createAuthoringDraft`, `updateAuthoringDraft`, `saveAuthoring`, `softDeleteTest`, `applyLastRunProjection` are annotated). `StudioController` reaches `readAuthoringDraft` through the proxy, so the HTTP path was never affected.
  - Caveat [I]: the fix does not help a caller that is already inside an outer read-only transaction (propagation REQUIRED joins it). No production caller exists (`findAuthoringV2ById` has no `src/main` caller), only tests, so there is no current exposure.
  - It extends S1 to this method only in a technical sense; since nothing in production calls it, consider deleting the method under the single-path rule instead of annotating it. Not required.
- **B (target `latest`).** [V] The three classes called the head fixture on a V18-targeted database while `GuidedPublicationEvidenceFixture.requireV18` and the V19 policy tables conflict by design (V19, V20, V21 exist); `Flyway.target("latest")` is valid and `flyway(String)`/`migrate(String)` pass the string straight to `.target(...)`. No assertion is changed; comments change "V18 head" to "current head". For `StudioAuthoringMigrationIT` and `RevisionMigrationIT`, the earlier staged targets (11, 12, 16) still exercise the upgrade path before the head step. Residual risk, as Dex notes: a head-only failure inside these three classes cannot be excluded without a run [I]. Verify with `--tests` on the three classes.

## 4. What I did not do
No Gradle, JUnit, vitest, or Chromium; no spotless/checkstyle/spotbugs; no CodeRabbit; I did not rerun any collector run. I did not review the 127-failure triage clusters A and D, nor the 28 failing classes outside E and BC. I did not re-audit `GuidedPublicationReplayIT` beyond the hash check (it is covered by the earlier w5 acks). Before-hashes are accepted as recorded.
