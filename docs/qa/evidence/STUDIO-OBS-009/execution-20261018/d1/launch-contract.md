# STUDIO-OBS-009 drop D1.0: the runner launch contract (interface drop)

- **Author:** Dex (@dev, runner). **Date:** 2026-10-18. **Status:** DRAFT FOR REVIEW. Not binding until @architect has reviewed it against rulings A2 and A3 and @devops (Gage) has co-signed (`lanes.json` → `w0Refold20261017` → lane D1.0, verify).
- **Consumers:** D2 (chart, Dockerfile, deployment tier), D3 and I.0 (backend client, TLS, IT harness), I (guided ITs), F (merge of the fold). They build against the names in this file.
- **What this is:** the contract of ONE process, `node dist/main.js`: its configuration keys, its guided enable switch, its probe, its readiness signal, its exit codes and its PID-1 behaviour.
- **What this is not:** a source change. D1.0 changed no source, no chart and no story (the only file written by D1.0 besides this one is `receipt.md`).
- **Inputs read:** `studio-runner/src/{main.ts,probe.ts,server/{config,server,routes,application,identity,logging}.ts,run/{guidedMain,guidedConfig,guidedShutdown,tree,recordingScratch,browser}.ts,guided/{transport,ownership,runtime}.ts,compat/runtime-versions.ts}`, `studio-runner/{Dockerfile,package.json}`, `helm-chart/put-checks/{values.yaml,templates/studio-runner-deployment.yaml,templates/_helpers.tpl}`, `test/run/{guidedMain,tree}.test.ts`, the T0 ruling (`prep-20261016/t0-rulings/ruling.md` A2, A3, A4, A6 and §4 PID-1) and the story (AC-1, AC-3, A2.6).
- **What I ran:** `grep`, `sed -n`, `cat -n`, `wc`, one `openssl x509 -dates` on the test fixture, and four `node` start-ups of the existing `dist` that fail before listening (`node dist/main.js` with an empty runner environment and with an unknown key; `node dist/run/guidedMain.js` with no config file and with `NODE_OPTIONS` set), only to read exit codes and stderr lines. No Gradle, no build, no install, no listener bound.

## 0. Legend

| Tag | Meaning |
|---|---|
| **[V]** `file:line` | verified today by reading that line (or by the stated run) |
| **[I]** | inference from [V] facts |
| **[R]** | fixed by the T0 ruling (`ruling.md`), item cited. These are not mine to change. |
| **[P]** | proposed by D1.0 because the ruling leaves the name or value open ("names fixed by drop D1.0", skeleton RKS-00). @architect ratifies or changes each [P] at review. |

Line numbers are those of the working tree on 2026-10-18 (source tree digest of W0, `w0/baseline-manifest.json`).

## 1. Process model

| # | Statement | Tag |
|---|---|---|
| 1.1 | One entrypoint, `node dist/main.js`. `run/guidedMain.ts`, `run/guidedConfig.ts` and the `start:guided` script are deleted. There is no second CMD and no mode that selects a different process. | [R] A2.1 |
| 1.2 | Today: `package.json:18` `"start": "node dist/main.js"`, `:30` `"start:guided": "node dist/run/guidedMain.js"`; `Dockerfile:61` `CMD ["node", "dist/main.js"]` (comment `:58-60`: exec form so SIGTERM reaches node). | [V] |
| 1.3 | After A6 the image CMD is `["sh","-c","ulimit -c 0 && exec node dist/main.js"]`. `exec` keeps node as the container's main process. The chart still sets no `command` or `args`. | [R] A6 |
| 1.4 | Guided mode is configuration of that one process, not another process: `STUDIO_RUNNER_GUIDED_ENABLED` (boolean, default false). | [R] A2.2 |
| 1.5 | Capacity is not a key: it stays the code constant 1 (`guided/transport.ts:70` `insist((options.capacity ?? 1) === 1, 'CONFIGURATION_DENIED')`). The governed policy and its hash are not a runner key: they arrive only in the hash-bound runner context, and a mounted `applicationPolicy` or `rules` is refused in every form. | [R] A2.3, A2.4; [V] `transport.ts:70-74`, `guidedConfig.ts:22-23` |
| 1.6 | Guided mode is enabled only where the runner Deployment renders exactly one replica (chart render fails when `guided.enabled` and (`replicaCount != 1` or `autoscaling.enabled`)). `values.yaml:382` renders 2 today and `:388-393` has optional KEDA 2-4. Provisional (root R1). | [R] A2.6; [V] `values.yaml:382,388-393` |

## 2. Configuration surface

### 2.1 Rule, unchanged

Every accepted key is a `STUDIO_RUNNER_*` name listed in `KEY_SPECS` (`server/config.ts:175`; `ACCEPTED_KEYS` `:417`). Any other `STUDIO_RUNNER_*` name in the environment is a startup refusal (`refuseUnknownKeys` `:459-474`). A key whose value is empty or whitespace counts as not provided (`parseKeys` `:488`). This stays. `ACCEPTED_KEYS` has 45 entries today [V, `node -e` importing `dist/server/config.js` printed 45; same count as skeleton RKS-00]; this contract adds 12 (4 listener, 8 guided) for **57**.

### 2.2 The 13 mounted fields, and where each goes

`guidedConfig.ts:14` lists the 13 mounted JSON fields. Each is accounted for:

| Mounted field (`guidedConfig.ts:14`) | Becomes | Tag |
|---|---|---|
| `host` | existing `STUDIO_RUNNER_HOST` (`config.ts:182`, default `0.0.0.0`). The one listener's. | [R] A2.2 |
| `port` | existing `STUDIO_RUNNER_PORT` (`config.ts:181`, default 8080, min 0). The one listener's. | [R] A2.2 |
| `tlsKeyFile`, `tlsCertFile`, `tlsCaFile` | `STUDIO_RUNNER_TLS_KEY_FILE`, `_CERT_FILE`, `_CA_FILE` (listener keys, section 2.3) | [R] "file paths" A2.2; names [P] |
| `controllerCertificateFingerprint256` | `STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256` (listener key, section 2.3) | names [P]; placement [I] from A3 |
| `workerId`, `journalDirectory`, `controllerIssuer`, `controllerSubject`, `controllerPublicKeyFile`, `callbackBaseUrl`, `callbackTokenFile` | seven `STUDIO_RUNNER_GUIDED_*` keys (section 2.4) | names [P]; `callbackBaseUrl` "stays its own https-only key" [R] A2.2 |

Why the TLS keys and the fingerprint are **not** `GUIDED_*`: A3 rules that there is no plaintext listener "in any configuration" and that the run, validate and bridge routes all require the controller fingerprint. A2.2 also rules that with guided off "any guided key present is refused". So a key that a replay-only deployment needs cannot be a guided key. [I]

### 2.3 Listener keys (every deployment, guided or not)

| Key | Kind | Required | Default | Meaning |
|---|---|---|---|---|
| `STUDIO_RUNNER_PORT` | integer, min 0 | no | 8080 | existing, unchanged. The chart renders it from `studioRunner.service.port` (`studio-runner-deployment.yaml:84`). |
| `STUDIO_RUNNER_HOST` | string | no | `0.0.0.0` | existing, unchanged. |
| `STUDIO_RUNNER_TLS_KEY_FILE` | string, absolute path | **yes** | none | PEM private key of the runner's certificate. Read once at startup. [P] |
| `STUDIO_RUNNER_TLS_CERT_FILE` | string, absolute path | **yes** | none | PEM certificate chain of the runner. Read once at startup. Also the certificate the probe presents (section 5). [P] |
| `STUDIO_RUNNER_TLS_CA_FILE` | string, absolute path | **yes** | none | PEM CA bundle. It verifies the backend's client certificate on the listener, the controller's certificate on the runner's outbound callbacks, and the runner's own certificate in the probe. Read once at startup. [P] |
| `STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256` | string | **yes** | none | SHA-256 fingerprint of the backend's client certificate, in the form Node prints it: 32 uppercase hex byte pairs joined by `:` (`X509Certificate.fingerprint256`, as the tests build it: `test/helpers/guidedTls.ts`). Compared to `getPeerCertificate().fingerprint256` (`transport.ts:80`). [P] |
| `STUDIO_RUNNER_SERVICE_IDENTITY` | string, secret | yes | none | existing. The `/v2/runs` bearer, and the probe bearer. Stays a second factor (A3). Not a file path today (`secretKeyRef` env, `studio-runner-deployment.yaml:117-121`). |
| `STUDIO_RUNNER_CALLBACK_IDENTITY`, `STUDIO_RUNNER_CALLBACK_BASE_URL` | string | yes | none | existing replay callback, **unchanged in 009** [R] A3. |

All other existing keys (object store, recording geometry, timeouts, limits) are unchanged and serve both modes; the guided worker already reads exactly the evidence subset of them (`loadEvidenceConfig`, `config.ts:603-656`, called at `guidedMain.ts:30`), so the fold has one set of evidence settings.

Startup refusals for these keys: a missing required key, an unreadable or empty file, a file that is not PEM, or a fingerprint that is not 32 colon-separated uppercase hex pairs. Each refusal is a `configuration rejected: <problem>` line and exit 78 (section 6). No problem text contains a file's content. [P]

### 2.4 Guided keys (`STUDIO_RUNNER_GUIDED_*`)

The set of "guided keys" is **exactly the names that start `STUDIO_RUNNER_GUIDED_`** other than the switch itself. [P] That makes "when false, any guided key present is refused" a prefix test and not a list that can drift.

| Key | Kind | Required when enabled | Meaning |
|---|---|---|---|
| `STUDIO_RUNNER_GUIDED_ENABLED` | boolean (`true`/`false`, case-insensitive, `parseBoolean` `config.ts:450`) | n/a | The switch. Default `false`. [R] A2.2 |
| `STUDIO_RUNNER_GUIDED_WORKER_ID` | string, 1 to 256 chars | yes | The worker identity this process owns. Must equal the backend's `studio.guided-authoring.translation.worker-id` (record `GuidedTranslationProperties`, `@DefaultValue("worker-1")`, `GuidedTranslationProperties.java:17`), because the backend assigns every session to that one id and the runner refuses any other (`transport.ts:88`, `IDENTITY_MISMATCH`). Bound by the schema: `schemas.json` `workerId` `minLength 1`, `maxLength 256`. [P] |
| `STUDIO_RUNNER_GUIDED_JOURNAL_DIR` | string, absolute path | yes | Where the per-session journal and assignment markers live (`GuidedJournal.open`, `ownership.ts:109`) and the scope of the guided recording scratch (`recordingScratch.ts:56-60`). Created with mode 0700 if missing (`recordingScratch.ts:57`). Must be writable by the container user. [P] |
| `STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER` | string | yes | The `iss` the inbound controller JWT must carry (`transport.ts:37`). |
| `STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT` | string | yes | The `sub` the inbound controller JWT must carry (`transport.ts:37`, max 256). |
| `STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE` | string, absolute path | yes | PEM RSA public key (at least 2048 bits, `transport.ts:34`) that verifies the controller JWT. Read once at startup (`guidedMain.ts:35`). |
| `STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL` | string, absolute `https:` URL | yes | The guided callback and claim destination. https only, no userinfo, no query, no fragment (`transport.ts:139`). Today this is checked only per request and throws `CONFIGURATION_DENIED` at first use; the contract moves the check to startup. [R] A2.2 "its own https-only key"; startup check [P] |
| `STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE` | string, absolute path | yes | File holding the runner's callback bearer. Re-read on **every** callback and claim (`guidedMain.ts:37-38`), trimmed. See open question Q6: who writes it. |

Cross-field rules (all refuse at startup with exit 78):

1. `GUIDED_ENABLED` true: every guided key above is required.
2. `GUIDED_ENABLED` false or absent: any non-empty `STUDIO_RUNNER_GUIDED_*` key is refused ("no half configuration"). [R] A2.2
3. `GUIDED_JOURNAL_DIR` must be disjoint from `SCRATCH_DIR` and `OBJECT_STORE_DIR`. `SCRATCH_DIR` is wiped at every start (`application.ts:174` `scratch.clearAll()`), which would erase the journal. This extends the existing disjointness rule of `validateObjectStore` (`config.ts:537-547`). [P]; see Q3.
4. `GUIDED_CALLBACK_BASE_URL` and `CALLBACK_BASE_URL` are independent keys; neither is derived from the other. [R] A2.2

### 2.5 Environment the process reads that is not a `STUDIO_RUNNER_*` key

| Variable | Behaviour | Tag |
|---|---|---|
| `DEBUG`, `PWDEBUG`, `NODE_DEBUG`, `NODE_OPTIONS` | With guided enabled, any non-empty value refuses startup `CONFIGURATION_DENIED` (`guidedMain.ts:20`; also per request `transport.ts:69,138` and per launch `browser.ts:537`). So the chart and image must never set `NODE_OPTIONS` (no `--max-old-space-size` through it). With guided disabled today `main.ts` does not check them. | [V] |
| `TMPDIR` | Guided scratch lives here, not in `SCRATCH_DIR`: `mkdtemp(join(process.env.TMPDIR ?? tmpdir(), 'checks-guided-'))` (`browser.ts:544`) and `.checks-guided-recordings` under `realpath(TMPDIR ?? tmpdir())` (`recordingScratch.ts:56`). The runner pod has `readOnlyRootFilesystem: true` (`values.yaml:481`) and the chart sets no `TMPDIR` and mounts no `/tmp`. **A guided-enabled pod cannot launch a browser until `TMPDIR` points at a writable mount.** Open question Q4. | [V] |
| `PATH`, `HOME` | Passed to the guided Chrome (`browser.ts:557` `env: { PATH, HOME, TMPDIR }`). | [V] |

## 3. Startup sequence (normative order, nothing listens before the last step)

| Step | Condition | Action | On failure |
|---|---|---|---|
| 1 | always | `loadConfig(process.env)` including the cross-field rules of 2.3 and 2.4 | one `configuration rejected: <problem>` stderr line per problem; **exit 78** [V] `main.ts:111-121`, run A and B |
| 2 | always | process-table guard `canEnumerateProcessTree(...)`: `ps -A -o pid=,ppid=` must list this process | stderr `PROCESS_TABLE_UNREADABLE` text; **exit 69** [V] `main.ts:98-102,125-129` |
| 3 | guided enabled | debug-environment refusal (2.5) | stderr line `CONFIGURATION_DENIED`; **exit 78** [P], see Q2 |
| 4 | guided enabled | `assertObservedBrowserStartup()` once per process, signature unchanged (P2) | today an uncaught `PROFILE_MISMATCH`, exit 1 (`guidedMain.ts:21,42`). Kept: **exit 1** [P], see Q2 |
| 5 | guided enabled | `canEnumerateLaunchTree()` (PID-1 guard, section 8) | stderr line `CONFIGURATION_DENIED`; **exit 78** [P], see Q2 |
| 6 | always | read the TLS key, certificate and CA; guided: the controller public key | exit 78 (rejected as a configuration problem) |
| 7 | guided enabled | RUNNER-SCRATCH sweep `prepareRecordingScratch({workerId, journalDirectory})` (`guidedMain.ts:31`) | uncaught, **exit 1** [V today as `GUIDED_WORKER_UNAVAILABLE`] |
| 8 | always | `scratch.clearAll()`, build the one HTTPS listener, `listen(PORT, HOST)` (`application.ts:172-181`) | uncaught bind error (for example `EADDRINUSE`), **exit 1** [I: `main.ts:156` is `void main(...)` with no catch, so a rejection ends the process through Node's unhandled-rejection path with code 1; not run, because binding a port was not allowed] |
| 9 | always | register one `SIGTERM`/`SIGINT` drain (`main.ts:141-148`) | n/a |

Steps 3 to 5 and 7 are the order [R] A2.5 fixes ("debug-env refusal; `assertObservedBrowserStartup()` once per process; `canEnumerateLaunchTree()` (PID-1 a); the RUNNER-SCRATCH sweep; one SIGTERM drain"). Steps 1, 2, 6, 8 and 9 are the replay path's own, placed around them.

[I] Step 2 is cheaper than step 5 and a strict subset of it (`canEnumerateLaunchTree` calls `canEnumerateProcessTree`, `tree.ts:303-304`), so the order is by cost, not by meaning.

## 4. The one listener

One `node:https` server, `minVersion: 'TLSv1.2'`, `requestCert: true`, `rejectUnauthorized: true`, `ca` from `TLS_CA_FILE` (`transport.ts:77`). There is no `node:http` listener in any configuration (today `server.ts:17` is plaintext). [R] A3

| Route | Client certificate | Peer pin | Second check |
|---|---|---|---|
| `POST /v2/validate-observed`, `POST /v2/runs`, `DELETE /v2/runs/{id}` | required, CA-verified | controller fingerprint | `Authorization: Bearer <SERVICE_IDENTITY>` (`identity.ts`, checked first on the head, `routes.ts:125`) |
| `POST /internal/v2/studio/guided-sessions/{id}/{assign\|context\|prepare\|dispatch\|observe\|stop}` (served only when guided is enabled [I]; otherwise not routed) | required, CA-verified | controller fingerprint (`transport.ts:80`) | JWT RS256, `iss` = `GUIDED_CONTROLLER_ISSUER`, `sub` = `GUIDED_CONTROLLER_SUBJECT`, `aud` = `studio-guided-runner`, `role` = `backend-controller`, lifetime at most 300 s (`transport.ts:25-38,81`); `Idempotency-Key` header; `X-Owner-Fence` header per route (`transport.ts:83-97`) |
| `GET /health`, `GET /ready` | required, CA-verified | controller fingerprint **or** the runner's own certificate fingerprint | `Authorization: Bearer <SERVICE_IDENTITY>` |

[R] A3 fixes the pin rule for the first, second and third rows. The `aud`/`role`/lifetime values are [V] `transport.ts:25-38,81`. Today the guided bridge does not serve `/health` or `/ready` and the replay server does not pin a fingerprint, so the rows combine two existing behaviours.

Refusals: a connection with no certificate, an untrusted certificate or a wrong fingerprint is closed during the handshake or answered 401, never served. Replay routes keep their `{code}` JSON bodies (`identity.ts`: 401 `IDENTITY_MISSING`/`IDENTITY_MALFORMED`, 403 `IDENTITY_REJECTED`). Guided routes keep their closed refusal bodies (`transport.ts:117-125`: 401 `AUTH_DENIED`, otherwise 409 with a code from `GUIDED_REFUSAL_CODES`).

Certificate requirements, for D2 and for whoever issues the certificates: the runner certificate must carry `serverAuth` **and** `clientAuth` extended key usage (the probe presents it as a client certificate; the guided callbacks already present the runner key pair as a client, `transport.ts:149`), and its subject alternative names must cover the Service DNS name (the JDK client verifies host names) [I] from A3 and A4. The test fixture `test/fixtures/guided-tls/cert.fixture` is `CN=localhost`, valid 2026-10-08 to 2036-10-05 [V, `openssl x509 -dates`].

Timeouts of the guided server today: `requestTimeout` 15 s, `headersTimeout` 10 s, socket `timeout` 30 s, body cap 1 MiB (`transport.ts:42,127`). The replay server sets none (`server.ts`) and caps bodies by `MAX_REQUEST_BODY_BYTES` (and 4 MiB/8 MiB for observed bodies, `routes.ts`). The single listener must keep both sets for its own routes; Q7.

## 5. The probe over TLS

Kubernetes keeps exec probes: `node dist/probe.js <path>` (`studio-runner-deployment.yaml:131-142`). **The Helm command does not change.** [R] A3

| Aspect | Contract |
|---|---|
| Invocation | `node dist/probe.js /health` or `/ready`. Any other argument: exit 1 (`probe.ts:20-24`). Paths come from `studioRunner.probes.livenessPath` and `readinessPath`. |
| Target | `127.0.0.1:$STUDIO_RUNNER_PORT` (default 8080; `probe.ts:10,25`). Unchanged. A `HOST` other than `0.0.0.0` or `127.0.0.1` makes the probe miss the listener, as today. |
| Environment read | `STUDIO_RUNNER_PORT`, `STUDIO_RUNNER_SERVICE_IDENTITY`, and new: `STUDIO_RUNNER_TLS_KEY_FILE`, `STUDIO_RUNNER_TLS_CERT_FILE`, `STUDIO_RUNNER_TLS_CA_FILE`. The probe runs inside the same container, so all five are already in its environment. Nothing guided-specific is read. |
| Transport | HTTPS. It presents the runner's own certificate as its client certificate (`key`, `cert` from the two files) and verifies the server against `TLS_CA_FILE`. [R] A3 |
| Server identity | The host name is `127.0.0.1`, which the runner certificate's SANs need not contain. The probe therefore replaces host-name verification by a pin: the peer certificate's `fingerprint256` must equal the fingerprint of the probe's own certificate file. [I]; the same technique as `controllerRequest` (`transport.ts:149`). |
| Header | `Authorization: Bearer <SERVICE_IDENTITY>` (unchanged, `probe.ts:11`). |
| Result | Exit 0 only for HTTP 200. Any other status, handshake failure, timeout (2000 ms, `probe.ts:11,15`), unreadable file or bad argument is exit 1. A blank bearer is exit 1 (`probe.ts:6`). |
| Output | The probe prints nothing. It never prints the bearer, a path or a fingerprint (`probe.ts:1` "Never prints the token", extended to the files). |
| Server side | `/health` and `/ready` accept the controller fingerprint **or** the runner's own certificate fingerprint, plus the bearer (section 4). The runner computes its own fingerprint from `TLS_CERT_FILE` at startup. No separate key. [R] A3, [I] computation |

## 6. Exit codes

| Code | When | Output on stderr | Tag |
|---|---|---|---|
| 0 | Clean end after one `SIGTERM`/`SIGINT` drain. Today `main.ts:142-146` calls `void application.drain()` and never sets an exit code, so a drain that hit its deadline still exits 0 (`drain()` returns `{completed:false}`, `application.ts:184-214`). | none | [V] |
| 1 | Any uncaught failure after configuration was accepted: listener bind error, `assertObservedBrowserStartup()` mismatch, sweep failure. Guided today prints `GUIDED_WORKER_UNAVAILABLE` and sets 1 (`guidedMain.ts:42`, run C and D). | `GUIDED_WORKER_UNAVAILABLE` today | [V] guided; [I] bind |
| 69 | The process table cannot list this process (`PROCESS_TABLE_EXIT_CODE`, `EX_UNAVAILABLE`). | the `PROCESS_TABLE_UNREADABLE` text | [V] `main.ts:98-102` |
| 78 | Configuration rejected (`EX_CONFIG`): missing required key, bad value, unknown `STUDIO_RUNNER_*` key, guided key with guided off, missing guided key with guided on. | one `configuration rejected: <problem>` per problem | [V] `main.ts:117-120`, run A and B |
| 78 | **New:** guided refusal `CONFIGURATION_DENIED` (debug environment, or the launch-tree guard of section 8). | a line starting `CONFIGURATION_DENIED` followed by a closed, value-free reason | [P]; Q2 |
| probe 0/1 | `probe.js` only (section 5). | none | [V] `probe.ts` |

Note: [R] A2.5 says a failed launch-tree guard "writes `CONFIGURATION_DENIED` and exits non-zero". Today that word is never written: the throw is swallowed by `.catch(() => { process.stderr.write('GUIDED_WORKER_UNAVAILABLE\n') ... })` (`guidedMain.ts:42`, [V] run C and D, which print `GUIDED_WORKER_UNAVAILABLE` and exit 1 for a missing config and for `NODE_OPTIONS`). The contract above is therefore a change from today, not a restatement.

Exit on drain is open (Q5): guided's `installGuidedShutdown` sets 1 when its close is unconfirmed (`guidedShutdown.ts:5`), replay's drain never sets a code.

## 7. Readiness and liveness signal

| Signal | Contract | Tag |
|---|---|---|
| Listening | The listener is bound last (step 8), so "listening" implies every guard, the sweep and the TLS/JWT loading in section 3 passed. Log line `runner.started` (`application.ts:176-180`) on stdout as redacted JSON. | [V] |
| `GET /health` | HTTP 200 `{"status":"ok","draining":<bool>}` always, including while saturated and while draining. | [V] `routes.ts:141-145` |
| `GET /ready` | HTTP 200 `{"ready":true,"draining":false,"inUse":n,"size":n}`; HTTP 503 `{"ready":false,"draining":true,...}` only while draining. Saturation alone keeps it 200. | [V] `routes.ts:147-156` |
| Drain | One flag. `SIGTERM`/`SIGINT` flips `/ready` to 503 first (`pool.beginDrain`), then waits for in-flight replay runs, then closes the listener (`application.ts:184-214`). The fold adds the guided half to the same drain: stop every owned session with `CONTEXT_LOST`, wait for the recordings to settle (bounded), close connections, then close the listener (`ownership.ts:184-187`, `transport.ts:128`). | [V] halves; [R] A2.5 "one SIGTERM drain" |
| Guided slot state | A held guided slot (a session still stopping, or a survivor after a failed kill) does **not** change `/ready` or `/health`. It shows only as `CAPACITY` (HTTP 409) on a new `assign` (`ownership.ts:123`). The `/ready` body gains no guided field (no wire change). | [P]; see Q1 |
| Log events | `runner.started`, `runner.draining`, `runner.drained` (replay path, unchanged); `GUIDED_START_FAILED` value-free line on a refused start (`transport.ts:121-123`, `diagnostics.ts:61-73`, unchanged). | [V] |

[I] The pod's `terminationGracePeriodSeconds` is derived from replay values only (`_helpers.tpl` `derivedGraceSeconds`). A guided close is not in that sum (Q5).

## 8. PID-1 behaviour

- **Rule.** With guided enabled, the process refuses to start unless `canEnumerateLaunchTree()` holds: its pid is greater than 1, and it appears (with a non-empty command line) in both the plain and the `ps -ww ... args=` process listings (`tree.ts:300-305`). Failure is the section 3 step 5 refusal: `CONFIGURATION_DENIED`, non-zero exit, before anything listens and before the sweep. The guard is not removed, bypassed or relaxed to make the fold fit a PID-1 container (story PID-1 a). [R] A2.5; [V] `tree.ts:300-305`, `test/run/tree.test.ts:209-220` (pid 1, 0, -1, NaN, 1.5 and the two missing-row cases all false).
- **Guided disabled.** No pid refusal: the replay path asks only for `canEnumerateProcessTree` (no pid test, `tree.ts:116-123`). [V]
- **In the pod.** `shareProcessNamespace: true` (`values.yaml:442`; template `studio-runner-deployment.yaml:52`; asserted for every values set by `chart.test.ts:557-568`) makes the pause container PID 1, so node has a pid greater than 1. D2 extends the assertion to guided-enabled sets (PID-1 b). [V]
- **Plain `docker run`, no init.** With the A6 CMD, `sh` is PID 1 and `exec node` keeps pid 1, so guided start is refused `CONFIGURATION_DENIED`. `docker run --init` (an init forwards SIGTERM and node is not pid 1) starts. The image smoke uses `--init`; `tools/corun.sh` and host runs start node as a host process, pid greater than 1 [I]. PID-1 c requires each launch path to say which one it is. [R] §4 PID-1
- **Needs `ps`.** The image already must carry `procps` (step 2, exit 69).

## 9. What each consumer must do with this

| Consumer | Needs from this drop |
|---|---|
| **D2 (chart, Dockerfile, deployment tier)** | Add the 12 names to the closed list `_helpers.tpl:156` `put-checks.studioRunner.acceptedEnvKeys` (it states "the loader accepts thirty-six keys"; that sentence is already stale at 45) and render them from values; the TLS, controller key and callback token files come from read-only Secret mounts, the journal directory from a writable volume owned by `pwuser`; list the file-path keys in the "managed by the chart" set (`_helpers.tpl:167-180`, the `has $key (list ...)` test); `chart.test.ts:396` keeps asserting rendered env is a subset of `ACCEPTED_KEYS`; the render-fails rule of A2.6 (`replicaCount != 1` or `autoscaling.enabled` with guided on); `shareProcessNamespace: true` for guided sets; set no `NODE_OPTIONS`; make `TMPDIR` writable (Q4); the A6 CMD; the readiness/liveness commands stay as they are; certificate requirements of section 4. |
| **D3 and I.0 (backend)** | The backend's client certificate fingerprint is the value of `CONTROLLER_CERTIFICATE_FINGERPRINT256`; the backend's JWT must carry `iss`, `sub`, `aud=studio-guided-runner`, `role=backend-controller`, RS256 with a key of at least 2048 bits, lifetime at most 300 s; the worker id is `studio.guided-authoring.translation.worker-id`; `runner-origin` and `studio.runner.base-url` are https URLs of the runner Service ([R] A4); the callback bearer the runner presents is verified by `GuidedInternalSecurity` with `aud=studio-guided-controller`, role `owning-worker`, lifetime at most 300 s (`GuidedInternalSecurity.java:201-210`). The `StudioRunnerTls` property names are D3's to fix; this drop does not. |
| **I (guided ITs)** | One test CA; every runner-spawning test passes the five new listener keys and, for guided, the eight guided keys by environment; the runner must be started over HTTPS. |
| **F (merge)** | Ports `test/run/guidedMain.test.ts` by name into `test/server/guidedMode.test.ts` ([R] A2.1); deletes `guidedMain.ts`, `guidedConfig.ts`, `guidedShutdown.ts` (folds into the one drain) and the `start:guided` script; the existing unit tests that call `loadConfig` with a minimal environment need the four required listener keys (or a test helper that supplies them): count them when the merge is planned. |

## 10. Open questions for @architect

| # | Question | Why it matters | My default if not answered |
|---|---|---|---|
| Q1 | Should a held guided slot affect `/ready`? Today (and in section 7) it does not. KL-015-D5 shows a slot can be held until the process ends (survivor after a failed kill, or an unbounded close). | Liveness and readiness would stay green over a pod that can serve no guided session, and Kubernetes would never restart it. This is a ruling, not a name. | Keep it out of both probes in 009; D5 a decides whether a held slot ends the process. |
| Q2 | Exit code and stderr text for the guided refusals (section 6). Ruling item 5 says "writes `CONFIGURATION_DENIED` and exits non-zero" and does not fix the number. | D2's image smoke and the corun harness will assert on it. | 78 with a `CONFIGURATION_DENIED <reason>` line, reason from a closed list (`DEBUG_ENV`, `LAUNCH_TREE`), value-free. Build-identity mismatch (`PROFILE_MISMATCH`) and sweep failure stay exit 1. |
| Q3 | May the journal directory sit under the object-store volume, and is the "disjoint from `SCRATCH_DIR` and `OBJECT_STORE_DIR`" rule right? `SCRATCH_DIR` is wiped at every start (`application.ts:174`). | A journal inside scratch is erased at each restart. | Disjoint from both, enforced by the loader. |
| Q4 | Guided scratch uses `TMPDIR` (`browser.ts:544`, `recordingScratch.ts:56`), not `SCRATCH_DIR`; the pod is `readOnlyRootFilesystem: true` and the chart sets no `TMPDIR`. Which is the fix: (a) the chart sets `TMPDIR` to a path on the existing scratch emptyDir, (b) a second emptyDir at `/tmp`, or (c) guided scratch follows `SCRATCH_DIR` (a source change, so lane D1 or F)? | Option (a) puts the guided scratch inside a directory the replay path clears at start. Without any of them a guided browser cannot launch in the pod. | (b), a dedicated emptyDir, because it needs no source change and no `SCRATCH_DIR` coupling. D2 sizes it. |
| Q5 | Drain exit code and the grace budget. Guided `close()` rejects with `CONTEXT_LOST` when a session stop is unconfirmed and sets exit 1 (`guidedShutdown.ts:5`); the replay drain never sets a code; `derivedGraceSeconds` has no guided term. | A pod that cannot confirm a browser is dead must end the process (the slot is only released by the process ending). | Exit 1 when any guided stop was unconfirmed, 0 otherwise; the grace sum gets a guided term once D5 rules the close bound. |
| Q6 | Who writes `GUIDED_CALLBACK_TOKEN_FILE`? The backend accepts worker tokens only as RS256 JWTs with `aud=studio-guided-controller`, `role=owning-worker` and a lifetime of at most 300 s (`GuidedInternalSecurity.java:201-210`); the runner re-reads the file on every call. A Kubernetes Secret is static and the pod must stay a single container (`values.yaml:431-447`). | Either the file is a Secret that is re-minted every few minutes by a controller outside the pod (which nobody owns today), or the runner must mint its own JWT from a private key. The second is a source change and a new secret in the pod. | Not decided here. This is a deployment gap in the existing design (the guided worker has never been deployed by this chart), so I list it as blocking guided-enabled shared environments. |
| Q7 | Which HTTP server timeouts does the single listener keep? Guided uses `requestTimeout` 15 s, `headersTimeout` 10 s, socket `timeout` 30 s; replay sets none. A 30 s socket timeout applies to a connection that waits for a reply: the KL-015-D5 probe (`pr-rt/probe-results.json`, run 2) shows the guided server ending an unanswered `stop` or `context` connection with no HTTP response at 30.006 to 30.010 s, even though the close behind it then succeeded. | Whether a reply can ever be sent for a close that takes about 30 s is decided by this value together with the D5 ruling (`pr-rt/receipt.md`, finding 2). Not a name question; it changes the listener's behaviour. | Keep guided's values for the guided route family and Node's defaults for replay routes, set per request, not per server. |
| Q8 | Placement of the four required listener keys. As `required: true` in `KEY_SPECS` they make every existing `loadConfig` test fail (they pass a minimal environment). | Cost of the fold for lane F and the 100-odd server tests. | Required by the listener constructor and by `main`, not by `loadConfig`, so `loadConfig` tests keep passing; `main` tests get a helper. |
| Q9 | `GUIDED_WORKER_ID` versus the existing `STUDIO_RUNNER_INSTANCE_ID` (`config.ts:184`, defaults to a random value). The worker id must match the backend's configured id; the instance id identifies the process in every replay admission. | Merging them would make the replay identity fixed per environment. | Keep both. |
| Q10 | The ruling fixes only `GUIDED_ENABLED`. Do you ratify the other eleven names in sections 2.3 and 2.4 (all [P])? | D2, D3 and I code against them from this drop. | Ratify, or return a list of renames; the chart list and the tests change in one place. |

## 11. Co-sign request to @devops (Gage)

Please co-sign, or return corrections on, these items (lane D1.0 verify: "@devops co-sign"):

1. **Section 8, PID-1:** the refusal on pid 1, the `shareProcessNamespace: true` dependence, the plain-`docker run` result (`CONFIGURATION_DENIED` unless `--init`), and that the image smoke and `tools/corun.sh` take the `--init` or host-process path. Record which launch path each uses (PID-1 c).
2. **Section 2.5 and Q4:** `NODE_OPTIONS` must be unset in the image and chart when guided is on, and `TMPDIR` must name a writable mount in a pod with a read-only root.
3. **Section 4:** the certificate requirements (`serverAuth` and `clientAuth` EKU, SANs covering the Service DNS name) and the mounts for the TLS key, certificate, CA, controller public key and callback token (read-only Secrets), plus a writable journal volume.
4. **Section 5:** the probe command is unchanged and now needs the five environment values that are already in the container.
5. **Q6:** the callback token file has no owner today. This blocks any guided-enabled shared environment and is a platform question (ED-02 / SRE), not a runner one.
6. **Section 1.6 and A2.6:** the one-replica render check, and that guided-enabled environments give up the two-pod replay redundancy (Studio v1 decision D3). Provisional (root R1).

In-cluster behaviour (a node pid other than 1 in a deployed pod, probe success over TLS, the drain on `SIGTERM`) stays "unrun, owner @devops" until a cluster exists; nothing here claims it.

## 12. Not claimed

- No source, chart, Dockerfile, story or lock file was changed by D1.0.
- No listener was bound and no container was started. The exit codes in section 6 marked [V] come from running `dist` start-ups that fail before binding; the bind-failure code is [I].
- The 11 [P] names, the exit code 78 for the new refusals, the probe's fingerprint pin and the startup validation of the callback URL are proposals until @architect ratifies them (Q2, Q10).
- The key count (57) is 45 counted today plus 12 proposed.
