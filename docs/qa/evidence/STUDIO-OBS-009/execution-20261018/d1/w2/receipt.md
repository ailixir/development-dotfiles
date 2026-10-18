# Receipt: STUDIO-OBS-009 W2 lane D1 (the single entry point, fail-closed TLS listener, probe over TLS, RUNNER-SCRATCH fold)

- **Agent:** Dex (@dev, runner). **Date:** 2026-10-18. **Mode:** YOLO, no questions asked.
- **Location note:** `d1/receipt.md` is lane D1.0's receipt and is untouched. This W2 receipt is `d1/w2/receipt.md` and `receipt.json`.
- **Legend:** [V] verified by running or reading it today; [I] inference.
- **Interface:** `d1/launch-contract.md` (D1.0) as amended by `w1.5/ruling-part1.md`, plus the runner-side items of `d1/devops-cosign.md` and tests D1-T1..T3.

## 1. Verdict

**GREEN on the D1 write set, in a scratch tree that is the live tree plus one out-of-set test patch. RED in the live tree until that patch lands.** The reason is one fact, not a defect in the lane. Every unit test that builds a runner through `test/helpers/harness.ts` (and the raw helpers in `test/helpers/runner.ts`) assumed a plaintext listener. The lane's own rule (no plaintext listener in any configuration, ruling A3) makes that impossible. Those helpers, `test/server/cancel.test.ts`, `test/isolation.test.ts`, three fixtures-tier files and `test/helpers/recordingScratchWorker.mjs` are outside the D1 write set (`lanes.json` gives harness.ts and the fixtures-tier files to P2, cancel.test.ts to R1). I did not edit them. The change is shipped as `out-of-set-tests.patch` (sha256 `c291c3fd04602e06f80671bcd1756253f17f08c2756cf4e45f1029eb20018cd7`, 10 files, `git apply --check -p1` passes on the live tree today, and applying it to copies of the live files reproduces the scratch-tree files byte for byte [V]).

| Tree | Command | Result |
|---|---|---|
| **Live** (D1 only) | the lane's verify command 1, 12 files | exit 1: 141 passed, 35 failed, 1 skipped. All 35 are `createHarness` -> `createApplication` without the `listener` dependency (routes 28, drain 4, timeline 3) [V]. `logs/verify-live-final.log` |
| **Live** | full unit tier, before the last test edits | 165 failed, 2213 passed, 45 skipped: 13 files, all through `createHarness` (plus `test/isolation.test.ts`, 1, which asserts `node:http`). `logs/live-full-unit.summary.txt` |
| **Scratch** (live + patch) | the same verify command | exit 0: **176 passed, 1 skipped, 0 failed** in 12 files. `logs/verify-scratch-final.log` |
| **Scratch** | full unit tier with coverage (thresholds enforced) | exit 0: 108 files passed, 1 skipped; **2394 passed, 29 skipped, 0 failed**. `logs/full-unit-scratch-final.log` |

The 1 skipped test is the existing `it.skip` SIGKILL case in `drain.test.ts`. No new skip.

## 2. What was built (acceptance criteria, local half)

| AC | Local result |
|---|---|
| **AC-1 fold** | `node dist/main.js` is the only entry point. `src/run/guidedMain.ts`, `guidedConfig.ts` and `guidedShutdown.ts` are deleted, `start:guided` is gone from `package.json`. Guided mode is `STUDIO_RUNNER_GUIDED_ENABLED` (default false). 12 keys added, 57 accepted (the 45 plus 4 listener plus 8 guided). `createGuidedServer` is split into `createGuidedBridge` (no socket: `handle`, `closeSessions`) and a thin wrapper, so the bridge is served on the one listener. The guided half joins the one drain, concurrently with the replay half, before the listener closes (Q5): `drain()` returns `{completed, guidedClosed}`, and `main` sets exit 1 only when a guided stop is unconfirmed. Capacity stays the constant 1; there is no capacity key and no policy-hash key (asserted). |
| **PID-1 a** | `canEnumerateLaunchTree()` is startup step 5 (after the debug-environment refusal and the build-identity check, before the TLS files, the sweep and the listener). Not removed, bypassed or relaxed; `main.ts` has no pid exception (asserted). Negative cases: a refusing seam gives `CONFIGURATION_DENIED LAUNCH_TREE`, exit 78, nothing else runs; `canEnumerateLaunchTree(1)` is false (and `test/run/tree.test.ts` still drives its pid cases). PID-1 b, c, d are D2 / @devops. |
| **AC-2 runner fail-closed** | Every missing or malformed piece is a startup refusal, exit 78, one value-free line: any of the 4 listener keys, any of the 7 guided keys when the switch is on, a guided key when it is off, a bad callback URL, a fingerprint not in Node's form, an unreadable / empty / non-PEM TLS file, a key that does not match the certificate, a controller public key that is not RSA of at least 2048 bits, an EKU extension without `serverAuth` or without `clientAuth` (ruling 1.5 d). The backend half of AC-2 is D3 / I. |
| **AC-3 runner TLS + client cert** | One `node:https` server: `requestCert`, `rejectUnauthorized`, `minVersion TLSv1.2`. No `node:http` server exists anywhere in `src` (asserted by a source scan). Peer pin before the bearer: `PEER_REJECTED` (401) for a CA-issued certificate that is not the pinned controller, on every route except the probe's `/health` and `/ready`, which also accept the runner's own certificate (leaf of the file). Guided routes: the bridge pins and checks the JWT itself; with guided off they answer the replay 404 `NOT_FOUND`, before any JWT work, after the pin. Timeouts are the guided values for the whole listener (D1-T1). The probe is an HTTPS client of its own pod: its own certificate as client certificate, CA verification, leaf pin instead of host name, silent, exit 0 only on 200, files read at every exec. The Helm command is unchanged. The self-signed-CA backend IT and the JVM client are D3 / I / F. |
| **AC-4 `STUDIO_RUNNER_VAULT_ADDRESS`** | Refused as an unenumerated key at startup: exit 78, names the key, never the value, nothing listens (`drain.test.ts` through `main`, and the privacy sweep in `guidedMode.test.ts`). The container-level run is D2 / @devops (no Docker authorization). |
| **RUNNER-SCRATCH fold** | `main` calls `prepareRecordingScratch({workerId, journalDirectory})` as step 7, before anything listens, and hands the swept scratch to the guided recorder. A real-sweep case seeds a dead owner's incarnation (marker pid made unusable, a WebM scratch file inside) and a live one, starts `main`, and sees the dead residue reclaimed and the live one kept. A seam case fixes the call arguments and that the application receives the same object. Failure is `GUIDED_WORKER_UNAVAILABLE`, exit 1, nothing listens. The real SIGKILL / restart proof stays 013's (`recordingScratch.test.ts`). The deployed behaviour is D2. |
| **Q2 / closed lines** | `CONFIGURATION_DENIED DEBUG_ENV` and `CONFIGURATION_DENIED LAUNCH_TREE` (78); `GUIDED_WORKER_UNAVAILABLE` (1: build identity, sweep); `RUNNER_START_FAILED` (1: any other failure after configuration, for example a bind error, and a top-level catch in the entry block). One line each; a canary sweep over 8 refusals finds no path, value or content. |
| **Q3 / Q8 / 1.5 f** | Journal disjoint from `SCRATCH_DIR` and `OBJECT_STORE_DIR`, lexically in the loader and again after realpath in `main` (symlink case tested). `loadConfig` is unchanged for existing tests; `loadListenerConfig` and `loadGuidedConfig` are the subset loaders, called by `main` after it. Guided routes are not routed when guided is off. |
| **D1-T1, T2, T3** | T1 `tlsListener.test.ts` (timeouts 10 s / 15 s / 30 s; replay and guided route on one server object). T2 `drain.test.ts` (guided and replay halves concurrent, listener closes after both, unconfirmed -> `guidedClosed:false` -> exit 1, clean -> no code). T3 `guidedMode.test.ts` with a **real held guided slot** (assign over TLS, a second assign gets 409 CAPACITY): `/ready` and `/health` bodies and status unchanged, `/ready` has exactly its four fields. |

## 3. Files (sha256 before -> after, first 12 hex; full values in `sha256-before-after.json`)

| File | Before | After |
|---|---|---|
| `studio-runner/src/main.ts` | e0bac30c0469 | 2a3e92f7401c |
| `studio-runner/src/probe.ts` | ca763aae70ac | c243ba6e2d54 |
| `studio-runner/src/server/application.ts` | e4157791ebd2 | 275524a20802 |
| `studio-runner/src/server/server.ts` | 996a7d126c95 | 0ba8ebe27c81 |
| `studio-runner/src/server/config.ts` | 613f9bc23746 | 95299924714c |
| `studio-runner/src/server/identity.ts` | 728d91aa271a | 472c00d4a292 |
| `studio-runner/src/server/routes.ts` | 760e7afa15a1 | c0c432d43f08 |
| `studio-runner/src/guided/transport.ts` | 1c6638387cea | 527471dfbe44 |
| `studio-runner/src/run/guidedMain.ts` | 90c3c6c57bf6 | (deleted) |
| `studio-runner/src/run/guidedConfig.ts` | 5e3d31c66f5a | (deleted) |
| `studio-runner/src/run/guidedShutdown.ts` | 31d7e9eb9c00 | (deleted) |
| `studio-runner/package.json` | b8b9bc81b1ba | 2a7926800745 |
| `studio-runner/test/run/guidedMain.test.ts` | 227b182a883d | (deleted) |
| `studio-runner/test/server/routes.test.ts` | ad98d3a5c66c | 5123fec482ec |
| `studio-runner/test/server/surface.test.ts` | 54ae776b1844 | 742d220329eb |
| `studio-runner/test/server/probe.test.ts` | 1e03e9e26b17 | 90983fc7ea40 |
| `studio-runner/test/server/drain.test.ts` | b86978610676 | 931059ab53fe |
| `studio-runner/test/server/storage-lifecycle.test.ts` | 052b41beee88 | 3a3c608aff99 |
| `studio-runner/test/server/observedReplayRoutes.test.ts` | bf1d723f6ba4 | c3aecdf8af1c |
| `studio-runner/test/server/observedReplayAdmission.test.ts` | e13e70f9d546 | 2478379fbc47 |
| `studio-runner/test/guided/transport.test.ts` | 74e235e9abd2 | d2fdc0b980eb |
| `studio-runner/test/server/guidedMode.test.ts` | (none) | 7da57d6389d0 |
| `studio-runner/test/server/tlsListener.test.ts` | (none) | ca3a389537e7 |

Not changed although listed in the write set: `studio-runner/src/run/index.ts` (no export was needed: `main.ts` imports `run/tree.js` and `run/recordingScratch.js` directly), `test/server/timeline.test.ts` and `test/server/resolved-value-guards.test.ts` (nothing in them touches the changed behaviour; `timeline` goes through the harness and is fixed by the patch).

Outside the write set, **not edited**: `studio-runner/test/helpers/{harness,runner,guidedTls}.ts`, `recordingScratchWorker.mjs`, `test/server/cancel.test.ts`, `test/isolation.test.ts`, `test/fixtures-tier/{observed-bootstrap-process-tree,observed-replay,observed-secret-control}.test.ts`, `studio-runner/README.md`. Their changes are the patch (all hashes of the live originals are in `sha256-before-after.json` for the helpers; the others were compared with my pre-change snapshot and are byte-identical [V]).

## 4. Tests (D1 write set)

- New: `test/server/guidedMode.test.ts` (36), `test/server/tlsListener.test.ts` (14).
- Extended: `probe.test.ts` 1 -> 4, `drain.test.ts` 11 -> 18, `routes.test.ts` 17 -> 19, `surface.test.ts` 12 -> 13, `guided/transport.test.ts` 15 -> 17 (counts of `it` blocks). `storage-lifecycle`, `observedReplayRoutes`, `observedReplayAdmission` only gain the `listener` dependency and an HTTPS client (`secureFetch`); no case added or removed.
- Deleted: `test/run/guidedMain.test.ts` (7 cases), ported by name into the first `describe` of `guidedMode.test.ts`. The titles are kept; the comment above each says what it asserts now. `refuses a document that is not JSON` has no document any more: it asserts that a path key holding one is refused. The source-text cases became behaviour: the guard-before-config case now runs `main` with an unreadable TLS key and a refusing launch-tree seam and sees only the launch-tree line.
- The EKU cases use real certificates: a 60-line DER writer in `tlsListener.test.ts` issues leaf certificates from the fixture CA key (no `openssl`, no new fixture file). `X509Certificate.keyUsage` returns `undefined` for a leaf with no EKU extension and the OID list otherwise on Node 24.20.0 [V].

### Red first
`logs/red-prechange-src.summary.txt`: the same new and changed tests against the **pre-change** src (snapshot taken before the first edit) plus the patch: **98 failed, 69 passed, 1 skipped (168)**, 8 files red. This is the expected red for a fold: the new modules and keys did not exist. The discriminating evidence is the mutation table. (I wrote the implementation before running the tests; the red log was produced afterwards from the snapshot, which I say plainly.)

### Mutation checks (scratch copy of the live src; each reverted, live-vs-scratch sha asserted equal)
All 25 mutations turn the named tests red; none stayed green. The live files were never mutated.

| Mutation | File | Red / run |
|---|---|---|
| M01 launch-tree guard removed (PID-1 a) | `src/main.ts` | 5 of 36 |
| M02 peer pin skipped on replay routes | `src/server/routes.ts` | 2 of 14 |
| M03 runner own certificate accepted on every route | `src/server/routes.ts` | 1 of 14 |
| M04 client certificate not requested | `src/server/server.ts` | 7 of 14 |
| M05 untrusted client certificate not rejected in the handshake | `src/server/server.ts` | 2 of 14 |
| M06 pin compares nothing | `src/server/identity.ts` | 2 of 14 |
| M07 guided half of the drain runs after the replay half | `src/server/application.ts` | 2 of 18 |
| M08 unconfirmed guided stop no longer exit 1 | `src/main.ts` | 1 of 18 |
| M09 RUNNER-SCRATCH sweep not called | `src/main.ts` | 5 of 36 |
| M10a guided path answers 418 instead of the replay 404 when guided is off | `src/server/routes.ts` | 1 of 50 |
| M10b guided path not pinned when guided is off | `src/server/routes.ts` | 2 of 14 |
| M11 EKU startup check removed | `src/server/server.ts` | 2 of 14 |
| M12 STUDIO_RUNNER_VAULT_ADDRESS becomes an accepted key (AC-4) | `src/server/config.ts` | 3 of 54 |
| M13 guided key without the switch no longer refused | `src/server/config.ts` | 2 of 36 |
| M14 probe pin removed | `src/probe.ts` | 1 of 18 |
| M15 listener headersTimeout changed | `src/server/server.ts` | 1 of 14 |
| M16 debug environment check removed | `src/main.ts` | 2 of 36 |
| M17 realpath journal disjointness removed | `src/main.ts` | 1 of 36 |
| M18 /ready gains a guided field | `src/server/routes.ts` | 1 of 36 |
| M19 a plaintext http server import appears in src | `src/server/routes.ts` | 1 of 36 |
| M20 guided callback URL check removed from startup | `src/server/config.ts` | 1 of 36 |
| M21 fingerprint form check removed | `src/server/config.ts` | 1 of 36 |
| M22 build identity check skipped | `src/main.ts` | 3 of 36 |
| M23 bridge peer pin removed | `src/guided/transport.ts` | 1 of 17 |
| M24 start failure not closed (RUNNER_START_FAILED) | `src/main.ts` | 1 of 18 |

## 5. Commands

All with `export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH`, from `studio-runner/`, `pnpm --config.package-manager-strict=false`.

| Command | Exit | Result |
|---|---|---|
| `exec vitest run <12 files> --coverage.enabled=false --minWorkers=1 --maxWorkers=2` (live) | 1 | 35 failed, 141 passed, 1 skipped (harness-dependent, see 1) |
| same, scratch tree | 0 | 176 passed, 1 skipped |
| `exec vitest run --minWorkers=1 --maxWorkers=2 --coverage.reportsDirectory=<scratch>` full unit tier, scratch | 0 | 108 files passed / 1 skipped; 2394 passed, 29 skipped; thresholds met (src 97.75 %, src/server 96.3 %, src/guided 99.08 % lines) |
| `run type-check` live | 2 | 5 errors, **none in the D1 write set**: `test/helpers/harness.ts` and the three fixtures-tier files (the patch fixes them) and `test/deployment/tls-client-cert.test.ts(71,10)` (unused `secretNames`, D2's file) |
| `run type-check` scratch | 2 | only `tls-client-cert.test.ts(71,10)` |
| `run lint` live and scratch | 1 | only `tls-client-cert.test.ts` 71:10 `no-unused-vars` (D2's file). `eslint` on every D1 file: clean |
| `grep -rn 'guidedMain\|start:guided\|STUDIO_GUIDED_CONFIG_FILE' studio-runner/src studio-runner/package.json` | 1 (no match) | 0 hits [V] |
| real process: `tsc --outDir <scratch>` of the live src, then `node emit-d1/main.js` / `probe.js`, replay-only and guided, 8 refusals | all as designed | `logs/real-process-smoke.md` (not `dist`) |
| fixtures tier | not run | needs Chromium and a `dist` re-emit; the three edited fixtures-tier files are type-checked only |

Leftovers: none of my processes remain (every test server closes in a `finally`). Process 44737 (`dist/run/guidedMain.js`) is on the do-not-signal list and was not touched; it is a pre-fold build and is unaffected by source edits.

## 6. Deviations (each is an [AUTO-DECISION])

1. **Out-of-set test files shipped as a patch, not edited** (rule: write only inside the write set). Consequence: the live unit tier is red for harness-based suites until root applies it (finding F1).
2. **Receipt in `d1/w2/`**, because `d1/receipt.md` belongs to D1.0.
3. **`createGuidedServer` is kept** (as the bridge in a listener of its own, with the one listener's timeouts). Six files outside the write set drive it: `test/fixtures-tier/guided-{wire,secret-ownership,secret-isolation,secret-stale-grant}.test.ts`, `guidedCloseProbe.test.ts` (R2 deletes it) and `test/run/secretReplay.test.ts`. The runner process never calls it. Delete it when they migrate.
4. **`PORT` gets a maximum of 65535** (`max` on its key spec). The retired mounted config refused ports above 65535 and the shared key did not.
5. **`main.ts` imports `launchGuidedBrowser` statically.** A dynamic `import()` is forbidden by the repository lint rule (architecture 4.5). Consequence in finding F3.
6. The three loaders each refuse unenumerated keys on their own (as `loadEvidenceConfig` does); `main` de-duplicates, so a problem is printed once.
7. `runner.started` gains a `guided` boolean. The Java harness waits only for the event.
8. Verification ran in a scratch tree (live + patch), not the live tree, for the reason in 1. Recipe: rsync `studio-runner` without `node_modules`, `dist` and `coverage`, symlink those, symlink the sibling directories the tests read, copy the patched files over.

## 7. Findings

- **F1 (root).** The unit-tier TLS migration has no owner in `lanes.json`. P2 owns `harness.ts` and the fixtures-tier files, R1 `cancel.test.ts`, R2 `vitest.config.ts`. Apply `out-of-set-tests.patch` at F-merge, or sooner if other lanes are blocked: until then **every `createHarness` suite is red in the live tree** (165 tests). From the repository root: `git apply -p1 docs/qa/evidence/STUDIO-OBS-009/execution-20261018/d1/w2/out-of-set-tests.patch`. Hunks are small; if P2 or R1 changed the same regions, apply with offset or by hand (the intent is one `listener` dependency in the harness and TLS clients in the raw helpers).
- **F2 (D2).** `test/deployment/tls-client-cert.test.ts(71)` has an unused `secretNames`; it fails `type-check` and `lint` for the whole package.
- **F3 (@architect).** Because dynamic import is lint-forbidden, `src/main.ts` now statically imports `src/run/browser.ts`, so **every runner process loads the Playwright module**, including a replay-only pod whose parent never launched a browser. Nothing is launched (the replay child is still a fork). If that cost is not wanted, the options are an eslint exception for one literal-specifier `import()` or moving the guided launcher behind an injected factory built outside the main module graph. Not decided here.
- **F4 (F, D2), narrowed.** I ran the compiled live src as a real process (emitted to a scratch directory, not `dist`; `logs/real-process-smoke.md`): replay-only and guided both start over TLS, the real `probe.js` exits 0 on `/health` and `/ready`, plaintext and certificate-less peers get no answer, `SIGTERM` drains and the process exits 0 in about 0.3 s, and the refusals above exit 78 / 1 with one value-free line each [V]. Still owed on the rebuilt `dist`, in the image and on Linux: the same run, pid 1, a read-only root, `docker stop`.
- **F5 (F).** A stale `dist/run/guided{Main,Config,Shutdown}.js` survives a plain `tsc` build. Run `clean` first or delete them; the Java guided ITs (`GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest`, `GuidedPublicationReplayIT`) still spawn `run/guidedMain.js` with `STUDIO_GUIDED_CONFIG_FILE` and must move to `RunnerProcessHarness` (lane I / F), or they fail after the fold.
- **F6 (information).** The Java `RunnerTestTls` certificates carry `serverAuth,clientAuth`, so they pass the EKU startup check. The harness key names equal the ones implemented (`RunnerProcessHarness` lines 112-133) [V by reading].
- **F7 (D2).** The runner now requires the four listener keys in every deployment. The chart's rendered env must include them for every values set (and `chart.test.ts` keeps the subset check against 57 keys). `STUDIO_RUNNER_PORT` is bounded at 65535.

## 8. Owed externally (not claimed)

- `dist` rebuild (root, F-merge) and every test that runs the real process: the Java harness smoke, the guided ITs, the self-signed-CA IT, the fixtures tier.
- Image smoke (Docker, R5, @devops): `--init` and no-`--init` PID-1 cases, `docker stop` drain under the A6 CMD, probe exec exit 0 in the container, one guided assign and recording scratch on **Linux** (`/proc/self/fd` branch), a journal on a read-only root.
- In-cluster: pid other than 1 recorded (PID-1 d), probe over TLS, `terminationMessagePolicy` display, guided browser under `RuntimeDefault` seccomp.
- U21 token issuer (Q6) for any shared guided environment.

## 9. Batons for the F-merge (land together)

1. D1 source: `src/main.ts`, `src/probe.ts`, `src/server/{application,server,config,identity,routes}.ts`, `src/guided/transport.ts`, the three deletions, `package.json`, with `out-of-set-tests.patch` (harness, raw helpers, `guidedTls.ts`, `cancel.test.ts`, `isolation.test.ts`, fixtures-tier x3, `recordingScratchWorker.mjs`, README). One change set: either half alone leaves tests red.
2. `dist`: `clean`, build, `write-runtime-versions.mjs` (F5), then the fixtures tier and the Java ITs.
3. D2: 12 new keys in `acceptedEnvKeys` and the managed list, the A6 CMD, the mounts, the `/tmp` and journal volumes (rulings Q3, Q4), probe environment, guided guard, `Recreate`.
4. I / D3: guided ITs off `guidedMain.js` (F5); `StudioRunnerTls` pin equals `STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256`.
5. `vitest.config.ts` (R2's file): drop the `src/run/guidedMain.ts` coverage exclude (line 61) and the stale comment at line 50; harmless until then.
6. `test/run/tree.test.ts` lines 205 and 247 keep `node dist/run/guidedMain.js` as argv fixture strings (named in the lane's verify); no change needed.
