# Business Requirements Document: Checks UI Studio

| Field | Value |
|---|---|
| **Document type** | Business Requirements Document (BRD) |
| **Product** | "Checks", PUT Platform, Citibank |
| **Capability** | Checks UI Studio (no-code UI testing) |
| **Version** | 1.2 |
| **Date** | 2026-09-10 |
| **Owner** | Bruno Buger |
| **Approvers required** | Business Sponsor, Security & Compliance, Platform/Infra |

---

## 1. Executive Summary

Checks UI Studio lets any operations engineer, not just developers, turn a plain-English checklist ("Go to the login page," "Click Sign On," "Check that the URL contains login") into an automated browser test, and get back video proof that it ran correctly. It is the flagship differentiator of "Checks": other check types prove a system is healthy by querying it; Studio proves it by using it the way a customer would, on camera.

**Where it stands today:** the editor, run button, and video player already exist. What's missing is what makes it real: translating English into a browser action, executing it, recording it, storing it. That gap is what this BRD scopes.

**The business case:** an L2 support engineer today spends roughly 45 minutes every morning manually clicking through a wiki checklist, with no record she did it right. Studio replaces that with a checklist written once, a button clicked daily, and a video anyone (including an auditor or an incident commander) can trust without re-running anything.

**What changed recently:** the design uses an internal AI model during authoring, confirmation of the exact immutable revision, and a separate browser service. The September review adds durable admission/results, explicit recovery, live progress over SSE with GET fallback, and separate execution/evidence states. Backend limits and runner isolation protect ordinary checks; the internal gateway, real identity/vault services and streaming ingress are named dependencies. Technical contracts are maintained in the [Studio architecture](../architecture/studio-execution.md); delivery is tracked in [Epic 10](../epics/EPIC-10-EXECUTION.yaml).

---

## 2. Business Problem & Opportunity

| Symptom today | Business consequence |
|---|---|
| UI/login/workflow checks are performed manually against a wiki checklist. | ~45 minutes of skilled engineer time per person per day, with no durable evidence produced. |
| Where automated, UI checks exist as one-off scripts written by individual engineers. | Tribal knowledge; scripts go stale the day their author changes teams. |
| No proof a check ran correctly beyond a pass/fail log line. | "Did the login flow actually work at 9 a.m.?" can't be answered with confidence during an incident. |
| Authoring a browser test requires code. | Non-developer staff, mostly L2/L3 support, are excluded from building or maintaining checks. |

Studio maps to three platform goals:

1. **Automate & Improve Efficiency:** 75% reduction in manual check effort for onboarded applications.
2. **Deliver Superior UX:** non-developer users create a meaningful check in under 5 minutes with minimal training.
3. **User Satisfaction:** Studio is the capability NPS is measured against.

---

## 3. Scope

### 3.1 In scope (V1)

| Capability | Business scope |
|---|---|
| **Authoring** | Write/edit a plain-English checklist per CSI, referencing variables and vaulted secrets by name only. |
| **Translation & confirmation** | The model proposes Playwright TypeScript; the user reviews understandable actions/targets/assertions and optional source, then confirms the exact revision. Invalid or unsupported steps block that candidate. |
| **Execution** | On-demand Chromium, one page per run, with pass/fail and skipped steps. Accepted work/results are durable; ambiguous attempts are never automatically replayed. |
| **Live progress** | SSE current-state snapshots with retained redacted logs, reconnect and GET fallback; observing a run never owns its execution lifetime. |
| **Video proof** | Normal successful and assertion-failing browser runs produce private video with attempted-step seek and authorized download. Infrastructure/storage failures explicitly show partial or unavailable evidence independently of outcome. |
| **Access & secrets** | Every action authorized by CSI, including history/SSE/video. Resolved secrets exist transiently during dispatch/browser use, never in prompts, artifacts or persisted diagnostics; on-screen video exposure is a disclosed residual risk. |
| **Scheduling** | Designed, not built in V1. Reuses the platform's existing scheduler once on-demand execution is proven. |

### 3.2 Explicitly out of scope (V1)

Non-Chromium browsers; more than 1-2 simultaneous runs per pod; automated remediation of failures; a hand-written English-grammar translation layer (replaced by the AI approach to avoid an ever-growing rule table someone must own forever); a separate video-processing service; a dedicated browser grid or paid cloud browser service; public/non-expiring video links; screenshot capture; live video; lossless replay of every intermediate progress event; popup/iframe/multi-page workflows. Python export is retired. Unified UI_TEST application/component/catalog/report integration and scheduling follow V1; Studio history remains CSI-scoped in V1.

### 3.3 A scope change the sponsor should know about

| Was assumed originally | Is now the plan | Business impact |
|---|---|---|
| A separate "Video Processing Service" would need to be built or bought. | The browser records its own video; no such service exists in the plan. | **Cost and vendor risk removed.** |
| The browser would run inside the same service as the core health-check API. | The browser runs in a fully isolated service. | **Availability risk reduced.** Isolated browser processes plus bounded admission, dispatch and progress workloads protect shared API/check resources; staging overload tests verify this. |
| Plain English would be mapped to actions via a hand-built rule set. | Plain English is translated by an internal AI model, validated automatically, and confirmed by the user. | **New dependency added** (internal LLM gateway) and **a new confirmation step in the UX.** Both need sponsor and Security awareness (see Key Risks and Delivery Milestones). |

---

## 4. Stakeholders

| Stakeholder | Stake in Studio |
|---|---|
| **L2 App Support (primary user)** | Author and daily runner. This is the 45-minute problem the capability solves. |
| **SRE / DevOps (power user)** | Complex flows, secrets, first responder if the AI translation or runner is unhealthy. |
| **Operations Analyst** | Uses video proof inside status reports and incident retrospectives. This is the evidentiary payoff. |
| **IT Director (Business Sponsor)** | Adoption, satisfaction, and assurance that an AI-involved capability is governed, not a black box. |
| **Security & Compliance** *(new; required by this design)* | Must accept the secrets-handling model and video retention policy before GA. |
| **Checks squad (on-call owner)** | Owns Studio execution, recovery, capacity and the runner runbook. |
| **Platform/SRE** | Supports cluster, ingress, egress, sandbox and storage controls; validates platform prerequisites. |

**Sign-off required from:** Business Sponsor, Security & Compliance, and Platform/SRE before the staging pilot is promoted to general availability (see Success Metrics and Governance).

---

## 5. Current State vs. Future State

| Dimension | Today | At V1 exit |
|---|---|---|
| Authoring | A user can type and save steps. | Drafts save independently of gateway availability; relevant changes require a new confirmation. |
| Translation | No runnable confirmed artifact exists behind a saved step. | Proposed source is validated and shown with readable action summaries; the exact revision is confirmed before execution. |
| Execution | "Run Test" creates a placeholder; no browser work occurs. | A real isolated browser attempts confirmed steps, stops at failure, and reports live progress and final state. |
| Proof | No real execution video exists. | Normal browser runs produce private video; infrastructure loss is explicitly partial/unavailable. |
| Operational risk | Browser execution is absent; identity/vault code still has temporary behavior. | Isolated processes, bounded workloads and recovery protect ordinary checks; actual security prerequisites are proven before the credentialed pilot. |

---

## 6. Business Requirements

| Group | Requirement | Why it matters |
|---|---|---|
| Authoring | A user writes/edits a checklist against a registered CSI, using nonsecret variables and named vault references; inline credentials are prohibited. | The entire no-code value proposition. |
| Authoring | Editing a confirmed test clearly flags it as needing re-confirmation. | Prevents a silently-changed test from running under a false assumption. |
| Translation | Each candidate is validated; the user reviews its action summary/source and confirms that exact source/configuration revision before it is runnable. | The human control point that makes an AI-translated test acceptable to run. |
| Translation | Confirmed instructions/configuration never change silently with a model upgrade; executions retain their immutable revision and actual runtime provenance. | The approved instructions are auditable; application state, runtime and rotated credentials can still change outcomes. |
| Translation | Invalid or unsupported translation blocks only that candidate with a plain-language reason; valid syntax alone does not establish correct intent or locator selection. | Protects against false confidence in results. |
| Translation | If AI translation is down, drafts still save and compilation waits; unchanged confirmed tests can execute subject to current access/runtime policy. | Authoring availability and execution availability are separate guarantees. |
| Execution | A failing step stops the test and is marked clearly; later steps are marked "not attempted," never falsely passed. | Honest reporting matters more than optimistic reporting for a health signal. |
| Execution | Studio must not exhaust capacity reserved for ordinary checks/REST: enforce admission, dispatch, compilation and SSE limits, and validate bounded overload. | The single biggest risk reduction this design delivers; must be preserved as a hard requirement. |
| Video proof | Successful and assertion-failing browser runs normally produce video; pre-browser/crash/storage failures expose honest evidence state. Clicking an attempted step seeks its start within the measured tolerance. | Failure proof is as valuable as success proof, especially mid-incident. |
| Video proof | Video/SSE/history access uses the execution's immutable CSI. Video access expires after 30 days; storage lifecycle deletion and version cleanup are configured and verified against Sonic behavior. | Bounds compliance and storage exposure indefinitely. |
| Secrets & access | Resolved values exist only transiently for authorized dispatch/browser use and the intended target request. They never enter prompts, artifacts or persisted diagnostics; on-screen exposure in private video is separately governed. | Non-negotiable given the AI model is a third party to the resolved value. |
| Progress & recovery | Progress reconnects to current state across API replicas. Closing the browser tab never re-executes or cancels the run; stuck/lost attempts end truthfully. | Keeps progress convenient without making it a source of duplicate application effects. |
| Scheduling | A confirmed test can later be attached to the platform's existing scheduler, once on-demand use is proven. | Avoids building two schedulers; defers investment until trust is established. |

---

## 7. Cost & ROI Framework

Precise dollar figures require inputs only the business holds (headcount doing manual checks, internal compute unit cost). What follows states the planning assumptions used for sizing and marks clearly what the sponsor needs to supply.

### 7.1 Cost side (grounded in the actual design)

| Cost driver | What we know | Why it's cheap by design |
|---|---|---|
| Runner compute | 1-2 pods, sized ~1-2 CPU / 2-4 GiB each | This is a small footprint next to the platform's own baseline of **250 execution slots** provisioned for all other check types. Studio does not compete for that capacity. It runs in its own lane. |
| AI translation calls | Billed during compilation and at most two repair attempts per candidate. **Never per run**; caching is post-V1 | Repeated executions reuse confirmed source without new AI cost. Budget initial compilation plus bounded repairs/recompiles; metadata-only changes do not invoke the model. |
| Evidence storage | 30-day logical video expiry plus verified lifecycle deletion for videos/manifests | Budget run volume, recording size, object versions and deletion lag; retention bounds exposure once platform deletion behavior is verified. |
| Live progress | SSE snapshots backed by bounded DB reads across API replicas | Adds connection/proxy handling and snapshot work; no separate messaging service. The [SSE estimate](../architecture/studio-sse-viability.md) assumes an already working live-progress backend. |
| New service to operate | One small isolated runner service, shipped inside the existing repo/deployment (no new-repo approval on the critical path) | Avoided the cost of a separate video-processing service and a browser-grid/vendor product that earlier plans assumed. |

**Sponsor input needed to finish this side:** internal per-CPU/GiB-hour cost and per-1K-token AI gateway cost, to convert the above into a dollar run rate.

### 7.2 Benefit side (grounded in the platform's own numbers)

| Benefit driver | Grounded input | Calculation shape |
|---|---|---|
| Time saved | Observed persona baseline: **~45 minutes/engineer/day** on manual UI walkthroughs | `Annual hours saved = (# engineers doing manual UI checks) × 45 min/day × ~250 working days × 75% automation target` |
| Manual-execution headroom already planned | Platform capacity plan reserves **25 of 250 execution slots** for "manual execution burst" (the platform already expects non-scheduled, human-triggered runs at this order of magnitude) | This is context for usage patterns, not transferable browser capacity. Studio has separate runner pods; include their incremental compute/storage and operational cost in the pilot budget. |
| Incident-detection value | Platform goal: reduction in P1/P2 incidents caught preemptively | Not directly quantifiable yet; track via the "Evidentiary value" success metric during the pilot and convert to a cost-of-incident-avoided figure once pilot data exists. |

**Sponsor input needed to finish this side:** headcount currently performing manual UI checks, and an internal average fully-loaded hourly cost for that role.

### 7.3 Illustrative model (fill in the blanks)

```
Annual hours saved  = [# engineers] × 0.75 hr/day × 250 days × 75%
Annual $ saved       = Annual hours saved × [fully-loaded hourly rate]
Annual infra cost    = (runner pod-hours × [$/CPU-hr]) + (AI calls × [$/call]) + (storage × [$/GB-month])
Annual net benefit   = Annual $ saved − Annual infra cost
Payback years        = [one-time delivery cost] ÷ Annual net benefit  (when net benefit > 0)
```

Recommendation: run this model with real inputs at the staging-pilot checkpoint, when actual test counts and edit frequency are observable, before committing to the post-V1 scaling investment.

---

## 8. Key Risks

| Risk | Impact if realized | Mitigation | Owner |
|---|---|---|---|
| AI gateway can't guarantee deterministic output | Slower authoring, more manual rewrites. Does **not** affect already-confirmed tests. | Validate syntax/capabilities and preserve confirmed revisions; measure semantic quality against representative internal applications and users | Architecture |
| A secret is visible on-screen in the target app, so it appears in the video | Compliance exposure if not pre-agreed | Disclosed residual limit requiring written Security acceptance pre-GA; acceptance is not asserted by this document | Security & Compliance |
| Cluster security hardening conflicts with what a real browser needs | Delivery delay if discovered late | Prove one runner pod in staging before templating production | Platform/SRE |
| Users treat AI-generated code confirmation as a rubber stamp | Undermines the trust model the whole feature is built on | Use readable action summaries and representative observed runs; track correct interpretation and confirmation-to-edit ratio in user research | Product |
| No clearly staffed on-call owner for the new runner service | Operational risk once in production | Explicitly assigned to the Checks squad with a runbook as a launch exit criterion | Engineering management |
| Adoption stalls because the video-proof value isn't visible outside the authoring team | Reduced return on the investment | Track "videos cited in reports/retrospectives" from week one of the pilot, not as an afterthought | Product |

---

## 9. Delivery Milestones

| Milestone | What becomes true for the business |
|---|---|
| **Foundation** | Real identity/vault prerequisites identified; stable CSI access, immutable revision/dispatch contracts and actual SSE/media route validated. |
| **Compiler + skeleton live** | Exact revision confirmation, fake execution, durable admission/progress/results and recovery work end to end; SSE reflects persisted state. |
| **Real browser, real video (dev)** | "Run Test" produces real results and a real, seekable video on a developer machine. |
| **Staging pilot** | The full journey (write, confirm, run, watch) works against a real internal application with production-grade security controls. |
| **GA decision point** | Security, Platform, and Sponsor sign-offs obtained; pilot metrics reviewed; go/no-go for production. |
| **Post-V1** | Scheduling and increased runner capacity, funded only once pilot evidence justifies the investment. |

From the skeleton milestone onward, a kill switch rejects new executions and closes queued undispatched work explicitly. Already-admitted runs finish/report; reads and recovery remain available. No authored test is lost.

---

## 10. Success Metrics

| Metric | What it proves |
|---|---|
| **Adoption** | # of CSIs with at least one confirmed, runnable Studio test. |
| **Authoring efficiency** | Median time from first step written to confirmed, runnable test. Target: under 5 minutes with minimal training. |
| **Translation trust** | Correct action/assertion interpretation on representative applications, observed user success and rewrite rate. Confirmation alone is not proof of correctness. |
| **Reliability & progress** | Queue/start/progress latency, recovery results, video availability and measured seek tolerance; ordinary REST/check responsiveness under bounded Studio load. |
| **Evidentiary value** | # of incident retrospectives or status reports citing a Studio video. |
| **Satisfaction** | NPS attributed to Studio specifically. Studio is a headline satisfaction metric for the platform. |
| **Compliance** | Count of secret-exposure or retention-policy violations. Must be zero, always. |

---

## 11. Governance & Sign-off

Before the staging pilot is promoted to general availability:

1. **Security & Compliance:** written acceptance of the secrets-handling model and the video retention/access policy, including the residual on-screen-secret risk (see Key Risks).
2. **Platform/Infra:** Checks squad on-call ownership and Platform support confirmed; egress, sandbox, SSE/media authentication, retention and recovery proven in staging.
3. **Business Sponsor:** review of pilot metrics (see Success Metrics) and explicit go/no-go for production.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **CSI** | Citi System Inventory. The unit every check, including every Studio test, is scoped to. |
| **Frozen artifact** | Immutable approved source and configuration behind a test; never silently regenerated. Browser outcomes can vary. |
| **studio-runner** | The isolated service that opens a browser, runs a confirmed test, and records the video. |
| **Compile-readiness gate** | The rule that execution references the exact confirmed source/configuration revision and still satisfies current access/runtime policy. |
