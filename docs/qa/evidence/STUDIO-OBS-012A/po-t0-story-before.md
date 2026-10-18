# Story STUDIO-OBS-012A — Compile-path retirement (backend, runner, contracts) and migration re-baseline

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-012A |
| Status | **InProgress** |
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

1. **AC-1 — Backend compile pipeline deleted; gateway pieces relocated.** `backend/src/main/java/com/citi/put/checks/studio/compile/**` is deleted except the shared gateway pieces, which move to a neutral `studio/gateway` package with their tests: `GenAiGatewayTransport`, `StudioGatewayConfig`, `StudioGatewayProperties`, `StudioGatewaySelectionProperties`, `BudgetedAuthTransport`, `BoundedCredentialProvider`, `GatewayAuditLogger`, `GatewayErrorScrubber`, `GatewayFailureClassifier`, `GatewayPayloadSerializer`, `GatewayProvenance`, `GatewayResponseParser`, `GatewayOutcome`, `GatewayErrorCode`, `LlmGatewayClient`, `GenAiLlmGatewayClient`, `DisabledLlmGatewayClient`, `RecordedFixtureGatewayClient`/`RecordedFixtureCorpus` (≈1,580 LOC, panel dev; actual class names verified 2026-10-09 — the ADR's shortened names map to these). `CredentialPatternScreen` (wired in `GuidedSourceClassifier`) moves to `guided/translation`; `compile/validator/StudioRunnerProperties` moves to the dispatch/runner-client package (`RunnerValidationClient`, `RunnerDiagnostic`, `ValidationOutcome` follow it only if the observed validation path still uses them — otherwise deleted). `compile/incremental/**` (T-INC) and `dto/EvidenceReference` are deleted. Compile test suites (383 `@Test` in 60 files under `studio/compile`, counted by name at HEAD) are deleted by name; `NoRuntimeLlmTest` keeps the authoring-only gateway allowance with the compile edge deleted; `DeReadyCarryForwardTest` asserts zero guided calls through replay. [ADR-SC-005 D-A; "Removed / moved / kept"; "Tests"; placement map row OBS-012A; panel dev]

2. **AC-2 — Public compile routes, flags and vocabulary.** `POST /tests/{id}/compile` and `POST /tests/{id}/confirm-compile` (`StudioController`, `StudioService.confirmCompile`, `ConfirmCompileRequestDto`) are removed from code and from `docs/specs/studio/openapi.yaml`; the nine backend test files that pin them (`ConfirmCompileRouteTest`, `CompileRouteContractDivergenceTest`, `ConfirmationWriteOnceIT`, `ExactConfirmationIT`, `NoAutoConfirmTest`, `RepairLoopTest`, `SemanticHonestyTest`, and the compile expectations inside `ExecutionVideoContractTest`, `StudioContractTest`) are deleted or re-pointed by name. Configuration `studio.compile.**`, `studio.authoring.v2-enabled`, `studio.compile.incremental.enabled` and `studio.runtime.pin.*` are removed from `application*.yml` and their readers. Readiness vocabulary becomes `UNLEARNED | LEARNING | READY | NEEDS_RELEARN` (`NEEDS_RELEARN` carries `firstChangedStepId`; the detection that sets it is OBS-015 — until then the server never emits it); `409 LEARN_REQUIRED` replaces `COMPILE_REQUIRED`; `confirmation_source` is `GUIDED_RUN` only (the `MANUAL`/`RUN` values disappear with the re-baselined `V12`, AC-6). `POST /tests/{id}/validate-variables` is **kept and documented** in the OpenAPI (live Create-Check caller; inventory CLN-12). [ADR-SC-005 D-A; defaults "Readiness vocabulary"; inventory CLN-12, CLN-15, CLN-27, CLN-28, CLN-48]

3. **AC-3 — Runner artifact-1 engine and `/v1/*` routes deleted.** `studio-runner/src/validator/{ast,arguments,language,references,referencePolicy,schema}.ts`, `executor/{operations,executor}.ts` and its artifact-1 adapters, `run/playwrightAdapter.ts`, the `/v1/validate` and `/v1/runs` routes in `server/routes.ts`, the legacy IPC mode and `attachLegacyChildRuntime` are deleted; `run/childRuntime.ts` is carved down to the observed `/v2/runs` child protocol (the `protocol.ts` job handling that `/v2/runs` shares stays). Artifact-1 runner suites and fixtures (incl. the ~30k lines of JSON fixtures, panel dev) are deleted by name with the dropped count reconciled against a fresh baseline; the `Legacy*` adapters and `LEGACY_*` codes that only the v1 run path used go with it (the inventory's M12 "keep" is superseded by D-A). `confinement.test.ts` keeps its sandbox/isolation assertions and re-anchors `BASE_SHA256` over the **whole** public document (AC-5). [ADR-SC-005 D-A; "Removed / moved / kept"; panel dev]

**Lane C — contracts, generations, pins**

4. **AC-4 — One contract generation (`contracts/v3`), one internal mount.** `docs/specs/studio-observed-authoring/contracts/*.schema.json` (v1), `contracts/fixtures.json` (v1), `openapi.yaml` (observed v1), `contracts/v2/**`, `openapi-v2.yaml` and OBS-007's interim `openapi-v3.yaml` are deleted after their content is folded into `contracts/v3` and the one public OpenAPI (AC-5). The dual mount `/internal/v1|v2` in `GuidedInternalController` and the `GuidedInternalSecurity` matcher collapse to one; the v1 `versions` block (`schemaVersion == 1`), the v1-only `observe`/`outcome` service branches and the `observed-1` fallback tuple in `GuidedSessionService`/`GuidedContracts` are removed; `versions.ts` loses the v1 fallback and the nine-pin tuple collapses to `{contract: 3, build}` with the build identity `assertBuild` already checks. **Port first, then remove:** `GuidedSessionIT` (30 `@Test`), `GuidedHttpSecurityIT` (6 `@Test`) and `GuidedBridgeIntegrationTest` (1 sv1 case) are ported to v3 with the same count and names proven before any v1 removal; all 36 v1 guided ITs the panel counted are ported, not dropped. **Grep hazard (G9):** the literal `"validator":"observed-1"` in `V33:300`, `executor/observedOperations.ts` and `GuidedPublicationRepository.java` is the live validator version of the replay family until the tuple collapse renames it — path-qualify the sweep. [ADR-SC-005 defaults "Contracts"; "Contracts and pins"; design §6 "Removed by OBS-012A"; inventory CLN-16, CLN-17, G9]

5. **AC-5 — One public OpenAPI, re-anchored pins, regenerated bundles.** The seven guided-session routes move from `/api/v3/studio/guided-sessions` to `/api/v1/studio/guided-sessions` (`GuidedSessionController`, `GuidedPublicationController`) and are documented in `docs/specs/studio/openapi.yaml` — the one public document; `/api/v3` is not used. `BASE_SHA256` in `confinement.test.ts` covers the whole public document (the OBS-006 three-route exclusion is removed); `StudioContractTest` op-count covers surviving operations only; both pins re-anchored with old/new quoted. `tools/check-studio-observed-contracts.cjs` reads v3 and the one OpenAPI only; `tools/build-studio-observed-schemas.cjs` regenerates `studio-runner/src/{guided/schemas.json, guided/types.ts, validator/observedSchemas.json, executor/observedOperations.ts}` and `backend/src/main/resources/studio/observed-contracts/v3/**` from v3, and a check (runner test or Gradle task, named in evidence) fails when regeneration is not byte-identical to the checked-in bundles (panel dev: the generator is a second source of truth today). `backend/build.gradle.kts` classpath copy includes v3 only. `GuidedSessionIT`, `GuidedHttpSecurityIT`, `GuidedBridgeIntegrationTest` run against the new paths. [ADR-SC-005 defaults "Public API", "Contracts"; "Contracts and pins"; panel dev]

**Lane M — migrations and entities**

6. **AC-6 — Migrations re-baselined (D-B).** `backend/src/main/resources/db/migration/` contains exactly `V1`–`V18`: `V1`–`V11` byte-identical to `d954a21c5` (proven by `shasum` in evidence); Studio `V12`–`V33`, `V34` (OBS-007) and `backend/db/cutover/V19` are re-authored by @data-engineer as `V12__tests_revisions`, `V13__executions_ledger`, `V14__guided_sessions` (state CHECK without `AWAITING_AUTH`), `V15__publication` (v3 tuple, scope without `accountRef`, guard without account fields, **plus the per-step snapshot hash and `reusedFrom{revisionId, stepId}` provenance columns ADR-SC-005 D-D requires — OBS-015 fills them**), `V16__scheduling` (minting `OBSERVED_SCHEDULE_AUTH_REQUIRED` only if OBS-009 has not lifted observed schedules — see Decisions pending), `V17__secret_use_audit` (OBS-007's DDL), `V18__drop_plaintext_secrets` (today's `V25`). Compile-only state is not carried: `ui_tests` compile columns (V12/V16/V18/V21), `ui_test_revisions` compile identity (V18/V21/V22–V24/V29), `ui_test_step_identities`, `ui_test_compile_requests`, `ui_test_compile_outcomes`, the `MANUAL`/`RUN` confirmation sources, and the V19 cutover. Core tables `ui_tests`, `ui_test_executions` stay. `db/cutover/` does not exist afterwards. Hibernate entities (`UITest`, `UITestRevision`, `UITestExecution`, …) change in the same change; the 17 Flyway-target-pinned ITs (incl. `InferenceMigrationLatestIT`, `GuidedPublicationMigrationTest`) are rewritten to target `V18`; fresh-install and migration-count tests target `V18`. Dev databases are recreated (runbook row is OBS-010; this story records the command in evidence). **Residual (external, never faked):** only the user or Platform/SRE can confirm that nothing was ever deployed from an internal remote; the ADR records that confirmation as owed — T0 records who was asked and the answer or "unconfirmed". [ADR-SC-005 D-B; Verification "D-B"; design §6 "Migration"; panel data-engineer, devops]

**Docs and verification**

7. **AC-7 — Superseded notes and D-A verification.** Dated "superseded by ADR-SC-005" notes are added to `docs/architecture/studio-execution.md` §4/§8.3/§8.5, `studio-inference-*` docs, `docs/specs/studio-context/current-state.md`, `docs/stories/STUDIO-INC-001-incremental-compile/spec/decisions.md` (append-only), `backend/.../studio/compile/README.md` is deleted with its package, `docs/runbooks/studio-inference-rollout.md` gets a dated superseded header; `docs/specs/studio-observed-authoring/contracts/README.md` describes v3 only. Verification: `grep` for `compile/`, `confirmCompile`, `confirm-compile`, `/v1/runs`, `/v1/validate`, `artifact_schema_version = 1`, `observed-1`, `/internal/v1/`, `COMPILE_REQUIRED`, `studio.runtime.pin`, `api/v3` in `backend/src/main`, `studio-runner/src`, `frontend/src` (backend-facing strings only; the frontend sweep is OBS-012B), `tools/` → 0, guard-test string literals excepted and listed; full backend `check`, runner default/fixtures/deployment tiers and the contract tool are green on the final tree; counts reconciled as `after = baseline − named drops − named deletions + named ports`. [ADR-SC-005 "Docs"; Verification "D-A"; inventory G1, G5]

## Tasks / Subtasks

- [ ] **T0 — Baselines and reconciliation (AC-1…7).** Confirm OBS-007 Done; take fresh test baselines (backend `studio.*`, runner incl. skipped count); record the D-B external confirmation request (AC-6 residual); @data-engineer drafts the V12–V18 area migrations against the current DDL and OBS-007's V34; @architect confirms the gateway package name and which `compile/validator` clients survive; root reconciles the File List.
- [ ] **T1 — Lane K (AC-1, AC-2, AC-3).** Move gateway pieces; delete `compile/**`, routes, flags, DTOs and tests by name; delete artifact-1 engine, `/v1/*` routes, legacy IPC; carve `childRuntime.ts`; readiness vocabulary and `LEARN_REQUIRED`; document `validate-variables`. Compile-green per sub-batch.
- [ ] **T2 — Lane C (AC-4, AC-5).** Port the three v1 ITs to v3 (count/name proof); move guided routes to `/api/v1/studio` and fold `openapi-v3.yaml` into the one OpenAPI; collapse the internal mount, tuple and `observed-1`; delete v1/v2 directories and documents; regenerate bundles; add the byte-identical regeneration check; re-anchor both pins (quote old/new); contract tool green.
- [ ] **T3 — Lane M (AC-6) — @data-engineer with @dev.** Author V12–V18; delete V19 cutover and old V12–V34; update entities and the 17 pinned ITs; fresh-install test at V18; `shasum` V1–V11; recreate dev DB; record the command.
- [ ] **T4 — Docs and verification (AC-7).** Dated notes; greps recorded per item; full gates; reconciled counts; File List as actually changed.
- [ ] **T5 — Submit to independent @qa**; QA re-runs the grep and reconciliation independently (10.51 AC-12 method); only QA can set Done.

## Dev Notes

### Why this is one story (and how to split it if @po requires)

ADR-SC-005 places "removal + re-baseline in one lane" because the compile columns the re-baseline drops are read by the compile code being deleted, and the Hibernate entities change once. Three lanes are file-disjoint until the final gate: **K** (backend `compile/**`, `StudioController`/`StudioService` compile methods, runner artifact-1 files, `routes.ts`), **C** (`docs/specs/**`, `tools/`, generated bundles, `GuidedInternalController`/`GuidedInternalSecurity`/`GuidedContracts`/`GuidedSessionService` v1 branches, both pins), **M** (`db/migration`, `db/cutover`, entities, Flyway ITs). Shared: `GuidedSessionService` (C removes v1 branches; K touches readiness callers) — C first; `StudioContractTest` (K removes compile ops, C re-anchors) — one edit in C after K. **Fallback split if right-sizing fails:** 012A-1 = Lanes K + C (compile retirement and one generation), 012A-2 = Lane M (re-baseline), 012A-2 depending on 012A-1; OBS-015's `V15` dependency then points at 012A-2.

### What exists today (verified 2026-10-09)

Migrations `V1`–`V18`, `V20`–`V33` plus `backend/db/cutover/V19__studio_inference_candidate_identity.sql`; `V25` drops the core `secrets` table from inside the Studio range (becomes `V18`). `studio/compile` has 54 Java files plus `gateway/` (21 files) and `incremental/` (2 files); `compile/validator/` holds `StudioRunnerProperties`, `RunnerValidationClient`, `RunnerDiagnostic`, `ValidationOutcome`. Runner `server/routes.ts` serves `/v1/validate`, `/v1/runs`, `/v2/validate-observed`, `/v2/runs`. `GuidedSessionController` and `GuidedPublicationController` map `/api/v3/studio/guided-sessions`. `contracts/` (v1 root), `contracts/v2`, `contracts/v3` (three files before OBS-007) and `openapi.yaml`/`openapi-v2.yaml` all exist. `ui_test_step_identities`/`ui_test_compile_*` are created in `V18`/`V29`. Compile benchmark corpus at `docs/stories/UI-STUDIO-VALIDATION-20261004/benchmark/` — its 13 cases are **ported into the D-C corpus by OBS-009**, not deleted here (keep the report; it is a dated record).

### Grep hygiene (inventory G9, updated)

`observed-1` is live until the tuple collapse (path-qualify); `resetStudioMocks` ≠ `resetStudio`; the three Spring setter-injection methods (`installObservedVerifier`, `installPublicationProjection`, `initializeScheduledChecks`) are not dead; `recordEvidence` may be an OBS-013 seam — confirm before removing. The 10.51 AC-9 protected list (V2 engine methods, `EvidenceReference`, `temperature`, V18/V19, `openapi.yaml`, `confinement.test.ts`) is **lifted by ADR-SC-005** for compile-path items; record the lift as a dated note in `decisions.md` (AC-7) rather than asking for a per-path ruling.

### Decisions pending (written to the stated default)

| Question | Default applied here | ACs that change if decided otherwise |
|---|---|---|
| `OBSERVED_SCHEDULE_AUTH_REQUIRED` in `V16__scheduling` — mint it (OBS-009 Q2 outcome unknown at authoring time) or omit it. | Mint it (design §6 item 5; keeps OBS-009's refusal code valid; OBS-011 removes emitters if schedules are lifted). | AC-6 `V16` content. |
| D-B external confirmation (nothing deployed from an internal remote) unavailable at T0. | Proceed (ADR records the confirmation as owed; the evidence lists it as "unconfirmed, owner: user / Platform-SRE"). | None; OBS-010's release record carries the open item. |
| Which `compile/validator` clients survive. | `StudioRunnerProperties` moves to `studio/dispatch`; `RunnerValidationClient`/`RunnerDiagnostic`/`ValidationOutcome` survive only if `/v2/validate-observed` uses them (@architect at T0). | AC-1 relocation list. |

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

Proposed ownership; the exact list is fixed at T0 against HEAD. `(del)` = deleted, `(mv)` = moved, `(gen)` = regenerated, `(new)` = created.

Lane K — backend
- `backend/src/main/java/com/citi/put/checks/studio/compile/**` (del, except gateway pieces below), `compile/README.md` (del)
- `backend/src/main/java/com/citi/put/checks/studio/gateway/{GenAiGatewayTransport, StudioGatewayConfig, StudioGatewayProperties, StudioGatewaySelectionProperties, BudgetedAuthTransport, BoundedCredentialProvider, GatewayAuditLogger, GatewayErrorScrubber, GatewayFailureClassifier, GatewayPayloadSerializer, GatewayProvenance, GatewayResponseParser, GatewayOutcome, GatewayErrorCode, LlmGatewayClient, GenAiLlmGatewayClient, DisabledLlmGatewayClient, RecordedFixtureGatewayClient, RecordedFixtureCorpus}.java` (mv from `compile/gateway`)
- `backend/src/main/java/com/citi/put/checks/studio/guided/translation/CredentialPatternScreen.java` (mv), `GuidedSourceClassifier.java` (import)
- `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioRunnerProperties.java` (mv from `compile/validator`), `HttpRunnerDispatchClient.java` (observed job only), `StudioDispatcher.java`, `StudioAcceptanceService.java`, `ExecutionReadiness.java`
- `backend/src/main/java/com/citi/put/checks/studio/StudioController.java`, `StudioService.java`, `dto/ConfirmCompileRequestDto.java` (del), `dto/EvidenceReference.java` (del), `dto/ExecutionErrorCode.java`, `dto/ExecutionStatus.java`
- `backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java` (vocabulary; `LEARN_REQUIRED`)
- `backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java`, `StudioAcceptanceService.java` (compile readiness branches)
- `backend/src/main/resources/application.yml`, `application-*.yml` (`studio.compile.**`, `studio.authoring.v2-enabled`, `studio.runtime.pin.*` removed)
- `backend/src/test/java/com/citi/put/checks/studio/compile/**` (del by name; `NoRuntimeLlmTest` moves to `studio/gateway` tests), `ConfirmCompileRouteTest`, `CompileRouteContractDivergenceTest`, `ConfirmationWriteOnceIT`, `ExactConfirmationIT`, `NoAutoConfirmTest`, `RepairLoopTest`, `SemanticHonestyTest` (del), `ExecutionVideoContractTest`, `StudioApiIT`, `readiness/ExecutionReadinessTest.java`, `readiness/DeReadyCarryForwardTest.java`

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
- `backend/src/test/java/com/citi/put/checks/studio/InferenceMigrationLatestIT.java`, `guided/publication/GuidedPublicationMigrationTest.java` and the remaining Flyway-target-pinned ITs (17 total, named at T0)

Docs
- `docs/architecture/studio-execution.md` (dated note §4/§8.3/§8.5), `docs/architecture/studio-inference-*.md` (dated notes), `docs/specs/studio-context/current-state.md` (dated note), `docs/runbooks/studio-inference-rollout.md` (dated superseded header), `docs/stories/STUDIO-INC-001-incremental-compile/spec/decisions.md` (append-only dated note incl. the 10.51 protected-path lift)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-012A.story.md`

Not owned here: `frontend/src/**` (OBS-012B), `studio-runner/src/run/{recording,evidenceUpload,manifest}.ts` and guided recording (OBS-013), `RateLimitClassifier`/policy objects (OBS-014), `Dockerfile`/`helm-chart/**`/TLS (OBS-009), `docs/epics/UI-STUDIO-GA-PLAN.md` (coordinator-owned), `docs/qa/evidence/**` (never staged).

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from ADR-SC-005 (D-A, D-B, placement map row OBS-012A, Verification), design R3 §3/§6, the cleanup inventory rows the ADR decides (CLN-12/15/16/17/23/24/27/28/46/48) and the 2026-10-09 panel findings; three lanes with a documented split fallback; Status Draft | @sm (River) |
| 2026-10-10 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready. One story accepted with a Lane M phase gate; conditions G1–G5 and should-fixes SF-1…SF-8 in Dev Notes "PO validation — 2026-10-10". Report `.ai/STUDIO-OBS-012A-po-validation.json` | @po |

| 2026-10-12 | 0.2.1 | Ready → InProgress; dependency OBS-007 independently QA PASS, Done and SDC closed. T0 architecture/data reconciliation and fresh baseline capture released; existing acceptance scope retained. | @dev (Codex root) |
