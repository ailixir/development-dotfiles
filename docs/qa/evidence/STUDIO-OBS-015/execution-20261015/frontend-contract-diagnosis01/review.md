# STUDIO-OBS-015 frontend-contract-diagnosis01 (Dex-FE, @dev, diagnosis)

2026-10-16. "Verified" = a command I ran. "Inferred" = reasoned, not run. No source file under `frontend/`, `backend/`, `docs/specs/` was written; the patch was applied only to a scratchpad copy of `frontend/`.

## Verdict
The 3 failures are **openapi drift, not a test or fixture regression, and not caused by the 500-cap edit**. They are caused by 015's own contract window (public single-path authoring contract, `TestDetailDto` + tightened `Variable.secretId`). Fix is two things in the frontend test side: fixture `secretId` values (2 fixtures + 1 dependent assertion) and the `getTest` example test reading the schema from the operation. No openapi change, no type/adapter change needed for green. Assertions are not weakened.

## The 3 failures (verified, `contract-run.log`; 69 tests, 3 failed)
| # | Test | Error |
|---|---|---|
| 1 | `the mock fixtures match the OpenAPI component schemas > every test fixture validates against the test schema` | fixture `1111...1111`: `/variables/1/secretId` fails `Variable.secretId.pattern ^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,64}$` |
| 2 | `story 10.11c ... > every getTest example validates against the amended TestDto` | example `ready`: `/steps/0`, `/steps/1` "must be string" |
| 3 | `STUDIO-OBS-012B: the readiness fixtures match the contract > every readiness fixture validates against TestDto` | fixture `a0000000-...-0001`: same `secretId` pattern failure as #1 |

## Root cause, with the timeline
- **Verified:** the same test file (69 tests) passes 69/69 against `contracts/baseline/.../openapi.yaml` (sha `afec6c04...`, the 012B-final anchor), using today's test and fixtures (probe `probe/studioContract.baseline.test.ts`, only the openapi path swapped). It fails 3 against `54fd12cd` (the pre-edit state per fullsuite-fix01) and against `c053a7f7` (current). 012B's story record also records 69/69 and 701/701 at `afec6c04` (read, not re-run).
- **Verified:** `afec6c04` has no `TestDetailDto` and no `secretId` pattern; `54fd12cd` has both (grep over the 015 contract evidence copies). `diff afec6c04 54fd12cd` is 1368 changed lines. So the drift entered between 012B close and `correction-01/before`, i.e. in 015's contract execution (`execution-20261015/contracts/`). 012B/013/014 are not the source for these three.
- Failure 2: ruling1 (story 015 O-1/P7: "v2 becomes the only response") made `getTest` 200 (and create/update) answer `TestDetailDto` (steps = `AuthoringStep{id,text}` objects). `TestDto` stays the list projection (steps strings). The 10.11c test hard-codes `TestDto`, so it validates object-step examples against the string-step list schema.
- Failures 1 and 3: `Variable.secretId` is now a required Vault name (`pattern`, no name fallback; same grammar as `vault-secrets/spec.md` D3 and the openapi create example `secretId: LOGIN_PW`). The two frontend fixtures carry `vault://studio/pilot-pw`, a URI form the contract refuses. Inferred: the tightening is 015/OBS-007-secret-login lineage; I did not find the ADR-002 section 13 row that ruled the `TestDetailDto`/pattern edits (no row names them; ADR-002 section 16.7 still lists "a second draft schema (`TestDetailDto`)" as a rejected alternative). That is a documentation gap for @architect, not a blocker for green.

## Where the fix belongs
| Failure | Fix location | Why |
|---|---|---|
| 1, 3 | mock fixtures (`fixtures.ts:72`, `readinessFixtures.ts:37`): `secretId: 'LOGIN_PW'` | The fixture is wrong against a contract that is right. Types need no change (`secretId?: string \| null` is a looser TS type; the pattern is a schema rule). Dependent expected value in `pageSaveAndStop.test.tsx:265` (round-trips the fixture) follows the fixture. |
| 2 | `studioContract.test.ts`: validate the examples against the schema `getTest`'s 200 declares (read from the operation's `$ref`, asserted to be a component ref), not a hard-coded name | The document stays the arbiter. Strictly stronger than before: it now also fails if the 200 stops declaring a component schema. |
Not openapi: the contract is what 015 intended; editing it to make a stale test pass would weaken it. Single-path: no `TestDto`-or-`TestDetailDto` branch in the test.

## Patch (`fix.patch`, 4 files, `git apply --check -p0` from repo root: OK)
- Test #2 is renamed: `...validates against the amended TestDto` -> `...validates against the schema getTest's 200 declares`. One name change for any frontend name-reconciliation ledger (012B reconciled by exact name). If the name must stay, revert only the `it(` title line; the logic is unaffected.
- Patch is against today's uncommitted content of those files. If the formatting window reflows them first, re-diff (hunks are 1 to 8 lines).

## Verification of the patch (verified)
- Contract file with the patch semantics against the current openapi: 69/69 (`probe/probe-both.log`; the probe mutates the fixtures' `secretId` in memory, the test hunk is the real one).
- Full frontend suite on a scratchpad copy of `frontend/` with `fix.patch` applied (`patch -p0`): **56 files, 701 tests, 701 pass, 0 fail** (`full-vitest-patched.log/json`). My first copy run showed 2 failures: `pageSaveAndStop.test.tsx` (hit by the fixture change, now in the patch) and `realStudioStartup.test.ts` (artefact of my copy lacking `../dev.sh`; passes on the real tree and after I added `dev.sh` to the copy).
- Negative control for the new test code (string-step example must fail against `TestDetailDto`): **not run**. The unpatched test already failing on the type errors shows the validator discriminates on `steps` item type.

## Frontend baseline (verified, current tree, `full-vitest.log/json`, `--minWorkers=1 --maxWorkers=3`, load ~8)
56 files, **701 tests: 698 pass, 3 fail, 0 skipped/todo**, 134 s. The 3 failures are exactly the three above; nothing else fails. 701 matches 012B's recorded final count, so the suite size has not drifted.

## Observations for 015 / OBS-008 (not in the patch)
1. **Story clause conflict:** story 015 O-1 b says "This story does not edit `frontend/src`" and routes the frontend overload/adapter removal to OBS-008. But 015's contract change is what breaks the frontend contract test, and 015's final gates need it green. This patch edits `frontend/src` (mocks and one test); @po/@architect should record that as a narrow, named exception, otherwise the gate and the clause conflict.
2. **Deeper drift the green test does not cover (inferred from reading):** `studioAuthoringTransport.ts` still has the v1 overloads (`getTest(id)`, `createTest(TestRequest)`, `updateTest`) and the mock handlers still serve string-step `TestDto` for `GET /tests/{id}` without `authoringSchemaVersion`. The contract now refuses v1 writes and answers `TestDetailDto`. No test validates handler *responses* against the declared schema, only fixtures and examples. This is the OBS-008 named consumer item and is the single-path violation still live in the frontend. Not touched here.
3. `UiTestConfig`/other tests use `secretId: 'LOGIN_PW'` already; `docs` ADR-002 section 13 has no row for `TestDetailDto` or the `secretId` pattern (see above).
4. `probe/` holds the throwaway harness (baseline run, patched run). Its `node_modules` symlink was removed.
