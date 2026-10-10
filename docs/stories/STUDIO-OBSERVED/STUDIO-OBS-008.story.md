# Story STUDIO-OBS-008 — Single-path Studio UI: one Run that learns, repeats and re-learns

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-008 |
| Status | **Ready** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-012B, STUDIO-OBS-013, STUDIO-OBS-014, STUDIO-OBS-015 |
| Dependency notes | Frontend lane: follows OBS-012B with **no intermediate release** (OBS-012B leaves Run replay-only). Follows OBS-015 so "Learning from step k" renders against a real contract; needs OBS-013's guided video route/offsets and OBS-014's `labelSource`, `Idempotency-Key` and budget codes (ADR-SC-005 "Order and parallelism"). One backend touch (the `vaultSecrets` capability route) is co-executed by @dev. |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md (Consequences "Architecture (one path)"; placement map row OBS-008; defaults "Readiness vocabulary", "Public API") · UX panel 2026-10-09 (single-path UI state model and copy; Reuse/Adapt/New lists; WCAG 2.1 AA list) · docs/specs/studio-observed-authoring/secret-login-design.md R3 §5, §4.6 I-B6/I-C11, §10 row OBS-008 · docs/epics/UI-STUDIO-GA-PLAN.md §4.C C-1, C-5, C-7, §4.H H-2, §4.I I-1 · docs/runbooks/studio-guided-authoring.md "Publication, reconnect and receipt access" · docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md CLN-11 |
| Size | L — first and only guided screen; UX panel's split "a: transport/states/login · b: references/capability" is encoded as two lanes; "c: compile-UI removal + vocabulary" was taken by OBS-012B |

executor: "ux-design-expert"
quality_gate: "dev"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests, accessibility-audit]

## Story

As a nontechnical Studio author, I want one Run control that learns my plain-language steps on the first Run, repeats them in seconds afterwards, re-learns only from the step I changed, shows me plainly what Studio is doing with video of every Run, lets me insert saved inputs and secrets without typing syntax, and tells me in plain words when a page needs login steps, so that I can author and prove a test without commands, selectors or technical confirmations.

## Acceptance Criteria

No guided frontend exists (`grep -rn guided-sessions frontend/src` → 0, re-verified 2026-10-09). Compile UI and vocabulary are gone (OBS-012B). Every state and sentence below comes from the **UX panel 2026-10-09 single-path state model** or design R3 §5; no state beyond this list is added (PO condition from the 0.2.x validation, carried).

1. **AC-1 — Typed transport under `/api/v1/studio` and MSW mirror.** `frontend/src/services/api/studioGuidedApi.ts` is typed against the guided routes in the one public OpenAPI (OBS-012A/013/014/015: start, get session, get result, get clarification, post clarify, cancel, finalize, **video**), uses the central `apiClient`/transport wiring (no direct `fetch`), sends the mandatory `Idempotency-Key` on replay execute (OBS-014 AC-9) and on finalize; `frontend/src/services/mocks/studio/guidedHandlers.ts` + `guidedFixtures.ts` mirror every route with fixtures for every state in AC-3/AC-4/AC-6 derived from `contracts/v3/fixtures.json`/`publication-fixtures.json` (not hand-written); types in `frontend/src/types/studio/studioGuidedTypes.ts` derive from v3; a contract test asserts every guided route has a client method and an MSW handler. [ADR-SC-005 defaults "Public API"; UX panel "New (008)"; CLAUDE.md centralized transport rule]

2. **AC-2 — One Run, three modes, no hidden executions.** `RunControl`/`useRunGate`/`runEnablement` read readiness from `GET /tests/{id}` and the last result (never `compileStatus`): `UNLEARNED` ⇒ Run starts a guided learn session; `READY` ⇒ Run starts the ordinary replay (`POST /tests/{id}/execute`); `NEEDS_RELEARN{firstChangedStepId}` ⇒ Run starts a mixed-mode guided session with the server-computed `baseRevisionId`/`firstLearnStepId` (the client never lowers k); `LEARNING` ⇒ Run disabled with the live state shown. Saving, learning completion and finalization never cause a second execution; at `FINALIZING` the client automatically calls finalize as a continuation of the Run (live `put_session`, `Idempotency-Key`, closed body per the OBS-006 runbook) with no further confirmation and no browser action; polling and reconnect retrieve the existing session; a disconnected client, expired cookie, unavailable Core or rejected validation is shown as pending/not ready — never as published; cancellation and reconnect do not double-submit. [ADR-SC-005 Consequences "Architecture (one path)"; UX panel "Adapt: RunControl, useRunGate, runEnablement"; OBS-006 runbook]

3. **AC-3 — States and copy (UX panel 2026-10-09, verbatim).**
   - Never learned (empty state, already placed by OBS-012B): "Write your steps, then press Run. The first Run works through them on the live page and saves what it learned. Later Runs repeat it in seconds." [Run]
   - `ReadinessChip`: "Learned · ready to repeat" (`READY`); "Steps changed — next Run learns from step k" (`NEEDS_RELEARN`).
   - `PREPARING` "Preparing your steps." · `OBSERVING`/`PROPOSING` merged "Understanding this page — step N of M." · `ACTING` "Running step N of M." (the current step carries `aria-current="step"`) · `REPLAYING_PREFIX` "Repeating saved steps 1–(k-1)…" then "Learning from step k".
   - `AWAITING_CLARIFICATION`: "Step N says: '<step text>'. Which one did you mean?" — a radiogroup of safe labels where `labelSource === PAGE` labels are rendered as page-derived (untrusted styling + role/region shown), last option "None of these — I'll edit step N"; expiry warnings at 60 s and 20 s stating the consequence.
   - `FINALIZING` "Saving what this run learned…" (auto finalize) · `SUCCEEDED` learned "Completed — learned from this run." / replay "Completed — saved steps replayed." / partial "Completed — steps k–n learned again." (and, after prefix drift, "steps j… were re-learned because the page changed", OBS-015 AC-4).
   - `PUBLICATION_CONFLICT` "Run completed; steps not ready to repeat." (evidence preserved) · `LOGIN_REQUIRED` (AC-4) · `ASSERTION_FAILED` · `UNSUPPORTED_SURFACE` · `BUDGET_EXCEEDED` · `POLICY_DENIED` on a secret fill "Secrets can only be typed into a password box." · `UNKNOWN_OUTCOME` (no Run-again button) · `CANCELLED` · `EXPIRED` · replay drift "Step N no longer matches the page…" → action "Learn again from step N" (starts the OBS-015 mixed-mode session, never automatic repair).
   No state offers sign-in, account choice, point-to-element, selectors, capture tokens or DOM upload. Existing narratives (`executionErrorNarratives.ts`, `videoEvidenceNarratives.ts`) are reused where the state already exists. [UX panel 2026-10-09 state model; ADR-SC-005 D-D UX statement; design R3 §4.2 limit]

4. **AC-4 — Blocked by login (`LOGIN_REQUIRED`, both variants).** `detail.loginStepsPresent === false`: "This page asks you to sign in. Add login steps before step N using your secrets (`<secret NAME>`), then Run again" with actions **"Go to step N"** (focuses the step editor row) and **"Open Variables"** (opens the saved inputs/secrets dialog). `true`: "Your login steps did not sign you in; check the secret and the steps before step N", same actions. Both narratives apply to the guided result code and to the replay `errorCode LOGIN_REQUIRED` (OBS-007 AC-18). The message is clarity, not correctness: the run is already failed. [design R3 §5; GA plan §4.C C-5; UX panel]

5. **AC-5 — References and secrets without hand-typed syntax (UX lane b).** (a) `STUDIO_CAPABILITIES.vaultSecrets` (`frontend/src/utils/config/studioCapabilities.ts:3`, build-time `false`) is replaced by a **server-provided** runtime capability that is `true` only when the backend's Vault provider is configured (not `DisabledStudioVaultProvider`); "Disabled means unavailable, never simulated" is preserved; the two readers (`ChecksStudioPage.tsx`, `UiTestConfig.tsx`) and the "alpha" copy follow it (GA C-1; VAL-001 ruling 2026-10-04); the backend route is co-executed by @dev following the `GET /tests/{id}/schedule/capabilities` pattern and documented in the one OpenAPI (pins re-anchored, old/new quoted). (b) `components/studio/references/ReferencePicker.tsx` is an **insert menu** that inserts `<var NAME>`/`<secret NAME>` tokens from the test's declared names (`GET /tests/{id}/secrets` for names); autocomplete on `<` is post-GA (UX panel); creating a secret reuses `SecretInput.tsx` (type=password, autoComplete=new-password) and the create response `{name, version, allowedOrigins}` only (GA C-7). (c) Never echo: `SecretInput` clears its value on success and failure (test); the MSW create handler never echoes the value; no component binds a secret value after submit; the clarification view, result view and the plan explanation render the ID and never the value — canaries assert the value is absent and the ID present (design I-B6/I-C11, oracles C-7/C-12 UI halves). Templates and onboarding (`quickStartTemplates.ts`, `OnboardingCoach.tsx`) describe secrets as available when the capability is on. [GA plan §4.C C-1, C-7; design R3 §4.6 I-B6, I-C11, §10 row OBS-008; UX panel "New (008)"]

6. **AC-6 — Plan explanation and honest evidence.** A read-only "Steps as learned" explanation replaces the removed Code tab: per step, what Studio did (action kind, safe label, hidden-flow explanation such as "Order number from step 2 → Reference in step 4"), whether the step was learned in this run, reused from a previous revision (`reusedFrom`) or re-learned after drift (`relearnedFrom`), IDs never values. "Completed — learned from this run" comes from the learned receipt; replay success from replay-verified evidence; the two are never conflated; `PUBLISHED` (history) and `currentReadiness` are shown separately; receipt reads after session/worker expiry use the public result route only. [UX panel "plan explanation replacing the Code tab", "honest learned-vs-replayed evidence"; OBS-006 runbook; OBS-015 AC-2]

7. **AC-7 — Video for the first Run and replays, with seek.** `VideoEvidencePanel`/`useVideoSeek`/`seekEligibility` play the guided session video (`GET …/guided-sessions/{id}/video`, OBS-013) and the replay video; per-step and **per-action seek buttons** are named ("Seek to step N", "Seek to action: <safe label>") and driven by OBS-013's offsets; unavailable/expired video shows the existing unavailable narrative, never a fake player. [UX panel "first-run and replay video with seek", "per-action seek buttons named"; OBS-013 AC-2/AC-3]

8. **AC-8 — Accessibility (WCAG 2.1 AA, UX panel list).** MUI with `sx`; one polite live region announces state changes and step starts (assertive for terminal states); clarification receives focus on entry and the radiogroup is fully keyboard-operable; the expiry consequence is stated in text; `aria-current="step"` on the running step; seek buttons named; `studioWcagAudit.test.tsx` surfaces 4/5 (inventory CLN-11) are rewritten to real guided states (e.g. Run-in-flight, clarification, completion) with pinned baseline keys regenerated, and the contrast and target-size axe rules are **enabled**; `prefers-reduced-motion` disables progress animation; responsive narrow layout. [UX panel WCAG list; GA plan §4.I I-1; inventory CLN-11]

9. **AC-9 — Tests and first E2E.** Vitest + MSW component integration covers: first guided Run through auto-finalize; later replay; `NEEDS_RELEARN` mixed-mode start with prefix then learning copy; one focused clarification incl. an untrusted page-derived label; blocked-by-login both variants with both actions; unknown outcome (no Run-again); publication conflict; replay drift → Learn again from step N; `POLICY_DENIED` secret copy; `BUDGET_EXCEEDED`; reference insert for `<var>` and `<secret>`; capability off/on; never-echo canaries; reconnect without double-submit; narrow layout. `frontend/playwright.config.ts` is created (none exists; `test:e2e` points at nothing, GA H-2) and `frontend/e2e/studio-guided.spec.ts` drives author → Run → clarification → login-required against MSW. MSW proof is not claimed as live integration (OBS-009). [UX panel "Playwright config + first E2E"; GA plan §4.H H-2]

## Tasks / Subtasks

- [ ] **T0 — Contract and ownership check.** Confirm OBS-012B/013/014/015 Done; read the one public OpenAPI; @architect rules the `vaultSecrets` capability route (path, shape, per-test vs global); @dev co-executes it; record the ruling.
- [ ] **T1 — Lane a: transport and Run (AC-1, AC-2).** `studioGuidedApi.ts`, types, MSW handlers/fixtures, `useGuidedSession`, slice keys named; three Run modes; auto-finalize/poll/reconnect; `Idempotency-Key`.
- [ ] **T2 — Lane a: states, login, explanation, video (AC-3, AC-4, AC-6, AC-7).** `components/studio/guided/{GuidedRunStatus, GuidedClarification, LoginRequiredNotice, GuidedCompletion, ReadinessChip, guidedNarratives}`; plan explanation; video/seek wiring.
- [ ] **T3 — Lane b: references and capability (AC-5).** Capability route consumption; `ReferencePicker`; `SecretInput` reuse; never-echo canaries; templates/onboarding copy.
- [ ] **T4 — A11y and tests (AC-8, AC-9).** Live region, focus, keyboard, reduced motion; CLN-11 surfaces rewritten with axe rules enabled; Vitest flows; Playwright config + E2E; type-check/lint/build.
- [ ] **T5 — Record and submit.** File List, Dev Agent Record (capability ruling, baseline keys, counts); independent @qa; only QA can set Done.

## Dev Notes

### What exists (verified 2026-10-09) and what OBS-012B leaves

Run gate `components/studio/run/{RunControl, useRunGate, runEnablement, ExecutionProgressView, executionErrorNarratives, executionStatus}` (re-pointed by OBS-012B to readiness, replay-only until this story); evidence `components/studio/evidence/{VideoEvidencePanel, useVideoSeek, seekEligibility, videoEvidenceNarratives}`; `SecretInput.tsx`; `studioCapabilities.ts` (`vaultSecrets: false`); runs `RunDetailsDrawer`/`RunRow`/`RunStatusChip`; `list/StudioListLayout.tsx`; `scheduling/StudioScheduleDialog.tsx`/`schedulePresentation.ts`; `tests/testListPresentation.ts`; `OnboardingCoach.tsx`; `templates/quickStartTemplates.ts`; `pages/ChecksStudioPage/ChecksStudioPage.tsx` (keeps its own `useState` `testSteps`). Removed by OBS-012B: `review/**`, `CodeTab`, inference, authoring feature, compile clients/MSW. The only capability route pattern is `GET /tests/{id}/schedule/capabilities`.

### Contract facts the UI relies on

Readiness `UNLEARNED | LEARNING | READY | NEEDS_RELEARN{firstChangedStepId}`, `409 LEARN_REQUIRED` (OBS-012A/015); guided routes under `/api/v1/studio/guided-sessions` incl. `video` (OBS-012A/013); session states incl. `REPLAYING_PREFIX`; result3/session-view3 with evidence references, `relearnedFrom`, `PUBLISHED` vs `currentReadiness` (OBS-013/015, OBS-006 runbook); clarification choices with `labelSource`/`role`/`region` (OBS-014); `LOGIN_REQUIRED{stepId, loginStepsPresent}` on guided and replay (OBS-007); `BUDGET_EXCEEDED`, `POLICY_DENIED` reasons `PASSWORD_TARGET_*` (OBS-007/014); mandatory `Idempotency-Key` on execute (OBS-014). Finalize is the real BFF authority with fresh Core authorization and zero browser actions (OBS-006).

### Copy source and sequencing

State names and sentences come from the UX panel 2026-10-09 (as transcribed in AC-3/AC-4) and design R3 §5; `guidedNarratives.ts` cites the source per string. `studioWcagAudit.test.tsx` was touched by OBS-012B (comment) and is rewritten here; `frontend/playwright.config.ts`/`frontend/e2e/` are created here and extended by OBS-009. The `openapi.yaml` pin is re-anchored here for the capability route, after OBS-013/014/015's re-anchors.

### Repository conventions

React 18 + TypeScript strict, MUI v7 with `sx`, React Router v7, Redux Toolkit, MSW for all API interactions, Vitest + RTL, Playwright; all HTTP through the centralized API client (CLAUDE.md). ADR-SC-003 removed the English regex grammar — no client-side intent parsing. Never mark an unavailable backend or live provider as passed.

### Out of scope here

Live backend integration and real-browser E2E on the deployed stack (OBS-009). Schedule dialog UX (GA plan E-4, SCHED-003). Editor environment list / list landing (GA plan I-2/I-3). Reference autocomplete on `<` (post-GA, UX panel).

### PO validation — 2026-10-09 (0.2.x dual-path draft) — SUPERSEDED by the ADR-SC-005 re-cut; historical

> Verdict then: **GO 8/10 — Draft → Ready**, report `.ai/STUDIO-OBS-008-po-validation-r2.json`. Its GO conditions carry forward as recommendations: (1) the capability-route ruling recorded at T0 with pin old/new quoted; (2) implementation only after the upstream contracts exist; (3) every string in `guidedNarratives.ts` cites its source and no state beyond the list; (4) never-echo canaries assert value absent / ID present. Should-fix carried: name the Redux slice keys in T1.

## Testing

Vitest + RTL + MSW under `frontend/src/**/*.test.tsx`; MSW contract test against the one public OpenAPI; a11y via `frontend/src/test/a11y/studioWcagAudit.test.tsx` with contrast/target-size enabled (regenerates `docs/qa/accessibility/axe-results.json` — known side effect); Playwright against the Vite dev server with MSW. Gates: `npm run type-check`, `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e`. Fixtures derive from v3 schema examples.

## CodeRabbit Integration

### Story Type Analysis

Primary: Frontend/UX. Secondary: API client contract. Complexity: high — the only Studio authoring screen, ~20 states, accessibility.

### Specialized Agents

@ux-design-expert owns execution; @dev provides the technical gate and co-executes the capability route; independent @qa owns the SDC verdict and Done transition.

### Quality Gates

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: three iterations, 30 minutes. Focus: WCAG 2.1 AA, centralized transport, no secret value in any rendered or mocked payload, no hidden second execution, honest readiness/evidence, copy fidelity to the UX panel. Record an unavailable CodeRabbit tool and use the configured independent review fallback.

## File List

Proposed ownership; root reconciles before dispatch. `(new)` = created.

- `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`
- `frontend/src/components/studio/run/RunControl.tsx`, `useRunGate.ts`, `runEnablement.ts`, `ExecutionProgressView.tsx`, `executionErrorNarratives.ts`, `index.ts`
- `frontend/src/components/studio/guided/GuidedRunStatus.tsx`, `GuidedClarification.tsx`, `LoginRequiredNotice.tsx`, `GuidedCompletion.tsx`, `ReadinessChip.tsx`, `PlanExplanation.tsx`, `guidedNarratives.ts`, `useGuidedSession.ts`, `index.ts` (all new)
- `frontend/src/components/studio/references/ReferencePicker.tsx`, `referenceTokens.ts`, `index.ts` (new)
- `frontend/src/components/studio/SecretInput.tsx`, `SecretInput.test.tsx`
- `frontend/src/components/studio/evidence/VideoEvidencePanel.tsx`, `useVideoSeek.ts`, `seekEligibility.ts`, `videoEvidenceNarratives.ts`, `studioVideoUrl.ts`
- `frontend/src/components/studio/runs/RunDetailsDrawer.tsx`, `RunRow.tsx`, `RunStatusChip.tsx`, `runPresentation.ts`
- `frontend/src/components/studio/tests/testListPresentation.ts`, `frontend/src/components/studio/scheduling/schedulePresentation.ts`, `frontend/src/components/studio/templates/quickStartTemplates.ts`, `frontend/src/components/studio/OnboardingCoach.tsx`
- `frontend/src/services/api/studioGuidedApi.ts` (new), `studioApi.ts` (capability read; `Idempotency-Key`), `studioTransportWiring.ts`
- `frontend/src/services/mocks/studio/guidedHandlers.ts`, `guidedFixtures.ts` (new), `handlers.ts` (compose), `studioContract.test.ts`
- `frontend/src/types/studio/studioGuidedTypes.ts` (new), `studioTypes.ts`
- `frontend/src/utils/config/studioCapabilities.ts`, `frontend/src/components/checks/wizard/configs/UiTestConfig.tsx`
- `frontend/src/store/slices/studioSlice.ts` (guided session state only; keys named in T1)
- `frontend/src/test/a11y/studioWcagAudit.test.tsx` (surfaces 4/5 rewritten; rules enabled), `docs/qa/accessibility/axe-results.json`
- `frontend/src/pages/ChecksStudioPage/*.test.tsx`, `frontend/src/components/studio/run/*.test.tsx`, `frontend/src/components/studio/guided/{guided,loginRequired,clarification,planExplanation}.test.tsx` (new), `frontend/src/components/studio/references/referencePicker.test.tsx` (new), `frontend/src/services/mocks/studio/guidedHandlers.test.ts` (new)
- `frontend/playwright.config.ts` (new), `frontend/e2e/studio-guided.spec.ts` (new), `frontend/package.json` (`test:e2e` target)
- Backend (co-executed by @dev, AC-5a only): `backend/src/main/java/com/citi/put/checks/studio/StudioController.java` or `studio/secrets/StudioSecretsCapabilityController.java` (new), `docs/specs/studio/openapi.yaml` (pin re-anchor), `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java`, `studio-runner/test/run/confinement.test.ts` (pin)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md`

Not owned here: everything under `studio-runner/src/**` and guided backend services (OBS-013/014/015), chart/E2E on the deployed stack (OBS-009), `utils/retireLegacyStudioWorker.ts` (OBS-011).

## PO Validation (2026-10-10) — single path (0.3.x)

**Verdict: GO (8/10) — Status: Draft → Ready.** Report `.ai/STUDIO-OBS-008-po-validation-sp.json`. Validated by Pax (@po) against ADR-SC-005 (Consequences "Architecture (one path)", defaults "Readiness vocabulary"/"Public API", D-D UX statement, placement map row OBS-008). The 0.2.1 verdict stays superseded history.

**Single-path checks:** no compile state or vocabulary remains (the story names none; `compile` appears only as "removed by OBS-012B"); three Run modes read readiness, never `compileStatus`; `REPLAYING_PREFIX` → "Repeating saved steps 1–(k-1)…" then "Learning from step k" (AC-3); WCAG 2.1 AA ACs with named rules (AC-8); `vaultSecrets` becomes a server-provided runtime capability (AC-5a, GA C-1); untrusted `labelSource === PAGE` rendering (AC-3); no sign-in/account/selector state (AC-3 closing rule). Executor `ux-design-expert` / gate `dev` matches the Design/UI row.

**10-point checklist:** 1–10 PASS.

**Anchors spot-checked at HEAD (working tree 2026-10-10):** `grep -rn guided-sessions frontend/src` → 0; `utils/config/studioCapabilities.ts:3` `vaultSecrets: false`; the only readers are `ChecksStudioPage.tsx` and `UiTestConfig.tsx`; `StudioScheduleController.java:32` and `openapi.yaml:1857` `/tests/{id}/schedule/capabilities` (the pattern AC-5a follows); `openapi.yaml:883` `/tests/{id}/secrets`; `secrets/DisabledStudioVaultProvider.java` exists; `SecretInput.tsx`, `evidence/{VideoEvidencePanel,useVideoSeek,seekEligibility,videoEvidenceNarratives}`, `run/{RunControl,useRunGate,runEnablement,executionErrorNarratives}`, `studioTransportWiring.ts`, `OnboardingCoach.tsx`, `quickStartTemplates.ts`, `test/a11y/studioWcagAudit.test.tsx` exist; `frontend/playwright.config.ts` absent while `package.json:18` `"test:e2e": "playwright test"` (GA H-2 holds); `components/studio/references/` absent (new); inventory CLN-11 `:59`; GA plan C-1 `:91`, C-5 `:95`, C-7 `:97`.

**Anti-hallucination finding:** the "UX panel 2026-10-09 single-path state model" is not a repository artifact — `REPLAYING_PREFIX` and the copy appear only in ADR-SC-005, design R3, the wave README and the stories; the ADR says the full model was "handed to @sm". AC-3/AC-4 are therefore verifiable only against this story.

**Should-fix (non-blocking):**
1. Persist the UX panel state model and copy as a dated document under `docs/specs/studio-observed-authoring/` (or declare AC-3/AC-4 the canonical list in the Dev Agent Record at T0) so `guidedNarratives.ts` cites a file, not a meeting.
2. Record the `vaultSecrets` capability-route ruling (path, shape, per-test vs global) at T0 with both pins quoted old/new (carried).
3. Name the Redux slice keys in T1 (carried).

**GO conditions:** implementation starts only after OBS-012B/013/014/015 are Done (every contract the UI binds is real); no state beyond the AC-3/AC-4 list; every string in `guidedNarratives.ts` cites its source; never-echo canaries assert value absent / ID present; MSW proof is not claimed as live integration; only independent @qa sets Done.

## Dev Agent Record

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-08 | 0.1.0 | Draft derived from approved observed-authoring consensus plan for SDC intake | SM preparation |
| 2026-10-09 | 0.2.0 | **Rescoped** after the 2026-10-09 decision: account/sign-in states dropped; first-guided-UI scope, blocked-by-login message, server-provided `vaultSecrets` capability, reference picker, never-echo canaries, WCAG and Playwright config; 9 ACs; Status Draft | @sm (River) |
| 2026-10-09 | 0.2.1 | Validated GO (8/10) — Status: Draft → Ready (dual-path draft). Report `.ai/STUDIO-OBS-008-po-validation-r2.json` | @po |
| 2026-10-09 | 0.3.0 | **Re-cut to the single path (ADR-SC-005).** Routes under `/api/v1/studio`; three Run modes incl. `NEEDS_RELEARN` mixed-mode (D-D); full UX panel 2026-10-09 state model and copy adopted verbatim (incl. `REPLAYING_PREFIX`, `BUDGET_EXCEEDED`, `POLICY_DENIED` secret copy, untrusted page-derived labels, expiry warnings); plan explanation replaces the Code tab; first-Run and replay video with per-action seek (OBS-013); `Idempotency-Key` (OBS-014); CLN-11 a11y surfaces rewritten with contrast/target-size rules enabled; compile-UI removal moved to OBS-012B; dependencies now 012B/013/014/015. Prior PO GO (0.2.1) marked superseded and kept as history. Status **Ready → Draft**, pending @po re-validation | @sm (River) |
| 2026-10-10 | 0.3.1 | Validated GO (8/10) — Status: Draft → Ready (single-path draft). Report `.ai/STUDIO-OBS-008-po-validation-sp.json` | @po |
