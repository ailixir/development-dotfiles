# Story STUDIO-OBS-004 — Runner guided control and execution-local dataflow

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-004 |
| Status | **Done** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-001, STUDIO-OBS-002, STUDIO-OBS-003 |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests]

## Story

As a Studio user, I want to execute admitted observed actions once and carry real page values into later actions, so that the approved plain-language experience works with verifiable execution evidence.

## Acceptance Criteria

1. **AC-1:** Extend the runner with authenticated bounded long-lived guided control, keeping gateway credentials and model calls outside the worker. Use OBS-003 admission/fencing identities for every advance. Preserve the existing one-shot replay path. [§7]
2. **AC-2:** Validate typed operations, current-generation node and unique durable replay locator against the same document immediately before dispatch. Pin reads/fills; navigation or rerender invalidates stale proposals. Observe again after state changes, even within a compound source step. [§§4,6]
3. **AC-3:** Implement isolated visible-text and positively classified nonsecret control-value reads with opaque stable binding handles. Never read password/hidden/sensitive fields, mutate saved variables, or serialize raw values to parent/model. Preserve accepted whitespace; reject blank/oversize data. [§6]
4. **AC-4:** Enforce earlier producer ordering, allowed consumer argument slots, same-origin reuse, per-value/count/aggregate UTF-8 bounds and cancellation before/after reads. Concurrent runs cannot share values. [§§6,8]
5. **AC-5:** Dispatch admitted actions at most once. Timeout/crash after dispatch yields UNKNOWN_OUTCOME without retry. Cancel/expire releases capacity, tears down browser and clears values; late operations cannot commit. [§7]
6. **AC-6:** Use data-free diagnostics from launch for guided/capture runs, including adapter errors, observed hosts, faults, IPC, manifests and raw output. Keep video disclosure separate and explicit. [§§5,11]
7. **AC-7:** Add actual Chromium tests for source/consumer flows, hidden twins, ambiguity, stale nodes, field type sensitivity, origin race, cancellation and isolation; fault-injection tests prove no second dispatch. [§11]

## Tasks / Subtasks

- [x] Obtain separate PO revalidation of this Draft against [bridge-design.md](../../specs/studio-observed-authoring/bridge-design.md); record exact contracts and ownership before implementation. INPUT-POLICY-01 remains a separate OBS-005 outbound-model decision, not permission for this story to send source to a model.
- [x] AC-1: Implement the owned observed-v2 bridge/source-reference schemas, OpenAPI receiver direction, checker fixtures and exact compatibility refusal before launch/admission/advance. Preserve legacy replay and historical reserved-v1 evidence. Model-facing source projection remains deferred to OBS-005 after its privacy decision.
- [x] AC-1/2/5: Implement real `initialBlank` evidence with JSON null origin and first-authored-navigation-only guards, the defined evidence/operation/plan hashes and one admitted navigation. Never pre-navigate a fixture or create a synthetic observation. Keep production account setup as the explicit fail-closed OBS-007 port.
- [x] AC-1/2: Implement authenticated context/prepare/dispatch/stop receivers and owning-worker bootstrap/observation/outcome/lifecycle callbacks. Persist value-free prepare attestations, connect `authorizeAction` to trusted proof and revalidate retained pinned DOM/page identity at invocation.
- [x] AC-3/4: Validate controlled immutable source/configuration references through actual span/reference validation, server allocation, persistence, hash and authenticated materialization. The story supplies the common trusted mechanism, not arbitrary-English extraction or gateway calls.
- [x] AC-3/4: Implement local exact-byte reads, cumulative pending allocations, separate successful producer evidence/local availability and actual admitted consumer edges; retain values only in the worker. Replanning cannot erase exercised allocations or invent future ordinals.
- [x] AC-5: Implement post-commit transaction-winner-only `WonConsumption` distinct from `AlreadyConsumed`; never replay winning authority from idempotency storage. Persist worker consumption with fsync before invocation and refuse retries across consume/send/ack gaps.
- [x] AC-5: Integrate lifecycle/lease/deadline/cancel handling and browser/value teardown. Preserve uncertainty for already-consumed effects; backend cancel acknowledgement cannot promise that an in-flight browser effect was prevented.
- [x] AC-6: Enforce data-free output from launch through errors, IPC, manifests and teardown; no runtime values, hashes, lengths or samples in producer receipts or diagnostics. Video retains its separate disclosure/access policy.
- [x] AC-7: Prove the real PostgreSQL-to-Chromium authenticated flow, one first-navigation receipt, source/read/consumer receipts, actual allocation/transport, DOM replacement, wrong identity/tuple, concurrent consume winners, duplicate/lost acknowledgements, cancellation linearization and isolated value destruction. Record exact files, commands and evidence.

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

[Bridge design](../../specs/studio-observed-authoring/bridge-design.md) records the concrete response to JOIN-001–003: initialBlank evidence with actual null origin; observed-v2/hash semantics; backend-only orchestration with a transaction-winner dispatch result; authenticated prepare and pinned revalidation; a durable worker journal; honest lifecycle uncertainty; and cumulative producer/consumer materialization. This story owns those implementation changes, including the backend seams previously owned by completed OBS-003. Completed-story gates remain historical and are not reopened or rewritten.

OBS-004 has no gateway calls. Its trusted source-reference validator accepts classified immutable source spans or authorized configuration references and performs actual allocation/materialization. Tests supply controlled candidate references, not a fake prebuilt production resolver. INPUT-POLICY-01 blocks OBS-005's model-facing source projection; both branches use this same trusted materialization contract. No source-to-model permission is inferred. Semantic extraction remains an explicit later OBS-005 dependency of the complete product.

The exact operation hash includes `origin: null` for initial navigation and never the destination origin as a substitute; initialBlank is a tagged evidence hash, not an observation hash. The learned plan preserves null origin and an explicit blank-start precondition. OBS-006 owns lowering/publication and must fail closed until it implements that precondition. OBS-007 owns real account setup. Keep `clarificationSelection` and historical answer identities; expose fresh correspondence to OBS-005's durable semantic mapping without converting old node IDs into execution authority.

The 0.1.2 amendment recorded design and ownership while retaining Draft; it did not claim implementation or QA success. The independent PO revalidation below now controls readiness. Root coordinates sequential execution. The initial PO report is preserved as historical evidence of the gaps that prompted this amendment.

### PO revalidation — 2026-10-08

**GO (9/10); Draft → Ready.** The coordinated [bridge design](../../specs/studio-observed-authoring/bridge-design.md) resolves JOIN-001–003 for implementation: it defines honest initial-blank/null-origin evidence and hashes; authenticated stored-proposal delivery and pinned final validation; post-commit transaction-winner-only dispatch authority; durable local consumption; cancellation uncertainty; and separate cumulative allocations, successful producer evidence and actual consumer edges. The File List assigns their backend, runner, contract and joined PostgreSQL/Chromium test ownership to OBS-004. OBS-001/002/003 remain Done/PASS/closed; their historical v1 evidence does not claim this bridge already works.

OBS-004 is independently implementable without deciding INPUT-POLICY-01. Controlled tests provide immutable classified source/configuration and candidate spans/references, then exercise real validation, server allocation, persistence, hashing and authenticated transport. They must not inject a fabricated finished input table, infer classification from span provenance, or claim arbitrary-English extraction. Unclassified references fail closed. No gateway call, model-facing projection, automatic source classifier or permission to disclose authored literals is introduced by this GO.

The coordinator-accepted [data-engineering handoff](../../../.ai/STUDIO-OBS-004-data-review.json) further requires dispatch entry without an ambient transaction, a real committed winner outside generic replay storage, separate producer receipts preserving V30 immutability, scoped relational constraints and actual independent-connection concurrency/fresh-install/V30-to-V31 migration tests. These requirements refine the existing bridge tasks and do not change this GO or the product ACs.

The complete product still depends on OBS-005 selecting semantically correct references and an explicitly resolved outbound-source privacy policy. That story remains a downstream dependency of product completion, not a prerequisite for this common mechanism. OBS-006 publication/lowering and OBS-007 production account connection remain fail-closed ports; controlled bridge evidence cannot certify them. Preserve the accepted clarification identity and require fresh target correspondence; durable semantic mapping belongs to OBS-005.

Current contract check: `node tools/check-studio-observed-contracts.cjs` passed **124 v1 fixture cases and 109 OpenAPI examples**. This readiness review ran no implementation, Chromium/PostgreSQL integration, provider calls or CodeRabbit review. The v2 joined and fault-injection tests remain mandatory implementation/QA obligations. Full report: [current validation](../../../.ai/STUDIO-OBS-004-validation.json); previous findings: [archived initial NO-GO](../../../.ai/STUDIO-OBS-004-validation-initial-no-go.json). Root owns CLI verification.

### Historical initial PO readiness review — 2026-10-08

**NO-GO (6/10); remains Draft.** OBS-002 and OBS-003 are Done with independent QA PASS and completed SDC closure. Their gates establish an isolated collector and durable session/ledger; they do not establish the joined control flow. Historical report: `.ai/STUDIO-OBS-004-validation-initial-no-go.json`.

- Frozen sources: [contract semantics](../../specs/studio-observed-authoring/contracts/README.md), [internal routes](../../specs/studio-observed-authoring/openapi.yaml), `runner-context`, `action`, `ledger`, `pending-bindings`, `binding` and `commands` schemas. Current backend handoffs are documented in `backend/src/main/java/com/citi/put/checks/studio/guided/session/README.md`.
- **JOIN-001 — first page / first authored navigation:** `browser.ts` establishes a blank isolated page. The collector requires its real origin to be approved HTTP(S); `GuidedSessionService.admit` requires an observation already committed in PROPOSING. Decide the approved bootstrap/account-page contract before implementation: how the initial real page is established, which navigation is setup versus an authored action, and how an authored first navigation is admitted/recorded exactly once. Do not fabricate an observed origin, pre-navigate an authored action outside the ledger, or repeat it after setup. A future account adapter alone does not resolve this contract cycle.
- **JOIN-002 — authenticated backend/runner message ownership:** OBS-003 implements backend `/advance` as the durable consume transaction; the contract README additionally describes a context/advance receiver checking the addressed runner. The advance request and ledger response carry hashes/IDs, not the executable proposal. Define the concrete transfer of the stored admitted action and immutable ledger to the current worker, trusted DOM/policy verification back into `GuidedSessionAccess.authorizeAction`, local durable consumption, and lost-ack/cancel/expiry notification. Specify receiver, audience/role, payload source, idempotency and failure ordering. Repeated DISPATCHING responses must never become fresh dispatch permits. The current File List needs the coordinated bridge/adapter/test ownership before editing OBS-003 or paired OBS-005 files.
- **JOIN-003 — materialization and binding lifecycle:** `runner-context` transports authored inputs and PENDING_SOURCE handles, but the current backend Snapshot/service provides no authored-input/dependency materialization implementation. Define ownership with OBS-005 for immutable trusted input construction, server allocation and cumulative pending-plan snapshots, delivery/replan, promotion to evidenced local bindings after successful reads, and safe metadata handoff for later consumers/publication. `outcomes` accepts a ledger only; runtime values must remain in the worker. Specify how actual consumer ordinals/slots and admitted read provenance join the existing schemas without inventing model-issued IDs or treating pending handles as ready values. Later exact publication remains OBS-006.
- Preserve the implemented `GuidedSessionService.clarificationSelection` handoff. It returns durable historical choice/node/binding identities under current scope/fence/revision checks; after re-observation, revalidate correspondence without discarding the selected meaning or treating old node IDs as current execution authority.
- `BrowserHandle.createObservationSession` and `ObservationSession.matches` are current seams. `matches` returns a boolean; it does not pin an action target or implement a read. AC-2/3 implementation must extend the trusted isolated browser boundary for pinned reads/fills and declare `browser.ts`, `browserFactory.ts`, collector/types and confinement-test ownership as needed. Keep the generic policy-based discovery proved by OBS-002.

At the initial review, the designated architect was required to resolve JOIN-001–003 with the OBS-004/005 owners and document a coordinated reserved-contract amendment before PO revalidation. The bridge design and current GO above now resolve that readiness requirement. These are integration decisions within the approved feature, not a request for renewed product authorization. Production account connection and exact-plan publication may remain explicitly fail-closed downstream ports; controlled integration tests must still join the real backend ledger and real Chromium through the agreed messages.

## Testing

Runner unit and real-Chromium fixtures, typecheck/lint, confinement, cancellation and output canaries. Receipts must independently verify values; passing mock adapters alone is insufficient.

Implement the resolved bridge decisions with a controlled first-navigation receipt, a real source/read/consumer flow through persisted admissions, duplicate/lost-ack fault injection across the backend/runner boundary, and clarification selection followed by re-observation. Preserve the legacy one-shot lane. Existing commands: `npm run type-check --prefix studio-runner`, `npm run lint --prefix studio-runner`, `npm test --prefix studio-runner`, `npm run test:fixtures --prefix studio-runner -- test/fixtures-tier/guided-dataflow.test.ts` (new fixture file), and `node tools/check-studio-observed-contracts.cjs`. Add the focused backend integration lane for the agreed bridge; serialize Gradle with paired work. These are implementation requirements, not tests claimed run by this readiness review.

## CodeRabbit Integration

### Story Type Analysis

Primary: Feature/integration. Complexity: high, derived from the approved cross-layer plan.

### Specialized Agents

@dev supports code checks; @dev owns execution; @architect provides the assigned technical/product gate; independent @qa owns the SDC verdict and Done transition. Database changes additionally require @data-engineer; user-facing flows require @ux-design-expert.

### Quality Gates

- [x] Applicable pre-commit checks and focused review recorded.
- [x] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push/deployment is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations with the configured 30-minute timeout; CRITICAL/HIGH findings must be remediated, lower findings recorded according to config. Focus: immutable scope, real DOM evidence, same-session dataflow, no hidden replay, and confidentiality. For API/DB work include authorization, concurrency and migration tests; frontend work includes a11y, responsive layout and centralized transport.

Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`. Check actual availability during review; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

Exact implemented and coordinated development/remediation files. Historical v1 contracts and original QA evidence remain intact. Initial development reports retain their original tested hashes; first-remediation evidence records the current exact236-file runner snapshot separately.

- `.ai/STUDIO-OBS-004-build-comparison.json`
- `.ai/STUDIO-OBS-004-contract-development.json`
- `.ai/STUDIO-OBS-004-development.json`
- `.ai/STUDIO-OBS-004-dod.md`
- `.ai/STUDIO-OBS-004-final-guided.json`
- `.ai/STUDIO-OBS-004-final-joined.json`
- `.ai/STUDIO-OBS-004-full-regression.json`
- `.ai/STUDIO-OBS-004-qa-fix-verification.json`
- `.ai/STUDIO-OBS-004-qa-fixes.json`
- `.ai/STUDIO-OBS-004-runner-development.json`
- `.ai/STUDIO-OBS-004-runner-qa-fixes.json`
- `.ai/decision-log-STUDIO-OBS-004.md`
- `.ai/decision-logs-index.md`
- `backend/build.gradle.kts`
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedAssignmentStore.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedBindingStore.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedDispatchService.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedMaterializationService.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedPreparationStore.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedSourceReferenceValidator.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedActionLedger.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedContracts.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedInternalController.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedInternalSecurity.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionAccess.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionConfiguration.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionException.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionRepository.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedWireBodyAdvice.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/README.md`
- `backend/src/main/resources/db/migration/V31__studio_guided_bridge.sql`
- `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgeIntegrationTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedSourceReferenceValidatorTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedHttpSecurityIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSecurityTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedWireContractTest.java`
- `docs/qa/evidence/STUDIO-OBS-004-viewport-probe-initial-failure.json`
- `docs/qa/evidence/STUDIO-OBS-004-viewport-probe.json`
- `docs/qa/evidence/STUDIO-OBS-004-viewport-probe.mjs`
- `docs/specs/studio-observed-authoring/bridge-design.md`
- `docs/specs/studio-observed-authoring/contracts/v2/README.md`
- `docs/specs/studio-observed-authoring/contracts/v2/action.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/allocation.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/assignment-lifecycle.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/assignment-receipt.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/assignment-stop.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/assignment.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/authored-inputs.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/availability.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/binding.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/bridge.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/commands.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/consumer-edge.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/error.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/execution-evidence.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/fixtures.json`
- `docs/specs/studio-observed-authoring/contracts/v2/learned-plan.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/ledger.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/limits.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/observation-refresh.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/observation.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/producer.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/result.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/runner-context.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/session-view.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/session.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/source-reference.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/versions.schema.json`
- `docs/specs/studio-observed-authoring/contracts/v2/wire-parity.fixtures.json`
- `docs/specs/studio-observed-authoring/openapi-v2.yaml`
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-004.story.md`
- `studio-runner/README.md`
- `studio-runner/package.json`
- `studio-runner/src/guided/contracts.ts`
- `studio-runner/src/guided/journal.ts`
- `studio-runner/src/guided/json.ts`
- `studio-runner/src/guided/ownership.ts`
- `studio-runner/src/guided/runtime.ts`
- `studio-runner/src/guided/schemas.json`
- `studio-runner/src/guided/transport.ts`
- `studio-runner/src/guided/types.ts`
- `studio-runner/src/run/browser.ts`
- `studio-runner/src/run/guidedBrowser.ts`
- `studio-runner/src/run/guidedMain.ts`
- `studio-runner/src/run/nativeInput.ts`
- `studio-runner/src/run/observationCollector.ts`
- `studio-runner/src/run/observationInventory.ts`
- `studio-runner/src/run/observationSanitizer.ts`
- `studio-runner/src/run/observationTypes.ts`
- `studio-runner/test/fixtures-tier/guided-dataflow.test.ts`
- `studio-runner/test/fixtures-tier/guided-observation-boundary.test.ts`
- `studio-runner/test/fixtures-tier/guided-targets.test.ts`
- `studio-runner/test/fixtures-tier/guided-wire.test.ts`
- `studio-runner/test/fixtures/guided-tls/README.md`
- `studio-runner/test/fixtures/guided-tls/cert.fixture`
- `studio-runner/test/fixtures/guided-tls/key.fixture`
- `studio-runner/test/guided/browser.test.ts`
- `studio-runner/test/guided/ownership.test.ts`
- `studio-runner/test/guided/runtime.test.ts`
- `studio-runner/test/guided/transport.test.ts`
- `studio-runner/test/helpers/guided.ts`
- `studio-runner/test/helpers/guidedTls.ts`
- `studio-runner/test/run/observation.test.ts`
- `studio-runner/test/run/observationInventory.test.ts`
- `studio-runner/vitest.config.ts`
- `tools/check-studio-observed-contracts.cjs`
- `docs/qa/evidence/STUDIO-OBS-004-independent-edge-probe.json`
- `docs/qa/evidence/STUDIO-OBS-004-independent-edge-probe.mjs`
- `docs/qa/evidence/STUDIO-OBS-004-independent-parity-probe.java`
- `docs/qa/evidence/STUDIO-OBS-004-independent-parity-probe.log`
- `docs/qa/evidence/STUDIO-OBS-004-independent-review.json`
- `docs/qa/evidence/STUDIO-OBS-004-independent-wire-probe.json`
- `docs/qa/evidence/STUDIO-OBS-004-independent-wire-probe.mjs`
- `docs/qa/evidence/STUDIO-OBS-004-initial-gate-fail.yml`
- `docs/qa/evidence/STUDIO-OBS-004-qa-backend.log`
- `docs/qa/evidence/STUDIO-OBS-004-qa-contracts.log`
- `docs/qa/evidence/STUDIO-OBS-004-qa-fixtures.log`
- `docs/qa/evidence/STUDIO-OBS-004-qa-historical-integrity.json`
- `docs/qa/evidence/STUDIO-OBS-004-qa-runner-unit.log`
- `docs/qa/evidence/STUDIO-OBS-004-qa-source-manifest.json`
- `docs/qa/evidence/STUDIO-OBS-004-qa-static.log`
- `docs/qa/evidence/STUDIO-OBS-004-qa-tested-worker.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-backend.log`
- `docs/qa/evidence/STUDIO-OBS-004-r1-check.log`
- `docs/qa/evidence/STUDIO-OBS-004-r1-contracts.log`
- `docs/qa/evidence/STUDIO-OBS-004-r1-final-verification.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-fixtures.log`
- `docs/qa/evidence/STUDIO-OBS-004-r1-independent-edge-probe.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-independent-probe.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-independent-probe.mjs`
- `docs/qa/evidence/STUDIO-OBS-004-r1-independent-review.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-independent-wire-probe.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-integrity.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-response-probe.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-response-probe.mjs`
- `docs/qa/evidence/STUDIO-OBS-004-r1-source-manifest.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-tested-worker.json`
- `docs/qa/evidence/STUDIO-OBS-004-r1-unit.log`
- `docs/qa/evidence/STUDIO-OBS-004-r1-viewport-probe.json`
- `docs/qa/evidence/STUDIO-OBS-004-schema-parity-probe.json`
- `docs/qa/gates/STUDIO-OBS-004-runner-guided-control-and-execution-local-dataflow.yml`
- `studio-runner/src/run/browserFactory.ts`


## Dev Agent Record

### Agent Model Used

Codex acting as designated `@dev`, with coordinator-dispatched contract and runner specialists. Dispatch governance records model provenance; no additional model delegation by this executor.

### Debug Log References

- [Development/AC traceability](../../../.ai/STUDIO-OBS-004-development.json), [developer DoD](../../../.ai/STUDIO-OBS-004-dod.md), [current backend gates](../../../.ai/STUDIO-OBS-004-final-guided.json), [joined receipts/faults](../../../.ai/STUDIO-OBS-004-final-joined.json).
- [Runner development evidence](../../../.ai/STUDIO-OBS-004-runner-development.json), [contract verification](../../../.ai/STUDIO-OBS-004-contract-development.json), [complete build comparison](../../../.ai/STUDIO-OBS-004-build-comparison.json), [historical broad backend run](../../../.ai/STUDIO-OBS-004-full-regression.json), [reviewed decisions](../../../.ai/decision-log-STUDIO-OBS-004.md).
- Current Gradle log: `/tmp/studio-obs004-refresh-final-verified.log`. Focused refresh and compatibility logs: `/tmp/studio-obs004-refresh-focused.log`, `/tmp/studio-obs004-clarification-compat.log`. CodeRabbit unavailable; configured independent QA fallback, no invented PASS.

### Completion Notes List

- Implemented real blank/null-origin bootstrap, immutable classified source/configuration materialization, cumulative producer/consumer metadata, authenticated stored pinned preparation, committed-winner-only dispatch and fsynced worker at-most-once consumption. Runtime values remain worker-local; no runtime value/sample/length/digest enters callbacks or diagnostics.
- Actual worker acquisition/renewal, pre-context cancellation, busy/paused lease preservation, restart refusal, native retained-target input/reveal and explicit authenticated refresh are joined to real PostgreSQL/HTTPS/Chromium. Region grants support accessible controls without mandatory test IDs or per-control mappings.
- **80/80 current backend/guided tests passed**, including **32 joined cases**, with all static/coverage gates. Runner **1,260 unit tests** and **260 browser fixtures** passed (29 and10 pre-existing skips). Contracts: **193 v2 cases /49 API examples /26 schemas /6 canonical vectors**; original **124/109** and29 historical hashes unchanged.
- The80 tests ran on immutable aggregate `796f4498c46f2be4288223c592a7e06762f3efe7b343413072b2d567471cb821`. Final aggregate `66609a69cd2ca878bfab851c7b9a83535a4828c4792e17c426ed110eaf8919eb` differs only in generated `guided/types.d.ts`; all229 other files are byte-identical. Root accepted this exact comparison without claiming a final-aggregate rerun.
- Earlier broad backend1634 tests had zero failures/errors and18 existing skips, plus2 passing cross-replica tests; overall check then failed only formatting of in-flight edits. Current scoped/static gates passed after final edits; unchanged coverage thresholds combine retained broad and current data. No unfiltered final-source full-suite claim.
- Controlled fixed step semantics and trusted question/pause setup prove actual completeStep/answer→refresh continuation, retained values and historical choice preservation. Production v2 question schema/producer, English semantics and pending source-to-model privacy remain OBS-005; publication/lowering and production account setup remain OBS-006/007 fail-closed ports. No gateway/model call, production account or publication claim.
- Submitted via coordinator for independent QA. No Done, commit/push or SDC/wave state mutation; QA Results remain unreviewed.

### First QA remediation — apply-qa-fixes

All four original findings have **FIXED development dispositions**, with independent re-review pending. [Complete finding inventory/dispositions](../../../.ai/STUDIO-OBS-004-qa-fixes.json), [current verification and exact snapshot](../../../.ai/STUDIO-OBS-004-qa-fix-verification.json), and [runner remediation evidence](../../../.ai/STUDIO-OBS-004-runner-qa-fixes.json) retain the original20 QA gate/evidence hashes. The original FAIL verdict and QA Results are unchanged.

- **SEC-001:** bounded private masking survives documents/removal, fails closed on overflow/errors, and cannot publish late CDP results after dispose. Actual joined uncaptured password/ordinary-input echoes remain absent from persisted callbacks and process output.
- **REL-001:** retained-node native toggle postconditions prevent false success; prevented toggles are UNKNOWN after one attempt, and radio uncheck refuses before effects. Real receipts prove no retry.
- **SEC-002:** guided raw UTF-8 bodies, runner replies and signed JWTs reject duplicate/escaped/nested keys, trailing tokens, malformed bytes and noncanonical/unsafe integers. JWT claim sets match; public BFF and supported v1 auth remain valid. Actual mTLS malformed-byte tests precede mutation.
- **REL-002:** coordinator-approved undeployed-v2 UTC instant profile tightens15 timestamp fields in8schemas, with26 shared Java/Node/Ajv vectors and absolute-end matching. Active runner schemas fail closed on unsupported keywords and unresolved references; no learned-plan runtime support is claimed. V1 schema bytes remain unchanged.

**92/92 current backend/guided tests passed**, including37 real joined cases; static/coverage gates passed without lower thresholds. Runner **1,269 unit /273 full browser fixtures passed**, with29/10 pre-existing skips. Contract checker: **219 v2 cases /49 API examples /26 schemas /6 vectors**, plus original124/109. Shared raw-byte vectors:20. Tested and final runner aggregate are exactly `2d44b410e04a12af930b6f2ecd20a7d4ecefeb27a4e4596307312e8d16c9688b` across236 identical files.

Current command/log and coverage provenance are in the verification report. Earlier broad backend data remains historical; no unfiltered final-source broad-suite rerun or CodeRabbit PASS is claimed. Story remained **InProgress** during remediation. Root verified apply_qa_fixes PASS and authorized this metadata-only **InReview** handoff for independent re-review; no QA approval is claimed. Downstream privacy/semantics/question production, publication and production accounts stay gated. No commit/push, Done or SDC/wave mutation.

## QA Results

Not reviewed. No quality verdict assigned.

### Independent QA review — 2026-10-08

Reviewed By: Quinn (@qa /root/sdc_obs004_qa; independent from implementers)

Reviewed Revision: sha256:be37fefaad1d9873be7e3cece8c23bb5f1dd541b9a84ac643f1b97554bced84f

Gate: FAIL → docs/qa/gates/STUDIO-OBS-004-runner-guided-control-and-execution-local-dataflow.yml

Independent reruns passed: 80 backend tests (32 real PostgreSQL/Spring HTTPS/mTLS/JWT/runner/Chromium joins), 1,260 runner unit tests (29 existing skips), 260 browser fixtures (10 existing skips), typecheck/lint, backend static gates and original/v2 contract checks. The unchanged root viewport probe passed. All 230 executable snapshot files matched current dist byte for byte; 29 historical contract/story/gate hashes remained unchanged.

Blocking findings:

- **SEC-001 (P0):** A password masked in the first document is exported as a button name/locator when echoed after navigation. Preserve a bounded private masking inventory across observations/documents and add actual callback/process canaries.
- **REL-001 (P1):** Prevented checkbox check and checked-radio uncheck return success with the wrong final checked state. Verify the retained target postcondition after one native attempt; never retry or report success without proof.
- **SEC-002 (P2):** Raw duplicate JSON keys reach worker ownership; backend parser accepts trailing JSON and unknown signed JWT claims unlike runner. Close and align parsing boundaries.
- **REL-002 (P2):** Runner accepts invalid hour24 dates rejected by Java/Ajv; custom schema references/keywords are not fail-closed. Add current-wire parity and schema-subset validation.

Full traceability, exact commands, reproduction artifacts, limitations and prioritized fixes: [independent review](../../qa/evidence/STUDIO-OBS-004-independent-review.json). [Source manifest](../../qa/evidence/STUDIO-OBS-004-qa-source-manifest.json). Actual completeStep/refresh/retained-binding, worker renewal beyond30s, committed-winner authority, atomic producer receipts and recovery cases were rerun successfully. Controlled question setup proves v2 answer-to-refresh only; production005 semantics/question schema and006/007 ports remain deferred. No model call or source-to-model privacy authorization is claimed.

CodeRabbit and WSL are unavailable; configured independent fallback used, no CodeRabbit PASS. Full unfiltered backend suite/coverage were not rerun by QA. No implementation edits were made. QA changed only this Status/QA Results/Change Log, the gate and review evidence; Dev should include the QA artifacts in its next File List update.

Lifecycle: InReview → InProgress. Root owns the authorized remediation/re-review loop.

### Independent QA re-review 1 — 2026-10-08

Reviewed By: Quinn (@qa /root/sdc_obs004_qa; independent from implementers)

Reviewed Revision: sha256:765212d573673085c38959683862aca11cda58b7f1998c51885a10975455661d

Gate: PASS → docs/qa/gates/STUDIO-OBS-004-runner-guided-control-and-execution-local-dataflow.yml

All four original findings are independently verified resolved. Unchanged original edge/wire scripts now mask prior-page password echoes, report UNKNOWN_OUTCOME for prevented check, refuse radio uncheck before effects and reject duplicate JSON before ownership. Additional independent Chromium probes verify uncaptured input/business-source masking after removal/navigation, isolated inventories, overflow refusal, late-disposal refusal and one-attempt uncertain outcomes for reverted/replaced toggles. Real callbacks, persisted observations and worker stdout/stderr remain canary-free.

Current independent gates: **92 backend tests (37 real joined), 1,269 runner unit tests (29 existing skips), 273 fixture tests (10 existing skips)**; typecheck/lint, contracts and backend check pass. Java/Node/Ajv agree on the approved v2 UTC profile and shared26date/20raw vectors; actual malformed-byte request/response and closed-JWT tests pass. All236worker snapshot files match current dist. Coverage check uses current92-test data plus explicitly retained historical broad/cross-replica data; no unfiltered current backend rerun is claimed.

[Detailed re-review](../../qa/evidence/STUDIO-OBS-004-r1-independent-review.json), [source manifest](../../qa/evidence/STUDIO-OBS-004-r1-source-manifest.json), [preserved initial FAIL gate](../../qa/evidence/STUDIO-OBS-004-initial-gate-fail.yml). Original20QA artifacts and29historical artifacts were verified unchanged before canonical gate replacement; original failed probes and review history remain intact.

Current continuation/ownership/durability tests pass, including real nonfinal completeStep→refresh→next-step retained binding, duplicate/lost-response recovery, worker renewal beyond30seconds and uncertainty without replay. Controlled question/StepVerifier fixtures do not prove005production semantics; INPUT-POLICY-01 remains pending, and006publication/007accounts remain fail-closed. Native input retains its documented non-atomic focus/coordinate limitation.

CodeRabbit/WSL remain unavailable; configured independent fallback used. No implementation fixes, commits/push, subagents orCLI/wave mutations. QA modified only review evidence, canonical gate and this Status/QA Results/Change Log; include those QA artifacts in subsequent bookkeeping.

Lifecycle: InReview → Done.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-08 | 0.1.1 | Validation NO-GO (6/10) — remains Draft; first-navigation bootstrap, authenticated backend/runner action handoff and input/binding materialization ownership need coordinated architecture resolution; recorded current seams and test obligations | @po |
| 2026-10-08 | 0.1.2 | Recorded coordinated bridge design, explicit observed-v2/null-origin hashes, winner-only dispatch, common source-reference materialization and sequential ownership; privacy decision reserved for OBS-005; remains Draft with no new readiness or QA verdict | Architecture remediation |
| 2026-10-08 | 0.1.3 | Validated GO (9/10) — Status: Draft → Ready; JOIN-001–003 resolved by coordinated bridge ownership and joined-test requirements; OBS-005 privacy/semantic extraction remains downstream and unauthorized; archived initial NO-GO; incorporated accepted data-engineering persistence handoff | @po |
| 2026-10-08 | 0.2.0 | Implemented approved observed-v2 bridge, actual worker ownership/renewal, local dataflow, native target/viewport handling and correlated observation refresh; recorded80 current backend tests,1260 runner units,260 browser fixtures and exact build provenance; InReview for independent QA with downstream semantic/privacy/account/publication gates preserved | @dev + coordinated specialists |
| 2026-10-08 | 0.2.1 | QA Gate FAIL — Status: InReview → InProgress — prior-document password disclosure, false successful toggles and wire/schema parity findings; independent evidence recorded | @qa |
| 2026-10-08 | 0.2.2 | Applied first QA remediation for SEC-001/REL-001/SEC-002/REL-002; persistent private masking, native toggle postconditions, strict raw JSON/JWT and explicit v2 UTC/schema enforcement;92 current backend tests and1269/273 runner gates passed on exact236-file snapshot; original FAIL retained and InProgress for coordinator verification/re-review | @dev + runner specialist |
| 2026-10-08 | 0.2.3 | Coordinator verified apply_qa_fixes PASS and authorized metadata-only InProgress → InReview handoff for independent re-review; four FIXED development dispositions, current tested snapshots and original QA FAIL evidence preserved; no implementation changes or QA approval | Original @dev executor |
| 2026-10-08 | 0.2.4 | QA Gate PASS — Status: InReview → Done — independent re-review1 resolves all four original findings; current joined/privacy/wire/schema/legacy checks and exact provenance verified; initial FAIL preserved | @qa |
| 2026-10-08 | 0.2.5 | Administrative closure after independent QA PASS re-review 1; preserved QA-owned Done and all review evidence; verified 96-file accepted source manifest and 236-file tested worker snapshot, AC-1–7 and completed tasks; updated epic completion marker. OBS-005 privacy/semantics and later publication/accounts/UI/benchmark/pilot remain pending. [closure-key: STUDIO-OBS-004:digest:sha256:765212d573673085c38959683862aca11cda58b7f1998c51885a10975455661d] | @po |
