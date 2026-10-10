# Story STUDIO-OBS-014 — Action safety and governance for the learning run (security P0/P1)

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-014 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-012A |
| Dependency notes | Parallel with OBS-012B and OBS-013. OBS-015 may run in parallel with this story **only** if the coordinator assigns one owner to `GuidedSessionService`/`GuidedTranslationService`; otherwise OBS-014 → OBS-015. Contract edits to result3/session-view3/clarification go through the one contract owner shared with OBS-013/015 (ADR-SC-005 "Order and parallelism"). The compliance approval this story prepares is **external** and is gated in OBS-010. |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md ("Security work becomes stories" P0/P1/P2; Panel evidence 3 Security; placement map row OBS-014) · panel 2026-10-09 (Security P0/P1; QA gaps) · docs/architecture/ADR-SC-004-observed-authoring.md (trust boundaries, INPUT-POLICY-01) · docs/specs/studio-observed-authoring/translation-design.md (clarification labels, rejection codes) · docs/epics/UI-STUDIO-GA-PLAN.md §4.D D-1/D-2b, §4.F F-2, §4.J J-1 (path-independent items, tracked there) |
| Size | L |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, security-scan]

## Story

As the CSI owner whose application a Studio author tests, I want every action the learning run takes to be traceable to what the author wrote, bounded by a policy I own and Security approved, metered and audited per CSI, and I want the page metadata that leaves for the model gateway and the sanitized observations the database keeps to be described for compliance review, so that the first Run can never click, submit or export something nobody asked for.

## Acceptance Criteria

Residuals the security panel found at HEAD (ADR-SC-005 Panel evidence 3): **HIGH** un-requested side-effecting clicks — `targetIntent` is model-chosen and `GuidedProposalValidator` checks structure, not correspondence to the authored words; MEDIUM same-origin exfiltration; MEDIUM page-derived clarification labels; the read/discovery policy is one worker-mounted file with no owner, approval or audit (`guidedMain.ts:18-20` `applicationPolicy`, verified 2026-10-09); `studio_guided_sessions.progress` (V30:10) and `studio_guided_model_attempts.safe_result` (V32:58) persist sanitized observations and model output with no retention; guided session start is metered as an ordinary WRITE (`RateLimitClassifier.java:31-35` matches only `/studio/tests/{id}/execute`, verified). Every AC names its oracle; closed codes introduced here are fixed by @architect at T0 and recorded in the Dev Agent Record (no code name below is final).

**Governed policy (P0)**

1. **AC-1 — Per-application read/discovery policy as a governed object.** The observation application policy (`ObservationApplicationPolicy`: read rules, structural-discovery allowance, approved origins) becomes a persisted, versioned object per application/environment: owned by the CSI owner, carrying a Security approval record, a `policyRuleId` + version, and an append-only change audit (who/when/what); the backend freezes the policy hash into the guided session context at start and the runner **validates** that hash against the policy it applies before the first observation (mismatch ⇒ refusal, no observation exported). The worker-mounted `applicationPolicy` file is removed from `guidedMain.ts`'s accepted keys; a mounted file is `CONFIGURATION_DENIED`. DDL by @data-engineer (see Decisions pending for placement). Oracles: policy edit without approval ⇒ session start refused with a closed code; approved v2 ⇒ context hash changes and the runner accepts only v2; audit rows prove the change chain. [ADR-SC-005 "Security work becomes stories" P0; panel Security; `guidedMain.ts:18-20`]

2. **AC-2 — Data-flow description for the compliance approval.** A document (`docs/specs/studio-observed-authoring/guided-data-flow.md`) describes exactly what leaves the trust boundary and what is retained: page metadata and origin exported to the model gateway under `allowStructuralDiscovery` (control names, headings, links — which can carry PII), sanitized observations in `studio_guided_sessions.progress`, model output in `studio_guided_model_attempts.safe_result`, gateway-side retention (unknown — named as a question to the gateway owner ED-01), video (OBS-013) and audit rows; with the controls (sanitizer, password withholding, `knownSecrets`, INPUT-POLICY-01 branch A) and residuals. **The approval itself is external** (Security & Compliance) and is recorded as a release gate in OBS-010; this story never marks it obtained. [ADR-SC-005 P0 "compliance approval … external approval, recorded as a release gate in OBS-010"; GA plan §4.F F-2, §4.J J-1]

3. **AC-3 — Retention and pruning of observations and model output.** `studio_guided_sessions.progress` and `studio_guided_model_attempts.safe_result` are pruned (nulled or row-deleted, decided by @architect at T0 with the publication/receipt integrity in mind — the receipt and exact plan must survive) after a configurable window with a default stated in `application.yml`, by the existing retention pruner; an IT proves pruned sessions still publish/replay from the revision and that pruned content is gone. [ADR-SC-005 placement map row OBS-014 "retention/pruning"; panel Security]

**Semantic grounding and side effects (P1)**

4. **AC-4 — Semantic grounding of `targetIntent` to authored text.** For `click`, `press` and `check` proposals the validator requires correspondence between the chosen observed node's safe label/role and the authored step text (or a saved input it references), not only structural validity; a proposal whose target cannot be traced is rejected with a closed code and counted as a validator rejection (so `LOGIN_REQUIRED` S-signature logic from OBS-007 is unaffected). Grounding uses sanitized labels only (never raw DOM) and is pure (unit-testable with the OBS-005 fixtures). Oracle: a planted proposal clicking "Delete account" for the step "Open reports" ⇒ rejected, no dispatch; the OBS-005/006 fixture corpus still passes (no regression in grounded cases, counted). [ADR-SC-005 P1 "semantic grounding"; panel Security HIGH]

5. **AC-5 — Destructive-verb guard.** Clicks/presses on controls whose safe label matches the policy's destructive vocabulary (a governed list in the AC-1 object, e.g. delete/remove/pay/transfer/submit order) are refused unless the authored step text itself contains that verb (or its saved-input text does); refusal is a closed `POLICY_DENIED` reason, nothing dispatched, and the session continues to the next proposal attempt or fails per existing rules. Oracle on the fixture: "Click Save" on a page with "Save" and "Delete" ⇒ only Save is eligible; "Click Delete" authored ⇒ allowed. [ADR-SC-005 P1 "destructive-verb guard"; panel Security]

6. **AC-6 — First-Run side-effect policy.** The AC-1 policy object declares the learning run's side-effect stance for the application (e.g. `ALLOW`, `CLARIFY_FIRST`, `DENY` for actions the observation marks as form submission / navigation-causing); the validator enforces it at prepare; `CLARIFY_FIRST` raises one clarification whose choices are authored-text derived (never page-derived) before the first side-effecting dispatch; `DENY` refuses with a closed reason. Oracle: fixture login form under `DENY` ⇒ the submit click is refused and the session fails with the stated code; under `ALLOW` the OBS-007 end-to-end still passes. [ADR-SC-005 P1 "first-Run side-effect policy"; panel Security]

7. **AC-7 — `labelSource` on clarification choices.** Clarification choices carry `labelSource ∈ {AUTHORED, SAVED_INPUT, PAGE}` plus `role` and `region` for `PAGE` labels (v3 `clarification` schema; generated bundles regenerated; fixtures extended) so OBS-008 can mark page-derived labels untrusted; backend never emits a `PAGE` label that failed sanitization; the I-C11 rule (secret IDs only, never values) is unchanged. Contract edit sequenced with OBS-013/015 through the one contract owner. [ADR-SC-005 P1 "`labelSource`"; UX panel clarification copy; translation-design clarification semantics]

**Metering, idempotency, audit (P1)**

8. **AC-8 — Session start is EXECUTE; per-CSI budgets.** `POST /api/v1/studio/guided-sessions` is classified `BucketClass.EXECUTE` in `RateLimitClassifier` (today only `/studio/tests/{id}/execute` is); in addition to the per-session budgets in `GuidedSessionProperties`/`GuidedTranslationProperties`, a per-CSI concurrent-session limit and a per-CSI daily token budget are enforced at start and at each model call, refusing with `BUDGET_EXCEEDED` (existing code) and a `Retry-After`/reset hint; counters are persisted (not in-memory per replica). Oracles: classifier unit test; two sessions on one CSI with limit 1 ⇒ second refused; daily budget exhausted ⇒ next model call refused and the session ends `BUDGET_EXCEEDED`. [ADR-SC-005 P1 "session start classified `EXECUTE` … per-CSI budgets"; `RateLimitClassifier.java:31-35`]

9. **AC-9 — Mandatory `Idempotency-Key` on replay execute.** `POST /tests/{id}/execute` requires an `Idempotency-Key` header (missing ⇒ 400 with a problem+json code; replay of the same key returns the cached response per the existing `IdempotencyFilter`); the frontend sends it (OBS-008 consumes; this story updates the OpenAPI and `StudioContractTest`, re-anchoring the pins with old/new quoted). The GA plan D-2b question (cached 2xx replayed without re-authorizing) is **named** in the evidence as still open for @qa (security); it is not resolved here. [ADR-SC-005 P1 "replay execute requires `Idempotency-Key`"; GA plan §4.D D-2b]

10. **AC-10 — Per-action audit to SIEM.** Every admitted guided action and every replay dispatch emits a structured audit event (principal, CSI, test, session/execution, origin, obligation kind, target role/label hash, outcome) through the existing structured logging/audit path to the SIEM sink the platform provides (sink configuration is deployment, OBS-009; the event shape and emission are here); events carry IDs and codes only — a canary scan over the audit stream during the OBS-007 fixture run returns zero hits; volume bound stated. [ADR-SC-005 P1 "per-action audit events to SIEM"; design R3 I-B4 (no values in logs)]

**P2 (design note only)**

11. **AC-11 — Artifact HMAC design note.** A dated design note specifies an HMAC over the published artifact with a key held outside the database (Vault transit or platform KMS, chosen by @architect), its verification point (`ObservedRevisionVerifier`) and rotation; **no implementation** in this wave unless @architect promotes it; recorded as a dated design note under `docs/specs/studio-observed-authoring/` referencing ADR-SC-005 P2. [ADR-SC-005 P2]

## Tasks / Subtasks

- [ ] **T0 — Rulings and ownership.** Confirm OBS-012A Done; @architect fixes the closed code names (AC-1, 4, 5, 6), the pruning strategy (AC-3), the DDL placement (Decisions pending) and the destructive vocabulary's governance; coordinator assigns the `GuidedSessionService`/`GuidedTranslationService` owner vs OBS-015 and the contract owner vs OBS-013/015; @data-engineer takes the DDL; root reconciles the File List.
- [ ] **T1 — Governed policy (AC-1, AC-3) — @dev + @data-engineer.** Policy entity/table, approval and audit, context hash, runner validation, mounted-file refusal; pruning job and IT.
- [ ] **T2 — Validator (AC-4, AC-5, AC-6, AC-7).** Grounding, destructive guard, side-effect stance, `labelSource`; fixtures and unit tests; v3 clarification schema via the contract owner.
- [ ] **T3 — Metering and audit (AC-8, AC-9, AC-10).** Classifier, per-CSI budgets with persisted counters, mandatory `Idempotency-Key` + OpenAPI/pins, audit events + canary.
- [ ] **T4 — Documents (AC-2, AC-11).** Data-flow description; HMAC design note.
- [ ] **T5 — Verify and submit.** Full affected backend/runner suites and the OBS-007 fixture end-to-end under the new guards; File List as changed; independent @qa (security-scan remit); only QA can set Done.

## Dev Notes

- Trust model stays ADR-SC-004's: the model proposes from sanitized observations; trusted code (validator, runner) decides. This story adds *correspondence to authored intent* and *governance of what may be observed* on top; it must not export more page content to the model.
- `ObservationApplicationPolicy`/`ObservationRule` types live in `studio-runner/src/run/observationTypes.ts`; `applicationPolicy` is read from the mounted file in `guidedMain.ts` today. The backend already sends a guided `context`; the policy hash rides there.
- `GuidedProposalValidator` (backend) is the structural gate today; grounding is added beside it as a pure step using the same sanitized node labels the model saw. `GuidedTranslationService` labels configuration-reference clarification choices "Saved input choice N" — that is `SAVED_INPUT`.
- Rate limiting: `RateLimitClassifier` lives in `backend/src/main/java/com/citi/put/checks/config/`; bucket classes exist (`EXECUTE`, `WRITE`, `SEND`). Budget persistence must survive replicas (counters in PostgreSQL, not a `ConcurrentHashMap`).
- `IdempotencyFilter` caches responses only (security review verified); mandatory key is a contract change in the one public OpenAPI (pins re-anchored).
- QA gap carried: no real LLM has ever run on guided; this story's guards are proven with the controlled provider; real-model behaviour of the guards is measured in OBS-009's D-C benchmark (false-pass hard gate).

### Decisions pending (written to the stated default)

| Question | Default applied here | ACs that change if decided otherwise |
|---|---|---|
| DDL placement after the D-B re-baseline: fold the policy/audit/counter tables into `V14__guided_sessions` (still pre-release) or add forward-only `V19__guided_governance`. | Forward-only `V19__guided_governance.sql` — keeps OBS-012A's "exactly V1–V18" verification stable and resumes the `ARCH.md:123` policy. | AC-1/AC-3/AC-8 DDL file names; OBS-012A Verification note. |
| Pruning strategy for `progress`/`safe_result`. | Null the columns after the window; rows and receipts stay (publication integrity). | AC-3 oracle. |
| Side-effect stance default for a new application. | `CLARIFY_FIRST`. | AC-6 oracle set. |

### Out of scope / tracked in the GA plan

CSRF on the cookie-authenticated API (GA plan §4.D D-1), `IdempotencyFilter` re-authorization review (D-2b — named, not resolved), security headers/HSTS/CSP and `local` profile identity (D-4), SIEM sink provisioning and alerting (G-1 operability; OBS-009 for chart values), video retention acceptance (F-2), GA sign-off package (J-1), identity-bypass code paths (inventory CLN-30/31, ED-02). The compliance **approval** (OBS-010 gate). UI rendering of untrusted labels (OBS-008).

### Repository conventions

Java 21/Spring/PostgreSQL/Flyway (forward-only after OBS-012A); runner TypeScript with Vitest tiers; one public OpenAPI with both pins re-anchored on every edit; all backend Gradle runs serialized; never mark the external approval or an unavailable SIEM as passed.

## Testing

Backend: unit tests for grounding/destructive/side-effect rules on OBS-005 fixtures; ITs on Testcontainers for policy governance, pruning, per-CSI budgets (two replicas), mandatory `Idempotency-Key`; classifier unit test; audit canary scan over the captured audit stream during the OBS-007 fixture end-to-end. Runner: policy-hash validation unit and fixtures-tier test; `guidedMain.ts` mounted-file refusal. Contracts: v3 `clarification` regenerated, contract tool green; `StudioContractTest`/`confinement.test.ts` pins quoted old/new. Regressions: OBS-005/006/007 joined tests under the new guards.

## CodeRabbit Integration

### Story Type Analysis

Primary: Security. Secondary: API/contract, Database (governance tables). Complexity: high.

### Specialized Agents

@dev owns execution; @data-engineer authors the DDL; @architect provides the technical gate and the T0 rulings; independent @qa (security-scan remit) owns the SDC verdict and Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping; D-2b named as open.
- [ ] Any eventual PR/push is handed to @devops with verified gates; compliance approval remains an OBS-010 external gate.

### Self-Healing and Focus Areas

QA full review: three iterations, 30 minutes. Focus: OWASP authorization/metering, no new page content to the model, fail-closed defaults, persisted counters, audit without values, contract pins. Record an unavailable CodeRabbit tool and use the configured independent review fallback.

## File List

Proposed ownership; root reconciles before dispatch. `(new)` = created.

- `backend/src/main/java/com/citi/put/checks/studio/guided/policy/{ObservationPolicy, ObservationPolicyService, ObservationPolicyRepository, ObservationPolicyController, ObservationPolicyAudit}.java` (new)
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` (policy hash at start; per-CSI limits), `GuidedSessionController.java`, `GuidedSessionProperties.java`, `GuidedContracts.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedProposalValidator.java` (grounding, destructive guard, side-effect stance), `GuidedTranslationService.java` (`labelSource`, budget checks), `GuidedTranslationProperties.java`, `GuidedTranslationStore.java` (token counters)
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedDispatchService.java` (per-action audit event), `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioDispatcher.java` (replay dispatch audit event), `backend/src/main/java/com/citi/put/checks/studio/StudioController.java` (mandatory `Idempotency-Key`)
- `backend/src/main/java/com/citi/put/checks/config/RateLimitClassifier.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/retention/GuidedObservationPruner.java` (new) or the existing retention pruner, `backend/src/main/resources/application.yml` (windows, budgets)
- `backend/src/main/resources/db/migration/V19__guided_governance.sql` (new; @data-engineer; see Decisions pending)
- `studio-runner/src/run/guidedMain.ts` (mounted `applicationPolicy` refused), `observationTypes.ts`, `studio-runner/src/guided/transport.ts` (policy hash validation on the received `context`; `runtime.ts` is OBS-013's and is not edited here)
- **Shared, contract-owner sequenced (ADR-SC-005):** `docs/specs/studio-observed-authoring/contracts/v3/clarification.schema.json`, `fixtures.json`, generated bundles (gen), `docs/specs/studio/openapi.yaml` (policy routes, `Idempotency-Key`), `studio-runner/test/run/confinement.test.ts` (pin), `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java` (op-count) — edited only by the one contract owner shared with OBS-013/015, in sequence
- `docs/specs/studio-observed-authoring/guided-data-flow.md` (new), `docs/specs/studio-observed-authoring/artifact-hmac-design-note.md` (new; design note only — whether it becomes an ADR is @architect's call)
- `backend/src/test/java/com/citi/put/checks/config/RateLimitClassifierTest.java`, `backend/src/test/java/com/citi/put/checks/studio/guided/policy/ObservationPolicyIT.java` (new), `guided/translation/GuidedProposalGroundingTest.java` (new), `GuidedDestructiveGuardTest.java` (new), `GuidedSideEffectPolicyTest.java` (new), `guided/session/GuidedCsiBudgetIT.java` (new), `guided/retention/GuidedObservationPrunerIT.java` (new), `guided/audit/GuidedActionAuditCanaryIT.java` (new), `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java`, `StudioApiIT.java` (`Idempotency-Key`)
- `studio-runner/test/guided/policyHash.test.ts` (new), `studio-runner/test/run/guidedMain.test.ts`
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-014.story.md`

Not owned here: `frontend/src/**` (OBS-008); recording/evidence, `studio-runner/src/guided/runtime.ts`, `guided/evidence/**` (OBS-013 — parallel story, no shared edits); change detection and publication merge (OBS-015 — shares `GuidedSessionService`/`GuidedTranslationService` only under the one-owner rule); SIEM sink/Helm/alerting (OBS-009); `GuidedSessionService.claim()` split (OBS-011).

## PO Validation (2026-10-10) — single path

**Verdict: GO (9/10) — Status: Draft → Ready.** Report `.ai/STUDIO-OBS-014-po-validation-sp.json`. Validated by Pax (@po) against ADR-SC-005 ("Security work becomes stories" P0/P1/P2; Panel evidence 3; placement map row OBS-014). The compliance approval is correctly **external** and gated in OBS-010 — this story never marks it obtained.

**10-point checklist:** 1–10 PASS (risks via the Decisions-pending table and the named residuals; Done = AC oracles + independent @qa with security-scan remit).

**Anchors spot-checked at HEAD (working tree 2026-10-10):** `run/guidedMain.ts:18` requires `STUDIO_GUIDED_CONFIG_FILE`, `:20` accepted keys include `applicationPolicy` (33-line file); `RateLimitClassifier.java:31-36` matches only `/studio/tests/{id}/execute`, `BucketClass {READ, WRITE, EXECUTE, SEND}` at `:7-11`; `V30__studio_guided_sessions.sql:10` `progress jsonb`; `V32__studio_guided_translation.sql:58` `safe_result jsonb`; `run/observationTypes.ts:26,39` `ObservationRule`/`ObservationApplicationPolicy`; `GuidedTranslationService.java:1278` `"Saved input choice "`; `IdempotencyFilter.java:79` reads the header (optional today — AC-9 makes it mandatory on execute); `GuidedProposalValidator`, `GuidedTranslationStore`, `GuidedContracts`, `GuidedSessionProperties`, `StudioApiIT` exist; GA plan D-2b at `:105`; `translation-design.md` exists. The only existing pruner is core `scheduling/partitioning/RetentionPruner.java`.

**Should-fix (non-blocking):**
1. **Shared-file set with OBS-015 is wider than the two named services.** Both File Lists edit `GuidedDispatchService.java`, `GuidedContracts.java`, `GuidedSessionController.java` and `StudioController.java` in addition to `GuidedSessionService`/`GuidedTranslationService`. If the coordinator runs 014 ∥ 015, the single owner must hold the whole set; otherwise apply the ADR fallback 014 → 015.
2. AC-3: name the pruner (new `GuidedObservationPruner` vs extending core `RetentionPruner`) at T0 — the core pruner is partition-oriented and may not fit column nulling.
3. AC-8: fix the problem+json code and `Retry-After` semantics at T0 alongside the other closed codes.
4. V19 is also a candidate number for OBS-013's offsets DDL (parallel story) — confirm the assignment with @data-engineer at T0.

**GO conditions:** T0 records the 014/015 ownership decision and the closed codes before T1; the approval, SIEM sink and real-model guard behaviour are never marked passed here (OBS-010 / OBS-009); only independent @qa sets Done.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from ADR-SC-005 "Security work becomes stories" (P0/P1/P2) and placement map row OBS-014, the 2026-10-09 security panel findings (verified anchors `guidedMain.ts:18-20`, `RateLimitClassifier.java:31-35`, V30:10, V32:58) and ADR-SC-004 trust boundaries; compliance approval named external (OBS-010 gate); GA plan path-independent security items listed as tracked there; 11 ACs; Status Draft | @sm (River) |
| 2026-10-10 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. Report `.ai/STUDIO-OBS-014-po-validation-sp.json` | @po |
