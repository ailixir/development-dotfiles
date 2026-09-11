# Checks UI Studio — staging spikes (facts the architecture cannot establish locally)

**Date:** 2026-09-10 · **Owner of this register:** @architect (Aria) · **Status:** all six spikes OPEN

[Studio architecture v2.1 §10](studio-execution.md#10-delivery-and-validation) lists facts that must be verified in staging before acceptance. This register turns each into a spike with a specific question, the evidence that closes it, an accountable owner, the stories it gates, and the design decisions it shapes earlier. The spikes map to the external dependencies `ED-01`…`ED-06` in [EPIC-10](../epics/EPIC-10-EXECUTION.yaml). Quoted story acceptance text comes from the retired Epic 10 markdown at commit 9425e7e7d and carries into the drafted stories.

**Timing rule.** All six start now and run in parallel. Each gates the *staging acceptance* of the listed stories, not their development: stub/fixture paths exist for every one. Two spikes should close before their shaping story is drafted to avoid building twice (SPK-01 → 10.5, SPK-02 → 10.11); if they are still open, the story builds behind the abstraction noted under *Shapes* and the second path is deferred.

**Closure rule.** A spike is closed when its evidence record is committed under `docs/qa/spikes/SPK-0N/` (files named in each *Evidence* section), the owner has signed the record, the result is summarized in the *Result* line below, and the matching `ED-0N` entry in EPIC-10 is updated. A negative result is a valid closure: it selects the documented fallback and may change story acceptance, but never silently weakens an architecture guarantee.

## Summary

| ID | Spike | Gates (staging acceptance) | Shapes earlier | Accountable owner | Executes | Status |
|---|---|---|---|---|---|---|
| SPK-01 | LLM gateway: structured output + temperature control through R2D2 via the Vertex SDK | 10.5, 10.8, 10.19 | 10.5 client design | Architecture (BRD §8 risk owner) with R2D2 gateway owners | Backend dev (Checks squad) | OPEN |
| SPK-02 | Authenticated SSE and media delivery through the real ingress | 10.18, 10.19 | 10.11 transport client; 10.15 media route assumption | Platform/SRE (ingress) | Backend dev + frontend dev (Checks squad); @qa records | OPEN |
| SPK-03 | Sonic manifest/lifecycle/versioning and incomplete-upload semantics | 10.14, 10.15, 10.18, 10.19 | 10.14 expiry/versioning handling; API logical expiry | Platform/SRE (storage) with Sonic owners | Runner dev (Checks squad) | OPEN |
| SPK-04 | Chromium sandbox compatibility in-cluster | 10.18, 10.19 | 10.18 `securityContext`/seccomp values; ADR-001 §9 | Platform/SRE (cluster policy) | Runner dev + @devops | OPEN |
| SPK-05 | Destination/DNS egress enforcement mechanism | 10.18, 10.19 | 10.17 destination-policy representation; 10.18 NetworkPolicy | Platform/SRE (network) with Security & Compliance | @devops + runner dev | OPEN |
| SPK-06 | Measured video step-seek accuracy vs the 500 ms target | 10.16 (release claim), 10.19 | 10.12 timing-origin calibration method | @architect | Runner dev (phase A), @qa (phase B) | OPEN |

Owner names are roles from the BRD stakeholder table; the specific R2D2, Sonic and ingress teams are not named in any source and must be identified when the dependency tickets are opened.

---

## SPK-01 — LLM gateway capability (R2D2 via Vertex AI SDK)

**Why it cannot be established locally.** §4.1: R2D2 is a proxy in front of Vertex-hosted models and "remains the authority on which models, parameters and quotas are actually reachable." Structured output and temperature zero "reduce variance but do not guarantee reproducibility."

**Questions.**

1. Which Vertex AI SDK version, credential type and endpoint/project/location configuration successfully authenticates to R2D2 from the backend's runtime (Java 21 / Spring Boot 3.3.5)?
2. Which model identifiers are reachable for the Studio compile workload, and what are their token/byte limits and quotas?
3. Does structured output (JSON response schema / JSON MIME type) pass through the proxy unchanged, or is it stripped, rejected, or altered?
4. Is `temperature: 0` honored end-to-end? How much variance do two identical compile requests show?
5. Can SDK-level automatic retries be disabled so the bounded compile attempts of §4.3 (two repairs maximum) are not exceeded?
6. What does the gateway log? §4.3 forbids dumping request bodies into gateway audit logs; the proxy's own logging policy must be known.
7. Timeout behavior: what does a slow or failed model call look like from the SDK (error type, latency to failure)?

**Evidence that closes it.** `docs/qa/spikes/SPK-01/`: a call matrix (model × structured-output on/off × temperature) with raw request metadata (no prompt bodies) and observed response shapes; two identical requests per cell with a diff; a recorded timeout case; the SDK version and configuration used; a written statement from the gateway owners on models, quotas, retry policy and log contents; the credentials-issuance ticket reference.

**Gates.** 10.5 acceptance "Gateway capabilities and access dependency are recorded before pilot use"; the real compile path in 10.8; 10.19.

**Shapes.** 10.5/10.8 must not *depend* on structured output: parse defensively and treat the 10.2 validator as the only correctness gate regardless of what the proxy returns. If retries cannot be disabled at SDK level, 10.5 wraps the client with its own attempt budget.

**Fallback if negative.** Free-text response parsing with the same validator; no change to the confirmation contract. Loss of a reachable model or credentials blocks pilot use of compilation, not authoring (§4.7 drafts persist).

**Result.** OPEN.

## SPK-02 — Authenticated SSE and media delivery through the real ingress

**Why it cannot be established locally.** §5.5/§6.3: native `EventSource` and `<video>` cannot attach a bearer header; an ambient authenticated session route is required; buffering and idle timeouts through the actual gateway/ingress are unknown; the [SSE assessment](studio-sse-viability.md) requires a streaming spike before committing to its estimate. The Helm values deploy the MFE and API on **different hosts**, so the "same-origin" assumption is not what the chart currently does, and in federated mode the MFE runs inside the PUT platform shell origin.

**Questions.**

1. Which route carries the session cookie to `GET /api/v1/studio/executions/{id}/events` and `/video` from the browser: same-origin gateway path, or cross-origin with `withCredentials` plus exact-origin credentialed CORS? Does this hold in both standalone and federated (shell-hosted) modes?
2. Does a bearer-only requirement exist anywhere on the path? If so, SSE needs the header-capable client inside the centralized API service (§5.5), and `<video>` needs an ambient session regardless.
3. Do two timed `execution.snapshot` events reach the browser separately before response closure through every proxy layer (no buffering)?
4. Does a 15 s heartbeat keep an idle stream open across the ingress and any platform proxy idle timeout? What is the effective maximum stream lifetime versus the intended 60 s bounded lifetime?
5. Does reconnect with `Last-Event-ID` to a **different** API replica restore the current snapshot?
6. Are 401/403 for absent identity, forged identity headers, wrong CSI and revoked access returned *through the ingress* for both SSE and video, without falling back to a bypass?
7. Do `<video>` Range requests (206, valid `Content-Range`, 416) and `?download=true` attachment work through the ingress with the ambient session? Is CSRF protection for cookie-authenticated mutations defined (§9.1)?

**Evidence that closes it.** `docs/qa/spikes/SPK-02/`: HAR captures from a real browser on the staging hosts for cases 3–7; ingress/proxy configuration excerpts (buffering, idle timeout) with the annotations actually applied; a written statement of the platform's browser-auth route (cookie vs bearer) covering federated mode; the CORS configuration if cross-origin.

**Gates.** 10.18 acceptance (timed SSE events through actual ingress, heartbeat idle, cross-replica reconnect, real auth and Range through ingress); 10.19.

**Shapes.** 10.11 chooses native `EventSource` versus a header-capable client; if the spike is still open when 10.11 is drafted, 10.11 builds the transport abstraction plus `EventSource` and the GET fallback, and defers the header client. 10.15 assumes an ambient session route (§6.3) and must not add token query parameters.

**Fallback if negative.** Bounded GET snapshot polling through the normal authorized client without changing the execution contract (§5.5). If no ambient session exists for media, presigned redirects are post-V1 and playback becomes a GA blocker to raise with Platform.

**Result.** OPEN.

## SPK-03 — Sonic manifest, lifecycle, versioning and incomplete-upload semantics

**Why it cannot be established locally.** §6.2: "verify versioning/noncurrent-object and incomplete-upload cleanup semantics on Sonic"; "do not claim exact-time physical deletion before Sonic behavior is verified."

**Questions.**

1. Which S3-compatible surface is available: path-style addressing, multipart upload, `HEAD`/`GET` with `Range`, server-side encryption defaults, and consistency of a `GET` on a key immediately after `PUT` (the recovery path reads a manifest at a known key right after it is written).
2. Can credentials be scoped as the architecture requires: runner **write-only** to `studio/{csiId}/{testId}/{executionId}/` with no Get/List; API/worker **read-only**?
3. Is bucket versioning on? If so, do lifecycle rules expire noncurrent versions and delete markers, or does a "deleted" video persist as a noncurrent version beyond 30 days?
4. Does a lifecycle rule abort incomplete multipart uploads, and after how long? What happens to a partially uploaded webm when the runner dies mid-upload?
5. What is the observed lag between the lifecycle expiry time and physical deletion, and does a `GET` on an expired object fail or still serve?
6. Object size limits and multipart thresholds relative to expected webm sizes at the configured recording resolution.

**Evidence that closes it.** `docs/qa/spikes/SPK-03/`: bucket configuration export (versioning, lifecycle rules, encryption); the two IAM/policy documents with a recorded denial test (runner `GET`/`LIST` denied, API `PUT` denied); a 1-day test-prefix lifecycle experiment with timestamps of expiry versus observed deletion, including a noncurrent-version case if versioning is on and an aborted multipart case; a Range `GET` transcript; the credentials-issuance ticket reference.

**Gates.** 10.14 real-Sonic acceptance and lifecycle configuration; 10.15 streaming from Sonic; 10.18 "private storage credential scopes and logical/physical expiry configuration are verified, with Sonic lifecycle caveats recorded"; 10.19.

**Shapes.** 10.14 handling of versioning (whether deletes must also remove versions) and multipart cleanup; the API enforces logical expiry at `videoExpiresAt` regardless of physical deletion (§6.2), so a long deletion lag is acceptable but must be documented for Security.

**Fallback if negative.** If write-only scoping is impossible, the runner keeps its own prefix-scoped principal and the API/worker principal is read-only; the gap is recorded for Security acceptance. If lifecycle rules cannot be trusted, a worker-side deletion job becomes a V1 addition (raise to @architect; not assumed).

**Result.** OPEN.

## SPK-04 — Chromium sandbox compatibility in-cluster

**Why it cannot be established locally.** §9.3: "Prove sandbox startup in staging; do not disable it silently to make the image run." The chart's existing pods use `runAsNonRoot`, `readOnlyRootFilesystem: true`, `seccompProfile: RuntimeDefault` and drop all capabilities; the official Playwright image runs as root, which disables the sandbox.

**Questions.**

1. Does Chromium launch with `chromiumSandbox: true` (Playwright launch option; the default is `false`, which adds `--no-sandbox`) as a non-root user under the cluster's PodSecurity level?
2. Are unprivileged user namespaces available on the nodes (kernel and runtime settings)? The Chromium layer-1 sandbox relies on them when the setuid helper is unavailable to a non-root user.
3. Does `seccompProfile: RuntimeDefault` permit the namespace-creating `clone`/`unshare` calls the sandbox needs? The container runtime's default profile is expected to block them without `CAP_SYS_ADMIN`; if so, is a Platform-approved `Localhost` profile permitted, and who owns it?
4. Do `readOnlyRootFilesystem: true` plus `emptyDir` scratch and `emptyDir{medium: Memory}` `/dev/shm` satisfy Chromium (shared memory size, cache/home directories)?
5. Does the internal image (`ED-05`) run as a non-root user with the enterprise CA bundle and process reaping (init) in place?
6. Under the chosen policy, does a hung child process get killed by the parent and does the pod recover its slot (10.13 behavior in the real environment)?

**Evidence that closes it.** `docs/qa/spikes/SPK-04/`: the exact pod spec used (security context, seccomp, volumes, resources); Chromium launch logs showing the sandbox active (no `--no-sandbox`, sandbox status reported by the browser); node/runtime settings for user namespaces; the seccomp profile file if `Localhost` is required and the Platform approval reference; a recorded run of the controlled fixture producing a readable webm from that pod; the kill-tree test transcript.

**Gates.** 10.18 acceptance "Sandbox is active"; 10.19.

**Shapes.** ADR-001 §9 leaves `seccompProfile` to this spike; 10.18 values and the runbook's Chromium section.

**Fallback if negative.** A custom seccomp profile approved by Platform. There is no fallback that disables the sandbox: if neither `RuntimeDefault` nor an approved profile works, 10.18 is blocked and the issue escalates to Platform/SRE and Security.

**Result.** OPEN.

## SPK-05 — Destination and DNS egress enforcement mechanism

**Why it cannot be established locally.** §9.3: standard Kubernetes NetworkPolicy operates at network layers, not URL paths; "Platform must identify the supported network/proxy mechanism for required domain controls and DNS behavior." Browser routing checks complement but cannot replace network isolation.

**Questions.**

1. Which mechanism does the platform support for per-destination control of browser traffic: FQDN-aware CNI policy, an egress HTTP(S) proxy with an allowlist (Playwright supports a per-launch proxy), DNS filtering, or a combination? Which of these can vary **per run** (approved origins differ per CSI/environment)?
2. How is DNS resolved from runner pods, and can resolution of unapproved names be blocked or made irrelevant by connection-level enforcement?
3. Are redirects, subresources and authentication-provider hops to approved hosts allowed while a redirect to an unapproved host is blocked? Does the mechanism see HTTPS destinations (SNI/CONNECT) without TLS interception?
4. Are cloud/cluster metadata and control endpoints, link-local ranges, cluster-internal services other than the API callback and Sonic, and local files unreachable from the browser?
5. Are the runner's own required destinations reachable: API callback route, Sonic, the approved pilot application and its auth provider?
6. Does an internal application require the enterprise CA in the browser trust store?

**Evidence that closes it.** `docs/qa/spikes/SPK-05/`: Platform's written statement of the supported mechanism and its per-run capability; a demonstration from a runner pod with the policy applied: approved host reachable, unapproved host blocked, redirect to unapproved host blocked, metadata endpoint blocked, DNS behavior for an unapproved name, callback and Sonic reachable; the policy or proxy configuration used; Security's note on residual gaps.

**Gates.** 10.18 acceptance "unapproved destinations/control endpoints cannot be reached, including tested redirects"; 10.19.

**Shapes.** 10.17's destination-policy representation must match what can be enforced (origin allowlist per CSI/environment versus static cluster policy); 10.18's NetworkPolicy/proxy template. If only static L3/L4 policy exists, per-run destination checks in the runner become the primary control and Security must accept that limitation explicitly.

**Fallback if negative.** Static NetworkPolicy to a fixed set of pilot destinations plus runner-side origin checks on every request, recorded as a disclosed limitation for GA sign-off (BRD §11).

**Result.** OPEN.

## SPK-06 — Measured video step-seek accuracy vs the 500 ms target

**Why it cannot be established locally.** §6.4: seek within 500 ms of the visible step start on the controlled fixture is a V1 target that must be validated in staging before it is claimed for real applications; the runner clock origin must be calibrated against the pinned recorder's first frames.

**Phase A (developer machine, before 10.12 is built).** Throwaway measurement, not production code: with the pinned Playwright version, record a controlled fixture page that displays a monotonic timestamp, log step start times from a monotonic clock, and compare against the frame at which each step's visible effect appears in the webm.

**Phase B (staging, after 10.12/10.16).** Same measurement through the real pipeline: dispatch → runner → Sonic → API `/video` → MFE seek, on the controlled fixture, including initial navigation and an assertion-failure case.

**Questions.**

1. What is the offset between recording start and the first encoded frame with the pinned recorder, and is it stable across runs and resolutions?
2. Using `offsetMs` per §6.4 (start on the recording timeline, monotonic clock, calibrated origin), is the seek error within 500 ms for every attempted step on the fixture, including step 0 (navigation) and the failing step?
3. Does the chosen recording resolution keep evidence text readable while staying within upload size expectations (SPK-03 question 6)?
4. Does a wait/assertion step seek to its start rather than to the instant its condition became true (§6.4)?

**Evidence that closes it.** `docs/qa/spikes/SPK-06/`: phase A table (run × step: logged start, observed frame time, error) with the recorder version and calibration method chosen; phase B table from staging through the MFE with the same columns; the fixture page source; a note on resolution/size.

**Gates.** 10.16 acceptance "staging validates the target before release claims"; 10.19 "seek target … evidence recorded". Phase A gates nothing but should precede 10.12 drafting.

**Shapes.** 10.12's timing-origin calibration method (how the origin is anchored to the recorder's first frames) and the recording resolution default.

**Fallback if negative.** Report the measured tolerance instead of 500 ms in the UI and BRD, and record the calibration limit; the step-seek feature remains, with the honest tolerance disclosed. No synthetic index-based mapping is reintroduced.

**Result.** OPEN.
