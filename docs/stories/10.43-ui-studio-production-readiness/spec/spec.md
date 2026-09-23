# Spec: UI Studio end-to-end production readiness

> **Story ID:** 10.43-ui-studio-production-readiness  
> **Complexity:** COMPLEX  
> **Generated:** 2026-09-21  
> **Status:** Blocked at external production-acceptance gate

## 1. Overview

Production readiness covers one traceable chain: saved authoring input → R2D2/Vertex proposal → bounded validation and immutable candidate → exact confirmation → durable dispatch → isolated Playwright execution → terminal result and native recording → manifest/video storage → authorized SSE, playback, seek and download. The chain is ready only when both repository gates and the named real-infrastructure gates pass. [FR-1–FR-8, NFR-1–NFR-4, CON-3]

### 1.1 Goals

- Prove that reviewed source is the exact immutable source executed. [FR-1, FR-2, FR-7]
- Prove isolated execution, cancellation, recovery and honest evidence behavior. [FR-3–FR-6]
- Make deployment configuration effective and fail closed. [FR-8, NFR-1]
- Produce a production verdict based on real platform evidence. [CON-3, ASM-1–ASM-3]

### 1.2 Non-goals

- Replacing R2D2, Core, Sonic or the platform ingress with repository-local services. [CON-3]
- Treating deterministic fixtures as proof of model semantic quality or enterprise service behavior. [CON-3, NFR-1]
- Adding runtime LLM calls or arbitrary JavaScript execution. [CON-1, CON-2]

## 2. Requirements summary

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Compile through approved R2D2/Vertex into a bounded artifact without secret exposure. | P0 |
| FR-2 | Review and confirm the exact immutable revision/hash. | P0 |
| FR-3 | Durable dispatch, cancellation and recovery without ambiguous replay. | P0 |
| FR-4 | Closed-language execution in pinned isolated Chromium, with no runtime LLM. | P0 |
| FR-5 | Native video and redacted manifest with independent evidence outcome. | P0 |
| FR-6 | Authorized SSE/GET progress and protected seek/range/download evidence. | P0 |
| FR-7 | Code view renders the confirmed artifact/hash. | P0 |
| FR-8 | Deployment settings reach processes or rendering fails. | P0 |

| ID | Category | Measurable requirement |
|---|---|---|
| NFR-1 | Security | Real identity/vault/canary/ingress acceptance with zero secret leakage. |
| NFR-2 | Reliability | Restart, duplicate, delayed-manifest and reaper staging cases pass. |
| NFR-3 | Performance | Positive rendered bounds are enforced and measured under staging load. |
| NFR-4 | Usability | Automated and required manual accessibility/browser evidence is recorded. |

Constraints CON-1 through CON-5 apply throughout; especially, local mocks cannot satisfy CON-3.

## 3. Technical approach

### 3.1 Architecture and data flow

1. The API persists source/configuration, calls the bounded authoring gateway, validates the returned closed-language artifact and stores an immutable revision. [FR-1, CON-1, CON-2]
2. A single draft response exposes both candidate artifact/hash for review and confirmed artifact/hash for execution/source inspection. The two remain distinct after edit/recompile. [FR-2, FR-7]
3. Confirmation and execution acceptance bind the immutable revision, expected intent, CSI and configuration before any runner side effect. [FR-2–FR-4]
4. The worker dispatches the durable job to the isolated runner. The runner validates again, resolves only supplied values, launches pinned Chromium, reports aligned steps, closes the context, and assesses the native WebM. [FR-3–FR-5]
5. The runner writes the redacted manifest/video using deterministic keys and reports evidence state independently from check outcome. The API authorizes snapshots, SSE and range/download reads by immutable execution CSI. [FR-5, FR-6, CON-4]
6. Helm converts canonical Spring property names to valid relaxed-binding environment names and refuses invalid/colliding conversions. [FR-8]

### 3.2 Production gate

Repository success is necessary, not sufficient. Release remains blocked until R2D2/Vertex, Core identity/vault, Sonic, cluster sandbox/egress, authenticated ingress and seek behavior pass the integrated credentialed pilot. [CON-3, ASM-1–ASM-3]

## 4. Dependencies

| Dependency | State | Purpose |
|---|---|---|
| Playwright 1.63.0 | Verified locally | Closed-language Chromium execution and native WebM. |
| Java 21 / Spring Boot 3 | Verified locally | API, compilation, confirmation, dispatch, evidence and recovery. |
| Kubernetes/Helm | Verified locally at render/test level | Process isolation and effective configuration. |
| R2D2/Vertex | Unverified / blocking | Production compilation. |
| PUT Core identity/vault | Client implemented, connection unverified / blocking | HashiCorp KV v2 adapter is default-off; trusted identity and real policy/canary proof remain external. |
| Sonic | Clients implemented, endpoint unverified / blocking | Local filesystem is default; S3 writer and read/range/manifest adapters await real lifecycle/policy evidence. |
| Platform ingress/egress | Unverified / blocking | SSE/media/session delivery and browser containment. |

## 5. Implementation and acceptance surfaces

| Surface | Required outcome | Risk |
|---|---|---|
| `backend/.../studio/dto/UITestDto.java`, `StudioService.java`, OpenAPI | Confirmed artifact/hash are projected from the immutable confirmed revision and omitted from lists. | High |
| `frontend/src/components/studio/CodeTab.tsx` and Studio page | Code tab fetches and renders exact confirmed source/hash, never draft-derived code. | High |
| MSW Studio fixtures/handlers | Confirmation and ready fixtures carry the same confirmed pair as production. | Medium |
| Helm ConfigMap/deployment surface | Dotted properties become valid Spring environment names; invalid/colliding names fail render. | Critical |
| Existing runner/backend/frontend suites | Local chain stays green. | Critical |
| External ED/SPK owners | Execute and record the real credentialed staging pilot. | Critical |

## 6. Testing strategy

| Gate | Requirements | Evidence |
|---|---|---|
| Compiler/gateway contract and bounds | FR-1, NFR-1, NFR-3 | Backend compile/gateway tests; real R2D2 staging call still required. |
| Candidate/confirmed divergence and source rendering | FR-2, FR-7 | PostgreSQL integration test plus frontend contract/render test. |
| Dispatch/recovery/cancel | FR-3, NFR-2 | Backend dispatch/recovery tests and runner cancellation fixture tier. |
| Closed Playwright execution | FR-4, CON-2 | Runner adversarial/reference and real-Chromium fixture tiers. |
| Video/manifest/evidence | FR-5, FR-6 | Runner WebM/upload tests and backend evidence/range tests; Sonic/ingress tests still required. |
| Deployment configuration | FR-8 | Helm rendered-manifest suite across base/dev/UAT/prod plus mutation tests. |
| Security/accessibility/performance | NFR-1–NFR-4 | Local automated gates plus credentialed staging, load, browser and manual AT evidence. |

Acceptance scenarios:

- Given an edited draft whose new candidate differs from its confirmed revision, when the user opens Code or runs, then both surfaces use the older immutable confirmed artifact until explicit reconfirmation. [AC-3, AC-4, AC-13]
- Given a normal accepted run, when Chromium completes or an assertion fails, then a finalized playable WebM and aligned step offsets are produced unless an explicit evidence failure is recorded. [AC-7–AC-10]
- Given a pod restart or duplicated/late callback, when recovery runs, then the known attempt settles once without browser replay. [AC-5, AC-6]
- Given a dotted or colliding configuration key, when Helm renders, then it emits a correct Spring environment name or fails before deployment. [AC-14]
- Given real enterprise dependencies, when the approved pilot executes, then compile, confirmation, dispatch, SSE, video seek/range/download, authorization, retention and canary checks all pass. [AC-1–AC-12, NFR-1–NFR-4]

## 7. Risks and mitigations

| Risk | Impact | Mitigation / release gate |
|---|---|---|
| Local fixtures conceal R2D2 incompatibility | Compile unavailable or semantically wrong | SPK-01 real-model contract and quality corpus. |
| Fake storage differs from Sonic | Missing/overexposed evidence | SPK-03 real write/read/range/lifecycle/version cleanup. |
| Identity/vault stubs or CSRF ambiguity | Impersonation or secret exposure | ED-02 linked delivery and credentialed authorization/canary pilot. |
| Ingress/egress behavior differs in cluster | Broken SSE/video or browser escape | Real HAR, reconnect, Range, DNS/egress and sandbox evidence. |
| Source displayed differs from execution | False user assurance | Confirmed artifact/hash projection and divergence tests. |
| ConfigMap settings are silently skipped | Safety bounds not applied | Canonical env conversion plus collision/validity render failures. |

## 8. Open questions / blockers

All four open questions in `requirements.json` block a production-ready verdict. Their owners must be assigned in the external delivery system; the repository cannot supply credentials, platform routes, storage policy or approved targets. [CON-3]

## 9. Implementation checklist

- [x] Run local compiler, confirmation, dispatch, recovery, runner, real-Chromium, evidence and deployment gates.
- [x] Expose and render the exact confirmed artifact/hash.
- [x] Repair `configOverrides` delivery and make invalid/colliding conversion fail closed.
- [ ] Close ED-01/SPK-01 with a real R2D2/Vertex compile and representative model-quality corpus.
- [ ] Close ED-02 with trusted identity, real vault authorization, CSRF posture and secret canary.
- [ ] Close ED-03/SPK-03 with real Sonic write/read/range/lifecycle/version cleanup.
- [ ] Close ED-04–ED-06 and remaining spikes with cluster sandbox, egress, ingress, SSE/media and seek measurements.
- [ ] Record the credentialed pilot and independent Security/QA release verdict.

## Metadata

- **Generated by:** spec pipeline (`gather → assess → research → spec → critique`)
- **Inputs:** `PRD.md`, Studio BRD/architecture, Epic 10 manifest/register, repository code and executed local gates
- **Iteration:** 1
