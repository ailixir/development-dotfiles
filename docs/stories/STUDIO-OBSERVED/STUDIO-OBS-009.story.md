# Story STUDIO-OBS-009 — Deployable single path, real-model benchmark gate and live proof

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-009 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-008 |
| Dependency notes | Needs the whole single path (007 → 012A → 012B/013/014 → 015 → 008) Done: the benchmark and E2E run through the real frontend and API. Deployment items (AC-1…AC-6) are co-executed by @devops; proof items (AC-7…AC-12) by @dev; @qa independently reproduces critical paths. External prerequisites (ED-01 gateway owner, ED-02 Vault/secret-use/background authorization, approved staging application with real login, dev Vault) are named at T0 and never faked. OBS-011 may start once this story is Done (ADR-SC-005). |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md (D-C; defaults "Runner topology"; "Operations"; placement map rows OBS-009 ×2; Verification "D-C"; Supersedes 10.50 re-cut) · docs/specs/studio-observed-authoring/secret-login-design.md R3 §4.6 I-B7/I-C8/I-C9, §7 C-8/C-9/C-10/C-17, §8 Q2 (default) / Q4 (decided), §10 rows OBS-009 · docs/specs/studio-observed-authoring/secret-login-security-review.md conditions 10–11, F-9 · panel 2026-10-09 (QA "not proven" list; architect operational debt; dev worker fold; devops) · docs/epics/UI-STUDIO-GA-PLAN.md §4.B (external gates), §4.H H-1/H-2, §6 ARCH-8/ARCH-9/SEC-4 |
| Size | L |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, security-scan]

## Story

As a Studio user, I want the single observed path deployable as one runner process with every secret-bearing hop TLS-authenticated, and proven against a real model on a real stack with independent outcomes — not green model-generated steps — so that the pilot opens only when the benchmark, the safety hard gates and the fault-injection evidence actually support it.

## Acceptance Criteria

Gates G-1, G-2, G-3 (design I-C8) are **implemented** here and **recorded as release gates** in OBS-010. The pilot (OBS-010) is gated on AC-7 (ADR-SC-005 D-C). A failed or unrun gate stays failed or unrun; an absent external prerequisite makes the dependent AC "unrun, owner X" — never a pass and never a silent skip.

**Deployment (co-executed by @devops)**

1. **AC-1 — One runner process, image and Deployment (ARCH-8 → single topology).** The guided worker becomes a **mode of the main runner**: `guidedMain.ts`'s 33-line bootstrap of `createGuidedServer` is folded into the runner application so one process, one image (`studio-runner/Dockerfile`, today `CMD ["node","dist/main.js"]` only) and one Helm Deployment serve `/v2/runs`, `/v2/validate-observed` and the guided-session bridge on one TLS listener; the guided `capacity` (1 while secret fills are enabled, OBS-007 AC-6) and the governed policy hash (OBS-014) are configuration of that one process; `studio-runner/test/deployment/chart.test.ts` renders the template and keeps asserting rendered env ⊆ accepted keys; the process refuses an unrecognised key. No separate `studio-guided-worker-*` template is created. [ADR-SC-005 defaults "Runner topology"; "Operations"; panel architect operational debt; panel dev "guided worker into main runner"; GA plan §6 ARCH-8]

2. **AC-2 — Guided bridge mTLS chain (SEC-4; gate G-1).** Profiles and chart values supply the pinned RSA key, issuer and truststore that `GuidedInternalSecurity` and the runner's `guided/transport.ts` already require; the chain fails closed when any part is absent (negative test); controller-token audiences stay separate per the OBS-006 runbook; key/issuer/token-rotation inputs are recorded for the OBS-010 runbook. G-1: guided runs that reference a secret are not enabled in any shared environment before this lands and is verified there. [GA plan §6 SEC-4; design §4.6 I-C8; OBS-006 runbook]

3. **AC-3 — Backend → runner hop: TLS with client-certificate authentication (I-C8, C-9; gate G-2; Q4 decided).** The one runner process terminates TLS with client-certificate authentication of the backend on `/v2/runs` and the bridge (today plaintext `node:http` with a static bearer), reusing the guided server's TLS/fingerprint setup so both share one listener and one trust chain; `StudioRunnerProperties.validate()` (relocated by OBS-012A) rejects `http://` outside the `local`/`test` profiles (startup failure test under `prod`/`staging`); an integration test with a self-signed CA proves the runner accepts run submission and bridge traffic only over TLS with a trusted client certificate; `HttpRunnerDispatchClient` presents the client certificate. G-2: no real credential is stored in Vault for any environment until this is verified. [design §4.6 I-C8, §7 C-9, §8 Q4 (decided); ADR-SC-005 defaults "Runner topology"; GA plan §4.D D-2]

4. **AC-4 — Crash-artifact and Vault least-privilege controls (I-B7, I-C9; C-8, C-10; security condition 11).** Chart values disable JVM heap dumps (or make the dump path encrypted and access-controlled) and core dumps (`ulimit -c 0`) for backend worker and runner pods, with a chart lint test asserting the settings are present and disabled. A Vault policy test against a dev Vault proves the backend token reads `studio/{csiId}/{environment}/{testId}/secret/*` only and that write/list outside are denied; a runner container started with `STUDIO_RUNNER_VAULT_ADDRESS` fails startup; a DB-wide canary scan after a full run returns zero hits. Operator-triggered dumps and KV v2 version history are stated residuals. [design §4.6 I-B7, I-C9, §7 C-8, C-10; security condition 11]

5. **AC-5 — `@Scheduled` guided beans profile-gated; SIEM sink.** `GuidedSessionReaper` and `GuidedTranslationCoordinator` (`@Scheduled`, no profile today — verified) run only on the profile the architecture assigns (the worker/scheduler role), not on every API replica; a context test per profile proves presence/absence. The structured audit events OBS-014 emits are routed to the platform SIEM sink via chart values (sink availability is external; if absent, recorded as "unrun, owner Platform/SRE"). [ADR-SC-005 "Operations" (`@Scheduled` guided beans profile-gated); panel dev; OBS-014 AC-10]

6. **AC-6 — Observed schedules (ARCH-9; gate G-3).** Observed scheduled runs are lifted through the existing background authorization with per-run secret resolution (design §8 Q2 default — see Decisions pending); `OBSERVED_SCHEDULE_AUTH_REQUIRED` is no longer emitted for observed revisions when background authority exists (emitters removed by OBS-011); `ACTIVATION_REVISION_MISMATCH` and activation semantics are preserved. G-3 is enforced: a scheduled dispatch of a secret-referencing revision is refused outside the `local`/`test` profiles until a production `StudioBackgroundAuthorization` and `StudioSecretUseAuthorization` source exist (GA C-2, external). Schedule activation in shared environments (GA plan E-1/E-2) stays tracked in the GA plan, not closed here. [design §10 ARCH-9 row, §8 Q2, §4.6 I-C8 G-3; security review F-9, condition 10]

**Live proof (@dev; @qa reproduces)**

7. **AC-7 — Real-model benchmark gate (ADR-SC-005 D-C) — pilot gate.** Before any human pilot, on the deployed stack with pinned model/prompt/runtime versions and budget admission against the USD 500 wave ceiling recorded before the first real-provider call: a corpus of **≥ 20 workflows** — the 13 compile benchmark cases ported from `docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/`, the login workflow (OBS-007 fixture **and** one approved staging application with real login), multi-step dataflow, the two incremental cases from OBS-015 (edit step 4 of 10; insert a step), and enterprise-pattern cases the panel found untested (SSO on an approved origin, shadow DOM, iframe, virtualised list — composition fixed by @qa at T0) — each run **3 times** with the real model. Gate: **≥ 90 %** end-to-end completion without clarification on unambiguous cases; **zero false passes and zero secret/PII leaks are hard gates**; the incremental cases prove exactly k…n re-learned and zero model calls for 1…k-1; p50/p95 latency, model calls, tokens and configured-provider cost per run published with denominators in `docs/qa/evidence/studio-observed-authoring/benchmark.json` + report. One token-free guided Run submits once; finalization adds zero receipts; two later runs reuse the artifact. Replay stability: ≥ 98 % completion over 100 stable-fixture replays with identical artifact hash. No real-model evidence exists today (`GuidedProviderEvaluationTest` skips `UNAVAILABLE_NOT_RUN`); no unreported retries or skipped failures. [ADR-SC-005 D-C; Verification "D-C"; panel QA "not proven"; GA plan §4.B ED-01]

8. **AC-8 — Guided-schema R2D2 probe (ex-10.50).** Under ED-01, a structured-output probe of the real gateway with the guided provider projections (SOURCE_PLAN / NEXT_ACTION / VERIFY_STEP) proves the configured provider accepts the guided schemas before AC-7 runs; a rejection is a named blocker, not a fallback. [ADR-SC-005 Supersedes "Story 10.50 … re-cut as a guided-schema structured-output probe … in OBS-009"]

9. **AC-9 — Isolation and mutation oracles.** Overlapping runs and differing CSIs/principals exchange zero data or observations (two concurrent sessions with the same secret ID under CSI A/B each see their own value); injected wrong targets, reversed assertions, dropped submit and literal substitution are each rejected by the independent outcome oracle; the OBS-014 guards (grounding, destructive verb, side-effect stance) are exercised with the real model and their refusals counted. [design §7 "isolation"; consensus plan §11 "Isolation", "Semantic correctness"; OBS-014]

10. **AC-10 — Wire canaries on real traffic; manual video gate.** Actual gateway bytes and all text outputs (diagnostics, raw output, manifests, journals, callbacks, SSE, audit events) are scanned for sensitive canaries and for the OBS-007 secret canary on the live stack; the deliberately authored nonsecret positive canary is present (INPUT-POLICY-01 A). The "masked dots only" inspection of a login recording — first Run (OBS-013) and replay — is performed by a human and recorded as a manual gate with reviewer, build and recording identified (C-17). [design §7 C-17, F-10; consensus plan §11 "Data boundary"]

11. **AC-11 — Fault injection and recovery.** Duplicate requests, acknowledgment loss, process restart, stale owner, late callbacks, **public-HTTP mid-step cancel of a live guided browser** (panel QA: untested) and **runner kill mid-run** in the co-run (GA H-1) produce zero repeated dispatches; unknown actions stop as `UNKNOWN_OUTCOME`; no incorrectly published ready plan; mid-run secret revocation on the live stack cancels within one real control poll with nothing typed and an audit `REVOKED_MID_RUN` row (OBS-007 AC-13 under real polling); worker-profile dispatch of an observed execution on the deployed stack is proven (OBS-007 AC-16 on real pods). [consensus plan §11 "Recovery"; GA plan §4.H H-1; panel QA; design I-A3]

12. **AC-12 — Regression suites and real-browser E2E.** Backend, runner (default, fixtures, deployment tiers) and frontend regression suites run on the final tree; a real-browser E2E through the real frontend and API (author → Run → login steps → clarification → protected page → finalize → edit step → incremental Run → replay → video seek to a step and an action) extends OBS-008's Playwright config (GA H-2); recordings play and seek as inspected. [consensus plan §11 "UI evidence"; GA plan §4.H H-2]

## Tasks / Subtasks

- [ ] **T0 — Readiness and prerequisites.** Confirm OBS-008 Done; name by owner: ED-01 gateway owner (TBD per GA plan D-3), ED-02 Vault/secret-use/background authorization, the approved staging application with real login and its approved origins, a provisioned test secret, a dev Vault, the SIEM sink; @qa fixes the corpus composition; record budget admission and pinned versions before any real-provider run.
- [ ] **T1 — One runner (AC-1, AC-2) — @devops with @dev.** Fold guided mode into the runner application; Dockerfile/Helm/values; mounted config → chart values; mTLS chain values; fail-closed tests; chart render tests.
- [ ] **T2 — Transport, dumps, Vault, profiles (AC-3, AC-4, AC-5) — @devops with @dev.** TLS termination + client cert; `validate()` profile rule; self-signed-CA IT; dump settings + lint; Vault policy test; `STUDIO_RUNNER_VAULT_ADDRESS` refusal; DB canary; profile gates for the `@Scheduled` beans; SIEM routing.
- [ ] **T3 — Observed schedules and G-3 (AC-6) — @dev.** Lift through background authorization; G-3 refusal outside local/test; scheduler tests through `StudioScheduleProcessor`.
- [ ] **T4 — Probe and benchmark (AC-7, AC-8) — @dev.** Guided-schema probe; corpus manifest; 3 repetitions; 100-replay stability; report with denominators.
- [ ] **T5 — Oracles, canaries, faults, E2E (AC-9…AC-12) — @dev.** Isolation/mutation; wire canaries; manual video gate record; fault injection incl. mid-step cancel and runner kill; worker-profile dispatch; full suites; real-browser E2E.
- [ ] **T6 — Record and submit.** Evidence files with denominators and pinned identities; File List; independent @qa reproduces critical paths; only QA can set Done.

## Dev Notes

### What is true today (verified 2026-10-09)

`studio-runner/Dockerfile:59` ships `dist/main.js` only; `run/guidedMain.ts` is a 33-line bootstrap reading `STUDIO_GUIDED_CONFIG_FILE`; Helm has `studio-runner-{deployment,networkpolicy,scaledobject,service}.yaml` and no guided template. mTLS + RS256 exist in code (`GuidedInternalSecurity.java`, `guided/transport.ts`) but no profile or chart supplies key, issuer or truststore. Runner `server/server.ts` is plaintext `node:http`; `StudioRunnerProperties.validate()` accepts `http://`. `GuidedSessionReaper` and `GuidedTranslationCoordinator` are `@Scheduled` without a profile. `ConfiguredBackgroundAuthorization` grants only under `local`/`test`; secret-use authorization has only the dev-config source (GA C-2). No heap/core-dump settings in repo. Evaluation harness `studio-runner/evaluation/{cli,fixture-server,oracle,report,lifecycle}.mjs`, co-run `tools/corun.sh`/`corun-report.mjs` exist — extend, do not fork. `GuidedProviderEvaluationTest.java:58-84` skips when no provider env is set.

### Decisions pending (written to the stated default)

| Question | Default applied here | ACs that change if decided otherwise |
|---|---|---|
| **Q2 — Scheduled observed runs fill secrets with no live user (ARCH-9).** | Adopt parity with the existing scheduler via `ConfiguredBackgroundAuthorization` (design §8 Q2); G-3 holds regardless. | AC-6 becomes "observed schedules stay refused by design; emitters remain (OBS-011 keeps them); G-3 still recorded". |
| Corpus composition beyond the ADR's named cases (enterprise patterns). | Included as named cases fixed by @qa at T0 (panel QA gap). | AC-7 corpus list only; the ≥ 20 × 3 and 90 %/hard gates are the ADR's and do not change. |

Q4 (runner-terminated TLS + client certificate) is **decided** (ADR-SC-005 default; design §8).

### Thresholds and honesty rules

The gate is the ADR's (≥ 20 × 3, ≥ 90 %, zero false-pass, zero leak, latency/cost published with denominators). Do not promise latency or cost targets from unmeasured data; sample-based results do not prove arbitrary-site correctness; an absent staging application or gateway owner leaves AC-7(b)/AC-8 "unrun, owner X". The pilot cannot open on an unrun gate.

### Out of scope / tracked in the GA plan

Human pilot, runbook text and the release record (OBS-010); production `StudioSecretUseAuthorization`/`StudioBackgroundAuthorization` sources and Vault provider enablement (GA C-2/C-3, ED-02 — external); schedule activation in shared environments and the production schedule policy (GA plan §4.E E-1/E-2, SCHED-003); Sonic evidence store lifecycle (GA §4.F F-1, ED-03); CSRF (GA §4.D D-1); alerts/dashboards/SLOs, rollback rehearsal, capacity/KEDA, startupProbe (GA §4.G G-1…G-5 — the chart values this story adds are the inputs, operability itself is tracked there); Citi repo/CI/image pipeline (GA §4.A); `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitter removal and code-health refactors (OBS-011).

### Sequencing with neighbours

Backend scheduling/authorization files edited by OBS-007 are edited again here (AC-6) — after OBS-007. `frontend/e2e/` and `playwright.config.ts` are created by OBS-008 and extended here. OBS-011 starts after this story is Done and must not remove anything on OBS-010's "Live surface" list.

### Repository conventions

Deployment via `helm-chart/put-checks/`; runner config keys are an allowlist (`server/config.ts` `KEY_SPECS`); backend profiles `application-{api,worker,prod,staging,dev,local,test}.yml`; all backend Gradle runs serialized; never mark an unavailable service, model call, staging application or production image as passed; record skips and unavailable services by name.

### PO validation — 2026-10-09 (0.2.x dual-path draft) — SUPERSEDED by the ADR-SC-005 re-cut; historical

> Verdict then: **GO 8/10 — Draft → Ready**, report `.ai/STUDIO-OBS-009-po-validation-r2.json`. Carried forward as recommendations: (1) every external prerequisite named by owner at T0 — absent ⇒ "unrun, owner X"; (2) "release checklist asserts G-1/G-2" means OBS-010's record plus `release-checklist.md` run by @devops, not an edit to the L2 checklist; (3) budget admission recorded before the first real-provider call; (4) Done unreachable while AC-7(b) or the Vault policy test is unrun. Its benchmark cut (fixture + staging × 3; 30-workflow corpus deferred) is **replaced** by the ADR D-C gate (≥ 20 × 3, ≥ 90 %).

## Testing

Deployment tier: `studio-runner/test/deployment/*` (chart render, env keys, TLS/dump lint); backend startup/profile tests for `validate()`, G-3 refusal and `@Scheduled` profile gates; self-signed-CA IT for the TLS hop; Vault policy test against a dev Vault (skip honestly if unavailable, named); evaluation harness runs with the corpus manifest; co-run via `tools/corun.sh`; full backend/runner/frontend suites; Playwright E2E against the deployed stack. @qa independently reproduces: one guided run with zero finalize receipts, one incremental run, two replays, the revocation case, the mid-step cancel, the runner-kill case and the canary sweep.

## CodeRabbit Integration

### Story Type Analysis

Primary: Deployment/Infrastructure. Secondary: Security, Integration. Complexity: high.

### Specialized Agents

@dev owns execution; @devops co-executes AC-1…AC-5 (image, chart, TLS, policy, profiles); @architect provides the technical gate; independent @qa fixes the corpus, reproduces critical paths and owns the SDC verdict and Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Pre-deployment review by @devops before any shared-environment rollout; G-1/G-2/G-3 asserted.

### Self-Healing and Focus Areas

QA full review: three iterations, 30 minutes. Focus: TLS on every secret-bearing hop, fail-closed defaults, one process/one trust chain, honest evidence with denominators, hard gates at zero. Record an unavailable CodeRabbit tool and use the configured independent review fallback.

## File List

Proposed ownership; root reconciles before dispatch.

- `studio-runner/Dockerfile`, `studio-runner/src/main.ts`, `src/server/{application,server,config,identity,routes}.ts` (guided mode folded; TLS termination; client-cert auth; config keys), `src/run/guidedMain.ts` (del after fold), `src/guided/transport.ts` (one listener)
- `helm-chart/put-checks/templates/studio-runner-deployment.yaml`, `studio-runner-service.yaml`, `studio-runner-networkpolicy.yaml`, `deployment.yaml`, `configmap.yaml`; `values.yaml`, `values-dev.yaml`, `values-uat.yaml`, `values-prod.yaml` (guided mode, capacity, mTLS chain, TLS, dump controls, SIEM sink, profiles)
- `studio-runner/test/deployment/chart.test.ts`, `backend-env.test.ts`, `envfrom-keys.test.ts`, `dump-settings.test.ts` (new), `tls-client-cert.test.ts` (new), `helm.ts`, `image.ts`; `studio-runner/test/server/guidedMode.test.ts` (new)
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioRunnerProperties.java` (profile rule), `HttpRunnerDispatchClient.java` (client certificate)
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java`, `StudioScheduledDispatchAuthorization.java`, `StudioScheduleService.java`; `guided/publication/ObservedReplayAuthorization.java` (background path), `ObservedReplayRuntimeConfiguration.java`; `readiness/ExecutionReadinessService.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionReaper.java`, `guided/translation/GuidedTranslationCoordinator.java` (profile gates)
- `backend/src/main/resources/application-prod.yml`, `application-staging.yml`, `application-worker.yml`, `application-api.yml`, `application.yml`
- `backend/src/test/java/com/citi/put/checks/studio/dispatch/StudioRunnerPropertiesProfileTest.java` (new), `RunnerTlsClientCertIT.java` (new), `scheduling/ObservedScheduleAuthorityIT.java` (new), `secrets/VaultPolicyIT.java` (new), `guided/GuidedScheduledBeansProfileTest.java` (new), `guided/translation/GuidedProviderEvaluationTest.java` (real-provider run under ED-01), `guided/translation/GuidedSchemaProbeIT.java` (new; AC-8)
- `studio-runner/evaluation/observed-authoring/manifest.json` (new; corpus incl. OBS-015 cases), `fixture-server.mjs`, `evaluate.mjs` (new, extend the harness), `studio-runner/evaluation/README.md`; `studio-runner/test/evaluation/*.test.ts`
- `tools/corun.sh`, `tools/corun-report.mjs`
- `frontend/e2e/studio-observed-authoring.spec.ts` (new), `frontend/playwright.config.ts`
- `docs/qa/evidence/studio-observed-authoring/{benchmark.json, benchmark-report.md, replay-stability.json, isolation-mutation.json, fault-injection.json, wire-canaries.json, video-masking-inspection.md, vault-policy.json, budget-admission.json, schema-probe.json, prerequisites.md}` (new)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md`

Not owned here: runbook text and release record (OBS-010), `docs/specs/**` contracts, frontend guided components (OBS-008), emitter removal and refactors (OBS-011).

## PO Validation (2026-10-10) — single path (0.3.x)

**Verdict: GO (8/10, conditional) — Status: Draft → Ready.** Report `.ai/STUDIO-OBS-009-po-validation-sp.json`. Validated by Pax (@po) against ADR-SC-005 D-C, defaults "Runner topology", "Operations", placement map rows OBS-009 ×2, Verification "D-C" and the 10.50 re-cut. The 0.2.1 verdict stays superseded history.

**D-C fidelity:** AC-7 is the ADR gate verbatim — ≥ 20 workflows × 3 real-model repetitions on the deployed stack with pinned versions; ≥ 90 % completion without clarification on unambiguous cases; **zero false passes and zero secret/PII leaks as hard gates**; p50/p95 latency, model calls, tokens and cost published with denominators; the two OBS-015 incremental cases prove k…n re-learned and zero model calls for 1…k-1. Replay stability (≥ 98 % over 100) is consensus §11 `:234`; its 30-workflow corpus is superseded by D-C's ≥ 20. External prerequisites are named at T0 (ED-01 gateway owner TBD, ED-02 Vault/secret-use/background authorization, approved staging application with real login, dev Vault, SIEM sink) with the rule "absent ⇒ unrun, owner X — never a pass".

**10-point checklist:** 1–10 PASS. Executor `dev` with @devops co-executing AC-1…AC-6 is stated; dispatch must honor it (deduction, as in r2).

**Anchors spot-checked at HEAD (working tree 2026-10-10):** `studio-runner/Dockerfile:59` `CMD ["node", "dist/main.js"]` is the only CMD; `run/guidedMain.ts` is 33 lines and calls `createGuidedServer` (`:4,:23`); Helm has `studio-runner-{deployment,networkpolicy,scaledobject,service}.yaml` and no guided template; `server/server.ts:17` `node:http`; `StudioRunnerProperties.java` is still under `compile/validator/` (012A relocates); `GuidedSessionReaper`/`GuidedTranslationCoordinator` each `@Scheduled` ×1, `@Profile` ×0; `ConfiguredBackgroundAuthorization.java:9,23,37` local-only; `GuidedProviderEvaluationTest.java:79` `UNAVAILABLE_NOT_RUN`; `benchmark/results.jsonl` holds exactly C01–C13 (13 cases); `tools/corun.sh`, `corun-report.mjs`, `evaluation/{cli,fixture-server,oracle}.mjs`, `test/deployment/{chart,backend-env,envfrom-keys}.test.ts` exist; `server/config.ts:173` `KEY_SPECS`; `GuidedInternalSecurity`, `HttpRunnerDispatchClient`, `StudioScheduledDispatchAuthorization`, `StudioBackgroundAuthorization`, `StudioSecretUseAuthorization` exist; no heap/core-dump setting anywhere in Dockerfile/Gradle/profiles/chart; security review conditions 10–11 at `:60-61`.

**Should-fix (non-blocking):** EXT — T0 records every external prerequisite by name and owner (carried); EXEC — coordinator dispatches @devops for T1/T2 (carried); AC-5 names the SIEM sink owner (Platform/SRE) when absent.

**GO conditions:** (1) externals recorded at T0 before any live-proof task; (2) budget admission against the USD 500 wave ceiling recorded before the first real-provider call; (3) Done is unreachable while AC-7's staging half, AC-8 or AC-4's Vault policy test is unrun — no fake pass, the pilot (OBS-010) cannot open on an unrun gate; (4) Q2 default stands unless the user overrides before T3 (then @sm applies the AC-6 delta and @po revalidates AC-6 only); (5) @devops co-executes T1/T2; (6) only independent @qa sets Done.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-09 | 0.2.0 | **Rescoped** after the 2026-10-09 decision: deployment hardening (ARCH-8, SEC-4/G-1, legacy-hop TLS/G-2, dumps, Vault policy, ARCH-9/G-3); benchmark cut to the pilot scope; manual video gate; Q2/Q4; 10 ACs; Status Draft | @sm (River) |
| 2026-10-09 | 0.2.1 | Validated GO (8/10) — Status: Draft → Ready (dual-path draft). Report `.ai/STUDIO-OBS-009-po-validation-r2.json` | @po |
| 2026-10-09 | 0.3.0 | **Re-cut to the single path (ADR-SC-005).** One runner process/image/Deployment with guided as a mode (no separate worker template); the "legacy hop" becomes the one backend→runner TLS hop with client certificate (Q4 decided); `@Scheduled` guided beans profile-gated; SIEM routing for OBS-014 events; benchmark replaced by the ADR D-C pilot gate (≥ 20 workflows × 3 real-model reps incl. 13 ported compile cases, login on fixture + staging, dataflow, two incremental cases, enterprise patterns; ≥ 90 %; zero false-pass/leak hard gates; latency/cost with denominators); guided-schema R2D2 probe (ex-10.50); public mid-step cancel, runner kill and worker-profile dispatch on the deployed stack; E2E includes the incremental Run; GA path-independent items listed as tracked in the GA plan; 12 ACs. Prior PO GO (0.2.1) marked superseded and kept as history. Status **Ready → Draft**, pending @po re-validation | @sm (River) |
| 2026-10-10 | 0.3.1 | Validated GO (8/10, conditional) — Status: Draft → Ready (single-path draft). Report `.ai/STUDIO-OBS-009-po-validation-sp.json` | @po |
