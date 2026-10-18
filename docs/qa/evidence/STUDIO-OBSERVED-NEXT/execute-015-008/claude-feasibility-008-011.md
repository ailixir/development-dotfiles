# Feasibility and orchestration analysis — STUDIO-OBS-008 / 009 / 010 / 011

- **Author:** Pax (@po), read-only analysis. **Date:** 2026-10-15. **Branch:** `brunobuger/ui-studio`, HEAD `734ad704f` plus an uncommitted tree.
- **Writes:** this file only. I made no story, lifecycle, source or evidence edits, and ran no tests, builds, installs, commits or model calls.
- **What this changes:** nothing. Every AC, GO condition and dependency stays as written. Where this file proposes a change, it is marked **PROPOSAL** and needs a user decision.
- **Inputs read:**
  - The README (top sections).
  - Stories 008, 009, 010 and 011.
  - `resume-20261014/po-closure-placements.json`.
  - The 008 prep files under `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/`: architect-rulings P1–P7, architect-ownership, po-scope-readiness, qa-design-readiness and ux-implementation-plan.
  - The intent files `aria008-*`, `pax008-*`, `qa008design-*` and `ux008-*`.
  - `RESUME-HANDOFF.md` (paused 2026-10-16T01:56Z UTC).
  - The 015 item-85 PO clarification.

## Legend

| Class | Meaning |
|---|---|
| LOCAL | Can be built and its required proof run on this Mac: code, unit and integration tests, Testcontainers/Docker, local Playwright against MSW or local servers. |
| LOCAL-PARTIAL | The code and part of the proof are local. The final proof the AC names needs an external system, person or approval. |
| EXTERNAL | The AC's proof itself needs a real external system, person or approval. Local work is only preparation. |

## Verified environment facts (commands run on 2026-10-15)

| Fact | Result |
|---|---|
| Docker daemon | `docker info` answered with server 27.4.0. The pause handoff said the socket was unavailable. Today it responds; I did not inspect container state. |
| helm / kubectl | Both installed. `kubectl config get-contexts` returned **no contexts**, so there is no cluster to deploy to. |
| vault CLI | Not installed. Nothing in `backend/src/test` uses a Vault container; tests use `FakeStudioVaultProvider`, `CountedLoginVault` and `SwitchableVault`. |
| Playwright | Chromium 1243 is cached and `studio-runner` has `playwright`. `frontend/node_modules` has `msw` and `axe-core` but **no `@playwright/test`**. Architect ruling P5 adds `@playwright/test` 1.63.0, which needs a package install. |
| JDK | `java` on PATH is 11. Whether JDK 21 is available to the Gradle toolchain was **not verified** by me; the handoff says a local JDK was used. |
| Runner base image | The `studio-runner/Dockerfile` default `REGISTRY=mcr.microsoft.com` is "local development only". Production must use the internal registry (ED-05). |
| 015 source freeze | The recovery global manifest (`runtime06-recovery01/20261016T014708Z-current-global-final.json`) lists **1,619 paths**: 835 `backend/src`, 260 `frontend/src`, 117 `docs/specs`, 82 `studio-runner/src`, 172 `studio-runner/test`, 15 `studio-runner/evaluation`, plus `tools/corun.sh`. Any edit there while 015 validation runs breaks 015's frozen-source evidence. |

## (c) Real-model benchmark credentials and config (names only, no values printed)

| Check | Result |
|---|---|
| Studio model provider | Only Vertex AI. `application.yml:365-372` says "Vertex AI is the only provider; anything else answers DISABLED". `STUDIO_GATEWAY_PROVIDER` defaults to `disabled`; credentials mode defaults to `application-default`. |
| `STUDIO_GATEWAY_*` and `STUDIO_GUIDED_EVAL_*` in this shell | **None set.** `GuidedProviderEvaluationTest` needs `..._APPROVED_CORPUS`, `..._ENDPOINT`, `..._PROJECT`, `..._LOCATION` and `..._MODEL`, with a non-loopback HTTPS endpoint. Without them it reports `UNAVAILABLE_NOT_RUN`. |
| Root `.env` | Has `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY` and `OPENROUTER_API_KEY`. All are **empty or placeholders**. They are AIOX tooling keys, and Studio cannot use them anyway. |
| GCP on this Mac | `gcloud` is installed, an application-default credentials file exists, a project is set, and `aiplatform.googleapis.com` is enabled on it. I did **not** check model access (`gemini-3.8-flash`), quota or billing, and I made **no model call**. |
| Conclusion | The repo has **no real-model configuration**. The Mac's GCP credentials could technically drive a *non-gating rehearsal* on fixture pages, but only if the user authorizes the spend and the project; it would count against the USD 500 ceiling, and actual spend cannot be measured. It **cannot satisfy** 009 AC-7 or AC-8: those need ED-01 (the R2D2 gateway, owner TBD), the deployed stack and an approved staging app. Sending page data to a non-approved provider also touches the open OBS-014 compliance approval. My inference is that the project is personal, not ED-01; I did not confirm this. |

## STUDIO-OBS-008 — 9 LOCAL / 0 LOCAL-PARTIAL / 0 EXTERNAL

| AC | Class | Notes (local proof / external piece) |
|---|---|---|
| AC-1 typed transport + MSW mirror | LOCAL | Needs the final post-015 OpenAPI and v3 fixtures. The C-int lane measures the operation count (43→44, P7). |
| AC-2 one Run, three modes, auto-finalize | LOCAL | `NEEDS_RELEARN`, `baseRevisionId` and `firstLearnStepId` come from 015 (P6). |
| AC-3 states and copy | LOCAL | `REPLAYING_PREFIX` and drift copy come from 015. Active step N/M needs the backend `PublicProgress` projection (P2). |
| AC-4 login required | LOCAL | Uses the OBS-007 contract, which is Done. |
| AC-5 references, capability, never-echo | LOCAL | Per P1, the capability reflects the configured provider type, not Vault health, so no real Vault is needed. The backend route is co-executed. |
| AC-6 plan explanation | LOCAL | Backend `PublicExplanation` projector (P3) over 015's relearn records. |
| AC-7 video + seek | LOCAL | OBS-013 is Done. Uses a local WebM fixture through MSW (P5). The PLAYBACK-COST measurement uses local PostgreSQL, the local object store and loopback Core. |
| AC-8 WCAG 2.1 AA | LOCAL | jsdom axe plus a browser axe run through Playwright. Not a manual assistive-technology audit; the AC doesn't require one. |
| AC-9 Vitest + first Playwright E2E | LOCAL | Runs against MSW, explicitly not live integration. Needs the `@playwright/test` install (P5). |

Inherited obligations are all LOCAL: v2 stable step IDs, legacy retirement, M12, POLICY_DENIED/SIDE_EFFECT_CONFIRMATION, POLICY_NOT_APPROVED, the class-A allowlist, FE-A11Y, PLAYBACK-COPY and FE-CONSUMERS.

**Transitive blocker:** 015 Done. Its remaining scope looks local per its gap plan (my inference), **except item 85**. Item 85 needs a user or acceptance-owner decision on a proposed subject amendment, or it stays open (`po-recording85-clarification01/scope-decision.json`, `decisionNeeded`).

### (a) 008 vs unfinished 015

**Rules that forbid starting 008 implementation now (quoted):**
- 008 GO conditions (`STUDIO-OBS-008.story.md:199`): "implementation starts only after OBS-012B/013/014/015 are Done (every contract the UI binds is real)".
- README `:47`: "Only verified completed dependencies permit development of dependents."
- Architect P0 and the QA holds: "015 reaches independent actual QA PASS Done; current InProgress work is not completion."
- Practical rule: the 015 global source freeze covers `frontend/src`, `docs/specs`, `backend/src` and `studio-runner/**` (see above).

**Preparation is allowed and already done:** P1–P7 are ruled, design QA has no blocking findings, the UX plan exists, and po-scope-readiness says "No wait for 015 was needed for this scope review".

| 008 work item | Truly depends on 015? | Why |
|---|---|---|
| C-int contract unit (capability operation, progress/explanation schemas, pins, legacy fixture deletion) | **Yes** | Edits the OpenAPI/v3 files 015 owns. The operation count and hashes are measured post-015 (P7). |
| Backend lane (`GuidedPublicPresentationProjector`, `GuidedSessionService` wiring, result projector, capability service) | **Yes** | It is in the 015 freeze, and P2/P3 read 015's durable prefix progress and relearn records. |
| A1 transport, types, MSW for NEEDS_RELEARN/REPLAYING_PREFIX/REVISION_CONFLICT, v1→v2 retirement | **Yes** | Its types derive from the final v3. 015 deletes v1 (`INVALID_AUTHORING`). |
| B1 pure components (`ReferencePicker`, `referenceTokens`, `SecretInput` never-echo, capability hook against the P1 shape) | Technically **no** | Built from contracts that are Done (007/014) plus the P1 shape. |
| Copy/narratives for non-015 states (login, POLICY_DENIED, SIDE_EFFECT_CONFIRMATION, POLICY_NOT_APPROVED, video) | Technically **no** | 007/013/014 are Done. |
| P5 browser harness (`frontend/e2e/*`, Playwright config, Node MSW proxy) | Technically **no** | Test-only, but `frontend/package.json` is in the freeze. |

**Summary:** the "technically no" rows are still forbidden under the GO condition. They also break 015's freeze if built in this worktree.

**PROPOSAL A (user decision):** allow the three "technically no" rows to be built in a *separate* worktree snapshot of the current tree, as a design spike. They would not be credited as 008 implementation and would be re-applied after 015 Done. Risks: hand-merging an uncommitted tree; host CPU contention with 015 native runs (RUNNER-LAUNCH CONTEXT_LOST under load). My recommendation is to keep the rule and spend the waiting time on external procurement instead.

## STUDIO-OBS-009 — 2 LOCAL / 7 LOCAL-PARTIAL / 3 EXTERNAL

| AC | Class | Local part | External part and owner |
|---|---|---|---|
| AC-1 one runner process/image/Deployment + P2 stamps | LOCAL-PARTIAL | Fold, P2 stamp removal, helm render tests, local `docker build` from the public base image | Internal image registry, Node pin conflict and prod `studioRunner.enabled` (ED-05, Platform/SRE); real deployment (@devops + user) |
| AC-2 mTLS chain (G-1) | LOCAL-PARTIAL | Chart/profile values, fail-closed negative tests | G-1 "verified in a shared environment" (Platform/SRE + @devops) |
| AC-3 backend→runner TLS + client cert (G-2) | LOCAL | Self-signed CA integration test; `validate()` profile test | — (G-2 is recorded as a release gate in 010) |
| AC-4 dumps + Vault least-privilege + DB canary | LOCAL-PARTIAL | Chart dump lint, `STUDIO_RUNNER_VAULT_ADDRESS` refusal, DB canary; a dev-mode Vault in Docker could check the policy text | "A dev Vault" (ED-02, PUT Core/BFF). GO condition (3) makes Done unreachable while this test is unrun. Whether a local Vault container counts is a PO/QA ruling; I have not ruled it. |
| AC-5 `@Scheduled` profile gates + SIEM | LOCAL-PARTIAL | Context test per profile | SIEM sink (Platform/SRE); "unrun, owner X" is allowed |
| AC-6 observed schedules, G-3, 18 re-enables, R7, R9-OBS-1 | LOCAL | Testcontainers integration tests; Q2 default | Production authorization sources (C-2) only matter for activation, which is out of scope |
| AC-7 D-C real-model benchmark (≥20×3, ≥90 %, zero false-pass/leak, RS-1) | **EXTERNAL** | Corpus manifest, harness, fixture cases | ED-01 gateway owner and access; deployed stack; approved staging app with real login; budget admission (user); real model spend |
| AC-8 guided-schema probe | **EXTERNAL** | Probe test code | ED-01 real gateway |
| AC-9 isolation + mutation oracles | LOCAL-PARTIAL | Isolation/mutation with the fixture provider | Guard refusals "exercised with the real model" (ED-01) |
| AC-10 wire canaries on real traffic + manual C-17 video gate | **EXTERNAL** | Canary scanner on local traffic | Live gateway bytes (ED-01); a named human reviewer (C-17) on the live stack recording |
| AC-11 fault injection (+ ADJ-1, R8.2, R10c, R10-OBS-1/2, P3) | LOCAL-PARTIAL | Co-run faults, ADJ-1 failing probe test, j/k kill path and launch bound, i log; @architect rulings (internal) | Revocation "on the live stack", worker-profile dispatch "on real pods", R8.2 e live reaper check (deployed stack) |
| AC-12 suites + real-browser E2E (+ R10-rev2-2, P4/P5) | LOCAL-PARTIAL | All three suites; test-infra f–j; R10-rev2-2 observation | The E2E learns through a model: local runs only work with the test-profile fixture provider. Testing says "against the deployed stack". |

**Done gate:** GO condition (3) says "Done is unreachable while AC-7's staging half, AC-8 or AC-4's Vault policy test is unrun". So 009 cannot reach Done locally at all.

### (b) 009 / 011 items that do not technically depend on 008

| Item | Technically independent of 008? | Rule or collision that forbids starting now |
|---|---|---|
| 009 AC-1/2/3, AC-4 chart lint, AC-5 profiles, AC-6, AC-11 a/i/j/k, AC-12 f–j | Yes, except AC-7 and the AC-12 E2E, which run "through the real frontend" | 009 Depends on 008. Dependency notes: "Needs the whole single path (007 → … → 015 → 008) Done". README `:47`. Collisions with 015: `GuidedPublicationReplayIT`, `GuidedPlanningIntegrationTest` and `build.gradle.kts` are being edited by 015 now (hash-pinned in the handoff); runner `dist` is on HOLD; all backend Gradle runs are serialized. |
| 009 T0 prep: prerequisite register by owner, @qa corpus-composition draft, budget-admission draft | Yes | Not forbidden as **preparation** (same precedent as 008 prep). Must be written under `docs/qa/evidence/`, **not** `studio-runner/evaluation/` (frozen). The ADJ-1/R10c rulings are explicitly "at OBS-009 time" and come after the ADJ-1 probe, so they are not pre-rulable. |
| 011 AC-5 IT flake, AC-4 b/c/d, AC-2 class A | Partly | 011 GO: "T0 waits for OBS-010's dated Live surface list and starts only after OBS-009 is Done". 011 Dev Notes: the `GuidedSessionService` split "must start from the final shape; no parallel owner", and the 008 backend lane edits that file. AC-4a needs 009 AC-3's one TLS configuration. AC-3 needs the 009 AC-6 outcome. AC-1 is "at HEAD", which means after everything else. |

## STUDIO-OBS-010 — 2 LOCAL / 1 LOCAL-PARTIAL / 3 EXTERNAL

| AC | Class | External part and owner |
|---|---|---|
| AC-1 pilot preparation | **EXTERNAL** | Needs a D-C **pass** (009 AC-7); user authorization to contact participants; participant access, test secrets and approved origins. The script can be drafted locally once 008's copy is frozen. |
| AC-2 pilot execution (≥5 nontechnical users) | **EXTERNAL** | Human participants. Simulated users are not allowed. |
| AC-3 remediation loop | **EXTERNAL** | Driven by pilot findings; any remediation stories are local work. |
| AC-4 release-readiness record | LOCAL-PARTIAL | The record can be written locally with honest rows. Gate states are external: G-1/G-2/G-3, C-2/C-3 (ED-02), OBS-014 compliance approvals, ED-01 owner and retention, D-B confirmation (user/Platform-SRE), F04 / E1–E8 (Platform/SRE), CACHE-REAUTH, AUDIT-LABEL-PRIVACY, SIEM/Q3 and dev-DB recreation (user). |
| AC-5 single-path runbook + Live surface + NTP row | LOCAL | The AC text allows "owed, owner Platform/SRE" for the NTP skew bound. Needs 009's evidence (rotation inputs). |
| AC-6 devops handoff | LOCAL | Handoff document only. Push, PR and deploy need user authorization through @devops. |

**Open PO question, not ruled:** can 010 be Done with a correct record that reads "not ready"? AC-4 says pending items "prevent release readiness". It does not say they prevent the story from being Done. Since AC-1/AC-2 are human-gated anyway, this does not change feasibility.

## STUDIO-OBS-011 — 7 LOCAL / 0 / 0

| AC | Class | Notes |
|---|---|---|
| AC-1 inventory re-run at HEAD | LOCAL | Must run on the final tree. |
| AC-2 class A/B/C leftovers | LOCAL | CLN-10 may be carried forward with @devops as owner, so no production-deploy date is needed. |
| AC-3 `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters | LOCAL | Conditional on the 009 AC-6 outcome. |
| AC-4 folds/splits + R9-OBS-3 DatabaseClock | LOCAL | Needs @architect fold rulings (internal). |
| AC-5 sleep-polled IT flake reduction | LOCAL | A new wait library needs an @architect ruling. |
| AC-6 pins/docs/`.ai/` archive-first | LOCAL | The archive-vs-keep decision is internal (PO). |
| AC-7 behaviour-preserving counts | LOCAL | — |

**Transitive blocker:** 011 needs 009 Done, and 009 Done needs the AC-7/AC-8/AC-4 externals. An all-local story is therefore stuck behind external gates.

**PROPOSAL B (user decision):** change 011's start condition to "009 local ACs (1–6, 11, 12 f–j) complete + 010 Live-surface list written". Alternatively, split 009 into 009 (deployable path, local) and 009-LP (live proof AC-7/8/10 and the deployed-stack halves). This would let 011 and the 010 runbook proceed while procurement runs. Risk: benchmark findings may force code changes after cleanup. AC-4a then needs a re-check against any later TLS change. This needs @sm/@po re-validation; it is not adopted here.

## Totals (34 ACs)

| Story | LOCAL | LOCAL-PARTIAL | EXTERNAL | Can reach Done locally? |
|---|---|---|---|---|
| 008 | 9 | 0 | 0 | Yes, after 015 Done (item-85 decision) |
| 009 | 2 | 7 | 3 | **No** (GO condition 3) |
| 010 | 2 | 1 | 3 | **No** (human pilot) |
| 011 | 7 | 0 | 0 | Yes in substance, but blocked by order on 009 Done unless PROPOSAL B is adopted |

## External blockers that need the user

| # | Blocker | Needed by | Owner |
|---|---|---|---|
| U1 | 015 item 85: approve or reject the proposed acceptance-subject amendment, or accept that 015 stays non-Done | 015 → 008 → everything | User / acceptance-plan owner (after Aria + Quinn) |
| U2 | Name the ED-01 (R2D2) gateway owner and obtain gateway access/credentials | 009 AC-7, 8, 9(part), 10 | User → GA D-3 (TBD) |
| U3 | Approved staging app with real login, approved origins and a provisioned test secret | 009 AC-7(b), 10, 11; 010 AC-1 | User / app owner / Platform-SRE (ED-04) |
| U4 | Deployed stack (shared K8s namespace; no kube context here), internal Playwright image and Node pin | 009 AC-1/2/7/11/12 | Platform/SRE (ED-05) + @devops |
| U5 | Dev Vault, production secret-use and background authorization, Vault enablement | 009 AC-4; 010 C-2/C-3 | PUT Core/BFF (ED-02) |
| U6 | SIEM sink and Q3 audit retention | 009 AC-5; 010 AC-4 | Platform/SRE |
| U7 | Real-model budget admission within USD 500 (spend not measurable); optionally authorize a non-gating Vertex rehearsal with the local GCP credentials | 009 AC-7 | User |
| U8 | Human C-17 masked-video inspection reviewer | 009 AC-10 | User or a named reviewer |
| U9 | ≥5 nontechnical pilot participants, plus authorization to contact them | 010 AC-1–3 | User |
| U10 | Compliance approvals (OBS-014 export/retention, AUDIT-LABEL-PRIVACY), CACHE-REAUTH disposition, F04 / E1–E8 or named-residual acceptance | 010 AC-4 | Security & Compliance, Platform/SRE, @pm |
| U11 | D-B "nothing deployed from an internal remote" confirmation; dev-DB recreation (012A REQ-003); NTP skew bound | 010 AC-4/5 | User / Platform-SRE |
| U12 | Any push, PR, deploy or schedule activation | 010 AC-6 | User → @devops |

## Recommended waves (rule-compliant as written)

| Wave | Runs in parallel | Gate to the next wave |
|---|---|---|
| W0 (now) | 015 remaining validation (serialized, frozen tree) **∥** U1 decision **∥** external procurement U2–U11 (outside the repo) **∥** 009/010 preparation docs under `docs/qa/evidence/` only (prerequisite register, corpus draft, budget-admission draft) | 015 independent QA Done + PO/root closure |
| W1 | 008 C-int first, then {Backend008 ∥ A1 transport ∥ P5 browser harness ∥ B1 reference pure components}, then A2 page integrator; gates serialized | 008 QA Done |
| W2 | 009 lanes: D (AC-1 fold + P2, AC-2/3 TLS, AC-4 lint) → R (AC-11 j/k, same runner files, after D) **∥** S (AC-6 schedules + 18 re-enables) **∥** I (AC-12 f–j); backend Gradle serialized. E lane (AC-7/8/10, the live halves of AC-4/5/11/12) starts when U2–U8 arrive | 009 Done needs U2–U5, U7, U8 |
| W3 | 010 T2 runbook + Live surface → then 011 **∥** 010 T0/T1 pilot (U9) and T3 record (U10, U11) | 010 + 011 QA Done |

The largest schedule lever is external: ED-01, the staging app, ED-02 and the deployed stack. GA plan `:174` says the same: "The critical path is outside the repository". With PROPOSAL B, 011 and the 010 runbook move from W3 to right after the local 009 lanes.
