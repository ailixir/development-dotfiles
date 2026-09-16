# Studio runner — operations runbook (V1)

| Field | Value |
|---|---|
| **Status** | **PARTIAL — 10.18a's half only.** Three of the seven sections AC-24 requires are drafted here because they belong to the pod half of the story. **Story 10.18b drafts the remaining four and assembles them into one document.** A runbook split into two halves is two half-runbooks; this file is not the deliverable, it is the pod half of it |
| **Accountable owner** | **The Checks squad**, as the on-call owner. BRD §4: the Checks squad *"owns Studio execution, recovery, capacity and the runner runbook"*; **Platform/SRE supports** cluster, ingress, egress, sandbox and storage controls. BRD §8 makes this document a **launch exit criterion** |
| **Sections here (10.18a)** | Chromium and the sandbox · Egress and approved destinations · Evidence storage and expiry |
| **Sections in 10.18b** | Stuck runs (reapers, ledger states, what an operator may and may not do by hand) · SSE · Manifest recovery · The kill switch |
| **Written by** | @dev (Dex), story 10.18a · 2026-09-15 |

> ## Read this before anything else: what is still open
>
> This deployment is hardened in the places this story could reach, and three things a reader will
> otherwise assume are **not true today**. They are stated here rather than in a ticket because a
> hardening story that ships without saying them ships a deployment whose readers assume the
> opposite.
>
> 1. **The production authentication bypass code path still exists.** It is closed by
>    *configuration* in the deployed profile, not removed from the code. Closing it is story
>    **10.18b**'s; removing it is **`ED-02`**'s, and `ED-02`'s **owner reads `TBD — not assigned in
>    sources`**. See `ED-02` in `docs/epics/EPIC-10-EXECUTION.yaml`.
> 2. **The vault is still a stub.** `SecretsService` returns `REDACTED`/plaintext. Also `ED-02`.
> 3. **No credentialed pilot may run until `ED-02` has linked completed tickets.** That is `ED-02`'s
>    own `gate_note`, not this document's opinion. @po has additionally ruled that **story 10.19 may
>    not be drafted while `ED-02`'s owner reads TBD.**
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
