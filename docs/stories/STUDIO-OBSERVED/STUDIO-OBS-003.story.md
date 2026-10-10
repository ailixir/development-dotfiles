# Story STUDIO-OBS-003 — Durable guided-session and action ledger

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-003 |
| Status | **Done** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-001 |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md |

executor: "data-engineer"
quality_gate: "dev"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests]

## Story

As a Studio user, I want to track scoped execution and deduplicate every action across reconnects and faults, so that the approved plain-language experience works with verifiable execution evidence.

## Acceptance Criteria

1. **AC-1:** Add forward-only PostgreSQL migrations and domain persistence for guided sessions, admitted actions, scoped evidence references and finalization identity. Reserve migration numbers from current tree at implementation time. Store no raw runtime values or credentials. [§7]
2. **AC-2:** Implement versioned start/read/advance/clarify/cancel/expire interfaces from OBS-001 with authenticated principal/CSI/environment/account scope, immutable source/configuration identity and entitlement checks. [§§7–8]
3. **AC-3:** Admit each action once using durable action ID/hash, ordinal, state generation, observation hash and fenced ownership before dispatch. Duplicate requests/reconnects retrieve the same action record. Unknown dispatched outcome stops future advancement. [§7]
4. **AC-4:** Enforce shared wall-clock, action, observation and model budgets across the full session. Canceled/expired sessions cannot advance and stale callbacks cannot regain ownership or finalize. [§8]
5. **AC-5:** Define atomic compare-and-set publication prerequisites but do not mark a plan ready without OBS-006 exact executed-plan verification. Distinguish guided result and replay evidence in all projections. [§7]
6. **AC-6:** Test duplicate/concurrent admission, access isolation, ownership takeover, database rollback, delayed callbacks, cancellation and lost acknowledgment using real PostgreSQL integration tests. Preserve existing execute/schedule contracts. [§11]

## Tasks / Subtasks

- [x] Review the approved plan, completed OBS-001 contracts and current source; use the frozen contracts below and escalate only unresolved implementation conflicts before code.
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

### Frozen OBS-001 implementation references (PO validation)

- Normative detail is now available in [ADR-SC-004](../../architecture/ADR-SC-004-observed-authoring.md), [contracts README](../../specs/studio-observed-authoring/contracts/README.md), [OpenAPI](../../specs/studio-observed-authoring/openapi.yaml) and shared [fixtures](../../specs/studio-observed-authoring/contracts/fixtures.json). Read `session`, `ledger`, `commands`, `session-view`, `limits`, `pending-bindings`, `runner-context`, `result` and `revision` schemas there. OBS-001 is Done with verified SDC closure; its historical ADR QA-pending label does not reopen the completed gate.
- AC-2 public routes are `/api/v3/studio/guided-sessions` and the specified read/result/clarification/clarify/cancel routes. Advancement, owner claim and outcomes are authenticated internal boundaries. Expiry is a trusted reaper transition, not a public/model expiry endpoint. Derive principal, CSI grants, capabilities and origins from trusted source/configuration; never trust caller scope claims. Internal role/audience and current worker subject checks are separate from knowing `X-Owner-Fence`.
- AC-3 follows the frozen state tables: durable admission precedes dispatch; atomic consumption sets `dispatchCount=1` before any browser call. Deduplicate start by `(principal, route, testId, key)` and commands by `(sessionId, route, key)` with canonical request digest; changed payload under a key is `IDEMPOTENCY_CONFLICT`. Also enforce unique admission and `(sessionId, stepId, ordinal)`. A delayed callback cannot rewrite admission fields. Lost acknowledgement/owner crash after consumption stops as `UNKNOWN_OUTCOME`; no dispatch retry. Runner-side consumption remains OBS-004.
- AC-4 uses the immutable deadline and complete `limits.schema.json` counters across repairs and pauses. Reserve before work, settle model usage conservatively, and never reset budgets or extend expiry on lease renewal. Owner acquisition increments a fence by CAS; an unexpired lease and matching authenticated owner are required. Cancellation/expiry revoke unconsumed admissions and publication while retaining uncertain in-flight evidence.
- AC-5 supplies transaction/CAS prerequisites against source/configuration, scope, owner, lease, deadline and successful ledger evidence. OBS-006 owns exact-plan reconstruction, operation-equivalent lowering and publication. Until those verifiers exist, readiness must fail closed; a simulated successful callback is not permission to publish. Guided and replay evidence remain distinct. OBS-007 owns the actual connected-account handoff; unavailable account support must fail closed, not appear connected.
- Existing seams to inspect are `StudioService`, `StudioRepository`, `security/CsiOwnershipEvaluator`, `config/SecurityConfig`, `config/StudioInternalSecurityConfig`, `security/ServiceIdentityAuthenticationFilter` and `studio/dispatch`. Existing public security uses the BFF identity flow and internal callbacks use a separate chain; these are not proof that the new frozen authentication contract already works. `ProvisionalDispatchAuthorization` is not sufficient evidence of current account/CSI entitlement. Declare additional DTO/security/adapter files in File List before changing shared seams, preserving legacy routes and concurrent OBS-002 ownership.
- Current highest migration is V29; V30 is available at validation time, but recheck before writing the forward-only migration. Session/action persistence stores trusted metadata, canonical identities and scoped evidence references, never runtime values, credentials or raw snapshots. New feature remains disabled until downstream compatibility and rollout gates pass.

## Testing

Backend targeted JUnit/Testcontainers integration, migration parity, Spotless/Checkstyle. Serialize Gradle work in this checkout through the coordinator; record actual report counts, skips and revision. From root run `node tools/check-studio-observed-contracts.cjs`; from `backend/` run `./gradlew test --tests 'com.citi.put.checks.studio.guided.session.*'` and `./gradlew spotlessCheck checkstyleMain checkstyleTest` after implementation. Shared fixtures and the non-ASCII canonical hash vector establish Java/Node parity.

AC-6 must use real PostgreSQL to test concurrent identical and conflicting idempotency keys, unique action coordinates, rollback before dispatch, lost acknowledgement after consumption, stale owner/lease and callback rejection, immutable expiry/budget exhaustion, denied principal/CSI/account scope, and inability of failed/cancelled/expired/uncertain sessions to publish. Include fresh and existing-data migration paths and focused legacy execute/schedule regression tests. Existing Testcontainers tests can skip without Docker; skipped integration tests are not a PASS. Live browser consumption and exact-plan/replay proof remain OBS-004/006/009 gates.

## CodeRabbit Integration

### Story Type Analysis

Primary: Database/API. Complexity: high, derived from the approved cross-layer plan.

### Specialized Agents

@dev supports code checks; @data-engineer owns execution; @dev provides the assigned technical/product gate; independent @qa owns the SDC verdict and Done transition. Database changes additionally require @data-engineer; user-facing flows require @ux-design-expert.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push/deployment is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations, 30-minute timeout; CRITICAL/HIGH findings must be remediated, lower findings recorded according to config. Focus: immutable scope, real DOM evidence, same-session dataflow, no hidden replay, and confidentiality. For API/DB work include authorization, concurrency and migration tests; frontend work includes a11y, responsive layout and centralized transport.

Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`. Check actual availability during review; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

- `docs/specs/studio-observed-authoring/openapi.yaml` — coordinated DOC-001 authentication erratum only
- `docs/specs/studio-observed-authoring/contracts/README.md` — coordinated DOC-001 authentication erratum only
- `.ai/STUDIO-OBS-003-qa-fixes.json`

- `backend/src/main/java/com/citi/put/checks/studio/guided/session/README.md`
- `.ai/STUDIO-OBS-003-development.json`

- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedHttpSecurityIT.java`

- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedContracts.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionException.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionAccess.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionConfiguration.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedInternalSecurity.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedInternalController.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionReaper.java`
- `backend/build.gradle.kts`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSecurityTest.java`

- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionController.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionRepository.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedActionLedger.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionProperties.java`
- `backend/src/main/resources/db/migration/V30__studio_guided_sessions.sql`
- `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java`
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-003.story.md`

## Dev Agent Record

QA-fix iteration 1 in progress as original data-engineer executor. Complete inventory: REQ-001 (high, durable selected clarification missing), REL-001 (high, claim bypasses paused workflow), DOC-001 (medium, stale public bearer declaration). The two independent PostgreSQL probes were copied unchanged to /tmp and reproduced: 2 tests, 2 failures, 0 skips. Root authorizes the narrow public BFF-cookie documentation erratum; no JSON schema/body or internal authentication change is authorized. QA verdict/evidence remain untouched.

Executor: data-engineer (Codex). Implementation complete; submitted to the coordinator for independent dev/QA review. Status is InReview, not Done. No commits or remote git actions were performed.

- AC-1: V30 adds durable sessions, immutable admitted proposals/ledger identities, route-scoped command digests/responses, scoped opaque evidence references and finalization identity. PostgreSQL triggers enforce immutable scope/source/deadline and admitted identity; unique admission and session/step/ordinal constraints prevent duplicates. Fresh schema and V29 existing-data upgrades passed.
- AC-2: Versioned public start/read/result/clarification/clarify/cancel and internal claim/observations/admissions/advance/outcomes/finalize boundaries use the frozen schemas and status codes. Trusted reaper owns expiry. Public identity remains the existing BFF; guided internal identity has an independent order-0 pinned-RS256/mTLS chain, exact receiver audience, role and current worker subject checks. Existing platform/legacy callback chains are unchanged. The OpenAPI public bearer wording versus actual BFF cookie transport is documented in the package README for coordinator follow-up; no frozen contract was changed.
- AC-3: Row-locked PostgreSQL transactions persist admission before dispatch, atomically consume once, enforce canonical request digests and coordinate uniqueness, reject forged admission fields, and stop uncertainty as UNKNOWN_OUTCOME. Duplicate commands retrieve the current durable action/session record. No browser or model action is performed by this persistence service.
- AC-4: Immutable per-session limits bind to approved flat kebab-case settings; action/observation/evidence/model counters reserve before work, survive lease renewal and pauses, and conservatively retain missing model usage. Reported gateway overrun is durably charged and stops the session. Cancellation/expiry revoke unconsumed work, preserve dispatched uncertainty and prevent stale ownership/publication.
- AC-5: Finalization prerequisites run under the session transaction and trusted source/configuration lock hook, checking current grants, revisions, owner/fence/lease, deadline, completed source steps and successful one-dispatch evidence. The missing OBS-006 exact-plan/lowering verifier fails closed; simulated successful callbacks never publish. Source conflict after successful work records PUBLICATION_CONFLICT; guided results never claim replay or schedule activation.
- AC-6: Final combined run passed 90 tests, zero failures/errors/skips: GuidedSessionIT 23 (real PostgreSQL), GuidedSecurityTest 8, GuidedHttpSecurityIT 5, StudioAuthorizationIT 27, StudioServiceExecuteAuthorizationTest 6, StudioScheduleApiIT 21. Coverage includes concurrent identical/conflicting keys, coordinate uniqueness, rollback, durable restart, lost acknowledgments, delayed callbacks, principal/CSI/account isolation, takeover, expiry, budgets, scope-bound evidence, source conflict and publication refusal.

Verification from backend/: `./gradlew spotlessApply spotlessCheck checkstyleMain checkstyleTest rdsParityLint test --tests 'com.citi.put.checks.studio.guided.session.*' --tests 'com.citi.put.checks.studio.StudioServiceExecuteAuthorizationTest' --tests 'com.citi.put.checks.studio.scheduling.StudioScheduleApiIT' --tests 'com.citi.put.checks.studio.StudioAuthorizationIT' --console=plain` — PASS. rdsParityLint checked all 29 migrations (latest V30). Root `node tools/check-studio-observed-contracts.cjs` — PASS, 114 fixture cases and 109 OpenAPI examples including canonical Java/Node non-ASCII hash parity. Baseline revision: `c767efbe70f0a05555d77b2a589ca19414a4e8b4`; exact owned-file hashes and test reports are recorded in `.ai/STUDIO-OBS-003-development.json`.

CodeRabbit availability: not found on PATH or at `~/.local/bin/coderabbit`; no automated CodeRabbit PASS is claimed. Repository `graceful_degradation.skip_if_not_installed=true` applies. Independent coordinator-owned dev/QA review is the fallback and remains the next gate.

DoD self-assessment: requirements, structure, existing dependencies, schema/API checks, meaningful unit/PostgreSQL/HTTP integration tests, focused legacy regressions, build/format/lint/migration parity, configuration/security documentation and File List are addressed. Full repository test coverage and the full `check` aggregate were not run; this story uses the specified focused backend gates. Frontend/UI, browser dispatch, model calls, live account handoff, exact-plan publication/replay and human pilot are downstream gates, not claimed here. The observed feature stays disabled; the production trusted account adapter reports AUTH_CONNECTION_REQUIRED until genuine support is installed. OBS-004/005 supply trusted current-DOM admission and semantic completeness; OBS-006 supplies exact publication; OBS-007 supplies account handoff.

Initial test expectation defects (invalid mutated operation fixture and migration count), four overlong code lines and HTTP status mismatches found during implementation were corrected before the final passing run. No unresolved implementation test failure is being hidden.

### QA fixes — iteration 1 (2026-10-08)

All findings inventoried and addressed as the original data-engineer executor. The independent QA gate remains FAIL pending re-review; status remains InProgress for coordinator verification.

- **REQ-001 — FIXED:** `clarify` now atomically persists bounded, value-free selected-choice metadata before removing the pending question and returning OBSERVING. The stored mapping binds question/choice/node/binding identity to session/scope, coordinate, document/generation and frozen source/configuration. It excludes labels and runtime values, prevents reusing a resolved question identity, survives process restart and idempotent answer delivery, and rolls back with the state change. `clarificationSelection` exposes a role-, scope-, lease- and fence-checked backend planning read seam for OBS-005; historical node IDs must be revalidated against the fresh observation before admission. This uses existing private progress storage and changes no frozen JSON schema or public/internal HTTP body.
- **REL-001 — FIXED:** A live same-owner lease renewal changes only lease expiry and preserves the current fence, workflow state, pending question and outstanding admission/callback identity. Actual acquisition increments the fence and requires the existing recovery proof; protected clarification/auth/finalizing states remain guarded. A takeover after prior dispatched effects still stops UNKNOWN_OUTCOME. Added PostgreSQL coverage for renewal/takeover while paused, acceptance of the original answer after renewal, refusal of new observations before answering, active dispatch maintenance and finalizing after actual effects.
- **DOC-001 — FIXED (root-authorized coordinated erratum):** Public OpenAPI security is now `PlatformSession` (`apiKey`, `in: cookie`, `name: put_session`). The normative contracts README explicitly states that this OBS-003 review supersedes OBS-001's prior public bearer wording. Existing BFF behavior, all JSON body/schema shapes and internal service JWT/mTLS authentication are unchanged. Package integration documentation now reflects the corrected contract.

Evidence: the two preserved independent PostgreSQL probes were copied byte-for-byte to /tmp, first reproduced at **2 failures / 2 tests**, then passed unchanged after the fixes. Expanded focused/legacy regression suite passed **97 tests**, zero failures/errors/skips: GuidedSessionIT 30, GuidedHttpSecurityIT 5, GuidedSecurityTest 8, StudioAuthorizationIT 27, StudioServiceExecuteAuthorizationTest 6 and StudioScheduleApiIT 21. Spotless, Checkstyle main/test and RDS parity passed. Shared contracts passed **114 fixtures / 109 OpenAPI examples**; a separate auth declaration check confirmed **6 public cookie operations / 10 unchanged service-auth operations**. Commands, counts, copied-probe hashes and owned-file hashes are recorded in `.ai/STUDIO-OBS-003-qa-fixes.json`.

No independent QA artifact, verdict or probe was edited. No new dependency, migration, schema shape, runner collector code, commit or remote operation was introduced. CodeRabbit remains unavailable; hand back to coordinator-owned `review-story` for independent re-review, without self-approval.

## QA Results

Not reviewed. No quality verdict assigned.

### Review Date: 2026-10-08 — independent QA, iteration 1

Reviewed By: Quinn (@qa), `/root/sdc_obs003_qa`

Reviewed Revision: `sha256:472044d3e2f354922ee4a87876ec0203e063dcc231a1efb970ba6d316d85e3ce`; reproducible file manifest: `docs/qa/evidence/STUDIO-OBS-003/reviewed-revision.json`.

Gate: FAIL → docs/qa/gates/STUDIO-OBS-003-durable-guided-session-and-action-ledger.yml

- **REQ-001 (high):** Accepted clarification removes the pending question without durably preserving the selected choice/mapping for recovery or the downstream planner.
- **REL-001 (high):** Same-owner claim/lease renewal resets `AWAITING_CLARIFICATION` to `OBSERVING`, bypassing the mandatory answer pause.
- **DOC-001 (medium):** Frozen public bearer wording differs from the preserved BFF authentication; contract-owner reconciliation is required before client integration, with no authentication widening.

Independent validation: the complete focused backend command reran all tasks and passed 90 tests (0 failures/errors/skips), Spotless, Checkstyle and RDS parity (29 migrations). Shared contract checker passed 114 fixtures and 109 examples. Two extra QA-only PostgreSQL probes both failed on the clarification defects; source, commands, XML reports and logs are preserved under `docs/qa/evidence/STUDIO-OBS-003/`. The initial probe class name did not match Gradle's IT/Test filter; the corrected IT run produced actual assertion failures.

AC-1/3/5 persistence, deduplication/fencing and fail-closed publication checks passed; AC-2/4 require the two fixes above. AC-6's requested real-database/legacy regressions passed, with the newly identified pause/recovery coverage gaps recorded. Downstream account/DOM/semantic/exact-plan ports are legitimate fail-closed dependencies, not runtime completion claims. CodeRabbit was unavailable; independent deep review is the configured fallback. No implementation changes, commits, remote actions or CLI lifecycle changes were performed by QA.

Disposition: return to development via `apply-qa-fixes`; add durable selection and guarded renewal regressions, then request independent re-review.

### Review Date: 2026-10-08 — independent re-review 1 (gate iteration 2)

Reviewed By: Quinn (@qa), `/root/sdc_obs003_qa`

Reviewed Revision: `sha256:52179031537b4156bf2584b46be07d0000fc41b6cc64f33177e29ff5adf74878`; current-source manifest: `docs/qa/evidence/STUDIO-OBS-003/rereview1/reviewed-revision.json`. The original FAIL gate and evidence remain archived under `docs/qa/evidence/STUDIO-OBS-003/`.

Gate: PASS → docs/qa/gates/STUDIO-OBS-003-durable-guided-session-and-action-ledger.yml

All three findings are resolved. REQ-001 now stores the safe selected mapping atomically and supplies a role/fence/scope/revision-checked backend planning handoff; restart, duplicate delivery and rollback are covered. REL-001 preserves protected pauses, fence and outstanding actions on live renewal; true acquisition still requires recovery proof and rejects prior dispatched effects. DOC-001 is corrected by the authorized public BFF-cookie documentation erratum; reversing only its public scheme/references reconstructs the exact prior OpenAPI bytes, confirming unchanged request/response bodies and internal service authentication. All JSON schema hashes remain unchanged.

Independent validation: **97 regression tests plus both unchanged original PostgreSQL probes passed**, zero failures/errors/skips. Spotless, Checkstyle main/test, RDS parity (29 migrations), shared contracts (114 fixtures / 109 examples), source-manifest verification and whitespace checks passed. The probes retain their original SHA-256 and ran outside the implementation tree. AC-1 through AC-6 pass for the OBS-003 boundary. CodeRabbit remains unavailable; independent deep review is the configured fallback.

The disabled feature and fail-closed account/DOM/semantic/exact-plan dependency seams remain explicit. This verdict does not claim a deployed TLS handshake, live browser/model run, connected-account handoff, exact-plan publication or human pilot. No implementation, commit, remote action, closure bookkeeping or CLI progress change was performed by QA.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-08 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready; linked frozen contracts and clarified existing API, recovery, ownership and test requirements | @po |
| 2026-10-08 | 0.2.0 | Implemented durable guided-session ledger, scoped APIs, ownership/budgets and PostgreSQL/security regressions; InProgress → InReview for independent gate | data-engineer |
| 2026-10-08 | 0.2.1 | QA Gate FAIL — Status: InReview → InProgress — clarification persistence and lease-renewal pause defects | @qa |
| 2026-10-08 | 0.2.2 | Applied REQ-001/REL-001 durable clarification and pause-preserving lease fixes plus coordinated DOC-001 BFF-cookie erratum; status remains InProgress for independent re-review | data-engineer |
| 2026-10-08 | 0.2.3 | Executor handoff after root verified apply_qa_fixes: InProgress → InReview; evidence `.ai/STUDIO-OBS-003-qa-fixes.json`; prior QA FAIL preserved for independent re-review | data-engineer |
| 2026-10-08 | 0.2.4 | QA Gate PASS — Status: InReview → Done — REQ-001/REL-001/DOC-001 verified; 97 regressions and 2 unchanged PostgreSQL probes pass | @qa |
| 2026-10-08 | 0.2.5 | Administrative closure after independent QA PASS (iteration 2); verified 50-file source manifest, AC-1–6, nine completed tasks, 97 regressions plus 2 PostgreSQL probes (zero failures/errors/skips), and focused quality/contract gates. Status Done preserved. [closure-key: STUDIO-OBS-003:digest:sha256:52179031537b4156bf2584b46be07d0000fc41b6cc64f33177e29ff5adf74878] | @po |
