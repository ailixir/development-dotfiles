# STUDIO-OBS-009 F-merge prep (runner and backend fixes), receipt

- **Agent:** Dex (@dev). **Date:** 2026-10-18. **Mode:** YOLO. No commit, stash, push, install or dist rebuild.
- **Spec:** `../pre-rulings.md` items 1, 2, 4(i)a and 6, plus `../../w2-brief.md`. Marks: [V] verified by a run or a read, [I] inferred.
- **Result: GREEN on every verify command in the brief.** Counts and logs below. One owed item: @qa co-sign of the item 1 oracle amendment (pre-rulings 1.2).
- Scratch work (scratch trees, vitest configs, scripts) lives in the session scratchpad only; the evidence copies are under this folder.

## Files written (sha256, repo-relative to `studio-runner/` or `backend/`)

Before values were taken at lane start from the live working tree (other lanes' uncommitted work included), so they are a lane baseline, not a git blob. Full lists: `sha-before.txt`, `sha-after.txt`.

| file | before | after |
|---|---|---|
| `studio-runner/src/run/guidedBrowser.ts` | db618097131b | ab3effec0a28 |
| `studio-runner/src/guided/runtime.ts` | eb0e4bd7ab2f | 8ce999d78ff0 |
| `studio-runner/test/guided/stopReason.test.ts` | 34497e1959c6 | f2d703d0d5d7 |
| `studio-runner/test/guided/incrementalRuntime.test.ts` | 112def39b6ff | fafbe9d6a79c |
| `studio-runner/test/guided/transport.test.ts` | d2fdc0b980ea | 7f3c6d5f7317 |
| `studio-runner/test/guided/runtime.test.ts` (not in the ruling's list, see deviation 1) | not hashed before; R2's after value `47fec2b4e927` [I] | ad6ad7e20730 |
| `studio-runner/test/guided/ownership.test.ts` (same) | not hashed before; R2's after value `63cdcf42e7da` [I] | 436b45e61faa |
| `studio-runner/test/helpers/profileSafetyFixture.ts` (the fixture, deviation 2) | 8147b47e798c | 7f9ee53a0c52 |
| `studio-runner/test/profileSafetyFixture.test.ts` (the fixture's unit tier, deviation 2) | f88f26bb41e9 | ca9e020334ef |
| `studio-runner/test/fixtures-tier/browser-profile-safety.test.ts` | b86a4e480549 | 5f0930fb516f |
| `studio-runner/test/fixtures-tier/observed-secret-control.test.ts` | 2c36fa8618b3 | 15f81d2591c5 |
| `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionConfiguration.java` | 183aa6b998f1 | a804847fd6e6 |
| `backend/src/test/java/com/citi/put/checks/studio/dispatch/RunnerTlsClientCertIT.java` (untracked, D3's) | 9537e1649e46 | 3467a465c5e3 |
| `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedConnectorScopeTest.java` | new | 557801bd7c55 |

IDS: REUSE `ProfileSafetyFixture` (ADAPT: one more port option and one method), REUSE `RunnerTlsClientCertIT.GuidedConnectorInARealContext` (ADAPT: one more case), REUSE `readProcessTableWithArgs` from `src/run/tree.ts` (child_process is lint-banned in tests). CREATE only `GuidedConnectorScopeTest`: no existing unit test reaches the nested connector classes, and the real-context IT cannot pin the encoded-path variants cheaply.

## Item 3: B-R2-1, `terminate` and `orderlyClosed` required

- `guidedBrowser.ts`: both members lose the `?`, doc comments rewritten. `runtime.ts`: `terminateOf` deleted; the failed-start path calls `browser.terminate()`, `releaseWhenLaunchSettles` calls `late.terminate()`, `orderlyClose = browser?.orderlyClosed() ?? false` (the lint rule `prefer-optional-chain` rejected `browser !== null && ...`; `?? false` on a null browser is the same value).
- **Red first** [V]: with the members made required and nothing else changed, `tsc` named 8 sites in 5 files (`red-b-r2-1-tsc.log`). **Green** [V]: all 8 given `terminate: vi.fn(() => Promise.resolve()), orderlyClosed: () => true`; `tsc` clean.
- Three tests in `test/guided/runtime.test.ts` then went red (3 failed, 224 passed): doubles that had relied on the fallback (`terminate ?? close`) and asserted on `close` after a failed start or a late launch. They now pass a `terminate` spy and assert on it (lines 55-61, 148-154, 427-428). This is the intended consequence of the ruling, and it is not one the ruling predicted (deviation 1).
- Tripwires [V]: `grep -n "terminate?:\|orderlyClosed?:" src/run/guidedBrowser.ts` = 0; `grep -n "terminateOf\|orderlyClosed?\.\|?? true" src/guided/runtime.ts` = 0.
- Unit: `test/guided` plus `test/run/guidedBrowserReap.test.ts`: **11 files, 227/227** (`green-b-r2-1-unit.log`).
- Mutations (scratch tree only): MB1 failed-start path calls `close()` instead of `terminate()`: 11 red of 102 (`runtime.test.ts` U3, the U4 cases, the bootstrap case); MB2 orderly verdict ignored: 1 red (U2) of 221. Logs in `mutations-runner/`.

## Item 1: F-R2-1, `browser-profile-safety` fixtures (terminate oracle)

- `profileSafetyFixture.ts` implements pre-rulings 1.3: port option `productionTeardown: 'contextClose' | 'terminate'` (default `contextClose`); in `terminate` mode a second snapshot is taken in `handoff`, any launcher `context.close()` before the body counts as a production close (code `GRACEFUL_CLOSE_ON_FAILED_LAUNCH`), `observeProductionTeardown()` records the first probe once and throws `TERMINATE_UNCONFIRMED` unless every owned PID is DEAD and the browser is disconnected, and `run` requires `productionRealCloseRequests === 0 && firstPidState === 'DEAD' && safeToRemove` (else `PRODUCTION_TERMINATE_REQUIRED`). `productionTeardown` is a persisted fact. Cleanup stages are unchanged; a cleanup close never overwrites the first observation in this mode.
- One difference from the ruling's wording: `observeProductionTeardown()` is synchronous (an `async` method with no `await` fails `require-await`). The test calls it without `await`.
- `browser-profile-safety.test.ts`: the `:46` test is renamed as ruled and asserts (1) `GuidedLaunchFailure`, (2) `context.close` called 0 times, (3) 0 `checks-guided-*` entries, (4) 0 rows in a read-only process table whose command line names the unique scratch directory (the table must be non-empty, so an unreadable `ps` cannot pass), (5) `failure.close()` twice, still 0 closes and an empty scratch. The `:51` test builds the harness with `productionTeardown: 'terminate'` and calls `observeProductionTeardown()` then `await failure.close()`.
- **Red first** [V]: on the current tree (scratch copy, no-globalSetup config): `red-profile-safety-fixtures.log` = 8 passed, **2 failed** (the two tests F-R2-1 named). Fixture unit tier red: `red-fixture-unit.log` = 6 failed, 67 passed.
- **Green** [V]: `test/profileSafetyFixture.test.ts` **73/73** (67 old + 6 new, `green-fixture-unit.log`). `browser-profile-safety.test.ts` **10/10, twice** (`green-profile-safety-fixtures-1.log`, `-2.log`). Persisted facts, both runs (`profile-safety/`): `productionTeardown: terminate`, `productionRealCloseRequests: 0`, `rawCloseRequests: 0`, `firstPidState: DEAD`, `safeToRemove: true`, `primaryCode: NONE`, `expectedRefusal`, `canaryUnchanged`, `outsideIdentityUnchanged` all true, `ownedPidCount: 7`.
- New [V] fact: Playwright **does** emit the context `close` event on the SIGKILL'd persistent context (`contextCloseEvent: true` in both runs). The ruling left that unchecked and does not require it.
- `guidedCloseBound.test.ts` (unchanged): 5/5 (`green-guidedCloseBound-fixtures.log`). `guided-start-deadline.test.ts`: 7/7.
- Mutations [V]: M5 (graceful `context.close()` restored on the catch path, scratch copy of `browser.ts`): both renamed cases red; `:46` on `expected 1 to be +0` (assertion 2), `:51` with persisted `primaryCode: GRACEFUL_CLOSE_ON_FAILED_LAUNCH`. Fixture-unit mutations: MF3 (a launcher close not counted) red on the GRACEFUL case; MF4 (credit without the disconnect check) red on the connected case; MF5 (cleanup close overwrites the first observation) red on 3 cases.
- **Owed:** @qa co-sign of the oracle amendment (pre-rulings 1.2). I did not sign it.

## Item 2: `observed-secret-control` `lost-control-body`

- `lost-control-body` now expects `outcome` equal to `{result: 'ERROR', errorCode: 'RUN_ERROR', errorMessage: 'CANCELLED'}` and the interrupted step (index 1) `SKIPPED` with `failure === STOPPED_STEP_MESSAGE` (exported from `src/server/runCoordinator.ts`, imported). The other three modes keep `errorCode CANCELLED`. `outerErrorCode` is persisted in `facts`. A comment cites A12 and the ruling.
- **Red first** [V]: unchanged test on the current tree: `red-secret-control-fixtures.log` = 3 passed, 1 failed (`lost-control-body`: `expected 'RUN_ERROR' to be 'CANCELLED'`).
- **Green** [V]: all four modes, 4/4, in a scratch copy with the shared `dist` linked and **no globalSetup re-emit** (PR-RT's config approach, R2's env-root variant) (`green-secret-control-fixtures.log`). Oracle files in `secret-control/`; the canary string appears in none of them.
- Mutations [V], both on the scratch copy of `runCoordinator.ts`:
  - RM1 (drop `!control.recorded`): `worst-phase`, `slow-revoked`, `progress-revoked` go red (`RUN_ERROR` where `CANCELLED` is required), `lost-control-body` stays green. **This is the reverse of what pre-rulings 2.2 predicted** ("`lost-control-body` must turn red"); the mechanism is that dropping the guard rewrites the recorded modes too, and the unrecorded mode is `RUN_ERROR` either way.
  - RM1b (rewrite disabled): only `lost-control-body` goes red (deep-equal on the outcome). Together they show the per-mode expectation is not vacuous in either direction.

## Item 4: D3 (i) path scoping on the guided TLS connector

- `GuidedSessionConfiguration.GuidedTlsConnector` gains `ConnectorScope` (an `OncePerRequestFilter`) and a `FilterRegistrationBean<ConnectorScope>` at `Ordered.HIGHEST_PRECEDENCE` on `/*`, so it runs before Spring Security. The customizer attaches the connector it creates; the filter reads `connector.getLocalPort()` per request (works with port 0). Rules as ruled: only requests whose local port equals the connector's are judged; the raw `getRequestURI()` (context path stripped) must start with `/internal/v2/studio/guided-sessions/` and contain none of `..`, `;`, `%2e`, `%2E`, `%2f`, `%2F`, `%5c`, `%5C`; `getServletPath() + getPathInfo()` must start with the same prefix; anything else gets an empty `404` with no `WWW-Authenticate`; a connector without a positive local port refuses everything; with no connector attached the filter is inert, and the plain port is untouched. No new bean when `connector.port` is 0 beyond the inert registration.
- `GuidedConnectorScopeTest` (new, 23 cases, pure unit): guided path served; 8 other paths (including the prefix without the trailing slash, `...sessionsX/...`, `/error`) refused; 8 traversal and encoded-separator variants refused even when the resolved servlet path looks guided; resolved servlet path elsewhere refused; plain port untouched; inert without a connector; unbound port (0, -1) refuses everything; port read per request.
- `RunnerTlsClientCertIT.GuidedConnectorInARealContext` gains `theConnectorServesOnlyTheGuidedPathsAndThePlainPortIsUnchanged` (real Spring context, real TLS connector, Testcontainers PostgreSQL): with a valid client certificate `/actuator/health` and `/api/v1/csi` get an empty 404 with no challenge; three walk-out paths get 400 or 404; a guided path is still answered by the chain (401 without a JWT); on the plain port `/actuator/health` is 200 and `/api/v1/csi` is not 404. The existing guided case (422 with certificate plus JWT, 401 without) is unchanged and green.
- **Red first** [V]: with the filter made inert (`attach` keeps nothing, mutation mA), 39 tests, **21 failed** (20 of the 23 unit cases plus the new IT case); the 15 older IT cases and the 3 pass-through unit cases stay green. Log and XML: `mutations/obs009-prep-dev-mA-red-filter-inert*`. A first attempt with a `RunnerTlsClientCertIT*` wildcard died in 8 s at `verifyRunnerDist` (the runner `dist` is older than `src`, and any wildcard `--tests` selects that check); those failed attempts are `execution/obs009-prep-dev-green01*` and are not evidence. Explicit class names, including the two `$` nested classes, avoid the check and spawn no runner.
- **Green** [V], collector label `obs009-prep-dev-green02`, through the shared lock, `--no-daemon`: **39/39 passed, 0 failed, 0 skipped** (unit 23, `RunnerTlsClientCertIT` 12, `$OneIdentityInARealContext` 2, `$GuidedConnectorInARealContext` 2); `sourceStable: true`, `distStable: true`; results sha256 `ec45100cdca9...` (`execution/obs009-prep-dev-green02-results.json`).
- Mutations [V] (in-lock, file restored byte for byte, sha asserted `a804847fd6e6...` match true each time; same 39-test selection):
  | id | mutation | result |
  |---|---|---|
  | mA | filter inert | 21 red (above) |
  | mB | drop the local-port check (judge every port) | 3 red: new IT case, `thePlainPortIsNeverTouched`, port-read-per-request |
  | mC | drop the raw-URI forbidden-token check | 8 red: every traversal and encoded variant |
  | mD | drop the servlet-path check | 1 red: `aGuidedRawUriWhoseResolvedServletPathIsElsewhereIsRefused` |
  | mE | serve a guided path even when the connector port is not positive | 2 red: both unbound cases |
- Static gates [V] (`logs/gates-spotless-checkstyle-spotbugs.log`, one lock hold): `spotlessCheck` (project-wide) BUILD SUCCESSFUL; `checkstyleTest` ran and passed; `checkstyleMain` and `spotbugsMain` reported **UP-TO-DATE**, which means Gradle had already run them successfully on identical inputs (another lane's gate run after my edit) [I: I did not see that earlier run]. google-java-format 1.22.0 CLI (`--skip-reflowing-long-strings -n`) over my three Java files reports none unclean [V]; my edit to the main file went through it, and the diff of its output against the file was only my text.

## Whole-suite and gates on the runner [V]

| command | exit | counts |
|---|---|---|
| runner unit suite, whole (`logs/full-unit-suite.log`) | 0 | 110 files passed + 1 skipped; **2475 passed**, 29 skipped (R1's baseline 2469 plus my 6 new fixture-unit cases) |
| `test/guided` + `test/run/guidedBrowserReap.test.ts` | 0 | 11 files, 227/227 |
| `tsc -p tsconfig.json --noEmit` (`logs/tsc-baseline.log` before, final clean) | 0 | no errors (the `tls-client-cert.test.ts` errors of the baseline were fixed by the chart lane meanwhile) |
| eslint over the 11 touched runner files | 0 | clean |
| fixtures tier (scratch tree, no globalSetup), `browser-profile-safety` x2, `observed-secret-control`, `guidedCloseBound`, `guided-start-deadline` | 0 | 10/10, 10/10, 4/4, 5/5, 7/7 |

Fixtures ran in rsync copies of `studio-runner` (own `src/test/config`, `node_modules` and `dist` symlinked, `docs/specs` and `tools` copied, evidence directories created empty), so nothing under `docs/qa/evidence/STUDIO-OBS-007`, `STUDIO-OBS-013` or `STUDIO-OBSERVED-NEXT` was written and the 007/013 media needed no protect/restore. `dist` was never rebuilt; the unit and fixtures runs judged the existing `dist`.

## Process hygiene [V]

`ps` for `checks-guided` and Chrome for Testing before and after shows only the four pre-existing processes (5083, 5095, 13577, 13581), none mine, none signalled. My own killed items: the first (failed) Gradle driver and its waiting lock wrappers only (pids 46002, 61088, 61284, all started by this lane, none held the lock or had mutated a file at the time; the file's sha was checked before and after). No watcher, server, browser or container of mine is left.

## Deviations

1. **B-R2-1 touched more than three doubles.** The ruling lists three files; `tsc` named **8 sites in 5 files**: the three listed plus `test/guided/runtime.test.ts` (4 sites) and `test/guided/ownership.test.ts` (1 site), both R2-lane files. I gave them the same two members (needed for a clean `tsc`). Three `runtime.test.ts` tests also asserted on `close` through the old fallback and now assert on `terminate` (see item 3). The ruling's "no assertion moves" holds for the three listed files only.
2. **Item 1's write set.** The brief names `browser-profile-safety.test.ts`, but the ruling puts the `terminate` mode in `test/helpers/profileSafetyFixture.ts` and three new cases in `test/profileSafetyFixture.test.ts`. "The fixture" is that helper, so I edited all three. No other lane lists them.
3. **Item 4's test home.** The ruling puts the cases in `RunnerTlsClientCertIT` (D3's file, untracked, no other lane writes it); I added one case there as ruled and also created `GuidedConnectorScopeTest` for the encoded-path variants (see IDS).
4. `observeProductionTeardown()` is synchronous (above).
5. Ruling 2.2's RM1 prediction was reversed in practice (above); I report what ran.

## Findings for root / @architect

1. **Startup window of the fail-closed rule.** A connector without a positive local port refuses everything on every port, as ruled. Between the plain connector starting and the guided connector binding, a plain-port request would get the empty 404. Tomcat starts both together at server start, before readiness; I did not measure the window [I]. If it matters, the alternative (judge only requests that arrive on a bound connector) removes the fail-closed property the ruling asked for; I kept the ruling.
2. **`verifyRunnerDist` and wildcards.** Any `--tests` pattern containing `*` selects the dist check, and the runner `dist` is now older than `src` for good reason (the F-merge rebuild is pending). Other lanes' focused backend runs must name classes without wildcards (nested classes as `Outer$Inner`) until the rebuild.
3. **`runtime.test.ts` doubles are the pattern to copy.** Any new `GuidedBrowser` double now needs `terminate` and `orderlyClosed` or `tsc` fails.
4. **Chart coupling.** The filter keys on the connector port; it does not replace the API ingress NetworkPolicy (pre-rulings 4(i)b, Gage). Both are required by the ruling.
5. The `lost-control-body` production residual (revocation recorded, control read lost, API shows `ERROR` with a null `error_code`) is unchanged and disclosed by @po (pre-rulings 2.3).

## Batons (land atomically at F-merge)

- `guidedBrowser.ts` and `runtime.ts` with the eight doubles (5 test files) and the three `runtime.test.ts` assertion moves.
- `profileSafetyFixture.ts`, `profileSafetyFixture.test.ts` and `browser-profile-safety.test.ts` together; the `:51` test fails to compile-run without `observeProductionTeardown`.
- `observed-secret-control.test.ts` depends on R1's `runCoordinator.ts` (already landed) and imports `STOPPED_STEP_MESSAGE`.
- `GuidedSessionConfiguration.java`, `GuidedConnectorScopeTest.java` and the `RunnerTlsClientCertIT` case together.
- The F-merge `dist` rebuild must follow before any guided IT credit; the fixtures runs here judged the old `dist`. After the rebuild, re-run `browser-profile-safety` (twice), `observed-secret-control` and `guidedCloseBound` once in the real tier through `run-runner.py`; those runs write evidence that I deliberately kept out of the repo.
- Owed externally: @qa co-sign of the item 1 oracle (pre-rulings 1.2); Gage's NetworkPolicy and chart property fix (4(i)b, 4(iv)).

## Commands (all with PATH `v24.20.0` for the runner)

Runner unit: `pnpm --config.package-manager-strict=false exec vitest run <files> --coverage.enabled=false --minWorkers=1 --maxWorkers=2`. Fixtures: the same with `--config <no-globalSetup copy of vitest.fixtures.config.ts> --maxWorkers=1`, root set by env var to the scratch tree. Backend: `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-prep-dev-green02 --test-tasks test -- test --tests <the four classes> --no-daemon`.
