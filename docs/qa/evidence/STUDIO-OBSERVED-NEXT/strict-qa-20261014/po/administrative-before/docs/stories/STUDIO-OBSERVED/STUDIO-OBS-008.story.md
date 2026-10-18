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

**Inherited obligation (not a new AC; AC-1…AC-9 unchanged): v2 authoring writes with stable step IDs. Inherited from STUDIO-OBS-015 T0, @architect ruling 1, `consumerItemForOBS008` in [`docs/qa/evidence/STUDIO-OBS-015/t0-architect-rulings.json`](../../qa/evidence/STUDIO-OBS-015/t0-architect-rulings.json), 2026-10-13. Placed by @po (Pax); record `docs/qa/evidence/STUDIO-OBS-015/po-t0-followups.json`.** OBS-015 deletes the v1 authoring generation in the backend. After that, a body without `authoringSchemaVersion` gets `400 INVALID_AUTHORING` and writes nothing. **Why here:** the production frontend creates and saves only v1 drafts. @architect verified this by code reading: `components/studio/tests/CreateTestDialog.tsx:80-89` posts a `TestRequest` with `steps: []` and no `authoringSchemaVersion`, and `pages/ChecksStudioPage/ChecksStudioPage.tsx:586-604` saves string steps. Guided start already refuses those drafts with `409 RUNTIME_INCOMPATIBLE`. That consequence is @architect's inference, not executed against a real backend, and MSW masks it. Without this obligation no FE-authored test can be learned, and OBS-015 AC-1 cannot compute k. This story owns `frontend/src`, and OBS-015 does not edit it. The item list in the rulings file is authoritative; summary:
   a. **Write v2 with stable step IDs.** `CreateTestDialog.tsx` and `ChecksStudioPage.tsx` write the v2 body (`authoringSchemaVersion: 2`, `globalContext`, `steps: AuthoringStep[]`). They **preserve** each step's ID across edit and reorder, mint a new ID on insert and copy, and drop it on delete, per the OpenAPI intro rules. If the editor re-mints IDs on save, OBS-015 AC-1 computes k = 1 on every edit and incremental re-learn never happens. A test asserts that IDs survive edit and reorder and that insert and copy get new IDs.
   b. **One transport signature.** `services/api/studioAuthoringTransport.ts` drops the v1 overloads (`getTest` without options → `TestDto`, `createTest`/`updateTest(TestRequest)`), leaving one v2 signature each. `types/studio/legacyStudioAuthoringAdapter.ts` and its test are deleted, as are the legacy cases in `studioContextContract.test.ts` and `studioAuthoringTransport.test.ts`.
   c. **Readers of `GET /tests/{id}` steps as strings** move to the v2 response: `useRunGate.ts`, `StudioScheduleDialog.tsx`, `ChecksStudioPage.tsx`, `CreateCheckPage.tsx`. Line anchors are in the rulings file.
   d. **MSW mirrors the backend.** `services/mocks/studio/authoringHandlers.ts` and `authoringState.ts` drop `AUTHORING_V2_REQUIRED` and `LEGACY_AUTHORING` and refuse a v1 body with `400 INVALID_AUTHORING`.
   e. **Shared fixtures.** The `legacy-empty-context` case (`docs/specs/studio/examples/context-authoring-valid.json`) and the mixed-legacy case in `context-authoring-invalid.json` are deleted through the one C-int lane in the same unit as b. This story does not hand-edit contract files.
   f. **Gates.** The frontend hits of the OBS-015 M12 legacy grep (`frontend/src`) are this story's to clear, and @dev records the re-run. This obligation must close before OBS-010 release readiness (ruling1 `releaseGate`); an open item is reported as open, never passed by omission. **Deploy constraint:** do not run or demo a post-OBS-015 backend with a pre-obligation frontend against a real backend.

**Inherited obligation (not a new AC; AC-1…AC-9 unchanged): author copy for governed refusals and the side-effect confirmation. Inherited from STUDIO-OBS-014. Sources: @architect ruling AR-SEC001-FM option B, `falsePositiveCost`, in `docs/qa/evidence/STUDIO-OBS-014/ar-sec001-form-membership.json`, and AR-2 `AR-2.a_closedCodes.frontendCoupling` ("OBS-008 add narratives … for terminal POLICY_DENIED") in `docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-2-3-obs014.json`. Placed by @po (Pax) on 2026-10-14; record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-sec001-ruling-b-ack.json`.** **Why here:** ruling B makes the side-effect stance fail-closed (OBS-014 AC-6 clarification). Under `DENY`, a session now also ends `FAILED` with `errorCode: POLICY_DENIED` on a formless button click, a button in an unlabelled form, a click-toggle of a checkbox or radio, a label or heading click, or an Enter press. Under the default `CLARIFY_FIRST`, the one confirmation per session now also fires on those actions, so it is on the common authoring path. Today this story has no narrative for either case. @po verified the following by code reading. AC-3's only `POLICY_DENIED` copy is the secret-fill copy. `frontend/src` has 0 hits for `POLICY_DENIED`. A POLICY_DENIED without a governed reason (the password-control refusal) ends the session `INVALID_CONTRACT`, so at the session level `POLICY_DENIED` now means a governed refusal (`GuidedTranslationService.stopRejected`). The governed reason (`UNGROUNDED_TARGET`, `DESTRUCTIVE_VERB`, `SIDE_EFFECT_DENIED`) is never in a public schema (`GuidedPolicyReason` Javadoc).
   a. **Terminal governed `POLICY_DENIED`.** A guided result or session with `errorCode: POLICY_DENIED` gets its own narrative in `guidedNarratives`. It does **not** reuse "Secrets can only be typed into a password box." Because the reason is not public, the copy does not claim a specific cause. It may point to the two escapes the ruling names: check/uncheck wording for toggles, and the CSI owner's side-effect setting. No API field is added by this obligation. If UX needs the reason shown, that is a contract change for @architect and is not placed here.
   b. **Side-effect confirmation.** Render the v3 clarification with `reason: SIDE_EFFECT_CONFIRMATION` and `promptCode: CONFIRM_ACTION`. It has one choice, with `labelSource: AUTHORED` (the authored step text). Render it as a confirmation before an action, not with the AC-3 disambiguation copy "Which one did you mean?". Choices and responses follow the v3 clarification contract as landed. This obligation adds nothing to that contract.
   c. **Copy owner:** @ux-design-expert writes the text for a and b, under the AC-3 conventions. @po does not set the wording here.
   d. **Tests (AC-9 set):** Vitest + MSW cover a governed `POLICY_DENIED` result, showing the a narrative and not the secret copy, and one `SIDE_EFFECT_CONFIRMATION` question confirmed through to continuation. MSW payloads come from the landed v3 contracts and fixtures. Contract files are not hand-edited.
   e. **Not placed by this record:** AR-2's `POLICY_NOT_APPROVED` start-refusal narrative, the other half of the same `frontendCoupling` line. It is flagged to the lead in the record. This block does not add it.

## Tasks / Subtasks

- [ ] **T0 — Contract and ownership check.** Confirm OBS-012B/013/014/015 Done; read the one public OpenAPI; @architect rules the `vaultSecrets` capability route (path, shape, per-test vs global); @dev co-executes it; record the ruling.
- [ ] **T1 — Lane a: transport and Run (AC-1, AC-2).** `studioGuidedApi.ts`, types, MSW handlers/fixtures, `useGuidedSession`, slice keys named; three Run modes; auto-finalize/poll/reconnect; `Idempotency-Key`.
  - [ ] Inherited obligation (OBS-015 ruling 1): v2 authoring writes with stable step IDs in `CreateTestDialog`/`ChecksStudioPage`; one v2 transport signature; v1 adapter and legacy test cases deleted; string-step readers moved; MSW refuses v1 with `400 INVALID_AUTHORING`; shared legacy fixture cases deleted via C-int; M12 `frontend/src` hits re-run and recorded (items a–f).
- [ ] **T2 — Lane a: states, login, explanation, video (AC-3, AC-4, AC-6, AC-7).** `components/studio/guided/{GuidedRunStatus, GuidedClarification, LoginRequiredNotice, GuidedCompletion, ReadinessChip, guidedNarratives}`; plan explanation; video/seek wiring.
  - [ ] Inherited obligation (OBS-014 AR-SEC001-FM): governed `POLICY_DENIED` narrative distinct from the secret-fill copy; `SIDE_EFFECT_CONFIRMATION`/`CONFIRM_ACTION` rendered as a confirmation; copy by @ux-design-expert; AC-9 tests.
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

### Re-point obligation — OBS-012B handler-coverage allowlist (PO ruling 2026-10-13)

> Record: `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ruling-012B-allowlist.json`. This adds an execution obligation only; no AC text or meaning changes.

OBS-012B's AC-3 asserts in `frontend/src/services/mocks/studio/studioContract.test.ts` that every public operation (no `x-internal`) has an MSW handler or a PO-ruled allowlist entry. An entry whose operation has gained a handler **fails as stale**. OBS-012B leaves these **class A** entries owned by this story:

| Operation (`operationId`) | Route under `/api/v1/studio` | Owning AC here | Remove the entry at |
|---|---|---|---|
| `startGuidedSession` | `POST /guided-sessions` | AC-1 (start), AC-2 | T1, same change as `guidedHandlers.ts` |
| `readGuidedSession` | `GET /guided-sessions/{id}` | AC-1 (get session) | T1 |
| `readGuidedResult` | `GET /guided-sessions/{id}/result` | AC-1 (get result), AC-6 | T1 |
| `readGuidedClarification` | `GET /guided-sessions/{id}/clarification` | AC-1 (get clarification) | T1 |
| `clarifyGuidedSession` | `POST /guided-sessions/{id}/clarify` | AC-1 (post clarify) | T1 |
| `cancelGuidedSession` | `POST /guided-sessions/{id}/cancel` | AC-1 (cancel) | T1 |
| `finalizeObservedPublication` | `POST /guided-sessions/{id}/finalize` | AC-1 (finalize), AC-2 | T1 |
| guided video (id as landed by OBS-013) | `GET /guided-sessions/{id}/video` | AC-1 (video), AC-7 | T1/T2 |
| `listTestSecrets` | `GET /tests/{id}/secrets` | AC-5(b), AC-9 | T3, same change as the secrets handlers |
| `createTestSecret` | `POST /tests/{id}/secrets` | AC-5(b)/(c) (create handler never echoes) | T3 |

The handlers this story adds satisfy AC-1's "contract test asserts every guided route has a client method and an MSW handler" by extending the same document-reading harness (ADR-002 §18.3), not by writing a second one. At T5 the Dev Agent Record shows **zero class-A entries remaining** and quotes the final allowlist.

Two other entries are not this story's, and it should not remove them for that reason: `streamExecution` (class B, mirrored by the 10.11b scripted transport) and any OBS-014 policy operations (class C, no AC here). The stale-entry check still removes an entry automatically if this story ever adds a handler for it. The `vaultSecrets` capability route of AC-5(a) is never allowlisted: it lands with its client and handler in the same change.

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
- Inherited obligation (OBS-015 ruling 1): `frontend/src/components/studio/tests/CreateTestDialog.tsx`, `frontend/src/services/api/studioAuthoringTransport.ts`, `studioAuthoringTransport.test.ts`, `frontend/src/types/studio/legacyStudioAuthoringAdapter.ts` (del), `legacyStudioAuthoringAdapter.test.ts` (del), `studioContextContract.test.ts`, `frontend/src/components/studio/scheduling/StudioScheduleDialog.tsx`, `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx`, `frontend/src/services/mocks/studio/authoringHandlers.ts`, `authoringState.ts`; via the C-int lane only: `docs/specs/studio/examples/context-authoring-valid.json`, `context-authoring-invalid.json`
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

## Carried review follow-ups — 2026-10-14

[placement-key: resumed-qa-20261014:STUDIO-OBS-008]

Pax places the accepted nonblocking concerns from the completed 012B/013/014 reviews here. These remain open work under the existing anchors below; this placement changes no AC text, task, lifecycle status or external gate. Source and acceptance limits: [`po-closure-placements.json`](../../qa/evidence/STUDIO-OBSERVED-NEXT/resume-20261014/po-closure-placements.json).

- **FE-WORKERS** (012B:TEST-001; T5; owner @dev frontend / CI owner): Retain --minWorkers=1 --maxWorkers=3 on this shared host. Verify default-worker behavior on the next dedicated frontend gate and attribute any reproducible timeout by file; no timeout increase or default-worker pass is implied. Open follow-up; no pass or waiver supplied by closure.
- **FE-A11Y** (012B:TEST-003, 012B:OBS-UX-2, 012B:OBS-UX-3, 012B:OBS-UX-EMPTY; AC-8/AC-9 and RunControl; owner @ux-design-expert + @dev frontend): Replace duplicate UNLEARNED WCAG surfaces 4/5 with distinct guided states and regenerated keys; check browser contrast/target size, keyboard/focus, busy-state accessible label-in-name, supplementary tooltip reachability and Add-a-step aria-describedby association. Existing jsdom audit is limited evidence. Open follow-up; no pass or waiver supplied by closure.
- **PLAYBACK-COST** (013:ARCH-001; Playback verification / T5; owner @architect + @dev playback): Obtain a dated ratification of controller-read authorization on every range request, identity-before-idempotent-echo and no-store-before-expired projection; measure repeated range-read locking/Core cost under playback load. Stronger present authorization is retained; this is not authorization to bypass it. Open follow-up; no pass or waiver supplied by closure.
- **PLAYBACK-COPY** (013:MNT-001; Playback error copy; owner @ux-design-expert + @dev playback): Refine shared unavailable/expired wording to neutral recording language for guided sessions while preserving response codes and statuses; coordinate the OBS-010 runbook. Open follow-up; no pass or waiver supplied by closure.
- **FE-CONSUMERS** (012B:class-A-allowlist, 014:Policy refusal/confirmation UX; T1/T2/T3/T5 existing obligations; owner @dev frontend + @ux-design-expert): Remove all ten class-A contract allowlist entries when guided/secrets handlers land; retain class B scripted SSE and class C first-policy-client ownership. Implement the already-placed governed refusal/confirmation wording and labelSource rendering. No intermediate shared deployment or release before OBS-008. Open follow-up; no pass or waiver supplied by closure.

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
| 2026-10-13 | 0.3.2 | Re-point obligation recorded (OBS-012B T0 PO ruling, T0 plan RK-6). This story removes its class-A entries from 012B's MSW handler-coverage allowlist when it adds handlers: 7 guided operations and guided video at T1/T2, 2 secrets operations at T3; zero class-A entries at T5. Class B (`streamExecution`) and class C (OBS-014 policy) entries are not this story's. No AC text or meaning changed; Status unchanged (Ready). Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ruling-012B-allowlist.json` | @po (Pax) |
| 2026-10-13 | 0.3.3 | Inherited obligation a–f added after AC-9: v2 authoring writes with stable step IDs. Source is the STUDIO-OBS-015 T0 @architect ruling 1, `consumerItemForOBS008`, in `docs/qa/evidence/STUDIO-OBS-015/t0-architect-rulings.json`. The production FE creates and saves only v1 drafts. Guided start refuses them, and OBS-015 then refuses v1 writes with `400 INVALID_AUTHORING`. So this story writes v2 and preserves step IDs on edit and reorder, with new IDs on insert and copy, and deletes the v1 transport overloads, the adapter, the legacy test cases and the MSW v1 codes. It moves the string-step readers, deletes the shared legacy fixture cases via C-int, and clears the M12 `frontend/src` hits. The obligation closes before OBS-010 release readiness. A deploy constraint was recorded. Added a matching T1 sub-item and File List entries. AC-1…AC-9 text and meaning are unchanged; Status unchanged (**Ready**). Record `docs/qa/evidence/STUDIO-OBS-015/po-t0-followups.json` | @po (Pax) |
| 2026-10-14 | 0.3.4 | Inherited obligation a–e added after the v2-authoring obligation: author copy for governed refusals and the side-effect confirmation. Sources are the STUDIO-OBS-014 @architect ruling AR-SEC001-FM option B (`docs/qa/evidence/STUDIO-OBS-014/ar-sec001-form-membership.json`) and AR-2 `a_closedCodes.frontendCoupling`. Ruling B makes the side-effect stance fail-closed. Under `DENY`, sessions now also end `POLICY_DENIED` on formless or unlabelled-form button clicks, click-toggles, label clicks and Enter. Under the default `CLARIFY_FIRST`, the one confirmation fires on those actions as well. This story had no narrative for either case: AC-3's only `POLICY_DENIED` copy is the secret-fill copy, and `frontend/src` has no `POLICY_DENIED` handling. (a) A governed `POLICY_DENIED` narrative that is not the secret copy and names no cause, because the reason is not public. (b) `SIDE_EFFECT_CONFIRMATION`/`CONFIRM_ACTION` is rendered as a confirmation. (c) Copy by @ux-design-expert. (d) AC-9 tests. (e) `POLICY_NOT_APPROVED` is not placed here. Added a T2 sub-item. No API field or contract change. AC-1…AC-9 text and meaning are unchanged; Status unchanged (**Ready**). Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-sec001-ruling-b-ack.json` | @po (Pax) |
| 2026-10-14 | 0.3.5 | Recorded owned resumed-QA follow-ups in the dated carried-review section; source `resume-20261014/po-closure-placements.json`. Existing AC/task text and meaning and Status Ready preserved; no follow-up or external approval marked complete. | @po (Pax) |
