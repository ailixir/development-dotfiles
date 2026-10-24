# Studio runner — operations runbook (V1)

Current integration setup: [local filesystem and remote AWS S3](studio-integrations.md).
That guide supersedes the earlier Sonic/fake-store setup notes below; cloud provisioning remains deferred.

| Field | Value |
|---|---|
| **Status** | **COMPLETE for V1, and assembled once.** 10.18a drafted the three pod sections; **story 10.18b drafted the edge sections and assembled them here**, as @po's split mandated — a runbook split into two halves is two half-runbooks. All seven subjects AC-24 names are covered: Chromium and the sandbox (§1), egress and approved destinations (§2), evidence expiry (§3), signals/drain/reaping (§4), stuck runs (§5), the kill switch (§6), SSE (§7) and manifest recovery (§8). §§9-11 carry the three open prerequisites this deployment must not be read without. **§12 (rollback) was added by story 10.19 (AC-9); the epic had never written one down.** |
| **Accountable owner** | **The Checks squad**, as the on-call owner. BRD §4: the Checks squad *"owns Studio execution, recovery, capacity and the runner runbook"*; **Platform/SRE supports** cluster, ingress, egress, sandbox and storage controls. BRD §8 makes this document a **launch exit criterion**. **Re-verified by story 10.19's audit (AC-8b), 2026-09-17: still named and still accurate** — `docs/brd/checks-ui-studio.brd.md:81` and BRD §8's on-call row |
| **Sections from 10.18a** | §1 Chromium and the sandbox · §2 Egress and approved destinations · §3 Evidence storage and expiry · §4 Signals, drain and reaping |
| **Sections from 10.18b** | §5 Stuck runs (reapers, ledger states, what an operator may and may not do by hand) · §6 The kill switch · §7 SSE · §8 Manifest recovery · §9 Identity (`ED-02`) · §10 CSRF · §11 Configuration delivery |
| **Sections from 10.19** | **§12 Rollback** |
| **Sections from STUDIO-OBS-009** | **§14 One entrypoint, TLS everywhere, the one-pod guard and the new Secrets** (written 2026-10-18 by @devops); the `CMD` paragraph of §4 is amended in the same change. §§1-3 and §5-13 were **not** re-audited by this change: §2 in particular still describes the `callback-api` class without the guided connector port (see §14.6) |
| **Written by** | @dev (Dex), story 10.18a · 2026-09-15; assembled by @dev (Dex), story 10.18b · 2026-09-16; audited and extended by @dev (Dex), story 10.19 · 2026-09-17 |
| **Last audited against the merged system** | **2026-09-17**, story 10.19 AC-8, at integration head `d3700f23d` (10.30, 10.31 and 10.32 merged). Drift found and corrected in this pass: `ED-02`'s owner (three places), the lifted 10.19 drafting gate (two places), story 10.30's write authorization (§9.1 new), story 10.31's video-route refusal surface (§7 new). Checked and found **not** drifted: §1–§6, §8, §10, §11 — including §11's "no key 10.18b added is affected" claim, which still holds for story 10.32's `STUDIO_RUNNER_SEEK_ORIGIN_CALIBRATION_MS` because it matches the `STUDIO_RUNNER_*` shape §11 already names. Every disclosed limitation below is cross-checked against [`docs/qa/staging-acceptance-register.md`](../qa/staging-acceptance-register.md) (AC-8c) |

> **Source audit correction — 2026-10-20 (STUDIO-OBS-011, C-OBS009-3/F2).**
> §§1–3 and §§5–13 below were rechecked against current public repository source, configuration,
> contracts and the named existing evidence. The dated audit rows above, §4 and §14's dated
> accounts, and superseded §12(e) remain historical; this is not a new merged-system, runtime,
> deployment or QA audit. Present-tense configuration statements describe source and shipped
> values, not an inspected deployment. Source hashes, section dispositions and external owners:
> `docs/qa/evidence/STUDIO-OBS-011/t0/early/obs011-runbook-audit-resume20261020/audit.md`
> and `inputs.json`. All runtime/external/baseline/final-QA gates remain owed.
> The staging register and epic still contain historical plaintext-Vault-stub wording; current
> source has the real default-off adapter and drops the table in V18 (§9.2). Their open external
> statuses remain authoritative; that old implementation description does not describe this tree.

> ## Read this before anything else: what is still open
>
> This deployment is hardened in the places this story could reach, and five things a reader will
> otherwise assume are **not true today**. They are stated here rather than in a ticket because a
> hardening story that ships without saying them ships a deployment whose readers assume the
> opposite.
>
> 1. **The production authentication bypass code paths still exist — and there are THREE of them.**
>    They are closed by *configuration* in the shipped remote value sets, not removed from the code; the deployed settings have not been inspected here. Story
>    10.18b closed them; removing them is **`ED-02`**'s. One of the three is a client-supplied
>    `X-User-Id` header that is checked **before** the flag `ED-02` names, so
>    closing that flag alone would have closed nothing.
>    **Read §9 before deploying this anywhere.** See `ED-02` in `docs/epics/EPIC-10-EXECUTION.yaml`.
>    **Corrected 2026-09-17 (story 10.19 AC-8).** This line used to say `ED-02`'s owner reads
>    `TBD — not assigned in sources`. **It no longer does.** By the user's decision of 2026-09-16,
>    recorded by @pm in the manifest's `owner_decision` block, `ED-02` — identity **and** vault — is
>    owned by the **PUT Core platform (the Core BFF)**, delivered **outside Epic 10 as a linked
>    external ticket**. The manifest's own `traceability` field states that this owner is not
>    traceable to the BRD or the architecture and rests solely on that decision.
>    **`external_ticket` still reads `"to be linked — no ticket ID exists yet"`, and `status` is
>    still `open`.** An owner is not a delivery: item 3 below is unchanged.
> 2. **The Studio Vault adapter is implemented but not connected.** The `hashicorp` KV v2 client
>    is selected only with `STUDIO_VAULT_PROVIDER=hashicorp`; the shipped deployed default is
>    `none`; tests alone use the fake. Vault is the only secret store: the plaintext `secrets`
>    table and its `REDACTED` stub were removed (historical V25, now rebaselined V18, §9.2). Real endpoint/policy evidence remains
>    `ED-02`.
> 3. **No credentialed pilot may run until `ED-02` has linked completed tickets.** That is `ED-02`'s
>    own `gate_note`, not this document's opinion. **Unchanged, and this is the item that matters.**
>    *(The second half of this line — @po's ruling that story 10.19 may not be **drafted** while
>    `ED-02`'s owner read TBD — is **spent**, corrected 2026-09-17 by story 10.19's own audit. That
>    drafting gate was lifted on 2026-09-16 when the owner was assigned; 10.19 is drafted and
>    validated GO 8/10. The **pilot** gate in the first half of this line is untouched by that.)*
> 4. **Cookie-authenticated mutations have no CSRF control** (§10). It is a recorded finding with a
>    named owner, it is not fixed here, and it is not this story's to fix.
>    *(The second finding recorded on this line — that the chart's `configOverrides` mechanism had
>    never reached a process — was resolved by story 10.27, which renders it into mounted
>    `*-properties` ConfigMaps; see §11.)*
> 5. **Nothing about the streaming route has crossed a real proxy** (§7): not buffering, not the
>    idle timeout, not the cookie route in federated mode, not cross-replica reconnect. `ED-06` /
>    **SPK-02**, OPEN.
>
> The escalation path this document was written with — **@pm** raises `ED-02` to Checks-squad
> engineering management through BRD §8's launch-exit/on-call row, with **Security & Compliance**
> (BRD §11) as the accepting party — **was overtaken by the user's direct assignment of 2026-09-16**
> and is recorded here as history rather than as the next step. The next step is the external
> ticket, which does not exist yet.
>
> **Everything open in this deployment is also in one consolidated place:**
> [`docs/qa/staging-acceptance-register.md`](../qa/staging-acceptance-register.md). If that register
> and this runbook ever disagree, one of them is wrong and both owners should be told; the register
> carries the guard that catches it drifting from the manifest, and this runbook does not.

---

## 1. Chromium and the sandbox

*Implements architecture §9.3 ("Run non-root … no privileged mode, restricted service-account
access, CPU/memory limits, writable per-run scratch and `/dev/shm`"; "Prove sandbox startup in
staging; do not disable it silently to make the image run") and ADR-001 §8.*

**What current chart source configures.** Shipped runner values set `runAsNonRoot: true`,
`allowPrivilegeEscalation: false`, dropped capabilities, `readOnlyRootFilesystem: true` and
`seccompProfile.type: RuntimeDefault`. The template mounts writable scratch and in-memory
`/dev/shm`; the `local` evidence provider adds its shared filesystem mount. Guided mode adds
`/tmp` and its separate journal mount. TLS, trust and guided credential mounts are read-only.
These are source settings, not proof of sandbox startup in a cluster.

Operators can configure CPU/memory, scratch and `/dev/shm` sizes and the supported runner
settings. `runnerEnv` is enumerated: unknown names including `HOME` and
`PLAYWRIGHT_BROWSERS_PATH` fail rendering; chart-managed names must use their dedicated values.
The template emits no container `command` or `args`; the image CMD ends with `exec node` (§4).
With observed validation/replay on, the runner image is pinned to the catalog digest and its tag
is ignored; image/catalog changes must follow §14.4.

**Do not weaken the security settings.** An omitted seccomp type fails rendering, but an explicit
`Unconfined` type and a writable root are detected by deployment-test assertions, **not refused by
Helm itself** (`chart.test.ts` includes successful render mutations for both). The template has no
generic command/args override. Passing a renderer is not proof that edited values preserve the
sandbox, browser-path disjointness or one-container bound. Review those settings before rollout.

**Why `readOnlyRootFilesystem` is a browser-integrity control and not tidiness.** @qa's SEC-2 attack
builds a shim browser registry — every real file symlinked except `chrome-headless-shell`, which is
replaced by a script that execs the real binary with a sandbox-disabling flag — and points the
browser search path at it. **The historical 10.18a attack measurement succeeded.** In that measured writable container it
succeeded at both `/ms-playwright` (which is world-writable in the base image) and `/home/pwuser`,
and the renderer process comes up at `Seccomp=0` where a direct launch has it at `Seccomp=2`. With
the measured root filesystem read-only and writable mounts disjoint from the browser path and
`$HOME`, both writes were refused with `Read-only file system`. This dated measurement is not a
retest of the current image; current-image and cluster proof remain owed to @devops/Platform/SRE.

**Browser identity correction (2026-10-20).** The earlier runbook said nothing reads the running
browser's identity and recorded a declined version-only check. That historical decision is not a
complete description of current source: `assertObservedBrowserStartup` checks the installed full
Chromium executable provenance hash and browser-launcher hash against build metadata;
`verifyBrowserPreferences` reads `chrome://version/` and checks the real executable/profile paths
and effective profile preferences. These checks do not establish cluster sandbox enforcement or
protect against an adversary who can replace the pod spec/trust inputs. Incident review still needs
the actual pod spec and image/catalog digest; a browser version string alone is insufficient.

**Still open (`ED-05` / SPK-04).** That the sandbox actually *starts* under the cluster's
PodSecurity level, on nodes with unprivileged user namespaces, under the selected seccomp profile,
has **not** been proven — it cannot be proven outside a cluster. If it does not, the answer is a
Platform-approved `Localhost` profile. **There is no fallback that disables the sandbox.**

---

## 2. Egress and approved destinations

*Implements architecture §9.3 ("Permit runner access to the callback API, Sonic, approved targets,
and controlled DNS only") and ADR-001 §9.*

**When both `studioRunner.enabled` and `studioRunner.networkPolicy.enabled` are true, the template emits** a `NetworkPolicy` selecting runner pods, naming **both**
`Ingress` and `Egress` policy types — which isolates those directions subject to the policy's allow rules and the cluster CNI — with:

| Direction | Peer | Why |
|---|---|---|
| Ingress | the **API and worker** pods, on the runner's Service port | Internal validation, replay and guided calls; the MFE never talks to the runner |
| Egress | the **API** pods, on `backend.service.port`, plus `studioRunner.guided.tlsConnector.port` while guided mode is on | `callback-api`: replay admission/progress use the ordinary API port; guided claim/callbacks use the separate TLS connector (§14.2) |
| Egress | the object store, port from a values key, with metadata/link-local/private ranges excepted | `object-store` |
| Egress | the approved targets, **currently empty** | `target-page` — see below |
| Egress | `kube-dns` | Not a destination class. Without it every destination becomes a **silent hang** instead of a refusal |

These three class names are the runner's own `PERMITTED_DESTINATIONS`, and the deployment test compares
them against that production constant rather than against a list written in a test — so a fourth
class cannot appear on one side alone.

**The shipped `approvedTargets` list is empty, deliberately.** `ED-04` / SPK-05 has not ruled. An empty list adds no target-specific L3/L4 allow rule. It does **not** prove every unapproved
host unreachable: the broad object-store rule permits public addresses on its configured port,
and NetworkPolicy allows are additive. Current runner origin/policy checks are a separate control.
Real destination, DNS, metadata and subresource denial proof remains ED-04/SPK-05.

**If a staging run hangs rather than failing**, check DNS first and the callback rule second. The
architecture calls this out by name: an egress policy written without the callback and object-store
destinations turns the first staging run into a silent hang — admission succeeds, the browser
starts, and the terminal report never arrives. With the recovery scheduler enabled, reapers attempt manifest reconciliation before deadline
closure; an unavailable callback or store can still leave only an error/unknown result. A disabled
dispatcher also disables scheduled recovery (§5).

**The limit Security must accept explicitly (§9.3).** *"Standard Kubernetes NetworkPolicy operates
at network layers, not URL paths."* If SPK-05 finds that only static L3/L4 policy is available,
**per-run destination checks in the runner become the primary control** and that limitation needs
an explicit acceptance from Security. It is not accepted today.

**API connector ingress.** With guided mode and runner network policy enabled,
`api-guided-tls-networkpolicy.yaml` permits the ordinary API port from all sources and the guided
TLS connector from API-namespace runner/worker selectors. It does not enforce URL paths or
establish CNI enforcement; the connector's client-certificate trust remains §14's external input.

**Current observed authorization.** The job's `binding` carries `scope`, `scopeHash`,
`currentPolicyHash` and `replayGrant`; `secretOrigins` accompanies the resolved secrets.
`validateObservedJob` checks these bindings against the artifact and trusted policy before
admission. The dispatch policy identity remains audit context; it does not replace these checks.
See `studio-runner/src/validator/observedReplay.ts` and `src/executor/observedOperations.ts`
under the same runner directory.

---

## 3. Evidence storage and expiry

*Implements architecture §6.2.*

**S3 needs two distinct principals.** In `s3` mode the runner mounts a different credential Secret
from API/recovery; the deployment assertions compare the names. The required policies are runner
write-only under `studio/` (no Get/List) and API/recovery read-only. Different names alone prove
neither distinct principals nor these permissions. Platform/SRE and Sonic owners still owe real
policy and denial evidence (ED-03/SPK-03).

**Shipped values select `local`.** That mode shares an RWX filesystem claim and mounts no S3
credential Secret on the runner; it does not implement an object-store IAM separation. Local
upload/recovery/playback implementation and its historical tests are not certification of Sonic.

**Expiry is logical.** The API enforces it at `videoExpiresAt` from
`studio.execution.evidence-retention`, and the lifecycle **declaration** renders from the
**same values key**, `objectStore.retention` (default `30d`). The ConfigMap does not apply a bucket
lifecycle rule; that is Platform/SRE's ED-03 work. Physical deletion on the store is asynchronous.

> **This runbook makes no claim of exact-time physical deletion, and neither should anything else.**
> Whether lifecycle expiry is prompt, whether noncurrent versions and delete markers are collected,
> whether incomplete multipart uploads are aborted and after how long, and whether a `GET` on an
> expired object fails or still serves are all **unverified** — they are SPK-03's to measure
> against real Sonic (`ED-03`). If asked "is the video gone after 30 days", the true answer today
> is: *the API stops serving it at 30 days; when the bytes are removed has not been measured.*

**Implemented, not yet certified (`ED-03` / SPK-03).** The runner and backend now have explicit
`local` and `s3` providers. Local development shares a filesystem directory; the source implements upload,
manifest recovery, ranged playback and download against it. No fresh exercise was performed in
this source audit. Setting
`objectStore.provider=s3` (Helm), `STUDIO_RUNNER_OBJECT_STORE_PROVIDER=s3` (runner) and
`STUDIO_EVIDENCE_PROVIDER=s3` (backend) activates the Sonic-compatible clients. The real Sonic
endpoint, lifecycle behavior and denial tests — runner `GET`/`LIST` denied, API `PUT` denied — are
still SPK-03 and have not been run.

---

## 4. Signals, drain and reaping — the two properties that must not be cut apart

*Implements architecture §9.3 and ADR-001 §1.1. Expanded in 10.18b's stuck-runs section.*

**The image's `CMD` ends in `exec node dist/main.js` on purpose.** `SIGTERM` must reach the Node
process directly so the drain runs: readiness goes false, in-flight work finishes, the scratch is
cleared. Since STUDIO-OBS-009 (ruling A6) the `CMD` is
`["sh", "-c", "ulimit -c 0 && exec node dist/main.js"]`: the shell exists only so `ulimit -c 0`
(core dumps off; a core of a process that held a decrypted secret is a plaintext copy on disk) runs
first, and `exec` **replaces** the shell, so Node keeps the container's PID and receives the signal.
Dropping `exec` (a shell that stays in front of Node never forwards `SIGTERM`) makes `docker stop`
wait out its **entire** grace period and be SIGKILLed, and neither `runner.draining` nor
`runner.drained` is ever emitted. **Do not add an `ENTRYPOINT` wrapper and do not override
`command`/`args` in the chart**; the deployment tier asserts the chart overrides neither.
**That the new `CMD` still drains on `docker stop` has not been run** (it needs a Docker build and
run; owed to @devops, see §14.5). The earlier "bare exec form" measurement was taken against the old
`CMD` and does not carry over.

**Reaping is `shareProcessNamespace: true`**, not an in-image init, so the infrastructure pause
container is PID 1 and reaps orphaned grandchildren. Node as PID 1 reaps only its own known
children: measured against this image, an orphaned grandchild leaves a zombie within three seconds.
**That this works in-cluster is not yet proven** — a pause container exists only in a real pod, so
it is SPK-04 question 6 and story 10.12/10.13's inherited deferral.

> ### ⚠ `shareProcessNamespace` has a bound, and it is a security bound
>
> **This pod must have exactly one container.** A shared PID namespace makes every container in the
> pod visible to every other through `/proc`, including `/proc/<pid>/root`. This pod mounts the
> object-store Secret at `/etc/studio/object-store`, so **a second container would read
> `/proc/1/root/etc/studio/object-store/secretAccessKey` regardless of its own volume mounts** — and
> `readOnlyRootFilesystem: true` does not obstruct a read. The write-only store principal §6.2
> scopes to the runner would then be held by whatever else was put in the pod.
>
> **An operator or a platform change may NOT** add a log shipper, a mesh sidecar or an init
> container to this pod without resolving that exposure first. The chart asserts the bound and the
> assertion is falsified against a chart copy with a sidecar injected, so the render will tell you;
> what it cannot tell you is what to do instead. Raised to **SPK-04** and **ED-05**: if the platform
> mandates an injected sidecar, the options are to stop mounting the Secret in this pod (moving the
> upload behind the callback API), to drop `shareProcessNamespace` and find another reaping
> mechanism, or for Security to accept the exposure explicitly. **None of those is a deployment-time
> decision.**
>
> Found by @qa as MED-1: the bound was real from the first render, but it was enforced only by a
> test helper throwing on a second container. A sidecar would have broken several tests for the
> wrong reason while quietly handing that sidecar the credential.

**The termination grace period is derived, not written twice.** It is the browser runtime cap plus
the browser stop, terminal-delivery and object-store windows the pod is actually configured with,
plus the preStop flip and a configured headroom. **Raising `STUDIO_RUNNER_MAX_TOTAL_RUNTIME_MS`
raises the grace period automatically.** If you ever find yourself setting the grace period by hand,
the value you are overriding is the one keeping admitted work from being killed mid-run.

**Readiness and liveness mean different things and the probes must stay pointed where they are.** A
**saturated** pod answers `429`/`503` with `Retry-After` and stays **ready** — removing it from the
Service would deadlock the pool. A **draining** pod goes **not ready**. Readiness is `GET /ready`;
liveness is `GET /health`. Pointing readiness at `/health` breaks both meanings at once.

---

## 5. Stuck runs — the reapers, the ledger states, and what you may do by hand

*Implements architecture §5.4 (recovery and the reapers) and §5.1.1 (the dispatch ledger).
Story 10.18b.*

**Check the worker dispatcher setting first.** `STUDIO_DISPATCHER_ENABLED=false` disables both
`StudioDispatchScheduler` and `StudioRecoveryScheduler`; accepted work can remain `QUEUED` with no
browser, and scheduled reaping also stops. The chart sets the API dispatcher to literal `false`
and the worker's from `studioExecution.dispatcherEnabled` (default `true`). Packaged
`application.yml` defaults it to `false`, while an absent bound value/scheduler condition defaults
to enabled. This discrepancy remains recorded for @architect; inspect effective configuration.
`kubectl get deploy -o yaml` is a read-only deployment inspection example, not a check run here.

**The ledger vocabulary is `DispatchState`, not the public execution outcome.**

| State | Meaning and normal next owner |
|---|---|
| `QUEUED` | Accepted; dispatcher can claim it. Kill-switch closure may close it. |
| `CLAIMED` | Worker lease held; no attempt issued yet. Expired lease can return to QUEUED. |
| `DISPATCHING` | Fresh attempt committed before the send. An ambiguous send is **never resent**; recovery owns it. |
| `ADMITTED` | Runner's admission CAS committed; waiting for browser-start report. |
| `RUNNING` | Browser start reported; fixed run deadline still applies. |
| `FINALIZING` | Outcome known; bounded evidence finalization/delivery may remain. |
| `DONE` | Absorbing terminal ledger state; execution outcome/error are stored separately. |

`PendingReaper` reclaims only claims with no attempt. At the pending deadline it first tries the
known manifest for an issued attempt, then closes as `DISPATCH_FAILED` (never issued) or
`DISPATCH_UNKNOWN` (issued, outcome ambiguous), subject to cancellation/conditional guards.
`RunningReaper` reconciles before start-timeout, stale-run and cancel-margin closure and settles
evidence without overwriting a known outcome. Reports do not extend the run deadline.
Defaults are pending 600 s, browser-start 30 s, total browser runtime 120 s, run deadline 600 s;
these are separate budgets. The total runtime must be strictly inside the run deadline. Recovery
polls every 5 s by default while its scheduler is enabled; deadlines are not exact wall-clock
completion promises.

**Operator recovery:** use authenticated `GET /api/v1/studio/executions/{id}` for the current
snapshot, engage §6's switch to refuse new work and close queued work, and inspect worker health.
A worker restart does not authorize redispatch of an issued attempt: only an unissued claim can
be reclaimed. Replay callbacks authenticate the shared callback service bearer on `/internal/**`
and then validate execution/attempt/admission/report identity and sequence; they do not depend on
the former dispatcher process. Guided claim/callbacks use their separate TLS/token boundary (§14).

**Do not edit or delete ledger rows by hand.** Conditional state/attempt/revision guards make late
and duplicate reports harmless; bypassing them destroys that guarantee. Do not re-POST the same
idempotency key expecting a new run: the same principal/request returns the existing execution;
changed request content is `409 IDEMPOTENCY_KEY_REUSED`. Closing the tab does nothing (§7).

## 6. The kill switch

*Implements architecture §8.5 and BRD §9 ("a kill switch rejects new executions and closes queued
undispatched work explicitly. Already-admitted runs finish/report; reads and recovery remain
available"). Story 10.18b, AC-23a.*

**What it is:** `studioExecution.enabled` in the chart → `STUDIO_EXECUTION_ENABLED` →
`studio.execution.enabled`. Rendered explicitly on the API and the worker.

**Replay behavior is source-confirmed; `StudioKillSwitchWiringTest` is existing test coverage,
not a fresh production observation:**

- **new executions are refused** with `503 DISPATCH_DISABLED`, at `StudioAcceptanceService.acceptCore` before its locked
  draft/readiness/quota work; public authentication/authorization checks still apply;
- **queued undispatched work is closed explicitly**, not left to a deadline: the dispatcher's next
  pass selects `QUEUED` and `CLAIMED` rows and closes them with `DISPATCH_DISABLED`. The closure is
  idempotent and bumps no second revision;
- **already-admitted runs finish and report.** Their callbacks are still accepted and applied;
- **reads and recovery stay up.** `GET /api/v1/studio/executions/{id}` is unaffected.

**Guided starts have a different refusal.** `GuidedSessionConfiguration` installs this same
execution-enabled supplier in `GuidedSessionService.start`; when false, a new guided start is
`409 RUNTIME_INCOMPATIBLE`. The replay queue closure pass is not a guided-session drain. Use the
separate guided-authoring runbook for admitted guided work; do not treat an empty replay ledger
as proof that all guided sessions drained.

**The kill switch and the dispatcher are two separate keys on purpose.** Turning the dispatcher off
*as well* disables its closure scheduler and the recovery scheduler, leaving queued work
without either scheduled closure or reaping until a scheduler resumes — the opposite of what the switch promises. The chart asserts that moving one does not
move the other.

**Execution is enabled by default (`studioExecution.enabled: true`); engage the stop by setting it false.** A kill switch that defaulted to off would make a configuration
mistake indistinguishable from an engaged kill switch, and an operator needs to be able to tell an
outage from a decision.

**This switch is also step (a) of a rollback — see [§12](#12-rollback--how-to-take-a-studio-release-back-out).**
Engaging it *before* `helm rollback` is what stops a rollback from tearing down runner pods that are
mid-session and orphaning their recordings.

## 7. SSE — the streaming route, and what a disconnect does *not* mean

*Implements architecture §5.5 and the [SSE viability note](../architecture/studio-sse-viability.md).
Story 10.18b, AC-13a.*

**Closing the tab or losing the stream never cancels or re-dispatches the test.** SSE is an
observation channel and nothing else. A browser that disconnects and never returns leaves the run
finishing normally, reporting normally, and readable at
`GET /api/v1/studio/executions/{id}` — which is also the fallback the UI uses when the stream
errors. **Never fall back around a `401`/`403`**: an auth failure on the stream is an auth failure,
not a transport fault.

**What the deployment does for the route.** The two streaming paths —
`/api/v1/studio/executions/{id}/events` and `/api/v1/studio/executions/{id}/video` — are carried by
their **own** Ingress object (`…-api-studio-stream`) with response buffering off and an upstream
idle timeout derived from the configured stream lifetime. They are *not* annotations on the API
Ingress, and that is deliberate: the API Ingress is a single `path: /` rule, so a buffering
annotation there would unbuffer every REST call in the product. The chart renders both ways and
asserts every other document is byte-identical.

**The timeout is derived, never restated.** `proxy-read-timeout` = `studioSse.lifetimeSeconds` +
`studioSse.idleTimeoutMarginSeconds`. Raising the stream lifetime raises the proxy timeout with it.
The rendered timeout is compared against the rendered `STUDIO_SSE_HEARTBEAT` and
`STUDIO_SSE_LIFETIME` in the same manifest; if you find yourself setting a proxy timeout by hand,
the value you are overriding is the one keeping idle streams alive.

> ### ⚠ NONE OF THIS HAS CROSSED A REAL PROXY — `ED-06` / **SPK-02**, OPEN
>
> The repository cannot establish any of the following, and no artefact in this story claims them:
>
> - **whether buffering is actually off on the wire.** Two Ingress objects for one host are merged
>   by the nginx controller into one server block; `proxy-buffering` is location-scoped and *should*
>   apply to these paths only. Unverified. No snippet annotation is used, because clusters commonly
>   run with `allow-snippet-annotations: false`;
> - **the real idle timeout and the effective maximum stream lifetime** through the ingress and any
>   platform proxy in front of it. If the effective maximum is below the configured 60 s, the
>   configured value moves to match the measurement — it is a §8.5 starting value, not a commitment;
> - **which route carries the session cookie**, and whether it holds in **federated** mode, where
>   the MFE runs inside the platform shell's origin and the chart's CORS list cannot know it;
> - **whether reconnect with `Last-Event-ID` to a different replica** restores the current snapshot.
>   The production value set configures three API replicas scaling to six, and the design answers this by reading
>   committed state. **No session affinity or sticky-session setting may be introduced to make it
>   work** — that would trade a design property for a deployment workaround.
>
> Until SPK-02 is closed with HAR captures from a real browser on the staging hosts, treat streaming
> through that route as unproven. GET is the implemented recovery path, whose real ingress and
> trusted-identity behavior also require external validation.

**No credential ever goes in the URL.** `EventSource` cannot attach a header, and the tempting fix
is a token query parameter. URLs reach proxy logs, browser history and referrer headers. The route
takes none, and the chart asserts none is rendered anywhere.

### 7.1 The video route's refusals — what each one means to an operator

*Added by story 10.19's audit (AC-8a), 2026-09-17, because story 10.31 landed this surface after
this runbook was assembled and edits no runbook of its own. ADR-002 §24 and §25; verified in
`docs/specs/studio/openapi.yaml` on this tree.*

`GET /api/v1/studio/executions/{id}/video` distinguishes the following refusals; the difference
between them is the difference between a user problem, an authorization problem and **your**
problem:

| Status | Meaning | What an operator does |
|---|---|---|
| `401` | No usable session. The body is `PlatformErrorResponse` via the shared `SessionUnauthorized` response — **`error` is an object here**, not the string `ErrorResponse` carries. | Nothing. The browser needs a session. |
| `403 STUDIO_FORBIDDEN` | The caller may not read this execution — **including when the execution does not exist**, exactly as `getExecution` behaves. No resource detail is disclosed, and **an unknown execution is not `404`; authorized evidence absence can be `404`**. | Nothing, and **do not read a `403` as "the video is missing"**. It is existence-preserving by design. |
| `503 VIDEO_STORE_UNAVAILABLE` | *"The evidence store could not be reached; the recording's disposition is unknown."* | **This one is yours.** It is not a missing recording and not an expired one — it is the object store being unreachable from the API. Check the API's read-only store credentials (§3, two principals) and the store itself before telling anyone their evidence is gone. |

`404 VIDEO_UNAVAILABLE` means an authorized execution has no servable recording (including
processing/failed/unavailable state or an absent object). `410 VIDEO_EXPIRED` is logical expiry;
`416 RANGE_NOT_SATISFIABLE` is an unsatisfiable range (`Content-Range: bytes */size`). A malformed
Range is ignored. Authentication may also fail first with nested-platform
`503 AUTH_TEMPORARILY_UNAVAILABLE` and `Retry-After: 5`; it is distinct from the flat Studio
`503 VIDEO_STORE_UNAVAILABLE` and must not be diagnosed as missing video. **The §7 rule above applies to all of them: never fall back around a `401`/`403`** —
an auth failure on the stream or on the media route is an auth failure, not a transport fault.

**Still unproven through a real proxy, like the rest of §7.** None of these has been observed
through the real ingress with an ambient session. That is SPK-02 question 6/7 (`ED-06`, OPEN).

## 8. Manifest recovery

*Implements architecture §6.2 and §5.4. Story 10.18b.*

The runner writes evidence to the private store under a fixed prefix and then reports the manifest
key in its terminal report. If the terminal report is lost but the upload succeeded, the recovery
path reads the manifest at the known key rather than re-running the test.

**An operator may:** read the execution snapshot and authorized video through the API, and
re-read after a failed first attempt. There is no public raw-manifest endpoint; the internal
reconciler reads its server-derived key. The attempt is part of both keys:
`studio/{csiId}/{testId}/{executionId}/{attemptId}.result.json` and `.webm`. The reconciler checks
the manifest identity and uses conditional terminal-state guards — a `GET` on a key immediately after a `PUT` is the consistency case SPK-03 must
confirm on the real store.

**An operator may NOT:** write into the runner's prefix or hand the runner a read credential.
For `s3`, the required write-only/read-only principals and unequal Secret names are §3's
configuration contract; actual IAM denials remain unverified. Local mode shares a filesystem and
does not provide that IAM boundary. If you find yourself needing the runner to read something back, the design has changed and
§6.2 needs re-reading first.

**Expiry is logical.** The API stamps `videoExpiresAt` from the one configured retention window, and
the lifecycle ConfigMap is declared from the same `objectStore.retention` key, without applying a store rule. **Nothing here claims exact-time physical
deletion** — whether lifecycle expiry is prompt, whether noncurrent versions and delete markers are
collected, and whether a `GET` on an expired object still serves are **SPK-03**'s to measure
(`ED-03`, OPEN).

## 9. Identity and authentication — what is closed, and what still exists

*Implements architecture §9.1. Story 10.18b, AC-19a and AC-20. External dependency **`ED-02`**.*

> ### ⚠ THE BYPASS CODE PATHS STILL EXIST. THEY ARE CLOSED BY CONFIGURATION, NOT REMOVED.
>
> This section says so in plain words because a hardening story that ships without saying it ships a
> deployment whose readers assume the opposite.

**There are three of them, not one.** Every record in this epic — including the manifest's `ED-02`
description — has described `ED-02` as a single hardcoded flag. It is three, and the order among
them decides whether closing achieves anything:

| # | Path | What it grants | Closed by |
|---|---|---|---|
| 1 | `BffSessionAuthenticationFilter.isCoreServiceBypassed()` | the `platform-bypass` identity, carrying `checks-admin` **and** `platform-admin`, to any caller with no session | `checks.security.bypass.core-service` → `CHECKS_BYPASS_CORE_SERVICE` |
| 2 | the `X-User-Id` / `X-User-Email` / `X-User-Roles` / `X-User-Csi-Ownership` headers | **whatever identity, roles and CSI ownership the caller writes in the request** | `checks.security.bypass.identity-headers` → `CHECKS_BYPASS_IDENTITY_HEADERS` |
| 3 | `applyTemporaryCsiReadBypass` | `checks-admin`, appended to any identity making a `GET` under `/api/v1/csi` | `checks.security.bypass.csi-read` → `CHECKS_BYPASS_CSI_READ` |

**Path 2 is checked *first*.** `resolveIdentity` returns the header identity **before** it ever
reaches the Core-service bypass, so closing path 1 alone closes **nothing at all** for a caller that
can reach the pod and send a header. Architecture §9.1 requires a trusted gateway to strip or
replace these headers and to prevent direct-backend impersonation; **this repository contains no
such gateway**, which is why the application now refuses them by default instead.

**All three application defaults are `false`.** The API template emits them explicitly from
`backend.identityBypass`; the four shipped value combinations keep them false. This is a source
configuration statement, not an inspection of deployed pods. The worker has its own security chain
and is not the public BFF identity route.

**What is still open, and it is not small:**

1. **The code paths survive.** Removing them is `ED-02`'s, not this story's: deleting the
   Core-service bypass moves identity resolution onto `CoreServiceClient`, and the filter's own
   comment records why that is unavailable — *"while the target platform does not provide Core
   services."*
2. **The Studio real-vault flow exists but is default-off.** `hashicorp` performs bounded KV v2
   reads, create-only writes and metadata lists using a mounted token file, returns the nonsecret
   Vault version, distinguishes `404` from outages, and resolves values only on the scoped execution path; the retired compile path is not a current operation. Secret-use authorization is still development configuration. The plaintext `secrets`
   table is gone (historical V25, now V18); Vault is the only store (§9.2). Real policy/endpoint proof is still
   `ED-02`.
   **Every Studio secret needs an `allowedOrigins` key** (story 10.44, ADR-SC-003) beside its value
   in the KV v2 entry (a secret saved through Studio is written with one; §9.2): comma-separated `scheme://host[:port]` origins, http(s) only, at most 16.
   The current password write checks the secret's origins **and** the session's approved origins,
   plus form-action origin before and after focus. Current refusals include `POLICY_DENIED`,
   `PASSWORD_FORM_ACTION_NOT_ALLOWED` and target-change/ambiguity codes; the historical
   `SECRET_ORIGIN_NOT_ALLOWED` wording in older comments is not the current observed runtime code. A missing, empty or malformed list binds the secret to no origin
   (fail closed), and the API logs a WARN naming the reference.
3. **`ED-02` has an owner now, and still has no ticket.** *(Corrected 2026-09-17 by story 10.19's
   AC-8 audit. This item used to read "`ED-02`'s owner reads `TBD — not assigned in sources`. @po
   could not name one and said so", and named an escalation path — **@pm** to Checks-squad
   engineering management through BRD §8's launch-exit/on-call row, with **Security & Compliance**
   (BRD §11) accepting. That escalation was overtaken.)* The owner, assigned directly by the user on
   2026-09-16 and recorded by @pm in the manifest's `owner_decision` block, is the **PUT Core
   platform (the Core BFF)**, for identity **and** vault, delivered outside Epic 10. The manifest's
   own `traceability` field states the assignment is not traceable to the BRD or the architecture.
   **`external_ticket` reads `"to be linked — no ticket ID exists yet"` and `status` reads `open`.**
   Item 4 is unaffected: an owner is not a delivery.
4. **No credentialed pilot may run until `ED-02` has linked completed tickets.** That is `ED-02`'s
   own `gate_note`, not this document's opinion, and it is **unchanged**. *(The second half of this
   item — @po's ruling that story 10.19 may not be **drafted** while `ED-02`'s owner read TBD — is
   spent, corrected 2026-09-17. That drafting gate lifted on 2026-09-16 with the assignment above;
   10.19 is drafted and validated GO 8/10. The pilot gate is untouched by that.)*

**An operator may NOT** set any of the three to `true` in a staging or production values file
without Security's explicit acceptance. The core-service and identity-header paths can grant unauthenticated administrative identity;
the CSI-read path adds `checks-admin` to a resolved identity for CSI GETs.

**One residual, because this section is otherwise only true about the chart (QA SEC-003).**
`application.yml` declares `spring.profiles.active: local` as its built-in default, and the `local`
profile now carries `identity-headers: true`. **A process started with no profile set at all
therefore trusts identity headers.** That cannot happen through this chart — all four value sets
render `SPRING_PROFILES_ACTIVE` explicitly on both the API and the worker, unconditionally, and none
of them names `local` or `test` — and it is strictly better than what it replaced, which was a
hardcoded `return true` that trusted *everything* in every profile. It is recorded here rather than
fixed because changing the built-in default profile affects every developer workflow in the
repository and is not a Studio story's to change. **If you ever run this image without
`SPRING_PROFILES_ACTIVE`, you are running with header identity trusted.**

### 9.1 What story 10.30 closed — and what it did not

*Added by story 10.19's audit (AC-8a), 2026-09-17. Story 10.30 merged at `72e95cbbd` after this
runbook was assembled and edits no runbook of its own. ADR-002 §27; verified in
`docs/specs/studio/openapi.yaml` on this tree.*

**Until 10.30, `POST /tests`, `PUT /tests/{id}` and `DELETE /tests/{id}` had no CSI write
authorization at all** (`O-18`, raised by @architect while ruling `O-10`). @qa demonstrated it
before it was fixed: a viewer, a contributor and a stranger each got `200`/`204` on another CSI's
draft **and the database rows changed**; a `POST` succeeded on a view-only CSI. It is fixed —
`requireWrite` on create, save and delete, through the visible read.

**The ruled status, which an operator will see in logs and should not misread:** an id that is
unknown, a draft that is soft-deleted, a draft that is quarantined, and a draft on a CSI the caller
may not use **all answer the same `403 STUDIO_FORBIDDEN`**, with no resource detail, on
`GET`/`PUT`/`DELETE /tests/{id}` with valid request syntax. Malformed requests may be `400`;
resource invisibility is `403`, not `404`. The four cases are deliberately
indistinguishable from outside. **A support ticket saying "I get 403 on a test I am sure exists" is
not evidence that it exists.**

**What this does NOT close.** These checks run against whatever identity
`BffSessionAuthenticationFilter` resolved — which, with any of the three bypasses above open, is
whatever the caller wrote in a header. 10.30's own tests run with the `identity-headers` bypass open,
because that is how the suite injects identities. **An authorization check is only as trustworthy as
the identity beneath it, and that identity is still `ED-02`'s.** Proving this boundary against a
real, non-header-injected identity is story 10.19 AC-7, **blocked**.

**A separate, profile-scoped bypass also exists and is not one of the three.**
`LocalDevAuthFilter` injects a fixed developer identity, is annotated `@Profile("local")` and is
governed by `checks.local-dev-auth.enabled`. It cannot load in any deployed profile — the chart
renders `api,dev` / `api,staging` / `api,prod` — and it is named here so that a reader counting
bypasses finds four accounted for rather than three and a surprise.

### 9.2 Studio secrets in Vault

*Added by studio-vault-secrets, 2026-09-22 (ADR-002 §32).*

**Where a secret lives.** Only in Vault KV v2, at

```
{mount}/data/studio/{csiId}/{environment}/{testId}/secrets/{name}
```

with two keys in the entry: the value under `STUDIO_VAULT_VALUE_KEY` (default `value`) and
`allowedOrigins` (comma-separated, normalized). The CSI, environment and test id come from the
persisted draft, never from a request. The plaintext `secrets` table was dropped by historical V25, now
`V18__drop_plaintext_secrets.sql` after OBS-012A's pre-release rebaseline; rows were purged, not migrated.

**Saving and listing.** `POST /api/v1/studio/tests/{id}/secrets` (needs write access to the
draft's CSI) is a **create-only** write (`cas=0`). `GET` on the same path (read access) lists
names, never values. Studio cannot rotate, replace or delete a secret: fix it in Vault directly,
or create a new name and point the step at it. The existing operator examples are `vault kv put`
for a new version and `vault kv metadata delete` for metadata removal. `vault kv delete` only
soft-deletes a version: metadata can keep the name listed while value resolution fails and
create-only recreation can still conflict. These are external Vault CLI operations, not Studio
endpoints or commands verified here; PUT Core/platform Vault owners must confirm the installed
CLI/version, permitted path and soft-delete/CAS behavior before using them. No current
`UNKNOWN_REFERENCE` guarantee is inferred from that historical example.

**Connecting Vault is not enough to run with a secret.** Secret use is still decided by the
development entitlement map `studio.secrets.entitlements` (`principal|csi|environment -> ids`);
the production secret-use policy is PUT Core's and not built (V6). A run whose principal is not
entitled to a secret there is refused even when Vault holds it. A `503 VAULT_UNAVAILABLE` is
logged at WARN as `Studio Vault call failed: …` with Vault's HTTP status, which is how a token
missing `create` or `list` shows.

**What each answer means:**

| Answer | Meaning |
|---|---|
| `503 VAULT_NOT_CONFIGURED` | The provider is `none`. Expected until Vault is connected. Not an outage. |
| `503 VAULT_UNAVAILABLE` | Vault did not answer, answered an error, or the token was refused. |
| `409 SECRET_ALREADY_EXISTS` | The name is already stored for this test. The stored entry was not touched. |
| `403 STUDIO_FORBIDDEN` | Unknown draft, or no access to its CSI. Decided before the body is read. |

**Turning it on** takes environment variables only:

- required: `STUDIO_VAULT_PROVIDER=hashicorp`, `STUDIO_VAULT_ADDRESS` (https; plain http only on
  loopback), `STUDIO_VAULT_TOKEN_FILE` (a readable mounted token file);
- optional: `STUDIO_VAULT_NAMESPACE`, `STUDIO_VAULT_MOUNT`, `STUDIO_VAULT_PATH_TEMPLATE`,
  `STUDIO_VAULT_VALUE_KEY`.

A path template must contain `{csiId}`, `{environment}`, `{testId}`, `{kind}` and end with
`/{referenceName}`, or the api and worker refuse to start. The chart's `studioVault.pathTemplate`
default is `studio/{csiId}/{environment}/{testId}/{kind}/{referenceName}`.

**The token policy each pod needs:**

- **api:** `create` and `read` on `{mount}/data/studio/*` (scoped value resolution; secret acceptance preflight uses names only), and
  `list` and `read` on `{mount}/metadata/studio/*`.
- **worker:** `read` on `{mount}/data/studio/*` only.

`update` is not needed. Without it, a duplicate write may come back from Vault as `403` rather than
`400`; the API then reads the entry's metadata and still answers `409`. That Vault behaviour is
inferred from HashiCorp's documentation and has not been checked against the platform Vault.

**Caveats an operator will meet:**

- **Response size.** A value may be up to 4096 characters (OBS-007 AC-12); a longer entry already
  in Vault is refused at dispatch with `SECRET_TOO_LONG`, never truncated. Keep
  `STUDIO_VAULT_MAX_RESPONSE_BYTES` at its 64 KiB default: it bounds the entire encoded response,
  including metadata and origins, not just the value. A lower cap can make an entry unreadable
  (`VAULT_UNAVAILABLE`) before its value-length refusal. The old approximate 34/57 KiB sizing
  advice is not a measured safe bound for current response contents.
- **Changing a test's environment hides its earlier secrets.** They stay in Vault under the old
  environment, are not listed, and do not resolve. This is the intended scoping.
- **Deleting a test leaves its Vault subtree behind.** Purge it in Vault by prefix if needed; Studio
  does not.
- **CSRF.** The save route is one more cookie-authenticated mutation without a CSRF control (§10),
  and this one writes to Vault.

## 10. CSRF — an open prerequisite, not a solved problem

*Implements architecture §9.1 ("cookie-authenticated mutations require a documented CSRF control").
Story 10.18b, AC-21a. Blocked half: **SPK-02 question 7**.*

**The gap, with the two facts that bound it, both read on this branch:**

1. the browser's credential is a **cookie** — `put_session`, read by
   `BffSessionAuthenticationFilter.extractSessionCookie`; and
2. CORS is **credentialed** — `SecurityConfig.buildCorsSource` sets `setAllowCredentials(true)` for
   `/api/**`, and this chart deploys the MFE and the API on **different hosts**.

`SecurityConfig.filterChain` opens with `http.csrf(csrf -> csrf.disable())`. An ambient cookie plus
state-changing endpoints is the classic forgery surface. `SameSite` on the cookie would bound it,
but **this application does not set the cookie — Core does** — and what Core sets is not established
anywhere in this repository.

**This story deliberately did not "fix" it.** Enabling Spring's CSRF filter or dropping CORS
credentials changes the public request contract of every existing Checks route — every mutation
would need a token the frontend does not send today — and landing that inside a Studio story is the
class of change ADR-002 §12 reserves for a ruling.

**What closes it:** SPK-02 question 7 — a written statement from the platform of its browser-auth
route and of the CSRF control that route provides, and whether the application must add one.
`ED-06`, OPEN.

## 11. Spring configuration delivery

Story 10.27 resolves the AC-18 escalation from story 10.18b. Backend and worker
`configOverrides` now render into separate `*-properties` ConfigMaps containing
`application.yaml`, mounted read-only at `/etc/put-checks/config`. The containers load the
mandatory file `/etc/put-checks/config/application.yaml` through `SPRING_CONFIG_ADDITIONAL_LOCATION`; the chart reserves this selector
against replacement through generic `env` or `envFromSecrets` values.

Dotted property names, hyphens, nested values, and case-sensitive map entries are preserved.
The original `*-config` ConfigMaps still supply valid environment entries such as `SERVER_PORT`.
Frontend configuration and secret environment references keep their existing delivery mechanism.

Spring loads the mounted file in addition to its packaged defaults. Canonically named Spring
environment properties take precedence over this file. A custom `${ENV_ALIAS:default}` placeholder
in packaged configuration is different: an override of its containing property can replace the
placeholder. The chart's `springConfig.validateProperties` rejects overrides of its managed identity bypasses, CORS origins/Core service URL, execution/dispatcher
switches, evidence retention, SSE bounds, runner/callback identity, and storage wiring (both
`studio.storage.*` and `studio.execution.video-store.*`), the Studio Vault client
(`studio.secrets.vault.*`) and the **historical** compile gateway names (`studio.compile.gateway.*`), as well as
profile/configuration imports. Use the dedicated chart values or Secret references for these
controls (`env` for the CORS/Core service URLs). For other aliased properties, configure the alias through `env`/`envFromSecrets` and
avoid also setting its property in `configOverrides`.

**Current gateway protection gap (source audit, 2026-10-20).** The actual gateway binds
`studio.gateway.*`, not `studio.compile.gateway.*`. The protected-name list still names the latter
and does not reject `studio.gateway.*` in `configOverrides`; a mounted containing property can
replace the packaged `STUDIO_GATEWAY_*` placeholder. Do not infer gateway integrity from that
old guard. @devops/@architect own reconciliation; no source/policy change is made here. Inspect
the effective gateway property source alongside §13's environment entries before a rollout.

Changing `configOverrides` changes the existing pod checksum and rolls the workload.
Use `configOverrides` for non-secret Spring properties; keep credentials in Secret references.

This activates the previously ineffective database pool, scheduler, and executor overrides.
Review the rendered values for the target environment before rollout: for example, production
worker concurrency is 250, its pool size is 30, and scheduling batch size is 500. Values are
operator configuration, not newly measured capacity recommendations.

`studio-runner/test/deployment/envfrom-keys.test.ts` now requires every envFrom-consumed key to
conform and verifies each mounted property against the effective chart values in all four value
sets. Dotted-property mutations must survive delivery; an invalid frontend envFrom key must still
trigger the detector. There is no expected-red exception or key allowlist.

**OWNER: @devops. MECHANISM: @architect.** Profile activation (including include/default/groups),
configuration import/location selectors, and JSON property injection cannot bypass the chart-owned
profile/source through generic environment or secret entries. Dedicated remote profiles also reject
`local` and `test`. The same rules apply to flat, nested and relaxed property spellings.
**Historical 10.18b alias-delivery observation (not a guarantee for later renamed properties):** `STUDIO_SSE_*`, `CHECKS_BYPASS_*`,
`STUDIO_EXECUTION_ENABLED`, `STUDIO_DISPATCHER_ENABLED` and every `STUDIO_RUNNER_*` key render as
container `env` entries with conforming names, and that is asserted separately so this escalation
cannot be read as covering for them.

---

## 12. Rollback — how to take a Studio release back out

*Added by story **10.19** (AC-9), 2026-09-17. **This epic had never written one down**: before this
section, the string "rollback" did not occur in this runbook, in `docs/architecture/studio-execution.md`,
in `docs/brd/checks-ui-studio.brd.md` or in `docs/epics/EPIC-10-EXECUTION.yaml` — verified, not
assumed. The retired epic's own §10.19 acceptance bullet 7 required one.*

**Read this before the first step: a rollback here is not symmetric.** The chart goes back; the
database does not, and the evidence does not. Sub-parts (c) and (d) exist because an operator who
assumes symmetry will draw wrong conclusions about what they are looking at afterwards.

**Nothing in this section has been exercised against a deployed cluster.** There is no cluster to
exercise it against — `ED-05` and `ED-06` are open. Each step below is derived from a mechanism that
is verified in this repository (the kill switch's behaviour, the chart's object set, Flyway's
forward-only configuration, the evidence key layout), and the step order is derived from those
mechanisms. **It is a written procedure, not a rehearsed one**, and the first person to run it should
say so in the incident record.

<!-- ROLLBACK-A-KILL-SWITCH -->
### (a) Engage the kill switch first — always, before anything else

`studioExecution.enabled: false` → `STUDIO_EXECUTION_ENABLED` → `studio.execution.enabled`. See §6
for what it does and how it was proven.

**Why it is step one and not step three.** The kill switch rejects new executions with
`503 DISPATCH_DISABLED` and closes queued undispatched work explicitly, while **already-admitted runs
finish and report**. Rolling the chart back without engaging it first tears down runner pods that are
mid-session: a Chromium process is killed with its recording incomplete, its callback never arrives,
and the execution is reconciled by a reaper (§5) instead of by its own result. That is an orphaned
run and a lost recording for every test in flight, and it is entirely avoidable by spending the
admitted runs' remaining time first.

**Wait for admitted work to drain before step (b).** §4 is the replay drain contract; §5 tells
you how to read that ledger. Current guided starts are gated too, with `409 RUNTIME_INCOMPATIBLE`
(§6), but admitted guided work has its own session lifecycle and drain procedure in
`studio-guided-authoring.md`. An empty replay ledger alone is not proof that guided work drained. Reads and recovery stay up throughout — `GET
/api/v1/studio/executions/{id}` is unaffected by the switch — so users keep their history and their
existing evidence while Studio stops accepting new work.

**Do not turn the dispatcher off as well.** §6 is explicit: the two keys are separate on purpose, and
turning the dispatcher off leaves the queued work the kill switch promised to close sitting in the
ledger until its deadline.

<!-- ROLLBACK-B-HELM-ROLLBACK -->
### (b) `helm rollback` to the prior chart revision — the mechanism, not a new tool

```
helm history  <release> -n <namespace>     # identify the revision to return to
helm rollback <release> <revision> -n <namespace> --wait
```

These are written operator commands, not commands run by this audit. Helm restores the
selected release revision's managed object set, conditional on that revision's values/templates: the API and worker
`Deployment`s and their `ConfigMap`s, the runner `Deployment` and `Service`, the API `Ingress` **and
the separate Studio streaming `Ingress`** (`…-api-studio-stream`, the one carrying buffering-off and
the derived `proxy-read-timeout` — §7), the runner `NetworkPolicy`, the `ServiceAccount`, the `HPA`
and the `PDB`. Templates, for an operator checking what is in scope:
`helm-chart/put-checks/templates/{deployment,configmap,service,ingress,studio-sse-ingress,
studio-runner-deployment,studio-runner-service,studio-runner-networkpolicy,api-guided-tls-networkpolicy,
studio-object-store-pvc,studio-runner-scaledobject,serviceaccount,hpa,pdb}.yaml`. External Secrets,
Vertex routing ConfigMaps, actual storage policy and other pre-provisioned resources are not
restored merely by rolling this release back; inspect revision compatibility and §14 first.

**Two things to re-check after the rollback completes, because they are the ones that fail quietly:**

1. **`SPRING_PROFILES_ACTIVE` is still rendered explicitly** on both the API and the worker. §9's
   recorded residual: a process started with no profile at all falls back to the built-in `local`
   default, and `local` trusts identity headers. All four value sets render it unconditionally, so
   this should hold — confirm it rather than assume it.
2. **All three `CHECKS_BYPASS_*` keys still render `false`.** §9 again. The deployed profile is meant
   to be auditable from the manifest rather than from a default somebody may change, and a rollback
   moves you to a manifest you have not read today.

**`configOverrides` rolls back with the chart.** Since story 10.27 it is rendered into the release's
own `*-properties` ConfigMaps and mounted into the container (§11), so it is part of what a chart
rollback restores rather than something outside it.

<!-- ROLLBACK-C-FORWARD-ONLY-MIGRATIONS -->
### (c) The database does **not** roll back — every Studio schema change is forward-only

**Current migration correction (2026-10-20).** OBS-012A performed a pre-release Studio
rebaseline above untouched core V1–V11. The current public classpath contains Studio V12–V22:
tests/revisions, executions/ledger, guided sessions, publication, scheduling, secret-use audit,
plaintext-secret removal, guided governance/recording/replaying-prefix and replay failures.
The old V12–V18/V20–V23 list and manually staged V19 inference cutover described here before
this correction are obsolete; `backend/db/cutover/` is absent, and current V19 is guided
governance. `application.yml` uses `classpath:db/migration` by default and
`baseline-on-migrate: false`. Migrations are forward-only again from this rebaseline, with no
current down-migration procedure. Do not run the retired inference cutover instructions for this tree.

**Say this in plain words so nobody has to infer it: a chart rollback moves the application
backwards and leaves the schema where it is.** The consequences an operator should expect:

- **Confirmed executions, drafts and revisions created by the rolled-back version remain in the
  database.** Readability through the older application depends on schema/contract compatibility;
  chart rollback does not delete these rows, and they must not be deleted to "match" the
  older application. Execution history carries an immutable revision reference (§8.1); deleting rows
  to tidy a rollback destroys evidence somebody may be relying on.
- **The older application must tolerate the newer schema.** Forward-only does **not** imply additive: current V18 drops the plaintext secrets table.
  Compatibility must be established for the specific old application and current schema before rollback;
  source alone does not establish it. It is still the thing to check first if the rolled-back
  pods will not start: read the startup logs for a mapping or constraint failure before suspecting
  the chart.
- **If a specific migration must actually be undone**, that is a **new forward migration**, written,
  reviewed and shipped through the normal cycle — not a hand-edited database and not a Flyway
  `undo`. There is no emergency exception to this; a hand-repaired schema is a schema nobody can
  reason about afterwards.

<!-- ROLLBACK-D-EVIDENCE-UNAFFECTED -->
### (d) Stored video and manifests are unaffected by a chart rollback

Evidence lives in the object store under `studio/{csiId}/{testId}/{executionId}/` — **addressed by
key, not by chart revision**. The release templates do not perform object-store deletions or
rewrite recordings. That is not a blanket storage-safety guarantee: local evidence uses a chart-
managed PVC, and the selected revision's object set, claim/storage wiring and retention must be
checked before rollback. Previously written recordings and manifests
can be served through the video route only if the selected application revision remains compatible
with their schema/key layout, configured store, expiry and authorization. Rollback is not proof of readability.

**Logical expiry keeps running regardless.** §3: the API enforces expiry at `videoExpiresAt` from
`studio.execution.evidence-retention`, and the object store's lifecycle window renders from the same
values key. The default is **30 days**, stamped when available evidence is applied by a report or recovered
manifest; existing `videoExpiresAt` timestamps do not pause or restart during rollback. An execution recorded shortly before the
rollback expires on its original schedule.

**Two cautions that follow from this.**

- **Changing `evidence-retention` does not recompute expiry for already stamped rows**: the
  snapshot mapper compares the persisted `videoExpiresAt` to its clock. A different value affects
  newly applied report/recovery evidence. The lifecycle ConfigMap is only a declaration; any actual
  bucket-policy change and physical deletion still need separate Platform/SRE handling. Check the
  selected revision's retention and schema behavior before rollback.
- **Physical deletion timing is still unmeasured.** §3 and `SPK-03` (`ED-03`, OPEN): this runbook
  makes no claim of exact-time physical deletion, and a rollback changes nothing about that. If asked
  "is the video gone", the true answer remains *the API stops serving it at the window; when the
  bytes are removed has not been measured.*

<!-- ROLLBACK-END -->

### (e) Executor and contract release order — three steps in one window

> **Superseded for the current system (2026-10-18, STUDIO-OBS-009).** This subsection describes the
> artifact-1 executor version pin (`2.0.0` to `2.1.0`) and its `RUNTIME_INCOMPATIBLE` refusal. The
> artifact-1 stamps and that check were retired (STUDIO-OBS-012A, STUDIO-OBS-009 AC-1 P2): a grep of
> `backend/src/main` and `helm-chart` finds no `executor-version` property today. It is kept as the
> record of how that release was ordered. **Do not follow its steps for a current release**; the
> current upgrade notes are §14.4 above and the STUDIO-OBS-010 runbook.

*Added 2026-10-04 (VAL-031). Reconciled 2026-10-05 with VAL-012 (ADR-002 §33.3), following the
re-gate `regate_2026-10-04b.release_sequence` in
[`docs/qa/gates/ui-studio-validation-20261004.yml`](../qa/gates/ui-studio-validation-20261004.yml).*
The earlier text said only "runner first, backend pin second". On its own, that order is unsafe.

**The conflict.** This release has two ordering constraints, and they point in opposite directions:

- **VAL-012 (ADR-002 §33.3) needs the backend first.** The 2.1.0 runner sends
  `RunnerLogEntry.stepIndex`. An old backend rejects the unknown property
  (`ignoreUnknown = false`), every progress and final report fails, and the run is reaped.
- **VAL-031 needs the runner first.** The backend pin is recorded on revision provenance, and a
  `2.0.0` runner refuses revisions with `2.1.0` provenance (`RUNTIME_INCOMPATIBLE`).

One backend artifact carries both the `stepIndex` acceptance and the `2.1.0` default pin, so neither
order is safe by itself. The override env var
`STUDIO_RUNTIME_EXECUTOR_VERSION` (`studio.runtime.pin.executor-version` in the backend
`application.yml`, default `2.1.0`) splits the two changes apart.

**Safe sequence:**

1. **Deploy the backend with `STUDIO_RUNTIME_EXECUTOR_VERSION=2.0.0`** as an explicit override. The
   new code accepts `stepIndex`, and new revisions carry `2.0.0` provenance, which both runner
   versions accept.
2. **Deploy `studio-runner` with executor `2.1.0`.** Its `stepIndex` is now accepted. Revisions with
   `2.0.0` provenance keep running, because the executor is compared as a backward-compatible minor.
3. **Remove the override**, so the pin becomes `2.1.0`, and restart the backend.

**Rollback runs in reverse:**

1. Set the pin back to `2.0.0` (re-add the override).
2. Roll the runner back to `2.0.0`. Revisions compiled with `2.1.0` provenance are refused until
   they are recompiled.
3. Roll back the backend code. §12(a) through §12(d) still apply: kill switch first, and the
   database does not roll back.

**Run steps 1 through 3 in a single window.** The executor pin is a compile-fingerprint input, so
step 3 changes every fingerprint again. Step 1 also ships prompt `2.3.0`, `providerSchemaVersion`
`2` and `thinking-level: LOW`, and those already force one recompile of every test.

**Expected recompiles:**

- **Most tests recompile once.** That covers any test that is not recompiled between step 1 and
  step 3: the step 1 change and the step 3 change are absorbed into its next compile.
- **Tests recompiled inside the window recompile twice,** once for step 1 and again after step 3.
  Keeping the window short keeps this set small.
- **A rollback past step 1 forces another recompile,** because the fingerprint inputs revert.

**Release checklist** (all are release gates, not code defects):

- **R2D2 proxy probe (VAL-030, gate QA-2).** Before any R2D2 rollout, send one probe call through
  the proxy with the v2 provider schema (a per-status `anyOf`) and `thinking-level: LOW`. Until it
  passes, ship on Vertex only. If the proxy rejects either one, every compile on that path fails,
  and the only remedy is a code revert.
- **Deployment tier against the release image (gate QA-R5).** Run
  `vitest.deployment.config.ts` with `STUDIO_RUNNER_IMAGE` set to the image built from the release
  tree (executor `2.1.0`), not the default `10.18a-local` image.
- **ED-02 for credentialed pilots.** Do not run a credentialed pilot until `ED-02` closes. See §9 and
  `docs/epics/EPIC-10-EXECUTION.yaml`.

### After the rollback

Leave the kill switch engaged until you have decided Studio should accept work again, then turn it
back on deliberately. §6: the switch defaults to ON precisely so that an operator can tell an outage
from a decision — and re-enabling it is a decision, not cleanup.

Record what happened in the open-items register
([`docs/qa/staging-acceptance-register.md`](../qa/staging-acceptance-register.md)) if the rollback
exposed something this runbook does not describe. That register is the handover document; this
runbook is the operating one.

---

## 13. Plain-English translation through Vertex AI

Studio's supported user path starts with ordinary instructions. The API translates them through
Vertex AI before review and confirmation; operators must never ask a user to replace those
instructions with browser commands.

### Deployment contract

The staging/production value sets configure the API gateway environment entries below.
`checks.sources.UI_TEST=true` is delivered through mounted Spring `configOverrides` in shipped
values (an explicit `CHECKS_SOURCES_UI_TEST=true` environment entry is also accepted by the guard):

```text
STUDIO_GATEWAY_PROVIDER=vertex
STUDIO_GATEWAY_MODEL=gemini-3.8-flash
STUDIO_GATEWAY_CREDENTIALS_MODE=application-default
```

`STUDIO_GATEWAY_ENDPOINT`, `STUDIO_GATEWAY_PROJECT`, and `STUDIO_GATEWAY_LOCATION` come from the
pre-provisioned ConfigMap named by `studioGateway.vertexConfigMap.name`. Its keys default to
`endpoint`, `project`, and `location`. The repository intentionally does not guess these
environment-owned identifiers. For `gemini-3.8-flash`, the ConfigMap's `location` must be a
platform-approved `global`, `us`, or `eu` location; Helm cannot inspect the contents of an external
ConfigMap, so this remains an explicit pre-deploy check. Before deploying, verify the ConfigMap
exists in the release namespace and that the API service account has the minimum Vertex prediction
permission through workload identity.

The chart derives staging/production status from `backend.springProfile`, not from an operator-
controlled label. It fails closed when a deployed profile selects `disabled` or
`recorded-fixture`, when its environment label disagrees with the Spring profile, when
`checks.sources.UI_TEST` is not explicitly true, when the provider is unknown, or when Vertex
routing configuration is incomplete. The current provider enumeration is only `disabled` or `vertex`; `recorded-fixture` is no longer
a selectable provider, including local/test. Test doubles are test infrastructure, not a deployed fallback.

### Pre-deploy check

Render the target value set and inspect the API container. Confirm the provider and model literals,
the three ConfigMap references, application-default credentials, and effective
`checks.sources.UI_TEST=true` from its mounted property/environment source. Check §11's renamed
gateway protection gap; environment entries alone do not prove the effective property values. Do not deploy if any routing reference is a literal
placeholder, if the ConfigMap is absent, or if the source is disabled. Then run the three plain-English
release scenarios through translation, readable review, explicit confirmation, browser execution,
and evidence capture. A runner-only pass does not validate translation.

### Failure handling and rollback

The current backend gateway binds `studio.gateway.*` with a packaged 150 s transport timeout,
concurrency 4 and LOW thinking; guided translation separately defaults to a 60 s call budget,
65536 input bytes and 4096 output tokens. It requires enabled translation and configured
application/environment allowlists (`GuidedTranslationProperties.permits`), whose defaults are
empty. These are source bounds, not measured capacity or provider approval. The model/location
compatibility, real endpoint, workload identity, allowlists, quota and the three release scenarios
remain environment-owner inputs/proof; this audit contacted no provider.

If translation becomes unavailable, the operator procedure is to keep Save available and stop new translation/execution; do not
switch a shared environment to recorded fixtures. Check API readiness and logs, ConfigMap presence,
workload-identity binding, Vertex quota, and endpoint reachability. Roll back provider/model changes
with the chart revision only after engaging the Studio execution kill switch and draining admitted
runs as described in §12. Existing confirmed revisions and evidence remain revision-bound.

---

## 14. One entrypoint, TLS everywhere, the one-pod guard and the new Secrets (STUDIO-OBS-009)

*Written 2026-10-18 by @devops from the rendered chart and the lane receipts under
`docs/qa/evidence/STUDIO-OBS-009/execution-20261018/`. **Legend:** [V] asserted on `helm template`
output by `studio-runner/test/deployment/` or read from source today; [U] not run, owner named. No
certificate was issued, no Secret created, no pod started and no image built by this change. The
guided-authoring operating procedure (sessions, drain, abandon) is the separate STUDIO-OBS-010
runbook, `studio-guided-authoring.md`; this section covers only what changed in the pod and the
chart.*

### 14.1 One entrypoint, one Deployment

- The image starts **`node dist/main.js` and nothing else.** There is one process, one Deployment
  and one listener. Guided authoring is a **mode** of that process, switched by
  `STUDIO_RUNNER_GUIDED_ENABLED` (chart: `studioRunner.guided.enabled`, **`false` in every shipped
  values file**). There is no second Deployment, no second start script and no mounted JSON
  configuration file. [V] `chart.test.ts` asserts one runner Deployment and no guided template file.
- Configuration is `STUDIO_RUNNER_*` environment keys only. The runner refuses an unenumerated
  `STUDIO_RUNNER_*` key at start (exit 78), so a stray key from an old release fails the pod instead
  of being ignored. `STUDIO_RUNNER_VAULT_ADDRESS` is one such key, refused on purpose. [V]
- With the switch on, seven guided keys are required (worker id, journal directory, controller
  issuer, subject, public-key file, callback base URL, callback token file); with it off, **any** of
  them is refused. The chart renders them as a set. Names: `studio-runner/README.md`, "Guided
  observed-2 worker".
- `/ready` and `/health` do not change with the mode, and no guided field appears in them. A guided
  session is visible to operators through the backend, not through the probes. [V]

### 14.2 TLS everywhere: what the chart now requires

The runner serves **TLS only**, with a client certificate **required**; there is no plaintext
listener in any configuration. A runner that cannot read its TLS files does not start. [V]

| Item | Where | Provider |
|---|---|---|
| Runner key, certificate, CA | Secret `studioRunner.tls.secretName`, mounted read-only at mode 0440, directory mount, no `subPath` | Platform/SRE |
| Controller pin | `studioRunner.tls.controllerCertificateFingerprint256`: SHA-256 of the backend client certificate, 32 upper-case hex pairs joined by `:`. **No default. The render fails without it** (and in any other form) | Platform/SRE, per environment |
| Backend key store and trust store (API and worker) | Secret `studioRunner.backendTls.secretName`, PKCS12 plus password **files**, rendered as `studio.runner.tls.*` in the mounted `application.yaml` | Platform/SRE |
| Runner base URL used by API and worker | `https://<fullname>-studio-runner:<port>` | the chart |
| Exec probe | `node dist/probe.js`, an HTTPS client of its own pod using the runner's own certificate; reads the files on **every** run | the image |

- **A request that presents a CA-issued certificate that is not the pinned backend certificate is
  refused 401 before any bearer check** on every route except the probe's `/health` and `/ready`.
  The pin is therefore as sensitive as a key: a renewed backend certificate with an unchanged pin
  refuses every inbound call. [V] (`tlsListener.test.ts`, per the D1 receipt)
- **The runner private key and the backend private key never share a pod.** The two Secrets are
  different and neither pod references the other's. [V]
- **Rotation.** The runner reads key, certificate and CA **once**; the probe re-reads them every
  run. So after a certificate change, bump `studioRunner.tls.rotationRevision` and release: without
  a restart the probe presents the new certificate while the process serves the old one, the pin
  fails, and liveness restarts the container at an arbitrary moment, possibly mid-session. A renewed
  backend certificate needs its Secret, the new pin, `rotationRevision` and a rollout **in one
  release**. Full procedures and certificate requirements (EKU, SANs): `d2/rotation-and-cert-inputs.md`
  under `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/`.
- **The backend trust store must hold only the issuer of the Studio service plane**
  (`studio.runner.tls.trust-store`), never a shared cluster or mesh CA. The client certificate is
  the transport gate of the guided connector (below), so a broad trust store widens who can open it.
  (Architect ruling 4(i) c.)
- **PKCS12.** The backend contract in this release is PKCS12 stores plus password files; the
  chart's `storeType` is `PKCS12`. If the certificates come from cert-manager, the preferred route
  is `Certificate.spec.keystores.pkcs12` with `create: true` and a `passwordSecretRef`: mount the
  password as a **file** from that Secret's key, mount the Secret as a directory without `subPath`
  so rotation propagates, and note that the generated `truststore.p12` holds only that
  Certificate's `ca.crt`, which suffices only if the runner and connector certificates share one
  issuer (otherwise supply a separate trust bundle, for example a trust-manager PKCS12 target). If
  Platform issues PEM only, **convert on the issuer side**, not in the pod: a conversion init
  container would put private-key handling and an `openssl` image into the pod that renders
  untrusted pages. [U] Which cert-manager version and PKCS12 profile Platform runs, and that the
  JDK 21 reads that profile, are not checked. Owner: Platform/SRE.
- **The guided connector.** With guided mode on, the **API** pods open a second, TLS-only port
  (`studioRunner.guided.tlsConnector.port`, default 8443, container port name `guided-tls`) with
  client authentication required, exposed through its own Service
  `<fullname>-api-guided-tls` (the ordinary API Service is byte-identical with guided on or off).
  The backend property is `studio.guided-authoring.connector.port`; a chart that renders any other
  name leaves the API at port 0 and it refuses to start. The backend certificate's SANs must cover
  that Service name. [V] (`tls-client-cert.test.ts`)
- **API ingress NetworkPolicy** (`<fullname>-api-guided-tls-ingress`, rendered **only** while guided
  mode is on and `studioRunner.networkPolicy.enabled` is true): the connector port is open to the
  **runner pods and the worker pods only**, and every other API port keeps today's ingress (all
  sources). The ordinary-port rule is derived from the API's rendered container ports, so a port
  added later without a rule fails the deployment test rather than a cluster. The worker is a
  legitimate caller because the translation coordinator runs there. [V] **Enforcement depends on the
  cluster's CNI (SPK-05 is open) and has not been shown in a cluster [U], owner @devops, G-4 and the
  010 runbook.** The connector also serves more than the guided routes at the network level; the
  backend filters by path as the second half of the same defence.

### 14.3 The one-pod guard (A2.6)

Guided mode runs on **exactly one runner pod**. The worker holds sessions in memory and refuses
calls it does not own, so a second pod could only produce fail-closed refusals, and capacity is the
constant 1. The chart enforces it at render; each of these fails `helm template` naming the key:

- guided on with `studioRunner.replicaCount` other than 1 (**every shipped values file sets 2**, so
  an environment enabling guided mode must also set it to 1);
- guided on with `studioRunner.autoscaling.enabled` true (a ScaledObject would own the count);
- guided on with `studioRunner.shareProcessNamespace` not true (PID-1 b, below);
- guided on with `studioRunner.enabled` false.

[V] each has a positive control and a deleted-guard mutation in `chart.test.ts`. With guided on the
Deployment strategy is `Recreate`, so **a rollout is a short outage**: the old pod drains, then the
new one starts. The journal lives on an `emptyDir`, so **a replaced pod loses it**; the backend
fence is then the only authority, and the session needs a new backend session. Do not raise the
replica count, and do not delete the journal to "resume" a session.

### 14.4 The new Secrets, and what must exist before the release

| Secret (values key) | Pods | Needed |
|---|---|---|
| `studioRunner.tls.secretName` | runner | every deployment with the runner enabled |
| `studioRunner.backendTls.secretName` | API, worker | every deployment with the runner enabled |
| `studioRunner.guided.callbackToken.secretName` | runner (directory mount, file `token`, re-read on every callback) | guided |
| `studioRunner.guided.backendTokens.secretName` | API, worker (files for the runner and translation tokens) | guided |

- **UAT breaks on upgrade unless the first two exist first.** `values-uat.yaml` already enables the
  runner, TLS is mandatory even with guided off, and a missing Secret leaves the pod in
  `ContainerCreating`; the `values-*.yaml` Secret names are per-environment placeholders that do not
  exist yet. In the same release the API and worker runner URL changes from `http` to `https`, and
  runner and callers are not updated atomically, so dispatches during the rollout fail as ambiguous
  and are left to the reapers. Plan the upgrade for a quiet window.
- **The guided token issuer is outside this repository (register U21).** Nothing in the chart or
  code mints the three guided token files (they live at most 300 s and the kubelet can lag behind a
  Secret update). **A guided-enabled shared environment is blocked until Platform/SRE delivers an
  external issuer** that refreshes three audience-scoped files. The chart fails closed: an empty
  token Secret name, issuer, subject or public key fails the render. The token files must be
  directory mounts (a `subPath` mount goes stale).

### 14.5 PID 1, core dumps and the image checks that are still owed

- Guided start requires the runner's PID to be greater than 1 (`canEnumerateLaunchTree`). In the pod
  that holds because `shareProcessNamespace: true` makes the pause container PID 1 (the chart
  refuses to render guided mode without it). In a plain `docker run` **without `--init`** Node is
  PID 1 and a guided start is refused, exit 78, one line `CONFIGURATION_DENIED LAUNCH_TREE`; use
  `docker run --init`. A `NODE_OPTIONS` value is refused with `CONFIGURATION_DENIED DEBUG_ENV`. The
  guard is not relaxed to fit a PID-1 container.
- Core dumps are off on all three workloads: the API and worker `JAVA_OPTS` carry
  `-XX:-HeapDumpOnOutOfMemoryError -XX:-CreateCoredumpOnCrash` in every values file, and the runner
  image's `CMD` runs `ulimit -c 0`. Asserted on rendered output and on the Dockerfile text, not on a
  running container. [V] An override of `JAVA_OPTS` that drops the flags is caught by the deployment
  test, not prevented. Whether the backend image's entrypoint actually consumes `JAVA_OPTS`, and the
  backend's core-file rlimit, are unknown [U] (Platform/SRE).
- **Owed, not run (no Docker authorization this wave):** the image build and `docker image inspect`
  of the `CMD`; the `--init` start and the no-`--init` refusal; `docker stop` showing
  `runner.draining` then `runner.drained` with the new `CMD`; the journal on a read-only root;
  recording scratch on Linux; the TLS mount modes inside the container; the deployed PID in a pod.
  Owner @devops. Procedure: `d2/pid1-launch-paths.md` under the same evidence folder.

### 14.6 Known gaps in this runbook

- **2026-10-20 documentation correction:** §2 now includes the guided connector port in
  `callback-api`, with API and worker ingress matching the chart. This source recheck supplies
  no cluster/CNI enforcement evidence; the G-4/SPK-05 obligations remain.
- The pod's resource sizing for two browsers, the `/tmp` and journal volume sizes, the liveness
  threshold and the guided drain bound (about 63 s of the 215 s grace) are starting values with a
  recorded basis (`d2/resource-basis.md`), **unmeasured** (G-4).
- SIEM routing of the studio audit stream (`studioAuditSiem`, off by default) and the platform-neutral
  alert specification (`d2/r82-alert-spec.md`) are specified, not exercised; the sink and the alert
  rendering are Platform/SRE's.
