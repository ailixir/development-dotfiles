# Story STUDIO-OBS-008 — First guided Studio UI: one Run, secret references, blocked-by-login

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-008 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-007 (final v3 contracts, `openapi-v3.yaml`, `LOGIN_REQUIRED` codes) |
| Source | docs/specs/studio-observed-authoring/consensus-plan.md §§1, 4, 6, 9 (as amended §8.1), 10, 11 · secret-login-design.md §3, §5, §4.6 I-B6/I-C11, §10 · UI-STUDIO-GA-PLAN.md §4.C C-1, C-5, C-7 · UX review 2026-10-09 (coordinator brief) · docs/runbooks/studio-guided-authoring.md "Publication, reconnect and receipt access" |
| Size | L — first guided screen; larger than the original draft (GA plan §6 "Frontend") |

executor: "ux-design-expert"
quality_gate: "dev"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, accessibility-audit]

## Story

As a nontechnical Studio author, I want one Run control that runs my plain-language checklist as a guided first run or as a saved replay, shows me plainly what Studio is doing, lets me insert saved inputs and secrets without typing syntax, and tells me in plain words when a page needs login steps, so that I can author and prove a test without commands, selectors, DOM uploads or accounts.

## Acceptance Criteria

No guided frontend exists today (`grep -rn guided-sessions frontend/src` → 0; no `frontend/src/components/studio/guided`, no `studioGuidedApi.ts` — UX review 2026-10-09; inventory CLN-16). This story is the first guided screen. Account/sign-in states, account selection and "Sign in securely" are withdrawn (consensus §8.1; design §0) and must not appear.

1. **AC-1 — One Run control, no hidden executions.** The existing `RunControl`/`useRunGate` remain the single primary Run: no usable saved plan starts a guided session (`POST /api/v3/studio/guided-sessions`); a usable plan starts the ordinary replay. Saving, learning completion and finalization never cause a second execution. At `FINALIZING` the client automatically invokes `POST /api/v3/studio/guided-sessions/{id}/finalize` (live `put_session` cookie, `Idempotency-Key`, closed body `{schemaVersion, expectedSourceRevision, expectedConfigurationRevision}` per the OBS-006 runbook) as a continuation of the original Run, with no further confirmation and no browser action; polling and reconnect retrieve the existing session state. A disconnected client, expired cookie, unavailable Core or rejected validation is shown as pending/not ready — never as published. Cancellation and reconnect do not double-submit. [consensus §§1, 4, 7, 9; OBS-006 runbook; UX review]

2. **AC-2 — Typed guided transport and MSW mirror.** A new `frontend/src/services/api/studioGuidedApi.ts` is typed against the seven `GuidedSessionController` routes documented in `openapi-v3.yaml` by OBS-007 (start, get session, get result, get clarification, post clarify, cancel, finalize), uses the central `apiClient`/transport wiring (no direct `fetch`), and is mirrored by `frontend/src/services/mocks/studio/guidedHandlers.ts` with fixtures for every state in AC-4/AC-5 (session-view3/result3 shapes, `LOGIN_REQUIRED` both variants, publication conflict, replay drift). Redux/hooks hold guided session state; types live in `frontend/src/types/studio/studioGuidedTypes.ts` and are derived from the v3 contracts, not invented. [consensus §§9–10; design §3 `openapi-v3.yaml` row; AGENTS.md centralized transport rule]

3. **AC-3 — No syntax on the happy path.** No capture tokens, selectors, manual runtime variables, DOM upload or technical confirmation appears on the happy path; optional saved inputs remain; the readable hidden-flow explanation (e.g. "Order number from step 2 → Reference in step 4") uses ordinary field/step names. [consensus §§1, 6]

4. **AC-4 — States and copy.** The guided surface renders, with MUI and the existing narratives where they exist: Preparing ("Preparing your steps"); Observing ("Understanding this page"); Acting ("Running step N" with live recording); Needs clarification (one focused, keyboard-operable choice built from safe labels/regions, resuming only the same valid session); Failed (existing `executionErrorNarratives`); Unknown outcome ("Stopped — submission outcome unknown", no Run-again affordance); Completed — learned from this run vs Completed — saved steps replayed; Publication conflict ("Run completed; steps not ready to repeat", evidence preserved); Replay drift (explain the affected step; "Learn again from step N" starts a deliberate guided run, never automatic repair). No state offers sign-in, account choice or point-to-element. [consensus §9 as amended §8.1; UX review 2026-10-09]

5. **AC-5 — Blocked by login (`LOGIN_REQUIRED`).** For `detail.loginStepsPresent === false`: "This page asks you to sign in. Add login steps before step N using your secrets (`<secret NAME>`), then Run again", with actions "Go to step N" (focuses the step editor row) and "Open Variables" (opens the saved inputs/secrets panel). For `true`: "Your login steps did not sign you in; check the secret and the steps before step N", same actions. Both narratives apply to the guided result code and to the legacy `errorCode LOGIN_REQUIRED` (`stepIndex`). The message is clarity, not correctness: the run is already failed. [design §5; GA plan §4.C C-5; UX review]

6. **AC-6 — Secret and variable references without hand-typed syntax.** (a) `STUDIO_CAPABILITIES.vaultSecrets` is no longer a build-time constant (`frontend/src/utils/config/studioCapabilities.ts:3`): the frontend reads a server-provided runtime capability that is `true` only when the backend's Vault provider is configured (not `DisabledStudioVaultProvider`); "Disabled means unavailable, never simulated" is preserved; the two readers (`ChecksStudioPage.tsx`, `UiTestConfig.tsx`) and the "alpha" copy follow the capability (GA C-1; VAL-001 ruling 2026-10-04). (b) A reference picker in the authoring surface inserts `<var NAME>` / `<secret NAME>` tokens from the test's declared names (names from `GET /tests/{id}/secrets`) with autocomplete on `<`; creating a secret reuses `SecretInput.tsx` (type=password, autoComplete=new-password) and the create response `{name, version, allowedOrigins}` only (GA C-7). (c) Secrets are never displayed back: `SecretInput` clears its value on success and failure (test), the MSW create handler never echoes the value, no component binds a secret value after submit (design I-B6, oracle C-7 UI half); the clarification view, result view and Code tab render show the ID and never the value (design I-C11, oracle C-12 UI half). Templates and onboarding (`quickStartTemplates.ts`, `OnboardingCoach.tsx`) no longer describe secrets as disabled when the capability is on. [GA plan §4.C C-1, C-7; design §4.6 I-B6, I-C11, §10 OBS-008 rows; UX review]

7. **AC-7 — Honest evidence.** "Completed — learned from this run" is shown from the learned-receipt, saved-replay success from replay-verified evidence; the two are never conflated. Exact step/action progress, playable recordings and producer/consumer seeking reuse `VideoEvidencePanel`/`useVideoSeek`. Source edits and finalization conflicts never display current readiness from historical green evidence: `PUBLISHED` describes history and `currentReadiness` is shown separately (session-view3/result3). Receipt reads after session/worker expiry use the public result route only. [consensus §9; OBS-006 runbook "Publication, reconnect and receipt access"]

8. **AC-8 — Accessibility and layout.** MUI components with `sx`; WCAG 2.1 AA: labelled controls, focus management on state change and on "Go to step N", a live region announcing state transitions including "Running step N of M", no color-only status, keyboard-operable clarification choice; responsive narrow layout; axe audit of each guided surface added to the existing `studioWcagAudit` suite with pinned baseline keys. [AGENTS.md; consensus §10; UX review; GA plan §4.I I-1]

9. **AC-9 — Tests.** Vitest + MSW component integration covers: first guided Run through finalize; later replay; implicit references; one focused clarification; blocked-by-login both variants with both actions; unknown outcome; publication conflict; replay drift; reference picker insert for `<var>` and `<secret>`; capability off/on; never-echo canaries (AC-6c); reconnect without double-submit; narrow layout. A Playwright browser flow (`frontend/playwright.config.ts` is created — `test:e2e` currently points at no config, GA plan §4.H H-2) drives author → Run → clarification → blocked-by-login against MSW. No-route-fixture proof is not claimed as live backend integration; that is OBS-009. [consensus §11 "UI evidence"; GA plan H-2]

## Tasks / Subtasks

- [ ] **T0 — Contract and ownership check (AC-2, AC-6a).** Confirm OBS-007's `openapi-v3.yaml` and v3 `session-view`/`result`/`error` schemas are Done; agree with @architect the shape and route of the server-provided `vaultSecrets` capability (pattern: the existing `GET /tests/{id}/schedule/capabilities` in `docs/specs/studio/openapi.yaml`); @dev co-executes that one backend route and its OpenAPI pin re-anchor (the only backend touch in this story). Record the ruling in Dev Agent Record.
- [ ] **T1 — Transport (AC-2).** `studioGuidedApi.ts`, `studioGuidedTypes.ts`, `guidedHandlers.ts` + fixtures, hook/slice state; contract test that every route in `openapi-v3.yaml` has a client method and an MSW handler.
- [ ] **T2 — One Run and finalize/poll/reconnect (AC-1, AC-7).** Extend `useRunGate`/`RunControl`/`runEnablement`; automatic finalize at `FINALIZING`; poll/reconnect; pending/not-ready rendering; learned vs replay labels; `currentReadiness` display; evidence panel reuse.
- [ ] **T3 — Guided surface (AC-3, AC-4, AC-5, AC-8).** `components/studio/guided/*`: status, clarification, login-required notice with "Go to step N"/"Open Variables", completion, conflict and drift views; live region, focus, keyboard, narrow layout.
- [ ] **T4 — References and secrets (AC-6).** Capability wiring and copy; reference picker with autocomplete; `SecretInput` reuse and clear-after-submit test; MSW never-echo; I-C11 UI canaries; templates/onboarding copy.
- [ ] **T5 — Tests (AC-9).** Vitest+MSW flows, a11y audit surfaces and baseline keys, Playwright config and browser flow; frontend type-check/lint/build.
- [ ] **T6 — Record and submit.** File List, Dev Agent Record (capability ruling, pinned baseline keys, counts), independent @qa; only QA can set Done.

## Dev Notes

### What exists and what does not (verified 2026-10-09)

- Run gate: `frontend/src/components/studio/run/{RunControl.tsx, useRunGate.ts, runEnablement.ts, ExecutionProgressView.tsx, executionErrorNarratives.ts, executionStatus.ts}`; page `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` (keeps its own `useState` `testSteps`; the Redux `studioSlice.testSteps` field is dead — inventory CLN-14 — do not build on it).
- Evidence: `frontend/src/components/studio/evidence/{VideoEvidencePanel.tsx, useVideoSeek.ts, seekEligibility.ts, videoEvidenceNarratives.ts}`.
- Secrets UI: `frontend/src/components/studio/SecretInput.tsx` (+ test); API `secretsApi` sends the create body with `redactBody` (`apiClient.ts:43-46`); backend exposes names (`GET`) and create (`POST`) only — no read-value route (design I-B6).
- Capability: `frontend/src/utils/config/studioCapabilities.ts` is `Object.freeze({ vaultSecrets: false })` read by `ChecksStudioPage.tsx:1280,1294` and `frontend/src/components/checks/wizard/configs/UiTestConfig.tsx:132,140`; Helm `values.yaml:133` records the Vault adapter as implemented-not-connected. No Vault capability route exists on the backend; the only capability route is `GET /tests/{id}/schedule/capabilities` (`docs/specs/studio/openapi.yaml:1857`) — use it as the pattern (AC-6a, T0).
- Guided backend routes (all under `/api/v3/studio/guided-sessions`): `POST /`, `GET /{id}`, `GET /{id}/result`, `GET /{id}/clarification`, `POST /{id}/clarify`, `POST /{id}/cancel` (`GuidedSessionController`), `POST /{id}/finalize` (`GuidedPublicationController`). Only finalize/result are documented today; OBS-007 AC-1 documents all seven in `openapi-v3.yaml` — this story codes against that file.
- Review/confirm UI (`components/studio/review/*`) is unmounted and slated for removal (inventory CLN-01/02; GA plan §3 item 2 "UX-001 superseded"); do not reuse it. `features/studio/authoring/**` is unmounted and protected (CLN-09); do not mount it.
- `frontend/package.json` `test:e2e` runs `playwright test` but no `playwright.config.*` exists (GA H-2).

### Contract facts the UI relies on (from OBS-006 and design R2)

- Finalize is the real BFF authority with fresh Core authorization; it performs zero browser/model actions; a newer publication, source/configuration edit or head ABA loses the CAS and the UI shows the conflict copy while keeping the run evidence (OBS-006 runbook; ADR-SC-004).
- Session-view3/result3 carry `revisionId` (UUID), `revisionDigest`, `PUBLISHED` (history) and `currentReadiness` (whether that receipt revision is still ready) separately; historical receipt reads need only current Core `canRead` (OBS-006 runbook).
- `LOGIN_REQUIRED` is a terminal failure with `detail:{stepId, loginStepsPresent}` on guided and `errorCode LOGIN_REQUIRED` with `stepIndex` on legacy (design §5; OBS-007 AC-17). Clarification never has reason `AUTH_REQUIRED` or promptCode `CONNECT_ACCOUNT` (design §3).
- Observed replay drift stops and offers deliberate relearning; it never self-heals (consensus §6; OBS-006 AC-5).
- Secrets are IDs in every UI-visible payload; clarification choices for configuration references are labelled "Saved input choice N" and authored excerpts contain at most the `<secret ID>` token (design I-C11).

### Copy source

State names and sentences come from consensus §9 (amended by §8.1), design §5 and the UX review 2026-10-09; do not invent additional states. Where a legacy narrative already exists (`executionErrorNarratives.ts`, `videoEvidenceNarratives.ts`), reuse it.

### Sequencing with neighbours

Depends on OBS-007 Done (contracts, codes, `openapi-v3.yaml`). `docs/specs/studio/openapi.yaml` is edited by OBS-007 first; the capability route re-anchors the pin again here (quote old/new). `frontend/src/test/a11y/studioWcagAudit.test.tsx` is touched here (new guided surfaces) and later by OBS-011 (rewrite of the dead compile-review/confirm surfaces, CLN-11) — strictly sequential, not parallel. `frontend/playwright.config.ts` and `frontend/e2e/` are created here and extended by OBS-009.

### Repository conventions

React 18 + TypeScript strict, MUI v7 with `sx`, React Router v7, Redux Toolkit, MSW for all API interactions, Vitest + React Testing Library, Playwright for browser flows; all HTTP through the centralized API client (CLAUDE.md "Development Rules"). ADR-SC-003 removed the English regex grammar — no client-side intent parsing. Never mark an unavailable backend or live provider as passed.

## Testing

Vitest + RTL + MSW under `frontend/src/**/*.test.tsx` (page tests in `pages/ChecksStudioPage/`, component tests beside components, MSW contract tests in `services/mocks/studio/`); a11y via the existing axe suite `frontend/src/test/a11y/studioWcagAudit.test.tsx` (regenerates `docs/qa/accessibility/axe-results.json` — known side effect); Playwright browser flow against the Vite dev server with MSW. Frontend gates: `npm run type-check`, `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e`. Test data: guided fixtures mirror the v3 schema examples (`contracts/v3/fixtures.json`, `publication-fixtures.json`) — derive, do not hand-write shapes.

## CodeRabbit Integration

### Story Type Analysis

Primary: Frontend/UX. Secondary: API client contract. Complexity: high — first guided screen, nine states, accessibility.

### Specialized Agents

@ux-design-expert owns execution; @dev provides the assigned technical gate and co-executes the single capability route; independent @qa owns the SDC verdict and Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push/deployment is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: at most three fix/re-review iterations with the configured 30-minute timeout. Focus: WCAG 2.1 AA, centralized transport, no secret value in any rendered or mocked payload, no hidden second execution, honest readiness. Repository config enables the WSL CodeRabbit wrapper with `graceful_degradation.skip_if_not_installed: true`; record an unavailable tool and use the configured independent review fallback. Never invent a CodeRabbit PASS.

## File List

Proposed ownership; root reconciles before dispatch.

- `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`
- `frontend/src/components/studio/run/RunControl.tsx`, `useRunGate.ts`, `runEnablement.ts`, `executionErrorNarratives.ts`, `index.ts`
- `frontend/src/components/studio/guided/GuidedRunStatus.tsx` (new), `GuidedClarification.tsx` (new), `LoginRequiredNotice.tsx` (new), `GuidedCompletion.tsx` (new), `guidedNarratives.ts` (new), `useGuidedSession.ts` (new), `index.ts` (new)
- `frontend/src/components/studio/references/ReferencePicker.tsx` (new), `referenceTokens.ts` (new), `index.ts` (new)
- `frontend/src/components/studio/SecretInput.tsx`, `SecretInput.test.tsx`
- `frontend/src/components/studio/evidence/VideoEvidencePanel.tsx`, `useVideoSeek.ts`, `videoEvidenceNarratives.ts`
- `frontend/src/components/studio/templates/quickStartTemplates.ts`, `frontend/src/components/studio/OnboardingCoach.tsx`
- `frontend/src/services/api/studioGuidedApi.ts` (new), `frontend/src/services/api/studioApi.ts` (capability read), `frontend/src/services/api/studioTransportWiring.ts`
- `frontend/src/services/mocks/studio/guidedHandlers.ts` (new), `guidedFixtures.ts` (new), `handlers.ts` (compose)
- `frontend/src/types/studio/studioGuidedTypes.ts` (new)
- `frontend/src/utils/config/studioCapabilities.ts`, `frontend/src/components/checks/wizard/configs/UiTestConfig.tsx`
- `frontend/src/store/slices/studioSlice.ts` (guided session state only)
- `frontend/src/test/a11y/studioWcagAudit.test.tsx`, `docs/qa/accessibility/axe-results.json`
- `frontend/src/pages/ChecksStudioPage/pageRunGate.test.tsx`, `pageSaveAndStop.test.tsx`, `pageEvidence.test.tsx`, `pageAuthoringUx.test.tsx`
- `frontend/src/components/studio/run/runGate.test.tsx`, `progress.test.tsx`
- `frontend/src/components/studio/guided/guided.test.tsx` (new), `loginRequired.test.tsx` (new), `clarification.test.tsx` (new)
- `frontend/src/components/studio/references/referencePicker.test.tsx` (new)
- `frontend/src/services/mocks/studio/guidedHandlers.test.ts` (new), `studioContract.test.ts`
- `frontend/playwright.config.ts` (new), `frontend/e2e/studio-guided.spec.ts` (new)
- Backend (co-executed by @dev, AC-6a only): `backend/src/main/java/com/citi/put/checks/studio/StudioController.java` or a new `studio/secrets/StudioSecretsCapabilityController.java`, `docs/specs/studio/openapi.yaml` (pin re-anchor), `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java`, `studio-runner/test/run/confinement.test.ts` (pin)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md`

Not owned here: `components/studio/review/**` (OBS-011 removal), `features/studio/authoring/**` (protected), all `studio-runner/**`, guided backend services.

## PO Validation (2026-10-09)

**Verdict:** GO — readiness 8/10 (confidence High). Status Draft → Ready. Report: `.ai/STUDIO-OBS-008-po-validation-r2.json`. Validator: Pax (@po), `validate-next-story.md` steps 0–12 plus the `story-lifecycle.md` 10-point checklist.

**Verified at `path:line` (2026-10-09):** `studioCapabilities.ts:3` (`vaultSecrets: false`), `ChecksStudioPage.tsx:1280,1294`, `UiTestConfig.tsx:132,140`, `docs/specs/studio/openapi.yaml:1857` (`/tests/{id}/schedule/capabilities`), `apiClient.ts:43-46` (`redactBody`), `helm-chart/put-checks/values.yaml:133`, `frontend/package.json` `test:e2e` with no `playwright.config.*`, `grep guided-sessions frontend/src` = 0, six `GuidedSessionController` routes plus `GuidedPublicationController` finalize, OBS-006 runbook line 31 (finalize body `{schemaVersion, expectedSourceRevision, expectedConfigurationRevision}`), `StudioSecretsController` GET/POST only, `DisabledStudioVaultProvider.java` exists. All 40 existing File List paths exist; new ones are marked. No invented state, route or library found.

**10-point checklist:** title ✓ · description ✓ · testable ACs ✓ (AC-9 enumerates the oracle per AC) · scope IN/OUT ✓ ("Not owned here") · dependencies ✓ (OBS-007 Done; sequenced before OBS-009/011 on `playwright.config.ts`, `studioWcagAudit.test.tsx`, `studioSlice.ts`, the `openapi.yaml` pin) · complexity ✓ (L) · business value ✓ · risks ◐ (implicit in Dev Notes; no Risks block) · Done criteria ✓ (T6; only @qa sets Done) · alignment ✓ (design §10 OBS-008 rows, GA C-1/C-5/C-7, consensus §9 as amended by §8.1). Executor `ux-design-expert` / gate `dev` valid and distinct.

**GO conditions (not scope changes):**
1. T0 records, before T4 starts, the @architect ruling on the `vaultSecrets` capability route: path, response shape, per-test vs global, and whether it lives in `StudioController` or a new `StudioSecretsCapabilityController`; the `openapi.yaml` pin re-anchor quotes old/new `BASE_SHA256` and op-count, after OBS-007's own re-anchor.
2. Implementation starts only after OBS-007 is Done (`contracts/v3/fixtures.json`, `openapi-v3.yaml` and the `LOGIN_REQUIRED` codes do not exist today).
3. Every state string in `guidedNarratives.ts` cites its source (consensus §9 as amended, design §5, or the 2026-10-09 UX review as summarized in this story); no state beyond AC-4's list.
4. AC-6c canaries assert that the secret *value* is absent from every rendered and mocked payload while the *ID* is present (design C-7 / C-12 UI halves).

**Should-fix during implementation:** name the Redux slice keys for guided session state in T1 so the `studioSlice.ts` edit stays "guided session state only" and does not collide with OBS-011's `testSteps` removal.

**Observations for the coordinator:** `wave-plan.json` (2026-10-08) still lists the pre-rescope File List for this story (e.g. `GuidedEvidence.tsx`) — regenerate before dispatch. GA plan C-1/C-5(UI)/C-7 are legacy-path P0/P1 items now carried by this GA+1 story; see the cross-story note in the validation report.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-09 | 0.2.0 | **Rescoped** after the 2026-10-09 decision: account/sign-in states dropped; added first-guided-UI scope (typed v3 transport + MSW, finalize/poll/reconnect), blocked-by-login message, server-provided `vaultSecrets` capability, reference picker, never-echo canaries, WCAG and Playwright config; 9 ACs; Status Draft | @sm (River) |
| 2026-10-09 | 0.2.1 | Validated GO (8/10) — Status: Draft → Ready | @po |
