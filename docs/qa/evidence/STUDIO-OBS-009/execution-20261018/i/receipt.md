# STUDIO-OBS-009 W1 lane I.0: RunnerProcessHarness API receipt

- **Author:** Dex (@dev, backend test infra). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No dist rebuild. No production code or migration change; no existing test touched.
- **Built against:** `../d1/launch-contract.md` (D1.0), which is a **draft** until @architect and @devops sign it. Every D1.0 name the harness uses is a `KEY_*` constant in one place, so a rename is a one-file change.
- **Scope kept:** API, javadoc and a fake-process unit test. The guided ITs are **not** switched to it (that is lane I proper).
- **Legend:** [V] verified by running or reading; [I] inference, not run.

## Files (sha256 of the final bytes)

| File | sha256 | Lines |
|---|---|---|
| `backend/src/test/java/com/citi/put/checks/studio/support/RunnerProcessHarness.java` (new) | `dc291c0d85e3c66157a9fb30e48d0d1035c1da73b610d4239225fdf218e36b47` | 1099 |
| `backend/src/test/java/com/citi/put/checks/studio/support/RunnerProcessHarnessTest.java` (new) | `87cb8e1033878bab5891aa48f973e0a12b09cbd93532c5733d0b70e7555cda90` | 969 |

(`RunnerTestTls.java` and `StudioRunnerTlsTest.java` are D3.0's; I.0 uses `RunnerTestTls`, which D3.0 delivered first.)

## IDS log

| Decision | Choice | Why |
|---|---|---|
| Spawn code | CREATE | `GuidedBridgeIntegrationTest` inlines a `ProcessBuilder` for `guidedMain.js` with a TCP-connect readiness probe; `GuidedPlanningIntegrationTest` only asserts `worker.descendants()` is empty afterwards. Nothing captures descendants before a kill. |
| Port selection | ADAPT `LocalEmbeddedPostgresConfig.choosePort/exclusivelyFree` (exclusive bind on both loopback families, no `SO_REUSEADDR`) | The originals are package-private in a production package; I may not widen them. Range moved to 33000-39999 so it cannot meet the embedded PostgreSQL range (20000-32767) or the ephemeral range. |
| `dist` digest | REUSE the collectors' algorithm (`.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py`) in Java | QA compares the spawned dist's digest with the collectors' `distDigest`. |
| Zombie rule | REUSE the macOS finding (alive, no command = needs no signal) | memory `macos-zombie-processhandle`, verified 2026-10-16 |

## The API

`RunnerProcessHarness.builder(RunnerTestTls)` ... `.start()` ... `.awaitReady(Duration)` ... `close()`.

| Need | API |
|---|---|
| Spawn `node dist/main.js` with TLS (AC-3) | Builder: `distDirectory` (default `../studio-runner/dist`), `node`, `host` (default `127.0.0.1`), `port` (0 = pick), `serviceIdentity`, `callbackIdentity`, `callbackBaseUrl` (required), `controllerFingerprint` (default = the test backend certificate's), `guided(Guided)`, `env(name, value)` (override, so a negative test can break a value), `workDirectory`. The child gets the D1.0 listener keys from the test CA: runner key / certificate / CA bundle paths and the backend certificate's fingerprint. |
| Child environment is clean | Every inherited `STUDIO_RUNNER_*` and `DEBUG` / `PWDEBUG` / `NODE_DEBUG` / `NODE_OPTIONS` is removed (a stray key refuses startup; a guided runner refuses the debug variables, D1.0 2.5). `TMPDIR` is the harness's private directory. No secret is on the command line. |
| Guided mode | `Guided(workerId, journalDirectory, controllerIssuer, controllerSubject, controllerPublicKeyFile, callbackBaseUrl, callbackTokenFile)` adds exactly the eight `STUDIO_RUNNER_GUIDED_*` keys; without it none is set (D1.0 2.4 rule 2). The files and the controller JWT are the IT's to create. |
| Wait for readiness (AC-12 h) | `awaitReady`: the spawned process is alive **and** its own log carries `runner.started` **and** `GET /ready` over mutual TLS as the test backend returns 200 `{"ready":true}` with the bearer, the server certificate chaining to the per-instance CA and covering the address. Exit before ready throws `RunnerStartException` with `exitCode()` and `exitKind()` (`CLEAN`, `STARTUP_FAILURE` 1, `PROCESS_TABLE_UNREADABLE` 69, `CONFIGURATION_REJECTED` 78, `OTHER`). Messages carry the exit code, kind and log path, never log content or the bearer. |
| Dist digest per run (AC-12 i) | `distDigest()`, computed before the spawn. The Gradle `verifyRunnerDist` task of ruling A14 is not this lane's. |
| Worker-kill fault and descendants (AC-11 k) | `captureTree()`, `kill9()` (captures first, SIGKILLs, reaps nothing), `survivorsOf(facts)`, `survivingGuidedBrowsers()` (processes whose command line carries this harness's directory name and `checks-guided-`). |
| Reap on teardown (AC-11 k) | `teardown()` / `close()` (idempotent): capture descendants first, SIGTERM and wait the grace, SIGKILL; then for every process captured now or earlier that is still the same live process: SIGTERM, wait, SIGKILL, wait. `TeardownReport(exitCode, escalatedToForce, capturedBeforeKill, signalled, survivors, zombiesIgnored)` with `assertNoSurvivors()`. |
| Port | `exclusivelyFreePort()`, `exclusivelyFree(address, port)` (static). `origin()` is `https://127.0.0.1:<port>` (numeric, not `localhost`, which can resolve to `::1` first where a runner bound to `127.0.0.1` is not listening). |

Seams for the unit test (and for any IT that wants them): `launcher(...)`, `readyCheck(...)`, `processes(...)`, `inheritedEnvironment(...)`.

### Safety rules in the code

It signals only the process it spawned and processes captured from that process's own tree. Before every signal it re-checks that the process is alive, is not a zombie, and still has the captured start instant, so a re-used pid is never signalled. It never captures or signals pid 1 or below, or the test JVM. It never builds the runner: a missing `dist/main.js` is a refusal that names the file.

## Verification [V]

Collector, same shape as the other lanes, `--tests 'com.citi.put.checks.studio.support.RunnerProcessHarnessTest'`. Results in `../execution/`.

| Label | Total / passed / failed / skipped | sourceStable | distStable | results sha256 |
|---|---|---|---|---|
| `obs009-i-api01` | 24 / 24 / 0 / 0 (exit 0) | true | true | `c4e3a1d5ddb5383564d34057414397792f0e850e7d26e107b0106da9b872acf6` |
| `obs009-i-api02` (final bytes; a javadoc-only edit followed api01) | 24 / 24 / 0 / 0 (exit 0) | true | true | `d01f326ad015704328117e9b3825413db35a9736806e8a4a23c33c487281691f` |

`dist` digest before and after, both runs: `897182d5…`. `lsof` preflight files: `lsof-before-obs009-i-api01.txt`, `...-api02.txt`.

What the 24 cases prove: the child environment and command line (stray keys and debug variables removed, contract keys present, guided keys only when guided, override wins, no secret on argv or in `toString()`); readiness needs the event before it asks the check; exit classification for 78 / 69 / 1 / other with no log content in the message; a not-ready timeout leaves the process for teardown; teardown order (descendants read before any signal, term before kill, force-kill after the grace for a parent or a descendant that ignores SIGTERM, an unkillable descendant is reported and `assertNoSurvivors` fails); zombies, a re-used pid, pid 1 and the test JVM are not signalled; idempotent teardown; a parent that exited before teardown still gets its captured children reaped; `kill9` captures first and leaves reaping to teardown; the guided-browser listing matches only this harness's directory; the dist digest equals the collectors' algorithm on a fixture computed with the collector's own code (including `a/x.js` sorting before `a-b/x.js` and a quote in a file name) and the JSON escaping matches Python's; an occupied port is not "exclusively free"; and the default readiness check against **real TLS listeners**: accepts a CA-issued runner with the right bearer, refuses a 503 draining answer, a wrong bearer, a stray listener on the same address presenting a certificate the CA did not issue, and nothing listening.

Cross-checks outside the unit test [V]:

- `RunnerProcessHarness.distDigestOf(studio-runner/dist)` = `897182d58bbbe5755604d283cddd2af782c1d068dd66e365d3145615f839df9c`, equal to the `distDigest` the collectors record for the current dist.
- A real-process smoke through the default launcher against the **current, pre-fold** dist: `awaitReady` threw `RunnerStartException exit=78 kind=CONFIGURATION_REJECTED` (the pre-fold runner refuses the four new listener keys as unknown), the message carried the exit code and log path only, teardown found 0 descendants and 0 survivors, and no `dist/main.js` process remained. I removed the temp directory that run created. This confirms the launch / environment / classification / teardown path on real node and, as expected, that the harness cannot run against the current dist until D1 is folded and F rebuilds it.
- Static gates (spotless over the whole project, checkstyle main and test, spotbugs main) green in one run: `../lint/obs009-w1-static-gates-gradle.log`.

## Not proven / disclosed

- **Never run against a TLS runner.** D1 does not exist yet, so the default readiness check has been exercised against test servers shaped like D1.0 section 5 and 7, not against the runner. It assumes `GET /ready` accepts the backend certificate's fingerprint plus `Authorization: Bearer <service identity>` and answers `{"ready":true,...}` (D1.0 section 4 and 7, ruling A3). If D1 differs, that is one method (`readyOverTls`).
- `runner.started` is matched as a substring of the log. D1.0 names the event but not its exact JSON shape; a stricter match would need that shape.
- The `Guided` journal/JWT/public-key/token files are the IT's to create, so Q6 of D1.0 (who writes the callback token file) is not something the harness settles.
- The default work directory under the system temp directory is not deleted (a failure message points at the log in it). Pass `workDirectory` under `@TempDir` to have it removed.
- Platform scope: `ProcessHandle` behaviour verified on macOS / JDK 21 only.

## Notes for lane I and for the AC-12 h item

- **AC-12 h (the `GuidedPlanningIntegrationTest` `RUNNER_PORT` hazard) is lane I's edit; the approach is named here:** drop `new ServerSocket(0)` and the loopback-only probe; take the port from the harness (exclusive bind on both loopback families) and replace the `127.0.0.1` socket probe with `awaitReady` (alive + own log event + mutual-TLS `/ready` against the per-instance CA). Assertions stay unchanged.
- Teardown for guided ITs: call `harness.close()` then `harness.teardownReport().assertNoSurvivors()`; for the worker-kill case use `kill9()`, assert on `survivorsOf(...)` / `survivingGuidedBrowsers()` after the product's reap window, then `close()` reaps what is left.
- Pre-existing, **not mine**, still on the host at the end of this work: four `Google Chrome for Testing` processes with `checks-guided-*` profiles under the default `TMPDIR` (pids 5083, 5095, 13577, 13581). I did not touch them; `survivingGuidedBrowsers()` ignores them because it scopes to the harness's own directory.
