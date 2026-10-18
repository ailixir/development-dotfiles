# Story STUDIO-OBS-012B — Compile-path retirement (frontend) and learn vocabulary

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-012B |
| Status | **Done** |
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

- [x] **T0 — Baseline and reconciliation.** Confirm OBS-012A Done (one public OpenAPI, readiness vocabulary); take the vitest baseline; grep importers of every module in AC-1/AC-2 at HEAD; root reconciles the File List.
- [x] **T1 — Relocate and delete (AC-1, AC-2, AC-6).** RETIRED guard relocation with mutation proof; delete `review/**`, `CodeTab`, inference, authoring feature, `legacyTestIr`, `testSteps`, barrels; fix importers.
- [x] **T2 — Clients, types, MSW (AC-3).** Remove compile clients/types/handlers/fixtures; re-point `studioContract.test.ts`; vocabulary types.
- [x] **T3 — Run control and copy (AC-4, AC-5).** Re-point `useRunGate`/`RunControl`/`runEnablement`; interim "learning is not yet available" state; vocabulary sweep with the UX panel sentences; chip for `READY`.
- [x] **T4 — Verify and record (AC-6).** Gates, grep, reconciled counts, File List as actually changed; submit to independent @qa; only QA can set Done.

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

### PO ruling — 2026-10-13 — AC-3 handler-coverage allowlist and orphaned spec documents (T0, RK-6)

> Ruling record: `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ruling-012B-allowlist.json` (Pax, @po). Resolves T0 plan `t0-plan-012B-013-014.json` RK-6 and `gates.STUDIO-OBS-012B.openRulingsForT0`. Clarifies AC-3; the AC meaning is unchanged. Measured on the dirty 012A working tree, so S0 re-verifies after 012A is committed.

**1. Handler-coverage assertion (AC-3 "every surviving public route has a handler").** It lives in `studioContract.test.ts` and extends the existing document-reading harness. It does not add a second parser.
- *Public* means every operation in `docs/specs/studio/openapi.yaml` without `x-internal: true`, derived at test time and never transcribed (29 today).
- Every public operation has a composed studio MSW handler (`handlers.ts`, `authoringHandlers.ts`, `schedulingHandlers.ts`) or is an allowlist entry. Every studio MSW handler maps to a documented public operation, so zero handlers remain for compile/confirm-compile or under `/api/v2/studio`.
- The allowlist is a closed literal in the test file, keyed by `operationId`, and each entry carries `{class, owner, reason}`. An entry whose operation has gained a handler, left the document or turned internal **fails as stale**. A new uncovered public operation without a PO-ruled entry fails closed.
- Evidence records one negative control per direction: one handler removed → red, and one dummy handler added for an allowlisted operation → red. Both are restored afterwards.

**Allowlist (exact):**
- **Class A — owned by OBS-008, temporary.** OBS-008 must remove these (see its Dev Notes):
  - OBS-008 AC-1: `startGuidedSession`, `readGuidedSession`, `readGuidedResult`, `readGuidedClarification`, `clarifyGuidedSession`, `cancelGuidedSession` and `finalizeObservedPublication`, all under `/guided-sessions…`.
  - OBS-008 AC-1 (video) and AC-7: the guided-session video operation `GET /guided-sessions/{id}/video`. This entry is added at the S1 re-run only once C1 (OBS-013) has landed it, with the `operationId` quoted from the document.
  - OBS-008 AC-5(b)/(c), exercised by AC-9: `listTestSecrets` and `createTestSecret`.
- **Class B — permanent, not OBS-008.** `streamExecution` (`text/event-stream`) is mirrored by the 10.11b scripted transport, whose frames this file validates against `ExecutionSnapshot`. This story adds no SSE mock.
- **Class C — conditional, no frontend consumer in the wave.** These are the OBS-014 AC-1 policy operations that land as public at C2b. They are added at the post-C2b re-run with `operationId`s quoted from the document. OBS-008 has no AC for them, so they are **not** OBS-008's. The first story that adds a frontend client for them removes the entries.
- **Not allowlisted — this story adds the handler.** `validateTestVariables` (`POST /tests/{id}/validate-variables`) was kept by 012A AC-2 (CLN-12). Its responses come from the document. It counts as a named AC-6 addition.
- **Never allowlisted.** These are OBS-008's `vaultSecrets` capability route, which is created with its own handler, and any public operation OBS-015 might add.

**2. Orphaned artifact-1/inference documents.** This story deletes `docs/specs/studio/artifact.schema.json`, `inference.openapi.yaml` and `inference-proposal.schema.json` in T2, in the same change as the re-point (ADR-SC-005 D-A: no legacy path). 012A already removed the producer side (the backend copy and `ArtifactSchemaDriftTest`). The public document no longer references the schema, and the last readers are in this lane. If S0 finds that 012A already deleted any of the three, record that and only re-point.
- **Re-point in `studioContract.test.ts`.** Drop the `artifact.schema.json` read, the describe "the mock artifact matches artifact.schema.json" (4 cases) and the case "the candidate artifact in the ready example validates against artifact.schema.json". Each one is a named AC-6 drop.
- **Fixtures (`fixtures.ts`).** Delete the artifact-1 `mockArtifact` and `currentCandidateArtifact`, because the document no longer declares either. `confirmedRevisionArtifact` becomes `null` or the v3 example `contracts/v3/publication-fixtures.json#/artifact`, which is derived from the contract, not hand-written.
- **One named addition.** Every non-null `confirmedRevisionArtifact` fixture validates against `contracts/v3/replay-artifact.schema.json`, the normative schema named at `openapi.yaml:3207`.
- **Types (`studioTypes.ts`).** `ArtifactStep`/`SourceArtifact` go. `confirmedRevisionArtifact` is typed as the document declares it (`object | null`). v3 plan types belong to OBS-008.
- **Kept, live.** `docs/specs/studio/examples/context-authoring-{valid,invalid}.json` are authoring-context v2 fixtures read by frontend and backend tests.
- **Not rewritten.** Historical mentions stay as they are: ADR-002 dated rows, the links at `studio-inference-contract-v1.md:7` and `studio-execution.md:5` (012A AC-7 adds superseded notes), and the comments at `studio-runner/test/run/confinement.test.ts:136,158`, a C-contract file and an OBS-011 candidate. Evidence lists them as known historical links.
- **Verification.** The grep below must return 0. Today it returns 5, all in `frontend/src`. @qa reproduces it.

  ```
  grep -rnE '(^|[^-])artifact\.schema\.json|inference\.openapi\.yaml|inference-proposal\.schema\.json' frontend/src backend/src studio-runner/src tools backend/build.gradle.kts
  ```

## Testing

Vitest + RTL + MSW (`frontend/src/**/*.test.tsx`); MSW contract test against the one public OpenAPI; a11y suite run (comment-only change to surfaces 4/5); `npm run type-check`, `npm run lint`, `npm run build`, `npm run test`; mutation check of the relocated RETIRED guard; final `/compil/i` grep with listed exceptions. Reconciliation `after = baseline − named drops + named additions` reproduced by @qa.

## CodeRabbit Integration

### Story Type Analysis

Primary: Frontend refactor (removal). Secondary: API client contract. Complexity: medium.

### Specialized Agents

@dev owns execution; @ux-design-expert provides the gate (vocabulary and copy fidelity to the UX panel); independent @qa owns the SDC verdict, the independent grep/count reconciliation, and the Done transition.

### Quality Gates

- [x] Applicable pre-commit checks and focused review recorded.
- [x] Independent SDC QA review with requirement-to-evidence mapping and independent grep.
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
- `docs/specs/studio/artifact.schema.json`, `docs/specs/studio/inference.openapi.yaml`, `docs/specs/studio/inference-proposal.schema.json` (del; PO ruling 2026-10-13 — the only files outside `frontend/`)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-012B.story.md`

Not owned here: `frontend/src/components/studio/guided/**`, `references/**`, `services/api/studioGuidedApi.ts`, `playwright.config.ts` (OBS-008); `SecretInput.tsx`, `studioCapabilities.ts` (OBS-008); `utils/retireLegacyStudioWorker.ts`, `evidence/pinnedVideoEvidenceFacts.ts` (OBS-011); everything outside `frontend/` except the three `docs/specs/studio/` deletions above (in particular `docs/specs/studio/openapi.yaml` and `docs/specs/studio/examples/**` are not edited here).

### File List as changed (@dev, 2026-10-13; attributed against T0 sha256 in `docs/qa/evidence/STUDIO-OBS-012B/t0-source-hashes.json`)

Created (1):
- `frontend/src/services/mocks/studio/readinessFixtures.ts` — one draft per readiness state; replaces the deleted compile corpus's run-gate role (IDS: CREATE, no readiness fixture existed)

Deleted (58):
- `frontend/src/components/studio/review/**` (31 files: 9 CLN-01 production files, 6 live siblings, 3 CLN-02 helpers, 11 `*.test.tsx`, `artifactSummary.test.ts`, `compilePollBounds.test.ts`)
- `frontend/src/components/studio/CodeTab.tsx`, `frontend/src/components/studio/confirmedSource.test.tsx` (CodeTab/inference tests)
- `frontend/src/components/studio/inference/InferenceStudio.tsx`, `InferenceStudio.test.tsx`
- `frontend/src/components/studio/run/compileWait.test.tsx` (nothing compile-related remains to wait for), `frontend/src/components/studio/run/refusalOutcome.test.tsx` (translator-refusal outcome only)
- `frontend/src/components/studio/runs/index.ts`, `frontend/src/services/mocks/studio/index.ts` (unused barrels)
- `frontend/src/features/studio/authoring/**` (7 files)
- `frontend/src/services/api/studioInferenceApi.ts`, `frontend/src/types/studio/inferenceTypes.ts`, `frontend/src/types/studio/legacyTestIr.ts`
- `frontend/src/services/mocks/studio/inferenceHandlers.ts`, `REVIEW-SCRIPT.md`, `compileFixtures.ts`, `compileFixtureMatrix.test.ts`, `diagnosticsBounds.ts`, `diagnosticsBounds.test.ts` (compile-diagnostics bounds mirror; only importers were the compile corpus and `review/diagnostics.test.tsx`)
- `docs/specs/studio/artifact.schema.json`, `docs/specs/studio/inference.openapi.yaml`, `docs/specs/studio/inference-proposal.schema.json`

Modified (44):
- `frontend/src/types/studio/studioTypes.ts`, `frontend/src/utils/constants/appConfig.ts`, `frontend/src/store/slices/studioSlice.ts`
- `frontend/src/services/api/studioApi.ts`
- `frontend/src/components/studio/run/RunControl.tsx`, `useRunGate.ts`, `runEnablement.ts`, `executeRefusals.ts`, `index.ts`, `executionErrorNarratives.ts` (comment), `pinnedExecutionErrorFacts.ts` (comment), `runGate.test.tsx`, `runActivation.test.tsx`, `refusals.test.tsx`
- `frontend/src/components/studio/runs/useLiveRunsRefresh.ts`
- `frontend/src/components/studio/tests/testListPresentation.ts`, `TestRow.tsx`, `TestRowMenu.tsx` (comment)
- `frontend/src/components/studio/scheduling/schedulePresentation.ts`, `StudioScheduleDialog.tsx`, `StudioScheduleDialog.test.tsx`
- `frontend/src/components/studio/templates/quickStartTemplates.ts`, `quickStartTemplates.test.ts` (comments)
- `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `pageRunGate.test.tsx`, `pageAuthoringUx.test.tsx`, `pageEvidence.test.tsx`, `pageSaveAndStop.test.tsx`, `pageStepTimeout.test.tsx`, `studioRunTransport.node.test.tsx`
- `frontend/src/pages/StudioTestsPage/StudioTestsPage.test.tsx`
- `frontend/src/services/api/studioSchedulesApi.test.ts`
- `frontend/src/services/mocks/studio/handlers.ts`, `authoringHandlers.ts`, `schedulingHandlers.ts`, `fixtures.ts`, `demoFixtures.ts`, `executionFixtures.ts`, `executionFixtureMatrix.test.ts` (comment), `studioContract.test.ts`, `studioHandlers.test.ts`, `studioEscalation.test.ts`, `confirmedRevisionEscalation.test.ts`
- `frontend/src/test/a11y/studioWcagAudit.test.tsx` (surfaces 4/5 pending-rewrite comments; deleted fixture import and draft re-pointed — names and pinned keys unchanged)
- `docs/qa/accessibility/axe-results.json` (regenerated by the a11y suite)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-012B.story.md`

Evidence (new): `docs/qa/evidence/STUDIO-OBS-012B/` — `ledger.json`, `t0-source-hashes.json`, `fe-baseline.json`, `fe-final.json`, `baseline-logs/*`, `mutation-red.txt`, `mutation-green.txt`, `negative-control-1-handler-removed.txt`, `negative-control-2-dummy-allowlisted-handler.txt`, `negative-controls-restore.txt`; post-C2b re-run: `fe-final-c2b.json`, `c2b-pre-entries-red.txt`, `c2b-negative-control-classC-dummy-handler.txt`, `c2b-negative-control-restore.txt`.

Kept, checked: `studioAuthoringTransport.ts` (live caller `studioApi.ts`), `authoringState.ts` (no compile content), `executionStatus.ts`, `runPresentation.ts`, `OnboardingCoach.tsx` (0 `compil` hits at T0 and now). Not touched: `docs/specs/studio/openapi.yaml` (contract step C1 changed it during this run, sha `f502160e…` → `d40c744d…`), backend, studio-runner. Post-C2b re-run: `studioContract.test.ts` (already listed) gained the five class-C entries; `openapi.yaml` (C2b sha `afec6c04…`), `handlers.ts` (`c548df0c…` before = after the negative control) and `axe-results.json` (`65da2253…` before = after) unchanged.

UX-gate fixes (2026-10-14, `ux-gate.json` COPY-001..004, UX-A11Y-001): no new files besides evidence. Edited files are all already listed above: `run/RunControl.tsx`, `run/runGate.test.tsx`, `scheduling/schedulePresentation.ts`, `scheduling/StudioScheduleDialog.tsx`, `scheduling/StudioScheduleDialog.test.tsx`, `pages/ChecksStudioPage/ChecksStudioPage.tsx`, `pages/ChecksStudioPage/pageRunGate.test.tsx`, and `docs/qa/accessibility/axe-results.json` (regenerated: `65da2253…` → `51c29bb4…`). New evidence: `fe-final-ux-fixes.json` (vitest JSON, repo-relative paths); ledger section `uxGateFixes`.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (Dex, @dev), YOLO mode, 2026-10-13.

### Completion Notes

- **T0.** 012A Status Done (story file). Baseline at HEAD `734ad704f` + 012A working tree: vitest 854 tests, 826 pass, 28 fail, plus 5 files failing to load (`review/{artifactSummary,compileStates,confirmFlow,recompile}`, `run/runGate.test.tsx`) — all caused by 012A's contract removal. tsc 0 errors; eslint 0 errors/303 warnings; build OK. `pnpm exec vitest` worked (no fallback). Importers grepped for every AC-1/AC-2 module; `features/studio/authoring/**` and `legacyTestIr.ts` had 0 code importers; both barrels had 0 importers.
- **T1.** 10.51 RETIRED guard relocated to `run/runGate.test.tsx` (scope widened to `components/studio/**`, `services/mocks/studio/**`, `services/api/**`). One-line mutation (a commented import of `@/utils/studio/ir/parseSteps` appended to `run/runEnablement.ts`) turned it red; file restored byte-identical; green. Then `review/**` and the AC-2 modules were deleted with `rm` (nothing staged).
- **T2.** `compileTest`/`confirmCompile` and all compile types removed; `TEST_READINESS_VALUES`/`TestReadiness` (runtime carrier asserted against `TestDto.readiness.enum`) and `LEARN_REQUIRED`; `confirmedRevisionArtifact` typed `Record<string, unknown> | null`; `ArtifactStep`/`SourceArtifact` gone. MSW: compile/confirm handlers and `/api/v2/studio` handlers gone; `validateTestVariables` handler added (mirrors the backend validator's rules). Fixtures: artifact-1 `mockArtifact`/candidate fields gone; confirmed fixtures carry `contracts/v3/publication-fixtures.json#/artifact`. Handler-coverage assertion P1–P5 added with the PO allowlist; P6 negative controls both red, restored.
- **T3.** Run gate: `READY` → execute; every other readiness → Run disabled with "Learning is not yet available in this build, so Run can only repeat a test whose steps are already learned." (tied by `aria-describedby`); `409 LEARN_REQUIRED` worded, not retried. Chip "Learned · ready to repeat" on `READY` (editor and tests list). Never-learned empty state uses the UX sentence verbatim. Code tab removed. Schedule copy moved from "prepare and confirm" to learn wording; schedule `COMPILE_REQUIRED` → `LEARN_REQUIRED` (the document's code).
- **T4.** Final: tsc 0 errors; eslint 0 errors/302 warnings; build OK; vitest 695/695 with `--maxWorkers=3` (two default-worker runs at host load 20–28 timed out 13 and 26 different tests, all timeouts, in files including untouched ones). Reconciliation 854 − 216 + 57 = 695 (names in `ledger.json`). Orphan grep 0. `/compil/i` grep: 12 lines, all in three listed exception classes (ledger `greps.compile.exceptions`).
- **Contract steps.** C1 landed `getGuidedSessionVideo` mid-run; the fail-closed check caught it and the class-A entry was added, quoting the operationId. Class C (C2b policy operations) not in the document yet — root re-runs FE gates after C2b and adds the entries. C2a (`getExecutionVideo` 404/410/416 → shared `$ref`, AR-1 E-1): the video refusal test resolves either form; verified against current literals and a simulated `$ref` form.
- **Post-C2b re-run (2026-10-13).** C2b landed five public OBS-014 guided-policy operations; `studioContract.test.ts` was 67/69 (P2 test and fail-closed test red, naming exactly those five). Added class-C entries per the PO ruling, operationIds quoted from `openapi.yaml` sha `afec6c04…`: `lookupGuidedPolicy`, `createGuidedPolicy`, `readGuidedPolicy`, `createGuidedPolicyVersion`, `approveGuidedPolicyVersion` (owner: first story with a frontend policy client; P4 forces their removal). Allowlist now A 10 / B 1 / C 5. Negative control re-proved: a dummy `GET /guided-policies` handler → P4 "lookupGuidedPolicy (class C) is stale"; `handlers.ts` restored byte-identical; AC-3 block 4/4. Gates: tsc 0 errors; eslint 0 errors/302 warnings; build OK (1 warning, as before); full vitest 695/695 with `--maxWorkers=3` at host load ~11, 1 attempt; contract file 69/69; RETIRED guard 2/2. Reconciliation vs previous final: 695 → 695, 0 named additions, 0 drops, 0 status changes. Orphan grep 0; `/compil/i` 12 lines, exceptions unchanged. Ledger `c2bRerun`.
- **UX-gate fixes (2026-10-14).** Applied the `ux-gate.json` proposed texts verbatim. COPY-001: Proof-tab empty state is now "Run saves your steps and records proof." COPY-002: schedule `LEARN_REQUIRED`/`RUNTIME_INCOMPATIBLE` messages and the dialog's blocked and never-learned alerts use conditional wording ("Once a Run has learned them…", "Resume becomes available once a Run has learned the saved steps."), so they no longer tell the author to use a disabled Run. COPY-003: `ACTIVATION_REVISION_MISMATCH` → "The learned steps changed. Reload and review them before resuming." COPY-004: the busy spinner is `aria-hidden` (was named "Preparing test"). UX-A11Y-001: the learned chip is hidden while edits are unsaved; the interim sentence sits in an always-mounted `role="status"` polite region, so it is announced when a dirty READY Run saves and stops. The optional item (3) was not applied. Tests: +4 (runGate AC-4 (f) a11y live-region/chip, (g) decorative spinner; two schedule copy tests) and 2 updated (blocked-alert text; page COPY-001 text). Negative control: reverting the chip guard turns (f) red. RETIRED guard and allowlist untouched. Gates: tsc exit 0; eslint 0 errors/302 warnings; vitest 699/699 (`--minWorkers=1 --maxWorkers=3`, 1 attempt, load ~9–11, no timeouts). Reconciliation 695 + 4 = 699, 0 removed, 0 status changes. These edits postdate the QA phase-1 digest, so S4 must re-run the touched files. Ledger `uxGateFixes`.
- **[AUTO-DECISION]** WCAG surface 4/5 names and pinned keys contain "compile" → kept (AC-6 and Dev Notes: comment-only here; OBS-008 AC-8 rewrites) and listed as grep exceptions, rather than renamed.
- **[AUTO-DECISION]** `diagnosticsBounds.ts`/`.test.ts`, `confirmedSource.test.tsx`, `run/refusalOutcome.test.tsx` deleted although not named in the File List → they test only deleted compile code (named drops in the ledger).
- **[AUTO-DECISION]** `NEEDS_RELEARN` appears in demo/readiness fixtures (so the run gate is enumerated over every declared state), but its copy ("Steps changed — next Run learns from step k") is not used; the list chip says "Steps changed".
- **Not run.** CodeRabbit (no WSL/coderabbit on this host; recorded, not invented). Backend/runner gates (out of scope).

### Consolidated risks (PO SF-5, resume reconciliation)

The interim frontend only repeats READY tests; guided learning and WCAG surface replacement remain OBS-008, with no intermediate shared release. Contract-handler allowlist entries are temporary and fail closed when their named consumer lands. Full FE tests need bounded workers on this shared host; default-worker timeouts under load are recorded, not counted as passes. ESLint's existing warnings and accessibility debt remain visible. CodeRabbit is unavailable and independent QA is the review fallback. The unrelated `useUrlListState` change and its two tests are preserved; they were already inside the green S4c identity and are not attributed to this story.

### Debug Log References

`docs/qa/evidence/STUDIO-OBS-012B/ledger.json`

## QA Results

### Review Date: 2026-10-14

Reviewed By: Quinn (independent QA)

Reviewed Revision: source-sha256:341cdc10358de0f03840d1668b2eaaadcfc3a7f710c5b2a0223b6ee4e7882d34; S4c-worktree-sha256:af26d1b1a2a31702f23715d5529fa194426709a4ce8b25e2eca2d42b7d959137

**Verdict: CONCERNS.** All six acceptance criteria are met within the explicitly approved interim scope. No high-severity defect, acceptance-criteria waiver, product edit, or test-source edit was introduced by this review. The detailed AC mapping and disposition of every draft/UX finding are in [review-report.json](../../qa/evidence/STUDIO-OBS-012B/resume-qa/review-report.json).

The S4c source was independently matched against all 4,414 start-manifest files before review. Subsequent differences are story bookkeeping only; the 363-file frontend/contract review manifest remains identical. S4c raw logs confirm frontend type-check and lint exit 0 (302 existing warnings), **701 passed / 0 failed / 0 skipped across 56 files**, including the seven WCAG cases. QA closed the missing post-UX build evidence with `npm run build`: exit 0, one existing asset-size advisory. QA also independently ran five focused files: **126 passed / 0 failed / 0 skipped**, covering the run gate, UX fixes, schedule copy, contract allowlist and preserved hook cases.

Name-level reconciliation is **854 − 216 + 57 + 4 = 699 story-suite cases**, plus **2 unrelated preserved hook cases = 701 S4c cases**. The initial dropped/added names match the ledger exactly. Five baseline suites failed to load, so their missing cases are not invented or counted as drops. S4c kept per-file console counts rather than per-name JSON; all 56 file counts match the UX name set plus the two independently executed hook names. Raw backend XML cross-check is **2,084 total = 2,059 passed + 25 skipped**, zero failures/errors; those skipped cases receive no pass credit.

Independent source probes confirm **58 deletions**, zero production `/compil/i` hits, zero orphan schema references, and **15 enumerated test-only exceptions** (the UX-fix tests add three comment/assertion lines to the previous 12). RETIRED and handler negative-control evidence is retained with filtered skips explicitly separated. COPY-001..004 and UX-A11Y-001 are fixed and verified; the UX gate exists; the coordinator added the SF-5 risk list. The authoring transport remains live and centralized. CodeRabbit is unavailable at its configured native location and on PATH; the configured independent-review fallback was used, with no CodeRabbit PASS claimed.

Remaining non-blocking concerns and owners:

- **TEST-001 — frontend/CI owner, OBS-008 T5:** bounded-worker verification is green; earlier default-worker timeouts under shared-host load do not establish default-worker reliability. Keep the worker bound for this host and verify the default configuration on a dedicated gate.
- **TEST-003 — UX and frontend owner, OBS-008 AC-8/9:** surfaces 4/5 intentionally duplicate UNLEARNED under retired names; contrast/target-size are disabled in jsdom, and moderate baseline findings remain. OBS-008 must replace the surfaces and perform browser accessibility checks. The existing busy-label, empty-step description and tooltip observations remain assigned in the report; OBS-011 owns the residual RunDetailsDrawer wording observation.
- **Coordinator / PO:** no intermediate shared release before OBS-008. Class-A handler exceptions are removed by OBS-008 T1/T3; class B is the scripted SSE exception; class C belongs to the first frontend policy-client story.

The existing `axe-results.json` was preserved byte-for-byte. Unrelated frontend edits already present in S4c were preserved, separately listed in the report, and not attributed to this story. Historical raw evidence remains unchanged for provenance; all new evidence uses relative source paths and bounded summaries. Full browser WCAG conformance and the runner lane's isolated CONTEXT_LOST diagnosis are not claimed by this frontend gate.

Files changed by QA: this story's QA Results and lifecycle fields, the independent-review checkbox at the coordinator's explicit request, the story gate, and evidence under `docs/qa/evidence/STUDIO-OBS-012B/resume-qa/`. Root retains ownership of executor bookkeeping and shared gates. No commit, push or deployment was performed.

Gate: CONCERNS → docs/qa/gates/STUDIO-OBS-012B-compile-path-retirement-frontend-and-learn-vocabulary.yml

Lifecycle transition: **InReview → Done**, version **0.3.3**. This is a completed story gate with tracked concerns, not release authorization.

### Strict revalidation — 2026-10-14

Reviewed By: Quinn (independent QA); independent final UX gate: Uma.

Reviewed Revision: **scoped-source-sha256:d39ca2799673251f7ca1cc36c797e29e931338034c1975ae1b08fa74a23f6d6f**. Final source/config/spec/tool binding is recorded in `docs/qa/evidence/STUDIO-OBS-012B/strict-qa/final-source-binding.json` (372 files). Every relevant frontend source, lockfile, build/test/lint configuration, public input and consumed schema remains byte-identical to the independently verified snapshots. The broader global tree is changing in the separate 013/014 lanes: this review explicitly reconciles the unrelated `guided-data-flow.md` tense correction and removal of the empty literal `contracts/v3/*.json` directory, rather than claiming current S4c whole-tree equality.

**Verdict: PASS. Every originally planned applicable local QA validation is complete and green; no local concern or waiver remains.** Fresh exclusive default-worker Vitest execution passed **701/701 cases across 56 files, zero failures and zero skips**, including all **7 required WCAG scans**. Type-check, lint and production build exited 0; the existing 302 lint warnings and one webpack asset-size advisory are disclosed. No worker or timeout override was used. Source and regenerated axe artifact remained unchanged across this execution.

Exact name reconciliation is **854 − 216 + 57 + 4 + 3 − 1 = 701**. The final +3/−1 consists of two preserved unrelated hook cases and the preserved unrelated StudioRunsPage test-title rename (“Go to tests” → “Create Test”); the story contribution remains 699 cases. Every one of the original **28 failed named cases and 5 unloadable suites** is mapped in `strict-qa/baseline-failure-resolution.json` to its explicit retirement or executed passing retained/replacement oracle. The original baseline remains historically failed/unloadable, and missing cases are never invented as named drops. Original `s0-plan-refresh.json` X9 already replaced lead-commit binding with read-only source identities; the architecture addendum confirms that authority without a new waiver.

Current static checks still show **58 deletions**, **zero production `/compil/i` hits**, the exact **15 test-only exceptions**, zero retired production imports/symbols and zero orphan-schema references. Recorded missing-handler/stale-allowlist and RETIRED mutation controls remain verified with deliberate red outcomes and restored green checks; filtered skips receive no credit. All PO SF items and originally required COPY-001–004 / UX-A11Y-001 checks are satisfied. Independent Uma's final gate is **PASS**, `strict-qa/final-ux-gate.json`, SHA-256 `52d1d08c17cea011363e4785f96009286eca6e05bf097425ae578ee539005ec8`.

The prior CONCERNS gate is preserved at `strict-qa/history/canonical-gate-before-strict-pass.yml`; the previous closure remains history. Original scope boundaries remain explicit: no intermediate shared release before OBS-008; pending guided surface/browser accessibility rewrites, inherited moderate axe observations and other pre-existing UX observations were outside 012B's planned local gate. The original automated critical/serious threshold is unchanged. This PASS makes no browser WCAG conformance, external deployment, or broader dedicated-host reliability claim. CodeRabbit is unavailable; the originally configured independent-review fallback was used without claiming a CodeRabbit pass.

Gate: PASS → docs/qa/gates/STUDIO-OBS-012B-compile-path-retirement-frontend-and-learn-vocabulary.yml

Lifecycle transition: **InReview → Done**, version **0.3.6**. Production OBS-015 remains unstarted. No source/test code, README, CLI, commit, push or deployment was changed by this final review.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from ADR-SC-005 (D-A, readiness vocabulary, placement map row OBS-012B), the UX panel 2026-10-09 "Remove (012B)"/"Adapt" lists and state copy, and inventory rows CLN-01/02/03/04/05/06/08/09/14 (protections lifted by the ADR); Status Draft | @sm (River) |
| 2026-10-10 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready. Conditions C1–C4 and should-fixes SF-1…SF-5 in Dev Notes "PO validation — 2026-10-10". Report `.ai/STUDIO-OBS-012B-po-validation.json` | @po |
| 2026-10-13 | 0.1.2 | T0 PO ruling (T0 plan RK-6). AC-3 handler-coverage clarified: closed allowlist keyed by `operationId` with a stale-entry failure. Class A is OBS-008-owned (7 guided operations, the conditional guided video, 2 secrets operations); class B is `streamExecution`; class C is the conditional OBS-014 policy operations. `validateTestVariables` gets a handler here. The orphaned `docs/specs/studio/{artifact.schema.json, inference.openapi.yaml, inference-proposal.schema.json}` are deleted by this story with the `studioContract.test.ts` and fixtures re-point; File List exception added. AC meaning unchanged; Status unchanged (Ready). Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ruling-012B-allowlist.json` | @po (Pax) |
| 2026-10-13 | 0.2.0 | Development started (YOLO mode) — Status: Ready → InProgress | @dev |
| 2026-10-13 | 0.3.0 | Development complete — Status: InProgress → InReview. Compile path retired from the frontend; readiness vocabulary; interim Run state; handler-coverage allowlist; RETIRED guard relocated; 3 orphaned spec docs deleted. Evidence `docs/qa/evidence/STUDIO-OBS-012B/ledger.json` | @dev |
| 2026-10-13 | 0.3.1 | Post-C2b re-run: five class-C allowlist entries (OBS-014 guided-policy operations, operationIds quoted from the landed document) added to `studioContract.test.ts`; P4 negative control re-proved; FE gates re-run green (695/695, counts unchanged). Status unchanged (InReview). Evidence `ledger.json` `c2bRerun` | @dev |
| 2026-10-14 | 0.3.2 | UX-gate fixes COPY-001..004 and UX-A11Y-001 (`docs/qa/evidence/STUDIO-OBS-012B/ux-gate.json`); +4 vitest (699/699). Status unchanged (InReview). Evidence `ledger.json` `uxGateFixes` | @dev |
| 2026-10-14 | 0.3.3 | QA Gate CONCERNS — Status: InReview → Done. Final S4c source verified; production build and 126 focused tests independently passed; all ACs met; worker reproducibility and inherited OBS-008 accessibility concerns retained. Evidence `docs/qa/evidence/STUDIO-OBS-012B/resume-qa/review-report.json` | @qa (Quinn) |
| 2026-10-14 | 0.3.4 | Administrative closure after independent Quinn CONCERNS; exact source and story provenance verified. Status Done remains QA-owned and unchanged. Nonblocking findings placed with owners in OBS-008/009/010/011; `.ai/STUDIO-OBS-012B-close.json` and `resume-20261014/po-closure-placements.json` record verification and limits. No AC or external approval waived. [closure-key: STUDIO-OBS-012B:digest:source-sha256:341cdc10358de0f03840d1668b2eaaadcfc3a7f710c5b2a0223b6ee4e7882d34; S4c-worktree-sha256:af26d1b1a2a31702f23715d5529fa194426709a4ce8b25e2eca2d42b7d959137] | @po (Pax) |
| 2026-10-14 | 0.3.5 | User-directed strict QA reopening — Status: Done → InReview. Prior CONCERNS and administrative closure are historical; completion now requires every planned QA validation executed and green, with no substituted downstream deferral. Independent plan audit pending. | Codex coordinator |
| 2026-10-14 | 0.3.6 | Strict QA Gate PASS — Status: InReview → Done. Every originally planned applicable local validation is green: default-worker 701/701, 7 WCAG, type/lint/build; final independent Uma PASS; exact names and historical failures/unloadables reconciled. Scoped digest `d39ca2799673251f7ca1cc36c797e29e931338034c1975ae1b08fa74a23f6d6f`; prior CONCERNS receipt preserved. | @qa (Quinn) |
| 2026-10-14 | 0.3.7 | Administrative reclosure after independent strict Quinn PASS and final Uma PASS; every originally planned applicable local gate green. Rehashed 372 scoped inputs and 286 execution inputs; exact QA story/gate provenance verified. Prior CONCERNS closure superseded and archived. Status Done unchanged; no lifecycle transition by PO. [closure-key: STUDIO-OBS-012B:digest:scoped-source-sha256:d39ca2799673251f7ca1cc36c797e29e931338034c1975ae1b08fa74a23f6d6f] | @po (Pax) |

## Administrative closure notes — 2026-10-14

These two paragraphs preserve the superseded CONCERNS closure. The strict PASS reclosure below is current.

All six ACs accepted within the interim replay-only scope. Worker/a11y/playback-control concerns are placed in OBS-008; retained vocabulary/scanner/evidence observations are placed in OBS-011. No intermediate shared deployment or release before OBS-008. Class-A/B/C allowlist ownership remains as ruled.

The coordinator accepts the documented nonblocking concerns only for this story’s scoped completion. See [`po-closure-placements.json`](../../qa/evidence/STUDIO-OBSERVED-NEXT/resume-20261014/po-closure-placements.json) for owners and completion conditions. Outstanding follow-ups remain open. No commit, push, deployment, database recreation or external communication occurred.


## Strict PASS administrative reclosure — 2026-10-14

Independent Quinn completed the lifecycle at version 0.3.6 with PASS, and independent Uma completed the planned UX gate with PASS. All originally planned applicable local validation is green: 701/701 fresh default-worker cases across 56 files, all 7 WCAG scans, type-check, lint and production build. Existing 302 lint warnings and one webpack asset-size advisory remain disclosed. The unchanged automated accessibility gate checks its original critical/serious threshold; this is not a browser WCAG conformance claim.

Pax independently rehashed 372 scoped source/config/spec/tool inputs to `d39ca2799673251f7ca1cc36c797e29e931338034c1975ae1b08fa74a23f6d6f`, all 286 execution inputs, the raw logs and named test results, Quinn’s final receipt and Uma’s final gate. The already-excluded `guided-data-flow.md` documentary update has an independent bounded provenance refresh; no whole-tree source equality or 013/014 validation is claimed. Exact test names, 28 historical failed cases and 5 unloadable suites are reconciled without inventing missing baseline cases.

The prior CONCERNS report is preserved in `strict-qa/history/close-before-strict-pass.json`; `.ai/STUDIO-OBS-012B-close.json` and `strict-qa/strict-closure-receipt.json` record this superseding administrative closure. Status Done and QA Results remain unchanged. All original downstream scope remains: OBS-008 owns the guided/browser accessibility rewrite and the temporary contract allowlist consumers; no intermediate shared release before 008. OBS-013/014 remain InReview pending their strict planned gates; OBS-015 production is unstarted. No tests, source changes, CLI, commit, push or deployment were performed by this closure.
