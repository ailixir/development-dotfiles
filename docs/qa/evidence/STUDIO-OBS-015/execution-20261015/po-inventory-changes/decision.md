# Scoped frontend exception and test-inventory name changes

Recorded by Pax (@po) on 2026-10-16. The machine record is `decision.json` in this folder. It holds the source hashes and the before/after story hashes.

**What I ran:** `shasum`, `git apply --check -R -p0` on the frontend `fix.patch`, one `python3 -I` name-set diff over two collector result files, and greps. I did not run Gradle, vitest or any other test. Nothing was committed. No Status changed.

**Sources:**
- Dex-FE `../frontend-contract-diagnosis01/review.md` (`59e09c18…`) and `fix.patch` (`c335b3a2…`).
- Quinn `../backend/fullsuite-fix01/qa-review01/review.md` RC-2 and A7(b) (`d8882f50…`).
- Dex `../backend/fullsuite-triage-D/fix.patch` (`fb9da955…`) and `../backend/fullsuite-triage-E/review.md` rows 6–7 (`482ffaba…`).
- Dex `../backend/fullsuite-fix01/review.md` (`4c27050f…`).

## 1. Scoped frontend exception (STUDIO-OBS-015)

**Conflict.** Story 015 O-1 b says "This story does not edit `frontend/src`", and the File List says "Not owned here: `frontend/src/**`". 015's own C3a contract broke three frontend contract tests:
- ruling1 makes `getTest`'s 200 answer `TestDetailDto`;
- `Variable.secretId` gains a Vault-name `pattern`.

**Evidence (Dex-FE, not re-run by me).** The same test file passes 69/69 against the 012B-final `openapi.yaml` (`afec6c04…`). It fails 3 against `54fd12cd…` and against the current `c053a7f7…`. I verified that the live `openapi.yaml` is `c053a7f7…`.

**Exception: four files, test and mock only.**

| File | Change |
|---|---|
| `frontend/src/services/mocks/studio/fixtures.ts:72` | `secretId: 'LOGIN_PW'` |
| `frontend/src/services/mocks/studio/readinessFixtures.ts:37` | `secretId: 'LOGIN_PW'` |
| `frontend/src/pages/ChecksStudioPage/pageSaveAndStop.test.tsx:265` | dependent expected value |
| `frontend/src/services/mocks/studio/studioContract.test.ts` | the `getTest` example test reads the schema from the operation `$ref`; the test is renamed |

Outside the exception: product UI, transport, types, adapters, MSW handlers and the OpenAPI. No assertion is weakened.

**Verified by me.** `git apply --check -R -p0 fix.patch` returns OK at the repo root, so the patch is applied in the working tree. The live file hashes are in `decision.json`.

**Not verified.** No frontend run exists on the live tree. Dex-FE's 701/701 ran on a scratchpad copy. Required before the gate:
- the full frontend vitest suite: 56 files and 701 tests, 0 failed;
- `studioContract.test.ts` 69/69;
- `type-check` exit 0;
- `lint` 0 errors.

## 2. What stays with OBS-008

| Item | Already in OBS-008? | Action |
|---|---|---|
| v1 overloads in `studioAuthoringTransport.ts:16-30` | Yes, inherited obligation item b | None |
| MSW refuses a v1 body; `LEGACY_AUTHORING`/`AUTHORING_V2_REQUIRED` dropped | Yes, item d (`authoringHandlers.ts`, `authoringState.ts`) | None |
| Base `handlers.ts` v1 routes, served when `authoringSchemaVersion` is absent | **Not explicit** | Placed as item **g1** |
| A test that validates handler responses against the declared schema | **No** (AC-1 checks only that a handler exists) | Placed as item **g2** |

**g1 anchors, verified by me at the working tree.** `authoringHandlers.ts:82` returns `undefined` when there is no version parameter, so the request falls through to `handlers.ts`:
- `GET /tests/:id` at `:388-395` answers a string-step `TestDto`;
- `POST /tests` at `:397` takes a `TestRequest`;
- `PUT /tests/:id` at `:437` takes a `TestRequest`.

OBS-008 also gets a T1 sub-item and Change Log 0.3.8. Its AC text, File List (`handlers.ts` and `studioContract.test.ts` are already listed) and Status (**Ready**) are unchanged.

## 3. Backend `test` inventory name changes (RC-2)

**Verified by me.** I diffed the names in `../execution/final-w02-full-test04-results.json` (2412) against `../execution/fix01-full-test02-results.json` (2411): 5 names out and 4 in.

| Class | Kind | Old name | New name / reason |
|---|---|---|---|
| `ExecutionSnapshotMapperTest` | DROPPED_BY_NAME | `legacyStatusesAreReadThroughTheCanonicalVocabulary` | Ruling1b: normalisation deleted; V13 `ck_ui_test_executions_status` (V13:203-204) cannot store COMPLETED/TIMEOUT. Same oracle as the dropped `LegacyStudioAdapterTest.legacyOutcomesMapOntoTheCanonicalVocabulary` |
| `StudioServiceWriteAuthorizationTest` | DROPPED_BY_NAME | `theInternalSaveNeverTouchesThePersistenceContext` ("(c) the internal save touches the persistence context not at all") | Oracle was the no-auth internal `updateTest`, deleted with the v1 entry points (ruling1). The port passes an admin `Authentication`, so the assertion cannot hold. The internal-delete (c) case stays |
| `StudioServiceWriteAuthorizationTest` | DROPPED_BY_NAME | `theInternalSaveStillReportsAnUnknownTest` ("(c) internal save, empty locked read: still 'UI Test not found', no visible read") | Same reason |
| `dispatch.AcceptanceIT` | RENAMED_BY_NAME | `anEditedDraftWhoseConfirmationNoLongerMatchesIsCompileRequired` | `anEditedDraftWhoseConfirmationNoLongerMatchesIsLearnRequired`; real edit instead of a counter-only bump (R-2); `LEARN_REQUIRED` assertion unchanged |
| `guided.translation.GuidedSourceClassifierTest` | RENAMED_BY_NAME | `canonicalWhitespaceAndVaultIdMatchingRemainOpaqueWithNameFallbackAndConflictChecks` | `canonicalWhitespaceAndVaultIdMatchingRemainOpaqueAndTheNameFallbackIsRetired`; R-1 retires the name fallback; codec refusal and 422 ambiguity asserted |
| `dispatch.AcceptanceIT` | ADDED | — | `aCounterOnlyBumpWithIdenticalSemanticContentStaysReady` (R-2) |
| `validation.VariableReferenceValidatorTest` | ADDED | — | `anIntentionalEmptyOrWhitespaceValueIsAnExactValueNotAMissingOne` (triage D) |
| `StudioServiceWriteAuthorizationTest` | ADDED (after full-test02) | — | `theAuthoringReadAuthorizesBeforeAnyRowLock` ("(d) findAuthoringV2ById refuses a caller who may not read it, and locks nothing"), TF-1 |

**Arithmetic.** 2412 − 5 + 4 = 2411 in full-test02. Adding TF-1 (d) gives 2412 for the next full run, which matches the RC-1 expectation. Only full-test02 and its rename pairs are verified by name; the TF-1 name comes from the source (`:219-220`).

## 4. Frontend renamed test

In `studioContract.test.ts`, describe block "story 10.11c: ADR-002 §21's two properties, and the examples that carry them":
- RENAMED_BY_NAME: "every getTest example validates against the amended TestDto" → "every getTest example validates against the schema getTest's 200 declares".
- Counts are unchanged: 69 in the file and 701 in the suite (Dex-FE).

## 5. Bridge disclosure

This is already recorded in the 015 Dev Agent Record (PO paragraph, 38 → 9 + 16 + 13) and in `../po-bridge-disclosure/`. It is cross-referenced here and not repeated.

## Auto-decisions

- [AUTO-DECISION] Does OBS-008 already cover the remaining frontend work? → Partly. b and d cover the transport overloads and v1 write refusal. The `handlers.ts` fallthrough and the handler-response schema test are not explicit, so they were added as item g. Reason: leaving them implicit risks them being dropped.
- [AUTO-DECISION] Where in 015 does this go? → A PO block after the triage follow-ups block, plus Change Log 0.1.11. Reason: this matches the earlier PO records, and Dev Agent Record/File List are @dev's.
- [AUTO-DECISION] Is a live-tree frontend run required? → Yes. Reason: the only green run is on a scratchpad copy.

## Flags for the lead

1. **@dev:** add the four frontend files to the 015 File List with the exception tag.
2. **@architect (from Dex-FE observation 3, not placed by me):**
   - ADR-002 §13 has no row for `TestDetailDto` or the `secretId` pattern.
   - §16.7 still lists "a second draft schema (`TestDetailDto`)" as a rejected alternative.
   - This is a documentation gap, not a gate blocker.
3. **@qa:** carry the exception, the 3 + 2 + 3 backend inventory and the 1 frontend rename into the gate record. This closes Quinn RC-2 (documentation) and A7(b) (Pax disposition of the red frontend lane). RC-1, a full run on the final tree, stays open.

## Addendum A1 (2026-10-16): fifth exception file and the M12 frontend leftovers

This addendum adds to the record above and does not rewrite it. The table in section 1 lists four files; this addendum extends the exception to **five**.

**What I ran:** `git diff HEAD -- frontend/src/pages/ChecksStudioPage/saveErrorMessage.test.ts` (read-only), `shasum -a 256`, and `grep` (over `backend/src/main` for `chrome`, and over `frontend/src` for adapter importers). I ran no test, type-check or lint.

**Sources:**
- Aria `../backend/aria-cap-ruling01/ruling.md` (`095edf86…`), item F1.
- Dex `../dev-bookkeeping01/file-list.json` (`c72353e2…`) and `../dev-bookkeeping01/m12-grep.txt` (`a5bfc0c0…`).

### A1.1 Fifth file

| File | Change | Authority |
|---|---|---|
| `frontend/src/pages/ChecksStudioPage/saveErrorMessage.test.ts:13-16` | `SOURCE_LINE_TOO_LONG` fixture message: "Step 3 is longer than 1024 characters. Shorten it." → "Step 2 is 501 characters long; the maximum is 500. Shorten it or split it into two steps." | Cap ruling F1 (the text matches ruling B2) |

**Verified by me:**
- The diff is 1 file, +4/−1, in one hunk inside the `it.each` table.
- The test name, the assertions and the row count are unchanged.
- `saveErrorMessage.ts` is not in the diff.
- It is test-only. There is no product UI, transport, type, adapter, handler or OpenAPI change.
- Live sha256 is `4ee9d4a2…`.

Dex's "AMBIGUOUS" flag is resolved as in scope, with no revert. The live-tree frontend run required before the gate (section 1) now covers this file as well. My inference, not run: the counts stay at 56 files and 701 tests.

### A1.2 M12 frontend leftovers (44 `LEFTOVER-OBS-008` rows)

| File | Rows | OBS-008 item |
|---|---|---|
| `types/studio/legacyStudioAuthoringAdapter.ts` | 12 | b (delete), with g3 (move the v2 validator out first) |
| `types/studio/legacyStudioAuthoringAdapter.test.ts` | 10 | b |
| `types/studio/studioContextContract.test.ts` | 10 | b |
| `services/api/studioAuthoringTransport.test.ts` | 7 | b |
| `services/mocks/studio/authoringHandlers.ts:87` | 1 | d |
| `services/mocks/studio/authoringState.ts:2` | 1 | d, with g3 (import re-homed) |
| `types/studio/studioTypes.ts:111,:135,:290` | 3 | **Previously only item f's catch-all; now g3** |

**Gap found and placed.** Two things were not named in OBS-008's items:
- **`studioTypes.ts`.** `LegacyAuthoringRequest` and the `StudioAuthoring` union were not named; D-9 names only `TestRequest`. The `:111` comment "Legacy `chrome` is normalized server-side" is also stale: my grep of `backend/src/main` finds `chrome` only in migrations V1 and V12, and no request-time normalisation.
- **The v2 validator.** Item b deletes the adapter file, which also exports the v2 validator that MSW `authoringState.ts` and `studioContextContract.test.ts` import.

Placement: OBS-008 inherited obligation item **g3**, plus a T1 sub-item and Change Log 0.3.10. This was append-only. AC text, File List and Status (**Ready**) are unchanged. None of the 44 rows is in 015's scope.

### A1.3 Story edits

| Story | sha256 before | sha256 after | Edits |
|---|---|---|---|
| 015 | `6091d66a…` | `1942f945…` | "PO addendum A1" block after the PO record; Change Log 0.1.13 |
| 008 | `4b6c2c48…` | `a35e1466…` | item g3 after g2; T1 sub-item; Change Log 0.3.10 |

### Auto-decisions (A1)

- [AUTO-DECISION] Should `saveErrorMessage.test.ts` be acknowledged or reverted? → Acknowledge. Reason: the cap ruling F1 places it in 015, the diff only changes fixture data, and a revert would leave the test asserting a false 1024 message.
- [AUTO-DECISION] Does item f's catch-all count as coverage of the 3 `studioTypes.ts` rows? → No, so g3 names them. Reason: the same reason as item g; leaving them implicit risks them being dropped. The adapter-file deletion also needed a "move, not delete" note for the v2 validator.

### Flags for the lead

1. **@dev:** move `saveErrorMessage.test.ts` from "Flagged, not resolved" to the scoped-exception line of the 015 File List.
2. **@qa:** carry the five-file exception into the gate record.
