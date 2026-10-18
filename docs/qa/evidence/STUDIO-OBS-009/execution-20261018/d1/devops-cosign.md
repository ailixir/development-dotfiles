# STUDIO-OBS-009 D1.0: @devops co-sign review of the runner launch contract

- **Reviewer:** Gage (@devops). **Date:** 2026-10-18. **Mode:** YOLO, docs only.
- **Subject:** `d1/launch-contract.md` (draft, 2026-10-18), section 11 (six co-sign items). Read together with `d1/receipt.md`, `pr-rt/receipt.md`, Aria's T0 rulings A2 (incl. A2.6), A3, A6 and section 4 PID-1 (`prep-20261016/t0-rulings/ruling.md`), the 010 skeleton rows RKS-00, RKO-01..08, CHT-01..09, CHV/CHE rows for `studioRunner.*`.
- **What I read (read-only):** `helm-chart/put-checks/{values.yaml,values-dev.yaml,values-uat.yaml,values-prod.yaml}`, `templates/{studio-runner-deployment,studio-runner-service,studio-runner-networkpolicy,studio-runner-scaledobject}.yaml`, `templates/_helpers.tpl`, `studio-runner/Dockerfile`, `studio-runner/src/{probe.ts,main.ts,run/guidedMain.ts,run/guidedConfig.ts,run/recordingScratch.ts,run/browser.ts,run/tree.ts,guided/transport.ts,guided/journal.ts,guided/ownership.ts,server/config.ts}`, `studio-runner/test/deployment/chart.test.ts` (shared-namespace block), `backend/.../guided/session/GuidedInternalSecurity.java`, `GuidedSessionConfiguration.java`, `GuidedTranslationConfiguration.java`, `application.yml` (guided-authoring block), `tools/corun.sh` (header).
- **What I ran:** `ls`, `grep`, `sed -n`, `find` (to confirm the chart has no `values.schema.json`; it found none). No `helm`, no `docker`, no build, no install, no cluster, no git write. The only file written is this one. I did not touch `.aiox-core/core/permissions/dispatch-governance.js`.
- **Legend:** **[V]** verified by reading the cited line; **[I]** inference from [V] facts; **[K]** general Kubernetes/Node behaviour I know but did not verify in this repo; **[U]** unrun, needs a cluster or Docker, owner named.

## 0. Verdicts

| # | Item | Verdict | Lane of the changes |
|---|---|---|---|
| 1 | PID-1 and `--init` launch paths | **CO-SIGN WITH CHANGES** | D2 (chart guard, smoke, message policy); contract wording D1 |
| 2 | No `NODE_OPTIONS`, writable `TMPDIR` | **CO-SIGN WITH CHANGES** | D2 (`/tmp` emptyDir, image-env assertion); D1 (contract text) |
| 3 | Certificates and secret mounts | **CO-SIGN WITH CHANGES** | D1 (contract section 4 is missing the callback-destination pin; startup EKU check), D2 (mounts, SANs, modes, NetworkPolicy), D3 (one backend certificate in two roles) |
| 4 | Probe environment | **CO-SIGN** (conditions in D2) | D2 tests and probe tuning |
| 5 | Callback-token owner | **CO-SIGN the finding; REFUSE every in-pod minting design** | Owner is outside the repo. Not a D1 or D2 change |
| 6 | One-replica render check | **CO-SIGN WITH CHANGES** | D2 (`fail` guard, `strategy: Recreate`, journal volume, grace term) |

Cross-cutting rulings that bind D2 (not separate items): `securityContext` and `seccompProfile` stay exactly as they are, and `shareProcessNamespace: true` stays with its one-container bound (section 7).

## 1. PID-1 and the launch paths (contract section 8, request item 1)

**Co-signed as written.**
- Refusal when `pid <= 1` (`tree.ts:300-305` as quoted by the contract, and the guard in `guidedMain.ts:25`) stays. It is not relaxed, bypassed or moved. [V]
- Dependence on `shareProcessNamespace: true`: the key is set at `values.yaml:442` and rendered at `studio-runner-deployment.yaml:52`; `chart.test.ts:557-568` asserts it for every values set. [V] With it, the pause container is PID 1 and node is not. [K]; in-cluster confirmation is **[U]**, owner @devops once a cluster exists.
- A plain `docker run` without `--init` starts `sh` as PID 1, `exec node` keeps that PID, so guided start is refused. With `--init` it starts. [I] from the code; **[U]** (Docker not authorized, R5).

**Changes.**
1. **D2: render-time guard for the pod-level case the contract does not cover.** If an environment sets `studioRunner.shareProcessNamespace: false` while guided is on, node is PID 1 in the pod, the runner refuses (exit 78 proposed) and the pod goes CrashLoopBackOff. Make that a Helm `fail` (same helper as item 6) so it never reaches a cluster. The key is a plain values key today (`values.yaml:442`), so an override is possible.
2. **D2: record PID-1 c as this table in the story evidence** (the contract only names two of the five paths):

   | Launch path | PID 1 is | node pid | Guided start | Basis |
   |---|---|---|---|---|
   | `docker run` (no init), A6 CMD | node (via `sh -c ... exec`) | 1 | refused `CONFIGURATION_DENIED` | [I]; **[U]** |
   | `docker run --init` | docker-init (tini) | > 1 | starts | [I]; **[U]** |
   | Pod, `shareProcessNamespace: true` | pause container | > 1 | starts | [K]; **[U]** in-cluster |
   | Pod, `shareProcessNamespace: false` | node | 1 | refused, CrashLoopBackOff | [I]; blocked at render by change 1 |
   | Host process (vitest/IT harness, successor of `corun.sh`) | shell or JVM | > 1 | starts | [I]. Note: `tools/corun.sh` still names `StudioCoRunIT`, which A16 records as absent, so it is not runnable today; its successor `ObservedCoRunIT` belongs to lane I |

3. **D2: the image smoke needs the negative case, not only the positive one.** Run guided-enabled **without** `--init` and assert refusal before anything listens, then with `--init` and assert it listens. The refusal is the discriminating test of the guard; a smoke that only shows the `--init` start would be green with the guard deleted. Both need Docker authorization (R5); without it record "unrun, no authorization", do not skip silently.
4. **D2: re-record the drain property with the A6 CMD** (A6 already owes it). `chart.test.ts` and the Dockerfile comment (`Dockerfile:58-60`) say the exec form is what lets SIGTERM reach node; the new `sh -c "ulimit -c 0 && exec node ..."` only keeps that property if `sh` really `exec`s. [I] it does (dash, last command of the list). **[U]**: `docker stop` must show `runner.draining` then `runner.drained`. Also update the comments at `Dockerfile:53-61` and `studio-runner-deployment.yaml:72-74`, which still say "bare `node dist/main.js`".
5. **D2: `terminationMessagePolicy: FallbackToLogsOnError` on the container.** Startup refusals (78, 69, `CONFIGURATION_DENIED`) are one value-free stderr line; in a pod they show up as CrashLoopBackOff. With this policy `kubectl describe pod` shows the line. The contract guarantees the lines are value-free (section 2.3 last paragraph, section 6), so this leaks nothing.
6. **D1 wording:** I support the Q2 default (78 plus a closed reason). For operations the number does not matter (any non-zero is CrashLoop); what matters is that the reason is closed and value-free, and that `DEBUG_ENV` and `LAUNCH_TREE` are distinct so a pod failing for PID 1 is not confused with a pod failing for `NODE_OPTIONS`.

## 2. `NODE_OPTIONS` and `TMPDIR` (contract section 2.5, Q4, request item 2)

### 2.1 `NODE_OPTIONS`

**Co-signed.** Today the chart cannot render it: `put-checks.studioRunner.env` (`_helpers.tpl:167-179`) fails the render on any `runnerEnv` key that is not in the closed accepted list, and `NODE_OPTIONS` is not a `STUDIO_RUNNER_*` key. [V] The template adds no `command`/`args` and no `envFrom` (`studio-runner-deployment.yaml:72-74`, `:128-130`). [V]

Changes:
- **D2:** add to the image checks that already use `docker image inspect` (`studio-runner/test/deployment/image.ts`) an assertion that `Config.Env` contains none of `NODE_OPTIONS`, `DEBUG`, `PWDEBUG`, `NODE_DEBUG`. That check needs the built image but not a container run. I did not verify the base image's environment (no Docker); the Dockerfile itself sets only `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, `NODE_ENV`, `HOME` (`Dockerfile:39-51`). [V]
- **Owed by Platform/SRE, unknown to me:** whether the cluster has a mutating webhook or auto-instrumentation (APM or tracing operators are the usual source) that injects `NODE_OPTIONS` or a sidecar into this pod. The runner fails closed on it (loud, not silent), but I cannot rule it out from this repository. Same question for mesh sidecar injection (section 7).

### 2.2 `TMPDIR`

**Q4: I rule for option (b): a dedicated emptyDir mounted at `/tmp`, and no `TMPDIR` environment variable.** [D2]

Reasons:
- Both guided sites fall back to `os.tmpdir()` when `TMPDIR` is unset: `browser.ts:544` and `recordingScratch.ts:56`. [V] Node's `os.tmpdir()` then yields `/tmp`. [K] So a `/tmp` mount fixes both with no variable.
- It keeps the chart's closed-environment property: no chart path emits a path-repointing variable (`_helpers.tpl:146-155` states this for `PLAYWRIGHT_BROWSERS_PATH` and `HOME`). Adding a templated `TMPDIR` is a small crack in a rule SEC-2 was built on.
- Replay is unaffected: replay's launcher sets the child's `TMPDIR` to its per-run scratch (`launcher.ts:318-319`). [V]
- (c) is a source change and couples guided scratch to `SCRATCH_DIR`; not needed.

Requirements on the volume:
- Disk-backed `emptyDir` with a `sizeLimit`, **not** `medium: Memory`. Memory-backed would count against the 2Gi container limit next to Chromium and `/dev/shm`. Size it from the recorder's byte bound (`evidenceBoundsFrom(evidence)`, `guidedMain.ts`); I did not read that number, so D2 must cite it rather than guess.
- It must stay disjoint from the browser registry (`PLAYWRIGHT_BROWSERS_PATH`) and from `$HOME`. The existing disjointness assertion (the volumeMounts comment, `studio-runner-deployment.yaml:146-148`) must be extended to the new mount.
- Ownership: the emptyDir root is group-writable via `fsGroup: 1001`. [K] `prepareRecordingScratch` creates `.checks-guided-recordings` with mode 0700 and checks uid/mode only on its own children, not on the parent. [V] `recordingScratch.ts:56-65`. So a mount root owned by root:1001 is acceptable. **[U]** in-pod.

### 2.3 Two risks the contract does not name (both for the D2 image smoke)

1. **The pod runs the Linux code path nobody has run.** `prepareRecordingScratch` uses `/proc/self/fd/...` only when `process.platform === 'linux'` (`recordingScratch.ts`, `descriptorPaths`). [V] Every probe and test run I can see was macOS arm64 (`pr-rt/receipt.md`, "One host"). The smoke must run one real guided assign and recording scratch on Linux.
2. **`GuidedJournal.open` fsyncs every ancestor directory up to `/`** (`journal.ts:19-24`). [V] On a read-only root this may or may not return an error; I believe a directory fsync on a read-only mount is a no-op [I] but did not verify. **[U]**: the smoke must open one journal inside a `docker run --read-only` container. If it errors, that is a D1 fix, found before the cluster.

## 3. Certificates and secret mounts (contract section 4, request item 3)

**Co-signed:** `serverAuth` and `clientAuth` EKU (the probe and the guided callbacks both present the runner key pair as a client: `transport.ts:149`), SANs covering the Service DNS name, read-only Secret mounts, writable journal volume. Changes and additions follow.

### 3.1 What the contract is missing: the callback destination is pinned too (D1 text, D3 confirm)

`controllerRequest` (`transport.ts:139-149`) verifies the **server** it calls back with the default host-name check **and** `certificate.fingerprint256 === controllerCertificateFingerprint256`, and again at `secureConnect`. [V] So the same fingerprint value is used for two roles:
- the backend's **client** certificate toward the runner (inbound pin), and
- the **server** certificate of whatever endpoint serves `GUIDED_CALLBACK_BASE_URL` (outbound pin).

Therefore the backend must present one certificate in both roles. Also, the backend's guided chain says TLS "must terminate at this connector with clientAuth=need ... forwarded headers are never proof" and is `@Profile("!worker")` (`GuidedInternalSecurity.java:36-43`). [V] So the callback goes to an **API pod connector**, not through the Ingress, and not through a worker pod. Contract section 4 and section 9 (D3 row) should say this. If the callback is meant to go through the existing HTTP Service port, it cannot work.

### 3.2 Certificate requirements (for whoever issues them)

- **EKU:** `serverAuth` and `clientAuth`. Key usage `digitalSignature` (plus `keyEncipherment` if RSA).
- **SANs, runner certificate:** the host exactly as the backend writes it. `put-checks.studioRunner.baseUrl` renders the **short** Service name (`_helpers.tpl:109-111`: `http://<fullname>-studio-runner:<port>`). [V] So the SAN list is `<fullname>-studio-runner`, `<fullname>-studio-runner.<ns>`, `<fullname>-studio-runner.<ns>.svc`, and `.<ns>.svc.cluster.local` if the cluster domain is that (unknown). `127.0.0.1` is **not** needed: the probe pins instead of verifying the host name (contract section 5).
- **SANs, backend certificate (3.1):** the API Service host used in `GUIDED_CALLBACK_BASE_URL`.
- **CA bundle:** `TLS_CA_FILE` replaces Node's default roots (`ca` option), so it must contain exactly the issuer(s) of both certificates. [K]
- **Rotation:** see 3.5.

### 3.3 Mounts (D2)

| Mount | Source | Path (single-source from values, as `objectStore.mountPath` does) | Notes |
|---|---|---|---|
| TLS | Secret `studioRunner.tls.secretName`, items `tls.key`, `tls.crt`, `ca.crt` | `/etc/studio/tls/` | **required in every deployment, guided or not** (A3). `readOnly: true`, `defaultMode: 0440` |
| Controller public key | Secret or ConfigMap (public) | `/etc/studio/guided/controller-public-key.pem` | guided only. Read once at startup |
| Callback token | its own Secret, its own mount | `/etc/studio/guided-token/` | guided only. Re-read per call, so it must update in place |
| Journal | volume, see 3.4 | `/var/lib/studio-guided/` (mount), directory `.../journal` | guided only |
| `/tmp` | emptyDir (section 2.2) | `/tmp` | guided only (replay does not use it) |

Rules:
- **No `subPath` on any Secret mount.** Kubernetes does not propagate Secret updates to subPath mounts. [K] The token file must be a directory mount or it goes stale and every callback gets 401 after five minutes.
- **File mode `0440`, not the 0644 default,** for the key. The pod has `fsGroup: 1001` and `runAsUser: 1001` (`values.yaml` rows CHV-032..034), so group-read is enough for the process **and** for the exec probe, which runs as the same user. [I]; verify with `ls -ln` in the pod **[U]**. The existing object-store Secret mount sets no `defaultMode` (template `:181-192`); leave that as is, it is out of scope.
- **Names are derived once.** The `*_FILE` env values must be rendered from the same mount-path keys (the pattern `:111-114` already uses). They join the "managed by the chart" list at `_helpers.tpl:170` so a `runnerEnv` override fails the render.
- **Journal path is a subdirectory of the mount, never the mount root.** Same lesson the scratch comment records (`values.yaml`, "The emptyDir is mounted at the PARENT", EROFS at a mount point).
- **Secrets now include a private key inside the shared PID namespace.** The one-container bound (`chart.test.ts:574-600`, `sharedNamespaceViolations`) already covers "any Secret volume" generically, so it stays correct; update the MED-1 comment in `values.yaml` and the template (they name only the object-store credential).

### 3.4 Journal volume: a decision for @architect, with my default

`GuidedJournal` writes a permanent `.owner` marker per session and its own comment says it is never removed, so that "a lost worker cannot reconstitute its live DOM/value context" (`journal.ts:26-29`). [V] An `emptyDir` survives a container restart but not a pod replacement, so after a pod replacement the marker is gone and a re-assigned session id would start clean. I found no story or ruling text that says whether that is acceptable (grep of the prep documents for "journal" returned nothing). **Default: a PVC with `ReadWriteOnce`, not the shared RWX evidence claim, plus `strategy: Recreate` (item 6).** Fallback if @architect confirms the backend fence and lease are the sole authority: `emptyDir`, with the loss on pod replacement written into the 010 disclosure. Storage class availability is unknown to me (Platform/SRE). The PVC would be a new template: the skeleton has no row for it (`CHT-05` is the existing object-store PVC, marked CANDIDATE/unchanged), so lane D2 must add one.

### 3.5 Rotation and the fingerprint

- The runner reads key, certificate and CA **once**. The probe reads them **at every exec**. After any Secret refresh the probe presents the new certificate while the process serves the old one, so the pin fails and liveness restarts the container at an arbitrary moment, mid-session. [I] from contract section 5. **Rule:** a certificate rotation is a Secret update, a rollout restart and a fingerprint update in one release. Put that in the contract (section 2.3 says "read once"; it does not say what rotation costs).
- The controller fingerprint is a literal value. If the backend certificate is renewed and the literal is not, every inbound call is refused. **D2 renders it from exactly one values key with no default** (the chart's own most-repeated defect is one fact written twice). Optional D1 improvement, not a condition: accept the backend's public certificate as a file and compute the fingerprint at startup, so rotation does not require editing a value.
- Lifetime and renewal cadence are Platform/SRE's call and unknown to me. The test fixture is valid to 2036 (contract section 4) and says nothing about production.

### 3.6 Startup self-check (D1)

If the runner certificate has an EKU extension without `clientAuth`, the server will reject the probe's client certificate and the pod never turns Ready, with no log line. Ask D1 to refuse at startup (value-free, exit 78) when the EKU extension is present and lacks either `serverAuth` or `clientAuth`. [I]; Node exposes the EKU OIDs on `X509Certificate`. [K] A certificate with no EKU extension is valid for every purpose and should not be refused.

### 3.7 NetworkPolicy and rollout order (D2)

- Ingress already admits the worker and API pods on `studioRunner.service.port` (`studio-runner-networkpolicy.yaml`, ingress rule). [V] The bridge is a single port now, so no change. Exec probes use loopback and are not subject to the policy. [K]
- Egress `callback-api` allows only API pods on `backend.service.port`. [V] The replay callback stays plain HTTP to that port (A3 does not extend to callbacks). The guided callback goes to the API pod's TLS connector, which needs its own port in the Service and in this egress rule. The port is D3's to name.
- **UAT breaks on upgrade unless the Secrets exist first.** `values-uat.yaml:152` has `studioRunner.enabled: true` (CHE-24) and TLS is mandatory even with guided off. [V] The new Secret must exist before the release, or the pod stays in ContainerCreating. In the same release the backend and worker base URL flips to `https` (`_helpers.tpl:109-111` still renders `http`), and A3 makes `validate()` reject `http://` outside local/test. During pod rollout the runner and the callers are not updated atomically, so dispatches in that window fail as ambiguous and are left to the reapers. This is the accepted cost of "single path, no compat"; plan the upgrade for a quiet window.

## 4. Probe environment (contract section 5, request item 4)

**CO-SIGN.** The probe command in the Helm template does not change (`studio-runner-deployment.yaml:131-142`). [V]

What I checked:
- The five environment values are all container environment, and an exec probe runs inside the container with its environment and mounts. [K] The chart already depends on this for `STUDIO_RUNNER_SERVICE_IDENTITY` from a `secretKeyRef` (`:117-121`, `probe.ts:25-26`). [V] The new file reads (`TLS_KEY_FILE`, `TLS_CERT_FILE`, `TLS_CA_FILE`) work only if the probe process can read the mounts: same uid, `0440` with `fsGroup` (item 3). [I]
- Target `127.0.0.1:$PORT`, default `HOST` `0.0.0.0`: loopback reaches it and is outside NetworkPolicy. [K]
- mTLS inside the pod works only if the runner certificate carries `clientAuth` and chains to `TLS_CA_FILE`, because the probe presents it as its client certificate and the server also verifies it; the pin is on the **leaf** (first certificate) of the file, and `fingerprint256` of a chain file's first certificate must be what the probe compares. D1 must make that explicit. [I]

Conditions (D2 unless stated):
1. **Render test: every variable the probe reads is present and non-empty in the rendered container env** (`PORT`, `SERVICE_IDENTITY`, `TLS_KEY_FILE`, `TLS_CERT_FILE`, `TLS_CA_FILE`) for every values set. Mutate by dropping `TLS_CA_FILE` and require the test to go red. A pod whose probe exits 1 forever is "Running, never Ready", the worst place to find it.
2. **`livenessProbe.failureThreshold` becomes a values key.** The probe is a new Node process per exec plus a TLS handshake and three file reads, with a hard 2000 ms internal timeout (`probe.ts:11`) and `timeoutSeconds: 3`, on a pod where Chromium can saturate 2 CPUs. A liveness restart destroys the in-memory guided session. The default (3 failures x 5 s) is tight. The value for guided-enabled sets is **unmeasured** [I]; D2 sets an explicit higher number and records it as such. Measurement is **[U]**, owner @devops/@qa in a cluster.
3. **`STUDIO_RUNNER_HOST` guard:** the probe always dials `127.0.0.1` (contract section 5). `STUDIO_RUNNER_HOST` is in the accepted list but not in the managed list (`_helpers.tpl:170`), so a values file can set it to something that makes the probe miss. Fail the render unless it is `0.0.0.0` or `127.0.0.1`.
4. **D1:** the probe stays silent on every failure and never prints the bearer, a path or a fingerprint (contract section 5, "Output") - agreed.
5. **Q1 (operations view, not a ruling):** a held guided slot leaves the pod Ready and routed; a new `assign` gets 409 `CAPACITY`. That fails closed, and I agree to keep it out of both probes for 009. Whether a held slot should end the process is D5's call; liveness must not become the mechanism by accident.

In-cluster behaviour of the probe over mTLS is **[U]**, owner @devops, until a cluster exists. Nothing here claims it.

## 5. Callback-token owner (contract Q6, request item 5)

**Honest answer: nobody in this repository mints it, and I cannot name the owner. It is external.**

### 5.1 The gap is wider than the contract says

Q6 covers only the runner's callback token. The backend has the same shape in the other direction:
- Backend to runner (`aud=studio-guided-runner`, `role=backend-controller`): read from a "mounted issuer-managed token file", `studio.guided-authoring.controller-token-file` ← `STUDIO_GUIDED_RUNNER_CONTROLLER_TOKEN_FILE` (`application.yml:200`; `GuidedSessionConfiguration.java:80-110`; `session/README.md`, "reads the controller JWT from a mounted issuer-managed token file"). [V]
- The translation coordinator has a third token-file property (`application.yml:202`; `GuidedTranslationConfiguration.java:120-131`). [V]
- Runner to backend (`aud=studio-guided-controller`, `role=owning-worker`, lifetime at most 300 s): the runner's `GUIDED_CALLBACK_TOKEN_FILE`.

All are RS256 JWTs the verifier accepts only if `exp - iat <= 300` and `iat <= now` (no skew allowance) (`GuidedInternalSecurity.java`, lines 201-210 as cited by the contract). [V] **No minter exists in the chart or the code.** The backend verifies both roles against one configured `service-public-key` and `service-issuer` (`GuidedInternalSecurity.java:49-51`), distinguished only by the `role` claim. [V] So whoever can sign an `owning-worker` token can sign a `backend-controller` token. [I]

### 5.2 Designs I REFUSE (security/operations)

| Design | Reason |
|---|---|
| Runner mints its own JWT from a private key in the pod | The signing key would sit in the pod that runs untrusted pages, and (5.1) it could forge controller tokens. Also a source change in D1. |
| Sidecar token minter / sidecar agent in the runner pod | Breaks the one-container bound (`chart.test.ts:574-600`, the `values.yaml` MED-1 comment): the shared PID namespace exposes `/proc/<pid>/root` between containers, so the minter's key and the runner's TLS key and object-store credential become mutually readable. A bound of this kind is a security decision to SPK-04/ED-05, not a chart choice. |
| A static Secret holding one token | Expires in at most 300 s; every guided call is 401 afterwards. |

### 5.3 What is left (not mine to choose)

- **(A) An external issuer/controller** (Platform/SRE, if one exists; unknown) that signs tokens and refreshes a Kubernetes Secret mounted as a directory. Constraints I can state: refresh at most every 60 s (tokens live 300 s and the kubelet can lag tens of seconds to a couple of minutes behind a Secret update [K]); synchronized clocks (`iat <= now`); that controller needs Secret-write RBAC, which the runner service account must **not** get (`automountServiceAccountToken: false`, `values.yaml` CHV-025).
- **(B)** A new design (for example cluster-issued projected tokens). Kubernetes projected service-account tokens cannot be shorter than 600 s [K], longer than the verifier's 300 s cap, so that would need a verifier change. That is @architect plus Security, a new design, not something to assume.

The contract labels this "ED-02 / SRE". In the T0 documents I read, ED-02 is the Vault mount and policy (`t0-questions.md`, AC-4), not JWT issuance. I cannot confirm that ED-02 owns this. I would not write the owner as "ED-02" until someone says so.

### 5.4 Consequences for D2

- `studioRunner.guided.enabled` stays `false` in `values.yaml` and in all three values files. The guided render must `required`-fail when the callback-token Secret name is empty, so a guided pod can never start without a token source.
- The deployed guided path is **not** proven by `GuidedBridgeIntegrationTest`: it generates tokens at runtime in the test.
- Until an owner delivers a minter, guided-enabled shared environments are blocked. This agrees with the contract.

## 6. One-replica render check (contract section 1.6, A2.6, request item 6)

**Co-signed** as a principle: guided on implies exactly one runner replica and no autoscaling, and guided environments give up the two-pod replay redundancy (D3, Studio v1). It stays provisional on root decision R1.

### 6.1 Mechanism: a Helm `fail`, not a values schema

- The chart has no `values.schema.json` (`find` returned none). [V] Adding one makes every `helm lint/template/install` validate all values, including backend, worker and frontend, for one runner guard.
- This chart's convention is `fail` with a named message (`studio-runner-scaledobject.yaml`: `cooldownPeriodSeconds`, `minReplicaCount`; `_helpers.tpl`; `required` on `seccompProfile.type`), and `chart.test.ts` already has the render-outcome pattern for negative tests. [V]
- A schema `if/then` can express it but its message is generic and it validates the typed value, not the rendered one.

**Exact guard (D2),** one helper `put-checks.studioRunner.guidedGuard` called first in `studio-runner-deployment.yaml` (inside `studioRunner.enabled`), failing when `studioRunner.guided.enabled` and any of:
1. `ne (int .Values.studioRunner.replicaCount) 1`;
2. `.Values.studioRunner.autoscaling.enabled`;
3. `.Values.studioRunner.shareProcessNamespace` is not true (item 1);
4. the TLS, controller-key or callback-token Secret name is empty (item 5);
5. `runnerEnv` carries any `STUDIO_RUNNER_GUIDED_*`, TLS or fingerprint key (they become chart-managed);
6. (low cost) guided is on while `studioRunner.enabled` is false.

The messages name the key and say what to set (`replicaCount: 1`), because every shipped file sets `replicaCount: 2` (`values.yaml:382`, CHE-11, CHE-25, prod) and an environment enabling guided must also override that. Do not change the default 2.

**Test shape (the catalogued "pre-empted" trap):** assert the failure by rendering with `--set` and matching the message, **and** assert that the same set with `replicaCount=1` renders manifests, so a green negative test cannot be a render that dies for another reason. Add a mutation (remove the guard) that must redden.

### 6.2 What the contract and the ruling miss: the rollout strategy

The Deployment sets no `strategy` (`studio-runner-deployment.yaml:11-23`). [V] The default is RollingUpdate 25/25, which with one replica means `maxSurge: 1`, `maxUnavailable: 0`. [K] So **every upgrade runs two Ready pods with the same worker id**, and the Service sends `assign` and bridge calls to either. The worker holds sessions in memory and refuses calls it does not own (`ownership.ts`, `CONTEXT_LOST`; ruling A2 item 6), so a rollout produces fail-closed refusals on live sessions, and a RWO journal volume (3.4) cannot attach twice.

**D2: `strategy: {type: Recreate}` whenever guided is on.** Cost, to be disclosed in 010: the replay path is also down for the rollout, up to the old pod's drain (`terminationGracePeriodSeconds`, 215 s with the current values: 120 + 15 + 30 + 15 + 5 + 30, from `derivedGraceSeconds`). A2.6 already accepts losing redundancy; this is the same trade, not a new one.

### 6.3 Residual risk the render check cannot close

`kubectl scale`, an external HPA/KEDA object not from this chart, or a manual Deployment edit bypass it. [K] The runner fails closed in that case [I] (ruling A2 item 6), so the effect is refusals, not corruption. Add a post-deploy check to the @devops runbook: the runner Deployment reports exactly one ready replica when guided is on. Alerting on more than one ready endpoint is Platform/SRE's.

### 6.4 Related D2 items under this item

- **Grace period (Q5):** `derivedGraceSeconds` (`_helpers.tpl:188-197`) has no guided term. PR-RT measured the guided slot held about 30 s (i), 31 s (iii), 42 s (ii) from the close (`pr-rt/receipt.md`, findings 1-2, one host, one wedge type). Add a `studioRunner.guided.closeGraceSeconds` term, included only when guided is on; its value waits for the D5 ruling. [I] whether the guided close and replay drain add or overlap is not stated in the contract; budget them as added until D1 says otherwise.
- **Resources:** a guided-enabled pod runs one replay browser **and** one guided browser. The skeleton already marks the resource values CHANGES-IN-009 (CHV-026..029, CHE-26..29); A2.6 says "basis recorded, measurement owed". I do not supply a number as measured. UAT's 2Gi limit with a 1Gi memory-backed `/dev/shm` looks tight for two browsers [I]; D2 records its basis and marks it as a starting value.
- **PDB:** keep `maxUnavailable: 1` (`values.yaml`, podDisruptionBudget): with one replica a `minAvailable` would block node drains forever. A drain evicts the only pod and ends live sessions; that is accepted.

## 7. Cross-cutting rulings (bind D2)

- **`securityContext` and seccomp: CO-SIGN, no change.** Pod: `runAsNonRoot: true`, uid/gid/fsGroup 1001, `seccompProfile.type: RuntimeDefault`. Container: `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]` (`values.yaml` CHV-030..037; template `:62-76`). [V] Guided launches `chromiumSandbox: true` with `args: []` (`browser.ts:557`), so it carries the same open question SPK-04 already has: whether `RuntimeDefault` permits the user-namespace calls Chromium's sandbox needs (`values.yaml`, seccomp comment). That is unproven here, and a guided browser **in a cluster** cannot be claimed until SPK-04 answers (**[U]**). If the answer is a Platform-approved `Localhost` profile, that is a values change by Platform, not by D2.
  **REFUSED, for any reason including making `/tmp` or the journal work:** `Unconfined`; `privileged`; added capabilities (`SYS_ADMIN`, `SYS_PTRACE`); `hostPID`; `hostNetwork`; `readOnlyRootFilesystem: false`; any `--no-sandbox`-style argument; a chart `command` or `args`.
- **`shareProcessNamespace: true`: keep,** with its bound of one container. It now also protects the TLS private key and the token Secret. A mesh or injection sidecar would break the bound and is unknown to me (Platform/SRE; section 2.1). Update the MED-1 comments and extend the PID-1 b assertion to guided sets.
- **Read-only root with a writable `/tmp` and journal:** the `readOnlyRootFilesystem` control stays meaningful only while every writable mount is disjoint from `PLAYWRIGHT_BROWSERS_PATH` and `$HOME`. The new mounts (`/tmp`, `/var/lib/studio-guided`) satisfy that by path; D2 asserts it.

## 8. Chart change list for D2 (lane D2 single-owner of `helm-chart/**`)

Skeleton references are the 010 rows; items marked **new** have no skeleton row yet.

1. **values (`values.yaml`, CHV rows; `values-{dev,uat,prod}.yaml`, CHE rows):**
   - add `studioRunner.tls.{secretName, mountPath, controllerCertificateFingerprint256}` (required in every deployment, A3) and `studioRunner.guided.{enabled: false, workerId, controllerIssuer, controllerSubject, callbackBaseUrl (https), controllerPublicKey source, callbackToken.secretName, journal.{mountPath, directory, persistence, size, storageClass}, tmp.sizeLimit, closeGraceSeconds}`; guided stays off in all three environment files;
   - `workerId` is rendered from **one** values key into both the runner (`GUIDED_WORKER_ID`) and the backend (`studio.guided-authoring.translation.worker-id`); two copies would drift;
   - `probes.livenessFailureThreshold` (item 4); explicit resource basis for guided-enabled sets (CHV-026..029, CHE-26..29).
2. **`_helpers.tpl` (CHT-09):**
   - add the 12 new keys to `acceptedEnvKeys` (`:156-158`; the sentence "thirty-six keys" at `:151` is already stale, the loader accepts 45 and will accept 57) and to the managed list (`:170`);
   - `put-checks.studioRunner.baseUrl` renders `https` (`:109-111`);
   - add a guided callback URL helper that is **not** derived from the replay `callbackBaseUrl` (A2.2: independent keys);
   - add `put-checks.studioRunner.guidedGuard` (6.1) and the guided term in `derivedGraceSeconds` (6.4).
3. **`studio-runner-deployment.yaml` (CHT-01):**
   - TLS mount always (3.3); guided mounts conditional; `/tmp` emptyDir and journal volume conditional;
   - `strategy: Recreate` when guided is on; `terminationMessagePolicy: FallbackToLogsOnError`; `failureThreshold` key; container port renamed from `http` to `https` together with the Service `targetPort` (cosmetic, but keeps a reviewer from reading it as plaintext);
   - **no** `TMPDIR`, **no** `NODE_OPTIONS`, **no** `command`/`args`, **no** change to `securityContext`/seccomp.
4. **`studio-runner-service.yaml` (CHT-02):** one port, `https` target port; nothing else.
5. **`studio-runner-networkpolicy.yaml` (CHT-03):** ingress unchanged; egress `callback-api` gets a second port rule for the API TLS connector (guided only). Do not widen the object-store `0.0.0.0/0` rule.
6. **`studio-runner-scaledobject.yaml` (CHT-04):** no change needed once the guard exists (it already requires `autoscaling.enabled` to render); keep the cooldown `fail`.
7. **Backend and worker Deployments and ConfigMap (CHT-07, CHT-08), names owned by D3:** runner base URL `https`; `StudioRunnerTls` key store, trust store and password file mounts; `service-public-key`, `service-issuer`, `mtls-required: true`; controller token file mount (5.1); an API pod TLS connector with `clientAuth=need` and its Service/container port (3.1).
8. **New: journal PVC template** (3.4), unless @architect chooses `emptyDir`. Add a skeleton row.
9. **`studio-runner/Dockerfile` (RKO-01):** the A6 CMD; update the comments at `:53-61`; confirm `procps` is present (the runner already refuses to start without it, exit 69, `main.ts`; I could not verify the base image contents without Docker, **[U]**).
10. **`chart.test.ts`:** guard negative and positive renders and the mutation (6.1); PID-1 b extended to guided sets; probe-env presence (item 4); no `TMPDIR`/`NODE_OPTIONS` in rendered env; `/tmp` and journal mounts disjoint from browser registry and `$HOME`; Secret mounts `readOnly`, no `subPath`, mode `0440`; exactly one container with the new Secrets; `strategy` is `Recreate` when guided; the rendered runner env is a subset of `ACCEPTED_KEYS`; `workerId` single-source.
11. **Image smoke (needs Docker authorization, R5):** `docker run --read-only --init` with the TLS files and a `/tmp` and a journal mount: listens; the same **without** `--init`: refuses before listening; one guided assign opens a journal and recording scratch on Linux (2.3); `docker stop` shows `runner.draining`/`runner.drained` under the A6 CMD; probe exec exits 0 against the running container. Record "unrun, no authorization" if R5 is not granted.
12. **Rollout notes (D2/@devops runbook):** Secret first, then release (3.7); certificate rotation procedure (3.5); post-deploy one-ready-replica check (6.3).

## 9. Requests back to D1 (runner lane)

1. Contract section 4/9: add the callback-destination pin and the one-backend-certificate-two-roles requirement (3.1); name the pin as the leaf certificate of the file (section 4 of this review).
2. Contract section 2.3: state that rotation needs a restart (3.5); optionally allow the controller certificate as a file instead of a literal fingerprint.
3. Contract section 2.5: add "`TMPDIR` unset resolves to `/tmp`" and that the pod mounts a dedicated `/tmp` (D2 sets it).
4. Contract section 8: replace the two-path statement with the table in item 1.
5. Startup EKU self-check (3.6).
6. Add to the contract an explicit statement for ops: all startup refusals are one value-free stderr line each (already implied; make it normative so `terminationMessagePolicy` is safe).

## 10. Unrun, with owners

| What | Owner |
|---|---|
| Node pid > 1 in a deployed pod; probe success over mTLS; drain on SIGTERM; guided browser start under `RuntimeDefault` seccomp | @devops once a cluster exists; the last depends on SPK-04 |
| Docker image smoke (all of item 8.11) | @devops, needs R5 authorization |
| Linux run of the recording-scratch and journal code | D2 smoke |
| Mutating webhook, mesh or auto-instrumentation injecting `NODE_OPTIONS` or a container | Platform/SRE |
| Secret/PVC provisioning per environment, storage class, certificate issuance, lifetime and rotation | Platform/SRE |
| Token issuer / minter (5.3) | external; no owner named anywhere I read |
| Kubelet Secret propagation delay and `0440`+`fsGroup` effective modes | @devops in-cluster |
| Resource sizing for two browsers; liveness `failureThreshold` | @devops/@qa measurement (G-4) |

## 11. Not claimed

- No source, chart, Dockerfile, story or git change by this review; one file written.
- Nothing here was run in a container or cluster. Statements tagged [K] come from general Kubernetes/Node behaviour, not from this repository.
- I did not read the backend's Tomcat/TLS connector configuration (none was found in `application.yml` or the chart); 3.1 is derived from the runner and `GuidedInternalSecurity` code only.
- The co-sign is conditional on the changes above; the "CO-SIGN WITH CHANGES" items are not binding for D2/D3 until D1 reissues the contract or @architect rules, and item 5 is not resolvable inside this story.
