# Business Requirements Document: Checks UI Studio

| Field | Value |
|---|---|
| **Document type** | Business Requirements Document (BRD) |
| **Product** | "Checks", PUT Platform, Citibank |
| **Capability** | Checks UI Studio (no-code UI testing) |
| **Version** | 1.1 |
| **Date** | 2026-05-22 |
| **Owner** | Bruno Buger |
| **Approvers required** | Business Sponsor, Security & Compliance, Platform/Infra |

---

## 1. Executive Summary

Checks UI Studio lets any operations engineer, not just developers, turn a plain-English checklist ("Go to the login page," "Click Sign On," "Check that the URL contains login") into an automated browser test, and get back video proof that it ran correctly. It is the flagship differentiator of "Checks": other check types prove a system is healthy by querying it; Studio proves it by using it the way a customer would, on camera.

**Where it stands today:** the editor, run button, and video player already exist. What's missing is what makes it real: translating English into a browser action, executing it, recording it, storing it. That gap is what this BRD scopes.

**The business case:** an L2 support engineer today spends roughly 45 minutes every morning manually clicking through a wiki checklist, with no record she did it right. Studio replaces that with a checklist written once, a button clicked daily, and a video anyone (including an auditor or an incident commander) can trust without re-running anything.

**What changed recently:** in August 2026 the technical design converged on translating English via an internal AI model, with a **human confirmation step** before anything becomes runnable, and on running the browser in a fully isolated service rather than inside the core health-check API. This removed a whole category of availability risk but introduced a new dependency (the internal LLM gateway). Both are addressed below.

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
| **Translation & confirmation** | Every step is auto-translated to executable code; the user must review and confirm it before the test can run. This is a deliberate trust checkpoint, not a formality. |
| **Execution** | On-demand "Run Test" against one browser engine (Chromium), with a pass/fail per step. |
| **Video proof** | Every run, pass or fail, produces a private, CSI-scoped video, seekable to the exact moment of any step. |
| **Access & secrets** | Every action authorized by CSI; secret values exist only for the instant a run executes, never stored or shown to the AI model. |
| **Scheduling** | Designed, not built in V1. Reuses the platform's existing scheduler once on-demand execution is proven. |

### 3.2 Explicitly out of scope (V1)

Non-Chromium browsers; more than 1-2 simultaneous runs per pod; automated remediation of failures; a hand-written English-grammar translation layer (replaced by the AI approach to avoid an ever-growing rule table someone must own forever); a separate video-processing service; a dedicated browser grid or paid cloud browser service; public/non-expiring video links; live log streaming during a run.

### 3.3 A scope change the sponsor should know about

| Was assumed originally | Is now the plan | Business impact |
|---|---|---|
| A separate "Video Processing Service" would need to be built or bought. | The browser records its own video; no such service exists in the plan. | **Cost and vendor risk removed.** |
| The browser would run inside the same service as the core health-check API. | The browser runs in a fully isolated service. | **Availability risk removed.** A broken UI test can no longer degrade the API every other team depends on. |
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
| **Platform/SRE (on-call owner)** *(new; required by this design)* | Owns the isolated runner in production: capacity, network egress, the on-call runbook. |

**Sign-off required from:** Business Sponsor, Security & Compliance, and Platform/SRE before the staging pilot is promoted to general availability (see Success Metrics and Governance).

---

## 5. Current State vs. Future State

| Dimension | Today | At V1 exit |
|---|---|---|
| Authoring | A user can type and save steps. | Unchanged. Stays exactly this simple. |
| Translation | No code exists behind a saved step. | Every step is translated, validated, and shown to the user for confirmation before it can run. |
| Execution | "Run Test" records a placeholder row; nothing happens. | A real, isolated browser runs every confirmed step and returns a pass/fail. |
| Proof | No video exists. | Every run produces a private, step-synchronized video. |
| Operational risk | None (nothing executes yet). | A failing or stuck browser test cannot affect the core health-check API or other teams' checks. |

---

## 6. Business Requirements

| Group | Requirement | Why it matters |
|---|---|---|
| Authoring | A user writes/edits a checklist against a CSI, using named variables and secrets, never real values. | The entire no-code value proposition. |
| Authoring | Editing a confirmed test clearly flags it as needing re-confirmation. | Prevents a silently-changed test from running under a false assumption. |
| Translation | Every step is auto-translated; the user must see and confirm the generated result before it's runnable. | The human control point that makes an AI-translated test acceptable to run. |
| Translation | A confirmed test's behavior never changes on its own, even if the AI model is later upgraded. | "The test that passed last week" and "the test that runs today" must be provably identical. |
| Translation | A step the system can't confidently translate blocks only that test, with a plain-language reason. It never guesses. | Protects against false confidence in results. |
| Translation | If the AI translation service is down, authoring pauses but **every already-confirmed test keeps running.** | Authoring availability and execution availability are separate guarantees. |
| Execution | A failing step stops the test and is marked clearly; later steps are marked "not attempted," never falsely passed. | Honest reporting matters more than optimistic reporting for a health signal. |
| Execution | Studio's execution load can never slow down or take down the core health-check API. | The single biggest risk reduction this design delivers; must be preserved as a hard requirement. |
| Video proof | Every run, pass or fail, produces a video; clicking a step jumps to that exact moment. | Failure proof is as valuable as success proof, especially mid-incident. |
| Video proof | Videos are viewable only by someone authorized on that CSI, checked every time; videos auto-delete after 30 days. | Bounds compliance and storage exposure indefinitely. |
| Secrets & access | A secret's real value exists only for the instant a run executes. It is never logged, stored, or shown to the AI model. | Non-negotiable given the AI model is a third party to the resolved value. |
| Scheduling | A confirmed test can later be attached to the platform's existing scheduler, once on-demand use is proven. | Avoids building two schedulers; defers investment until trust is established. |

---

## 7. Cost & ROI Framework

Precise dollar figures require inputs only the business holds (headcount doing manual checks, internal compute unit cost). What follows states the planning assumptions used for sizing and marks clearly what the sponsor needs to supply.

### 7.1 Cost side (grounded in the actual design)

| Cost driver | What we know | Why it's cheap by design |
|---|---|---|
| Runner compute | 1-2 pods, sized ~1-2 CPU / 2-4 GiB each | This is a small footprint next to the platform's own baseline of **250 execution slots** provisioned for all other check types. Studio does not compete for that capacity. It runs in its own lane. |
| AI translation calls | Billed once per **authored or edited test**, cached 30 days by content hash. **Never per run** | A test run 1,000 times over its life costs one translation, not 1,000. Cost scales with how much people *write*, not how much they *run*. Running is the whole point of the feature. |
| Video storage | 30-day hard-delete retention | Storage volume is bounded and does not grow indefinitely; it never exceeds ~30 days of run activity. |
| New service to operate | One small isolated runner service, shipped inside the existing repo/deployment (no new-repo approval on the critical path) | Avoided the cost of a separate video-processing service and a browser-grid/vendor product that earlier plans assumed. |

**Sponsor input needed to finish this side:** internal per-CPU/GiB-hour cost and per-1K-token AI gateway cost, to convert the above into a dollar run rate.

### 7.2 Benefit side (grounded in the platform's own numbers)

| Benefit driver | Grounded input | Calculation shape |
|---|---|---|
| Time saved | Observed persona baseline: **~45 minutes/engineer/day** on manual UI walkthroughs | `Annual hours saved = (# engineers doing manual UI checks) × 45 min/day × ~250 working days × 75% automation target` |
| Manual-execution headroom already planned | Platform capacity plan reserves **25 of 250 execution slots** for "manual execution burst" (the platform already expects non-scheduled, human-triggered runs at this order of magnitude) | Confirms Studio's expected usage pattern (on-demand, human-triggered) fits inside capacity the business has already budgeted for, at no incremental infrastructure ask. |
| Incident-detection value | Platform goal: reduction in P1/P2 incidents caught preemptively | Not directly quantifiable yet; track via the "Evidentiary value" success metric during the pilot and convert to a cost-of-incident-avoided figure once pilot data exists. |

**Sponsor input needed to finish this side:** headcount currently performing manual UI checks, and an internal average fully-loaded hourly cost for that role.

### 7.3 Illustrative model (fill in the blanks)

```
Annual hours saved  = [# engineers] × 0.75 hr/day × 250 days × 75%
Annual $ saved       = Annual hours saved × [fully-loaded hourly rate]
Annual infra cost    = (runner pod-hours × [$/CPU-hr]) + (AI calls × [$/call]) + (storage × [$/GB-month])
Payback              = Annual infra cost ÷ Annual $ saved
```

Recommendation: run this model with real inputs at the staging-pilot checkpoint, when actual test counts and edit frequency are observable, before committing to the post-V1 scaling investment.

---

## 8. Key Risks

| Risk | Impact if realized | Mitigation | Owner |
|---|---|---|---|
| AI gateway can't guarantee deterministic output | Slower authoring, more manual rewrites. Does **not** affect already-confirmed tests. | Verify gateway capability early; validation guarantees correctness regardless of model behavior | Architecture |
| A secret is visible on-screen in the target app, so it appears in the video | Compliance exposure if not pre-agreed | Documented and explicitly accepted as a residual limit; Security must sign off in writing pre-GA | Security & Compliance |
| Cluster security hardening conflicts with what a real browser needs | Delivery delay if discovered late | Prove one runner pod in staging before templating production | Platform/SRE |
| Users treat AI-generated code confirmation as a rubber stamp | Undermines the trust model the whole feature is built on | Track confirmation-to-edit ratio in the pilot; validate with user research | Product |
| No clearly staffed on-call owner for the new runner service | Operational risk once in production | Explicitly assigned to the Checks squad with a runbook as a launch exit criterion | Engineering management |
| Adoption stalls because the video-proof value isn't visible outside the authoring team | Reduced return on the investment | Track "videos cited in reports/retrospectives" from week one of the pilot, not as an afterthought | Product |

---

## 9. Delivery Milestones

| Milestone | What becomes true for the business |
|---|---|
| **Foundation** | Access control enforced on every Studio action; no user-visible change yet. |
| **Compiler + skeleton live** | A user can write a step, see generated code, confirm it, and the loop round-trips end to end on fake data. |
| **Real browser, real video (dev)** | "Run Test" produces real results and a real, seekable video on a developer machine. |
| **Staging pilot** | The full journey (write, confirm, run, watch) works against a real internal application with production-grade security controls. |
| **GA decision point** | Security, Platform, and Sponsor sign-offs obtained; pilot metrics reviewed; go/no-go for production. |
| **Post-V1** | Scheduling and increased runner capacity, funded only once pilot evidence justifies the investment. |

A kill switch exists from the skeleton milestone onward: execution can be disabled instantly without losing any authored test.

---

## 10. Success Metrics

| Metric | What it proves |
|---|---|
| **Adoption** | # of CSIs with at least one confirmed, runnable Studio test. |
| **Authoring efficiency** | Median time from first step written to confirmed, runnable test. Target: under 5 minutes with minimal training. |
| **Translation trust** | % of steps confirmed without requiring a rewrite. A declining trend signals an AI-gateway or prompt problem. |
| **Evidentiary value** | # of incident retrospectives or status reports citing a Studio video. |
| **Satisfaction** | NPS attributed to Studio specifically. Studio is a headline satisfaction metric for the platform. |
| **Compliance** | Count of secret-exposure or retention-policy violations. Must be zero, always. |

---

## 11. Governance & Sign-off

Before the staging pilot is promoted to general availability:

1. **Security & Compliance:** written acceptance of the secrets-handling model and the video retention/access policy, including the residual on-screen-secret risk (see Key Risks).
2. **Platform/Infra:** confirmed on-call ownership, network egress approved, pod hardening proven in staging.
3. **Business Sponsor:** review of pilot metrics (see Success Metrics) and explicit go/no-go for production.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **CSI** | Citi System Inventory. The unit every check, including every Studio test, is scoped to. |
| **Frozen artifact** | The confirmed, validated code behind a test. Replays identically every time, never silently regenerated. |
| **studio-runner** | The isolated service that opens a browser, runs a confirmed test, and records the video. |
| **Compile-readiness gate** | The rule that a test can only run if its generated code is confirmed and matches its current steps exactly. |
