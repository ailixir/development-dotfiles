# Story STUDIO-OBS-012A — Compile-path retirement (backend, runner, contracts) and migration re-baseline

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-012A |
| Status | **Done** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-007 |
| Dependency notes | Same lane as OBS-007 (`GuidedSessionService`, contracts, pins, migrations) — starts only when OBS-007 is Done. After this story: OBS-012B ∥ OBS-013 ∥ OBS-014 may run in parallel; OBS-015 needs the per-step snapshot columns this story lands in `V15__publication` (ADR-SC-005 "Order and parallelism"). |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md (D-A, D-B, defaults table, "Removed / moved / kept", "Contracts and pins", "Tests", "Docs", placement map row OBS-012A, Verification) · docs/specs/studio-observed-authoring/secret-login-design.md R3 §3 (v3 only), §6 "Removed by OBS-012A", "Migration" · docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md (rows CLN-12, 15, 16, 17, 23, 24, 27, 28, 46, 48 move here; G3, G4, G5, G9) · panel 2026-10-09 (dev, data-engineer, devops, QA) |
| Size | XL — three lanes (K compile kill, C contracts/generations, M migrations); see Dev Notes "Sizing" |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, dependency-analysis]

## Story

As the team shipping UI Studio with one authoring path, I want the compile-to-READY pipeline, the artifact-1 engine, the guided v1/v2 contract generations and the compile-only database state removed, and the Studio migrations re-baselined as seven area migrations on top of the untouched Checks core, so that the branch contains exactly one generation of every contract, pin, route and table and nothing that the observed path does not use.

## Acceptance Criteria

Method is 10.51's: every deletion re-grepped at HEAD with the command recorded, every dropped or ported test counted and named, pins quoted before/after (inventory G1, G3, G5, G9). Binding: ADR-SC-005 D-A (no legacy path, no compatibility layer, no versioned fallback) and D-B (pre-release exception to `ARCH.md:123`; V1–V11 byte-identical). The former inventory "ruling needed" rows CLN-15, CLN-16/17, CLN-23, CLN-24, CLN-27/28, CLN-46 and CLN-48 are **decided by the ADR** and executed here without further ruling; CLN-12 is decided as "document, keep".

**Lane K — compile path**

1. **AC-1 — Backend compile pipeline deleted; shared guided transport relocated.** `backend/src/main/java/com/citi/put/checks/studio/compile/**` is deleted after its live shared responsibilities move. The exact shared gateway closure moves to neutral `studio/gateway` with its surviving tests: `GenAiGatewayTransport`, `StudioGatewayConfig`, `StudioGatewayProperties`, `StudioGatewaySelectionProperties`, `BudgetedAuthTransport`, `BoundedCredentialProvider`, `GatewayFailureClassifier`, `GatewayOutcome`, `GatewayErrorCode`. The compile-only gateway classes `GatewayAuditLogger`, `GatewayErrorScrubber`, `GatewayPayloadSerializer`, `GatewayProvenance`, `GatewayResponseParser`, `LlmGatewayClient`, `GenAiLlmGatewayClient`, `DisabledLlmGatewayClient`, `RecordedFixtureGatewayClient`, `RecordedFixtureCorpus`, and their gateway `CompileRequest`/`CompileResponse` DTOs are deleted with their compile-only callers and bean factories; they are not renamed into a new guided provider or retained as compatibility. The existing `GuidedLlmGatewayClient`, `GenAiGuidedLlmGatewayClient` and `GuidedResponseParser` remain the guided proposal path. Preserve the credential deadline/cancellation subset currently supplied by `CompileBudget` in neutral gateway code; retire compile proposal/retry/accounting machinery without changing guided budget ownership, wire bounds, cancellation, single-send or deployed-provider guards. The configuration prefix becomes `studio.gateway`, with no `studio.compile.gateway` alias or recorded compiler provider. `CredentialPatternScreen` moves to `guided/translation`, updating both `GuidedSourceClassifier` and `GuidedTranslationConfiguration`. The live save-time `AuthoringLimits` and source/configuration `ConfigurationChangeClassifier` responsibilities move to `studio/authoring`; preserve their current guards and revision advancement, without compile state or new incremental re-learn behavior. `compile/validator/StudioRunnerProperties` moves to `studio/dispatch` for `HttpRunnerDispatchClient` and `GuidedPublicationConfiguration`; `RunnerValidationClient`, `RunnerDiagnostic` and `ValidationOutcome` are deleted because the observed path uses `ObservedValidationClient` directly. `compile/incremental/**` (T-INC) and `dto/EvidenceReference` are deleted. Compile-only test suites are deleted by name; shared transport/credential tests are ported by name. The panel's 383 `@Test`/60-file figure is historical: the fresh T0 named baseline and final reconciliation govern actual drops and ports. `NoRuntimeLlmTest` keeps the authoring-only gateway allowance with the compile edge deleted; `DeReadyCarryForwardTest` asserts zero guided calls through replay. [ADR-SC-005 D-A; "Removed / moved / kept"; "Tests"; placement map row OBS-012A; PO T0 reconciliation 2026-10-12]

2. **AC-2 — Public compile routes, flags and vocabulary.** `POST /tests/{id}/compile` and `POST /tests/{id}/confirm-compile` (`StudioController`, `StudioService.confirmCompile`, `ConfirmCompileRequestDto`) are removed from code and from `docs/specs/studio/openapi.yaml`; the nine backend test files that pin them (`ConfirmCompileRouteTest`, `CompileRouteContractDivergenceTest`, `ConfirmationWriteOnceIT`, `ExactConfirmationIT`, `NoAutoConfirmTest`, `RepairLoopTest`, `SemanticHonestyTest`, and the compile expectations inside `ExecutionVideoContractTest`, `StudioContractTest`) are deleted or re-pointed by name. Configuration `studio.compile.**`, `studio.authoring.v2-enabled`, `studio.compile.incremental.enabled` and `studio.runtime.pin.*` are removed from `application*.yml` and their readers. Readiness vocabulary becomes `UNLEARNED | LEARNING | READY | NEEDS_RELEARN` (`NEEDS_RELEARN` carries `firstChangedStepId`; the detection that sets it is OBS-015 — until then the server never emits it); `409 LEARN_REQUIRED` replaces `COMPILE_REQUIRED`; `confirmation_source` is `GUIDED_RUN` only (the `MANUAL`/`RUN` values disappear with the re-baselined `V12`, AC-6). `POST /tests/{id}/validate-variables` is **kept and documented** in the OpenAPI (live Create-Check caller; inventory CLN-12). [ADR-SC-005 D-A; defaults "Readiness vocabulary"; inventory CLN-12, CLN-15, CLN-27, CLN-28, CLN-48]

3. **AC-3 — Runner artifact-1 engine and `/v1/*` routes deleted.** `studio-runner/src/validator/{ast,arguments,language,references,referencePolicy,schema}.ts`, `executor/{operations,executor}.ts` and its artifact-1 adapters, `run/playwrightAdapter.ts`, the `/v1/validate` and `/v1/runs` routes in `server/routes.ts`, the legacy IPC mode and `attachLegacyChildRuntime` are deleted; `run/childRuntime.ts` is carved down to the observed `/v2/runs` child protocol (the `protocol.ts` job handling that `/v2/runs` shares stays). Artifact-1 runner suites and fixtures (incl. the ~30k lines of JSON fixtures, panel dev) are deleted by name with the dropped count reconciled against a fresh baseline; the `Legacy*` adapters and `LEGACY_*` codes that only the v1 run path used go with it (the inventory's M12 "keep" is superseded by D-A). `confinement.test.ts` keeps its sandbox/isolation assertions and re-anchors `BASE_SHA256` over the **whole** public document (AC-5). [ADR-SC-005 D-A; "Removed / moved / kept"; panel dev]

**Lane C — contracts, generations, pins**

4. **AC-4 — One contract generation (`contracts/v3`), one internal mount.** `docs/specs/studio-observed-authoring/contracts/*.schema.json` (v1), `contracts/fixtures.json` (v1), `openapi.yaml` (observed v1), `contracts/v2/**`, `openapi-v2.yaml` and OBS-007's interim `openapi-v3.yaml` are deleted after their content is folded into `contracts/v3` and the one public OpenAPI (AC-5). The dual mount `/internal/v1|v2` in `GuidedInternalController` and the `GuidedInternalSecurity` matcher collapse to one; the v1 `versions` block (`schemaVersion == 1`), the v1-only `observe`/`outcome` service branches and the `observed-1` fallback tuple in `GuidedSessionService`/`GuidedContracts` are removed; `versions.ts` loses the v1 fallback and the nine-pin tuple collapses to `{contract: 3, build}` with the build identity `assertBuild` already checks. **Port first, then remove:** preserve and port the current named cases in `GuidedSessionIT` (43 `@Test`), `GuidedHttpSecurityIT` (6 `@Test`) and `GuidedBridgeIntegrationTest` (37 `@Test`, including its one sv1 case), with the same counts and names proven before any v1 removal. The panel's 30+6 v1 count remains historical evidence, not a cap that permits dropping OBS-007 additions; existing v3 cases retain their assertions while paths/tuples are updated. **Grep hazard (G9):** the literal `"validator":"observed-1"` in `V33:300`, `executor/observedOperations.ts` and `GuidedPublicationRepository.java` is the live validator version of the replay family until the tuple collapse renames it — path-qualify the sweep. [ADR-SC-005 defaults "Contracts"; "Contracts and pins"; design §6 "Removed by OBS-012A"; inventory CLN-16, CLN-17, G9]

5. **AC-5 — One public OpenAPI, re-anchored pins, regenerated bundles.** The seven guided-session routes move from `/api/v3/studio/guided-sessions` to `/api/v1/studio/guided-sessions` (`GuidedSessionController`, `GuidedPublicationController`) and are documented in `docs/specs/studio/openapi.yaml` — the one public document; `/api/v3` is not used. `BASE_SHA256` in `confinement.test.ts` covers the whole public document (the OBS-006 three-route exclusion is removed); `StudioContractTest` op-count covers surviving operations only; both pins re-anchored with old/new quoted. `tools/check-studio-observed-contracts.cjs` reads v3 and the one OpenAPI only; `tools/build-studio-observed-schemas.cjs` regenerates `studio-runner/src/{guided/schemas.json, guided/types.ts, validator/observedSchemas.json, executor/observedOperations.ts}` and `backend/src/main/resources/studio/observed-contracts/v3/**` from v3, and a check (runner test or Gradle task, named in evidence) fails when regeneration is not byte-identical to the checked-in bundles (panel dev: the generator is a second source of truth today). `backend/build.gradle.kts` classpath copy includes v3 only. `GuidedSessionIT`, `GuidedHttpSecurityIT`, `GuidedBridgeIntegrationTest` run against the new paths. [ADR-SC-005 defaults "Public API", "Contracts"; "Contracts and pins"; panel dev]

**Lane M — migrations and entities**

6. **AC-6 — Migrations re-baselined (D-B).** `backend/src/main/resources/db/migration/` contains exactly `V1`–`V18`: `V1`–`V11` byte-identical to `d954a21c5` (proven by `shasum` in evidence); Studio `V12`–`V33`, `V34` (OBS-007) and `backend/db/cutover/V19` are re-authored by @data-engineer as `V12__tests_revisions`, `V13__executions_ledger`, `V14__guided_sessions` (state CHECK without `AWAITING_AUTH`), `V15__publication` (v3 tuple, scope without `accountRef`, guard without account fields, **plus the per-step snapshot hash and `reusedFrom{revisionId, stepId}` provenance columns ADR-SC-005 D-D requires — OBS-015 fills them**), `V16__scheduling` (minting `OBSERVED_SCHEDULE_AUTH_REQUIRED` only if OBS-009 has not lifted observed schedules — see Decisions pending), `V17__secret_use_audit` (OBS-007's DDL), `V18__drop_plaintext_secrets` (today's `V25`). Compile-only state is not carried: `ui_tests` compile columns (V12/V16/V18/V21), `ui_test_revisions` compile identity (V18/V21/V22–V24/V29), `ui_test_step_identities`, `ui_test_compile_requests`, `ui_test_compile_outcomes`, the `MANUAL`/`RUN` confirmation sources, and the V19 cutover. Core tables `ui_tests`, `ui_test_executions` stay. `db/cutover/` does not exist afterwards. Hibernate entities (`UITest`, `UITestRevision`, `UITestExecution`, …) change in the same change; the current 20 Flyway-target-pinned source files (historical panel count: 17; exact names and methods in the T0 evidence, incl. `InferenceMigrationLatestIT` and `GuidedPublicationMigrationTest`) are reconciled by name. Surviving tests are rewritten to target `V18`; compile-only retirement is separately named under AC-1, and all OBS-007 additions retain their logical assertions. Fresh-install and migration-count tests target `V18`. Dev databases are recreated (runbook row is OBS-010; this story records the command in evidence). **Residual (external, never faked):** only the user or Platform/SRE can confirm that nothing was ever deployed from an internal remote; the ADR records that confirmation as owed — T0 records who was asked and the answer or "unconfirmed". [ADR-SC-005 D-B; Verification "D-B"; design §6 "Migration"; panel data-engineer, devops]

**Docs and verification**

7. **AC-7 — Superseded notes and D-A verification.** Dated "superseded by ADR-SC-005" notes are added to `docs/architecture/studio-execution.md` §4/§8.3/§8.5, `studio-inference-*` docs, `docs/specs/studio-context/current-state.md`, `docs/stories/STUDIO-INC-001-incremental-compile/spec/decisions.md` (append-only), `backend/.../studio/compile/README.md` is deleted with its package, `docs/runbooks/studio-inference-rollout.md` gets a dated superseded header; `docs/specs/studio-observed-authoring/contracts/README.md` describes v3 only. Verification: `grep` for `compile/`, `confirmCompile`, `confirm-compile`, `/v1/runs`, `/v1/validate`, `artifact_schema_version = 1`, `observed-1`, `/internal/v1/`, `COMPILE_REQUIRED`, `studio.runtime.pin`, `api/v3` in `backend/src/main`, `studio-runner/src`, `frontend/src` (backend-facing strings only; the frontend sweep is OBS-012B), `tools/` → 0, guard-test string literals excepted and listed; full backend `check`, runner default/fixtures/deployment tiers and the contract tool are green on the final tree; counts reconciled as `after = baseline − named drops − named deletions + named ports`. [ADR-SC-005 "Docs"; Verification "D-A"; inventory G1, G5]

## Tasks / Subtasks

- [x] **T0 — Baselines and reconciliation (AC-1…7).** Confirm OBS-007 Done; take fresh test baselines (backend `studio.*`, runner incl. skipped count); record the D-B external confirmation request (AC-6 residual); @data-engineer drafts the V12–V18 area migrations against the current DDL and OBS-007's V34; @architect confirms the gateway package name and which `compile/validator` clients survive; root reconciles the File List.
  - [x] OBS-007 Done confirmed; frozen baselines: backend `studio.*` 2000 tests / 35 failed / 8 skipped (`baseline-backend/`), runner default 1829 / 29 skipped (`baseline-runner/`), fixtures 385 / 10 skipped, deployment 313 (`runner-k` `baselines`).
  - [x] D-B recorded as UNCONFIRMED, owner user / Platform-SRE (`root-t0-simplification-and-ownership.json`). The external question was not sent (`externalMessageSent: false`); see open items.
  - [x] V12–V18 drafts (`data-draft/`), @architect T0 rulings (`aria-t0-architecture-reconciliation.json`), PO T0 GO (`po-t0-reconciliation.json`).
  - [x] File List reconciled from `git status --porcelain` against the T0 source hashes (`final-gates/reconciliation.json`, File List below).
- [x] **T1 — Lane K (AC-1, AC-2, AC-3).** Move gateway pieces; delete `compile/**`, routes, flags, DTOs and tests by name; delete artifact-1 engine, `/v1/*` routes, legacy IPC; carve `childRuntime.ts`; readiness vocabulary and `LEARN_REQUIRED`; document `validate-variables`. Compile-green per sub-batch.
  - [x] Backend: gateway closure moved to `studio/gateway` with neutral `CredentialBudget`; `compile/**` deleted (55 main files incl. README, 60 test files); compile routes, flags, DTOs removed; `LEARN_REQUIRED` and readiness `UNLEARNED | LEARNING | READY | NEEDS_RELEARN` (`backend-k`).
  - [x] Dispatch-time authorization recheck restored for observed runs (R3, security HIGH) (`dispatch-authz`).
  - [x] Runner: artifact-1 validator/executor, `playwrightAdapter.ts`, `/v1/*` routes and legacy IPC deleted; `childRuntime.ts` carved; 508 tests deleted and 78 dropped by name (`runner-k` `testReconciliation`).
- [x] **T2 — Lane C (AC-4, AC-5).** Port the three v1 ITs to v3 (count/name proof); move guided routes to `/api/v1/studio` and fold `openapi-v3.yaml` into the one OpenAPI; collapse the internal mount, tuple and `observed-1`; delete v1/v2 directories and documents; regenerate bundles; add the byte-identical regeneration check; re-anchor both pins (quote old/new); contract tool green.
  - [x] Port proof by name: `GuidedSessionIT` 43=43, `GuidedHttpSecurityIT` 6=6, `GuidedBridgeIntegrationTest` 37=37, `GuidedPublicationReplayIT` 38=38 (`lane-c-java` `itPortProof`).
  - [x] 72 contract/document files deleted (`lane-c/deleted-sha256.txt`); one public OpenAPI, 34 → 38 operations; byte-identity check `test/generated-contracts.test.ts` plus `build-studio-observed-schemas.cjs --check`.
  - [x] Pins quoted old/new: `BASE_SHA256` 08f091ec… → 6af5428c… → 350907aa… → 30b3e866… → f502160e… (lane-c, lane-c-java, replay-cascade); `StudioContractTest` 34 → 38 ops, internal 11 → 9.
  - [x] Contract tool PASS (v3, public OpenAPI 38 operations, codegen) after the last contract edit (`d1-ceiling` commands, `runner-gates` gate4).
- [ ] **T3 — Lane M (AC-6) — @data-engineer with @dev.** Author V12–V18; delete V19 cutover and old V12–V34; update entities and the 17 pinned ITs; fresh-install test at V18; `shasum` V1–V11; recreate dev DB; record the command.
  - [x] V12–V18 placed; old V12–V34 (incl. untracked V34, preserved in `lane-m/preserved/`) and `db/cutover/V19` deleted; `backend/db` absent (`lane-m`).
  - [x] Entities and Java readers/writers of dropped columns updated; `compile/CompileState.java` deleted (`lane-m-dev`).
  - [x] 20 Flyway-pinned files reconciled by name: 224 − 0 − 20 = 204 (190 kept, 14 renamed) (`lane-m` `pinnedTests.reconciliation`).
  - [x] Fresh install at V18 (Testcontainers) and scratch catalog diff; `rdsParityLint` clean on 18 files (`lane-m` `proofs`).
  - [x] V1–V11 `shasum -a 256` equal to `d954a21c5`, 11/11 (lane-m; re-verified 2026-10-13 in `final-gates/reconciliation.json`).
  - [ ] Dev database recreated — not done; destructive, owed to the user.
  - [x] Recreation command recorded (`lane-m` `notRun`).
- [x] **T4 — Docs and verification (AC-7).** Dated notes; greps recorded per item; full gates; reconciled counts; File List as actually changed.
  - [x] Dated superseded notes (`docs-ac7`).
  - [x] AC-7 greps recorded per item: 0 hits in `backend/src/main` and `studio-runner/src`; `tools/` guard literals only; `frontend/src` not 0 (OBS-012B scope, see open items) (`final-gates/reconciliation.json` `d_ac7Greps`).
  - [x] Counts reconciled per lane and by name; 35/35 baseline failures disposed (`final-gates/reconciliation.json`).
  - [x] File List as actually changed (below).
  - [x] Full backend `./gradlew check` green on the final tree — run 5b: BUILD SUCCESSFUL, 1916 tests / 0 failed / 25 skipped (18 OBS-009 deferrals + pre-existing), jacoco verification PASS (`final-gates/backend-check-run5b.json`). Runs 1–4 not green and classified; run 5 aborted on a host-port collision with a stale Gradle daemon (ORCH-STATE).
  - [x] Runner default/fixtures/deployment tiers, contracts, typecheck, lint green on the final tree — default 1288/29 skip, fixtures 221/9 skip (secret-control 10/10), deployment 313/313 on rebuilt image (`runner-gates-final/ledger.json`). R4 C2 guidedMain proof = backend guided ITs in run 5b (architect gate item 2).
- [ ] **T5 — Submit to independent @qa**; QA re-runs the grep and reconciliation independently (10.51 AC-12 method); only QA can set Done.

## Dev Notes

### Why this is one story (and how to split it if @po requires)

ADR-SC-005 places "removal + re-baseline in one lane" because the compile columns the re-baseline drops are read by the compile code being deleted, and the Hibernate entities change once. Three lanes are file-disjoint until the final gate: **K** (backend `compile/**`, `StudioController`/`StudioService` compile methods, runner artifact-1 files, `routes.ts`), **C** (`docs/specs/**`, `tools/`, generated bundles, `GuidedInternalController`/`GuidedInternalSecurity`/`GuidedContracts`/`GuidedSessionService` v1 branches, both pins), **M** (`db/migration`, `db/cutover`, entities, Flyway ITs). Shared: `GuidedSessionService` (C removes v1 branches; K touches readiness callers) — C first; `StudioContractTest` (K removes compile ops, C re-anchors) — one edit in C after K. **Fallback split if right-sizing fails:** 012A-1 = Lanes K + C (compile retirement and one generation), 012A-2 = Lane M (re-baseline), 012A-2 depending on 012A-1; OBS-015's `V15` dependency then points at 012A-2.

### What exists today (verified 2026-10-09)

Migrations `V1`–`V18`, `V20`–`V33` plus `backend/db/cutover/V19__studio_inference_candidate_identity.sql`; `V25` drops the core `secrets` table from inside the Studio range (becomes `V18`). `studio/compile` has 54 Java files plus `gateway/` (21 files) and `incremental/` (2 files); `compile/validator/` holds `StudioRunnerProperties`, `RunnerValidationClient`, `RunnerDiagnostic`, `ValidationOutcome`. Runner `server/routes.ts` serves `/v1/validate`, `/v1/runs`, `/v2/validate-observed`, `/v2/runs`. `GuidedSessionController` and `GuidedPublicationController` map `/api/v3/studio/guided-sessions`. `contracts/` (v1 root), `contracts/v2`, `contracts/v3` (three files before OBS-007) and `openapi.yaml`/`openapi-v2.yaml` all exist. `ui_test_step_identities`/`ui_test_compile_*` are created in `V18`/`V29`. Compile benchmark corpus at `docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/` — its 13 cases are **ported into the D-C corpus by OBS-009**, not deleted here (keep the report; it is a dated record).

### PO T0 reconciliation — 2026-10-12

`docs/qa/evidence/STUDIO-OBS-012A/po-t0-reconciliation.json` records the narrow AC-1 correction against the actual guided caller/dependency closure. Preserving unused compiler facade/parser/corpus classes would conflict with D-A; this amendment removes them while retaining the existing guided transport, credential deadlines and authoring guards. It adds no provider, compatibility layer, product behavior or mandatory E2E case. Supporting checks retain their defining tiers.

Current source inventory is 54 Java files **total** under `compile` (including 21 gateway and 2 incremental files), 43 named `GuidedSessionIT` methods, 6 `GuidedHttpSecurityIT` methods and 37 `GuidedBridgeIntegrationTest` methods. The 20 Flyway-target-pinned files and their 224 named methods are source-bound in `data-draft/pinned-test-mapping.json`; the three additions to historical17 are `GuidedSecretLoginMigrationTest`, `GuidedServiceTransportFaultIT` and `GuidedDefaultModelReservationIT`. Static inventories are not executed-pass counts. The dated 2026-10-09/10 panel and validation findings below remain unchanged as history; fresh root baseline failures/skips remain explicit evidence to reconcile, never waived by this amendment. Port-first, V1–V11 identity, the Lane M phase gate, full required tiers, independent QA, count reconciliation and the D-B external residual are unchanged.

### Grep hygiene (inventory G9, updated)

`observed-1` is live until the tuple collapse (path-qualify); `resetStudioMocks` ≠ `resetStudio`; the three Spring setter-injection methods (`installObservedVerifier`, `installPublicationProjection`, `initializeScheduledChecks`) are not dead; `recordEvidence` may be an OBS-013 seam — confirm before removing. The 10.51 AC-9 protected list (V2 engine methods, `EvidenceReference`, `temperature`, V18/V19, `openapi.yaml`, `confinement.test.ts`) is **lifted by ADR-SC-005** for compile-path items; record the lift as a dated note in `decisions.md` (AC-7) rather than asking for a per-path ruling.

### Decisions pending (written to the stated default)

| Question | Default applied here | ACs that change if decided otherwise |
|---|---|---|
| `OBSERVED_SCHEDULE_AUTH_REQUIRED` in `V16__scheduling` — mint it (OBS-009 Q2 outcome unknown at authoring time) or omit it. | Mint it (design §6 item 5; keeps OBS-009's refusal code valid; OBS-011 removes emitters if schedules are lifted). | AC-6 `V16` content. |
| D-B external confirmation (nothing deployed from an internal remote) unavailable at T0. | Proceed (ADR records the confirmation as owed; the evidence lists it as "unconfirmed, owner: user / Platform-SRE"). | None; OBS-010's release record carries the open item. |
| T0 ruling: which `compile/validator` clients survive. | `StudioRunnerProperties` moves to `studio/dispatch`; `RunnerValidationClient`, `RunnerDiagnostic` and `ValidationOutcome` are deleted. Source evidence confirms `/v2/validate-observed` uses the existing `ObservedValidationClient` directly. | AC-1 relocation list, resolved by PO T0 reconciliation 2026-10-12. |

### Out of scope here

Frontend removal and vocabulary (OBS-012B). Recording the first Run (OBS-013). Governance/security P0/P1 (OBS-014). Incremental re-learn logic (OBS-015 — only its `V15` columns land here). One runner process/image/Helm and TLS (OBS-009). `GuidedRunnerClient`/`ObservedValidationClient` and `GuidedPublicationAuthorization` folds, `claim()`/`checkCommand` splits, runner TypeScript reformat (OBS-011). Path-independent GA plan items (§4.A repo/CI/images, §4.D CSRF, §4.E schedule activation, §4.F evidence storage, §4.G operability) — tracked in `docs/epics/UI-STUDIO-GA-PLAN.md`, not here.

### Repository conventions

Java 21/Spring/Flyway (forward-only policy resumes after this one re-baseline), Node/TypeScript runner with Vitest tiers; all backend Gradle runs on this checkout are serialized; never `git add -A`; `docs/qa/evidence/**` is never staged; record every command; never mark a skipped or unavailable check as passed.

### PO validation — 2026-10-10 — GO 8/10, Status Draft → Ready

> Report: `.ai/STUDIO-OBS-012A-po-validation.json`. Validator: Pax (@po). Method: `validate-next-story.md` steps 0–12 plus the `story-lifecycle.md` 10-point checklist, against ADR-SC-005 (D-A, D-B, Verification), design R3 §3/§6, the cleanup inventory and the current tree. Read-only cross-check; no build run.

**Checklist 10/10 PASS** (risks accepted as PASS on the strength of the D-B residual, G9 grep hazard and the unverified `check` hang being named). Executor `dev` ≠ gate `architect`; refactor/architecture → architect gate; `dependency-analysis` tool fits. Template complete. Code-intel unavailable; epic context cross-referenced manually (README, wave plan batch 2 → {012B ∥ 013 ∥ 014}, ADR placement map, OBS-007/013/014/015 File Lists).

**Anchors verified on this tree:** `studio/compile` = **54** Java files total = 31 top-level + 21 `gateway/` + 2 `incremental/`; `compile/validator/` holds exactly the four classes named; compile tests **60 files / 383 `@Test`** (exact); `GuidedSessionIT` 30 `@Test` (8 `schemaVersion 1` uses), `GuidedHttpSecurityIT` 6 (`:44` v1 URL), `GuidedBridgeIntegrationTest` 1 sv1 case; `GuidedInternalController.java:17-19` dual mount; `routes.ts:6-8` `/v1/validate`, `/v1/runs`; `StudioController.java:122` compile, `:151` confirm-compile, `:236` validate-variables; `openapi.yaml:669,747`; `application.yml:221` `v2-enabled`, `:331` `compile:`, `:333` `incremental.enabled`, `:432-433` `runtime.pin`; `versions.ts:46` `observed-1`; `GuidedSessionService.java:344` v1 `observed-1` fallback tuple; `db/migration` = V1–V18, V20–V33 (32 files) + `backend/db/cutover/V19`; **V1–V11 `shasum -a 256` identical to `d954a21c5` today**; V25 drops the core `secrets` table; **exactly 17** test files pin a Flyway target (`.target(`/`MigrationVersion`): `ErrorCodeConstraintMigrationIT`, `InferenceMigrationIT`, `InferenceMigrationLatestIT`, `LegacyDataMigrationIT`, `RevisionMigrationIT`, `authoring/StudioAuthoringMigrationIT`, `compile/{CompileStartedAt,IntentDerivation,ReferencePolicy}MigrationIT`, `dispatch/LedgerStateMachineMigrationIT`, `guided/bridge/GuidedBridgeIntegrationTest`, `guided/publication/GuidedPublicationMigrationTest`, `guided/session/GuidedSessionIT`, `guided/translation/{GuidedPlanningIntegrationTest,GuidedTranslationMigrationTest}`, `scheduling/StudioSchedulingSchemaIT`, `secrets/PlaintextSecretsDropMigrationIT`; `StudioRunnerProperties` used outside `compile/` by `GuidedPublicationConfiguration` and `HttpRunnerDispatchClient`; `GenAiGuidedLlmGatewayClient` imports `compile.gateway.GenAiGatewayTransport` (so the gateway move must precede the compile delete, as Lane K says); `application.yml:11` `ddl-auto: validate` (entity ↔ schema lockstep is enforced at context load); all docs targets exist (`studio-execution.md`, five `studio-inference-*.md`, `current-state.md`, `STUDIO-INC-001/spec/decisions.md`, `studio-inference-rollout.md`, `compile/README.md`, benchmark `report.md`); runner targets exist (`validator/{bounds,diagnostics}.ts`, `executor/adapters/`, `pageLocation.ts`, `compat/*`, `attachLegacyChildRuntime` at `childRuntime.ts:576,786`).

**Re-baseline mechanics judged adequate:** Flyway — fresh-install at V18 on Testcontainers, V1–V11 byte-identity by `shasum`, 17 pinned ITs named here for T0; Hibernate — entities in the same change plus `ddl-auto: validate`; D-B residual — recorded as an explicit risk with a T0 record (who was asked, answer or "unconfirmed"), acceptable because nothing is released before OBS-010, which carries it as an external gate. "db/migration contains exactly V1–V18" is a point-in-time gate for this story; OBS-014's `V19__guided_governance.sql` (and any OBS-013 forward-only DDL) lands afterwards and re-pins the fresh-install count — see N-1.

**Should-fix at T0 (Dev Notes/File List only; no AC changes):** SF-1 "54 Java files plus gateway (21) and incremental (2)" reads as 77 — actual 54 total. SF-2 File List names `scheduling/StudioAcceptanceService.java`; the class is `dispatch/StudioAcceptanceService.java` (already listed) — drop the wrong entry. SF-3 `compile/gateway/` also holds `CompileRequest.java` and `CompileResponse.java`, absent from AC-1's relocation list — @architect disposition at T0 (delete with the compile path unless `GenAiLlmGatewayClient` still needs them). SF-4 `GuidedTranslationConfiguration.java` also imports `compile.CredentialPatternScreen` — add to the Lane K import fix. SF-5 `backend/src/main/resources/studio/observed-contracts/**` is a `processResources` build output (`build.gradle.kts:339-344`), not a source path; the edit is the `include(...)` list (listed). SF-6 **`rdsParityLint`** (`build.gradle.kts:277-280`, `backend/config/rds-parity/allowlist.yml`, part of `check`) is not named — the seven new migrations are new SQL and must pass it; name it in AC-6 evidence and run it standalone because `check` completion is itself unverified. SF-7 `ExecutionVideoContractTest` lives under `studio/evidence/`. SF-8 runner JSON today totals 19,783 lines (all non-package JSON under `studio-runner`), not ~30k — the panel figure; baseline at T0 as written. Informational: gateway is 2,229 non-blank/non-comment LOC (3,113 raw) vs the panel's ≈1,580.

**Nice-to-have:** N-1 make the fresh-install/migration-count test assert "latest applied == highest migration file" rather than the literal `V18`, so OBS-013/014 do not have to re-pin it.

**Sizing verdict — one story, ACCEPTED with a hard phase gate; the documented fallback split is not applied now.** Reasons: Lane M depends on both K (the compile columns it drops are read only by the code K deletes) and C (`V15` carries the v3 tuple and scope without `accountRef`); splitting forces a second entity pass and still leaves OBS-014 (V19 numbering) and OBS-015 (`V15` columns) blocked on 012A-2, so the parallelism gain is only 012B/013 — and 013's possible forward-only DDL would collide with an in-flight M. The deletion volume is by-name, mechanical, count-reconciled; the 36 ITs are URL/body ports. Gate: **T3 (Lane M) may start only after K and C are compile-green and a fresh backend baseline is re-taken on that tree.** The 012A-1/012A-2 fallback applies only if T0's D-B answer is "something was deployed from an internal remote" (then M needs a different migration strategy anyway) or @architect's T0 rulings materially enlarge Lane C.

**Conditions on GO:** G1 — T0 fixes SF-1…SF-7 in Dev Notes/File List. G2 — Lane M phase gate above. G3 — `rdsParityLint` named and run standalone, result quoted in evidence. G4 — the D-B confirmation question is actually put to the user/Platform-SRE at T0 and the answer (or "unconfirmed") recorded; proceeding on "unconfirmed" is per ADR-SC-005. G5 — @qa reproduces the grep sweep and `after = baseline − named drops − named deletions + named ports` independently (10.51 AC-12 method). Decisions pending above are unchanged ([AUTO-DECISION] mint `OBSERVED_SCHEDULE_AUTH_REQUIRED` in `V16`; proceed on an unconfirmed D-B answer).

## Testing

Static: per-item grep recorded; `tsc` with unused flags on the runner (already on); backend class/method reference scans for the moved gateway package. Dynamic: full backend `./gradlew check` (spotless, checkstyle, spotbugs, jacoco) — record whether `check` completes (GA plan A-4/MED-2 hang is unverified); runner default, fixtures and deployment tiers with the skipped count; `node tools/check-studio-observed-contracts.cjs`; regeneration byte-identity check; fresh-install migration test at `V18` on Testcontainers PostgreSQL; `shasum` of `V1`–`V11` against `git show d954a21c5:…`. Reconciliation: `after = baseline − named drops − named deletions + named ports` for backend and runner, reproduced by @qa.

## CodeRabbit Integration

### Story Type Analysis

Primary: Architecture/refactor (removal). Secondary: Database (re-baseline), API contract (one generation, pins). Complexity: high — ~55–60k lines removed, one migration re-baseline, 36 ITs ported.

### Specialized Agents

@dev owns execution; @data-engineer authors V12–V18 and reviews entity changes; @architect provides the technical gate and the T0 package/client rulings; independent @qa owns the SDC verdict, the independent grep and count reconciliation, and the Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with per-AC requirement-to-evidence mapping and independent grep.
- [ ] Any eventual PR/push is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations with the configured 30-minute timeout. Focus: breaking changes confined to the compile path, pin coherence, migration correctness on a fresh install, byte-identical core migrations, generated-bundle integrity, test-count reconciliation. Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

### Actual changes (2026-10-13, reconciled)

Built from `git status --porcelain -uall` on 2026-10-13, restricted to paths 012A touched. Attribution method: files under `backend/src/**` and `studio-runner/src/**` are compared with the T0 hashes in `docs/qa/evidence/STUDIO-OBS-012A/baseline-backend/source-hashes.json` and `baseline-runner/source-hashes.json` (changed, deleted or created since T0 = 012A; equal to T0 = pre-existing OBS-007 work, excluded). Other paths count as 012A only if modified after the T0 capture (2026-10-12 21:56) and named in a 012A ledger. 192 dirty paths were pre-existing OBS-007 work and are excluded. `mod (untracked since OBS-007)` = untracked before T0 and modified by 012A. Details and the script output: `final-gates/reconciliation.json`.

Bulk deletions:

- `backend/src/main/java/com/citi/put/checks/studio/compile/**` — del, 55 files incl. `README.md` (shared pieces moved first; `backend-k` `deletedMainFiles`, `movedFiles`)
- `backend/src/test/java/com/citi/put/checks/studio/compile/**` — del, 60 files (54 with tests deleted by name, 6 ported by name to `studio/gateway`; `backend-k` `tests`)
- `studio-runner/fixtures/adversarial/**` — del, 73 files (`runner-k` `deletedFixtures`)
- `studio-runner/fixtures/reference/**` — del, 29 files (`runner-k` `deletedFixtures`)
- `docs/specs/studio-observed-authoring/contracts/v2/**` — del, 47 files (`lane-c/deleted-sha256.txt`)
- `backend/src/main/resources/db/migration/`: del `V12__ui_test_revisions_and_compile_state.sql`, `V13__studio_dispatch_ledger.sql`, `V14__studio_execution_history_v2.sql`, `V15__studio_dispatch_ledger_state_machine.sql`, `V16__studio_compile_started_at.sql`, `V17__studio_execution_error_code_check.sql`, `V18__studio_inference_capture.sql`, `V20__studio_execution_cancel.sql`, `V21__studio_authoring_context.sql`, `V22__studio_expected_intent.sql`, `V23__studio_intent_derivation_version.sql`, `V24__studio_reference_policy.sql`, `V25__drop_plaintext_secrets.sql`, `V26__studio_scheduling.sql`, `V27__studio_revision_immutability_restore.sql`, `V28__studio_execution_scope_immutable.sql`, `V29__studio_run_confirmation.sql`, `V30__studio_guided_sessions.sql`, `V31__studio_guided_bridge.sql`, `V32__studio_guided_translation.sql`, `V33__studio_observed_publication.sql`; new `V12__tests_revisions.sql`, `V13__executions_ledger.sql`, `V14__guided_sessions.sql`, `V15__publication.sql`, `V16__scheduling.sql`, `V17__secret_use_audit.sql`, `V18__drop_plaintext_secrets.sql` (`lane-m` `migrations`; untracked OBS-007 `V34__studio_guided_secret_login.sql` also deleted, copy in `lane-m/preserved/`)
- `backend/src/main/java/com/citi/put/checks/config/`: mod `ChecksExceptionHandler.java`, `IdempotencyFilter.java`, `LocalEmbeddedPostgresConfig.java`
- `backend/src/main/java/com/citi/put/checks/config/logging/`: mod `SecretMasker.java`
- `backend/src/main/java/com/citi/put/checks/studio/`: mod `StudioController.java`, `StudioExecutionProperties.java`, `StudioRepository.java`, `StudioService.java`, `UITestRevisionRepository.java`
- `backend/src/main/java/com/citi/put/checks/studio/authoring/`: new `AuthoringLimits.java`, `ConfigurationChangeClassifier.java`, `StudioAuthoringConfiguration.java`, `StudioAuthoringProperties.java`
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/`: mod `ExecutionReadiness.java`, `ExecutionReferences.java`, `HttpRunnerDispatchClient.java`, `README.md`, `RunnerDispatchClient.java`, `StudioAcceptanceService.java`, `StudioDispatchLedgerStatements.java`, `StudioDispatchMetrics.java`, `StudioDispatcher.java`; new `StudioRunnerConfiguration.java`, `StudioRunnerProperties.java`
- `backend/src/main/java/com/citi/put/checks/studio/dto/`: del `CompileAcceptedDto.java`, `CompileDiagnosticDto.java`, `CompileDiagnosticsDto.java`, `CompileErrorDto.java`, `CompileStepDiagnosticsDto.java`, `ConfirmCompileRequestDto.java`, `EvidenceReference.java`; mod `LegacyStudioAdapter.java`, `StudioAuthoringMapper.java`, `UITestDto.java`
- `backend/src/main/java/com/citi/put/checks/studio/entity/`: mod `UITest.java`, `UITestRevision.java`
- `backend/src/main/java/com/citi/put/checks/studio/gateway/`: new `BoundedCredentialProvider.java`, `BudgetedAuthTransport.java`, `CredentialBudget.java`, `GatewayErrorCode.java`, `GatewayFailureClassifier.java`, `GatewayOutcome.java`, `GenAiGatewayTransport.java`, `StudioGatewayConfig.java`, `StudioGatewayProperties.java`, `StudioGatewaySelectionProperties.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/publication/`: mod `GuidedPublicationBaseRepository.java`, `GuidedPublicationConfiguration.java`, `GuidedPublicationController.java`, `GuidedPublicationRepository.java`, `ObservedArtifactLowerer.java`, `ObservedReplayConfiguration.java`, `ObservedRevisionVerifier.java`; new `DatabaseClock.java`; mod (untracked since OBS-007) `ObservedReplayRuntimeConfiguration.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/`: mod `GuidedActionLedger.java`, `GuidedContracts.java`, `GuidedInternalController.java`, `GuidedInternalSecurity.java`, `GuidedSessionController.java`, `GuidedSessionProperties.java`, `GuidedSessionService.java`, `README.md`
- `backend/src/main/java/com/citi/put/checks/studio/guided/translation/`: mod `GenAiGuidedLlmGatewayClient.java`, `GuidedSourceClassifier.java`, `GuidedTranslationConfiguration.java`; new `CredentialPatternScreen.java`
- `backend/src/main/java/com/citi/put/checks/studio/internal/`: mod `ProgressReportService.java`, `RunnerReportProjection.java`
- `backend/src/main/java/com/citi/put/checks/studio/internal/dto/`: mod `ExecutionControl.java`
- `backend/src/main/java/com/citi/put/checks/studio/readiness/`: mod `ExecutionReadinessService.java`, `ReadinessVerdict.java`; del `RuntimePinProperties.java`; new `StudioReadiness.java`
- `backend/src/main/java/com/citi/put/checks/studio/validation/`: mod `VariableReferenceValidator.java`
- `backend/src/main/resources/`: mod `application-local.yml`, `application-staging.yml`, `application-test.yml`, `application.yml`
- `backend/src/main/resources/studio/`: del `artifact.schema.json`, `output-contract.md`, `syntax-reference.md`
- `backend/src/main/resources/studio/recorded-fixtures/`: del `example-domain-url.json`, `wikipedia-home-url.json`, `wikipedia-search-variable.json`
- `backend/`: mod `build.gradle.kts`
- `backend/db/cutover/`: del `V19__studio_inference_candidate_identity.sql`
- `backend/src/test/java/com/citi/put/checks/config/`: new `LocalEmbeddedPostgresPortTest.java`
- `backend/src/test/java/com/citi/put/checks/config/logging/`: new `SecretMaskerEquivalenceTest.java`
- `backend/src/test/java/com/citi/put/checks/corun/`: del `BlackHolePage.java`, `CallbackProxy.java`, `CoRunEnvironment.java`, `CoRunFailure.java`, `FixturePage.java`, `RunnerProcess.java`, `StudioCoRunIT.java`
- `backend/src/test/java/com/citi/put/checks/scheduling/`: mod `SharedSchedulingIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/`: del `ArtifactSchemaDriftTest.java`, `CandidateArtifactProjectionIT.java`, `CompileStateServiceTest.java`, `ConfirmCompileRouteTest.java`; mod `CancelIT.java`, `ConfigurationRevisionTest.java`, `CsiImmutabilityIT.java`, `ErrorCodeConstraintMigrationIT.java`, `ErrorCodeVocabularyTest.java`, `InferenceMigrationIT.java`, `InferenceMigrationLatestIT.java`, `LastRunProjectionIT.java`, `LegacyDataMigrationIT.java`, `OptimisticSaveIT.java`, `RevisionMigrationIT.java`, `RevisionRetentionIT.java`, `SecondApplicationContext.java`, `StudioApiIT.java`, `StudioAuthoringApiIT.java`, `StudioAuthorizationIT.java`, `StudioContractTest.java`, `StudioCsiScopingIT.java`, `StudioExecutionFixtures.java`, `StudioIdempotencyIT.java`, `StudioOverloadIT.java`, `StudioServiceExecuteAuthorizationTest.java`, `StudioServiceWriteAuthorizationTest.java`, `StudioVisibilityIT.java`, `StudioWriteValidationControllerTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/authoring/`: mod `StudioAuthoringMigrationIT.java`, `StudioAuthoringRevisionTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/dispatch/`: mod `AcceptanceIT.java`, `DispatcherIT.java`, `HttpRunnerDispatchClientTest.java`, `InternalBodyContractConformanceTest.java`, `JobBodyLeakTest.java`, `LedgerCancelTransitionsIT.java`, `LedgerStateMachineMigrationIT.java`, `RevocationRotationIT.java`, `RunJobFixtures.java`, `StudioDispatchMetricsIT.java`, `StudioDispatchMetricsTest.java`, `StudioKillSwitchWiringTest.java`; mod (untracked since OBS-007) `ObservedTerminalSettlementIT.java`, `StudioDispatcherFailureIT.java`; new `StudioDispatcherAuthorizationRecheckTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/evidence/`: mod `ExecutionVideoAuthorizationIT.java`, `ExecutionVideoContractTest.java`, `ExecutionVideoEvidenceIT.java`, `ExecutionVideoRangeIT.java`, `ExecutionVideoRefusalEnvelopeIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/gateway/`: new `CredentialBudgetTest.java`, `GatewayFailureClassifierTest.java`, `GatewayTestSupport.java`, `NoRuntimeLlmTest.java`, `StudioGatewayConfigTest.java`, `StudioGatewayPropertiesTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/`: mod `GuidedBridgeIntegrationTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/publication/`: mod `GuidedPublicationMigrationTest.java`, `GuidedPublicationRaceTest.java`, `GuidedPublicationReplayIT.java`, `ObservedAdmissionSecurityIT.java`, `ObservedArtifactLowererTest.java`, `ObservedProfileDriftTest.java`; mod (untracked since OBS-007) `GuidedSecretLoginMigrationTest.java`; new `ObservedGrantClockIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/`: mod `GuidedHttpSecurityIT.java`, `GuidedSessionIT.java`, `GuidedWireContractTest.java`; mod (untracked since OBS-007) `GuidedServiceTransportFaultIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/translation/`: mod `GuidedGatewayPrivacyTest.java`, `GuidedPlanningIntegrationTest.java`, `GuidedProviderEvaluationTest.java`, `GuidedSourceClassifierTest.java`, `GuidedTranslationMigrationTest.java`, `GuidedTranslationTest.java`; mod (untracked since OBS-007) `GuidedDefaultModelReservationIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/internal/`: mod `AdmissionCasIT.java`, `EvidencePartialCallbackIT.java`, `ProgressCallbackIT.java`, `RunnerReportProjectionTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/readiness/`: mod `DeReadyCarryForwardTest.java`, `ExecutionReadinessTest.java`, `ReadinessFixtures.java`; del `SweepDoesNotDeReadyIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/recovery/`: mod `RecoveryIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/scheduling/`: mod `StudioScheduleApiIT.java`, `StudioSchedulingSchemaIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/secrets/`: mod `PlaintextSecretsDropMigrationIT.java`, `SecretUseAuthorizationTest.java`, `StudioSecretsControllerIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/sse/`: mod `SseCrossReplicaIT.java`, `SseStreamingIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/support/`: new `ObservedPublicationFixture.java`
- `backend/src/test/resources/studio/guided/`: new `session-it-documents.json`
- `studio-runner/src/`: mod `index.ts`, `versions.ts`
- `studio-runner/src/compat/`: del `compatibility.ts`; mod `index.ts`, `runtime-versions.ts`
- `studio-runner/src/executor/`: del `executor.ts`, `operations.ts`, `pageLocation.ts`, `refusals.ts`; mod `index.ts`, `observedOperations.ts`, `observedReplay.ts`; new `stepReporter.ts`
- `studio-runner/src/executor/adapters/`: del `BrowserAdapter.ts`, `StepReporter.ts`
- `studio-runner/src/guided/`: mod `schemas.json`, `types.ts`
- `studio-runner/src/reporting/`: mod `admissionClient.ts`, `envelope.ts`, `index.ts`, `reportingStepReporter.ts`, `snapshot.ts`
- `studio-runner/src/run/`: mod `browser.ts`, `browserFactory.ts`, `child.ts`, `childRuntime.ts`, `deadline.ts`, `errors.ts`, `index.ts`, `launcher.ts`, `outputRelay.ts`, `protocol.ts`, `timeline.ts`, `tree.ts`; del `playwrightAdapter.ts`
- `studio-runner/src/server/`: mod `adapters.ts`, `application.ts`, `config.ts`, `routes.ts`, `runCoordinator.ts`
- `studio-runner/src/validator/`: del `arguments.ts`, `ast.ts`, `bounds.ts`, `diagnostics.ts`, `index.ts`, `language.ts`, `referencePolicy.ts`, `references.ts`, `schema.ts`; mod `observedReplay.ts`, `observedSchemas.json`
- `studio-runner/`: mod `README.md`, `vitest.config.ts`
- `studio-runner/scripts/`: mod `check-pins.mjs`
- `studio-runner/test/`: del `adversarial-corpus.test.ts`, `executor.test.ts`, `language-surface.test.ts`, `reference-corpus.test.ts`, `reference-manifest.test.ts`, `reference-policy.test.ts`, `syntax-reference-drift.test.ts`, `validator-api.test.ts`; mod `compat.test.ts`, `contract.test.ts`, `observedReplayEquivalence.test.ts`, `observedReplayExecutor.test.ts`, `redaction.test.ts`; new `generated-contracts.test.ts`; mod (untracked since OBS-007) `observedV3TupleValidation.test.ts`
- `studio-runner/test/fixtures-tier/`: del `assertion-semantics.test.ts`, `cancel-real-chromium.test.ts`, `login-protected-session.test.ts`, `no-browser-on-refusal.test.ts`, `real-chromium.test.ts`, `recording-coverage.test.ts`, `reference-execution.test.ts`, `rerender-resolution.test.ts`, `seek-calibration-pinned.test.ts`, `text-entry-equivalence.test.ts`, `visible-only-resolution.test.ts`; mod `deadline-cleanup.test.ts`, `realRunner.ts`, `seek-measurement.test.ts`, `upload-evidence.test.ts`; mod (untracked since OBS-007) `observed-bootstrap-video.test.ts`, `secret-login.test.ts`
- `studio-runner/test/helpers/`: mod `child.ts`, `childDriver.ts`, `corpus.ts`, `guided.ts`, `harness.ts`, `pageServer.ts`, `runner.ts`; del `fakeAdapters.ts`, `reference-manifest.ts`, `webm.test.ts`, `webm.ts`
- `studio-runner/test/reporting/`: mod `reporting.test.ts`; mod (untracked since OBS-007) `observedProgressUse.test.ts`
- `studio-runner/test/run/`: del `adapter.test.ts`, `childRuntime.test.ts`, `protocol.test.ts`; mod `canary.test.ts`, `confinement.test.ts`, `errors.test.ts`, `launcher.test.ts`, `observation.test.ts`, `observedReplayProtocol.test.ts`, `outputRelay.test.ts`, `timeline.test.ts`; new `childRuntimeTeardown.test.ts`, `evidenceStoreFaults.test.ts`, `forkKillTree.test.ts`, `observationCollectorInvoke.test.ts`, `observationCollectorNaming.test.ts`, `outputRelayContainment.test.ts`, `processTableUnavailable.test.ts`, `trackTreeSampling.test.ts`, `treeAsyncReader.test.ts`, `treeAsyncReaderFaults.test.ts`; mod (untracked since OBS-007) `observedChildRuntime.test.ts`
- `studio-runner/test/server/`: mod `admission.test.ts`, `cancel.test.ts`, `concurrency.test.ts`, `deadline-outcome.test.ts`, `drain.test.ts`, `evidence.test.ts`, `hung-child.test.ts`, `observedReplayAdmission.test.ts`, `observedReplayAuthorization.test.ts`, `prelaunch.test.ts`, `resolved-value-guards.test.ts`, `routes.test.ts`, `surface.test.ts`, `terminal-order.test.ts`, `timeline.test.ts`; del `correspondence.test.ts`
- `tools/`: mod `build-studio-observed-schemas.cjs`, `check-studio-observed-contracts.cjs`
- `./`: mod `dev.sh`
- `docs/architecture/`: mod `studio-execution.md`, `studio-inference-contract-v1.md`, `studio-inference-execution-log.md`, `studio-inference-implementation-plan.md`, `studio-inference-review-2026-09-16.md`, `studio-inference-ux.md`
- `docs/runbooks/`: mod `studio-inference-rollout.md`
- `docs/specs/studio/`: mod `openapi.yaml`
- `docs/specs/studio-context/`: mod `current-state.md`
- `docs/specs/studio-observed-authoring/`: mod `delayed-state-design.md`, `publication-contracts.md`, `translation-design.md`; del `openapi-v2.yaml`, `openapi.yaml`
- `docs/specs/studio-observed-authoring/contracts/`: mod `README.md`; del `action.schema.json`, `authored-inputs.schema.json`, `binding.schema.json`, `clarification.schema.json`, `commands.schema.json`, `common.schema.json`, `dependency-proposal.schema.json`, `error.schema.json`, `fixtures.json`, `learned-plan.schema.json`, `ledger.schema.json`, `limits.schema.json`, `observation.schema.json`, `pending-bindings.schema.json`, `planning-context.schema.json`, `proposal-result.schema.json`, `result.schema.json`, `revision.schema.json`, `runner-context.schema.json`, `session-view.schema.json`, `session.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v3/`: mod `publication-fixtures.json`; mod (untracked since OBS-007) `fixtures.json`, `limits.schema.json`, `planning-fixtures.json`, `replay-profile.schema.json`, `versions.schema.json`
- `docs/stories/STUDIO-INC-001-incremental-compile/spec/`: mod `decisions.md`

Records written for 012A by other agents (not @dev deliverables): `docs/specs/studio-observed-authoring/consensus-plan.md` (§8.2 amendment, @pm, `root/pm-ack-d1.json`), `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` and `STUDIO-OBS-010.story.md` (@po placements, `root/po-placements-r9-r10.json`), this story file.

Evidence (untracked, never staged): `docs/qa/evidence/STUDIO-OBS-012A/**`. Untracked build output also rebuilt by lanes: `studio-runner/dist/**`.

Uncertain attribution (modified after T0, not named in a 012A ledger; not claimed): `.claude/agent-memory/aiox-dev/MEMORY.md` and 11 new `aiox-dev` memory files (one, `project_host_port_and_chromium_flakes.md`, is named by `run4-residual`), `.claude/agent-memory/aiox-{architect,pm,po}/**` (index files and new notes), `studio-runner/.claude/agent-memory/aiox-qa/**`, `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md`, `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-012B.story.md`. Also seen in `git status` but pre-existing (deleted before T0): `studio-runner/test/run/observedAccount.test.ts`, `studio-runner/src/run/observedAccount.ts`, `backend/.../guided/account/ReplayAccountAccess.java`. Side effect, not a 012A change: runner fixtures-tier runs rewrite untracked files under `docs/qa/evidence/STUDIO-OBS-007/` (`runner-gates` `sideEffects`).

### Proposed ownership at drafting (2026-10-09, historical)

Proposed ownership; the exact list is fixed at T0 against HEAD. `(del)` = deleted, `(mv)` = moved, `(gen)` = regenerated, `(new)` = created.

Lane K — backend
- `backend/src/main/java/com/citi/put/checks/studio/compile/**` (del after the shared gateway/authoring responsibilities below move), `compile/README.md` (del)
- `backend/src/main/java/com/citi/put/checks/studio/gateway/{GenAiGatewayTransport, StudioGatewayConfig, StudioGatewayProperties, StudioGatewaySelectionProperties, BudgetedAuthTransport, BoundedCredentialProvider, GatewayFailureClassifier, GatewayOutcome, GatewayErrorCode}.java` (mv from `compile/gateway`); neutral credential deadline/cancellation helper (extracted from the live `CompileBudget` subset); compile-only gateway classes/DTOs listed in AC-1 (del)
- `backend/src/main/java/com/citi/put/checks/studio/authoring/AuthoringLimits.java`, `ConfigurationChangeClassifier.java` (mv/reduce live save/revision guards); `StudioAuthoringMapper.java` and `LegacyStudioAdapter.java` (imports/configuration for those live guards)
- `backend/src/main/java/com/citi/put/checks/studio/guided/translation/CredentialPatternScreen.java` (mv), `GuidedSourceClassifier.java`, `GuidedTranslationConfiguration.java`, `GenAiGuidedLlmGatewayClient.java` (imports/wiring for the surviving guided path)
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioRunnerProperties.java` (mv from `compile/validator`), `HttpRunnerDispatchClient.java` (observed job only), `StudioDispatcher.java`, `StudioAcceptanceService.java`, `ExecutionReadiness.java`
- `backend/src/main/java/com/citi/put/checks/studio/StudioController.java`, `StudioService.java`, `dto/ConfirmCompileRequestDto.java` (del), `dto/EvidenceReference.java` (del), `dto/ExecutionErrorCode.java`, `dto/ExecutionStatus.java`
- `backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java` (vocabulary; `LEARN_REQUIRED`)
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java`, `StudioAcceptanceService.java` (compile readiness branches)
- `backend/src/main/resources/application.yml`, `application-*.yml` (`studio.compile.**`, `studio.authoring.v2-enabled`, `studio.runtime.pin.*` removed)
- `backend/src/test/java/com/citi/put/checks/studio/compile/**` (compile-only tests del by name; shared transport/credential tests and `NoRuntimeLlmTest` port to `studio/gateway` tests), `ConfirmCompileRouteTest`, `CompileRouteContractDivergenceTest`, `ConfirmationWriteOnceIT`, `ExactConfirmationIT`, `NoAutoConfirmTest`, `RepairLoopTest`, `SemanticHonestyTest` (del), `ExecutionVideoContractTest`, `StudioApiIT`, `readiness/ExecutionReadinessTest.java`, `readiness/DeReadyCarryForwardTest.java`

Lane K — runner
- `studio-runner/src/validator/{ast,arguments,language,references,referencePolicy,schema,bounds,diagnostics}.ts` (del; `bounds`/`diagnostics` only if artifact-1-only), `validator/index.ts`
- `studio-runner/src/executor/{operations,executor}.ts`, `executor/adapters/**` (del; artifact-1 adapters), `executor/index.ts`, `executor/pageLocation.ts` (keep if observed uses it)
- `studio-runner/src/run/playwrightAdapter.ts` (del), `childRuntime.ts` (carve), `child.ts`, `protocol.ts`, `launcher.ts` (legacy IPC mode), `errors.ts`
- `studio-runner/src/server/routes.ts` (`/v1/*` removed), `application.ts`, `runCoordinator.ts`
- `studio-runner/src/compat/{compatibility,runtime-versions}.ts`, `scripts/{write-runtime-versions,check-pins}.mjs`
- `studio-runner/test/**` artifact-1 suites and `studio-runner/fixtures/**` artifact-1 fixtures (del by name; list fixed at T0), `test/run/confinement.test.ts` (pin over the whole document), `test/pins.test.ts`, `test/runtime-versions.test.ts`, `test/compat.test.ts`

Lane C — contracts, generations, tools
- `docs/specs/studio-observed-authoring/contracts/*.schema.json`, `contracts/fixtures.json` (v1, del), `contracts/v2/**` (del), `openapi.yaml` (observed v1, del), `openapi-v2.yaml` (del), `openapi-v3.yaml` (del after fold), `contracts/README.md`, `contracts/v3/**` (one generation)
- `docs/specs/studio/openapi.yaml` (guided routes under `/api/v1/studio/guided-sessions`; compile routes removed; `validate-variables` documented)
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedInternalController.java`, `GuidedInternalSecurity.java`, `GuidedContracts.java`, `GuidedSessionService.java` (v1 branches, tuple), `GuidedSessionController.java` (`/api/v1`), `guided/publication/GuidedPublicationController.java` (`/api/v1`), `GuidedPublicationRepository.java`, `PublicationContracts.java`, `ObservedReplayPins.java`
- `backend/build.gradle.kts` (classpath copy v3 only), `backend/src/main/resources/studio/observed-contracts/**` (gen; v1/v2 removed)
- `tools/check-studio-observed-contracts.cjs`, `tools/build-studio-observed-schemas.cjs` (+ byte-identity check)
- `studio-runner/src/guided/schemas.json`, `guided/types.ts`, `validator/observedSchemas.json`, `executor/observedOperations.ts` (gen), `studio-runner/src/versions.ts`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java`, `GuidedHttpSecurityIT.java`, `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgeIntegrationTest.java` (ported), `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java` (op-count re-anchor)
- `studio-runner/test/contract.test.ts`, `contract-integrity.test.ts`, `test/helpers/openapi.ts`

Lane M — migrations and entities
- `backend/src/main/resources/db/migration/V12__tests_revisions.sql`, `V13__executions_ledger.sql`, `V14__guided_sessions.sql`, `V15__publication.sql`, `V16__scheduling.sql`, `V17__secret_use_audit.sql`, `V18__drop_plaintext_secrets.sql` (new; @data-engineer); old `V12`–`V34` (del); `backend/db/cutover/V19__studio_inference_candidate_identity.sql` (del)
- `backend/src/main/java/com/citi/put/checks/studio/entity/UITest.java`, `UITestRevision.java`, `UITestExecution.java`, `StudioDispatchLedger.java` and sibling entities/repositories with compile columns
- `backend/src/test/java/com/citi/put/checks/studio/InferenceMigrationLatestIT.java`, `guided/publication/GuidedPublicationMigrationTest.java` and the remaining Flyway-target-pinned ITs (20 current source files, historical17; named port/retirement mapping at T0)

Docs
- `docs/architecture/studio-execution.md` (dated note §4/§8.3/§8.5), `docs/architecture/studio-inference-*.md` (dated notes), `docs/specs/studio-context/current-state.md` (dated note), `docs/runbooks/studio-inference-rollout.md` (dated superseded header), `docs/stories/STUDIO-INC-001-incremental-compile/spec/decisions.md` (append-only dated note incl. the 10.51 protected-path lift)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-012A.story.md`

Not owned here: `frontend/src/**` (OBS-012B), `studio-runner/src/run/{recording,evidenceUpload,manifest}.ts` and guided recording (OBS-013), `RateLimitClassifier`/policy objects (OBS-014), `Dockerfile`/`helm-chart/**`/TLS (OBS-009), `docs/epics/UI-STUDIO-GA-PLAN.md` (coordinator-owned), `docs/qa/evidence/**` (never staged).

## Dev Agent Record

### Agent Model Used

- Reconciliation and story record (2026-10-13): Dex (@dev), Claude Opus 5.5 (`claude-opus-5-5`).
- Implementation lanes: Dex (@dev) lanes named in each ledger's `agent` field; Lane M by Dara (@data-engineer); runner-coverage by Quinn (@qa); rulings by Aria (@architect); records by Morgan (@pm) and Pax (@po); root orchestration recorded as "Codex root" in Change Log 0.2.1. The ledgers do not record the model each lane ran on, so it is not stated here.

### Debug Log References

All under `docs/qa/evidence/STUDIO-OBS-012A/`:

- T0: `baseline-backend/{result.json,named-failures.json,source-hashes.json,static-test-inventory.json}`, `baseline-runner/`, `baseline-postKC/summary.json`, `baseline-*-boundaries.json`, `baseline-native-rootcause.json`, `baseline-failure-source-reconciliation.json`, `root-execution-checkpoint.json`, `root-t0-simplification-and-ownership.json`, `aria-t0-architecture-reconciliation.json`, `po-t0-reconciliation.json`, `t0-*-inventory.json`, `data-draft/`
- Lanes: `backend-k/`, `runner-k/`, `lane-c/`, `lane-c-java/`, `fixture-token-fix/review.json`, `docs-ac7/`, `runner-coverage/`, `runner-trackTree/`, `exec-fixtures/`, `dispatch-authz/`, `lane-m/`, `lane-m-dev/`, `r1r2/`, `r6r7/`, `baseline-residual/`, `replay-cascade/`, `secret-masker/`, `d1-ceiling/`, `d2-pool/`, `c6-kill/`, `authz-grant/`, `r8-selfstop/`, `r9-dbclock/`, `r10-instrumentation/`, `r10-rev2/`, `run4-residual/`, `runner-gates/`
- Rulings and records: `root/architect-rulings-wave1b.json` (R1–R5), `root/architect-rulings-r6-r7.json`, `root/architect-rulings-d1-d2.json`, `root/pm-ack-d1.json`, `root/architect-ruling-r8-preready-selfstop.json`, `root/architect-ruling-r8-adj.json`, `root/architect-ruling-r9-r10.json`, `root/architect-ruling-r10-rev2.json`, `root/po-placements-r9-r10.json`, `root/deviation-runner-coverage-scope.json`, `root/control-window-margin.json`
- Gates: `final-gates/backend-check-run{1,2,3,4,5b}.json`, `final-gates/reconciliation.json` (run5 section filled), `final-gates/run5b-tested-worker.json`, `final-gates/run5b-joined-metrics.json`, `runner-gates-final/ledger.json`, `root/architect-gate.json` (APPROVE-WITH-CONDITIONS; G1–G3 met), `root/po-placements-gate.json`

### Completion Notes

Root moved InProgress → InReview on 2026-10-13 after run 5b green, runner-gates-final green and architect gate APPROVE-WITH-CONDITIONS (G1 runner tiers met, G2 run-5b proofs copied with paths redacted, G3 this update; G4 stale-process cleanup awaits the user). Residuals placed by @po (`root/po-placements-gate.json`): `/admission` route → OBS-014; artifact-1 version stamps → OBS-009; Chromium launch hang + host-port collision risk → OBS-009; R9-OBS-3 → OBS-011; v1 authoring read path ruling → OBS-015 T0. Expected QA posture per architect: CONCERNS (run-3 INTERNAL_ERROR under observation). Open with the user: dev-DB recreation (T3), D-B confirmation UNCONFIRMED (never asked; owner user/Platform-SRE). No commit was made by any lane (no `git add`, commit or stash).

Lanes:

- **Lane K backend** (`backend-k`): gateway closure moved to `studio/gateway` (9 classes plus neutral `CredentialBudget`); `AuthoringLimits`/`ConfigurationChangeClassifier` to `studio/authoring`; `StudioRunnerProperties` to `studio/dispatch`; `CredentialPatternScreen` to `guided/translation`; `compile/**`, compile routes, DTOs, `RuntimePinProperties`, recorded fixtures and `studio.compile.*`/`v2-enabled`/`runtime.pin` keys removed; prefix `studio.gateway` with no alias. Compile test package: 374 methods = 342 deleted + 32 ported (31 after one named drop); 33 partial drops in kept files; 3 new tests.
- **Lane K runner** (`runner-k`): artifact-1 validator/executor/adapters, `playwrightAdapter.ts`, `/v1/*` routes and legacy IPC deleted; default tier 1829 → 1245 (508 deletions, 78 drops, 18 renames, 1 added, Lane C 2/3), fixtures 385 → 230, deployment 313 → 313; all formulas hold.
- **Lane C** (`lane-c`, `lane-c-java`): one public OpenAPI (34 → 38 operations; guided routes at `/api/v1/studio/guided-sessions`; `validate-variables` documented); v1/v2 contracts and the three observed OpenAPI documents deleted (72 files); one internal mount `/internal/v2`; tuple `{contract: 3}`; regeneration byte-identity check; pins re-anchored with old/new quoted; three ITs ported with identical names and counts.
- **Lane M** (`lane-m`, `lane-m-dev`): V12–V18 placed, 23 old migration files deleted, V1–V11 byte-identical, fresh install at V18, `rdsParityLint` clean; entities updated; 20 pinned files reconciled 224 − 20 = 204.
- **Fixtures and rulings lanes**: exec-fixtures (24 classes, 290 − 3 = 287); dispatch-authz (R3 recheck, 4 new tests); r1r2 (R1/R2, 79 − 1 + 4 = 82); r6r7 (R6/R7, 23 = 23, 18 deferrals); fixture-token-fix (ReplayIT per-boundary credential refresh); docs-ac7 (11 dated superseded notes).
- **Baseline residual** (`baseline-residual`, `d1-ceiling`, `d2-pool`, `secret-masker`, `replay-cascade`, `c6-kill`): all 35 frozen baseline names disposed: 28 fixed, 5 ported by name, 2 dropped by name with a ported replacement, none skipped (`final-gates/reconciliation.json` section a).
- **Gate follow-ups**: authz-grant (run 1 `StudioAuthorizationIT` 26/27 = host sleep plus JVM/DB clock skew, no code change); r8-selfstop; r9-dbclock (`DatabaseClock`, `ObservedGrantClockIT`); r10-instrumentation (stopped on the R10b stop condition); r10-rev2 (ReplayIT credited by two consecutive green full-class runs, 38/38); run4-residual (`LocalEmbeddedPostgresConfig` port choice outside ephemeral ranges, `LocalEmbeddedPostgresPortTest`; Chromium launch deadlock recorded, not fixed); runner-coverage, runner-trackTree, runner-gates (default/fixtures/deployment green before R8, contract/codegen green).

Architect rulings and PM/PO records:

- **R1**: 19 scheduled-run tests split. V16 mints `LEARN_REQUIRED`; reachable halves ported live (4 ports); 1 compile-only method deleted; acceptance-dependent bodies deferred to OBS-009 with a fixed `@Disabled` reason.
- **R2**: 5 CSI-mutation tests re-seated on unbound executions, with control halves and DB-refusal preconditions (count-neutral).
- **R3**: observed dispatch had lost the AC-13a authorization recheck (security HIGH). It is restored as a required `StudioDispatcher` dependency before binding, grant refresh, Vault read and send.
- **R4**: unit-tier coverage excludes `src/run/{browser,child,guidedMain}.ts`; thresholds unchanged; without the exclusion `src/run/**` is 81.21%. C2 is not met for `guidedMain.ts` within the runner tiers.
- **R5**: `CONTROL_WINDOW_MARGIN_MS = 25`, guarded to be > 0 and ≤ 50; `observed-secret-control` passed 10/10 at the unchanged 2000 ms bound.
- **R6**: 8 tests on the unrepresentable ordinary revision: 7 re-seated on genuine publications and 1 converted to the schema refusal; dead fixtures deleted (23 = 23).
- **R7**: `editedWriterRace...` was a vacuous pass and is deferred (17 → 18). The deferred `updateRemoval...` 'input' arrangement is fixed under the amended deferral form.
- **DECISION-1 (D1)**: per-session input ceiling 128000 → 262144 (Java default and v3 `limits.schema.json`). @pm ACK with conditions C-1..C-4 and a consensus-plan §8.2 amendment.
- **DECISION-2 (D2)**: fix the TRACE hot path from JFR attribution. `SecretMasker` email regex made linear with byte-identical output, which also closes F-3 (ReDoS). Pool gate met (5/5 at load ≥ 4, plus 2 full-class runs); no reorder needed.
- **R8 / R8-ADJ-2**: the runner's pre-Ready self-stop now sends FINAL `RUN_ERROR` with a fixed reason. `LAUNCH_UNKNOWN` is replaced by `TIMEOUT`/`INTERNAL_ERROR`. A value-free WARN is logged on refused callbacks.
- **R8-ADJ-1, R10c, R10-OBS-1, R10-OBS-2**: deferred to STUDIO-OBS-009 AC-11 and placed by @po (`root/po-placements-r9-r10.json`).
- **R9**: replay-grant times minted and judged on the database clock; trigger, TTL and migrations unchanged.
- **R10a/R10b → R10-rev2**: test instrumentation fixed (I1–I3). Run-3 `INTERNAL_ERROR` is open under observation (R10-rev2-2). ReplayIT credit rule is two consecutive green full-class runs (R10-rev2-4), and that is met.
- **PO**: T0 GO (`po-t0-reconciliation.json`). The 18 OBS-009 re-enable names and the `editedWriterRace` non-vacuity obligation are present in STUDIO-OBS-009 (verified by grep).

Counts (section b of `final-gates/reconciliation.json`):

- Every lane formula holds.
- Static name-level cross-check: every removed or added test method in baseline-recoverable files is named in a ledger.
- Projected `studio.*` runtime after = 2000 − 440 + 41 − 38 = 1563. This is derived, not executed; root compares it with run 5.
- Runner default tier is 1317 total / 29 skipped after R8, the same skipped count as baseline.
- `@Disabled` = 24 = 18 OBS-009 deferrals (all with the exact reason) + 6 pre-existing; verified by grep on 2026-10-13. Final runs report 25 skipped = 24 + 1 pre-existing assumption skip.

Open items:

1. **Run 5 pending.** Runs 1–4 were not green: run 1 had 36 failures (host sleep and clock skew), run 2 had 0 (before R8/R9), run 3 had 28, run 4 had 3. Run-4 credit is void for `local`-profile tests after the `LocalEmbeddedPostgresConfig` change.
2. **Run-3 `INTERNAL_ERROR` → CONCERNS** (R10-rev2-2, owner @qa). It has not recurred in 2 diagnostic full-class runs. It is not yet placed in STUDIO-OBS-009, although r10-rev2 assigns that to @po.
3. **Chromium launch hang.** A Chrome for Testing 1243 startup deadlock failed `GuidedPlanningIntegrationTest.genuineDelayedOldCallbackRequiresAcknowledgedFinalMetadata [1]` in run 4. Nothing was fixed. Two hung processes were left on the host as evidence. The latent `RUNNER_PORT` and unreaped-tree hazards are recorded in `run4-residual`.
4. **Dev database recreation owed to the user.** It is destructive; the command is in `lane-m` `notRun`.
5. **D-B UNCONFIRMED.** Owner: user / Platform-SRE. The question was never sent (PO condition G4); OBS-010 carries it.
6. **No commit made.**
7. **Runner fixtures and deployment tiers** must be re-run on the final tree, because R8 changed `runCoordinator.ts`/`launcher.ts` after the last run.
8. **Run 3's 28 `DispatcherIT`/`AcceptanceIT` failures have no recorded root cause.** It is inferred to be R9 clock skew; they are green after R9 in focused runs.
9. **For @architect/@qa** (`final-gates/reconciliation.json` `gaps`):
   - `ObservedAdmissionSecurityIT` drops have no 012A ruling.
   - R4 C2 is unmet for `guidedMain.ts`.
   - The `frontend/src` AC-7 grep is not 0 (OBS-012B scope).
   - `inference.openapi.yaml` and the `claimAdmission` `/v1/runs` prose remain.
   - `versions.ts` still has `ARTIFACT_VERSION = 1`.
   - D1 changed 8 fixture sites where the ruling named about 3.
   - @qa has not confirmed the re-expressed literals.
   - CodeRabbit was not run (no WSL).

## QA Results

### Review Date: 2026-10-13

### Reviewed By: Quinn (@qa), independent SDC reviewer (not an implementer of any 012A lane)

**Verdict: CONCERNS.** No finding is high severity. Every AC is met, or its unmet part is explicitly assigned elsewhere: the AC-7 frontend half goes to OBS-012B and the AC-6 dev-DB recreation is owed to the user. Status moves InReview → Done under `story-lifecycle.md`.

**Method (10.51 AC-12).** I re-derived the results from the tree and the build outputs and treated the ledgers only as claims to test. The reviewed tree has the digest `a5315b09…badf86` (1108 files; uncommitted on HEAD `734ad704f`). A `find -newer` check found no source edit after 2026-10-13 17:40 EDT, so run 5b and runner-gates-final both ran on this tree.

**Independent checks (what I ran and what it returned):**

- **AC-6 / D-B.** `shasum -a 256` of V1–V11 against `git show d954a21c5`: 11/11 equal. `db/migration` holds exactly V1–V18. `backend/db` and `studio/compile` (main and test) are absent. V12–V18 contain no compile tables or columns; the only match is a comment at V12:4. `confirmation_source` allows `GUIDED_RUN` only. There is no `AWAITING_AUTH` or `accountRef`. The D-D columns are at V15:497-500.
- **AC-7 greps.** 24 patterns: the 11 from AC-7 plus 13 extra. Every pattern has 0 hits in `backend/src/main` and in `studio-runner/src`. The `tools/` hits are only the absence-guard literals in `check-studio-observed-contracts.cjs:793-799` and `:863`. `frontend/src` is not 0 (see REQ-001).
- **`@Disabled`.** I parsed the multi-line annotations and found 24. Of these, 18 carry the exact OBS-009 deferral reason (SharedSchedulingIT 2, StudioScheduleApiIT 16), and all 18 names appear in STUDIO-OBS-009. The other 6 already existed at HEAD. Run 5b reports 25 skipped, which is 24 plus 1 assumption skip.
- **The 35 frozen baseline failures, by name, against the run 5b XML:**
  - 31 pass under the same name.
  - `ErrorCodeConstraintMigrationIT initializationError` is now 5 real cases, all passing.
  - `[12]` and `[52]` `field=accountGrantId` were dropped. Their replacement, `[6] field=accountGrantId`, passes.
  - `otherwiseValidTupleReaches…AccountBoundary…` was renamed to `…LockedAdmissionTransactionButNeverCasOrSecretResolution` and passes.
  - Result: 35/35 disposed, none skipped, none failing.
- **Counts.**
  - Backend: diffing the baseline XML (2000 `studio.*`) against the run 5b test-task XML gives 520 removed and 83 added, so 1563. That matches the projected `2000 − 440 + 41 − 38 = 1563` exactly. Every removed name and all 59 deleted classes are named in a ledger. The only unnamed additions are the ruled index shifts `[55..60]→[52..57]`.
  - Runner: the +7 tests after R8 are 5 in `observedReplayAdmission` and 2 in `launcher`, which closes reconciliation G-5.
- **Full-check totals.** The backend XML (269 files, 21:45–22:34Z) totals 1916 tests, 0 failures, 0 errors, 25 skipped, matching `backend-check-run5b.json`.
- **Re-runs by QA:**
  - `node tools/check-studio-observed-contracts.cjs`: exit 0 (38 operations, 7 guided routes, codegen byte-identical).
  - `build-studio-observed-schemas.cjs --check`: exit 0.
  - sha256 of `docs/specs/studio/openapi.yaml` equals `BASE_SHA256` `f502160e…`, so the pin covers the whole document.
  - Runner vitest on `launcher`, `observedReplayAdmission`, `deadline-outcome` and `confinement`: 82/82 passed.
  - Runner `tsc --noEmit`: exit 0.
- **Not re-run.** [AUTO-DECISION] Re-run backend Gradle? No. The Gradle test task would replace the run 5b XML that this gate and the architect gate rely on, and the tree is proven unchanged since run 5b. CodeRabbit was unavailable (no WSL), so I did the manual fallback review below.

**Code review of the risky diffs.** All seven are sound:

- **R3, `StudioDispatcher`:** the recheck now runs before the binding lookup, grant minting, Vault read and send. A NULL CSI is refused, and the log carries no values.
- **`GuidedSessionService.stop`:** it stops the assignment only when the bootstrap context is unacknowledged.
- **`SecretMasker`:** I reasoned the equivalence independently. It holds because `@` is outside the local-part class, so the original can match only at run starts or at `\G`. The 100k-case oracle test is green.
- **`DatabaseClock`, R9:** it reads `clock_timestamp()`, does not cache, fails closed, and is used only in the two replay factories.
- **R8/ADJ-2:** `settled` is captured before `stop()`. The resulting precedence is child code, then CANCELLED, then TIMEOUT, then INTERNAL_ERROR.
- **`LocalEmbeddedPostgresConfig`:** ports come from 20000–32767 with an exclusive dual-loopback probe.
- **`IdempotencyFilter`:** excluding `/api/v1/studio/guided-sessions` keeps the earlier `/api/v3` behaviour. `GuidedHttpSecurityIT`'s 256-char non-UUID key returning 202 pins the exclusion.

**Findings (severity, owner):**

| ID | Sev | Finding | Owner |
|---|---|---|---|
| REL-001 | medium | Run-3 `GuidedPublicationReplayIT` INTERNAL_ERROR is unattributed and still under observation. It has not recurred, including in run 5b at 38/38. | @qa observation; OBS-009 AC-12 a–e |
| ARCH-001 | medium | The legacy `POST /internal/studio/executions/{id}/admission` route survives with no binding check. This is a D-A residue reachable only with the internal identity, and it fails closed. | OBS-014 (P1), before OBS-010 |
| ARCH-002 | medium | `versions.ts` `ARTIFACT_VERSION = 1` and the validator/executor versions are stamped on every observed run. This is a D-A residue. | OBS-009 (P2), before OBS-010 |
| REQ-001 | medium | The AC-7 sweep of `frontend/src` is not 0. It includes client calls to the removed `confirm-compile` (`studioApi.ts:141`, `studioInferenceApi.ts:15`). [AUTO-DECISION] I treat this as OBS-012B scope, per the AC-7 parenthetical, Out of scope, and OBS-012B AC-3. Until then, do not deploy or demo against a real backend with the pre-012B frontend. | OBS-012B AC-3 |
| ARCH-003 | medium | The v1 authoring read/promotion path may be a second generation under D-A. | @architect at OBS-015 T0 (P7) |
| REQ-002 | medium | The D-B question was never sent, so PO condition G4 was not met as written. Status: UNCONFIRMED. | user / Platform-SRE; OBS-010 |
| REQ-003 | low | The dev database has not been recreated. The command is in `lane-m` `notRun`. | user |
| TEST-001 | low | `guidedMain.ts` v8 coverage is unmeasured (R4). Its execution proof is the backend ITs, which run against an untracked `dist`. | OBS-009 (P5) |
| MNT-001 | low | The local `studio-runner/dist` keeps stale compiled artifact-1 modules because no `clean` was run before building. Nothing imports them, and the image builds clean. | OBS-009 (P5) / lanes rebuilding dist |
| REL-002 | low | Host hazards are still present: stale Gradle daemons 33891/33892 on 127.0.0.1:52100/52101, orphaned Chrome processes, and no bound on the guided Chromium launch. | user (G4); OBS-009 AC-12 (P3/P4) |
| ARCH-004 | low | R9-OBS-3: publication grants still use `Clock.systemUTC()`. | OBS-011 fold (P6) |
| MNT-002 | low | Dense one-line style in `launcher.ts`/`runCoordinator.ts` hurts reviewability. | OBS-011 reformat |

Gate: CONCERNS → docs/qa/gates/STUDIO-OBS-012A-compile-path-retirement-backend-runner-contracts-and-migration-re-baseline.yml

## Post-closure note — bridge port-proof count (2026-10-16)

Recorded by @po (Pax). This is a dated note, not a rewrite. Status (**Done**), the QA Results, the gate and the ticked port-proof item `GuidedBridgeIntegrationTest 37=37` are unchanged, and that item stays true for the tree that was reviewed. Source: @architect ruling [`STUDIO-OBS-015/execution-20261015/backend/w2-window01/aria-bridge-ruling01/ruling.md`](../../qa/evidence/STUDIO-OBS-015/execution-20261015/backend/w2-window01/aria-bridge-ruling01/ruling.md) §5 (sha256 `353d896f…`). PO record: `STUDIO-OBS-015/execution-20261015/po-bridge-disclosure/`.

- After this story closed, the STUDIO-OBS-015 H8 ruling added `stopRetryAfterCloseCompletesConfirmsWithSameKey`, so the class had 37 + 1 = 38 methods.
- During STUDIO-OBS-015, the 38 split as 9 retained in `GuidedBridgeIntegrationTest`, 16 moved under the same names to `GuidedBridgePlannedIT`, and 13 retired by name. Of the 13, 12 are RETIRE with a covering test and 1 is RETIRE-OBSOLETE. The names are in `ruling.json` `disclosure`.
- These retirements are the documented architect exception for single-path unreachability and duplication. They are not a reinterpretation of ADR-SC-005:57 ("v1 guided ITs are ported, not dropped").
- Whoever re-runs or cites the 012A port proof against a post-015 tree should use the 9 + 16 + 13 reconciliation, not 37=37.
- No reopening, waiver or QA change is implied.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from ADR-SC-005 (D-A, D-B, placement map row OBS-012A, Verification), design R3 §3/§6, the cleanup inventory rows the ADR decides (CLN-12/15/16/17/23/24/27/28/46/48) and the 2026-10-09 panel findings; three lanes with a documented split fallback; Status Draft | @sm (River) |
| 2026-10-10 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready. One story accepted with a Lane M phase gate; conditions G1–G5 and should-fixes SF-1…SF-8 in Dev Notes "PO validation — 2026-10-10". Report `.ai/STUDIO-OBS-012A-po-validation.json` | @po |

| 2026-10-12 | 0.2.1 | Ready → InProgress; dependency OBS-007 independently QA PASS, Done and SDC closed. T0 architecture/data reconciliation and fresh baseline capture released; existing acceptance scope retained. | @dev (Codex root) |
| 2026-10-12 | 0.2.2 | Limited PO T0 GO: reconcile AC-1 to the actual shared guided transport closure, retire compile-only gateway facades/DTOs, preserve credential and authoring guards, resolve validator-client disposition, and update current by-name port/Flyway counts while preserving dated history and every quality gate. No lifecycle transition. | @po (Pax) |
| 2026-10-13 | 0.2.3 | Dev record reconciled from the lane ledgers. Task checkboxes now follow the evidence (T3: dev-DB recreation owed; T4: run 5 and post-R8 runner tiers pending; T5 not started). Dev Agent Record filled: lanes, rulings R1–R10, D1/D2, PM/PO records, open items. Actual File List added from `git status --porcelain`, attributed against the T0 hashes. `docs/qa/evidence/STUDIO-OBS-012A/final-gates/reconciliation.json` added: 35/35 baseline names disposed, per-lane and name-level counts, 24 `@Disabled` = 18 + 6, AC-7 greps, gaps, run-5 placeholder. No status, AC, scope or title change; no commit. | @dev (Dex) |
| 2026-10-13 | 0.2.4 | T4 complete: final backend `check` run 5b green and final runner tiers green; architect gate APPROVE-WITH-CONDITIONS (G1–G3 met). Status InProgress → InReview. No AC/scope/title change; no commit. | root (Claude Code) |
| 2026-10-13 | 0.2.5 | QA Gate CONCERNS — Status: InReview → Done. Independent re-derivation: V1–V11 11/11, AC-7 greps, 24 `@Disabled` = 18 + 6, 35/35 baseline names, 1563 executed = projected; 6 medium / 6 low findings, all owned (gate `docs/qa/gates/STUDIO-OBS-012A-compile-path-retirement-backend-runner-contracts-and-migration-re-baseline.yml`). No commit. | @qa |
| 2026-10-13 | 0.2.6 | Administrative closure after independent QA CONCERNS (accepted); preserved Done; no lifecycle transition by @po. Provenance verified before bookkeeping: gate reviewer Quinn, reviewed 1108-file worktree digest re-derived exactly, no source newer than 2026-10-13 17:40 EDT. 12 findings owned/placed (OBS-009, OBS-011, OBS-012B, OBS-014, OBS-015 T0, OBS-010, user). Do not deploy or demo against a real backend with the pre-012B frontend. Next eligible STUDIO-OBS-012B ∥ STUDIO-OBS-013 ∥ STUDIO-OBS-014. Report `.ai/STUDIO-OBS-012A-close.json`. [closure-key: STUDIO-OBS-012A:digest:worktree-digest:sha256:a5315b093a84b03d1387a20ecd1ba84018daccb7814574755d62c5e933badf86] | @po (Pax) |
| 2026-10-16 | 0.2.7 | Post-closure dated note on the `GuidedBridgeIntegrationTest` port-proof count, from the STUDIO-OBS-015 @architect bridge ruling §5. 37=37 at 012A, plus the 015 H8 case, makes 38; in 015 this splits into 9 retained, 16 moved to `GuidedBridgePlannedIT` and 13 retired by name (12 with a covering test, 1 obsolete on the single path). Record `STUDIO-OBS-015/execution-20261015/po-bridge-disclosure/`. Status (**Done**), QA Results, AC and tasks are unchanged; no lifecycle transition | @po (Pax) |
