# Studio runner — operations runbook (V1)

| Field | Value |
|---|---|
| **Status** | **COMPLETE for V1, and assembled once.** 10.18a drafted the three pod sections; **story 10.18b drafted the edge sections and assembled them here**, as @po's split mandated — a runbook split into two halves is two half-runbooks. All seven subjects AC-24 names are covered: Chromium and the sandbox (§1), egress and approved destinations (§2), evidence expiry (§3), signals/drain/reaping (§4), stuck runs (§5), the kill switch (§6), SSE (§7) and manifest recovery (§8). §§9-11 carry the three open prerequisites this deployment must not be read without |
| **Accountable owner** | **The Checks squad**, as the on-call owner. BRD §4: the Checks squad *"owns Studio execution, recovery, capacity and the runner runbook"*; **Platform/SRE supports** cluster, ingress, egress, sandbox and storage controls. BRD §8 makes this document a **launch exit criterion** |
| **Sections from 10.18a** | §1 Chromium and the sandbox · §2 Egress and approved destinations · §3 Evidence storage and expiry · §4 Signals, drain and reaping |
| **Sections from 10.18b** | §5 Stuck runs (reapers, ledger states, what an operator may and may not do by hand) · §6 The kill switch · §7 SSE · §8 Manifest recovery · §9 Identity (`ED-02`) · §10 CSRF · §11 Configuration that does not reach the process |
| **Written by** | @dev (Dex), story 10.18a · 2026-09-15; assembled by @dev (Dex), story 10.18b · 2026-09-16 |

> ## Read this before anything else: what is still open
>
> This deployment is hardened in the places this story could reach, and five things a reader will
> otherwise assume are **not true today**. They are stated here rather than in a ticket because a
> hardening story that ships without saying them ships a deployment whose readers assume the
> opposite.
>
> 1. **The production authentication bypass code paths still exist — and there are THREE of them.**
>    They are closed by *configuration* in the deployed profile, not removed from the code. Story
>    10.18b closed them; removing them is **`ED-02`**'s, and `ED-02`'s **owner reads `TBD — not
>    assigned in sources`**. One of the three is a client-supplied `X-User-Id` header that is
>    checked **before** the flag `ED-02` names, so closing that flag alone would have closed
>    nothing. **Read §9 before deploying this anywhere.** See `ED-02` in
>    `docs/epics/EPIC-10-EXECUTION.yaml`.
> 2. **The vault is still a stub.** `SecretsService` returns `REDACTED`/plaintext. Also `ED-02`.
> 3. **No credentialed pilot may run until `ED-02` has linked completed tickets.** That is `ED-02`'s
>    own `gate_note`, not this document's opinion. @po has additionally ruled that **story 10.19 may
>    not be drafted while `ED-02`'s owner reads TBD.**
> 4. **Cookie-authenticated mutations have no CSRF control** (§10), and **the chart's
>    `configOverrides` mechanism has never reached a process** (§11). Both are recorded findings
>    with named owners, neither is fixed here, and neither is this story's to fix.
> 5. **Nothing about the streaming route has crossed a real proxy** (§7): not buffering, not the
>    idle timeout, not the cookie route in federated mode, not cross-replica reconnect. `ED-06` /
>    **SPK-02**, OPEN.
>
> The escalation path, because @po could not name an owner and said so: **@pm** raises `ED-02` to
> Checks-squad engineering management through BRD §8's launch-exit/on-call row, with **Security &
> Compliance** (BRD §11) as the accepting party.

---

## 1. Chromium and the sandbox

*Implements architecture §9.3 ("Run non-root … no privileged mode, restricted service-account
access, CPU/memory limits, writable per-run scratch and `/dev/shm`"; "Prove sandbox startup in
staging; do not disable it silently to make the image run") and ADR-001 §8.*

**What the deployment guarantees.** The runner pod runs as a non-root user with
`allowPrivilegeEscalation: false`, all capabilities dropped, `readOnlyRootFilesystem: true`, a
single-keyed `seccompProfile`, and exactly two writable mounts: an `emptyDir` covering the per-run
scratch directory and an in-memory `/dev/shm`. There is **no chart path that renders a
sandbox-disabling flag** and **no values key that can set `PLAYWRIGHT_BROWSERS_PATH` or `HOME`** —
the runner's environment is enumerated, and a values file naming a key outside the list fails the
render rather than being silently dropped.

**An operator may:**

- change the pod's CPU/memory requests and limits, the `/dev/shm` size and the scratch size limit;
- change any `studioRunner.runnerEnv` key **that is already on the enumerated list**;
- change the image tag to another build of the internal image.

**An operator may NOT, and the render will refuse:**

- add `PLAYWRIGHT_BROWSERS_PATH`, `HOME`, or any other environment key the runner does not accept;
- set `seccompProfile.type` to `Unconfined`, or omit it and let it inherit the backend's;
- override the container's `command` or `args`. The image's `CMD` is the bare exec form for a
  reason (§4 below).

**Why `readOnlyRootFilesystem` is a browser-integrity control and not tidiness.** @qa's SEC-2 attack
builds a shim browser registry — every real file symlinked except `chrome-headless-shell`, which is
replaced by a script that execs the real binary with a sandbox-disabling flag — and points the
browser search path at it. **It works.** Re-run against this image in a writable container it
succeeds at both `/ms-playwright` (which is world-writable in the base image) and `/home/pwuser`,
and the renderer process comes up at `Seccomp=0` where a direct launch has it at `Seccomp=2`. With
the root filesystem read-only and every writable mount disjoint from the browser path and from
`$HOME`, both writes are refused with `Read-only file system`.

**The residual, named:** an adversary who can edit the pod spec still wins, and **nothing reads the
running browser's identity**. A runtime version check was considered and declined by @po: a shim
that can re-exec without the sandbox can also report the correct pinned version, so the check
catches the careless attack and misses the careful one. If you are investigating a suspected
browser-integrity incident, the pod spec and the image digest are the evidence; the runner's
self-reported versions are not.

**Still open (`ED-05` / SPK-04).** That the sandbox actually *starts* under the cluster's
PodSecurity level, on nodes with unprivileged user namespaces, under the selected seccomp profile,
has **not** been proven — it cannot be proven outside a cluster. If it does not, the answer is a
Platform-approved `Localhost` profile. **There is no fallback that disables the sandbox.**

---

## 2. Egress and approved destinations

*Implements architecture §9.3 ("Permit runner access to the callback API, Sonic, approved targets,
and controlled DNS only") and ADR-001 §9.*

**What the deployment renders.** A `NetworkPolicy` selecting the runner pods, naming **both**
`Ingress` and `Egress` policy types — which is what makes it default-deny — with:

| Direction | Peer | Why |
|---|---|---|
| Ingress | the **worker** pods only, on the runner's Service port | §8.4: the internal routes are not public and the MFE never talks to the runner. Dispatch runs on the worker profile, not the API's |
| Egress | the **API** pods, on the API Service port | `callback-api`: admission and progress. Without this the terminal report never arrives |
| Egress | the object store, port from a values key, with metadata/link-local/private ranges excepted | `object-store` |
| Egress | the approved targets, **currently empty** | `target-page` — see below |
| Egress | `kube-dns` | Not a destination class. Without it every destination becomes a **silent hang** instead of a refusal |

The three permitted classes are the runner's own `PERMITTED_DESTINATIONS`, and the test compares
them against that production constant rather than against a list written in a test — so a fourth
class cannot appear on one side alone.

**The approved-target list is empty, deliberately.** `ED-04` / SPK-05 has not ruled. An empty list
is default-deny for `target-page`, which is the correct failing direction: a run against an
unapproved host fails rather than succeeding quietly.

**If a staging run hangs rather than failing**, check DNS first and the callback rule second. The
architecture calls this out by name: an egress policy written without the callback and object-store
destinations turns the first staging run into a silent hang — admission succeeds, the browser
starts, and the terminal report never arrives. The reapers will eventually reconcile the run, which
makes it look like a runner defect rather than a network one.

**The limit Security must accept explicitly (§9.3).** *"Standard Kubernetes NetworkPolicy operates
at network layers, not URL paths."* If SPK-05 finds that only static L3/L4 policy is available,
**per-run destination checks in the runner become the primary control** and that limitation needs
an explicit acceptance from Security. It is not accepted today.

**Audit trail, ADR-002 O-6.** The **dispatch policy identity** story 10.7 records on the execution
is what joins *a run* to *the policy it ran under*. Whichever way SPK-05 rules, that is the field to
read when asked "what was this run allowed to reach?". **No approved-target or secret-use policy
field exists on the job envelope**, and adding one is ADR-002 **Class B** — @architect's ruling
first, a story implements after. A story that adds it without the ruling is the thing the runner's
gate-shut tripwire exists to catch.

---

## 3. Evidence storage and expiry

*Implements architecture §6.2.*

**Two principals, never one.** The runner reads its object-store credentials from a **different**
Kubernetes Secret from the one the API and the recovery path use. The runner's principal is
**write-only under the `studio/` prefix and holds no Get or List permission**; the API's is
read-only. The two Secret names are asserted unequal in the rendered manifest. If you ever find
yourself pointing both at one Secret to make something work, that is the scope being deleted, not a
configuration shortcut.

**Expiry is logical.** The API enforces it at `videoExpiresAt` from
`studio.execution.evidence-retention`, and the object store's lifecycle window renders from the
**same values key**. Physical deletion on the store is asynchronous.

> **This runbook makes no claim of exact-time physical deletion, and neither should anything else.**
> Whether lifecycle expiry is prompt, whether noncurrent versions and delete markers are collected,
> whether incomplete multipart uploads are aborted and after how long, and whether a `GET` on an
> expired object fails or still serves are all **unverified** — they are SPK-03's to measure
> against real Sonic (`ED-03`). If asked "is the video gone after 30 days", the true answer today
> is: *the API stops serving it at 30 days; when the bytes are removed has not been measured.*

**Still open (`ED-03` / SPK-03).** The runner writes to a filesystem-backed compatible store today.
The real Sonic client swap is **story 10.19's** (@po's ruling on this story's open question 3); the
denial tests that prove the scopes are real — runner `GET`/`LIST` denied, API `PUT` denied — are
SPK-03's and have not been run.

---

## 4. Signals, drain and reaping — the two properties that must not be cut apart

*Implements architecture §9.3 and ADR-001 §1.1. Expanded in 10.18b's stuck-runs section.*

**The image's `CMD` is the bare exec form on purpose.** `SIGTERM` must reach the Node process
directly so the drain runs: readiness goes false, in-flight work finishes, the scratch is cleared.
Substituting a shell form makes PID 1 a shell that never forwards the signal — measured against
this image, `docker stop` then waits out its **entire** grace period and is SIGKILLed, and neither
`runner.draining` nor `runner.drained` is ever emitted. **Do not add an `ENTRYPOINT` wrapper and do
not override `command`/`args` in the chart.**

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

**Check this first, before anything else, and before suspecting egress.** A worker deployed with
`STUDIO_DISPATCHER_ENABLED=false` **queues work and dispatches nothing**, and the symptom is
identical to a blocked egress path: executions accept with `202`, sit in `QUEUED`, and no browser
ever starts. The chart renders the value explicitly on every component
(`studioExecution.dispatcherEnabled`, worker only) so that `kubectl get deploy -o yaml` answers the
question in one command. Two defaults inside the application disagree about it —
`application.yml` says `false`, `StudioExecutionProperties.Dispatcher.enabledOrDefault()` says
`true` for an absent value — which is why the chart states it rather than inheriting it. **Recorded
as a finding, owner @architect** (`StudioKillSwitchWiringTest`).

**The ledger states, and what each one means.**

| State | Meaning | Who moves it |
|---|---|---|
| `QUEUED` | Accepted, not yet claimed by a dispatcher | the dispatcher, or the kill switch's closure pass |
| `CLAIMED` | A dispatcher holds a lease and is calling the runner | the same dispatcher, or the lease reaper when the lease expires |
| `DISPATCHED` | The runner admitted the run | the runner's terminal report, or a deadline reaper |
| terminal | Reported, or closed with an error code | nothing |

**An operator may:**

- read anything: `GET /api/v1/studio/executions/{id}` is the recovery path and is unaffected by the
  kill switch, by a dropped SSE stream, or by a draining runner;
- engage the kill switch (§6) to stop new work and close what is queued;
- restart the worker. Leases expire and are re-claimed; an in-flight admitted run finishes on the
  runner and its terminal report is still accepted, because the report is authorized by the
  execution's own identity and not by the dispatcher that sent it.

**An operator may NOT, and this is the part that does damage:**

- **edit `studio_dispatch_ledger` rows by hand.** State transitions are guarded by conditional
  `UPDATE`s that carry attempt and revision numbers; a hand-written state moves a row past a guard
  that exists to make duplicate and late reports harmless, and the next legitimate report is then
  applied to a row that has already moved on;
- **delete a `QUEUED` row to "unstick" it.** Use the kill switch, which closes it *explicitly* with
  `DISPATCH_DISABLED` and leaves an auditable reason;
- **re-dispatch by re-POSTing with the same idempotency key** expecting a new run. The key resolves
  to the existing execution by design.

**Closing the tab does nothing.** See §7.

## 6. The kill switch

*Implements architecture §8.5 and BRD §9 ("a kill switch rejects new executions and closes queued
undispatched work explicitly. Already-admitted runs finish/report; reads and recovery remain
available"). Story 10.18b, AC-23a.*

**What it is:** `studioExecution.enabled` in the chart → `STUDIO_EXECUTION_ENABLED` →
`studio.execution.enabled`. Rendered explicitly on the API and the worker.

**What happens when you engage it**, observed on the production path in both directions
(`StudioKillSwitchWiringTest`):

- **new executions are refused** with `503 DISPATCH_DISABLED`, and the refusal happens *before* the
  test is even looked up — no readiness evaluation, no quota accounting, no revision read;
- **queued undispatched work is closed explicitly**, not left to a deadline: the dispatcher's next
  pass selects `QUEUED` and `CLAIMED` rows and closes them with `DISPATCH_DISABLED`. The closure is
  idempotent and bumps no second revision;
- **already-admitted runs finish and report.** Their callbacks are still accepted and applied;
- **reads and recovery stay up.** `GET /api/v1/studio/executions/{id}` is unaffected.

**The kill switch and the dispatcher are two separate keys on purpose.** Turning the dispatcher off
*as well* would leave the queued work the kill switch promised to close sitting in the ledger until
its deadline — the opposite of what the switch promises. The chart asserts that moving one does not
move the other.

**The switch defaults to ON.** A kill switch that defaulted to off would make a configuration
mistake indistinguishable from an engaged kill switch, and an operator needs to be able to tell an
outage from a decision.

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
>   Production runs three API replicas scaling to six, and the design answers this by reading
>   committed state. **No session affinity or sticky-session setting may be introduced to make it
>   work** — that would trade a design property for a deployment workaround.
>
> Until SPK-02 is closed with HAR captures from a real browser on the staging hosts, treat streaming
> as unproven and the GET recovery path as the thing that works.

**No credential ever goes in the URL.** `EventSource` cannot attach a header, and the tempting fix
is a token query parameter. URLs reach proxy logs, browser history and referrer headers. The route
takes none, and the chart asserts none is rendered anywhere.

## 8. Manifest recovery

*Implements architecture §6.2 and §5.4. Story 10.18b.*

The runner writes evidence to the private store under a fixed prefix and then reports the manifest
key in its terminal report. If the terminal report is lost but the upload succeeded, the recovery
path reads the manifest at the known key rather than re-running the test.

**An operator may:** read the manifest and the video through the API, and re-read after a failed
first attempt — a `GET` on a key immediately after a `PUT` is the consistency case SPK-03 must
confirm on the real store.

**An operator may NOT:** write into the runner's prefix, or hand the runner a read credential. The
runner's store principal is **write-only** under `studio/` and holds no `Get` or `List`; the API
reads with a **different** Secret. The two Secret names are asserted unequal in the rendered
manifest. If you find yourself needing the runner to read something back, the design has changed and
§6.2 needs re-reading first.

**Expiry is logical.** The API stamps `videoExpiresAt` from the one configured retention window, and
the store's lifecycle rule is declared from the same key. **Nothing here claims exact-time physical
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

**All three default to `false`** and the chart renders all three explicitly as `false` in every one
of its four value sets, so the deployed profile can be audited from the manifest rather than from a
default somebody may change.

**What is still open, and it is not small:**

1. **The code paths survive.** Removing them is `ED-02`'s, not this story's: deleting the
   Core-service bypass moves identity resolution onto `CoreServiceClient`, and the filter's own
   comment records why that is unavailable — *"while the target platform does not provide Core
   services."*
2. **The vault is still a stub.** `SecretsService` returns `REDACTED`/plaintext and secret-use
   authorization runs against a fake provider. Also `ED-02`.
3. **`ED-02`'s owner reads `TBD — not assigned in sources`.** @po could not name one and said so.
   The escalation path: **@pm** raises it to Checks-squad engineering management through BRD §8's
   launch-exit/on-call row, with **Security & Compliance** (BRD §11) as the accepting party.
4. **No credentialed pilot may run until `ED-02` has linked completed tickets.** That is `ED-02`'s
   own `gate_note`, not this document's opinion. @po has additionally ruled that **story 10.19 may
   not be drafted while `ED-02`'s owner reads TBD**.

**An operator may NOT** set any of the three to `true` in a staging or production values file
without Security's explicit acceptance. Each one hands an unauthenticated caller an administrator.

**A separate, profile-scoped bypass also exists and is not one of the three.**
`LocalDevAuthFilter` injects a fixed developer identity, is annotated `@Profile("local")` and is
governed by `checks.local-dev-auth.enabled`. It cannot load in any deployed profile — the chart
renders `api,dev` / `api,staging` / `api,prod` — and it is named here so that a reader counting
bypasses finds four accounted for rather than three and a surprise.

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

## 11. Configuration that does not reach the process — an open escalation

*Story 10.18b, AC-18.*

**`configOverrides` has been inert since the chart was written.** `templates/configmap.yaml`
renders each `configOverrides` entry as a ConfigMap **key**, and the containers consume the
ConfigMap through `envFrom: configMapRef`. Kubernetes skips any key that is not a valid environment
variable name and reports it as an `InvalidVariableNames` event on the pod — the pod starts, and the
setting never arrives. Every dotted key in `configOverrides` is a setting somebody believed they had
applied.

**Fifteen keys per value set, thirteen distinct**, across the API and worker ConfigMaps:
`spring.datasource.hikari.maximum-pool-size`, `checks.scheduling.{batch-size,
min-interval-seconds, poll-interval-ms, shutdown-timeout-sec}`, `checks.executor.max-concurrency`,
and `checks.executor.source-limits.{HTTP, TCP, SPLUNK, GRAFANA, ITRS, APPDYNAMICS, UI_TEST}`.

**The check is left RED, deliberately** (`studio-runner/test/deployment/envfrom-keys.test.ts`).
Allowlisting the existing keys would produce a guard that cannot fail; converting them changes
deployment behaviour in database and scheduler subsystems that a Studio story does not own and whose
owners have not reviewed the change.

**OWNER: @devops (Gage)** carries it to resolution. **MECHANISM: @architect (Aria)** — env-name
conversion, a mounted application config file, or `SPRING_APPLICATION_JSON` is a
configuration-architecture choice, not a rename.

**No key story 10.18b added is affected**: `STUDIO_SSE_*`, `CHECKS_BYPASS_*`,
`STUDIO_EXECUTION_ENABLED`, `STUDIO_DISPATCHER_ENABLED` and every `STUDIO_RUNNER_*` key render as
container `env` entries with conforming names, and that is asserted separately so this escalation
cannot be read as covering for them.
