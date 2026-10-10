# Story STUDIO-OBS-015 — Incremental re-learn from the first changed step (ADR-SC-005 D-D)

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-015 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-007, STUDIO-OBS-012A, STUDIO-OBS-013 |
| Dependency notes | OBS-007 for v3 and `secretRef` replay rules; OBS-012A for one contract generation and the per-step snapshot columns in `V15__publication`; OBS-013 because the guided browser must be the recorded `BrowserHandle` the observed adapter needs for prefix replay. May run in parallel with OBS-014 **only** if the coordinator assigns one owner to `GuidedSessionService`/`GuidedTranslationService`; otherwise after OBS-014. result3/session-view3/`commands` edits go through the one contract owner shared with OBS-013/014. OBS-008 follows so the UI shows "Learning from step k" against a real contract (ADR-SC-005 "Order and parallelism"). |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md (D-D incl. architect conditions 1–4; defaults "Readiness vocabulary"; Consequences "Incremental re-learn"; placement map row OBS-015; Verification "D-D"; Alternatives) · docs/stories/STUDIO-INC-001-incremental-compile/ (stable `AuthoringStep` UUIDs and per-step hashing — the **requirement** carries over, the compile-path spec is superseded) · docs/specs/studio-observed-authoring/publication-design.md (exact-plan join, admissions, `admissionProvenanceHash`) · docs/specs/studio-observed-authoring/secret-login-design.md R3 (header: a `secretRef` fill in a reused prefix replays under its rules) · UX panel 2026-10-09 (state copy for `NEEDS_RELEARN`, prefix replay, partial completion) |
| Size | L |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests]

## Story

As a Studio author who edits step 4 of a 10-step test, I want the next Run to repeat steps 1–3 from what it already learned and learn only from step 4 onward, so that fixing one step costs seconds of replay plus the learning of the changed tail, never a whole-test re-learn.

## Acceptance Criteria

Binding (ADR-SC-005 D-D, user correction 2026-10-09): "in case we have a 10-step test and we change step 4, only step 4 and beyond (5..10) should be regenerated." The UX statement is **"Learn again" re-learns from the first changed or drifted step, not the whole test.** Rules and defaults below are the ADR's; nothing here reopens the compile-path INC-001 spec.

1. **AC-1 — Server-side change detection k.** Each published learned plan is an immutable per-step snapshot (revision) with per-step hashes over authored text, referenced variable/secret declarations and step-level configuration, keyed by the stable `AuthoringStep` UUIDs INC-001 introduced (reused, not re-invented). On edit, the first changed step **k** is the first index whose hash differs from the published revision; inserts, deletes and reorders count at the first affected index; multiple edits take the earliest; a test-level configuration change (environment, approved origins, viewport, timeout, browser) ⇒ k = 1; no edit since the last publish ⇒ `READY` (plain replay); first ever Run ⇒ `UNLEARNED` (full learn). `GET /tests/{id}` readiness reports `NEEDS_RELEARN{firstChangedStepId: k}`; `POST /tests/{id}/execute` on a `NEEDS_RELEARN` test ⇒ `409 LEARN_REQUIRED` (OBS-012A vocabulary). Unit tests cover each rule with named fixtures. [ADR-SC-005 D-D; defaults "Readiness vocabulary"; placement map row OBS-015]

2. **AC-2 — Contract change (v3, one generation).** `commands#start` gains `{baseRevisionId, firstLearnStepId}` — **server-computed**; a client value lower than the server's k is refused (closed code), higher is accepted (the author may choose to re-learn more, never less); session state `REPLAYING_PREFIX` is added; `learned-plan`/`revision` gain per-step snapshot hashes and `reusedFrom{revisionId, stepId}` provenance; result3 reports `relearnedFrom` (the first learned step, and the drift switch point j when applicable); generated bundles regenerated via `tools/build-studio-observed-schemas.cjs`; fixtures extended; `StudioContractTest`/`confinement.test.ts` pins re-anchored with old/new quoted; sequenced through the one contract owner with OBS-013/014. [ADR-SC-005 placement map row OBS-015 "contract change in v3"; "Contracts and pins"]

3. **AC-3 — Mixed-mode session in the guided mode.** A Run on `NEEDS_RELEARN` starts a guided session with `baseRevisionId`; the session enters `REPLAYING_PREFIX` and replays steps 1…k-1 from the published plan through the **observed adapter** on the recorded guided browser (OBS-013 handle), model-free (gateway counters zero; both gateways silent), recapturing fresh binding values under their **existing server-issued binding IDs** and applying the same drift refusals and the OBS-007 `secretRef` rules unchanged; then it switches to learning at k through n. The suffix SOURCE_PLAN sees the full checklist but plans only k…n; bindings produced in 1…k-1 are available to k…n planning under their existing IDs. Steps after k are **always** re-learned even when their text is unchanged. [ADR-SC-005 D-D "Defaults stated by the user and adopted"; Consequences "Incremental re-learn"]

4. **AC-4 — Drift during the prefix (architect conditions 1–4).** If prefix replay drifts at step j < k: (1) only target/observation drift (`TARGET_DRIFT`, locator ambiguity, stale generation) switches the session to learning from j; an assertion `FAIL` or `POLICY_REFUSED` in the prefix **stops the run** (the author did not ask to re-interpret a failing check or a refused action); (2) the switch point j is recorded in the receipt and the published revision marks steps j…k-1 as re-learned, not reused; (3) prefix actions already dispatched are never repeated (at-most-once stands); (4) steps j…k-1 charge the same session model budget. The user-facing statement "steps j… were re-learned because the page changed" is carried in result3 for OBS-008. [ADR-SC-005 D-D "Architect conditions"]

5. **AC-5 — Publication merge.** Finalization builds the new revision = reused prefix snapshots 1…k-1 (or 1…j-1 after drift) + newly learned steps; prefix admissions come from the replay receipts, suffix admissions from the new session; `admissionProvenanceHash` is computed over both; the pure validator (`validator/observedReplay.ts` + `ObservedRevisionVerifier`) verifies the merged plan exactly as a fully learned one; the reused prefix's per-step hashes are byte-identical to the base revision's; `reusedFrom` points at the base revision and step; no hidden replay, no model call during finalize (OBS-006 invariants). Replay drift on a `READY` test ("Learn again from step N") starts the **same** mixed-mode mechanism with k = N. [ADR-SC-005 placement map row OBS-015 "publication merge"; Consequences "drift stops at step N, and 'Learn again' starts a mixed-mode session"; OBS-006 AC-1…AC-5]

6. **AC-6 — Oracles (ADR-SC-005 Verification D-D).** Joined test on the real stack: publish a 10-step plan; edit step 4 ⇒ `GET /tests/{id}` = `NEEDS_RELEARN{firstChangedStepId: step-4}`; the Run's session shows `REPLAYING_PREFIX` then learning; gateway counters are zero during steps 1…3 and nonzero from step 4; the new revision's per-step hashes for 1…3 equal the base revision's and 4…10 differ; a second unchanged Run is a plain replay with zero model calls. Additional cases: insert a step at 4, delete step 4, reorder 4↔5 (each ⇒ k = 4); configuration change ⇒ k = 1; prefix drift at j = 2 ⇒ receipt marks 2…3 re-learned and `relearnedFrom` = 2; assertion FAIL in the prefix ⇒ run stops, nothing re-learned; client `firstLearnStepId` lower than server k ⇒ refused; a `secretRef` fill in the reused prefix ⇒ OBS-007 oracles pass unchanged; video from OBS-013 covers both prefix and suffix with offsets. The two incremental corpus cases ("edit step 4 of 10"; "insert a step") are written as repository artifacts for OBS-009's D-C benchmark. [ADR-SC-005 Verification D-D; D-C "The corpus includes at least two incremental cases"]

## Tasks / Subtasks

- [ ] **T0 — Reconcile.** Confirm OBS-007, 012A (V15 columns present), 013 Done; agree the `GuidedSessionService`/`GuidedTranslationService` ownership vs OBS-014 and the contract-edit order; @architect fixes the refusal code for a lowered `firstLearnStepId` and the hash composition; root reconciles the File List.
- [ ] **T1 — Change detection (AC-1).** Per-step hashing over the INC-001 stable IDs; readiness `NEEDS_RELEARN`; `LEARN_REQUIRED` on execute; unit fixtures for every rule.
- [ ] **T2 — Contracts (AC-2).** v3 edits via the contract owner; regenerate; pins.
- [ ] **T3 — Mixed-mode session (AC-3, AC-4).** `REPLAYING_PREFIX` in the session state machine and guided mode; observed adapter on the recorded guided handle; binding recapture under existing IDs; suffix planning window; drift switch under conditions 1–4; budget accounting.
- [ ] **T4 — Publication merge (AC-5).** Builder/lowerer/verifier for merged plans; `reusedFrom`; `admissionProvenanceHash` over both admission sets; "Learn again from step N" wiring.
- [ ] **T5 — Oracles (AC-6).** Joined tests, counters, hash equality, corpus artifacts; regressions (OBS-006/007/013 joined tests); record counts honestly.
- [ ] **T6 — Submit to independent @qa**; only QA can set Done.

## Dev Notes

- INC-001 (`docs/stories/STUDIO-INC-001-incremental-compile/`) is superseded as a compile-path specification (ADR-SC-005 Supersedes); its **requirement** and its stable `AuthoringStep` UUIDs + per-step hashing are reused here. Do not resurrect `compile/incremental` (deleted by OBS-012A).
- The publication design (OBS-006) lacks a hybrid prefix-replay session and a publication merge — those are this story's new mechanisms (ADR-SC-005 Alternatives). Everything else (exact-plan join, immutable admissions, pure validation, fresh Core authorization at finalize) is reused.
- `GuidedSessionService.claim()` (606 lines) and `GuidedTranslationService` are the hot files; the ADR requires one owner if OBS-014 runs concurrently. OBS-011 splits `claim()` later — do not refactor it here.
- Replay drift today stops and offers "Learn again" (OBS-006 AC-5); OBS-007 keeps the drift step named for `LOGIN_REQUIRED`. This story makes "Learn again" incremental.
- UX copy that depends on this contract (OBS-008): "Steps changed — next Run learns from step k", "Repeating saved steps 1–(k-1)…", "Learning from step k", "Completed — steps k–n learned again", "Step N no longer matches the page… → Learn again from step N".
- Repository conventions as OBS-007; the generated bundles are never hand-edited; all backend Gradle runs serialized.

### Decisions pending (written to the stated default)

| Question | Default applied here | ACs that change if decided otherwise |
|---|---|---|
| Any DDL beyond the `V15` columns OBS-012A landed. | None expected; if needed, forward-only (same default as OBS-014). | AC-1/AC-5 persistence. |
| Refusal code when the client lowers `firstLearnStepId`. | Closed code named by @architect at T0 (recorded in the Dev Agent Record). | AC-2 wording only. |

### Out of scope here

UI (OBS-008). Benchmark execution of the incremental cases (OBS-009 D-C). `claim()`/`checkCommand` split (OBS-011). Governance guards (OBS-014) — they apply to the learned suffix automatically.

## Testing

Backend: unit tests for change detection (all rules), merge builder/lowerer/verifier; joined ITs on Testcontainers with the guided mode and Chromium (as `GuidedPublicationReplayIT`) for AC-6 incl. gateway counters and hash equality. Runner: observed adapter in mixed mode on the recorded guided handle (fixtures tier), binding recapture, drift switch, at-most-once. Contracts: regenerated bundles, contract tool, pins quoted. Regressions: OBS-006 publication/replay, OBS-007 secret fixture, OBS-013 recording.

## CodeRabbit Integration

### Story Type Analysis

Primary: Feature/architecture (session state machine, publication merge). Secondary: API contract. Complexity: high.

### Specialized Agents

@dev owns execution; @architect provides the technical gate and T0 rulings; independent @qa owns the SDC verdict and Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping (AC ↔ ADR Verification D-D).
- [ ] Any eventual PR/push is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: three iterations, 30 minutes. Focus: zero model calls in the prefix, at-most-once dispatch, hash equality of reused steps, architect conditions 1–4, no hidden replay in finalize. Record an unavailable CodeRabbit tool and use the configured independent review fallback.

## File List

Proposed ownership; root reconciles before dispatch.

- `backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java` (`NEEDS_RELEARN`, k), `studio/authoring/**` (per-step hashing over stable IDs), `StudioService.java` (readiness projection), `StudioController.java` (`LEARN_REQUIRED`)
- `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java` (`REPLAYING_PREFIX`, `baseRevisionId`/`firstLearnStepId`), `GuidedSessionController.java`, `GuidedContracts.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationService.java` (suffix planning window, budget accounting), `GuidedTranslationCoordinator.java`
- `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedDispatchService.java`, `GuidedMaterializationService.java` (binding recapture under existing IDs)
- `backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPlanBuilder.java`, `GuidedPlanPublisher.java`, `ObservedArtifactLowerer.java`, `ObservedRevisionVerifier.java`, `PublicationContracts.java`, `GuidedPublicationRepository.java`, `GuidedPublicationResultProjector.java`
- `backend/src/main/java/com/citi/put/checks/studio/entity/UITestRevision.java` (snapshot columns from `V15`)
- `studio-runner/src/guided/runtime.ts`, `transport.ts`, `ownership.ts` (`REPLAYING_PREFIX`), `studio-runner/src/run/observedReplayAdapter.ts` (mixed mode on the guided handle), `studio-runner/src/executor/observedReplay.ts`, `studio-runner/src/validator/observedReplay.ts` (merged plan)
- `docs/specs/studio-observed-authoring/contracts/v3/commands.schema.json`, `session.schema.json`, `session-view.schema.json`, `learned-plan.schema.json`, `revision.schema.json`, `result.schema.json`, `fixtures.json`, `publication-fixtures.json` (sequenced with OBS-013/014), generated bundles (gen), `docs/specs/studio/openapi.yaml` (readiness, `LEARN_REQUIRED`; pin re-anchor)
- `backend/src/test/java/com/citi/put/checks/studio/readiness/ChangeDetectionTest.java` (new), `guided/publication/IncrementalRelearnIT.java` (new; AC-6), `GuidedPlanBuilderTest.java`, `ObservedArtifactLowererTest.java`, `GuidedPublicationReplayIT.java` (regression), `StudioContractTest.java`
- `studio-runner/test/fixtures-tier/mixed-mode-prefix.test.ts` (new), `studio-runner/test/guided/ownership.test.ts`, `observedReplayValidation.test.ts`, `studio-runner/test/run/confinement.test.ts` (pin)
- `studio-runner/evaluation/observed-authoring/cases/incremental-edit-step-4.json`, `incremental-insert-step.json` (new; corpus artifacts for OBS-009)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-015.story.md`

Not owned here: `frontend/src/**` (OBS-008), recording (OBS-013), policy/grounding/budgets (OBS-014), `claim()` split (OBS-011), `V15__publication.sql` (OBS-012A).

## PO Validation (2026-10-10) — single path

**Verdict: GO (9/10) — Status: Draft → Ready.** Report `.ai/STUDIO-OBS-015-po-validation-sp.json`. Validated by Pax (@po) against ADR-SC-005 D-D (user correction 2026-10-09, architect conditions 1–4), placement map row OBS-015 and Verification "D-D".

**User requirement → AC mapping (10-step test, change step 4 ⇒ only 4…10 re-learned; snapshot of the previous):** AC-1 defines k falsifiably (authored text + referenced var/secret declarations + step-level config; inserts/deletes/reorders at the first affected index; multiple edits ⇒ earliest; test-level config ⇒ k = 1; no edit ⇒ `READY`; first Run ⇒ `UNLEARNED`) and the immutable per-step snapshot revision. AC-3 requires zero model calls for 1…k-1 (both gateways silent), fresh binding values under existing IDs, and "steps after k are **always** re-learned". AC-5 requires byte-identical prefix hashes, `reusedFrom`, merged `admissionProvenanceHash`, pure validation, no model call at finalize. AC-4 carries conditions 1–4 verbatim. AC-2 names the contract change (`commands#start {baseRevisionId, firstLearnStepId}` server-computed, client may not lower; `REPLAYING_PREFIX`; per-step hashes + `reusedFrom`; result3 `relearnedFrom`). AC-6 is the ADR Verification D-D oracle plus insert/delete/reorder, config ⇒ k = 1, drift at j, FAIL-in-prefix stop, lowered-k refusal, `secretRef` in prefix, video coverage, and the two D-C corpus artifacts. Dependency on OBS-013 is justified (the observed adapter needs the recorded `BrowserHandle`).

**10-point checklist:** 1–10 PASS.

**Anchors spot-checked at HEAD (working tree 2026-10-10):** `docs/stories/STUDIO-INC-001-incremental-compile/spec/requirements.json:378` stable step UUID; `dto/AuthoringStep.java` and `studio/authoring/` exist; `GuidedSessionService.claim()` signature at `:565` of a 2,130-line file (the "606 lines" figure is the panel's and was not re-measured here); `checkCommand` is `GuidedTranslationService.java:87,459`, consistent with Dev Notes; `publication-design.md:61` `admissionProvenanceHash`; `GuidedPlanBuilder`, `GuidedPlanPublisher`, `ObservedArtifactLowerer`, `ObservedRevisionVerifier`, `PublicationContracts`, `GuidedPublicationRepository`, `GuidedMaterializationService`, `GuidedTranslationCoordinator`, `guided/ownership.ts`, `executor/observedReplay.ts`, `validator/observedReplay.ts` exist; `contracts/v3/` already exists (OBS-007 in flight); OBS-012A AC-6 lands the V15 per-step hash + `reusedFrom` columns; design R3 header and §10 `:259` state the prefix `secretRef` rule; `ExecutionReadinessService` still emits `COMPILE_REQUIRED` (11 hits) — renamed by 012A, so the 012A dependency is real; `studio-runner/evaluation/observed-authoring/` does not exist yet (new, consistent with OBS-009).

**Should-fix (non-blocking):**
1. **Shared-file set with OBS-014** also includes `GuidedDispatchService.java`, `GuidedContracts.java`, `GuidedSessionController.java`, `StudioController.java` — one owner for the whole set if parallel, else 014 → 015 (ADR fallback).
2. AC-1 wording: the stable step UUIDs originate in 10.35 `AuthoringV2Request`/V21 `authoring` (INC-001 `research.json:172` adopted them); say "reused from 10.35/INC-001" rather than "INC-001 introduced". No behavioural change.
3. AC-6: name the counter source for "gateway counters zero" (the `NoRuntimeLlmTest`/`DeReadyCarryForwardTest` precedent) so @qa reproduces the oracle the same way.

**GO conditions:** starts only after OBS-013 Done and the V15 columns are verified present at T0; 014/015 ownership recorded before T1; @architect fixes the lowered-`firstLearnStepId` refusal code and the hash composition at T0; only independent @qa sets Done.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from ADR-SC-005 D-D (user correction, architect conditions 1–4), placement map row OBS-015, Verification "D-D", the STUDIO-INC-001 stable-ID/per-step-hash requirement carried over, the OBS-006 publication design seams and the UX panel copy; 6 ACs; Status Draft | @sm (River) |
| 2026-10-10 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. Report `.ai/STUDIO-OBS-015-po-validation-sp.json` | @po |
