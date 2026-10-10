# Story STUDIO-OBS-001 — Contracts and first-run lifecycle

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-001 |
| Status | **Done** |
| Epic | Studio observed authoring |
| Depends on | none |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md |

executor: "architect"
quality_gate: "pm"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests]

## Story

As a Studio user, I want to define the first guided Run, hidden dataflow and immutable learned-plan contracts before implementation, so that the approved plain-language experience works with verifiable execution evidence.

## Acceptance Criteria

1. **AC-1:** Write ADR-SC-004 amending the separate Learn/confirm lifecycle only for the new guided path. One Run authorizes the displayed immutable checklist and configured scope; finalization never triggers replay or scheduling. Preserve existing manual/replay behavior. [Plan §§1,4,7]
2. **AC-2:** Define versioned observation, typed next-action proposal, learned-plan, hidden binding, scoped session/action ledger, clarification and result schemas. Bind canonical learned-plan hash and admission provenance into revision identity. Define durable locator/current-node correspondence. [§§5–7]
3. **AC-3:** Define state machines, idempotency identities, ownership fencing, UNKNOWN_OUTCOME and atomic finalization constraints. Source edit, expiry, cancellation, failed assertion or late callback cannot produce a ready revision. [§7]
4. **AC-4:** Define visible-text and positively classified nonsecret control-value reads; earlier producer ordering, same-origin default, byte preservation, missing/ambiguous behavior and all configuration limits. Do not require user tokens. [§§6,8]
5. **AC-5:** Publish public/internal API and MSW contract examples, including authenticated scope and errors. Schemas distinguish guided success from replay verification and support per-action ordinals within one source step. No unresolved field semantics are delegated to model output. [§§7,9–10]
6. **AC-6:** Add shared valid/invalid fixtures and schema checks covering node generation, binding dependencies, password input rejection, session scope and publication identity. Record the complete ADR/schema/fixture mapping and deployment version strategy. [§§10–11]

## Tasks / Subtasks

- [x] Review the approved plan, dependencies and current source; resolve contract details through the designated expert before code.
- [x] Implement and verify AC-1; record exact files, commands and evidence.
- [x] Implement and verify AC-2; record exact files, commands and evidence.
- [x] Implement and verify AC-3; record exact files, commands and evidence.
- [x] Implement and verify AC-4; record exact files, commands and evidence.
- [x] Implement and verify AC-5; record exact files, commands and evidence.
- [x] Implement and verify AC-6; record exact files, commands and evidence.

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

## Testing

Validate shared JSON/OpenAPI schemas against positive and negative fixtures; cross-check contract fields with all downstream stories. Architecture work requires independent QA review, not an implementation PASS inferred from prose.

## CodeRabbit Integration

### Story Type Analysis

Primary: Architecture/contracts. Complexity: high, derived from the approved cross-layer plan.

### Specialized Agents

@dev supports code checks; @architect owns execution; @pm provides the assigned technical/product gate; independent @qa owns the SDC verdict and Done transition. Database changes additionally require @data-engineer; user-facing flows require @ux-design-expert.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push/deployment is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations; CRITICAL/HIGH findings must be remediated, lower findings recorded according to config. Focus: immutable scope, real DOM evidence, same-session dataflow, no hidden replay, and confidentiality. For API/DB work include authorization, concurrency and migration tests; frontend work includes a11y, responsive layout and centralized transport.

Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`. Check actual availability during review; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

- `docs/architecture/ADR-SC-004-observed-authoring.md`
- `docs/specs/studio-observed-authoring/contracts/README.md`
- `docs/specs/studio-observed-authoring/contracts/action.schema.json`
- `docs/specs/studio-observed-authoring/contracts/authored-inputs.schema.json`
- `docs/specs/studio-observed-authoring/contracts/binding.schema.json`
- `docs/specs/studio-observed-authoring/contracts/clarification.schema.json`
- `docs/specs/studio-observed-authoring/contracts/commands.schema.json`
- `docs/specs/studio-observed-authoring/contracts/common.schema.json`
- `docs/specs/studio-observed-authoring/contracts/dependency-proposal.schema.json`
- `docs/specs/studio-observed-authoring/contracts/error.schema.json`
- `docs/specs/studio-observed-authoring/contracts/fixtures.json`
- `docs/specs/studio-observed-authoring/contracts/learned-plan.schema.json`
- `docs/specs/studio-observed-authoring/contracts/ledger.schema.json`
- `docs/specs/studio-observed-authoring/contracts/limits.schema.json`
- `docs/specs/studio-observed-authoring/contracts/observation.schema.json`
- `docs/specs/studio-observed-authoring/contracts/pending-bindings.schema.json`
- `docs/specs/studio-observed-authoring/contracts/planning-context.schema.json`
- `docs/specs/studio-observed-authoring/contracts/proposal-result.schema.json`
- `docs/specs/studio-observed-authoring/contracts/result.schema.json`
- `docs/specs/studio-observed-authoring/contracts/revision.schema.json`
- `docs/specs/studio-observed-authoring/contracts/runner-context.schema.json`
- `docs/specs/studio-observed-authoring/contracts/session-view.schema.json`
- `docs/specs/studio-observed-authoring/contracts/session.schema.json`
- `docs/specs/studio-observed-authoring/openapi.yaml`
- `tools/check-studio-observed-contracts.cjs`
- `docs/qa/evidence/STUDIO-OBS-001-contract-verification.json`
- `docs/qa/evidence/STUDIO-OBS-001-qa-fixes-verification.json`
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-001.story.md`

## Dev Agent Record

### Agent Model Used

Codex (GPT-6), designated architect executor; develop-story interactive mode. Approved expert consensus and user-authorized implementation supplied the architectural checkpoints. Routine contract choices were documented without repeating approval requests. No subagents spawned by this executor.

### Debug Log References

- `.ai/STUDIO-OBS-001-validation.json` — PO GO 8/10 and executable-check advisory addressed.
- `docs/qa/evidence/STUDIO-OBS-001-contract-verification.json` — exact commands, outcomes, versions, AC mapping and limitations.
- `docs/specs/studio-observed-authoring/contracts/README.md` — normative contract, state transitions, hashing, read rules, budgets, errors, API/MSW use and deployment strategy.

### Completion Notes List

- AC-1: ADR-SC-004 amends only the guided lifecycle; one scoped Run, exact-plan adoption, no finalization replay/schedule, legacy manual/replay preserved.
- AC-2: Twenty strict versioned JSON Schemas cover observations, actions/outcomes, preliminary dependencies, stable pending/evidenced bindings, immutable authored input materialization, session/ledger, clarification, results and revision identity. Current-node/durable-locator correspondence is a trusted runtime obligation.
- AC-3: Explicit terminal state machines, persist-before-dispatch idempotency, worker fencing, UNKNOWN_OUTCOME and atomic finalization; negative fixtures reject cancelled/expired/uncertain/failed publication and identity drift.
- AC-4: Positive nonsecret policy, password/hidden rejection, ordering, same-origin transfers and exact Unicode byte preservation. All approved limits are specified; HTTP/HTTPS and localhost IPv4/IPv6 remain supported with canonical origin checks.
- AC-5: Public/internal OpenAPI with authenticated role and fence requirements, typed commands/proposal outcomes and shared MSW examples. Guided learning and replay verification remain separate evidence states.
- AC-6: Shared fixtures and `node tools/check-studio-observed-contracts.cjs` validate **91 fixture/read-policy cases and 109 OpenAPI request/response examples**, compile all 20 schemas and verify the canonical non-ASCII hash vector.
- Development peer questions resolved before handoff: preliminary whole-checklist information needs and server-issued pending bindings; owner-fence/worker-role protection; action/clarification/step-complete/unsupported proposal union; immutable source-input table and authenticated runner materialization. Rejection fixtures cover these seams.
- Checks: contract verifier PASS; `node --check tools/check-studio-observed-contracts.cjs` PASS; whitespace checks PASS. Uses existing Ajv 8.20.0 / ajv-formats 3.0.1 / YAML 2.9.0 under Node v23.10.0; no new dependency.
- CodeRabbit executable is unavailable both at configured `~/.local/bin/coderabbit` and on PATH. Configured graceful-degradation fallback applies; no CodeRabbit PASS claimed. Independent SDC QA remains required, with the configured full-review limit of three iterations / 30 minutes.
- No application code, DB migration or frontend component changed. Application lint/typecheck/regression/E2E suites are not applicable to this contract-only change; no live browser/model/auth/privacy-wire-byte/benchmark/pilot validation claimed. Root package `test` is a placeholder, so the runnable focused contract suite is the gate for this story.
- Self-DoD: requirements, closed schemas, structure, targeted tests, docs, configuration limits and administration addressed. Application build/UI verification and new-dependency review N/A. Runtime enforcement, restricted artifact-v2 lowering/schema, Java/Node parity and live proof are explicitly owned by OBS-002–010; existing artifact-v1 behavior is untouched. The fixture artifact hash is synthetic and does not demonstrate deterministic lowering.
- Existing feature branch retained. No staging, commit, push or PR; unrelated root-owned governance/CLI changes preserved. Ready for root-owned CLI phase verification and independent QA, without self-approval or Done transition.

### QA Fixes — iteration 1 remediation

Inventory: `docs/qa/gates/STUDIO-OBS-001-contracts-and-first-run-lifecycle.yml` contains TEST-001 (high), TEST-002 (high), TEST-003 (medium); all three addressed, none deferred or waived. QA's FAIL verdict remains unchanged pending independent re-review. Status remains **InProgress** for root-owned phase verification.

- **TEST-001 — FIXED:** Validate executed bindings and each consumer back to the cumulative admitted need/allocation snapshot, in addition to the forward checks. Enforce unique need allocation and matching binding counts. Replanning must retain every exercised admitted edge. Added internally consistent unallocated-binding and extra-consumer rejection fixtures, plus a valid cumulative two-binding case.
- **TEST-002 — FIXED:** Every successive observation must preserve or increase the session generation. A document replacement or prior mutating operation requires a strict increase. Same-generation reuse is limited to unchanged-document read/assert cases. Added synchronized-hash negatives for generation rollback and document replacement, and positives for legitimate reuse/advancement.
- **TEST-003 — FIXED:** Apply maxSourceSteps to the actual source count. Audited other lowered bounds and added actual observation/runtime-binding counts plus counter floors for materialized actions, observations, proposals and observation bytes. Added lowered-limit regressions for source steps, actions, observations, proposals, evidence bytes, observation bytes/nodes/depth, statements and runtime value count/byte limits. Actual token usage remains an explicit runtime/gateway counter obligation.
- Fresh verification: **114 shared fixture/read-policy cases; 109 API examples; 20 schemas; independent QA reproducer 30/30, zero false accepts**. Node syntax and tracked/untracked whitespace checks pass. The independent reproducer, its original report/reviewed revision and the QA gate were not edited. Exact results and hashes: `docs/qa/evidence/STUDIO-OBS-001-qa-fixes-verification.json`.
- Application build/lint/typecheck remain N/A for this bounded CJS contract-verifier/docs-fixture change; the root test script is a placeholder. Applicable syntax and complete contract regression checks ran. No runtime/live proof, gate self-approval, status completion, commit, staging, push or unrelated changes.

## QA Results

Not reviewed. No quality verdict assigned.

### Review Date: 2026-10-08 — Independent QA, iteration 1

Reviewed By: Quinn (@qa), independent agent `/root/sdc_obs001_qa`.

Reviewed Revision: `sha256:2e5b29fcdad6fa122f6e20879ba3fe6924223b0183dd292290e347209abe2bc8`. Reproducible file manifest and normalization: `docs/qa/evidence/STUDIO-OBS-001-reviewed-revision.json`.

Gate: FAIL → docs/qa/gates/STUDIO-OBS-001-contracts-and-first-run-lifecycle.yml

The ADR, closed schemas, authenticated API roles, immutable input materialization, proposal outcome union and no-hidden-replay lifecycle are defined. The submitted suite passes 91 fixture/read cases, all 20 schemas and 109 API examples; syntax and whitespace checks pass. Independent QA ran 30 additional checks: 25 pass and five invalid bundles are falsely accepted.

- **TEST-001 (high):** Removing all pending allocations still permits the exercised binding; removing a planned consumer still permits that consumer. Require bidirectional dependency/allocation/plan correspondence.
- **TEST-002 (high):** A generation rollback or document replacement at unchanged generation after a read is accepted with internally consistent references/hashes. Enforce session-wide monotonicity and document-change freshness.
- **TEST-003 (medium):** Two source steps pass when configured `maxSourceSteps=1`. Enforce the lowered configuration.

Reproduction: `node docs/qa/evidence/STUDIO-OBS-001-independent-review.cjs` (exit 1, five false accepts). Results: `docs/qa/evidence/STUDIO-OBS-001-independent-review.json`. The gate contains per-AC Given/When/Then traceability and precise correction scope; AC-6 is not met.

CodeRabbit is absent on PATH and at `~/.local/bin/coderabbit`; configured independent review fallback was used. No application runtime, live browser/model, account, privacy-wire-byte or pilot PASS is claimed. No implementation files were changed. Apply the verifier/shared-fixture fixes, update development evidence and return to independent QA.

### Review Date: 2026-10-08 — Independent QA re-review 1 (iteration 2)

Reviewed By: Quinn (@qa), original independent agent `/root/sdc_obs001_qa`.

Reviewed Revision: `sha256:30a72a8a5ccef6aab482080668e921e08334ed22fd566bd8efbf9865436b305d`. Current reproducible manifest: `docs/qa/evidence/STUDIO-OBS-001-reviewed-revision.json`; initial FAIL provenance is preserved in `docs/qa/evidence/STUDIO-OBS-001-reviewed-revision-initial.json`.

Gate: PASS → docs/qa/gates/STUDIO-OBS-001-contracts-and-first-run-lifecycle.yml

**TEST-001, TEST-002 and TEST-003 are resolved with no deferrals.** Independently reran the shared verifier: 114 fixture/read cases, 109 API examples and all 20 schemas pass. The unchanged independent reproducer passes all 30 checks; its five former false accepts now reject with DEPENDENCY_PLAN, NODE_GENERATION or BUDGET as appropriate. Syntax and whitespace checks pass. Results: `docs/qa/evidence/STUDIO-OBS-001-independent-rereview-1.json`.

Reviewed the complete affected delta: bidirectional cumulative dependency/allocation/consumer checks; monotonic generation and document replacement freshness; configured source-step and actual-count budget enforcement. Positive fixtures preserve unchanged-document read reuse, legitimate generation advancement, cumulative multiple bindings and exact configured bounds. ADR, all schemas and OpenAPI match their initial reviewed hashes. The canonical gate records resolution evidence and updated traceability for all six ACs.

This PASS covers the OBS-001 contracts and executable conformance evidence. Runtime endpoints, live DOM identity, account integration, privacy-wire-byte testing, deterministic lowering, replay proof and pilot gates remain with OBS-002–010. CodeRabbit remains unavailable with the configured independent-review fallback. QA changed only review artifacts and this verdict-owned lifecycle transition; no implementation, commit, push, close or CLI phase state was changed.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-08 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready; PO report: `.ai/STUDIO-OBS-001-validation.json` | @po |
| 2026-10-08 | 0.2.0 | Ready → InProgress → InReview; implemented AC-1–6 contracts, ADR, schemas, shared fixtures and executable verification; handed to independent QA | Architect executor |
| 2026-10-08 | 0.2.1 | QA Gate FAIL — Status: InReview → InProgress — contract oracle falsely accepts unallocated dataflow and invalid generations; TEST-001–003 | @qa |
| 2026-10-08 | 0.2.2 | InProgress → InReview after root CLI verification of apply_qa_fixes; TEST-001–003 remediation evidence: `docs/qa/evidence/STUDIO-OBS-001-qa-fixes-verification.json`; handed back for independent QA re-review, existing verdict preserved | Architect executor |
| 2026-10-08 | 0.2.3 | QA Gate PASS — Status: InReview → Done — TEST-001–003 independently resolved; 114 shared cases and 30/30 independent checks pass | @qa |
| 2026-10-08 | 0.2.4 | Administrative closure by PO after verified QA PASS and 28-file reviewed digest; Done preserved. Wave index updated; no lifecycle transition. [closure-key: STUDIO-OBS-001:digest:sha256:30a72a8a5ccef6aab482080668e921e08334ed22fd566bd8efbf9865436b305d] | @po |
