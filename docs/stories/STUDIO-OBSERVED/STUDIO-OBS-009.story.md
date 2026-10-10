# Story STUDIO-OBS-009 — Live proof, deployment hardening and regression gates

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-009 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-008 (first guided UI; OBS-007 contracts and secret path transitively) |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md §11 · secret-login-design.md §4.6 (I-B7, I-C8, I-C9), §7 (C-8, C-9, C-10, C-17 manual gate), §8 Q2, §10 · secret-login-security-review.md conditions 10–11, F-9 · UI-STUDIO-GA-PLAN.md §4.D D-2, §4.H H-1/H-2, §6 (ARCH-8, ARCH-9, SEC-4), §7 knock-on |
| Size | L |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, security-scan]

## Story

As a Studio user, I want the complete guided and secret-login experience proven on a deployable stack with independent outcomes — not green model-generated steps — and the transport, deployment and schedule controls that compliance requires in place, so that the approved plain-language experience is ready for a human pilot with verifiable execution evidence.

## Acceptance Criteria

Deployment items (AC-1…AC-5) are co-executed by @devops; proof items (AC-6…AC-10) by @dev; @qa independently reproduces critical paths. Gates G-1, G-2 and G-3 (design I-C8) are **implemented** here and **recorded as release gates** in OBS-010.

1. **AC-1 — Deployable guided worker (ARCH-8).** The runner image gains a command for the guided worker entrypoint (`dist/run/guidedMain.js`, today only `dist/main.js`), and the Helm chart gains a guided-worker template with the mounted config file (`STUDIO_GUIDED_CONFIG_FILE`), probes, NetworkPolicy and a `capacity` of 1 while secret fills are enabled (OBS-007 AC-6). `studio-runner/test/deployment/chart.test.ts` renders the new template and keeps asserting rendered env ⊆ accepted keys; the worker refuses to start with an unrecognised key. [GA plan §6 ARCH-8; design §10]

2. **AC-2 — Guided bridge mTLS chain (SEC-4; gate G-1).** Profiles and chart values supply the pinned RSA key, issuer and truststore that `GuidedInternalSecurity` and the runner's `guided/transport.ts` already require; the chain fails closed when any part is absent (negative test); controller-token audiences stay separate per the OBS-006 runbook; token-rotation inputs are recorded for the OBS-010 runbook. G-1: guided runs that reference a secret are not enabled in any shared environment before this lands and is verified there. [GA plan §6 SEC-4; design §4.6 I-C8; OBS-006 runbook]

3. **AC-3 — Legacy/replay hop TLS with authenticated peer (I-C8, C-9; gate G-2).** The backend → runner hop (`/v1/runs`, `/v2/runs`, today plaintext `node:http` with a static bearer) terminates TLS at the runner with client-certificate authentication of the backend, reusing the guided server's TLS/fingerprint setup (default, see "Decisions pending" Q4); `StudioRunnerProperties.validate()` rejects `http://` outside the `local`/`test` profiles (startup failure test under `prod`/`staging`); an integration test with a self-signed CA proves the runner accepts run submission only over TLS with a trusted client certificate; the release checklist asserts G-1/G-2. G-2: no real credential is stored in Vault for any environment until every secret-bearing hop is TLS-authenticated. [design §4.6 I-C8, §7 C-9; GA plan §4.D D-2]

4. **AC-4 — Crash-artifact and Vault least-privilege controls (I-B7, I-C9; C-8, C-10; security condition 11).** Chart values disable JVM heap dumps (or make the dump path encrypted and access-controlled) and core dumps (`ulimit -c 0`) for backend worker and runner pods, with a chart lint test asserting the settings are present and disabled. A Vault policy test against a dev Vault proves the backend token reads `studio/{csiId}/{environment}/{testId}/secret/*` only and that write/list outside are denied; a runner container started with `STUDIO_RUNNER_VAULT_ADDRESS` fails startup; a DB-wide canary scan after a full run returns zero hits. Operator-triggered dumps and KV v2 version history are stated residuals. [design §4.6 I-B7, I-C9, §7 C-8, C-10; security condition 11]

5. **AC-5 — Observed schedules (ARCH-9; gate G-3).** Observed scheduled runs are lifted through the existing legacy background authorization with per-run secret resolution (OBS-007's worker-side beans) — exact parity with legacy schedules (design §8 Q2 default, see "Decisions pending"); `OBSERVED_SCHEDULE_AUTH_REQUIRED` is no longer emitted for observed revisions when background authority exists (its emitters are removed by OBS-011); `ACTIVATION_REVISION_MISMATCH` and existing activation semantics are preserved. G-3 is enforced, not just documented: a scheduled dispatch of a secret-referencing revision is refused outside the `local`/`test` profiles until a production `StudioBackgroundAuthorization` and `StudioSecretUseAuthorization` source exist (both remain GA item C-2, external). [design §10 ARCH-9 row, §8 Q2, §4.6 I-C8 G-3; security review F-9, condition 10]

6. **AC-6 — Real-model live proof.** On the deployed stack, with pinned model/prompt/runtime versions and budget admission against the USD 500 wave ceiling recorded before any real-provider call: (a) the supported login workflow on the controlled fixture and (b) one approved staging application with real login, each run 3 times (consensus §11 repetition count). One token-free guided Run submits once; exact-plan finalization adds zero receipts; two later deliberate runs use the same artifact and new session-bound receipts. Report denominators, completion without clarification, clarification rate, p50/p95 latency, model calls, tokens and configured-provider cost per run. Hard gates: zero false passes, unauthorized actions, duplicate dispatches or canary leaks. The ≥ 30 held-out workflow corpus and its ≥ 90% threshold are **not** claimed — recorded as deferred per GA plan §7 (benchmark cut to the pilot scope). Replay stability is model-free: ≥ 98% completion over 100 stable-fixture replays with identical artifact hash. No unreported retries or skipped failures. [consensus §11; GA plan §7 knock-on; design §10]

7. **AC-7 — Isolation and mutation.** Overlapping runs and differing CSIs/principals exchange zero data or observations (two concurrent sessions with the same secret ID under CSI A/B each see their own value — design §7 "isolation"). Injected wrong targets, reversed assertions, dropped submit and literal substitution are each rejected by the independent outcome oracle; no acceptance on model consistency alone. [consensus §11 "Isolation", "Semantic correctness"]

8. **AC-8 — Wire canaries on real traffic; video gate.** Actual gateway bytes and all text outputs (diagnostics, raw output, manifests, journals, callbacks, SSE) are scanned for sensitive canaries — password accessible names, input values, visible echoes, DOM fallback, Unicode/truncation, faults, prompt injection — and for the OBS-007 secret canary on the live stack; the deliberately authored nonsecret positive canary is present when needed (INPUT-POLICY-01 A). Video remains a disclosed separate channel; the "masked dots only" inspection of a login recording is performed by a human and recorded as a manual gate with the reviewer, build and recording identified (design C-17; F-10). [consensus §11 "Data boundary", "Prompt injection"; design §7 C-17]

9. **AC-9 — Fault injection and recovery.** Duplicate requests, acknowledgment loss, process restart, stale owner, cancellation, late callbacks and runner kill mid-run in the co-run (GA H-1) produce zero repeated dispatches; unknown actions stop as `UNKNOWN_OUTCOME`; no incorrectly published ready plan. Mid-run secret revocation on the live stack cancels within one real control poll with nothing typed and an audit `REVOKED_MID_RUN` row (OBS-007 AC-13 under real polling). [consensus §11 "Recovery", "Publication"; GA plan §4.H H-1; design I-A3]

10. **AC-10 — Regression suites and UI evidence.** Backend, runner (default, fixtures, deployment tiers) and frontend regression suites run on the final tree; a real-browser E2E through the real frontend and API (author → Run → login steps → protected page → finalize → replay → video seek to source and consumer steps) extends the Playwright config created by OBS-008 (GA H-2); recordings play and seek as inspected. A failed or unrun gate stays failed or unrun; no speculative Done. [consensus §11 "UI evidence"; GA plan §4.H H-2]

## Tasks / Subtasks

- [ ] **T0 — Readiness check.** Confirm OBS-007 and OBS-008 are Done; confirm the approved staging application, its approved origins and a provisioned test secret exist (external prerequisites; name the owner if absent); record budget admission and pinned versions before any real-provider run (AC-6).
- [ ] **T1 — Packaging and chains (AC-1, AC-2) — @devops with @dev.** Dockerfile command, guided-worker Helm template + values, mounted config, mTLS/key/issuer/truststore values, negative fail-closed tests, chart render tests.
- [ ] **T2 — Legacy hop TLS and least-privilege (AC-3, AC-4) — @devops with @dev.** Runner TLS termination with client-cert auth; `validate()` profile rule; self-signed-CA integration test; heap/core-dump values + lint; Vault policy test; `STUDIO_RUNNER_VAULT_ADDRESS` refusal; DB canary scan.
- [ ] **T3 — Observed schedules and G-3 (AC-5) — @dev.** Lift observed schedules through background authorization with per-run secret resolution; G-3 refusal outside local/test; activation semantics preserved; scheduler tests through the actual `StudioScheduleProcessor`.
- [ ] **T4 — Live proof (AC-6, AC-7, AC-8) — @dev.** Evaluation manifest and oracles for fixture + staging workflow; 3 repetitions; 100-replay stability; isolation/mutation injection; wire canaries; manual video gate record.
- [ ] **T5 — Fault injection and regressions (AC-9, AC-10) — @dev.** Co-run with runner kill, revocation under real polling, late callbacks; full suites; real-browser E2E; video seek inspection.
- [ ] **T6 — Record and submit.** Evidence files with denominators and pinned identities; File List; independent @qa reproduces critical paths; only QA can set Done.

## Dev Notes

### What is true today (verified 2026-10-09 via design §1/§4.6 and GA plan)

- Guided worker: `studio-runner/Dockerfile` ships only `dist/main.js`; `run/guidedMain.ts` needs `STUDIO_GUIDED_CONFIG_FILE`; no Helm template (ARCH-8). Chart: `helm-chart/put-checks/templates/studio-runner-*.yaml`, `values*.yaml`; `test/deployment/chart.test.ts:390-396` enforces rendered ⊆ accepted keys (inventory M13).
- Guided bridge: mTLS + RS256 exist in code (`GuidedInternalSecurity.java`, `guided/transport.ts`) but no profile or chart supplies key, issuer or truststore (SEC-4); fails closed today.
- Legacy hop: `StudioRunnerProperties.validate()` (`backend/.../studio/compile/validator/StudioRunnerProperties.java`) accepts `http://`; runner `server/server.ts` is plaintext `node:http` with a static bearer; only NetworkPolicy compensates (GA D-2).
- Background authorization: `ConfiguredBackgroundAuthorization` grants only under `local`/`test`; secret-use authorization has only the dev-config source (GA C-2, external) — hence G-3.
- No heap/core-dump settings exist in repo (`Dockerfile`, `build.gradle.kts`, `application*.yml`); backend image and charts live outside this repository except `helm-chart/put-checks/`.
- Evaluation harness exists: `studio-runner/evaluation/{cli.mjs, fixture-server.mjs, oracle.mjs, report.mjs, lifecycle.mjs, example-manifest.json}` with tests under `studio-runner/test/evaluation/`; co-run harness `tools/corun.sh`, `tools/corun-report.mjs`. Reuse them; the prior draft's `evaluation/observed-authoring/*` paths are extensions of this harness, not a parallel one.
- `frontend/test:e2e` has no Playwright config until OBS-008 creates it.

### Controlled fixture and oracles carried from OBS-007

OBS-007 proves SEC-1…SEC-10, §5, C-1…C-7, C-11…C-20 on a local stack with a fake Vault. This story re-runs the secret canary and the revocation case on the **deployed** stack with real control polling, and adds C-8 (chart lint), C-9 (TLS), C-10 (Vault policy) and the manual C-17 video gate. Do not re-implement OBS-007's fixture; extend it with the staging target.

### Decisions pending (written to the stated default; the user may decide otherwise)

| Question | Default applied here | ACs that change if decided otherwise |
|---|---|---|
| **Q2 — Scheduled observed runs fill secrets with no live user (ARCH-9).** Parity with legacy schedules via `ConfiguredBackgroundAuthorization`. | Adopt (design §8 Q2; GA plan §6 points this way). G-3 holds regardless. | AC-5 becomes "observed schedules stay refused by design; `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters remain (OBS-011 keeps them); G-3 still recorded". |
| **Q4 — Legacy/replay hop TLS: runner-terminated TLS with client certificates vs a platform mTLS mesh.** Not listed in design §8; it is the "or" inside I-C8. | Runner-terminated TLS with client-certificate authentication of the backend (reuse of the guided server's TLS/fingerprint setup). | AC-3 becomes: mesh provides TLS and peer identity with documented identity evidence; `validate()` still rejects `http://` outside local/test; the self-signed-CA integration test is replaced by mesh identity evidence in the release checklist. |

### Thresholds and honesty rules

Consensus §11 thresholds (≥ 90% unambiguous completion over ≥ 30 held-out workflows × 3; 100% safe handling of planted ambiguity; ≥ 98% over 100 replays; zero hard-gate violations) were proposed "to approve before running the benchmark". GA plan §7 cuts the 30-workflow corpus to the pilot scope; this story therefore reports the fixture + staging workflow at 3 repetitions and the 100-replay stability run, and states the corpus/90% gate as deferred. Do not promise latency or cost targets from unmeasured data; report measured p50/p95, calls, tokens and cost with denominators. Sample-based results do not prove arbitrary-site correctness.

### Out of scope here

Human pilot and release-readiness consolidation (OBS-010); runbook text (OBS-010); production `StudioSecretUseAuthorization`/`StudioBackgroundAuthorization` sources and Vault provider enablement (GA C-2, C-3 — external); v1 retirement and `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitter removal (OBS-011); Citi repo/CI/image pipeline (GA §4.A, separate stories).

### Sequencing with neighbours

Depends on OBS-008 Done. Backend scheduling/authorization files edited by OBS-007 are edited again here (AC-5) — strictly after OBS-007. `frontend/e2e/` and `playwright.config.ts` are created by OBS-008 and extended here. OBS-011 may start once this story is Done (design §10 order note) but must not remove anything OBS-010's runbook documents as live.

### Repository conventions

Deployment via `helm-chart/put-checks/`; runner config keys are an allowlist (`studio-runner/src/server/config.ts` `KEY_SPECS`); backend profiles `application-{api,worker,prod,staging,dev,local,test}.yml`. All backend Gradle runs on this checkout are serialized. Never mark an unavailable service, model call, staging application or production image as passed; record skips and unavailable services by name.

## Testing

Deployment tier: `studio-runner/test/deployment/*` (chart render, env keys, new TLS/dump lint tests); backend startup/profile tests for `validate()` and G-3 refusal; integration test with a self-signed CA for the runner TLS hop; Vault policy test against a dev Vault (skip honestly if unavailable, named); evaluation harness runs with manifests under `studio-runner/evaluation/`; co-run via `tools/corun.sh`; full backend/runner/frontend suites; Playwright E2E against the deployed stack. QA independently reproduces: one guided run with zero finalize receipts, two replays, the revocation case, the runner-kill case and the canary sweep.

## CodeRabbit Integration

### Story Type Analysis

Primary: Deployment/Infrastructure. Secondary: Security, Integration. Complexity: high.

### Specialized Agents

@dev owns execution; @devops co-executes AC-1…AC-4 (chart, image, TLS, policy); @architect provides the assigned technical gate; independent @qa owns the SDC verdict and Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Pre-deployment review by @devops before any shared-environment rollout; G-1/G-2/G-3 asserted in the checklist.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations with the configured 30-minute timeout. Focus: secrets management (no hardcoded credentials, TLS on every secret-bearing hop), environment configuration validation, rollback readiness, fail-closed defaults, honest evidence. Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

Proposed ownership; root reconciles before dispatch.

- `studio-runner/Dockerfile`
- `helm-chart/put-checks/templates/studio-guided-worker-deployment.yaml` (new), `studio-guided-worker-configmap.yaml` (new), `studio-guided-worker-networkpolicy.yaml` (new), `studio-runner-deployment.yaml`, `deployment.yaml`, `configmap.yaml`
- `helm-chart/put-checks/values.yaml`, `values-dev.yaml`, `values-uat.yaml`, `values-prod.yaml`
- `studio-runner/src/server/server.ts`, `config.ts`, `identity.ts`, `application.ts` (TLS termination, client-cert auth, config keys)
- `studio-runner/test/deployment/chart.test.ts`, `backend-env.test.ts`, `envfrom-keys.test.ts`, `dump-settings.test.ts` (new), `tls-client-cert.test.ts` (new), `helm.ts`, `image.ts`
- `backend/src/main/java/com/citi/put/checks/studio/compile/validator/StudioRunnerProperties.java`
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClient.java` (TLS client certificate)
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java`, `StudioScheduledDispatchAuthorization.java`, `StudioScheduleService.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReplayAuthorization.java` (background path), `ObservedReplayRuntimeConfiguration.java`
- `backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java`
- `backend/src/main/resources/application-prod.yml`, `application-staging.yml`, `application-worker.yml`, `application-api.yml`, `application.yml`
- `backend/src/test/java/com/citi/put/checks/studio/compile/validator/StudioRunnerPropertiesProfileTest.java` (new), `backend/src/test/java/com/citi/put/checks/studio/scheduling/ObservedScheduleAuthorityIT.java` (new), `backend/src/test/java/com/citi/put/checks/studio/secrets/VaultPolicyIT.java` (new), `backend/src/test/java/com/citi/put/checks/studio/dispatch/RunnerTlsClientCertIT.java` (new)
- `studio-runner/evaluation/observed-authoring/manifest.json` (new), `fixture-server.mjs` (new, extends `evaluation/fixture-server.mjs`), `evaluate.mjs` (new), `studio-runner/evaluation/README.md`
- `studio-runner/test/evaluation/fixture-run.test.ts`, `report.test.ts`
- `tools/corun.sh`, `tools/corun-report.mjs`
- `frontend/e2e/studio-observed-authoring.spec.ts` (new), `frontend/playwright.config.ts`
- `docs/qa/evidence/studio-observed-authoring/acceptance.json` (new), `benchmark.json` (new), `replay-stability.json` (new), `fault-injection.json` (new), `wire-canaries.json` (new), `video-masking-inspection.md` (new, manual gate), `vault-policy.json` (new), `budget-admission.json` (new)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md`

Not owned here: runbook text (OBS-010), `docs/specs/**` contracts (OBS-007), frontend guided components (OBS-008), v1 retirement (OBS-011).

## PO Validation (2026-10-09)

**Verdict:** GO — readiness 8/10 (confidence Medium-High: local hardening items High; live-proof items depend on named external prerequisites). Status Draft → Ready. Report: `.ai/STUDIO-OBS-009-po-validation-r2.json`. Validator: Pax (@po).

**Verified at `path:line` (2026-10-09):** `studio-runner/Dockerfile:59` (`CMD ["node","dist/main.js"]` only), `run/guidedMain.ts:18` (`STUDIO_GUIDED_CONFIG_FILE`), no `studio-guided-worker-*` template under `helm-chart/put-checks/templates/`, `test/deployment/chart.test.ts:388-398` (rendered ⊆ `ACCEPTED_KEYS`), `StudioRunnerProperties.java:59` accepts `http://`, `server/server.ts:17,33` `node:http`, `ConfiguredBackgroundAuthorization.java:51-53` (`local`/`test` only), `OBSERVED_SCHEDULE_AUTH_REQUIRED` emitters at `StudioScheduleProcessor.java:273` and `StudioAcceptanceService.java:322`, no heap/core-dump setting in `Dockerfile`/`build.gradle.kts`/`application*.yml`/chart, `GuidedInternalSecurity.java` and `guided/transport.ts` exist, evaluation harness and `tools/corun*` exist, all seven profile files exist. `ObservedReplayRuntimeConfiguration.java` does not exist yet — it is created by OBS-007 AC-16, so this story's edit is correctly sequenced, not a missing path.

**10-point checklist:** title ✓ · description ✓ · testable ACs ✓ (each names its oracle: C-8/C-9/C-10/C-17, consensus §11 rows, GA H-1/H-2) · scope ✓ ("Out of scope here") · dependencies ✓ · complexity ✓ (L) · value ✓ · risks ✓ ("Thresholds and honesty rules", external prerequisites) · Done criteria ✓ ("a failed or unrun gate stays failed or unrun") · alignment ✓ (design §10 OBS-009 rows; security conditions 10–11; GA §4.D D-2, §6 ARCH-8/ARCH-9/SEC-4, §7). Executor `dev` / gate `architect` valid; AC-1…AC-5 are @devops work co-executed as the story states — the coordinator dispatches @devops for T1/T2.

**Decisions pending — PO ruling:** Q2 (observed schedules via `ConfiguredBackgroundAuthorization`) and Q4 (runner-terminated TLS with client certificates) do **not** block Ready: both are design §8 / I-C8 options with stated defaults, G-3 holds under either Q2 answer, and the AC deltas are pre-written in the story. Conditional GO: the user may override either before T2/T3 starts; if so @sm applies the table's delta to AC-3/AC-5 and @po revalidates those ACs only.

**GO conditions:**
1. T0 records, by name and owner, every external prerequisite: the approved staging application with real login and its approved origins; a provisioned test secret (requires ED-02 / Vault provider, GA C-3); model gateway access (ED-01/SPK-01, owner TBD per GA D-3); a dev Vault for the C-10 policy test. An absent prerequisite makes the dependent AC "unrun, owner X" — never a pass and never a silent skip.
2. AC-3's "release checklist asserts G-1/G-2" means the OBS-010 release-readiness record (OBS-010 AC-4) plus `release-checklist.md` run by @devops at handoff — not an edit to the L2 framework checklist.
3. Budget admission against the USD 500 wave ceiling is recorded before the first real-provider call; p50/p95, calls, tokens and cost carry denominators.
4. Only @qa sets Done; Done is not reachable while AC-6(b) or AC-4's Vault policy test is unrun.

**Nice-to-have:** split the `docs/qa/evidence/studio-observed-authoring/*.json` files into "local" and "deployed-stack" sections so OBS-010 can cite each gate's provenance.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-09 | 0.2.0 | **Rescoped** after the 2026-10-09 decision: added deployment hardening placed here by design §10 (ARCH-8 worker packaging, SEC-4 mTLS/G-1, legacy-hop TLS/G-2, heap/core-dump and Vault least-privilege, ARCH-9 schedules/G-3); real-model benchmark cut to the pilot scope per GA plan §7 with the 30-workflow corpus recorded as deferred; kept regression, fault-injection, isolation/mutation, wire-canary and video-seek proof; added manual video-masking gate; Decisions pending Q2/Q4; 10 ACs; Status Draft | @sm (River) |
| 2026-10-09 | 0.2.1 | Validated GO (8/10) — Status: Draft → Ready | @po |
