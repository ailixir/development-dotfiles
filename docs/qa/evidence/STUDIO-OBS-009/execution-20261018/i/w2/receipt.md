# STUDIO-OBS-009 W2 lane I: harness body, guided IT switch, `verifyRunnerDist`

- **Agent:** Dex (@dev, backend test infra). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No `dist` rebuild. No production code, no migration. `.aiox-core/core/permissions/dispatch-governance.js` untouched.
- **Location note:** `i/receipt.md` is lane I.0's receipt and is untouched. This W2 receipt is `i/w2/receipt.md` and `receipt.json`.
- **Legend:** [V] verified by running or reading today; [I] inference, not run.
- **Inputs:** `w2-brief.md`, `lanes.json` w0Refold20261017 lane I, `i/receipt.md` (I.0), `d1/w2/receipt.md` (D1 W2 [V] facts), `w1.5/ruling-part1.md` (I-T1, I-T2), D3 receipt W2 baton (`studio.runner.tls.*`), T0 ruling A14.

## 1. Verdict

**GREEN** on the lane's exit: the switch compiles, and the harness unit test is green on the final bytes.

| Check | Result |
|---|---|
| Compile of the whole test source set (4 migrated ITs, harness, tests) | green [V] (`obs009-i-w2-02..04`, `compileTestJava` executed) |
| `RunnerProcessHarnessTest`, final bytes, collector `obs009-i-w2-04` | **34 / 34 passed**, 0 failed, 0 skipped, exit 0, `sourceStable:true`, `distStable:true` (24 from I.0 + 10 new) [V] |
| Static gates (`spotlessCheck` whole project, `checkstyleMain`, `checkstyleTest`, `spotbugsMain`) | exit 0 [V] `logs/static-gates-gradle.log` |
| `verifyRunnerDist` against the live (pre-fold) `dist` | **fails as designed**: `dist/main.js` is older than `studio-runner/src/run/observationCollector.ts` [V] `logs/verify-runner-dist-stale.log`; skipped for a focused run that names no guided IT [V] (`obs009-i-w2-02` log: `:verifyRunnerDist SKIPPED`) |
| The 4 migrated ITs against the **live** `dist` | **cannot run** (pre-fold `dist` has no listener keys); recorded as batons (section 8) |

**Beyond the brief (extra evidence, not a claim of F-merge readiness):** I built a **scratch emit** of the current runner source in my scratchpad (never `dist`) and ran the migrated ITs against it with `OBS009_RUNNER_DIST`. Result: Bridge 10/10, Planned 16/16, Planning 57/57, the patched FocusMutation IT 2/2, and one ReplayIT case that gets through learning, the guided worker and two ordinary replays over TLS before it stops on the **lane S tripwire assertion** that S's baton already names (finding F1). Section 5 has the table and its limits. This is non-credited: the spawned dist digest was `8114eb4d3257f053da90b42b9bf4cee1b11ad2d9c2af969024e8a108d066b80c`, not the F-merge build.

## 2. Files (sha256 before -> after; full values in `sha256-before-after.json`)

| File | Before | After |
|---|---|---|
| `backend/build.gradle.kts` (the `verifyRunnerDist` block and the two `dependsOn`, nothing else) | `205cc6b91b01` | `823cf16b7ee7` |
| `backend/src/test/java/com/citi/put/checks/studio/support/RunnerProcessHarness.java` | `dc291c0d85e3` | `ac559cba169f` |
| `.../support/RunnerProcessHarnessTest.java` | `87cb8e103387` | `8888a7e85794` |
| `.../guided/bridge/GuidedBridgeIntegrationTest.java` (package `...guided.session`) | `2bcc012036cb` | `398e5734290c` |
| `.../guided/bridge/GuidedBridgePlannedIT.java` (package `...guided.session`) | `3760127c09c6` | `37f035d3a28e` |
| `.../guided/translation/GuidedPlanningIntegrationTest.java` (package `...guided.session`) | `26b33c23bc6e` | `6407c66b746f` |
| `.../guided/publication/GuidedPublicationReplayIT.java` | `533fbee213a2` | `6f4f1e294ff2` |

All six Java files are google-java-format clean before and after (gjf 1.22.0, `--skip-reflowing-long-strings`, JDK 21) [V]. Evidence copies of the originals are in my scratchpad; the diff of each IT against its original is only the hunks listed in section 4.

Outside my write set, **not edited**: `GuidedFocusMutationJoinedIT.java` (lane O-FM, untracked, same retired spawn). Its migration is shipped as `focus-mutation-joined-it.patch` (sha256 `9a37e407fc8bd6e5f85821f9260637c09f882da927e4ae15b620f87ed63d6533`, `git apply --check -p1` passes on the live tree today [V]).

## 3. IDS log

| Decision | Choice | Why |
|---|---|---|
| Harness body | ADAPT I.0's `RunnerProcessHarness` (same file, same lane) | `freeze`, `thaw`, `Signaller`, `preload`, private scratch and object store, guided grace floor, `assertCleanExit`, Spring property helpers, `mainInvocation`, `scrubInheritedEnvironment`, `defaultDistDirectory` |
| Guided IT scaffolding (4 copies of openssl + keytool + snapshot copy) | REUSE the D3.0 `RunnerTestTls` CA | one CA, one backend certificate that the runner pins; the three ITs that already had a per-class openssl certificate lose it |
| ReplayIT process model | REUSE its own owned-process framework (identity checks, ready marker, S2 observers, IPC diagnostic) | see deviation 1 |
| `verifyRunnerDist` | CREATE (Gradle task, no build) | ruling A14 |
| Out-of-tree validation | CREATE (scratchpad scripts, copied to `recipes/`) | the F-merge rebuild is root's; a scratch emit is not `dist` |

## 4. What was built

### Harness (`RunnerProcessHarness`)
- **I-T1:** a guided runner's SIGTERM grace is `max(configured, 65 s)` (`GUIDED_MINIMUM_GRACE`); `graceTimeout()` reports it. `TeardownReport.assertCleanExit()` fails unless the exit code is 0 and the runner was not force-killed. Both are unit-tested, including a report with exit code 0 and `escalatedToForce`.
- **I-T2 support:** `freeze(List<ProcessFact>)` sends SIGSTOP only to processes that are in `survivingGuidedBrowsers()` right now, with the same pid and start instant, never pid 1 or below, a zombie or the test JVM; `thaw()` and `teardown()` send SIGCONT to what is still frozen, before any SIGTERM. The signal goes through a seam (`Signaller`), default `/bin/sh -c 'kill -STOP|CONT <pid>'` with the pid a `long` and the signal one of two fixed words.
- **AC-12 h/i support:** `exclusivelyFreePort()` is what the ITs now use; `distDigest()` is the harness's; `defaultDistDirectory()` honours `OBS009_RUNNER_DIST` (scratch validation only). Each guided IT also writes the digest into the `/tmp/studio-obs0NN-*-worker.json` evidence file it already wrote.
- **Safety found by running it:** the runner wipes its scratch directory at every start and both `SCRATCH_DIR` and `OBJECT_STORE_DIR` default to fixed `/tmp` paths. The harness now gives each instance its own pair under its work directory (overridable with `env`).
- **Wrapper:** `Builder.preload(js)` writes `<work>/entry.mjs` (prelude, then the standard `main()` call). `main.js` starts itself only when it is the entry point (`main.ts:355`), so any wrapper has to call it. `mainInvocation(path)` and `scrubInheritedEnvironment(env)` are public for tests that build their own process.
- **Spring helpers:** `backendServerSslProperties(tls)` (`server.ssl.*`, client auth need) and `runnerTlsProperties(tls)` (the four D3 `studio.runner.tls.*` keys).
- **Bug the real run found (fixed, unit-tested):** after SIGTERM the handle can already say "gone" (zombie rule) while the JDK has not yet collected the exit status, so `exitCode` came back `null` in 7 of 57 Planning cases (red log `logs/scratch-planned-02-xml`, green `logs/scratch-planning-03-xml`). `teardown()` now waits for the status.

### The four ITs
| IT | Change |
|---|---|
| `GuidedBridgeIntegrationTest` | Spawn by harness (`dist/main.js`, guided, over TLS); `RunnerTestTls` replaces the openssl and keytool material (`TLS` = the backend identity as the runner client's context, `RUNNER_SIDE` = what a worker or a runner double presents); `server.ssl.*` from the helper; port `exclusivelyFreePort()` (AC-12 h); readiness is `awaitReady` (alive + `runner.started` + mutual-TLS `/ready`); `@AfterEach` tears down, checks the privacy oracle on the harness log, then `assertNoSurvivors` and `assertCleanExit`. **New case (I-T2):** `aWedgedGuidedBrowserIsTerminatedInsideTheBackendDeadlineAndTheSlotIsReleased`. I chose this class, not `ObservedCoRunIT`, because it reaches the session teardown path (`sessions.cancel` and the stop sender). It freezes the session's browser, ends the session by `cancel`, asserts the first stop send returned without exception inside 15 s, `teardownStatus` `CONFIRMED`, a second session's `assign` is `OWNED`, `survivingGuidedBrowsers()` empty, `assertNoSurvivors()`. Assertions of every existing case are unchanged. |
| `GuidedBridgePlannedIT` | Same hunk. `worker.json` is kept as a record of the configuration the runner was given (no secret) so the `rules`/`applicationPolicy` oracle keeps its subject. |
| `GuidedPlanningIntegrationTest` | Same hunk in `Environment`. **AC-12 h:** `new ServerSocket(0)` and the 127.0.0.1-only socket probe are gone (port from `exclusivelyFreePort`, readiness from `awaitReady`). The forged-policy case keeps its measurement wrapper as a `preload` (counter around `launchPersistentContext`, request counter on `https.createServer`); `livePolicyWrapper` now points at the harness's `entry.mjs`, so its `wrapperHash` in the proof JSON changes. `scanOnce` uses the 6-argument `GuidedTranslationCoordinator` with `RUNNER_TLS.backendTls()` and no longer sets the JVM default context. |
| `GuidedPublicationReplayIT` | Ports from `exclusivelyFreePort` (guided and ordinary); `studio.runner.base-url` is `https://127.0.0.1:<port>`; the four `studio.runner.tls.*` properties (fixture `tls.p12`, `trust.p12`, one password file); the guided worker is `main.js` in guided mode configured by the 12 listener and guided keys (environment scrubbed first), the existing preload wrapper now calls `main()`; the inline `createApplication` of the ordinary runner gets the `listener` dependency (key, certificate, CA from the fixture files, pin = fixture fingerprint); `stopOwnedProcessTree` gives the guided root the 65 s grace (the forced-stop event stays recorded). **The IPC diagnostic is untouched:** every diagnostic line (`cutDiagnostic*`, `cutWriteDiagnostic`, `cutObserveChild`, `P10_*`, `ordinary-ipc`, `safeExecutionMetadata`) is identical before and after (39 lines, same sha256) and no changed hunk lies inside `p6ChildCutSpawner` [V]. |

### `backend/build.gradle.kts`
`verifyRunnerDist` fails if `studio-runner/dist/main.js` is missing or older than any file under `studio-runner/src`; it never builds. `test` and `guidedIncrementalTest` depend on it. It is skipped when the command line has `--tests` patterns and none has a wildcard or names a runner-spawning class (the list is in the file), so lane unit runs are not held up. Which `dist` a run spawned is the collectors' `dist.digest` before and after (A14 Δ).

## 5. Verification [V]

All Gradle through `with-gradle-lock.py`, `--no-daemon`, a new label each time. `lsof -nP -iTCP -sTCP:LISTEN` and the Gradle process list are recorded before every run (AC-12 g): `lsof-before-*.txt`, `gradle-procs-before-*.txt`.

| Label | Task / selection | Result |
|---|---|---|
| `obs009-i-w2-01` | harness test | build script compile error in my `build.gradle.kts` (`java.time` is shadowed by the `java` extension); fixed |
| `obs009-i-w2-02` | harness test | exit 0, 31/31, `:verifyRunnerDist SKIPPED` |
| raw, lock held | `verifyRunnerDist`; then `test --tests ...GuidedBridgePlannedIT` | both exit 1 at `:verifyRunnerDist` with the stale-`dist` message: the dependency is wired and fires on a named guided IT [V] |
| `obs009-i-w2-03`, `-04` | harness test | exit 0, 34/34 (`-04` is the final bytes) |
| mutation sets a, b, c | harness test with one source mutation each | see section 6 |
| static gates | `spotlessCheck checkstyleMain checkstyleTest spotbugsMain` | exit 0 |

### Scratch-emit runs (non-credited; the live `dist` was not touched)
Recipe (`recipes/`): copy `studio-runner/dist`, `scripts`, `package.json` and symlink `node_modules`, `package-lock.json`, `Dockerfile`, `.nvmrc`, `fixtures` into a scratch root; `tsc -p tsconfig.build.json --outDir <root>/dist`; `node scripts/write-runtime-versions.mjs`; delete the stale `dist/run/guided{Main,Config,Shutdown}.*`. Run with `OBS009_RUNNER_DIST=<root>/dist` and `-x verifyRunnerDist`. For ReplayIT and FocusMutation an init script (`recipes/*.init.gradle.kts`) swaps in a copy of the class under another file name with `../studio-runner/dist` replaced by the scratch path.

| Label | Selection | Result |
|---|---|---|
| `scratch-bridge-01` | `GuidedBridgeIntegrationTest` (9 cases) | 9/9 |
| `scratch-bridge-04` | same class, final code with the I-T2 case | **10/10** |
| `scratch-planned-02` | `GuidedBridgePlannedIT` + Planning | Planned **16/16**; Planning 50/57, the 7 reds all `exit code null` (the harness race above) |
| `scratch-planning-03` | Planning + FocusMutation (patched copy) | Planning **57/57**, FocusMutation **2/2** |
| `scratch-replay-01` | ReplayIT `actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues` | **fails** at `schedulerAndNewHead` (live line 18522, was 18508): expected `OBSERVED_SCHEDULE_AUTH_REQUIRED`, got `BACKGROUND_AUTHORIZATION_DENIED` (F1, the known S hunk). The teardown `executionError` is the class-level audit scan, which needs the OBS-007 case this one-case run did not execute. |

What this shows: the harness, TLS wiring, readiness, clean-exit and no-survivor checks, the I-T2 wedge, the preload wrapper, the patched FM IT and the guided worker plus the inline ordinary runner in ReplayIT work against a build of the current source. What it does not show: anything about the F-merge `dist` (D2 or other lanes may still change `src`), the rest of ReplayIT, or Linux.

Leftovers: none of mine. Four `Google Chrome for Testing` processes with `checks-guided-*` profiles (pids 5083, 5095, 13577, 13581) pre-date my work and were not touched; `survivingGuidedBrowsers()` ignores them by design. PID 44737 (`dist/run/guidedMain.js`) untouched.

## 6. Mutation checks (in-lock, files restored with sha asserted; `mutations/`)

| # | Mutation (`RunnerProcessHarness.java`) | Red test |
|---|---|---|
| M1 | `teardown` does not `thaw()` | `freezeStopsOnlyThisHarnessBrowsersAndTheTeardownContinuesThemFirst` |
| M2 | guided grace floor removed | `aGuidedRunnerNeverGetsLessThanTheGuidedDrainGrace` |
| M3 | zombie exit-status wait removed | `aProcessThatIsAZombieWhenTheHandlePollsStillYieldsItsExitCode` |
| M4 | `assertCleanExit` ignores `escalatedToForce` | **survived the first test set**; added the forced-with-exit-0 report case; now red: `aCleanTeardownAssertsExitZeroWithoutForceAndAForcedKillIsNeverAccepted` |
| M5 | private scratch default removed | `theRunnerGetsItsOwnScratchAndObjectStoreAndACallerMayOverrideThem` |
| M6 | `freeze` skips the live-and-same-process check | `freezeNeverSignalsAReusedPidOrTheTestJvm` |
| M7 | `freeze` sends CONT instead of STOP | `freezeStopsOnlyThisHarnessBrowsersAndTheTeardownContinuesThemFirst` |
| M8 | prelude written after `main()` | `aPreloadIsWrittenAsOneModuleThatThenCallsMainAndNodeAcceptsIt` |
| M9 | stray `STUDIO_RUNNER_*` keys not scrubbed | `aHandStartedRunnerEnvironmentIsScrubbedOfStrayKeysAndDebugVariables` |

Not mutation-checked: the IT edits (they need the F-merge `dist`; the scratch-emit passes are their evidence) and `build.gradle.kts` (checked behaviourally above).

## 7. Deviations and decisions (`[AUTO-DECISION]`)

1. **ReplayIT keeps its own owned-process framework** and does not spawn through `RunnerProcessHarness.start()`. The guided process runs a preload wrapper with the S2 observers and the ordinary runner is an instrumented `createApplication`, not `node dist/main.js`; replacing the framework would drop the pid/start/command identity checks, ready marker and generation records the class relies on. The harness supplies the key names, the exclusive port, `mainInvocation`, `scrubInheritedEnvironment` and the 65 s grace. Reason: the brief says to keep the IPC diagnostic and not to weaken anything.
2. **ReplayIT keeps its self-signed single-certificate fixture** (also its CA and `NODE_EXTRA_CA_CERTS`, its `PREVIOUS_TLS` and its no-client-certificate contexts) instead of `RunnerTestTls`. It satisfies the runner's pin, the EKU startup check (no EKU extension) and the four D3 properties. A move to the shared CA is possible later but touches about a dozen unrelated helpers.
3. **No private copy of `dist`.** The four classes used to copy `dist` into `TEMP` to be immune to a rebuild mid-run; with one rebuild at F-merge and A14's digest record, the harness spawns the real directory.
4. **`worker.json`** is kept in PlannedIT and ReplayIT as a non-secret record of the configuration the runner got (the oracle and `configSha256` read it); the runner no longer reads it.
5. **`/tmp/studio-obs004|obs005|obs015|obs009-*-worker.json`** evidence files are still written, now with `distDigest` and `main.js` instead of `run/guidedMain.js`. Each run overwrites them; the last values on this host point at my scratch emit until the next real run.
6. **`OBS009_RUNNER_DIST`** is a new override for scratch validation. A credited run must not set it, and `-x verifyRunnerDist` is for scratch runs only.
7. **Assertions:** no existing assertion changed. New: the teardown assertions (I-T1), and the I-T2 case. In ReplayIT the stop grace for the guided root grew from 30 s to 65 s (a wait, not an assertion).

## 8. Findings

- **F1 (lane S, expected).** `GuidedPublicationReplayIT` line 18522 (18508 before my edits, which add 14 lines ahead of it) expects `OBSERVED_SCHEDULE_AUTH_REQUIRED`; the product answers `BACKGROUND_AUTHORIZATION_DENIED` (`StudioScheduleProcessor.java:273`). This is the one-line tripwire hunk that `lanes.json` hands from I to S ("tripwire :18508 only"); reproduced on the scratch emit in `scratch-replay-01`. I did not touch it. Everything before it in that case passed: learning, the guided worker, and two ordinary replays over TLS.
- **F2 (O-FM / root).** `GuidedFocusMutationJoinedIT` still spawns the retired `run/guidedMain.js`. `focus-mutation-joined-it.patch` is the same hunk lane I applied to PlannedIT plus the `workerLog` read; the patched copy passed 2/2 on the scratch emit. Apply it before running that class.
- **F3 (root).** `verifyRunnerDist` now makes any full `test` run, `guidedIncrementalTest`, and any focused run that names a guided IT or uses a wildcard fail until `dist` is rebuilt newer than `src`. That is the A14 intent; say so to the other lanes.
- **F4 (@architect, information).** `assertCleanExit()` is now asserted after every guided IT test. In the scratch emit it held for 83/83 cases (Bridge 10, Planned 16, Planning 57); the F-merge build may expose a case that leaves an unconfirmed guided stop (exit 1). Report it, do not relax it.
- **F5 (AC-12 a-d).** No full-class ReplayIT run was made in W2, so the R10-rev2-2 denominator is 0 and the item stays **open**. The diagnostic is intact (section 4). On F-merge runs read `ordinary-ipc-parent.jsonl` and `ordinary-ipc-child.jsonl` in the class temp directory and `ipcDiagnostics` in failed-test state, as the story's AC-12 b says.
- **F6 (AC-12 j).** No Chromium startup hang and no `xpc_atfork_child` signature in any scratch run [V by reading the logs for failures: none]. A hang would be recorded by label and not credited.
- **F7 (D3 baton, done).** ReplayIT now sets the four `studio.runner.tls.*` properties; nothing else in the four ITs uses Spring-managed runner clients (they build their own `GuidedRunnerClient`).

## 9. Batons (what F-merge must land together) and the exact post-F-merge commands

Land with the D1 source and `dist`: nothing of mine depends on a file outside the list in section 2, except `GuidedFocusMutationJoinedIT` (apply the patch).

After root's rebuild (`clean`, build, `write-runtime-versions`) of `studio-runner/dist`:

```
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
# 1. the dist gate (must pass): 
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py bash -c 'cd backend && ./gradlew verifyRunnerDist --no-daemon'
# 2. harness unit (re-run on the final tree):
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-i-fmerge-harness --test-tasks test -- test --tests 'com.citi.put.checks.studio.support.RunnerProcessHarnessTest' --no-daemon
# 3. the three bridge/planning classes, both bridge classes named (AC-12 i addendum); expect 10 + 16 + 57 = 83:
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-i-fmerge-guided --test-tasks test -- test --tests 'com.citi.put.checks.studio.guided.session.GuidedBridgeIntegrationTest' --tests 'com.citi.put.checks.studio.guided.session.GuidedBridgePlannedIT' --tests 'com.citi.put.checks.studio.guided.session.GuidedPlanningIntegrationTest' --no-daemon
# 4. FocusMutation, after: git apply -p1 docs/qa/evidence/STUDIO-OBS-009/execution-20261018/i/w2/focus-mutation-joined-it.patch
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-i-fmerge-focus --test-tasks test -- test --tests 'com.citi.put.checks.studio.guided.translation.GuidedFocusMutationJoinedIT' --no-daemon
# 5. ReplayIT: only a full-class / full-lane run counts (AC-12 clarification): the default `test` lane and the guidedIncrementalTest lane, after lane S has reconciled F1:
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-i-fmerge-replay --test-tasks test guidedIncrementalTest -- test guidedIncrementalTest --no-daemon
```

Credit a guided IT run only when the collector's `dist.digest` before equals the F-merge build receipt's `distDigestAfter`. Do not set `OBS009_RUNNER_DIST`, and do not pass `-x verifyRunnerDist`, on a credited run. Record `lsof -nP -iTCP -sTCP:LISTEN` before each (AC-12 g); on a connect `EOFException`, `role "test" does not exist` or a connect hang, read the P4 classification rule first (AC-12 f).

## 10. Not claimed
- Any pass of the four ITs on the F-merge `dist`, or of full-class ReplayIT. Section 5's scratch-emit results are real runs of the real code against a build of the current source and nothing more.
- Linux behaviour of the harness (`ProcessHandle`, `kill -STOP`): macOS / JDK 21 only.
- AC-11 k's "browser tree reaped after a forced worker kill" end to end: I-T2 covers the wedged-browser stop; the forced-worker-kill listing proof stays with the fixtures tier (R2) and the co-run (F).
