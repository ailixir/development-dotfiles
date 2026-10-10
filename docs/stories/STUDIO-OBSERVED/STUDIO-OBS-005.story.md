# Story STUDIO-OBS-005 — Grounded translation and implicit dependency planning

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-005 |
| Status | **Done** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-001, STUDIO-OBS-002, STUDIO-OBS-003, STUDIO-OBS-004 |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests]

## Story

As a Studio user, I want to translate ordinary English using real page evidence and infer earlier-step references without commands, so that the approved plain-language experience works with verifiable execution evidence.

## Acceptance Criteria

1. **AC-1:** Add a bounded whole-checklist planning request for semantic pending information needs, followed by current-state next-action requests. Carry stable source/action IDs, allowed scope and relevant context; no source capture tokens or regex English grammar. [§§4–5]
2. **AC-2:** Under approved INPUT-POLICY-01 branch A, build gateway payloads from trusted immutable nonsecret authored source (including deliberately typed literals), opaque saved-reference/input/binding metadata and sanitized observations. Exclude raw HTML/ARIA, resolved saved-variable values, account/secret bytes, runtime/page captures and storage from initial/context/repair/error channels. Test actual serialized provider request bytes with permitted-authored and forbidden-resolved canaries. [§5; translation design §§2–4,9]
3. **AC-3:** Implement a dedicated typed guided gateway alongside unchanged FULL/PATCH compilation, with schema-constrained source/dependency, current-node/action and step-verification responses. Unvisited states cannot be claimed observed. Persist fenced attempt ownership; reserve/settle every provider send and bounded repair against the same budget before dispatch. [§§5–7; translation design §§4–5]
4. **AC-4:** Validate operation capability, source step association, node/evidence identity, binding type/order and approved origin/account independently of model confidence. Acknowledge that these checks are not proof of arbitrary English intent. [§6]
5. **AC-5:** Resolve producers before leaving their source state. Implement production v2 source/observed questions with atomic durable semantic mappings and existing public answers; observed answers require actual OBS-004 refresh and fresh correspondence, including after backend restart. Multiple plausible fields produce a grounded clarification; late missing sources stop without hidden navigation/replay. Narrow permitted DOM expansion may precede clarification. [§§4–5; translation design §§6–7]
6. **AC-6:** Add adversarial provider fixtures and an approved-provider evaluation harness for correct target/value/action/assertion, implicit references, prompt injection and malicious permitted-action substitutions. Preserve no-LLM normal replay enforcement. [§11]

## Tasks / Subtasks

- [x] Record user-approved INPUT-POLICY-01 branch A and the [concrete translation design](../../specs/studio-observed-authoring/translation-design.md). This completed documentation task is not implementation/readiness approval.
- [x] Obtain independent architecture/QA and data-engineering review, coordinate exact shared-file ownership, then obtain separate PO revalidation of this Draft. OBS-001–004 are already independently closed; preserve their historical evidence.
- [x] AC-1/2: Implement production immutable source/configuration resolution and provenance/policy classification with credential screening, without mandatory happy-path mapping or an English grammar. Implement exact source-reference selection and call actual OBS-004 validator/allocation/materialization; never accept model-written literal bytes or input IDs.
- [x] AC-1: Implement bounded whole-checklist dependencies, independent dependency admission and cumulative replanning through the completed bridge. Preserve stable server allocations and exercised producers/consumers; resolve producers before leaving source state.
- [x] AC-2: Implement branch A's positive-field model projection, separate from private Sources/runner context, and raw provider-byte tests across source/context/repair/fault channels. Deliberately authored nonsecret canaries are permitted; resolved saved-variable/account/secret/runtime canaries are forbidden.
- [x] AC-3/4: Implement backend planning/proposal orchestration with `reserveModel`, `settleModel`, typed result validation and shared repair budgets. Use dedicated guided request/response/parser types, durable single-send attempt ownership, actual reserve/settle and bounded repairs. Preserve existing FULL/PATCH compiler behavior. Use OBS-004's authenticated prepare/admit/winner-only dispatch services; no fake coordinator or second ledger implementation.
- [x] AC-3/4: Persist stable server-admitted obligation IDs and a unique immutable admission association; recover existing admission/outcome for duplicate/restarted proposals, and reject replans that rename/append already exercised work. Prove one independent submit receipt after lost result/restart even when provider repeats the action with another proposal ID; preserve distinct source-supported occurrences and required producer reads.
- [x] AC-4: Independently validate source/slot/capability/evidence/order/policy and semantic step completeness through `completeStep`/StepVerifier. A valid source span or high model confidence is not proof of intended meaning. Respect initialBlank's first-navigation-only rule and reject unsupported first operations without hidden setup actions.
- [x] AC-5: Implement v2 production question schema and pre-materialization source-question/observed-question guards while retaining the existing public answer DTO. Atomically persist original question/choice-to-semantic-need/locator/binding mapping. Recover accepted answers through `clarificationSelection`, retain their meaning across restart/re-observation and require fresh OBS-004 correspondence before admission; never reuse historical node IDs as current authority.
- [x] AC-5: Join cumulative pending allocations, successful producer evidence/local availability and real consumer edge coordinates. Stop late missing sources without navigation/replay and reject replans that erase exercised edges.
- [x] AC-6: Run adversarial semantic/provider fixtures and the joined authenticated PostgreSQL/Chromium flow using the completed OBS-004 bridge, including first-navigation receipt, input allocation, implicit reads, clarification recovery, budget exhaustion and step completion. Preserve no-LLM normal replay; record real provider availability and exact evidence honestly.

- [x] AC-1/3/5: Implement additive V32 immutable source-manifest/plan, fenced attempt/usage-audit and question persistence, with one-live-attempt constraints, atomic reservation/settlement/result/answer joins, immutable late accounting without revival and real PostgreSQL race/direct-SQL probes, strict planning route parsing/security, real coordinator continuation and production access implementing StepVerifier; account connection and publication remain OBS-007/006 only.
- [x] AC-6: Implement the narrow exact guided-authoring dependency allowance in NoRuntimeLlmTest while retaining structural restrictions against both provider paths from ordinary execution; extend DeReadyCarryForwardTest with dual-provider zero-call acceptance/readiness/dispatch evidence and mutation oracles.
- [x] Run applicable quality checks and update File List / Dev Agent Record.
- [x] Submit to independent @qa; only QA can set Done.

## Dev Notes

- Source of requirements: [consensus plan](../../specs/studio-observed-authoring/consensus-plan.md), cited sections per AC. Expert consensus is in [review-record.json](../../specs/studio-observed-authoring/review-record.json).
- Initial real-browser observation evidence: [snapshot-feasibility.json](../../specs/studio-observed-authoring/snapshot-feasibility.json). Raw ARIA included a synthetic password: do not forward it to the gateway.
- Use existing React/MUI/central API/MSW, Java 21/Spring/PostgreSQL, and typed Playwright runner boundaries. No new infrastructure/library is implied by this draft.
- Current authoring evidence DTOs are not a live observation service. ADR-SC-003 removed the English regex intent grammar. Do not restore it or require capture tokens.
- Proposed file names below reserve ownership; confirm exact seams and migration numbering during PO/architecture review. Update the story before crossing another story's owned files; replan overlaps before parallel dispatch.
- Core config points at generic framework docs absent from this app. Use actual AGENTS.md, ARCH.md, docs/architecture/studio-execution.md, ADR-SC-003, and the approved plan as the repository-specific sources.
- Preserve unrelated working-tree changes. Never mark an unavailable service, account, model call, browser run or human pilot as passed.

### Coordinated bridge remediation — 2026-10-08

[Bridge design](../../specs/studio-observed-authoring/bridge-design.md) specifies the concrete bootstrap/transport/materialization boundary. OBS-004 owns its implementation and independent gate; this story executes afterward and owns semantic source interpretation, gateway/dependency planning and durable clarification meaning. Dependencies now explicitly include OBS-003 and OBS-004. Call their completed service seams rather than duplicating persistence, local value state or dispatch authority.

**INPUT-POLICY-01 resolved — branch A approved:** the user answered yes to deliberate nonsecret literals in immutable checklist text reaching the LLM. The [decision record](../../../.aiox/waves/STUDIO-OBSERVED/input-policy-01.json) excludes resolved secrets, saved-variable values and captured page values. AC-2 and the consensus/ADR privacy language now explicitly distinguish these classes. No new user approval is required. Production classification is provenance/policy plus bounded credential screening, not a promise of universal secret detection. [Translation design](../../specs/studio-observed-authoring/translation-design.md) defines concrete production behavior and tests.

The shared source-reference contract itself does not depend on this choice: OBS-004 accepts classified immutable spans/configuration references, validates and allocates them, then persists/transports the actual table. This story decides how semantics select those references and what approved source projection reaches the provider. A controlled bridge test is not proof that production English extraction exists. Model-facing v2 planning/source-selection schemas and examples are now reserved here under branch A; changes to OBS-004's completed bridge require coordinated ownership review.

**Concrete clarification integration prerequisite from OBS-004:** v2 commands already define `clarify` answers; the missing contract is v2 `clarification.schema.json` used by the production question creation seam. This story must implement that contract and trusted semantic question creation before claiming a complete v2 clarification flow. OBS-004 rejects request/session version mismatches and tests an existing v2 answer → authenticated refresh using an explicitly labelled trusted question fixture. Its transport proof does not establish production question generation. Coordinate ownership of the question schema and relevant controller/service integration at readiness review; preserve v1 fixtures and behavior.

Preserve `clarificationSelection` and its historical IDs while persisting the associated semantic mapping; fresh observation must re-establish the chosen meaning. Successful source-span checks, DOM proof and operation validation constrain execution but do not prove arbitrary-English intent. Only production account connection and exact publication remain later fail-closed ports. Required source/classification/gateway/StepVerifier/question/coordinator functionality must be concrete production OBS-005 code, exercised with the actual closed bridge. Status stays Draft; this design amendment is neither implementation nor a new readiness/QA verdict. The prior PO report below remains historical evidence.

### Approved-policy readiness amendment — 2026-10-08

The [translation design](../../specs/studio-observed-authoring/translation-design.md) maps the historical BOOT-001/JOIN-001/INPUT-001 and clarification findings to actual closed OBS-004 seams and concrete OBS-005 implementation. It preserves FULL/PATCH compiler contracts, specifies immutable source classification/exact spans, durable model attempts and V32 persistence, source/observed questions with real public answers, production StepVerifier and joined PostgreSQL/provider-HTTP/Chromium evidence. Dara's independent persistence advice is incorporated: session → current ui_tests → translation → bridge lock order, immutable source/plan/question records, one-live-attempt constraint and late-usage audit retaining reservations without reviving authority. These are design obligations, not passing tests. Shared ownership and independent data/architecture/QA review precede a fresh PO verdict. Status remains **Draft**; the historical review below is not overwritten.

### PO readiness review — 2026-10-08

**Historical NO-GO (5/10); superseded by the independent revalidation below.** Archived validation report: [STUDIO-OBS-005-validation-20261008-no-go.json](../../../.ai/STUDIO-OBS-005-validation-20261008-no-go.json). The completed dependency gates validate their bounded foundations, not a joined guided execution path. These findings require coordinated architecture/ownership clarification before implementation; they do not reopen the already accepted collector or persistence scope.

- Read the normative [OBS-001 contracts](../../specs/studio-observed-authoring/contracts/README.md), [OpenAPI](../../specs/studio-observed-authoring/openapi.yaml), and the current [OBS-003 session integration boundary](../../../backend/src/main/java/com/citi/put/checks/studio/guided/session/README.md). `GuidedSessionService` already owns durable admission, dispatch consumption, model reservation/settlement, step completion and scoped clarification-selection recovery. The actual collector is `studio-runner/src/run/browser.ts#createBrowserObservationSession` with `ObservationSession.observe/matches`; it does not orchestrate or execute actions.
- **BOOT-001 — initial navigation:** a fresh browser has no approved HTTP(S) observation; the collector rejects an unapproved `location.origin`, while every current action proposal/admission requires a committed observation and `PROPOSING` state. Specify the trusted bootstrap/first-navigation contract, ownership and ledger evidence for the first authored step. Do not fabricate an observed origin, navigate outside recorded authorization, silently repeat the first navigation, or assume a later account adapter eliminates this gap. A controlled blank-session → first authored destination test must exercise the chosen contract.
- **JOIN-001 — control and dependency ownership:** the declared plans/proposals/dependency-admissions/context routes are not implemented by `GuidedInternalController`. Assign the backend orchestration and durable cumulative pending/evidenced binding responsibilities to concrete files; specify each sender/receiver, service role/audience, fence, idempotency response and runner dispatch handoff with OBS-004. Include existing `reserveModel`, `settleModel`, `completeStep`/`StepVerifier`, `clarification`, and `clarificationSelection` seams. Record OBS-003 as an actual prerequisite and coordinate the dependency/File List/wave ownership update through the coordinator before shared-file edits. The current header is preserved pending that coordinated change.
- **INPUT-001 — trusted input materialization:** `GuidedSessionAccess.Snapshot` currently supplies scope/source-step metadata/account connection, not the immutable English source plus authored-input table. Identify the trusted source/configuration resolver, allocation/mapping rules and storage identity for `authored-inputs`, sanitized source context, `authoredInputsHash` and `runner-context`. Resolve ambiguous authored literals through the approved clarification mechanism, without a regex English grammar or model-created values. Specify the safe ID/type/step metadata supplied to the planner while keeping resolved inputs/account/runtime values out of serialized gateway bytes.
- Preserve the selected clarification already saved by OBS-003. `clarificationSelection` returns historical choice/node/binding identity, document/generation, revisions and scope; it is not current evidence. Specify how OBS-005 retains the question's semantic mapping and how OBS-004 revalidates the selected target against the new observation without selecting another plausible field or losing the answer on restart. Retain cumulative pending allocations and all exercised producer/consumer edges across replanning.
- Production account connection remains the fail-closed OBS-007 port; exact-plan publication remains the fail-closed OBS-006 port. These are accepted later dependencies, not permission to build a disconnected mock-only execution loop or report provider/account/replay success prematurely.

### Independent PO revalidation — 2026-10-08

**GO (9/10) — Ready for implementation.** Current report: [STUDIO-OBS-005-validation.json](../../../.ai/STUDIO-OBS-005-validation.json). Approved INPUT-POLICY-01 A, the reviewed concrete translation design, current closed bridge seams and the exact 58-file sequential reservation resolve BOOT-001/JOIN-001/INPUT-001 and the clarification/test-ownership findings. OBS-001–004 are Done with passed SDC closure. All 58 literal paths match the coordinator's ten-batch plan; V32 is currently free and must be rechecked before creation.

Production source/classification, typed guided gateway, fenced accounting, atomic obligation/admission and clarification meaning, coordinator continuation and StepVerifier remain mandatory implementation work. Provider-wire, real PostgreSQL and authenticated Chromium evidence is required by the design; none is claimed passed for OBS-005 here. Only account connection (007), exact publication (006), held-out benchmark (009) and human pilot (010) remain their agreed later scope. Current shared checks passed 124 v1 fixtures/109 examples and 219 v2 fixtures/49 examples. The 004 reviewed manifest has only the approved bridge-design documentation amendment; its other 95 entries are unchanged. CodeRabbit unavailability uses the documented independent-review fallback, not an invented automated PASS. Earlier Draft wording records historical amendment states and is superseded by this readiness verdict.

## Testing

Gateway-spy byte assertions, model-schema parsing tests, budget/repair tests, semantic mutation corpus and no-runtime-LLM boundary checks. Real-provider evaluation follows frozen corpus, not cherry-picked retries.

Before revalidation, make the joined controlled-browser/model-seam test ownership explicit: first navigation from a fresh session, real committed observation, schema-constrained provider response, shared model budget, durable admission/one dispatch, local producer/consumer dataflow, resumed clarification and verified step completion. Use independent server receipts for effects and inspect actual serialized provider bytes, including source/context/repair channels. The approved-provider harness may report unavailable credentials honestly; the later held-out benchmark and human pilot remain OBS-009/010. Existing shared-contract verification passed at readiness review: `node tools/check-studio-observed-contracts.cjs` (124 fixtures, 109 OpenAPI examples).

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

Exact repository-relative implementation/documentation reservations follow. New paths are not claims of existing implementation. Root records sequential shared ownership before implementation; design rationale is in [translation-design.md §8](../../specs/studio-observed-authoring/translation-design.md#8-routes-authentication-and-ownership). Preserve V30/V31, historical v1 schemas/OpenAPI, unrelated edits and closed OBS-004 runner behavior. Verify V32 availability. No runner implementation files are owned here. Any additional shared path requires a coordinator amendment.

- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationService.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationCoordinator.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationConfiguration.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationProperties.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningController.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationStore.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedSourceSnapshotRepository.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedSourceClassifier.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedProductionSessionAccess.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedSourceInputResolver.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedPromptAssembler.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedModelProjection.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedProposalValidator.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedDependencyPlanner.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedClarificationContextStore.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedStepVerifier.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedLlmGatewayClient.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedModelRequest.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedModelResponse.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedCallBudget.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedResponseParser.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GenAiGuidedLlmGatewayClient.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionConfiguration.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedWireBodyAdvice.java
- backend/src/main/java/com/citi/put/checks/studio/guided/session/README.md
- backend/src/main/java/com/citi/put/checks/studio/compile/gateway/GenAiLlmGatewayClient.java
- backend/src/main/java/com/citi/put/checks/studio/compile/gateway/GenAiGatewayTransport.java
- backend/src/main/java/com/citi/put/checks/studio/compile/gateway/StudioGatewayConfig.java
- backend/src/main/resources/db/migration/V32__studio_guided_translation.sql
- backend/src/main/resources/studio/guided-output-contract.md
- docs/specs/studio-observed-authoring/contracts/v2/planning-context.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/source-selection.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/guided-model-response.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/guided-planning-commands.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/clarification.schema.json
- docs/specs/studio-observed-authoring/contracts/v2/planning-fixtures.json
- docs/specs/studio-observed-authoring/openapi-v2.yaml
- docs/specs/studio-observed-authoring/contracts/README.md
- tools/check-studio-observed-contracts.cjs
- backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedSourceInputResolverTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedSourceClassifierTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedStepVerifierTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationConcurrencyTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationMigrationTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningIntegrationTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedGatewayPrivacyTest.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedProviderEvaluationTest.java
- backend/src/test/java/com/citi/put/checks/studio/compile/gateway/GenAiLlmGatewayClientTest.java
- backend/src/test/java/com/citi/put/checks/studio/compile/NoRuntimeLlmTest.java
- backend/src/test/java/com/citi/put/checks/studio/readiness/DeReadyCarryForwardTest.java
- docs/specs/studio-observed-authoring/translation-design.md
- docs/specs/studio-observed-authoring/consensus-plan.md
- docs/specs/studio-observed-authoring/bridge-design.md
- docs/architecture/ADR-SC-004-observed-authoring.md
- docs/stories/STUDIO-OBSERVED/STUDIO-OBS-005.story.md
- docs/stories/STUDIO-OBSERVED/README.md

- docs/qa/evidence/STUDIO-OBS-005/backend-before-usage-fix-results.json
- docs/qa/evidence/STUDIO-OBS-005/backend-before-usage-fix-results.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/backend-build-manifest.json
- docs/qa/evidence/STUDIO-OBS-005/before-usage-fix-source.json
- docs/qa/evidence/STUDIO-OBS-005/correction-results.json
- docs/qa/evidence/STUDIO-OBS-005/correction-results.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/coverage-data.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/joined-metrics.json
- docs/qa/evidence/STUDIO-OBS-005/quality-logs.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/quality-results.json
- docs/qa/evidence/STUDIO-OBS-005/runner-logs.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/runner-results.json
- docs/qa/evidence/STUDIO-OBS-005/worker-manifest.json
- docs/qa/evidence/STUDIO-OBS-005/source-manifest.json
- .ai/STUDIO-OBS-005-development.json
- .ai/STUDIO-OBS-005-dod.md
- .ai/decision-log-STUDIO-OBS-005.md

- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/build-manifest.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/coverage-data.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/focused-history.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/full-results.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/full-run-before-retry-followup.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/full-run-summary.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/gateway-correction-results.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/gateway-correction-results.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/joined-metrics.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/preserved-history.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/quality-logs.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/quality-results.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/runner-reuse.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/summary.md
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/tested-source.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/worker-manifest.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/source-manifest.json
- .ai/STUDIO-OBS-005-fixes-r1.json

- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/review-source-manifest.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r1/review-handoff.json

- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/build-manifest.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/coverage-current.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/delayed-callback-after-false.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/delayed-callback-after-true.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/delayed-callback-before-false.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/delayed-callback-before-true.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/focused-results.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/joined-metrics.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/preserved-history.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/quality-results.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/reuse-verification.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/summary.md
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/test-results.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/test-results.tar.gz
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/tested-source.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/worker-manifest.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/source-manifest.json
- .ai/STUDIO-OBS-005-fixes-r2.json

- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/review-source-manifest.json
- docs/qa/evidence/STUDIO-OBS-005/fixes-r2/review-handoff.json

## Dev Agent Record

### Agent Model Used

Dex (@dev), assigned OBS-005 implementation lead.

### Debug Log References

Development record: `.ai/STUDIO-OBS-005-development.json`; DoD: `.ai/STUDIO-OBS-005-dod.md`; decisions: `.ai/decision-log-STUDIO-OBS-005.md`. Durable exact result archives, coverage data and source/worker/build manifests: `docs/qa/evidence/STUDIO-OBS-005/`. Independent readiness evidence remains `.ai/STUDIO-OBS-005-validation.json`.

### Completion Notes List

Implemented production source classification/materialization, typed guided provider projection, durable fenced model attempts, immutable questions/answers, dependency/obligation admission and deterministic completion through the actual OBS-004 bridge. Account connection and publication remain later explicit ports. Current affected run: 199 pass, one unavailable live-provider skip; actual joined PostgreSQL/provider HTTP/Chromium cases: 10 pass. Both clarification targets have independent field-specific receipt assertions; restarted/repeated submit produces one receipt.

Historical broad run: 1726 tests, one stale foundation migration expectation failure, 19 skips; cross-replica 2/2 pass. Approved V31 foundation correction and guided thought/tool usage accounting are covered by the subsequent successful 200-test affected run. No final-source unfiltered broad PASS is claimed. Combined coverage gate passes at 88.06% overall/90.31% guided translation; all existing thresholds preserved. Backend build/static checks, scoped format/Checkstyle, contracts and runner build/type/lint/pins pass; runner regressions: 1269 unit and 273 fixture passes with existing skips.

Controlled default flow: eight provider requests (one source plan, seven next-action selections), zero optional verification/repair, 124722 reserved input and 16384 output, five actions, one submit. These are controlled integration counts, not real-model cost or accuracy. CodeRabbit/live-provider evaluation unavailable; independent QA pending. No arbitrary-English guarantee, Done, commit, push or deployment.


### QA remediation R1

Developer remediation is complete and root apply_qa_fixes verification passed. The original executor has transitioned the story to InReview and submitted it through the coordinator for independent re-review. SEC-001, REL-001, REL-002 and TEST-001 are addressed per the independent approved design at `.ai/STUDIO-OBS-005-fix-design-review-r1.json`. Original QA FAIL evidence/verdict remains unchanged. Current record: `.ai/STUDIO-OBS-005-fixes-r1.json`; detailed trace and exact artifacts: `docs/qa/evidence/STUDIO-OBS-005/fixes-r1/summary.md`.

Full sweep:1755 tests,1735 passes, one legacy retry-fixture timeout,19 skips; cross-replica2/2 pass. All32 OBS-005 joined cases pass. The unchanged retry test passed in isolation; its fixture-only deadline was then stabilized while retaining exact three-request/three-attempt assertions, and the full24-test gateway suite passed. Current-source coverage88.47% overall/92.67% translation and static/build/contract checks pass. The broad FAIL is not relabelled PASS. No runtime source/schema/production-limit changes followed that sweep. Worker236-file hash remains the closed004/tested value.

CodeRabbit and live-provider evaluation remain unavailable; no QA approval or arbitrary-English guarantee is claimed. The executor metadata handoff is complete; independent re-review is pending. Final review source binding: `docs/qa/evidence/STUDIO-OBS-005/fixes-r1/review-source-manifest.json`; metadata-only comparison: `docs/qa/evidence/STUDIO-OBS-005/fixes-r1/review-handoff.json`.

### QA remediation R2

R1 independently resolved SEC-001, REL-002 and TEST-001. R2 addresses the sole remaining REL-001 with exact final metadata acknowledgement, bounded same-context retries and a versioned READY proof; callback timing is never authority and old unproved READY cannot rebuild/replay. Current record: `.ai/STUDIO-OBS-005-fixes-r2.json`; exact evidence: `docs/qa/evidence/STUDIO-OBS-005/fixes-r2/summary.md`.

The complete affected group passed 232 tests (231 passes, one unavailable live-provider skip), including 40 actual joined PostgreSQL/provider HTTP/worker/Chromium cases. Coverage and quality gates pass at 88.52% overall / 92.89% translation. Exact class/worker checks justify unchanged evidence reuse; original/R1 broad failures and QA verdicts remain historical and unmodified. No source/test changes follow the frozen tested snapshot; only developer bookkeeping is updated. Root apply_qa_fixes verification passed. The original executor has transitioned the story to InReview and submitted it through the coordinator for independent R2 re-review. Final review source binding: `docs/qa/evidence/STUDIO-OBS-005/fixes-r2/review-source-manifest.json`; metadata-only transition record: `docs/qa/evidence/STUDIO-OBS-005/fixes-r2/review-handoff.json`.

## QA Results

Not reviewed. No quality verdict assigned.


### Independent review — 2026-10-08

Reviewed By: Quinn (@qa /root/obs005_peer; independent from all OBS-005 implementers)

Reviewed Revision: `sha256:a9cf72b6bcf098386248a9a392e5b973a27ae33cb943405cc9c9408967d29d12`

**FAIL.** Independent review verified the final 59-file source manifest, 236 worker files, assembled artifacts and corrected 200-test XML archive (199 pass, one unavailable live-provider skip). The historical broad migration failure remains recorded honestly. CodeRabbit is unavailable; the configured independent source-review/adversarial-probe fallback was used. No implementation fixes were made.

Three independent probes fail while all ten inherited actual PostgreSQL/provider-HTTP/authenticated Chromium cases pass again:

- **SEC-001:** a selected source can be included unused while the action uses the other destination; enforce choice-to-obligation/slot meaning.
- **REL-001:** the actual coordinator routes a persisted `MATERIALIZE` continuation to proposals after interruption; recover pre-context stages. The adjacent `NEXT`-before-first-context window has the same missing recovery path by source inspection.
- **REL-002:** late known overage committed after entry reconciliation does not block the next actual provider send; reconcile atomically at each attempt reservation/send claim.
- **TEST-001:** add required frozen hostile observed-content/prompt-injection and permitted-action substitution cases to controlled tests and the opt-in provider harness. Live credentials are not required to close this coverage gap.

Full requirement mapping, references, commands and evidence: [independent review](../../qa/evidence/STUDIO-OBS-005/independent-review/review-report.json). Approved authored-literal policy, fixed budgets, ordinary replay isolation and later OBS-006/007 boundaries remain unchanged. Deterministic checks do not prove arbitrary English meaning.

Gate: FAIL → docs/qa/gates/STUDIO-OBS-005-grounded-translation-and-implicit-dependency-planning.yml

Lifecycle: InReview → InProgress. Return to the implementation owner for `apply-qa-fixes`, then independent re-review.


### Independent re-review R1 — 2026-10-09

Reviewed By: Quinn (@qa /root/obs005_peer; independent R1 reviewer, not an implementer)

Reviewed Revision: `sha256:2d755932a4615f4ae88b4ea2c34408091579d3a426a17fc356b232c6606b5076`

**FAIL — REL-001 remains open.** SEC-001, REL-002 and TEST-001 are independently resolved. All 32 current joined cases and the three ported original probes passed (35 total); malicious source substitutions were confirmed valid under the current schema before semantic rejection.

A new real-worker callback race fails: the worker receives a context with zero allocations and its authenticated bootstrap callback is delayed. Production planning commits a pending snapshot with one later allocation. When the old callback arrives, `hadEvidenceBeforeDelivery=false` permits `READY` with **zero deliveries of the new metadata**. The probe was reproduced twice without fabricating evidence or inserting DB authority. This violates mandatory REL-R1-2/4; it demonstrates premature readiness, not duplicate browser effects or bypass of later preparation checks.

Require delivery provenance for the exact pending snapshot or a successful same-context metadata acknowledgement when the callback cannot prove it. Preserve the already-passing lost-response, prior-callback, stable-allocation and one-time READY behavior.

All 59 current source hashes, 236 worker files, assembled classes/jars and R1 XML provenance verified. The R1 broad retry-fixture failure remains recorded; its named 24-test correction preserves exact retry assertions. Independent contracts pass. Original review artifacts are unchanged and the initial gate is archived. CodeRabbit/live-provider evaluation remain unavailable; no model-accuracy claim or later-story requirement is added.

Evidence and requirement/condition inventory: [R1 independent review](../../qa/evidence/STUDIO-OBS-005/independent-review-r1/review-report.json).

Gate: FAIL → docs/qa/gates/STUDIO-OBS-005-grounded-translation-and-implicit-dependency-planning.yml

Lifecycle: InReview → InProgress. Remaining correction: REL-001 delayed earlier-context callback versus later allocation delivery.


### Independent re-review R2 — 2026-10-09

Reviewed By: Quinn (@qa /root/obs005_peer; independent R2 reviewer, not an implementer)

Reviewed Revision: `sha256:b0761908eb0eaca411e75fc824dfaa382d9d90d556ee07b296ee19f9ae61ef57`

**PASS. All four original high findings are independently resolved.** The genuine delayed older-context callback now requires actual acknowledgement of the exact pending metadata before READY. The ported probe records one later metadata delivery, one original bootstrap callback, stable context/allocation identity and no extra model/browser/action effect. Private delivery/proof identity, bounded same-context retries, lost-response recovery, delivery-cap committed refusal, old unproved READY rejection and harmless proved READY repeats all pass.

**50 independent cases passed:** all 40 current joined PostgreSQL/provider HTTP/authenticated worker/Chromium cases, the three original initial probes, the R1 delayed-callback probe and six additional post-ACK source/configuration/pin/fence/lease/cancel mutations. The current affected 232-test archive also verifies231 passes and one explicitly unavailable live-provider skip. Privacy/source-choice/hostile-page/budget/single-submit/completion/ordinary dual-provider zero-call boundaries remain passing.

All 59 review-source hashes, assembled classes/JARs and 236 worker files match the tested evidence. Initial/R1 failures and their named corrections remain historical; no final unfiltered broad PASS is claimed. CodeRabbit remains unavailable and the independent fallback is complete. Controlled evidence does not claim live-model accuracy, arbitrary-English proof or completion of later OBS-006/007 ports. No implementation edits, commits or pushes were made in QA.

Evidence, requirement mapping and reproduction: [R2 independent review](../../qa/evidence/STUDIO-OBS-005/independent-review-r2/review-report.json). Prior FAIL gate/history preserved.

Gate: PASS → docs/qa/gates/STUDIO-OBS-005-grounded-translation-and-implicit-dependency-planning.yml

Lifecycle: InReview → Done. Hand back to root for mechanical verification and administrative closure.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-08 | 0.1.1 | Validation NO-GO (5/10) — initial-navigation contract, backend/runner ownership and trusted authored-input materialization require coordinated clarification; remains Draft | @po |
| 2026-10-08 | 0.1.2 | Recorded sequential dependency on OBS-003/004, semantic resolver and clarification ownership, concrete bridge integration tasks and open INPUT-POLICY-01; preserved privacy AC and Draft without a new readiness or QA verdict | Architecture remediation |
| 2026-10-08 | 0.1.3 | Recorded approved INPUT-POLICY-01 A; added concrete typed gateway/source/classification/attempt/question/verification/dispatch design and exact implementation ownership; historical NO-GO retained, Draft pending independent revalidation | @architect |
| 2026-10-08 | 0.1.4 | Reserved exact no-runtime-LLM guard tests with narrow guided-authoring exception and dual-provider mutation/zero-call evidence; expanded all ownership paths for mechanical parsing; Draft preserved | @architect |
| 2026-10-08 | 0.1.5 | Clarified stable obligation-to-admission identity and joined lost-result/restart no-repeat evidence; existing V32/service/schema ownership unchanged, Draft preserved | @architect |
| 2026-10-08 | 0.1.6 | Validated GO (9/10) — Status: Draft → Ready; archived historical NO-GO, verified approved policy, closed prerequisites and exact 58-file ownership | @po |
| 2026-10-08 | 0.1.7 | Started authorized implementation after verified PO GO; Ready → InProgress; interface freeze and specialist partitions recorded | @dev |
| 2026-10-08 | 0.1.8 | Development complete — InProgress → InReview; production translation and reviewed model refinement implemented, exact regression/correction/coverage evidence recorded; independent QA pending | @dev |
| 2026-10-08 | 0.1.9 | QA Gate FAIL — Status: InReview → InProgress — source-choice integrity, durable continuation, late-usage/send race and adversarial coverage fixes required | @qa |
| 2026-10-09 | 0.1.10 | Applied all four QA findings with independently approved occurrence-binding/bootstrap design, atomic late accounting and hostile-evidence tests; exact full/correction evidence recorded; remains InProgress for coordinator verification and independent re-review | @dev |
| 2026-10-09 | 0.1.11 | QA fixes verified — Status: InProgress → InReview; submitted for independent re-review with metadata-only final source binding; historical QA FAIL preserved | @dev |
| 2026-10-09 | 0.1.12 | QA Gate FAIL R1 — Status: InReview → InProgress — SEC-001/REL-002/TEST-001 resolved; REL-001 retained for delayed earlier-context callback granting READY without current metadata delivery | @qa |
| 2026-10-09 | 0.1.13 | Applied remaining REL-001 with exact metadata ACK proof, bounded same-context recovery and old-READY refusal; 232-test affected/quality evidence recorded; remains InProgress for coordinator verification and independent R2 review | @dev |
| 2026-10-09 | 0.1.14 | R2 fixes verified — Status: InProgress → InReview; submitted for independent R2 re-review with metadata-only source binding; prior QA FAIL verdicts/history preserved | @dev |
| 2026-10-09 | 0.1.15 | QA Gate PASS — Status: InReview → Done — all four original findings independently resolved; 50 independent cases pass with exact R2 source/evidence binding | @qa |
| 2026-10-09 | 0.1.16 | Administrative closure after independent R2 QA PASS; preserved QA-owned Done. Verified accepted 59-file revision, 50 independent passes and 232 affected cases (231 passes, one unavailable provider skip); no remote operation requested. [closure-key: STUDIO-OBS-005:digest:sha256:b0761908eb0eaca411e75fc824dfaa382d9d90d556ee07b296ee19f9ae61ef57] | @po |
