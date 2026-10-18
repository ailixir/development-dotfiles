# STUDIO-OBS-009 lane P2 receipt (W2)

Author: Dex (@dev). No commit, stash, push or dist rebuild. [V] = verified by running, [I] = inferred.

## Change
- `src/versions.ts`: the five artifact-1 constants are gone; only `OBSERVED_CONTRACT_VERSION` remains.
- `scripts/write-runtime-versions.mjs` / `.d.mts`: no `versions` input, no typescript-pin throw, no `artifact`, `validatorSchema`, `validatorParser`, `syntaxReference`, `executor` in the record. The CLI no longer imports `dist/versions.js`. Observed keys are untouched (`observedSchemaBundleHash`, `observedReferenceBundleHash`, `observedChromiumBuild`, `observedBrowserProvenance`, `observedBrowserLauncherSha256`); no new key names (A7).
- `src/compat/runtime-versions.ts`: required list is now `playwright`, `observedSchemaBundleHash`, `observedReferenceBundleHash`, `observedChromiumBuild`, `observedBrowserLauncherSha256` (non-empty strings, fail closed, no fallback). `assertObservedBrowserStartup` signature unchanged.
- `scripts/check-pins.mjs` / `.d.mts`: the `validatorParser` vs typescript pin comparison and `declaredTypescript` are removed.
- Tests: `runtime-versions.test.ts`, `compat.test.ts`, `pins.test.ts`, `test/helpers/harness.ts` (`RUNTIME_VERSIONS` now observed identities), fixtures-tier `observed-bootstrap-process-tree`, `observed-bootstrap-video`, `observed-replay` (drop `versions` import/arg; replay adds a no-retired-keys assertion).
- Not changed (reasons below): `test/fixtures/result-manifest.json`, `test/run/manifest.test.ts`, `contract.test.ts`, `observedProgressUse.test.ts`, `reporting.test.ts`, `observed-secret-control.test.ts`.

## Commands (exit, counts)
| Command | Result |
|---|---|
| baseline unit (verify list, before edits) `baseline-unit.log` | exit 1, 32 failed / 90 passed / 16 skipped; all 32 = `createApplication` needing `listener` (D1 harness migration not yet landed) [V] |
| red `red-unit.log` (new tests, old src) | exit 1, 55 failed [V] |
| green unit, verify list, real tree after root landed D1 helpers `green-unit-real.log` | exit 0, 7 files, 144/144 [V] |
| `drain`, `guidedMode`, `tlsListener` (consumers of the runtime-versions file) `green-server-real.log` | exit 0, 67 passed / 1 skipped [V] |
| `check:pins` `check-pins.log` | `check:pins OK` (2 NOT ASSERTED: chromiumBuild, image, expected off-image) [V] |
| AC-1 d grep over `src` and `scripts` | 0 hits (was 19) [V] |
| eslint on all 13 changed files | exit 0 [V] |
| `tsc --noEmit` `typecheck-real.log` | exit 2, single error `test/deployment/tls-client-cert.test.ts(71,10) TS6133 secretNames unused`, not a P2 file [V] |
| fixtures tier, 4 files, in an isolated copy (own dist, `green-fixtures-sim.log`) | 23 passed / 1 failed (below) [V] |

Fixtures tier was run in a scratch copy of `studio-runner` (own `dist`, globalSetup emitted into the copy) so the shared `dist` was never rewritten; the real-tree `dist` was not rebuilt. The real `dist/runtime-versions.json` still carries the old stamps until root's F-merge rebuild; `check:pins` is read-only and passes on it.

The one fixtures failure: `observed-secret-control.test.ts > lost-control-body`: FINAL `errorCode` is `RUN_ERROR`, test expects `CANCELLED` (line 124). That test uses runtime-versions only to read the observed keys. [I] This is the A12/R8 post-Ready self-stop shape that `runCoordinator.ts` (R1 lane, modified 00:56 today) is changing; I did not run a pre-P2 baseline of that single test, so attribution is inferred, not proven.

## Mutations (isolated copy, restored by re-sync)
- M1 drop `observedBrowserLauncherSha256` from the required list: 2 tests fail (`compat.test.ts`).
- M2 writer re-adds `executor`: 3 tests fail (`runtime-versions.test.ts`).
- M3 `check-pins` compares `validatorParser` again: 11 tests fail (incl. "does not compare the retired artifact-1 stamps").
Logs: `mutation-m1.log`, `mutation-m2.log`, `mutation-m3.log`.

## ACs
Local half of AC-1 P2 a, b (runner), d. b's backend half (`projectRuntime`) and c (contract) are B and C9.

## Deviations and decisions
- [AUTO-DECISION] Required observed keys include `observedChromiumBuild`: a runner that cannot name its Chromium build now refuses to boot with "missing required version fields" rather than reporting a null that the backend would project as `chromium: null`. Consequence: a host without an installed browser fails loadRuntimeVersions in any mode. Guided mode already refused such a host in `assertObservedBrowserStartup`.
- `harness.ts`: root applied D1's `listener` hunk to the same file; my edit is the `RUNTIME_VERSIONS` block only. `sha-after.txt` therefore includes D1's change for that file.
- `result-manifest.json` and `manifest.test.ts` were left alone: backend `ResultManifestFixtureTest.java` asserts the fixture's `executor`/`validatorSchema` entries, and the Java test is outside this lane.
- AC-1 "contract 3": no key carries it (A7 forbids new key names); the backend builds `3:` + hash itself.

## Findings for root / @architect
1. Stale retired-name text outside the P2 set, none hit by the AC-1 d grep: `studio-runner/README.md` (lines 24, 506, 591, 597-602), `studio-runner/ci/stages.md` (107-108 lists the old record), three `fixtures/pages/*.html` comments naming `SYNTAX_REFERENCE_VERSION`, `test/evaluation/{scripted-backend,report.test}.ts` and `evaluation/lifecycle.test.mjs` (`pins.validator/executor`), and the replay line 173 literal `runtimeVersions: { playwright, validatorSchema, syntaxReference, executor }` in `observed-replay.test.ts` (left because D1's `listener` change rewrote that same line; harmless test data).
2. Java `ResultManifestFixtureTest` + `result-manifest.json` still use the retired key names as opaque sample data; change both together if wanted.
3. `lost-control-body` fixtures failure above (R1 lane).
4. `tls-client-cert.test.ts:71` unused `secretNames` breaks `type-check` (D2 lane).

## Batons (atomic at F-merge)
- P2 runner change and B `projectRuntime` (already reading only observed keys) land together; the dist rebuild must follow, since the old `dist/runtime-versions.json` still has the retired keys and old `dist/compat` still requires them. Rebuilt dist + new src is consistent; old dist + new test files is fine (verified in the copy).
- Replay/ReplayIT read the observed keys, which are unchanged.

## Files, sha256
`sha-before.txt` / `sha-after.txt` in this folder (13 files changed, 3 more listed in before only because untouched).
