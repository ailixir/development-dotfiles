# Story STUDIO-OBS-012B — Compile-path retirement (frontend) and learn vocabulary

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-012B |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-012A |
| Dependency notes | Runs in parallel with OBS-013 and OBS-014 (no shared files: this story is frontend-only). OBS-008 **must follow** in the frontend lane with no intermediate release — until OBS-008 lands, the Run control can only replay a `READY` revision (ADR-SC-005 placement map row OBS-012B). |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md (D-A, defaults "Readiness vocabulary", placement map row OBS-012B, "Removed / moved / kept") · UX panel 2026-10-09 ("Remove (012B)" and "Adapt" lists; single-path UI state model) · docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md (rows CLN-01, 02, 03, 04, 05, 06, 08, 09, 14; G5, G7) · docs/stories/10.51.story.md (RETIRED guard, count-and-name method) |
| Size | M |

executor: "dev"
quality_gate: "ux-design-expert"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, accessibility-audit]

## Story

As a Studio author on the single path, I want the frontend to stop offering, naming or mocking a compile step, so that the only words I see are about learning and repeating my steps and no dead compile-review, inference or authoring-v2 code ships in the GA bundle.

## Acceptance Criteria

Method is 10.51's: every deleted module re-grepped at HEAD with the command recorded; every dropped test counted and named against a fresh vitest baseline (inventory G5); the RETIRED guard relocated before its host is deleted (G7). Binding: ADR-SC-005 D-A — the 10.51 AC-9 protections on `components/studio/inference/**`, `studioInferenceApi.ts`, `inferenceTypes.ts`, `inferenceHandlers.ts`, `features/studio/authoring/**`, `studioTypes.ts` compile types are **lifted by the ADR** for compile-path items (OBS-012A records the dated note in `decisions.md`).

1. **AC-1 — Compile review UI deleted.** `frontend/src/components/studio/review/**` is deleted entirely, including the "live siblings" (`CompileElapsed.tsx`, `formatElapsed.ts`, `artifactSummary.ts`, `compileDiagnosticNarratives.ts`, `compileErrorCodes.ts`, `compilePollBounds.ts`) after their importers (`run/RunControl.tsx`, `run/useRunGate.ts`, `runs/useLiveRunsRefresh.ts`, `CodeTab.tsx`) stop needing them; the 11 `review/*.test.tsx` files and `reviewTestHarness.tsx`/`pinnedNarratives.ts`/`forbiddenClaims.ts` go with them; the one `run/compileWait.test.tsx` case that renders `CompileReviewPanel` is reworked or the file is deleted if nothing compile-related remains to wait for; `services/mocks/studio/REVIEW-SCRIPT.md` is deleted. Before deleting `review/diagnostics.test.tsx`, the 10.51 RETIRED guard it hosts is relocated (e.g. `run/runGate.test.tsx`) and shown to fail under a one-line mutation, restored. [ADR-SC-005 placement map row OBS-012B; UX panel "Remove (012B)"; inventory CLN-01, CLN-02, G7]

2. **AC-2 — `CodeTab`, inference, authoring-v2 and legacy IR deleted.** `components/studio/CodeTab.tsx` is removed from `ChecksStudioPage` (the read-only "Steps as learned" explanation that replaces it is OBS-008); `components/studio/inference/**`, `services/api/studioInferenceApi.ts`, `types/studio/inferenceTypes.ts`, `services/mocks/studio/inferenceHandlers.ts`, the `STUDIO_AUTHORING_V2` flag in `utils/constants/appConfig.ts` (and its `window.__CHECKS_CONFIG__.studioAuthoringV2` read), `features/studio/authoring/**`, `types/studio/legacyTestIr.ts`, `studioSlice.testSteps` and its `.map` in `setExecuting`, and the unused barrels `components/studio/runs/index.ts` and `services/mocks/studio/index.ts` are deleted; `studioAuthoringTransport.ts` stays only if a surviving caller remains (grep). [ADR-SC-005 D-A; UX panel "Remove (012B)"; inventory CLN-04, CLN-05, CLN-06, CLN-08, CLN-09, CLN-14]

3. **AC-3 — Compile clients, types and MSW removed.** `studioApi.ts` loses `compileTest`/`confirmCompile` (and `ConfirmCompileRequest` in `studioTypes.ts`); `services/mocks/studio/handlers.ts` loses the compile/confirm handlers; `compileFixtures.ts` and `compileFixtureMatrix.test.ts` are deleted; `studioContract.test.ts` is re-pointed at the one public OpenAPI OBS-012A produced (no handler for a route that no longer exists; every surviving public route has a handler); `validateVariables` stays (documented by OBS-012A). The studio types for readiness use the single-path vocabulary `UNLEARNED | LEARNING | READY | NEEDS_RELEARN` and conflict code `LEARN_REQUIRED` (`COMPILE_REQUIRED`, `compileStatus`, `artifactHash`-as-compile-identity disappear from `studioTypes.ts`). [ADR-SC-005 defaults "Readiness vocabulary"; inventory CLN-03; UX panel "Adapt"]

4. **AC-4 — Run control re-pointed; honest interim state.** `useRunGate`/`RunControl`/`runEnablement` lose compile-then-execute: readiness comes from `GET /tests/{id}` and the last result, not `compileStatus`; `READY` runs the ordinary replay; every other readiness state disables Run and states, in the words of ADR-SC-005, that **learning is not yet available in this build** (acceptable only because no shared environment is deployed; OBS-008 replaces this with the guided transport). No compile refusal narrative remains in `executionErrorNarratives.ts`/`executeRefusals.ts`; `useLiveRunsRefresh` no longer polls compile bounds. [ADR-SC-005 placement map row OBS-012B ("until OBS-008…"); UX panel "Adapt: RunControl, useRunGate, runEnablement"]

5. **AC-5 — "Compile" → "learn" vocabulary.** User-facing strings in `tests/testListPresentation.ts`, `scheduling/schedulePresentation.ts`, `run/*` narratives, empty-state copy and `OnboardingCoach.tsx`/`templates/quickStartTemplates.ts` no longer say compile/compiled/compiling or "ready to run" in the compile sense; the never-learned empty state uses the UX panel sentence verbatim: "Write your steps, then press Run. The first Run works through them on the live page and saves what it learned. Later Runs repeat it in seconds." The learned chip "Learned · ready to repeat" is introduced for `READY`; `NEEDS_RELEARN` copy ("Steps changed — next Run learns from step k") is reserved for OBS-008 (the server does not emit it before OBS-015). A grep for `/compil/i` over `frontend/src` (excluding guard-test literals listed in evidence) returns 0. [UX panel 2026-10-09 state model; ADR-SC-005 "Removed / moved / kept"]

6. **AC-6 — Count, name, verify.** Fresh vitest baseline at HEAD; `after = baseline − named drops + named additions` reconciled by @qa (expected named drops: the 11 review test files, `compileWait.test.tsx` case(s), `InferenceStudio.test.tsx` (14), `compileFixtureMatrix.test.ts`, `authoringReducer.test.ts`/`authoringSelectors.test.ts`, `studioAuthoringTransport.test.ts` if its module goes); `npm run type-check`, `npm run lint`, `npm run build`, `npm run test` green; the existing a11y suite `studioWcagAudit.test.tsx` still runs — its surfaces 4/5 ("compile-review"/"confirm" states, inventory CLN-11) are marked pending rewrite with a comment, not deleted, because OBS-008 rewrites them to real guided states; `docs/qa/accessibility/axe-results.json` regeneration is a known side effect. [inventory G5, G8, CLN-11; 10.51 method]

## Tasks / Subtasks

- [ ] **T0 — Baseline and reconciliation.** Confirm OBS-012A Done (one public OpenAPI, readiness vocabulary); take the vitest baseline; grep importers of every module in AC-1/AC-2 at HEAD; root reconciles the File List.
- [ ] **T1 — Relocate and delete (AC-1, AC-2, AC-6).** RETIRED guard relocation with mutation proof; delete `review/**`, `CodeTab`, inference, authoring feature, `legacyTestIr`, `testSteps`, barrels; fix importers.
- [ ] **T2 — Clients, types, MSW (AC-3).** Remove compile clients/types/handlers/fixtures; re-point `studioContract.test.ts`; vocabulary types.
- [ ] **T3 — Run control and copy (AC-4, AC-5).** Re-point `useRunGate`/`RunControl`/`runEnablement`; interim "learning is not yet available" state; vocabulary sweep with the UX panel sentences; chip for `READY`.
- [ ] **T4 — Verify and record (AC-6).** Gates, grep, reconciled counts, File List as actually changed; submit to independent @qa; only QA can set Done.

## Dev Notes

- The UX panel's "Remove (012B)" list is this story's scope; its "Adapt" list is shared with OBS-008 — here only what is needed to remove compile and keep the build green; OBS-008 owns the guided states, picker, video and a11y. Do **not** start guided components here.
- `ChecksStudioPage.tsx` keeps its own `useState` `testSteps` (the Redux field is dead, CLN-14). `STUDIO_CAPABILITIES.vaultSecrets` is not a dead flag — OBS-008 replaces it with a server capability; leave it.
- `studioWcagAudit.test.tsx` is touched here (comment only) and rewritten by OBS-008 — sequential, not parallel. `frontend/playwright.config.ts` is created by OBS-008, not here.
- Readiness and conflict vocabulary come from OBS-012A's OpenAPI; derive types from it, do not hand-write shapes.
- Repository conventions: React 18 + TypeScript strict, MUI v7 with `sx`, Redux Toolkit, MSW for all API interactions, Vitest + RTL; all HTTP through the central `apiClient` (CLAUDE.md). Never mark an unavailable backend as passed.

### Out of scope here

Guided transport, states, picker, video, a11y rewrite, Playwright config (OBS-008). Backend/runner/contracts (OBS-012A). `retireLegacyStudioWorker.ts` shim sunset (CLN-10) and `PinnedStoppedRunRecordingFacts` (CLN-07) — OBS-011. Repo-wide npm dependency hygiene (CLN-13) — out of the wave.

### PO validation — 2026-10-10 — GO 8/10, Status Draft → Ready

> Report: `.ai/STUDIO-OBS-012B-po-validation.json`. Validator: Pax (@po). Method: `validate-next-story.md` steps 0–12 plus the `story-lifecycle.md` 10-point checklist, against ADR-SC-005 (D-A, readiness vocabulary, placement map row OBS-012B), the cleanup inventory (CLN-01…14, G5, G7) and the current `frontend/src` tree. Read-only cross-check; no `npm` run.

**Checklist 8 PASS / 2 PARTIAL.** PARTIAL #3 (testability): AC-4 names the behaviour and the exact interim sentence but no test that asserts it (SF-2). PARTIAL #8 (risks): hazards are scattered in Dev Notes (CLN-14 neutrality, a11y baseline regeneration, no release before OBS-008) with no consolidated list (SF-5). Executor `dev` ≠ gate `ux-design-expert`; `accessibility-audit` fits. [AUTO-DECISION] gate `ux-design-expert` accepted although the framework's gate list names @architect/@dev/@pm — the wave README assigns copy-fidelity gates to UX for 012B and executor ≠ gate holds. Template complete. Code-intel unavailable; epic context cross-referenced manually (README, wave plan batch 3 with 013/014, OBS-008 File List).

**Anchors verified on this tree:** `components/studio/review/` holds the nine CLN-01 files, the six live siblings (`CompileElapsed.tsx`, `formatElapsed.ts`, `artifactSummary.ts`, `compileDiagnosticNarratives.ts`, `compileErrorCodes.ts`, `compilePollBounds.ts`), the three CLN-02 helpers and **11 `*.test.tsx`** (82 `it()` by static count) **plus two `*.test.ts`** (`artifactSummary.test.ts` 9, `compilePollBounds.test.ts` 4); `review/diagnostics.test.tsx:256` RETIRED guard; `run/runGate.test.tsx` exists (relocation host); `run/compileWait.test.tsx:14,248` renders `CompileReviewPanel`; `CodeTab.tsx` mounted at `ChecksStudioPage.tsx:60,1213`; `inference/InferenceStudio.test.tsx` 14 cases; `appConfig.ts:56-57` `STUDIO_AUTHORING_V2`; `features/studio/authoring/` 7 files, 0 external importers; `legacyTestIr.ts`, both barrels, `compileFixtures.ts`, `compileFixtureMatrix.test.ts`, `REVIEW-SCRIPT.md` exist; `studioSlice.ts:4,22,38` `testSteps`; `studioApi.ts:132` `compileTest`, `:140` `confirmCompile`; `studioTypes.ts:361,396` `compileStatus`, `:371` `ConfirmCompileRequest`, `:373` `artifactHash`; `useRunGate.ts:266,320-360` compile-then-execute; `useLiveRunsRefresh.ts:2` imports `compilePollBounds`; `studioWcagAudit.test.tsx:99-100` surfaces `compile-review`/`confirm`; `studioCapabilities.ts:3` `vaultSecrets: false` (keep); `studioAuthoringTransport.ts` live via `studioApi.ts` and the authoring mocks (keep); `studioContract.test.ts:56,61` reads `docs/specs/studio/openapi.yaml` (the one public document after OBS-012A); "ready to run" in `testListPresentation.ts`, `executeRefusals.ts`, `StudioTestsPage.test.tsx`; `/compil/i` hits 46 non-test source files today — AC-5's grep-to-zero is a real sweep, not a formality.

**AC-4 interim state:** the story says it in ADR words ("learning is not yet available in this build"), ties it to "no shared environment is deployed", and the Dependency notes plus Quality Gates forbid a release before OBS-008. After OBS-012A the server answers `UNLEARNED` and `409 LEARN_REQUIRED`, so the interim copy is honest. It becomes testable once SF-2 lands.

**Should-fix at T0 (Dev Notes/File List/named oracles; no AC changes):** SF-1 `review/artifactSummary.test.ts` (9) and `review/compilePollBounds.test.ts` (4) are deleted by AC-1 ("`review/**` entirely") but missing from AC-6's named-drop list — name them or the reconciliation misses 13 cases. SF-2 name the AC-4 oracle: RTL tests (file fixed at T0, e.g. `run/runGate.test.tsx` or `pages/ChecksStudioPage/pageRunGate.test.tsx`) asserting (a) `READY` → execute called, zero compile calls; (b) every non-`READY` readiness value → Run disabled and the exact interim sentence; (c) `409 LEARN_REQUIRED` from execute rendered without a compile narrative. SF-3 `OnboardingCoach.tsx` has 0 `compil` hits today — AC-5 still applies (grep to zero); informational. SF-4 `StudioTestsPage.test.tsx`, `StudioScheduleDialog.tsx`/`.test.tsx` and `run/refusals.test.tsx` carry compile vocabulary/readiness types and are not in the File List — add at T0. SF-5 consolidate the risks (interim state visible in dev builds; `axe-results.json` regeneration; frontend lane frozen until OBS-008).

**File List vs parallel stories:** OBS-013 and OBS-014 exclude `frontend/src/**` — disjoint. OBS-008 overlaps (`RunControl`, `useRunGate`, `testListPresentation`, `studioSlice`, `studioWcagAudit`, `ChecksStudioPage`) strictly after this story in the frontend lane.

**Conditions on GO:** C1 — T0 applies SF-1, SF-4 and SF-5. C2 — the SF-2 tests exist and are named before T4. C3 — @qa reproduces the `/compil/i` grep (exceptions listed) and `after = baseline − named drops + named additions`. C4 — coordinator: no release between this story and OBS-008 (already stated; restated as a gate).

## Testing

Vitest + RTL + MSW (`frontend/src/**/*.test.tsx`); MSW contract test against the one public OpenAPI; a11y suite run (comment-only change to surfaces 4/5); `npm run type-check`, `npm run lint`, `npm run build`, `npm run test`; mutation check of the relocated RETIRED guard; final `/compil/i` grep with listed exceptions. Reconciliation `after = baseline − named drops + named additions` reproduced by @qa.

## CodeRabbit Integration

### Story Type Analysis

Primary: Frontend refactor (removal). Secondary: API client contract. Complexity: medium.

### Specialized Agents

@dev owns execution; @ux-design-expert provides the gate (vocabulary and copy fidelity to the UX panel); independent @qa owns the SDC verdict, the independent grep/count reconciliation, and the Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping and independent grep.
- [ ] Any eventual PR/push is handed to @devops with verified gates; no release between this story and OBS-008.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations with the configured 30-minute timeout. Focus: no behaviour change beyond removal, no dead compile vocabulary, centralized transport preserved, test-count reconciliation, WCAG suite still green. Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

Proposed ownership; fixed at T0 against HEAD. `(del)` = deleted.

- `frontend/src/components/studio/review/**` (del, all files incl. live siblings and the 11 tests), `frontend/src/components/studio/run/compileWait.test.tsx` (rework or del), `run/runGate.test.tsx` (RETIRED guard relocated here)
- `frontend/src/components/studio/CodeTab.tsx` (del), `frontend/src/components/studio/inference/**` (del), `frontend/src/features/studio/authoring/**` (del), `frontend/src/types/studio/legacyTestIr.ts` (del), `frontend/src/types/studio/inferenceTypes.ts` (del), `frontend/src/services/api/studioInferenceApi.ts` (del), `frontend/src/services/mocks/studio/inferenceHandlers.ts` (del), `frontend/src/services/mocks/studio/REVIEW-SCRIPT.md` (del), `frontend/src/services/mocks/studio/compileFixtures.ts` (del), `compileFixtureMatrix.test.ts` (del), `frontend/src/components/studio/runs/index.ts` (del), `frontend/src/services/mocks/studio/index.ts` (del)
- `frontend/src/services/api/studioApi.ts`, `studioAuthoringTransport.ts` (+ test; keep only with a live caller), `frontend/src/services/mocks/studio/handlers.ts`, `studioContract.test.ts`, `studioHandlers.test.ts`, `studioEscalation.test.ts`, `authoringHandlers.ts`, `authoringState.ts`, `fixtures.ts`, `executionFixtures.ts`
- `frontend/src/types/studio/studioTypes.ts` (compile types removed; readiness vocabulary)
- `frontend/src/utils/constants/appConfig.ts` (`STUDIO_AUTHORING_V2` removed)
- `frontend/src/store/slices/studioSlice.ts` (`testSteps` removed)
- `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` (CodeTab unmounted; interim state), `pages/ChecksStudioPage/*.test.tsx` (compile cases removed/reworked by name)
- `frontend/src/components/studio/run/RunControl.tsx`, `useRunGate.ts`, `runEnablement.ts`, `executionErrorNarratives.ts`, `executeRefusals.ts`, `executionStatus.ts`, `index.ts`, `run/*.test.tsx`
- `frontend/src/components/studio/runs/useLiveRunsRefresh.ts`, `runPresentation.ts`
- `frontend/src/components/studio/tests/testListPresentation.ts`, `frontend/src/components/studio/scheduling/schedulePresentation.ts`, `frontend/src/components/studio/OnboardingCoach.tsx`, `frontend/src/components/studio/templates/quickStartTemplates.ts`
- `frontend/src/test/a11y/studioWcagAudit.test.tsx` (comment on surfaces 4/5 only), `docs/qa/accessibility/axe-results.json` (regenerated side effect)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-012B.story.md`

Not owned here: `frontend/src/components/studio/guided/**`, `references/**`, `services/api/studioGuidedApi.ts`, `playwright.config.ts` (OBS-008); `SecretInput.tsx`, `studioCapabilities.ts` (OBS-008); `utils/retireLegacyStudioWorker.ts`, `evidence/pinnedVideoEvidenceFacts.ts` (OBS-011); everything outside `frontend/`.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from ADR-SC-005 (D-A, readiness vocabulary, placement map row OBS-012B), the UX panel 2026-10-09 "Remove (012B)"/"Adapt" lists and state copy, and inventory rows CLN-01/02/03/04/05/06/08/09/14 (protections lifted by the ADR); Status Draft | @sm (River) |
| 2026-10-10 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready. Conditions C1–C4 and should-fixes SF-1…SF-5 in Dev Notes "PO validation — 2026-10-10". Report `.ai/STUDIO-OBS-012B-po-validation.json` | @po |
