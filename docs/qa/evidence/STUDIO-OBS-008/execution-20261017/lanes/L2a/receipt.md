# STUDIO-OBS-008 L2a receipt (W2: v2 authoring migration, MSW seam owner, A1 types and MSW)

Agent: Dex (aiox-dev), 2026-10-17, YOLO. Frontend lane: node v23.10.0, pnpm 10.33.0, vitest 1.6.1 with `--minWorkers=1 --maxWorkers=2`. No `pnpm install`, no git write, no story edit, no PID signal.

## Result in one paragraph
Part 1 (v2 authoring, V2 a-g) and part 2 (A1 types, fixtures, scripted scenarios, MSW, enum parity, negative fixture) are both written. `type-check` exit 0. ESLint on the 23 changed files: 0 errors, 73 warnings (per-file baseline unchanged except `CreateCheckPage.tsx` 62 -> 61; the three new or rebuilt files have 0). **Update after root's decisions:** the wide verify run is now 32 files, 468 tests: 463 pass, 5 fail, exactly the expected R4 (2) and legacy-fixture (3) reds (`logs/final2-summary.txt`). The seven escalation reds and the `replayFailure: null` finding are closed (section "Root decisions"). The earlier run (456/12) is kept in `logs/final-summary.txt`. `grep legacyStudioAuthoringAdapter|AUTHORING_V2_REQUIRED|LEGACY_AUTHORING frontend/src` = 0. M12 `grep -i legacy frontend/src` = 33 hits, all classed ALLOWED, 0 `LEFTOVER-OBS-008`.

## Exit status
**EXIT with 1 open root item** (F1: the 5 expected reds). The three items below were the state before root's decisions; items 2 and 3 are now closed:
1. Three tests are red until L0-F1 deletes the two shared fixture cases (`legacy-empty-context`, `mixed-legacy-v2-steps`). They are red by design of the plan ("co-land V2-b deletions with L0-F1"). A post-F1 simulation is green (see "Verification").
2. Seven escalation tests (not in my writes) went red because L0's capability response `$ref` points to another file (finding F-1).
3. Finding F-2: the `ReplayFailure` schema refuses `replayFailure: null` under this harness although its description says null is valid.

## Files, sha256 (after)
| File | sha256 | Change |
|---|---|---|
| `frontend/src/services/api/studioAuthoringTransport.ts` | `63bb2e045f25bb44ff7d636956697dfc311c3ce8d236af4f4ad9d65144fa97b5` | one v2 signature each for `getTest`, `createTest`, `updateTest` |
| `frontend/src/services/api/studioAuthoringTransport.test.ts` | `8b25f924a9a1188259eb53e41afb2045bc9bf757d49e15ac96bca32fc5c922e6` | legacy GET case replaced by a stable-ID fixture read |
| `frontend/src/types/studio/legacyStudioAuthoringAdapter.ts` | **deleted** (sha256 before `cdc65b5558411b36d2155f2fa8815e471ea367e556b42c5477e3e60efc9a4103`) | `rm`, no shim |
| `frontend/src/types/studio/legacyStudioAuthoringAdapter.test.ts` | **deleted** (sha256 before `21895140e8f0dd689c6e8f8fc836780e1fbc4f1acbdcc7522a31c155cc2b949f`) | `rm`, no shim |
| `frontend/src/types/studio/studioAuthoringValidation.ts` | `5eb8eb86c65c9760839e1fd6feaf07d4f2b09c037635829881ca575ec6968ae5` | **new**: the v2 validator moved out of the adapter (g3); v1 arms removed |
| `frontend/src/types/studio/studioContextContract.test.ts` | `fc3b7dc81564deec54c1594215f51770425cda687e452b3cfcc87dc7e5948ef1` | legacy cases deleted; imports the new module |
| `frontend/src/types/studio/studioTypes.ts` | `8f877ce4ad097566042211faada30e1c726319745edb45c30b33c7c31cf327d2` | v1 types deleted, v2 `TestRequest`, `TestDetailDto`, A1 types |
| `frontend/src/services/mocks/studio/handlers.ts` | `0c25c4daed2edd2ea5ba12fddefe19a749f455cb2fb87faebe616b5d66ad802b` | GET/POST/PUT `/tests` routes removed (g1); A1 snapshots in `allExecutions()` |
| `frontend/src/services/mocks/studio/authoringHandlers.ts` | `30bcb60bd25c7f8ad707b7b3fefd5406514549defe0cd91dcb9093482c36f8cb` | sole owner of the three routes; v1 refused |
| `frontend/src/services/mocks/studio/authoringHandlers.test.ts` | `85808e7a628765f436de9d1fa68b65f53e088009efbd1298f3880f9ab8f78215` | 7 new V2-d/g1 tests |
| `frontend/src/services/mocks/studio/authoringState.ts` | `5d6c9c4185469307083c074c955fbb2b74238e3ed02362e0da471c4e253fcd77` | fixture step IDs, always-detail projection |
| `frontend/src/services/mocks/studio/studioContract.test.ts` | `5e49b2240501738fe9e02abd670960314de0e1a37d77d13e1e67e80fee5cc05e` | g2 block (4 tests), A1 block (7 tests, null case added after L0 landed) |
| `frontend/src/services/mocks/studio/studioEscalation.test.ts` | `d9765401e47519a0549020a30fa8654b83478b432b904deeede9bd0e342fefa8` | resolver follows cross-file refs (root decision 1) |
| `frontend/src/services/mocks/studio/confirmedRevisionEscalation.test.ts` | `02afae95abfb1166e5a23aa226fe4f24296753d33566de668936d3081821a3b4` | same resolver change |
| `frontend/src/services/mocks/studio/studioHandlers.test.ts` | `f5db5c7b27199f1217e00b70cf9900407bf70c2788d6a2eca613844c983f8d5c` | converted to v2 bodies |
| `frontend/src/services/mocks/studio/executionFixtures.ts` | `a9a69867be0aab7115fa7f8c61d02fcf30db4b77ddfcdc6b0e3c183b7c57f8d7` | three A1 snapshots, added to `executionCorpus` |
| `frontend/src/services/mocks/studio/executionScenarios.ts` | `24892cde107817f7785b7154e8d32ba10147ae520141f473d79e0deab40e197e` | `REPLAY_FAILURE_SCENARIOS`, frames added to `ALL_SCENARIO_FRAMES` |
| `frontend/src/components/studio/tests/CreateTestDialog.tsx` | `2dd650505be451c7452c63df4b2a7ec9ce4f9102f1c18115c05376aec885aa22` | posts the v2 body |
| `frontend/src/components/studio/scheduling/StudioScheduleDialog.tsx` | `1791c296479f93f593083be2b8f00717d53c20d193cf14af2a891a9e3c49bda9` | reader type (`TestDraftHeader`) |
| `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx` | `7626effb26bd0ca756d86f102902306fe4ccea076266366a40d4f73946c32dde` | typed reader of `TestDetailDto.variables` |
| `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` | `87f141b5edd473efb814334d30aff880195966c64b6b0cd6e44e548f93ad13a0` | **baton**: v2 step model only |
| `frontend/src/pages/ChecksStudioPage/pageAuthoringUx.test.tsx` | `1911d4b7b30fd9bc98d0e26c58a04f9f3094971ce3474e0fcaa3ab4d63aa10c7` | **baton**: v2 only (+3 item-a tests) |
| `frontend/src/pages/ChecksStudioPage/pageEvidence.test.tsx` | `8b6608a016b218d3807dc3c9f3f0d0f6e81da7e0b91d81cba0368017603e0f6b` | **baton**: v2 only |
| `frontend/src/pages/ChecksStudioPage/pageRunGate.test.tsx` | `410f59c550b6fdf90d31cc8b237e985bdd4a124f92145701cc0f9621eb0968d6` | **baton**: v2 only |
| `frontend/src/pages/ChecksStudioPage/pageSaveAndStop.test.tsx` | `fa4f9328dace36a1c327896238f71f4ef0cdb6fc7552e8c37638bc687c6c74d6` | **baton**: v2 only |
| `frontend/src/pages/ChecksStudioPage/pageStepTimeout.test.tsx` | `7a2eb144c2d7607c66853b4d3157ec74b454447502d7cbdfb0941fef6f1faf8e` | **baton**: v2 only |
| `frontend/src/components/studio/run/useRunGate.ts` | `bdde9513f7fe49d569ddf11f19ffc97aefb428495cd439d5bbcc33a84990d72e` | **baton**: reader type only |

Not changed (in my list, not needed): `studioApi.ts` (never listed), `server.ts`, `fixtures.ts`, `readinessFixtures.ts`, `executionFixtureMatrix.test.ts`, `executionScenarioMatrix.test.ts`, `StudioScheduleDialog.test.tsx` (passes unchanged: 15/15).

## Baton files handed to L5b at F1
`ChecksStudioPage.tsx` (`87f141b5...`), `ChecksStudioPage/*.test.tsx` (five files above), `useRunGate.ts` (`bdde9513...`). What L5b inherits in the page: `testSteps: AuthoringStep[]`; `draft: TestDetailDto` (the only source of step IDs, `globalContext` and revisions); `scenarios: TestDraftHeader[]` (list projection); `newAuthoringStep(text)` mints IDs; `stepsKey` compares id+text. `STUDIO_CAPABILITIES`, the counter copy at the old `:1174`, and the run affordance are untouched.

## V2 a-g evidence map
| Item | Where | Test (all green) |
|---|---|---|
| a. stable IDs | `ChecksStudioPage.tsx`: `newAuthoringStep`, edit `{...step, text}`, reorder moves objects, delete filters, template mints, `key={step.id}`; `CreateTestDialog.tsx` posts `authoringSchemaVersion: 2, steps: []` | `pageAuthoringUx.test.tsx` "item a" x3: edit+reorder+delete keep the served IDs and drop the deleted one, insert mints a UUID, template mints new IDs, `globalContext` is handed back |
| b. one signature | `studioAuthoringTransport.ts`; adapter and its test deleted; `studioContextContract.test.ts` legacy cases deleted; `studioAuthoringTransport.test.ts` legacy case deleted | `studioAuthoringTransport.test.ts` 3/3; `studioContextContract.test.ts` "refuses string steps and a missing schema version as an invalid shape" |
| c. readers | `useRunGate.ts` (`TestDetailDto`), `StudioScheduleDialog.tsx` (`TestDraftHeader`), `ChecksStudioPage.tsx` (detail via `getTest`), `CreateCheckPage.tsx` (typed `variables`) | `tsc` clean; `StudioScheduleDialog.test.tsx` 15/15; page tests |
| d. MSW | `authoringHandlers.ts` (no `AUTHORING_V2_REQUIRED`/`LEGACY_AUTHORING`), `authoringState.ts` (fixture step IDs) | `authoringHandlers.test.ts` "inherited item d / g1" x7: v1 create (strings), version-less object steps, strings under v2, v1 save of a fixture draft (read back equal), reads, 403, ID-based source change |
| e. fixtures | not mine: L0-F1 deletes `legacy-empty-context` and `mixed-legacy-v2-steps` | **open**: 3 red tests until then; post-F1 simulation `logs/post-f1-simulation.out`: 6 valid + 8 invalid names equal my enumeration, 0 defects |
| f. M12 | below | `logs/m12-frontend-legacy.txt` |
| g1 | `handlers.ts`: GET/POST/PUT `/tests` removed; `authoringHandlers.ts` answers `TestDetailDto` for every read | `studioContract.test.ts` g2 "getTest answers every fixture and readiness draft as the declared detail shape" |
| g2 | `studioContract.test.ts` "item g2" x4 (schema read from the operation `$ref`; payloads are the shared valid cases) | create 201, read 200, save 200, v1 400 `ErrorResponse` and "the contract must not admit a v1 body" |
| g3 | `studioTypes.ts`: `LegacyAuthoringRequest`, `StudioAuthoring` deleted; `:111` comment corrected; validator moved to `studioAuthoringValidation.ts` | M12 shows 0 `LEFTOVER-OBS-008` rows |

## M12 (`grep -rn -i "legacy" frontend/src`)
33 hits (before this lane: 44 `LEFTOVER-OBS-008` + 33 ALLOWED frontend rows). The 33 now are exactly the 33 ALLOWED rows of `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/dev-bookkeeping01/m12-grep.txt`, with line numbers shifted in `studioTypes.ts` (382/400 -> 403/421) and `studioContract.test.ts` (809/815/852 -> 931/937/974). Classes: service-worker retirement helper (`index.tsx`, `main.tsx`, `retireLegacyStudioWorker.ts`: 10), historical-data truth (`studioTypes.ts` x2, `fixtures.ts`, `studioContract.test.ts` x5: 8), retired legacy player/IR rationale comments (`ChecksStudioPage.tsx` x2, `pageEvidence.test.tsx`, `pageRunGate.test.tsx` x2, `studioContract.test.ts` x3, `studioVideoUrl.test.tsx`: 9), unrelated subsystem (`studioScheduling.ts`, `scheduleProvenance.test.tsx` x2, `StudioListLayout.tsx`, `ReportDetailsPage.tsx`: 5), negative-control title (`runGate.test.tsx`: 1). **0 LEFTOVER-OBS-008.** Forbidden symbols grep: 0 hits. `backend` and `studio-runner` greps are root's.

## A1 status: DONE
L0 receipt present with status `EXIT_WITH_OPEN_ROOT_ITEMS`, not literally GREEN. [AUTO-DECISION] proceed: its open items (`check-studio-observed-contracts.cjs:963`, two `ExecutionVideoContractTest` pins) do not touch `ReplayFailure`, and L0 had exited, so `openapi.yaml` sha256 `c377e480...` is final. Shape taken from that file (`components.schemas.ReplayFailure`, three `Snapshot*` examples).
- `studioTypes.ts`: `REPLAY_FAILURE_CODES`, `ReplayFailureCode`, `ReplayFailure` (discriminated union), `ExecutionSnapshot.replayFailure?: ReplayFailure | null`, a compile-time `AssertTrue` that the union's codes are the carrier.
- `executionFixtures.ts`: three snapshots, field for field the document's examples; in `executionCorpus` (existing "validates" and "no undeclared field" tests cover them).
- `executionScenarios.ts`: `REPLAY_FAILURE_SCENARIOS` (pending, running, terminal = the fixture) and frames added to `ALL_SCENARIO_FRAMES`.
- `handlers.ts`: `GET /executions/{id}` and the history list serve the three.
- `studioContract.test.ts` "STUDIO-OBS-008 A1" x7: enum parity both ways (read from the document), property declared and not required, fixtures `toEqual` the examples and are referenced by `getExecution`, coverage of both codes and both `loginStepsPresent` values, absent accepted, **negative fixture** (`TARGET_DRIFT` + `loginStepsPresent` refused; also `LOGIN_REQUIRED` without it, unknown code, negative index, extra field), scripted runs, handler-served bodies.
- Not added: matrix entries. `EXECUTION_SCENARIO_MATRIX` entries must be named by `it(` titles in three `*.node.test.*` files outside my list, and `EXECUTION_FIXTURE_MATRIX` ids are pinned both ways in `studioContract.test.ts` by vocabulary; the three snapshots are covered by the corpus harness instead.

## Verification (what I ran and what it returned)
| Command (from `frontend/`) | Result |
|---|---|
| baseline, before any edit: `pnpm exec vitest run <verify set + StudioTestsPage + run> --minWorkers=1 --maxWorkers=2` | 27 files, 360 tests: 351 pass, 9 fail. The 9 are 2 x R4 (`studioContract` AC-3) and 7 escalation tests (F-1). `logs/baseline-summary.txt` |
| final: `pnpm exec vitest run src/services/api/studioAuthoringTransport.test.ts src/types/studio src/services/mocks/studio src/components/studio/scheduling src/pages/ChecksStudioPage src/pages/StudioTestsPage src/pages/StudioRunsPage src/components/studio/run src/components/studio/tests src/components/studio/runs src/components/studio/evidence src/components/checks --minWorkers=1 --maxWorkers=2` | 32 files, 468 tests: **456 pass, 12 fail**. `logs/final-summary.txt` (the lane's own verify command is a subset) |
| `pnpm run type-check` | exit 0 (`logs/type-check.log`) |
| `pnpm exec eslint <23 changed files>` | 0 errors, 73 warnings (pre-existing `no-explicit-any`; per-file before/after in the section above) |
| `grep -rn "legacyStudioAuthoringAdapter\|AUTHORING_V2_REQUIRED\|LEGACY_AUTHORING" frontend/src` | 0 hits |
| `node --experimental-strip-types logs/post-f1-simulation.mjs` | with the two fixture cases removed, my enumerations equal the file names and the validator accepts/refuses every case as declared: `bad 0` |

Not run: the full 56-file suite, Playwright, any backend or runner command.

### The 12 reds
| Test | Cause | Ledger |
|---|---|---|
| `studioContract.test.ts` AC-3 "no handler for a route that no longer exists..." and "fails closed..." | `getStudioTestCapabilities` has no handler until F1 | **R4**, never allowlisted |
| `studioContextContract.test.ts` "enumerates the required valid and invalid corpus" | shared fixture `legacy-empty-context` still present | **new row L2a-R1**, clears when L0-F1 lands |
| `studioContextContract.test.ts` "rejects invalid fixture 'mixed-legacy-v2-steps'..." | shared fixture case still present; the v2-only validator no longer has a mixed-shape category | **L2a-R1** |
| `authoringHandlers.test.ts` "rejects shared invalid fixture 'mixed-legacy-v2-steps'" | same case; the mock answers `INVALID_AUTHORING` | **L2a-R1** |
| `studioEscalation.test.ts` x3, `confirmedRevisionEscalation.test.ts` x4 | `TypeError ... reading 'studio-observed-authoring'` in `resolveRef`: L0's `getStudioTestCapabilities` 200 schema is `$ref: '../studio-observed-authoring/contracts/v3/public-ui-projections.schema.json#/definitions/StudioCapabilities'` (openapi line 971) and those tests resolve only `#/` refs. They passed in U2's 701-test run, so this is L0-introduced | **not in the ledger** (F-1) |

## Findings for root
- **F-1** (needs an owner): the seven escalation tests above. Neither file is in my writes. They need to follow a cross-file `$ref` (or skip the external one by rule), or L0 needs to inline the capability response schema as the other guided operations do (they are already external, but outside the `tests` tag).
- **F-2** (L0 contract): `ReplayFailure.allOf[0].else` is `{ type: object, properties: { loginStepsPresent: { not: {} } } }`. For `replayFailure: null` the `if` is false, so `else` applies and `type: object` refuses null, although the description says "Null, or absent, means the API names no such cause". Reproduced with this harness's Ajv translation (`logs/replayfailure-null-check.out`). Dropping `type: object` from the `else` branch fixes it. Until then I assert only the absent case, and the L1-A DTO must omit the key rather than emit null (or the schema must change).
- **F-3** (F1 inputs): the class-A allowlist at `studioContract.test.ts` is unchanged (10 entries: 7 guided, `getGuidedSessionVideo`, `listTestSecrets`, `createTestSecret`). The F1 composition, removal and the "never allowlist the capability op" rule remain root's.

## Deviations and [AUTO-DECISION]s
- New file `frontend/src/types/studio/studioAuthoringValidation.ts`: g3 says the v2 validator is "moved, not deleted" to a v2-only module; the lane list names no such file. IDS: REUSE the validator body verbatim, remove the v1 arms (`isLegacyAuthoringRequest`, `adaptLegacyStudioAuthoring`, `parseStudioAuthoring`, the string-step branch, `MIXED_STEP_SHAPES`, the ID factory).
- FE `TestRequest` is redefined as the OpenAPI v2 `TestRequest` rather than deleted (D-9 removes the v1 shape, not the name). `StudioTestsPage.test.tsx`, outside my list, imports the name; no edit was needed there. Added `TestDetailDto` (with `readinessReason`, per the document), `TestDraftHeader`, `TestUpdateRequest`.
- Page: after the list read, `getTest(id)` supplies the editor (the list carries no step IDs), also on route-driven selection. Save uses the draft's own revisions, hands `globalContext` back, and `isDirty` compares step id and text only (the server adds empty `context` objects). `scenarios` is typed `TestDraftHeader[]`.
- `CreateCheckPage.tsx` prefill: the old code tested a `type` field that `StudioVariable` does not have, so secrets fell through to plain. It now tests `kind === 'secretRef'` and yields a secret row; the dead `number`/`boolean` branches are gone. This is a behaviour change, in the direction the existing `UiTestConfig` expects.
- MSW answers now follow the document: unknown or unreadable id on `GET /tests/{id}` is `403 STUDIO_FORBIDDEN` (was `400 BAD_REQUEST`); create on an unreadable CSI is `403` (was `400`).
- The history list now also contains the three A1 snapshots. No test depended on its count.
- Not run, although injected into my prompt as skills: SYNAPSE diagnostics, CodeRabbit (WSL-only), checklist-runner. The mission named none of them; the self-critique and DoD checklists are the lane's gates and map to the verify table above. The story file was not edited, so no checkbox or File List entry was made.
- Scratch files for my probes are under `/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/l2a/`; nothing was written under `docs/specs`, `backend`, `studio-runner`, or L3H's files.

## Root decisions (applied after the first receipt)
1. **Escalation reds: fixed in the tests.** `studioEscalation.test.ts` and `confirmedRevisionEscalation.test.ts` now carry a `RefContext` (document + file). `resolveRef` follows a local ref, a cross-file ref (path relative to the referring file, plus fragment) and an absolute `$id` URL (the v3 schemas reference each other that way; mapped to files through their own `$id`). Refs inside a loaded file resolve against that file; documents are cached so the `seen` cycle guard compares the same objects. 7/7 green.
2. **Semantics checked, unchanged.** `logs/escalation-semantics.cjs` (output `logs/escalation-semantics.out`) computes the readable set with and without `getStudioTestCapabilities`. Newly reachable property names: `applicationId`, `available`, `code`, `contract`, `environmentId`, `guidedStart`, `schemaVersion`, `vaultSecrets`, `versions` (size 86 -> 95). Revision identifiers (`confirmedRevisionId`), qualified hashes (`confirmedRevisionArtifactHash`) and qualified artifacts (`confirmedRevisionArtifact`) are identical before and after. Of the 13 required request fields on `tests` operations, none is reachable only because of the capability op, and none is unobtainable. No assertion changes meaning.
3. **ReplayFailure null.** L0 landed (openapi now `2f4041ae`); `replayFailure: null` validates (`logs/replayfailure-null-check.out` is the pre-fix evidence). The type is `ReplayFailure | null | undefined`; the A1 test now asserts null as well as absent.
4. The 3 legacy-fixture reds and `studioAuthoringValidation.ts` need no action; they close at F1 and are accepted.

### Reds after the fix (5, all expected)
R4 x2 (`studioContract.test.ts` AC-3) and L2a-R1 x3 (`studioContextContract.test.ts` enumeration and `mixed-legacy-v2-steps`, `authoringHandlers.test.ts` `mixed-legacy-v2-steps`). Type-check exit 0; ESLint 0 errors on the three touched test files (11 pre-existing warnings).

## F1 (frontend composition, allowlist, fixture deletion)
**Status: composition and allowlist DONE; the L0-F1 fixture deletion was NOT made.** Step 3 said to stop if anything outside `frontend` references the two example files. It does (below), so I stopped and edited none of them.

### Files touched, sha256
| File | sha256 |
|---|---|
| `frontend/src/services/mocks/studio/handlers.ts` | `61df7a979249b91424e6841715b4d9832c91a8833ebe87b7aad6d70eea6415ed` |
| `frontend/src/services/mocks/studio/authoringState.ts` | `ff72967d57802a90a76756b4d3268dbcec9b18e45453a28336b86fc5bec2a7d4` |
| `frontend/src/services/mocks/studio/studioContract.test.ts` | `ae4c8bddfceed27a6dd3708b28f217aba55cd9b9cc2bdcdbbc9238b52dab4aa0` |
`server.ts` needed no change. No file was deleted. `docs/specs/studio/examples/context-authoring-valid.json` (`2ae890db47b89a384bd62bc1d9c3c6c76b3e3cdf6623bd4cc536bf8044bfc4b1`) and `context-authoring-invalid.json` (`d301a48606e64f84322a926029dbb2652ef8d1c6a71b2618f9d26d3e170045e3`) are untouched. OpenAPI used: `b5ecdcad4c5e152d0edde5ad14af1a04438f3d9153b04037ef9ce5bc0ae29244`.

### Composition
`handlers.ts` composes `createGuidedHandlers` (with `stepsOf: stepRefsOf`, a new `authoringState.ts` export, so the mirror learns the steps and IDs of the same live draft store the authoring routes write), `createCapabilityHandlers` (same store) and `secretsHandlers`. `resetStudioMocks()` now also resets the guided, capability and secrets mocks. L2b had left the video route unmirrored (its header says so), so `handlers.ts` gets `GET /guided-sessions/:id/video`: the execution video's bytes and range/refusal rules; a session the guided mirror never started answers `403 STUDIO_FORBIDDEN`. Simplification: it does not re-derive `404`/`410` from the scenario's video state. One new contract test covers it (unknown 403, started 200, range 206).

### Final allowlist (`UNCOVERED_PUBLIC_OPERATIONS` in `studioContract.test.ts`)
- **Class A: empty.** The ten removed: `startGuidedSession`, `readGuidedSession`, `readGuidedResult`, `readGuidedClarification`, `clarifyGuidedSession`, `cancelGuidedSession`, `finalizeObservedPublication`, `getGuidedSessionVideo`, `listTestSecrets`, `createTestSecret`.
- Class B: `streamExecution`.
- Class C: `lookupGuidedPolicy`, `createGuidedPolicy`, `readGuidedPolicy`, `createGuidedPolicyVersion`, `approveGuidedPolicyVersion`.
- `getStudioTestCapabilities` is covered by a real handler and was never allowlisted. **R4 is closed.**

### Fixture deletion: stopped. Grep results (whole repo, excluding `node_modules`, `.git`, build output, evidence logs)
Outside `frontend`:
- `backend/src/test/java/com/citi/put/checks/studio/StudioAuthoringApiIT.java`: `:61`, `:90`, `:235` read both files; `:138` builds its v1-refusal body from `validLegacy()`, and `:243-248` define `validLegacy()` / `validExpectedLegacy()` as `fixtures("context-authoring-valid.json").get(0).path("legacy" | "expected")`. Deleting the `legacy-empty-context` case (index 0) breaks `:138`; deleting the file breaks all of them.
- `backend/src/test/java/com/citi/put/checks/studio/contract/StudioContextContractTest.java`: `:58`, `:155`, `:241` read both files (`:60` tolerates a missing `legacy` case, so removing only the case may be safe there).
- Prose only: `docs/stories/10.36.story.md`, `10.39.story.md`, `STUDIO-OBS-008.story.md`, `STUDIO-OBS-015.story.md`.
No reference in `docs/specs` (including `openapi.yaml`), `studio-runner/src`, `studio-runner/test`, `tools/`, `.github`, `docs/architecture`, `docs/runbooks`. Inside `frontend`: `studioContextContract.test.ts`, `studioContract.test.ts`, `authoringHandlers.test.ts`, `studioAuthoringTransport.test.ts` (all already written for the post-deletion corpus).
**Decision needed from root:** delete only the two cases (and who updates `StudioAuthoringApiIT:138/243-248` to a literal v1 body), or leave the cases in and have the frontend tests tolerate them (I would not: that re-adds a compat layer). My enumerations already equal the post-deletion corpus (`logs/post-f1-simulation.out`).

### Verification
| Command | Result |
|---|---|
| wide L2a row (same file set as before) `--minWorkers=1 --maxWorkers=2` | 34 files, 548 tests: **545 pass, 3 fail**; the 3 are the legacy-fixture reds (enumeration, `mixed-legacy-v2-steps` x2). R4 closed. `logs/f1-wide-summary.txt` |
| `vitest run src/services/mocks/studio src/services/api src/components/studio/guided src/components/studio/references` | 22 files, 673 tests: 672 pass, 1 fail (`authoringHandlers` `mixed-legacy-v2-steps`). `logs/f1-narrow-summary.txt` |
| `pnpm run type-check` | exit 0 |
| eslint on the three changed files | 0 errors; 1 pre-existing warning |
| N24 `node tools/check-studio-observed-contracts.cjs` | 7 sections PASS, 44 operations. Run **without** the deletion, so it shows the checker is independent of the examples (`tools/` does not reference them), not that deleting them is safe for the backend |
| `studioWcagAudit.test.tsx` | not run, as instructed |
