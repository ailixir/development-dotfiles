# Story STUDIO-OBS-006 — Exact-plan publication and deterministic replay

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-006 |
| Status | **Done** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-004, STUDIO-OBS-005 |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests]

## Story

As a Studio user, I want to save only the observed actions that passed and repeat them with fresh runtime data, so that the approved plain-language experience works with verifiable execution evidence.

## Acceptance Criteria

1. **AC-1:** Join OBS-003 session ledger, OBS-004 executed operations and OBS-005 proposals into one canonical learned plan with stable hidden graph, durable locators, action/read kinds and exact execution hashes. Never regenerate final code through an LLM. [§6]
2. **AC-2:** Deterministically lower the canonical plan into the restricted replay artifact and verify operation equivalence. Bind learned-plan hash and scoped Run admission provenance into immutable revision identity and hidden-reference policy. Ephemeral refs/sample literals cannot become replay data. [§§6–7]
3. **AC-3:** Atomically publish only after all requested assertions pass, whole-plan validation succeeds and source/configuration/scope still match. Failures, cancellation, unknown outcomes, edits and late callbacks cannot publish readiness. [§7]
4. **AC-4:** Finalization creates zero additional execution/submission actions. Record learned-from-execution separately from later replay-verified evidence. Publication conflicts retain run evidence and report not ready to repeat. Schedules remain off. [§§7,9]
5. **AC-5:** Future explicit Runs execute frozen behavior without LLM calls and recapture fresh producer values. Target/state drift stops and offers deliberate guided relearning, not automatic semantic repair. [§6]
6. **AC-6:** Coordinate language/policy/runtime/prompt pins, schema fixtures, readiness checks and rollout/rollback instructions. Keep incompatible revisions refused until the prescribed recompile/relearn path. [§10]
7. **AC-7:** Integration tests prove immutable binding, exact-hash equality, no hidden replay, source-edit races and two fresh-value replays with the same artifact; rerun existing Studio checks. [§11]

## Tasks / Subtasks

- [x] Map actual closed OBS-004/005, ordinary publication/readiness/dispatch/validator/IPC/browser seams and prepare the concrete [publication design](../../specs/studio-observed-authoring/publication-design.md). This completes documentation only; no design/PO/QA verdict is implied.
- [x] Document R2 correction of all R1 design findings/conditions: actual allocated plan/page target, complete configuration/read policy, stable validation deadline, explicit IPC/clock/control, actual ordinary service-token boundary and packaged profile support. Documentation only; independent re-review remains pending.
- [x] Obtain independent architecture/runtime/security/data review and PO revalidation; mechanically reconcile the exact proposed File List before implementation.
- [x] AC-1/2: Capture bounded immutable original observation/preparation facts before effects and atomically join the actual admission for base-enabled sessions; refuse old/missing history. Build independent ValidationBasis1 from original rows, bind basisHash through claim/verdict/final CAS and falsify mutated guards against unchanged original facts (D2/D3, C4).
- [x] AC-1/2: Implement pure exact exercised-plan reconstruction from source-order/ordinal, immutable obligations/proposals/preparations/admissions/outcomes/assertions/materialization and producer/consumer joins. Preserve hashes and original Run authorization; reject missing/extra/uncertain work.
- [x] AC-2: Implement declarative artifact2, policy3, deterministic typed lowering and independent Java/Node equivalence validation. No generated JavaScript, compile request, captured literal/default or historical node authority.
- [x] AC-3/4: Implement pre-effect publication base/epoch capture and reviewed V33 immutable origin/receipt/attempt/execution-binding constraints, including both staged V19 install orders and V21 authoring behavior. Guard newer same-source/ABA changes and clear the older compile request pointer on guided publication so its late result is discarded.
- [x] AC-3/4: Implement the production public BFF finalize POST, actual fresh Core authorization after pure runner validation, same original Run principal/CSI entitlement and atomic revision/receipt/head/session publication. No cookie persistence, background grant substitute, extra user confirmation, finalization browser action or schedule activation.
- [x] AC-3/5: Implement fresh uncached BFF/Core explicit-replay grants, preallocated execution/attempt identity, 30-second admission deadline and actual dispatch/admission enforcement; no provisional/background/old-consent substitute. Fail closed for observed scheduled execution without authority, preserve legacy schedules and prove activation mismatch using the actual scheduler (D7, C6/C7).
- [x] AC-3/5: Integrate explicit observed readiness and ordinary acceptance/dispatch/admission provenance. Preserve artifact1/policy2 and existing persisted RUN/same-principal compile auto-accept. No callback/supplied hash alone grants readiness; no gateway is reachable during finalization/saved replay.
- [x] AC-5: Implement observed-only job/profile and source-free child protocol branches through the real ordinary recording pipeline, exact locator/read guards and original native pointer/key versus fixed isolated fill/select semantics, private per-run value store, fresh producer values, scoped account/origin/policy checks and data-free diagnostics. Only OBS-007 account connection remains a later fail-closed port.
- [x] AC-3/4: Implement separate fresh current Core receipt-read authorization after session/worker expiry or head/source edits. Add real result3/session-view3 producers/schemas/examples with revision UUID plus digest, historical/current readiness and pending publication; preserve result2 compatibility and coordinate008 automatic finalize/poll/reconnect without006 first-run recording (D6, C10).
- [x] AC-4/5: Separate learned-from-execution receipt from later real replay-verified evidence; retain successful run evidence on conflicts, reject drift with deliberate relearn, and keep publication/ordinary replay free of hidden actions/model repair.
- [x] AC-6: Implement coordinated family-specific schema/language/policy/artifact/runtime/reference pins and deployment flags; preserve compatible legacy behavior. Document drain/refusal/rollback/relearn and OBS-008 automatic authenticated finalize/poll/reconnect integration.
- [x] AC-7: Run actual PostgreSQL/Core/validator/guided-worker/normal-admission/recorded-child joined tests: one initial submit, zero finalization actions, two later fresh-value replays with identical artifact and zero calls to both gateways. Cover immutable SQL constraints, edits/head/fence/cancel/expiry/late-writer/rollback races and operation/read/type/origin/reference/hash mutations.
- [x] AC-5/7: Implement and independently verify the bounded delayed-target acquisition amendment after narrow review: durable guided REFRESH/NEXT, exact private replay readiness, replay source-step deadline/cancel fence and cumulative guided passive-readiness windows, asynchronous receipts and no repeated effects or binding reads. Preserve synchronous and historical failed asynchronous evidence.
- [x] AC-4/5/7: After narrow review, settle genuine observed pre-Ready terminal ERROR through exact immutable admission/owner checks, complete raw SKIPPED/null coordinates and recording truth; retain ordinary/cancellation/STARTED boundaries and negative/rollback/idempotence evidence.
- [x] AC-1/2/5/7: After independent review, preserve accepted observed alternate choices through prospective original question evidence, immutable preparation-time acceptance witness and independent Java/Node effective-obligation derivation; prove real alternate-choice publication and two fresh model-free replays without changing source/operation/binding meaning.
- [x] Run full affected backend/runner/contract/style/build/coverage and current Studio regression checks; record exact tested source/build/worker/pins, real receipts, skips and unavailable services honestly.
- [x] Submit to independent @qa; only QA can set Done.

## Dev Notes

- Source of requirements: [consensus plan](../../specs/studio-observed-authoring/consensus-plan.md), cited sections per AC. Expert consensus is in [review-record.json](../../specs/studio-observed-authoring/review-record.json).
- Initial real-browser observation evidence: [snapshot-feasibility.json](../../specs/studio-observed-authoring/snapshot-feasibility.json). Raw ARIA included a synthetic password: do not forward it to the gateway.
- Use existing React/MUI/central API/MSW, Java 21/Spring/PostgreSQL, and typed Playwright runner boundaries. No new infrastructure/library is implied by this draft.
- Current authoring evidence DTOs are not a live observation service. ADR-SC-003 removed the English regex intent grammar. Do not restore it or require capture tokens.
- The exact proposed File List below derives from the [publication design](../../specs/studio-observed-authoring/publication-design.md). New files are proposals, not implemented capabilities. V33 is currently free; recheck before migration work. Root must replan shared ownership before implementation.
- Core config points at generic framework docs absent from this app. Use actual AGENTS.md, ARCH.md, docs/architecture/studio-execution.md, ADR-SC-003, and the approved plan as the repository-specific sources.
- Preserve unrelated working-tree changes. Never mark an unavailable service, account, model call, browser run or human pilot as passed.

### Concrete publication/replay design — 2026-10-09

The design selects a closed declarative observed artifact2 and an explicit strict branch through ordinary validation/admission/recorded-child execution. It preserves the legacy AST/reference policy and ordinary Run compile auto-accept; guided adoption has its own GUIDED_RUN/original scoped Run provenance. Source-order exact-plan joins, immutable hashes, publication epoch/base, null-safe heads, late ordinary writer invalidation and both V19/V33 orders are specified. No final code is rewritten by a model and publication performs no browser actions.

Publication authority is the real public `/api/v3/studio/guided-sessions/{id}/finalize` under fresh BFF/Core authorization. Root accepted automatic Run-client invocation on FINALIZING without another user confirmation; OBS-006 implements/tests the API and OBS-008 owns client polling/reconnect automation. Missing/expired auth or disconnect cannot be shown as published, and expired/cancelled/unknown work cannot be revived. The recorded original Run principal remains adoption authority; later explicit executions obtain their own scoped authorization.

Reviewed prerequisites: OBS-004 gate source `765212d573673085c38959683862aca11cda58b7f1998c51885a10975455661d`; final OBS-005 gate PASS at `b0761908eb0eaca411e75fc824dfaa382d9d90d556ee07b296ee19f9ae61ef57`, including 50 independent passing cases. Read-only expert inputs are `.ai/STUDIO-OBS-006-data-recon.json` and `.ai/STUDIO-OBS-006-runtime-recon.json`; they are reconnaissance, not approval of this new design. The historical absence of guided video is not disguised as replay evidence; real ordinary replay recording/timeline remains required.

The three initial technical reviews returned NEEDS_CHANGES. Revision1 addressed their 13 findings in [the data contract](../../specs/studio-observed-authoring/publication-data-contract.md) and [the closed contract appendix](../../specs/studio-observed-authoring/publication-contracts.md), mapped in `.ai/STUDIO-OBS-006-design-resolution-r1.json`. These freeze capture-before-loss/basis verification, V33/claim/FK/cutover mechanics, separate receipt reads, fresh bounded replay authority, exact wire/profile/account/byte contracts, operation/hash/config semantics and version3 public results. Original review records remain historical and unchanged. R1 re-review identified bounded source/wire consistency corrections, now mapped in `.ai/STUDIO-OBS-006-design-resolution-r2.json` and normative C12/D3–D4. Independent re-review and PO validation remain required; no user policy question is pending.

### Independent PO readiness validation — 2026-10-09

**GO (9/10) — Ready for implementation.** Report: [STUDIO-OBS-006-po-validation.json](../../../.ai/STUDIO-OBS-006-po-validation.json). The independent data R2 review approves the persistence design. Runtime and QA R2 reviews resolved the earlier findings except their shared R2-POLICY-001; the frozen minimal correction and final independent runtime policy PASS close that exact remaining mismatch. All three frozen technical documents and prior review hashes match the reviewed records. Historical pending-review wording in those frozen documents records their preparation stage; this current PO verdict does not alter their bytes or claim implementation QA approval.

Verified 155 unique literal File List paths against the coordinator's `plan-006-policy.json`, ten sequential batches and no errors. OBS-001–005 are QA-owned Done and administratively/SDC closed; V33 is currently free and must be rechecked before implementation. All seven ACs have concrete production owners and independent test oracles in publication design §9, data contract D1–D8 and closed contracts C1–C12. Original evidence, immutable claims/receipt/CAS, real BFF/Core authority, pure validator and ordinary recorded replay are required production work, not unavailable adapters. All implementation oracles remain pending; this validation ran no builds, migrations, provider calls or browser tests.

Only account connectivity remains OBS-007, automatic client finalize/poll/reconnect and first guided video remain OBS-008, and real held-out benchmark/human pilot remain OBS-009/010. Existing approved source-input policy and shared wave budget remain unchanged. CodeRabbit unavailability uses the configured independent-review fallback; no automated PASS is invented. No AC or frozen design scope changed.

## Testing

Use actual production publisher/configuration/Core client/source verifier/Node validator and normal acceptance/dispatch/admission/child/recording, with only account connection controlled. Assert independent initial-submit/fresh-value receipts and actual zero calls to both model gateways during finalization and saved runs. Test every hash/graph/guard mismatch, source/publication race, immutable database boundary, auth failure and rollback described in the design. Preserve all legacy language/reference/FULL/PATCH/Run-auto-confirm and existing Studio regressions; no mock-only publication/replay path or fabricated live-provider result.

## CodeRabbit Integration

### Story Type Analysis

Primary: Feature/integration. Complexity: high, derived from the approved cross-layer plan.

### Specialized Agents

@dev supports code checks; @dev owns execution; @architect provides the assigned technical/product gate; independent @qa owns the SDC verdict and Done transition. Database changes additionally require @data-engineer; user-facing flows require @ux-design-expert.

### Quality Gates

- [x] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push/deployment is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations with the configured 30-minute timeout; CRITICAL/HIGH findings must be remediated, lower findings recorded according to config. Focus: immutable scope, real DOM evidence, same-session dataflow, no hidden replay, and confidentiality. For API/DB work include authorization, concurrency and migration tests; frontend work includes a11y, responsive layout and centralized transport.

Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`. Check actual availability during review; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationConfiguration.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationProperties.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationController.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorization.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationBaseRepository.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationRepository.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPlanBuilder.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPlanPublisher.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/PublicationContracts.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/PublicationBudget.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedArtifactLowerer.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReferencePolicyDeriver.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedRevisionVerifier.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedValidationClient.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReplayPins.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedWireBodyAdvice.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedProductionSessionAccess.java
- backend/src/main/java/com/citi/put/checks/studio/StudioService.java
- backend/src/main/java/com/citi/put/checks/studio/entity/UITestExecution.java
- backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java
- backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioAcceptanceService.java
- backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatcher.java
- backend/src/main/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClient.java
- backend/src/main/java/com/citi/put/checks/studio/dispatch/RunJob.java
- backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatchLedgerStatements.java
- backend/src/main/java/com/citi/put/checks/studio/internal/AdmissionCasService.java
- backend/src/main/java/com/citi/put/checks/studio/internal/RunnerReportProjection.java
- backend/src/main/resources/db/migration/V33__studio_observed_publication.sql
- backend/db/cutover/V19__studio_inference_candidate_identity.sql
- backend/src/main/resources/application.yml
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPlanBuilderTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/ObservedArtifactLowererTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationMigrationTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationRaceTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorizationIT.java
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/ObservedProfileDriftTest.java
- backend/src/test/java/com/citi/put/checks/studio/InferenceMigrationLatestIT.java
- backend/src/test/java/com/citi/put/checks/studio/internal/AdmissionCasIT.java
- studio-runner/src/validator/observedReplay.ts
- studio-runner/src/validator/observedReferencePolicy.ts
- studio-runner/src/validator/observedSchemas.json
- studio-runner/src/executor/observedReplay.ts
- studio-runner/src/executor/observedOperations.ts
- studio-runner/src/run/observedReplayAdapter.ts
- studio-runner/src/run/observedAccount.ts
- studio-runner/src/run/protocol.ts
- studio-runner/src/run/launcher.ts
- studio-runner/src/run/childRuntime.ts
- studio-runner/src/run/browserFactory.ts
- studio-runner/src/run/browser.ts
- studio-runner/src/run/errors.ts
- studio-runner/src/server/routes.ts
- studio-runner/src/server/runCoordinator.ts
- studio-runner/src/server/config.ts
- studio-runner/src/server/application.ts
- studio-runner/src/server/adapters.ts
- studio-runner/src/reporting/admissionClient.ts
- studio-runner/src/versions.ts
- studio-runner/src/compat/runtime-versions.ts
- studio-runner/scripts/write-runtime-versions.mjs
- studio-runner/scripts/check-pins.mjs
- studio-runner/test/observedReplayValidation.test.ts
- studio-runner/test/observedReplayEquivalence.test.ts
- studio-runner/test/observedReplayExecutor.test.ts
- studio-runner/test/server/observedReplayRoutes.test.ts
- studio-runner/test/server/observedReplayAdmission.test.ts
- studio-runner/test/run/observedReplayProtocol.test.ts
- studio-runner/test/fixtures-tier/observed-replay.test.ts
- studio-runner/test/fixtures-tier/observed-replay-privacy.test.ts
- studio-runner/test/run/confinement.test.ts
- studio-runner/test/runtime-versions.test.ts
- studio-runner/fixtures/observed-reference/manifest.json
- studio-runner/fixtures/observed-reference/fresh-order-reference.json
- studio-runner/fixtures/observed-reference/control-value-reference.json
- studio-runner/fixtures/observed-reference/operation-mutations.json
- studio-runner/README.md
- docs/specs/studio-observed-authoring/contracts/v2/replay-artifact.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/replay-policy.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/replay-operation.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/replay-profile.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/publication.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/revision.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/publication-fixtures.json
- docs/specs/studio-observed-authoring/contracts/README.md
- docs/specs/studio-observed-authoring/openapi-v2.yaml
- docs/specs/studio/openapi.yaml
- tools/check-studio-observed-contracts.cjs
- tools/build-studio-observed-schemas.cjs
- docs/runbooks/studio-guided-authoring.md
- docs/specs/studio-observed-authoring/publication-design.md
- docs/stories/STUDIO-OBSERVED/STUDIO-OBS-006.story.md
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReplayProperties.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationEvidenceRepository.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationResultProjector.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReplayAuthorization.java
- backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedReplayConfiguration.java
- backend/src/main/java/com/citi/put/checks/studio/guided/account/ReplayAccountAccess.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionController.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedContracts.java
- backend/src/main/java/com/citi/put/checks/studio/StudioController.java
- backend/src/main/java/com/citi/put/checks/studio/internal/StudioInternalController.java
- backend/src/main/java/com/citi/put/checks/studio/internal/StrictInternalBodyReader.java
- backend/src/main/java/com/citi/put/checks/studio/scheduling/StudioScheduleProcessor.java
- backend/build.gradle.kts
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationEvidenceTest.java
- studio-runner/src/run/child.ts
- studio-runner/src/reporting/snapshot.ts
- studio-runner/test/run/observedAccount.test.ts
- studio-runner/test/server/observedReplayAuthorization.test.ts
- docs/specs/studio-observed-authoring/contracts/v2/replay-validation.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/replay-job.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/replay-ipc.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/replay-account.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/publication-canonical-vectors.json
- docs/specs/studio-observed-authoring/contracts/v3/result.schema.json
- docs/specs/studio-observed-authoring/contracts/v3/session-view.schema.json
- docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json
- docs/specs/studio-observed-authoring/publication-data-contract.md
- docs/specs/studio-observed-authoring/publication-contracts.md
- .ai/STUDIO-OBS-006-design-resolution-r1.json
- backend/src/test/java/com/citi/put/checks/studio/guided/publication/ObservedAdmissionSecurityIT.java
- .ai/STUDIO-OBS-006-design-resolution-r2.json
- .ai/STUDIO-OBS-006-design-resolution-policy.json
- studio-runner/src/reporting/httpClient.ts
- studio-runner/test/reporting/httpClient.test.ts
- studio-runner/test/helpers/openapi.ts
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationConfiguration.java
- docs/specs/studio-observed-authoring/delayed-state-design.md
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationService.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationStore.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationTest.java
- studio-runner/src/run/observationTypes.ts
- studio-runner/src/run/observationCollector.ts
- studio-runner/test/run/observation.test.ts
- .ai/STUDIO-OBS-006-delayed-design-resolution-r1.json
- backend/src/main/java/com/citi/put/checks/studio/internal/ProgressReportService.java
- docs/specs/studio-observed-authoring/pre-ready-terminal-design.md
- .ai/STUDIO-OBS-006-pre-ready-terminal-design.json
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedClarificationContextStore.java
- docs/specs/studio-observed-authoring/observed-choice-publication-design.md
- .ai/STUDIO-OBS-006-observed-choice-publication-design.json
- .ai/STUDIO-OBS-006-observed-choice-design-resolution-r1.json
- backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedHttpSecurityIT.java
- backend/src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoContractTest.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/README.md

## Dev Agent Record

### Agent Model Used

GPT-6.1 Sol, high reasoning, for the observed-choice continuation, gate fixes and final handoff. Prior implementation/model history remains in `.aiox/sdc/STUDIO-OBS-006/model-handoff-61-high.json` and component reports.

### Debug Log References

- Final developer report: `.ai/STUDIO-OBS-006-observed-choice-backend-development.json`.
- Full backend gate and exact source/class/XML/coverage/build evidence: `.aiox/sdc/STUDIO-OBS-006/broad-gates-final-pass/inventory.json` and `hashes.json` (3,597 files independently verified by root).
- Genuine browser/repository evidence: `.aiox/sdc/STUDIO-OBS-006/joined-attempts/observed-choice-attempt2-pass/`.
- Independent pure/paired proof: `.ai/STUDIO-OBS-006-observed-choice-builder-tests-development.json`; frozen runtime: `.ai/STUDIO-OBS-006-observed-choice-runtime-development.json`.
- Earlier SQL, security, race, delayed and pre-Ready reports and all red attempts are linked from the final developer report.

### Completion Notes List

Development and required gates are complete; the handoff is submitted to the coordinator for prepared independent QA. No QA verdict is claimed. Publication joins original immutable facts, independently validates exact deterministic behavior, obtains fresh scoped Core authority and atomically stores the revision/receipt. Finalization performs no browser/model actions. Later explicit Runs obtain fresh grants and recapture private producer values through the actual recorded ordinary pipeline.

Observed choices retain prospective original question/attempt/plan evidence before refresh and an immutable preparation-time accepted-answer snapshot. Both validators independently prove original and fresh nodes using the exact selected locator while preserving raw plan/operation/input/read/binding/scope. Old/missing proof, duplicates and ambiguity refuse without backfill or last-wins. SQL/domain capture refusals roll back question application and commit received usage separately. Zero/source-only proof is omitted; exact old/new schema/build pins stay strict. Compatible-build procedure and remaining account/first-guided-video boundaries are documented in the runbook and corrected session README.

| AC | Implementation and executed oracle |
|---|---|
| AC-1 | Immutable original source/plan/question/observation/preparation/admission/outcome joins and exact source-order graph; actual repository tests and 103 builder cases. |
| AC-2 | Declarative pure lowering, independent Java/Node equivalence and hashes; 26 lowerer cases and coherent paired mutations. Standalone opaque-manifest and truthful reconstructed-row oracles are explicitly separate. |
| AC-3 | V33 origin/receipt/epoch/CAS, actual fresh BFF/Core authorization and ordinary admission; migration, race, security and genuine edit/cancel/expiry/pre-Ready/rollback tests. |
| AC-4 | Genuine pure finalize performs zero browser/model/submission actions; immutable learned receipt is separate from later recorded replay; historical read/conflict evidence retained. |
| AC-5 | Genuine alternate-target publication and two fresh same-artifact recorded replays with chosen/unchosen receipts, both gateways silent; asynchronous/never-appears/cancel and schedule refusal cases retained. |
| AC-6 | Coordinated profile/schema/build/catalog, exact unsupported-build refusal, old contracts preserved and runbook rollout/rollback/compatible-build procedure. |
| AC-7 | Final full backend check/assemble/coverage, eight genuine joined plus five repository cases, 129 independent Java/Node cases and exact runtime/browser reports. |

Final backend: 2,048 PASS + 19 existing skips = 2,067 tests, zero failures/errors; cross-replica 2/2. Actual JaCoCo verification passed unchanged thresholds: 18,048/20,081 lines = 89.876%. Full Checkstyle, Spotless, SpotBugs main, RDS parity, anti-regression, Testcontainers alignment and assembly passed. Genuine/repository target 13/13 and independent builder/lowerer 129/129 passed. The runtime report states its exact 1,546 unit PASS/29 skips, 306 Chromium PASS/10 skips snapshots and final affected browser 33/33; no broader live-provider or production-image claim is made. CodeRabbit and WSL are unavailable on this Mac; configured independent-review fallback remains pending, not an automated PASS.

The 19 backend skips retain existing external co-run/Sonic/ingress/vault/revocation/provider and deferred target-policy conditions; exact names are in the full inventory. OBS-007 account connectivity, OBS-008 first guided recording/client automation, OBS-009 live benchmark and OBS-010 human pilot are separate work.

File List contains 148 actual changed/new paths. These 27 unchanged files were verification targets:

- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionConfiguration.java`
- `backend/src/main/java/com/citi/put/checks/studio/entity/UITestRevision.java`
- `backend/src/main/java/com/citi/put/checks/studio/compile/CompileStateService.java`
- `backend/src/main/java/com/citi/put/checks/studio/dto/ExecutionErrorCode.java`
- `backend/src/test/java/com/citi/put/checks/studio/readiness/ExecutionReadinessTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/readiness/DeReadyCarryForwardTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/compile/NoRuntimeLlmTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/compile/RunConfirmationTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClientTest.java`
- `studio-runner/src/executor/operations.ts`
- `studio-runner/src/executor/executor.ts`
- `studio-runner/src/executor/adapters/BrowserAdapter.ts`
- `studio-runner/src/run/outputRelay.ts`
- `studio-runner/src/run/manifest.ts`
- `studio-runner/src/reporting/envelope.ts`
- `studio-runner/src/compat/compatibility.ts`
- `studio-runner/test/run/childRuntime.test.ts`
- `studio-runner/test/run/protocol.test.ts`
- `studio-runner/test/compat.test.ts`
- `studio-runner/test/server/prelaunch.test.ts`
- `studio-runner/fixtures/lint/isolation-manifest.json`
- `backend/src/main/java/com/citi/put/checks/studio/internal/RunnerOutcomeCodes.java`
- `backend/src/main/java/com/citi/put/checks/studio/internal/InternalCallbackCodes.java`
- `backend/src/test/java/com/citi/put/checks/studio/ExecutionErrorCodeContractEscalationTest.java`
- `studio-runner/src/executor/refusals.ts`
- `backend/src/test/java/com/citi/put/checks/studio/dispatch/InternalBodyContractConformanceTest.java`
- `studio-runner/test/isolation.test.ts`

Three uncreated reservations were removed only from File List because their real production oracles run elsewhere:

| Unused proposed file | Executed replacement |
|---|---|
| ObservedRevisionReadinessTest.java | actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues, editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness, ObservedProfileDriftTest, ExecutionReadinessTest, DeReadyCarryForwardTest |
| ObservedReplayAuthorizationIT.java | queuedAndPreReadyRefusals, actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues, ObservedAdmissionSecurityIT, GuidedPublicationAuthorizationIT, RunConfirmationTest |
| GuidedPublicationResultIT.java | actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues, editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness, result3/session-view3 schemas/examples and producer contract guards |

No commits, push, deployment, lifecycle CLI or QA/Done approval were performed. Shared wave ceiling is USD500; actual spend is unknown.

## QA Results

### Independent review — 2026-10-09

Reviewed by **Quinn / obs006_qa_61_high**, GPT-6.1 Sol with high reasoning; no product/test implementation participation or edits. **PASS** — all seven ACs and the reviewed delayed-acquisition, pre-Ready failure and observed-choice amendments are met. No required fixes or waiver.

Gate: PASS → docs/qa/gates/STUDIO-OBS-006-exact-plan-publication-and-deterministic-replay.yml

Reviewed revision: `working-tree-sha256:f068570ddfeeaaa9811ad1b50e29c5ed08ba0afc7d3b99aa23e8f5e78bf020ab` (147 frozen authoritative File List entries excluding this QA-owned story metadata). The complete 148-entry pre-review snapshot, exact pre/post story hashes and permitted-section check are retained separately; this avoids a circular story digest.

Independent checks: **321 backend tests**, **274 runner unit tests**, **33 real Chromium cases**, and **5 direct compiled validator oracles** passed, with zero skips/failures. Contract checks passed. All 148 source, 77 runtime source, 256 frozen dist and 1,115 Java class hashes matched before/after. No runner rebuild. All 3,597 archived full-backend and 252 earlier joined evidence files independently matched; parsed final full gate totals are 2,048 PASS/19 existing skips/0 failure plus cross-replica2 PASS, with actual unchanged-threshold JaCoCo verification at89.876% lines.

Actual application/PostgreSQL/CoreHTTP/authenticated guided worker/pure compiled validator/ordinary admission/recorded child proved one initial submit, zero finalization effects and two fresh same-artifact replays with both gateways silent. The receipt-gated delayed target and never-appears/cancel cases, real observed-phase alternate choice after1,250ms human/model delays beyond1,000ms browser timeout, immutable original choice/preparation proof and separately committed rollback usage all passed. The genuine pre-Ready observed row passed43 negative callback/immutable probes and1 actual terminal commit rollback/retry, preserved complete untimed SKIPPED steps and playable WebM/authenticated Range206; duplicate detection is owner/sequence based, not payload-hash equality.

Report: `.ai/STUDIO-OBS-006-qa-review.json`. Reproducible source/commands/XML/recordings/hashes: `docs/qa/evidence/STUDIO-OBS-006/`; verify with `python3 docs/qa/evidence/STUDIO-OBS-006/verify-evidence.py` from repository root. Two QA harness corrections (config import and expected thrown stale-build refusal) retain their original scripts/logs and changed no product or test implementation.

CodeRabbit native CLI/WSL are unavailable; the configured independent-review fallback was applied, with no automated PASS claim. Controlled protocol/account providers and synthetic local image catalog do not prove live model accuracy/account connectivity or production image/ingress/Sonic/Vault deployment. Exact existing skip lists and bounded revocation/browser-race limits are in the report. OBS007 account connectivity, OBS008 automatic frontend finalization/first guided video, OBS009 live benchmark and OBS010 human pilot remain separate stories. Shared wave ceilingUSD500; actual spend unknown.

QA wrote only this Results/Status/Change Log, the gate/report and evidence artifacts; Dev/PO should include those QA artifacts in final administrative bookkeeping. Root alone verifies the review phase and closes/advances the wave; no close, commit, push or deployment performed here.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-09 | 0.1.1 | Added concrete exact-plan/publication/replay design, fresh BFF authority, epoch/cutover/late-writer guards, typed ordinary replay and exact proposed ownership; remains Draft pending independent reviews and PO | @architect |
| 2026-10-09 | 0.1.2 | Resolved 13 initial technical findings with normative data/wire appendices, original-evidence basis, exact authorization/public-result contracts and expanded proposed ownership; Draft pending independent re-review and PO | @architect |
| 2026-10-09 | 0.1.3 | Corrected actual allocated-plan/blank-target/configuration/policy/deadline/IPC/security contracts and all R1 mandatory conditions; preserves accepted architecture and Draft pending narrow re-review | @architect |
| 2026-10-09 | 0.1.4 | Corrected only trusted policy absence/true-object, 32-grant and grant-ID uniqueness mapping; added narrow resolution record; remains Draft | @architect |
| 2026-10-09 | 0.1.5 | Validated GO (9/10) — Status: Draft → Ready; verified final technical review resolution, all seven ACs, closed prerequisites and exact 155-path ownership; implementation evidence remains pending | @po |
| 2026-10-09 | 0.1.6 | Development started (interactive mode, approved decisions) — Status: Ready → InProgress | @dev |
| 2026-10-09 | 0.1.7 | Reserved runner HTTP client and existing test for bounded observed admission response streaming; legacy defaults unchanged | @dev |
| 2026-10-09 | 0.1.8 | Reserved existing runner OpenAPI test helper for explicit local observed-reference resolution and unchanged legacy hash comparison | @dev |
| 2026-10-09 | 0.1.9 | Reserved translation configuration for separate controller-audience token file; receiver verification remains unchanged | @dev |
| 2026-10-09 | 0.1.10 | Documented bounded delayed-state acquisition and exact additional private collector/translation ownership for narrow review; AC scope/status and frozen runtime source unchanged | @architect |
| 2026-10-09 | 0.1.11 | Resolved delayed-state review budget/freshness findings with cumulative passive-only guided windows and exact pending refresh recovery; documentation only, InProgress | @architect |
| 2026-10-09 | 0.1.12 | Reserved narrow observed pre-Ready terminal failure design and ProgressReportService seam for independent review; no lifecycle or legacy report authority change | @architect |
| 2026-10-09 | 0.1.13 | Documented prospective accepted observed-choice publication evidence and missing clarification-store ownership for independent review; earlier frozen designs and implementation lifecycle unchanged | @architect |
| 2026-10-09 | 0.1.14 | Corrected only observed-choice witness cardinality and distinct unchanged basis/request byte ceilings; reserved narrow resolution record for independent re-review, no product or lifecycle change | @architect |

| 2026-10-09 | 0.1.15 | Reserve the existing StudioContractTest and GuidedHttpSecurityIT for precise OBS006 route expectations and truthful mocked-start response compatibility, found by the full backend gate; preserve existing contract/security obligations. No source change in this metadata update. | SDC coordinator |

| 2026-10-09 | 0.1.16 | Reserve the existing video-response contract guard for the three approved OBS006 producer additions while preserving all public and legacy expectations. | SDC coordinator |

| 2026-10-09 | 0.1.17 | Reserve existing guided session README for post-gate correction of stale publication-unavailable wording; no implementation scope change | SDC coordinator |
| 2026-10-09 | 0.2.0 | Development complete: exact-plan publication/replay and reviewed delayed/pre-Ready/observed-choice behavior; full gates and exact 148-path/evidence handoff — Status: InProgress → InReview; independent QA pending | @dev |
| 2026-10-09 | 0.2.1 | QA Gate PASS — Status: InReview → Done; independent 321 backend/274 unit/33 Chromium/5 compiled checks and frozen source/evidence provenance verified, all seven ACs met | @qa |
| 2026-10-09 | 0.2.2 | Administrative closure after verified independent QA PASS and root review verification; all seven ACs and 20 development tasks complete. Preserved QA-owned Done and reviewed story substance; bound 147-source digest, 148-entry File List, QA gate/report and evidence at docs/qa/evidence/STUDIO-OBS-006/. Closure report: .ai/STUDIO-OBS-006-close.json. OBS-007 awaits identified approved account-provider configuration; live-provider, production deployment and human-pilot evidence remain later gates. [closure-key: STUDIO-OBS-006:digest:working-tree-sha256:f068570ddfeeaaa9811ad1b50e29c5ed08ba0afc7d3b99aa23e8f5e78bf020ab] | @po |
