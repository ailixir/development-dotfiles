# Story STUDIO-UNIFY-001.1 — Editor by route id, autorun once, Create Check UI Test, increment-1 removals

| Field | Value |
|---|---|
| Story ID | STUDIO-UNIFY-001.1 |
| Status | **Done** |
| Epic | STUDIO-UNIFY-001-ui-tests-as-checks — UI tests as checks (Flow 1, frontend-only), increment 1 of 4 |
| Depends on | none |
| Dependency notes | No story precedes this one. The plan is not yet approved for execution (`plan/implementation.yaml`: `status: pending`, `executionAuthorized: false`, `approvalRequiredBeforeExecution: true`), so the user approves the plan and @po validates this story (Draft → Ready) before @dev starts. Stories .2, .3 and .4 follow in strict order. |
| Source | [Spec](spec/spec.md) §1.3 (D1–D7), §1.4 (DC-01, 04, 05, 06, 09, 15, 18, 19, 20, 22, 23, 24), §5–§7, §11 row 1, §12, §14 row 1, §14.1; [Requirements](spec/requirements.json) (29 FR, 9 NFR, 10 CON, 30 AC, changelog 1–6); [Plan](plan/implementation.yaml) revision 4, phase-1 (subtasks 1.1–1.33); [Research](spec/research.json); [Critique 4](spec/critique-4.json) (APPROVED, 4.38) |
| Size | S–M (spec §14). 33 plan subtasks. |
| Drafted by | River (@sm), 2026-10-23, from the approved spec, requirements and plan |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["Vitest-RTL-MSW", "Playwright-MSW-project", "type-check", "lint", "WCAG-audit-regression-guard", "removed-route-scan-S1", "CodeRabbit-or-documented-manual-fallback"]

This is the first of four stories, one per increment of `STUDIO-UNIFY-001-ui-tests-as-checks`. Each story is QA-gated and passes its own gates. Each removes the old route, page or fallback that it replaces and repoints that thing's references in the same story (user decision D7). No code starts before the user approves the plan and @po moves this story to Ready.

## Story

**As a** Checks author,
**I want** to create a UI test from Create Check and land in a Studio editor served at `ui-tests/:id/studio` that always loads the test named in the URL and starts a run from `?autorun=1` at most once,
**so that** UI tests are created and authored the same way as regular checks, a link can never open or run a different test, and no old Studio create path, route or fallback survives.

## Context

UI tests become first-class rows in the Checks area (spec §1). This increment delivers the creation and authoring half. Studio's `ChecksStudioPage` stays the only authoring page with an unchanged two-panel layout (D2, CON-02). It moves to `ui-tests/:id/studio`, and it is always loaded by the URL's test id. Create Check gains a UI Test branch that replaces the Studio "Create Test" dialog. The old `studio` and `studio/:id` routes, the editor's `list[0]` fallback and the legacy UI_TEST picker are removed here, not later.

At the end of this increment the Tests page, the Runs page and the sidebar Studio group (Tests, Runs) still exist. Stories .2 and .3 remove them.

**Requirements covered (spec §14):** FR-01–FR-06; FR-07 (breadcrumb, CSI, leave guard); FR-08 (editor links, dialog, Dashboard and palette); FR-13 (editor); FR-24 (card, routes, entries); FR-25 (editor); FR-27 (inc 1); FR-28 (re-mount).

**Binding user decisions that apply (spec §1.3):**

| # | Decision |
|---|---|
| D1 | Flow 1 is frontend-only. The backend is unchanged. |
| D2 | `ChecksStudioPage` stays the authoring page (layout unchanged). |
| D4 | A new UI test defaults to environment Development. |
| D6 | One spec, four increments. Flow 2 (backend link) is out of scope, but must be able to land later with no change to routes or screens. |
| D7 | Verbatim: "UI studio is a new feature thats not even in dev yet, this is brand new, no old routes or data should be kept, just update the references if is the case." No old route, page or fallback survives across increments. Each is removed in the increment that replaces it, and its references are repointed in that same increment. |

Standing rules (spec §1.3): one path, with no back-compat routes or redirects; functional-only accessibility (ADR-SC-006); pnpm only; MUI with `sx`; all HTTP through the centralized API client.

## Scope

**In:** the editor route and load by id; autorun consumed once; the UAT option; Create Check → UI Test as the only create path; the availability hook and card gating; the UI test path helpers; the schedule dialog's run link passed in by its host; Dashboard and palette repointed and gated; the layout mapping; breadcrumb and read-only CSI; a route test per route tree; the re-mount of every editor test and WCAG surfaces 3–7 on a route id; the increment-1 removals with their test and E2E updates (spec §11 row 1, §12.4).

**Out (other stories or spec §16.1):** the detail page and the `ui-tests/:id` and `ui-tests/:id/runs*` routes (.2); removing the Runs page (.2) and the Tests page (.3); the All Checks merge (.3); the D5 docs (.4); any backend, API, schema or Flyway change; Flow 2; any `ChecksStudioPage` layout change; any accessibility work; fixing the silent guided-start 503/401 (DC-05); replacing the existing Test Now `fetch`; raising the CSI store's 20-CSI page.

## Acceptance Criteria

AC text is copied from [requirements.json](spec/requirements.json). Where the spec splits an AC across increments (§14), only this increment's part is stated, and the other increments' clauses are omitted. The bracketed tag after each id gives its source.

- **AC-01** *[FR-01; D4; DC-04, DC-15; spec §6, §7.4]* Given the UI_TEST source and the STUDIO feature are on, when the user opens Create Check and selects 'UI Test (Checks Studio)', then one step shows Name (required, rejects more than 255 characters), System/CSI (required, lists registered CSIs only), Environment preset to Development with exactly the options Development, Staging, UAT and Production, and an optional Description, with no tags field. Given a UAT test, when its editor opens, then the environment select shows UAT as one of its listed options. While UI Test is selected on the create page, the stepper, the Check Configuration, Scheduling and Review steps, Back/Next, Test Now and Create Check are absent, and 'Create and open Studio' is the only submit action.
- **AC-02** *[FR-02; DC-24; spec §6]* Given a valid UI test form, when the user clicks 'Create and open Studio', then exactly one POST /studio/tests is sent with authoringSchemaVersion 2, empty steps and variables and the default configuration; the Create Check stored draft is removed; the app is at ui-tests/{newId}/studio; and browser Back does not return to the filled create form.
- **AC-03** *[FR-02; DC-24; spec §6]* Given POST /studio/tests fails, when the user clicks 'Create and open Studio', then the error shows inline on the form and the route does not change.
- **AC-04 (increment 1 part: Create Check)** *[FR-03; DC-06, DC-18; spec §6, §14]* Given the URL create?type=UI_TEST, when the page opens, then the UI Test card is preselected, even when a stored create draft holds another type. *(The `all?type=UI_TEST` clauses and the stored-catalog-preferences sentence of AC-04 belong to STUDIO-UNIFY-001.3.)*
- **AC-05** *[FR-04; spec §6, §11]* Given Create Check, when any type is chosen, then no step offers picking an existing Studio test as a check configuration, the Review step has no UI-test-picker section, and the frontend check type model has no uiTest configuration field (type-check passes).
- **AC-06** *[FR-05, FR-06; DC-19; D7; spec §7.1]* Given a test that is not in the first page of GET /studio/tests, when the user opens ui-tests/{id}/studio directly, or the route changes to that id while the editor is mounted, then the editor reads GET /studio/tests/{id} and shows that test; a later list reload keeps it selected; no other test is ever shown in its place. Given the editor is mounted without a route id, then no test is selected or loaded for editing and no run is requested (the list[0] fallback is gone, D7).
- **AC-07** *[FR-25, FR-06; NFR-03; spec §7.1]* Given GET /studio/tests/{id} answers 403 STUDIO_FORBIDDEN, when the editor opens ui-tests/{id}/studio, then it shows 'This UI test doesn't exist or you don't have access' and loads no other test.
- **AC-08 (increment 1 part)** *[FR-07; spec §7.3, §14.1]* Given the editor is open on a test, then the breadcrumb reads 'All Checks › {name}' and its 'All Checks' item targets /checks/all; CSI cannot be edited; with unsaved edits the in-page back opens the existing leave dialog and beforeunload still warns. Until the later increments, the in-page back action and 'Open Tests' both target /checks/studio/tests (spec §7.3, §14.1). The in-page back moves to ui-tests/{id} in STUDIO-UNIFY-001.2, and 'Open Tests' moves to all?type=UI_TEST in STUDIO-UNIFY-001.3.
- **AC-09 (increment 1 part)** *[FR-08; DC-20, DC-23; spec §14.1]* Given the built frontend, when its source and the rendered nav, command palette, dashboard, schedule dialog and run links are inspected, then none target a removed studio route; the Dashboard 'Open Checks Studio' quick action and the command palette 'Studio' entry open /checks/studio/tests; at the increment 1 boundary no in-app link targets a route deleted so far; the schedule dialog's 'Inspect run' and 'View run' links opened from the editor resolve to an existing run route (the Runs page run); and on ui-tests paths the layout treats the page as part of the Checks area.
- **AC-23 (increment 1 part: card, editor and entries)** *[FR-24; DC-18, DC-23; spec §6, §7.1, §10]* Given the STUDIO feature is off, or the UI_TEST source is disabled, then the UI Test type card is dimmed and cannot be selected, and every ui-tests route (in this increment: ui-tests/{id}/studio) shows the feature-unavailable state. create?type=UI_TEST preselects nothing. The Dashboard 'Open Checks Studio' quick action and the command palette 'Studio' entry are absent. Given sources and features have not been fetched yet ('pending'), then no Studio request is sent and a UI_TEST type from the URL or stored draft is neither applied nor written. When sources then arrive with UI_TEST disabled, that type is dropped, never written, and no UI Test form or submit is shown. Given an empty sources list with the STUDIO feature on, UI tests behave as enabled. Given ui-tests/{id}/studio is opened while availability is 'pending', then the editor shows its existing 'Loading test…' text and sends no Studio request until availability is 'on'.
- **AC-26 (increment 1 part)** *[FR-27; D7; DC-22, DC-24; spec §11 row 1]* Given the end of increment 1, then studio and studio/{id} land on module home through the catch-all in both route trees, the editor has no list[0] fallback, navigationConfig and the Studio create dialog are gone, and every 'Create Test' action on the Tests and Runs pages opens /checks/create?type=UI_TEST. There is never a redirect to a ui-tests route.
- ~~**AC-27 (increment 1 part)**~~ **Removed by user decision 2026-10-23 ("We dont need WCAG, ignore/remove all accessibility tasks").** *[FR-28; CON-04; spec §12.5]* Given the Studio WCAG audit, when it runs at the end of increment 1, then it passes. After increment 1, surfaces 3-7 mount the editor on a route id. Any baseline move is regenerated, with its reason recorded in that increment ('mount changed to a route id' and/or 'editor framing', with 'no surface added'). If a change breaks the audit, the regression is fixed instead (accessibility-scope rule). No surface is added for the new pages.
- **AC-29** *[FR-13; NFR-05; DC-01; spec §7.2]* Given ui-tests/{id}/studio?autorun=1 for a READY test with steps, whose capabilities read answers canManage true, when the gate settles, then exactly one POST /studio/tests/{id}/execute is sent, the current history entry no longer carries autorun, and a reload of the page, or Back to that entry, sends no further execute. Given the same URL for an UNLEARNED test with steps, then exactly one guided start is sent. Given the same URL for a LEARNING test, for a test with no steps, or with a capabilities read that answers canManage false before the gate settles, then no execute and no guided start is sent at settle or later in that mount (after the learn ends, after 'Refresh test information', or on the first typed step), and the existing caption explains why. Given the capabilities read fails (permission stays unknown) and POST /execute answers 403, then exactly one execute is sent and the existing forbidden narrative is shown. Given GET /studio/tests/{id} fails, then no run is requested. Given the test read has not completed yet, then no run is requested before it does. Given the user edits a step, a variable or the environment, presses Run or Stop, or changes the route id before the gate settles, then the autorun request is dropped and nothing is sent when the reads later complete.
- **AC-30** *[FR-01; D4; DC-15; spec §6]* Given Create Check on the create route with a stored draft whose environment is Staging and whose type is HTTP, when the user selects the UI Test card (or opens create?type=UI_TEST), then the environment shows Development. When the user then picks UAT, UAT is kept. When the user then selects the HTTP card, the four-step stepper returns at Basic Information with name, description, CSI and UAT kept. Given a stored draft whose type is UI_TEST and whose environment is Staging, when the page restores it, then Staging is kept, and with create?type=UI_TEST as well, Staging is still kept. Given the user picked UAT on UI Test and switched to HTTP, when they re-select the UI Test card, then UAT is kept. Given edit/{id}, then the UI Test card cannot be selected.

### Traceability: AC to plan subtasks

| AC | Plan subtasks (from the plan's `coverage` lists) |
|---|---|
| AC-01 | 1.15, 1.29, 1.30 |
| AC-02 | 1.4, 1.29, 1.30 |
| AC-03 | 1.29, 1.30 |
| AC-04 | 1.29, 1.30 |
| AC-05 | 1.25, 1.26, 1.30 |
| AC-06 | 1.11, 1.21 |
| AC-07 | 1.11 |
| AC-08 | 1.15 |
| AC-09 | 1.14, 1.15, 1.22, 1.23, 1.24, 1.33 |
| AC-23 | 1.3, 1.15, 1.24, 1.28, 1.29, 1.30 |
| AC-26 | 1.16, 1.17, 1.18, 1.19, 1.20, 1.21, 1.22, 1.33 |
| AC-27 | 1.10, 1.33 |
| AC-29 | 1.12, 1.13 |
| AC-30 | 1.28, 1.29, 1.30 |

## Removals (D7, spec §11 row 1)

Everything in the left column goes in this story. Nothing is left for a later story to remove, and nothing gets a redirect.

| Removed | Task | Its references, repointed in this story |
|---|---|---|
| Routes `studio/:id` and bare `studio`, both route trees | 1.21 | Editor now at `ui-tests/:id/studio` behind the STUDIO gate. Both paths fall to the module-home catch-all (PC-07). |
| The editor's no-id `list[0]` fallback | 1.11 | Editor loads by route id only. A no-id mount loads nothing. |
| Legacy `UiTestConfig` picker, its barrel export, its test, its Create/Review branches, and the `uiTest` type field | 1.25, 1.26, 1.27 | `referencePicker.test.tsx` scan list drops the deleted file. |
| `testHref` (testListPresentation), `studioTestPath` and the dead `studioTestsPath` | 1.16, 1.18 | Tests-page rows, Runs-page test links and the drawer `testHref` use `uiTestEditorPath`. |
| `StudioScheduleDialog`'s pathname derivation (`pathname.indexOf('/studio')`) | 1.14 | The dialog takes `runHref(executionId)` from its host. Hosts pass the Runs-page run link in this story. |
| `navigationConfig.ts` (it targets `/checks/studio`, imported by nothing) | 1.22 | None needed. |
| LayoutProvider's broad `/checks/studio*` mapping (L70) | 1.22 | Two explicit prefixes (`/checks/studio/tests`, `/checks/studio/runs`) replace it, and `/checks/ui-tests` maps to the Checks area. |
| ChecksLayout's `/checks/studio` landing clause (L85); bare-`studio` page id in `navigationSetup` (L75) | 1.22, 1.23 | `ui-tests` paths map to the Checks area and sidebar item. |
| `CreateTestDialog` (no test file of its own) | 1.20 | Tests-page and Runs-page "Create Test" (header and empty state) go to `/checks/create?type=UI_TEST` (1.16, 1.18). |

## Link walk and route-scan gate (spec §14.1, plan linkWalkAtExit)

At the end of this story every in-app link target below must exist. Only routes that exist at this boundary are targets: `studio/tests` and `studio/runs/*` still exist, and `ui-tests/*` exists only for the editor path.

| Link source | Target after increment 1 |
|---|---|
| Editor in-page back (ChecksStudioPage L1061) | `/checks/studio/tests` |
| Editor "Open Tests" (L1194) | `/checks/studio/tests` |
| Editor breadcrumb "All Checks" | `/checks/all` |
| Schedule dialog "Inspect run" / "View run" (every host: editor, Tests page) | `/checks/studio/runs/{executionId}` |
| Tests page row (`TestRow`) | `ui-tests/{id}/studio` |
| "Create Test" on the Tests page and the Runs page (header and empty state) | `/checks/create?type=UI_TEST` |
| Runs page test link and drawer `testHref` | `ui-tests/{id}/studio` |
| Dashboard "Open Checks Studio" and command palette "Studio" (only when availability is `'on'`) | `/checks/studio/tests` |
| Sidebar | Studio group: Tests, Runs (both exist) |
| Create Check UI Test → editor | `ui-tests/{newId}/studio` (replace navigation, no autorun) |
| `studio` and `studio/{id}` | Catch-all, module home |

**Route-scan S1** (task 1.33, plan `verificationConventions.removedRouteScans.S1`). It exits 0 only when no bare `/checks/studio`, `/checks/studio/:id`, test-local `/studio/tests/:id` or no-id `/studio` route, and no `path="studio"` or `path="studio/:id"`, remains. References to `/checks/studio/tests` and `/checks/studio/runs` are allowed at this boundary. The scan matches route strings only, never import paths (CRIT-19). Run it from `frontend/`:

```bash
! (grep -rn "/checks/studio" src e2e | grep -v "citi/put/checks/studio" | grep -vE "/checks/studio/(tests|runs)([^A-Za-z0-9_]|$)") \
  && ! grep -rnE "['\"\`]/studio/tests/:id|path: '/studio'|path=\"studio(/:id)?\"" src e2e
```

## WCAG baseline (guard only, ADR-SC-006)

This story moves the guard in one way only: surfaces 3–7 of `studioWcagAudit.test.tsx` (the `ChecksStudioPage` states) are re-mounted on a route id instead of the bare `MemoryRouter` (a mount change only, D7). The increment also changes the editor DOM those surfaces render: the breadcrumb, the read-only CSI and the UAT option (spec §12.5). `axe-results.json` records every finding, not only failures, so the baseline may move.

- If it moves, regenerate `docs/qa/accessibility/axe-results.json` and record the reason in `docs/qa/accessibility/studio-wcag-audit.md` **in this story**: "mount changed to a route id" and/or "editor framing (increment 1: breadcrumb, read-only CSI, UAT option)", with "no surface added" (tasks 1.10 and 1.33).
- If a change breaks the audit, fix the regression. A moved baseline is never committed silently.
- Do not add a surface, a test or an acceptance criterion for accessibility. Do not extend the audit.

## CodeRabbit Integration

**Story Type Analysis**
- Primary type: Frontend (routing, forms, editor state).
- Secondary types: removal and test migration; navigation and entry points.
- Complexity: S–M (spec §14; whole spec STANDARD 13/25).

**Specialized Agent Assignment**
- Primary: @dev (implementation and pre-commit review), @qa (gate).
- Supporting: @ux-design-expert on request, for layout or interaction questions only (no accessibility review, ADR-SC-006); @devops only for a later, separately authorised push or PR. @dev does not push.

**Quality Gate Tasks**
- [x] Pre-Commit (@dev) — CodeRabbit NOT RUN (no CLI/WSL on this host); graceful degradation: independent Lean review is the manual diff review. Original text: run the configured CodeRabbit review before marking the story complete. The CLI is WSL-based; if it is unavailable, record that it was not run, apply the configured graceful degradation, and do an independent manual diff review. Never claim a run that did not happen.
- [x] Independent review (@qa): implementation evidence, the link walk, route scan S1 (WCAG guard record removed by user decision). PASS, see QA Results.
- [ ] Pre-PR (@devops): only if a PR is later authorised. No PR is implied here.

**Self-Healing Configuration** (`.claude/rules/coderabbit-integration.md`)
- @dev phase: light mode, max 2 iterations, 30 min, CRITICAL and HIGH only. CRITICAL is auto-fixed; HIGH is auto-fixed while the iteration count is below 2 and otherwise documented as debt; MEDIUM is documented as debt; LOW is ignored.
- @qa phase: full mode, max 3 iterations, 30 min.

**Focus Areas**
- Primary: no link or route survives to a deleted target; the editor's run gate is the only run entry (no execute from anywhere else); autorun is consumed exactly once; no direct `fetch()` in new or changed lines (centralized API client); strict TypeScript.
- Secondary: responsive layout kept (project CLAUDE.md); MUI v5 `sx` and React Router v6 APIs only (CON-05); test migration is a mount change only.
- Not a focus area: accessibility (ADR-SC-006).

## Definition of Done

- All 33 task checkboxes are ticked and each task's verification passes (task 1.32 may be recorded as "not run: no backend" if no backend is available, with `pnpm run type-check` passing).
- At the end of the story `pnpm run type-check`, `pnpm run lint`, the narrow Vitest suites and the touched Playwright specs (`--project=msw`) pass.
- The link walk table above holds, and route scan S1 exits 0.
- The Studio WCAG audit passes. If its baseline moved, it is regenerated and the reason is recorded in `studio-wcag-audit.md` in this story. No surface was added.
- The 14 acceptance criteria hold. No accessibility work, backend or Flyway change, new dependency, redirect or fallback was added. pnpm only.
- The File List and Dev Agent Record are filled in by @dev. Status moves follow `story-lifecycle.md` (@dev: InProgress, then InReview; @qa: Done).

## Tasks / Subtasks

The 33 tasks below map 1:1 to plan subtasks 1.1–1.33 (`plan/implementation.yaml`, phase-1). Run them **in the listed order**: several touch the same file, each for a distinct concern after the one before it. Run every command from `frontend/`. Use **pnpm only**, never npm or yarn. Re-read the cited lines before editing: they were verified against the working tree on top of HEAD `b39359f78` and may have drifted (ASM-06, R11). The "Plan notes" under each task are copied from the plan and are part of the task. Tick a box only when its verification command passes.

- [x] **1.1** Capture the pre-change baseline (initial bundle size, WCAG guard state) for later comparisons
  - Service: infra. Covers: NFR-02, FR-28.
  - Files: `docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/implementation/baseline.json`
  - Verify (from `frontend/`):
    ```bash
    pnpm run build \
      && pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx \
      && git diff --exit-code -- ../docs/qa/accessibility/axe-results.json
    ```
  - Plan notes:
    Record the entry-asset byte sizes from the production build and the axe-results.json sha256. If
    axe-results.json already differs from HEAD, stop and report the pre-existing drift.

- [x] **1.2** Create the UI test path helpers (detail, runs, run, editor with/without autorun) as the single route source
  - Service: frontend. Covers: FR-05, FR-11, CON-06, CON-09.
  - Files: `frontend/src/components/studio/uiTestPaths.ts`, `frontend/src/components/studio/uiTestPaths.test.ts`
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/components/studio/uiTestPaths.test.ts \
      && pnpm exec eslint src/components/studio/uiTestPaths.ts
    ```
  - Plan notes:
    uiTestPath, uiTestRunsPath, uiTestRunPath and uiTestEditorPath(id, {autorun}). Each takes an explicit
    base defaulting to '/checks' (the convention at AllChecksPage L530). Never search the pathname for
    '/studio'. Ids are URI-encoded. Tests cover base '/checks' and ''.

- [x] **1.3** Add the derived UI test availability hook ('pending'|'on'|'off') used by every switch-off consumer (DC-18)
  - Service: frontend. Covers: FR-24, AC-23.
  - Files: `frontend/src/hooks/useUiTestAvailability.ts`, `frontend/src/hooks/useUiTestAvailability.test.tsx`
  - Verify (from `frontend/`): `pnpm exec vitest run src/hooks/useUiTestAvailability.test.tsx`
  - Plan notes:
    The state is 'pending' until sources.fetched and features.fetched. After that it is 'on' iff
    UI_TEST and STUDIO are enabled (fail-open: missing entries and empty lists count as on), else
    'off'. Tests include a late fetch that moves on to off.

- [x] **1.4** Extract the empty-draft create request builder used by Create Check's UI Test form
  - Service: frontend. Covers: FR-02, AC-02.
  - Files: `frontend/src/components/studio/tests/newTestRequest.ts`, `frontend/src/components/studio/tests/newTestRequest.test.ts`
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/tests/newTestRequest.test.ts`
  - Plan notes:
    The body is the one at CreateTestDialog.tsx L80-92: authoringSchemaVersion 2, steps [], variables [],
    defaultConfiguration(), trimmed name, csiId, description, environment. The dialog itself is deleted
    in 1.20.

- [x] **1.5** Add the shared route-id mount helper for editor tests
  - Service: frontend. Covers: FR-06, NFR-09.
  - Files: `frontend/src/test/renderStudioAt.tsx`
  - Depends on: 1.2
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/test/renderStudioAt.tsx`
  - Plan notes:
    renderStudioAt(id, node, options) mounts node at uiTestEditorPath(id) inside MemoryRouter + Routes
    (path '/checks/ui-tests/:id/studio'). It optionally accepts initial search and a nav handle for
    route-change tests. A mount change only.

- [x] **1.6** Re-mount the run-gate, evidence and step-timeout editor suites on a route id
  - Service: frontend. Covers: FR-06, NFR-09.
  - Files: `frontend/src/pages/ChecksStudioPage/pageRunGate.test.tsx`, `frontend/src/pages/ChecksStudioPage/pageEvidence.test.tsx`, `frontend/src/pages/ChecksStudioPage/pageStepTimeout.test.tsx`
  - Depends on: 1.5
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage/pageRunGate.test.tsx src/pages/ChecksStudioPage/pageEvidence.test.tsx src/pages/ChecksStudioPage/pageStepTimeout.test.tsx
    ```
  - Plan notes:
    The bare mounts are pageRunGate L130, pageEvidence L108, L123 and L227, and pageStepTimeout L68. Each
    uses the id that the file's list fixture puts first, which today's code already selects by URL id.
    Assertions are unchanged. Also update the pageStepTimeout L128 comment ("The Tests page creates a
    draft…") to name Create Check, the only create path from this increment (CRIT-23a). These suites stay
    green before and after 1.11.

- [x] **1.7** Re-mount the authoring, save/stop and replay/reference editor suites on a route id
  - Service: frontend. Covers: FR-06, NFR-09.
  - Files: `frontend/src/pages/ChecksStudioPage/pageAuthoringUx.test.tsx`, `frontend/src/pages/ChecksStudioPage/pageSaveAndStop.test.tsx`, `frontend/src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx`
  - Depends on: 1.5
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage/pageAuthoringUx.test.tsx src/pages/ChecksStudioPage/pageSaveAndStop.test.tsx src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx
    ```

- [x] **1.8** Re-mount the incremental-recording, guided-run and bootstrap-shape suites on a route id
  - Service: frontend. Covers: FR-06, NFR-09.
  - Files: `frontend/src/pages/ChecksStudioPage/pageIncrementalRecording.test.tsx`, `frontend/src/pages/ChecksStudioPage/pageGuidedRun.test.tsx`, `frontend/src/test/pageBootstrapShape.test.tsx`
  - Depends on: 1.5
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage/pageIncrementalRecording.test.tsx src/pages/ChecksStudioPage/pageGuidedRun.test.tsx src/test/pageBootstrapShape.test.tsx
    ```
  - Plan notes:
    The bare mounts are pageIncrementalRecording L142, pageGuidedRun L151 and pageBootstrapShape L68.
    pageGuidedRun's route-switch case (L1012-1024) also moves off the old route shape (CRIT-25a):
    renderStudioAt(unlearnedDraft.id, ..., {navHandle}) replaces the Route '/studio/tests/:id' at L1015,
    and nav.go at L1024 uses uiTestEditorPath(needsRelearnDraft.id). pageBootstrapShape keeps its
    fail-open intent; only its editor mount changes. replayFailure.test.tsx is not touched (G6).

- [x] **1.9** Move the transport test's test-local routes ('/studio/tests/:id' and no-id '/studio') onto the new editor path
  - Service: frontend. Covers: FR-06, NFR-09.
  - Files: `frontend/src/pages/ChecksStudioPage/studioRunTransport.node.test.tsx`
  - Depends on: 1.5
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage/studioRunTransport.node.test.tsx src/services/mocks/studio/executionScenarioMatrix.test.ts src/services/mocks/studio/executionFixtureMatrix.test.ts
    ```
  - Plan notes:
    CRIT-25a. The Routes at L170-176 become one route at '/checks/ui-tests/:id/studio'; the no-id
    '/studio' route is deleted. The renderAt calls (L224, L253, L312, L343, L393) and nav.go (L362) use
    uiTestEditorPath. Mounting stays createElement-based (.node test). Assertions are unchanged.

- [-] **1.10** (REMOVED, user decision 2026-10-23: no WCAG work; the audit test is deleted) Re-mount WCAG surfaces 3-7 on a route id and record any baseline move with its reason
  - Service: frontend. Covers: FR-28, CON-04, AC-27.
  - Files: `frontend/src/test/a11y/studioWcagAudit.test.tsx`, `docs/qa/accessibility/axe-results.json`, `docs/qa/accessibility/studio-wcag-audit.md`
  - Depends on: 1.5, 1.1
  - Verify (from `frontend/`): `pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx && git diff --stat -- ../docs/qa/accessibility/`
  - Plan notes:
    renderPage (L203-208) uses renderStudioAt for surfaces 3-7 only. Surfaces 1-2 keep their own mount
    until phases 3 and 2. No change is expected. If the baseline moves, add a dated line to
    studio-wcag-audit.md: "mount changed to a route id (D7), no surface added". If it does not move,
    leave both docs untouched.

- [x] **1.11** Make ChecksStudioPage always load the route-id test by GET /studio/tests/{id} and delete the no-id list[0] fallback
  - Service: frontend. Covers: FR-06, FR-25, AC-06, AC-07.
  - Files: `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `frontend/src/pages/ChecksStudioPage/pageLoadById.test.tsx`
  - Depends on: 1.6, 1.7, 1.8, 1.9, 1.10
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage src/test/pageBootstrapShape.test.tsx src/test/a11y/studioWcagAudit.test.tsx \
      && pnpm run type-check
    ```
  - Plan notes:
    Initial load (L483-522):
    - With params.id, read getTest(id), merge its header into scenarios and select it.
    - On 403 or 400, show "This UI test doesn't exist or you don't have access" and select nothing.
    - Delete L495-499 (list[0]).
    Route-change detector (L705-717): an id not in scenarios is read by id instead of being ignored. Keep
    the lastRouteId semantics and go through handleScenarioSelect, so stream closing (AC-13) still runs.
    reloadScenarios (L524-535) re-merges the selected header.
    Without params.id (a test-only mount), send no Studio request and render the existing "No test
    selected." panel (L1192-1195). That is the minimal render the spec left to the Plan; nothing is
    runnable.
    Do not touch autorun here (1.12). Two stale comments are owned here:
    - L734 still says tests are created on the Tests page.
    - L694 cites "/checks/studio/:id, App.tsx:114" (CRIT-20); rewrite it to describe the ui-tests editor
      route without the old path. Scan S1 in 1.33 rejects the old wording.
    Tests: an id beyond page 1 on load and on route change; reload keeps the selection; 403 and 400; a
    no-id mount sends no request and no run.

- [x] **1.12** Consume autorun once at a bounded gate settle via a capabilities-settled signal and a dedicated autorun request (DC-01, G9)
  - Service: frontend. Covers: FR-13, NFR-05, AC-29.
  - Files: `frontend/src/components/studio/run/useRunGate.ts`, `frontend/src/components/studio/run/RunControl.tsx`, `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`
  - Depends on: 1.11
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/components/studio/run src/pages/ChecksStudioPage/pageRunGate.test.tsx \
      && pnpm run type-check
    ```
  - Plan notes:
    useRunGate: capabilitiesSettled resets on testId change and is set when the capabilities promise
    settles.
    RunControl: an optional autorunRequest {token, testId}, separate from runRequest, so "Run again" is
    unchanged. It is evaluated once, when the gate's read is done, capabilitiesSettled is true and hasSteps
    is known. It is served if runnable (L139), and dropped otherwise.
    Page: when params.id and autorun=1, replace-navigate without autorun first. Arm the request only after
    the route id's draft is loaded. Clear it on a draft edit, Run or Stop, a route-id change or unmount.
    Remove the autorun use of setRunRequest (L507-511). The bound comes from apiClient (about 90.6 s worst
    case).

- [x] **1.13** Add the AC-29 autorun tests (each readiness, settle, drop-on-activity) and the capabilitiesSettled gate test
  - Service: frontend. Covers: AC-29, FR-13.
  - Files: `frontend/src/pages/ChecksStudioPage/pageAutorun.test.tsx`, `frontend/src/components/studio/run/runGate.test.tsx`
  - Depends on: 1.12
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage/pageAutorun.test.tsx src/components/studio/run/runGate.test.tsx
    ```
  - Plan notes:
    Cases from the §7.2 table:
    - READY: one execute, and the history entry has no autorun.
    - Remount: nothing sent.
    - Capabilities read fails and execute answers 403: one execute, then the forbidden narrative.
    - UNLEARNED: one guided start.
    - LEARNING, no steps, or canManage false: nothing sent.
    - Failed test read: nothing sent.
    - Before settle: nothing sent.
    - An edit before settle: nothing sent.
    - "Run again" still runs once.

- [x] **1.14** Make StudioScheduleDialog take its run-link builder from its host; the Tests page host targets the Runs page run
  - Service: frontend. Covers: FR-08, AC-09, DC-20.
  - Files: `frontend/src/components/studio/scheduling/StudioScheduleDialog.tsx`, `frontend/src/components/studio/scheduling/StudioScheduleDialog.test.tsx`, `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/scheduling src/pages/StudioTestsPage/StudioTestsPage.test.tsx`
  - Plan notes:
    New required prop: runHref(executionId). Drop the L26-28 derivation and the L11 import. The
    StudioTestsPage host (L173) passes the /checks/studio/runs/{id} builder. The dialog test passes
    runHref in its renders (L27, L56, L233) and keeps its Runs-page href assertions.

- [x] **1.15** Frame the editor (breadcrumb, back to the Tests page, read-only CSI chip, UAT option, editor-hosted dialog links to the Runs page run)
  - Service: frontend. Covers: FR-07, FR-08, FR-01, FR-24, AC-08, AC-09, AC-01, AC-23.
  - Files: `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `frontend/src/pages/ChecksStudioPage/pageFraming.test.tsx`
  - Depends on: 1.11, 1.14, 1.3
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage/pageFraming.test.tsx \
      && pnpm exec vitest run src/pages/ChecksStudioPage src/test/pageBootstrapShape.test.tsx src/test/a11y/studioWcagAudit.test.tsx \
      && pnpm run type-check
    ```
  - Plan notes:
    - Outer availability gate (CRIT-26, spec §7.1). ChecksStudioPage (L1936-1940) reads
      useUiTestAvailability() instead of selectIsSourceEnabled and selectIsFeatureEnabled:
      - 'off': the existing local StudioUnavailable (L166);
      - 'pending': the existing "Loading test…" text (the L1167 string, as a plain caption), with
        ChecksStudioPageInner not mounted, so no Studio request is sent;
      - 'on': the editor.
      'pending' ends even when a bootstrap fetch fails, because both slices set fetched on rejection
      (sourcesSlice L42-45, featuresSlice L66-69).
      pageFraming.test covers three cases: pending (sources answer delayed: the caption shows and zero
      /studio requests are sent), off (UI_TEST disabled: StudioUnavailable and zero /studio requests),
      and a sources fetch failure (fail-open: the editor mounts).
      The second command checks that the existing editor suites, pageBootstrapShape and the WCAG surfaces
      still find the editor after 'pending'. A suite that asserts synchronously before the bootstrap
      fetches settle waits with findBy; there is no other change.
    - Breadcrumb "All Checks › {name}"; "All Checks" goes to /checks/all.
    - The in-page back (L1058-1066) goes to /checks/studio/tests and keeps the leave guard.
    - "Open Tests" (L1194) stays on /checks/studio/tests.
    - CSI is a read-only chip.
    - L1212 offers Development, Staging, UAT and Production.
    - The L1144 dialog host passes the Runs-page run builder.
    - The layout is unchanged.
    Tests use renderStudioAt.

- [x] **1.16** Repoint the Tests page row to the new editor path and its Create Test actions to /checks/create?type=UI_TEST; drop testHref
  - Service: frontend. Covers: FR-08, FR-27, AC-26.
  - Files: `frontend/src/components/studio/tests/testListPresentation.ts`, `frontend/src/components/studio/tests/TestRow.tsx`, `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`
  - Depends on: 1.2, 1.14
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/components/studio/tests src/pages/StudioTestsPage`
  - Plan notes:
    Remove testHref (L69). TestRow L32 uses uiTestEditorPath. StudioTestsPage openCreate (L42) and the
    empty action navigate to /checks/create?type=UI_TEST, and the CreateTestDialog usage (L7, L29,
    L175-182) is removed (K1).

- [x] **1.17** Update the Tests page tests (editor URLs; Create Test now navigates to Create Check)
  - Service: frontend. Covers: FR-08, AC-26.
  - Files: `frontend/src/pages/StudioTestsPage/StudioTestsPage.test.tsx`
  - Depends on: 1.16
  - Verify (from `frontend/`): `pnpm exec vitest run src/pages/StudioTestsPage/StudioTestsPage.test.tsx`
  - Plan notes:
    L228 and L273 move to /checks/ui-tests/{id}/studio. The "Tests page — create" cases (L355-439: counter
    L376, system field L389, create-and-open L404-423, refusals L425-430) are replaced by one case: Create
    Test (header L75 and empty state L106) lands on /checks/create?type=UI_TEST (K4). L422's old URL goes
    with them. The name, system and refusal cases move to 1.30.

- [x] **1.18** Repoint the Runs page test links, drawer testHref and Create Test; remove studioTestPath and the dead studioTestsPath
  - Service: frontend. Covers: FR-08, FR-27, AC-26.
  - Files: `frontend/src/pages/StudioRunsPage/StudioRunsPage.tsx`, `frontend/src/components/studio/runs/runLinks.ts`, `frontend/src/components/studio/runs/runSnapshots.test.ts`
  - Depends on: 1.2
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/runs/runSnapshots.test.ts && pnpm run type-check`
  - Plan notes:
    testHref (L113-117) uses uiTestEditorPath. Create Test (L145, L172) navigates to
    /checks/create?type=UI_TEST, and the dialog (L20, L64, L238-245) is removed. Delete studioTestPath and
    studioTestsPath, and the runSnapshots assertions at L52-53. runsListPath and runDetailsPath stay until
    phase 2.

- [x] **1.19** Update the Runs page and schedule provenance tests (editor URL, Create Test navigation, testHref)
  - Service: frontend. Covers: FR-08, AC-26.
  - Files: `frontend/src/pages/StudioRunsPage/StudioRunsPage.test.tsx`, `frontend/src/components/studio/scheduling/scheduleProvenance.test.tsx`
  - Depends on: 1.18
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/StudioRunsPage/StudioRunsPage.test.tsx src/components/studio/scheduling/scheduleProvenance.test.tsx
    ```
  - Plan notes:
    StudioRunsPage.test: L107 route and L274 location go to /checks/ui-tests/:id/studio, and L219-228
    now asserts navigation to /checks/create?type=UI_TEST (K4). scheduleProvenance L28 testHref uses
    uiTestEditorPath.

- [x] **1.20** Delete the Studio create dialog, now replaced by Create Check -> UI Test
  - Service: frontend. Covers: FR-27, AC-26.
  - Files: `frontend/src/components/studio/tests/CreateTestDialog.tsx`
  - Depends on: 1.16, 1.18, 1.4
  - Verify (from `frontend/`): `pnpm run type-check && ! grep -rn "CreateTestDialog" src`
  - Plan notes:
    It has no test file of its own (FR-27).

- [x] **1.21** Add ui-tests/:id/studio and remove studio/:id and the bare studio route in both trees, with a per-tree route test
  - Service: frontend. Covers: FR-05, FR-27, CON-09, AC-06, AC-26.
  - Files: `frontend/src/App.tsx`, `frontend/src/App.routes.test.tsx`
  - Depends on: 1.11
  - Verify (from `frontend/`): `pnpm exec vitest run src/App.routes.test.tsx && pnpm run type-check`
  - Plan notes:
    Both trees get ui-tests/:id/studio behind FeatureGate STUDIO, and lose L110/L114 and L139/L143. The
    route test renders <App/> at /checks/... and /..., with ChecksLayout as a passthrough and the lazy
    pages as sentinels (G5). It asserts that ui-tests/{id}/studio renders the editor and that studio and
    studio/{id} land on module home. The removed-path list grows in 2.9 and 3.10.

- [x] **1.22** Delete the unused navigationConfig module, drop ChecksLayout's bare studio clause, and map ui-tests to Checks in LayoutProvider
  - Service: frontend. Covers: FR-08, FR-27, AC-09, AC-26.
  - Files: `frontend/src/utils/constants/navigationConfig.ts`, `frontend/src/components/layout/ChecksLayout/ChecksLayout.tsx`, `frontend/src/components/layout/LayoutProvider/LayoutProvider.tsx`
  - Depends on: 1.21
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/utils/constants src/components/layout`
  - Plan notes:
    Delete navigationConfig.ts, which nothing imports. Remove ChecksLayout L85. In LayoutProvider
    (L66-72), add /checks/ui-tests -> 'all-checks'. L70 becomes two explicit prefixes,
    startsWith('/checks/studio/tests') || startsWith('/checks/studio/runs'), because the bare route is
    gone and scan S1 allows only those two. The runs prefix is removed in 2.15 and the line itself in
    3.18.

- [x] **1.23** Map ui-tests paths to the Checks sidebar item in navigationSetup and cover the page-id mapping
  - Service: frontend. Covers: FR-08, AC-09.
  - Files: `frontend/src/utils/navigation/navigationSetup.ts`, `frontend/src/utils/navigation/navigationSetup.test.ts`
  - Verify (from `frontend/`): `pnpm exec vitest run src/utils/navigation/navigationSetup.test.ts`
  - Plan notes:
    getCurrentPageId maps /checks/ui-tests to 'checks'. The bare-studio line L75 goes, because that route is removed in 1.21. The Studio group is untouched.

- [x] **1.24** Repoint the Dashboard quick action and command palette entry to /checks/studio/tests, shown only when availability is 'on'
  - Service: frontend. Covers: FR-08, FR-24, AC-09, AC-23, DC-23.
  - Files: `frontend/src/components/home/CommandPalette.tsx`, `frontend/src/pages/DashboardPage/DashboardPage.tsx`, `frontend/src/components/home/entryPoints.test.tsx`
  - Depends on: 1.3
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/home/entryPoints.test.tsx && pnpm run type-check`
  - Plan notes:
    CommandPalette NAV_ITEMS L12-18 and DashboardPage L753. The entries are absent while availability is 'pending' or 'off'. Retargeted again in 3.8.

- [x] **1.25** Remove the legacy UI_TEST picker branches from Create/Review and the stale uiTest check-type field
  - Service: frontend. Covers: FR-04, AC-05.
  - Files: `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx`, `frontend/src/components/checks/wizard/ReviewStep.tsx`, `frontend/src/types/checks/checkTypes.ts`
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm exec eslint src/pages/CreateCheckPage src/components/checks/wizard/ReviewStep.tsx src/types/checks
    ```
  - Plan notes:
    CreateCheckPage: L85, L90-127, L160, L209, L276, L296-310, and the availableUITests prop. ReviewStep:
    L185-205 and L258-263. checkTypes.ts: L64-73. 'UI_TEST' stays in the CheckType union.

- [x] **1.26** Delete the legacy UiTestConfig picker component, its test and its barrel export
  - Service: frontend. Covers: FR-04, FR-27, AC-05.
  - Files: `frontend/src/components/checks/wizard/configs/UiTestConfig.tsx`, `frontend/src/components/checks/wizard/configs/UiTestConfig.test.tsx`, `frontend/src/components/checks/wizard/configs/index.ts`
  - Depends on: 1.25
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/components/checks/wizard/configs`

- [x] **1.27** Drop the deleted UiTestConfig path from the referencePicker static-source scan
  - Service: frontend. Covers: FR-04.
  - Files: `frontend/src/components/studio/references/referencePicker.test.tsx`
  - Depends on: 1.26
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/references/referencePicker.test.tsx`
  - Plan notes:
    L610 (K3).

- [x] **1.28** Gate the UI Test type card on derived availability (both flags) and disable it on the edit page
  - Service: frontend. Covers: FR-01, FR-24, AC-23, AC-30.
  - Files: `frontend/src/components/checks/wizard/CheckTypeSelector.tsx`
  - Depends on: 1.3, 1.8
  - Verify (from `frontend/`): `pnpm exec vitest run src/test/pageBootstrapShape.test.tsx && pnpm run type-check`
  - Plan notes:
    The UI_TEST card is dimmed and not selectable unless availability is 'on'. A new optional
    disabledTypes prop serves edit/:id. pageBootstrapShape mounts this selector under a fail-open store
    and must stay green.

- [x] **1.29** Add the Create Check UI Test one-form branch with the environment-chosen rule, ?type preselect and derived switch-off
  - Service: frontend. Covers: FR-01, FR-02, FR-03, FR-24, AC-01, AC-02, AC-03, AC-04, AC-23, AC-30.
  - Files: `frontend/src/components/checks/wizard/UiTestCreateForm.tsx`, `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx`
  - Depends on: 1.2, 1.3, 1.4, 1.25, 1.28
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm exec eslint src/components/checks/wizard/UiTestCreateForm.tsx src/pages/CreateCheckPage
    ```
  - Plan notes:
    The form:
    - Name (at most TEST_NAME_MAX_LENGTH), Description, the existing registered-CSI select, and
      Environment from STUDIO_TEST_ENVIRONMENTS.
    - "Create and open Studio" calls studioApi.createTest(newTestRequest(...)). On success it removes
      'checks:create:draft' and navigates to uiTestEditorPath(id) with replace, without autorun. On
      failure it shows createErrorMessage(failure) from components/studio/tests/testErrors.ts L30 inline
      (DC-24) and stays.
    The page, for an effective type of UI_TEST on the create route:
    - It hides the stepper, steps, Back/Next, Test Now, Create Check and tags. CheckTypeSelector stays.
    - Switching back restores the stepper and keeps the fields.
    - environmentChosen rule (§6): the flag is set by a user change or by restoring a UI_TEST draft.
      Entering UI Test sets Development only while the flag is false.
    - ?type=UI_TEST is held while 'pending', applied when 'on', and ignored when 'off'.
    - A UI_TEST type is reset on 'off'.

- [x] **1.30** Add Create Check UI Test component tests (one form, precedence, preselect, switch-off incl. late sources, create and errors)
  - Service: frontend. Covers: AC-01, AC-02, AC-03, AC-04, AC-05, AC-23, AC-30.
  - Files: `frontend/src/pages/CreateCheckPage/CreateCheckPage.uiTest.test.tsx`
  - Depends on: 1.29
  - Verify (from `frontend/`): `pnpm exec vitest run src/pages/CreateCheckPage/CreateCheckPage.uiTest.test.tsx`
  - Plan notes:
    Serve sources, features and csi inline, as studioWcagAudit L105-109 does. Cases:
    - The AC-30 sequence, plus ?type with a restored UI_TEST draft (its environment is kept).
    - One POST with the builder body; the draft is removed; history is replaced.
    - Inline create errors through createErrorMessage, moved from the Tests page test (K4, CRIT-23b):
      400 with a detail message, 400 without detail, 403, 409 and 500. Each keeps the route and the
      entered fields.
    - Name over 255 characters is rejected; the counter shows n/255, and Create stays disabled.
    - System (CSI) required: with no CSI chosen, Create stays disabled and no request is sent.
    - edit/:id cannot select UI Test.
    - Switch off.
    - Sources arriving disabled after the first render.
    - No picker on any type.

- [x] **1.31** Move the MSW E2E specs that open the editor by URL to ui-tests/{id}/studio
  - Service: frontend. Covers: FR-05, NFR-09.
  - Files: `frontend/e2e/studio-variables.spec.ts`, `frontend/e2e/studio-guided.spec.ts`
  - Depends on: 1.21
  - Verify (from `frontend/`):
    ```bash
    pnpm exec playwright test --project=msw e2e/studio-guided.spec.ts \
      && CHECKS_VARIABLES354_EVIDENCE_DIR="$(mktemp -d)/variables354-visual/images" pnpm exec playwright test --project=msw e2e/studio-variables.spec.ts
    ```
  - Plan notes:
    studio-variables L104, L174, L233-234; studio-guided L185 (G1). The evidence directory is a temp directory, not the repo.

- [x] **1.32** Rewrite the real-backend authoring E2E to start from Create Check -> UI Test
  - Service: frontend. Covers: FR-01, FR-02, NFR-08.
  - Files: `frontend/e2e/studio-authoring-real-backend.spec.ts`
  - Depends on: 1.29, 1.21
  - Verify (manual): With a running local backend (CHECKS_SOURCE_UI_TEST=true), run CHECKS_E2E_REAL_BACKEND=1 pnpm exec playwright test --project=real-backend e2e/studio-authoring-real-backend.spec.ts. Without a backend, run pnpm run type-check and record "not run: no backend" in the story.
  - Plan notes:
    L128-150 go to /checks/create?type=UI_TEST and then "Create and open Studio". The L151 id parse reads
    the segment before /studio.

- [x] **1.33** Run the phase-1 gate (type-check, lint, WCAG guard, touched suites, removed-route scan for the bare and id studio routes)
  - Service: infra. Covers: FR-27, FR-28, NFR-09, CON-04, AC-09, AC-26, AC-27.
  - Files: `docs/qa/accessibility/axe-results.json`, `docs/qa/accessibility/studio-wcag-audit.md`
  - Depends on: 1.10, 1.13, 1.15, 1.17, 1.19, 1.20, 1.22, 1.23, 1.24, 1.27, 1.30, 1.31
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm run lint \
      && pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx src/pages/ChecksStudioPage src/test/pageBootstrapShape.test.tsx src/components src/pages/StudioTestsPage src/pages/StudioRunsPage src/pages/CreateCheckPage src/App.routes.test.tsx src/hooks src/utils/navigation src/services/mocks/studio \
      && ! (grep -rn "/checks/studio" src e2e | grep -v "citi/put/checks/studio" | grep -vE "/checks/studio/(tests|runs)([^A-Za-z0-9_]|$)") \
      && ! grep -rnE "['\"\`]/studio/tests/:id|path: '/studio'|path=\"studio(/:id)?\"" src e2e \
      && git diff --stat -- ../docs/qa/accessibility/
    ```
  - Plan notes:
    The gate only verifies; it edits nothing. Scan S1 (verificationConventions.removedRouteScans) rejects
    any /checks/studio reference other than /checks/studio/tests or /checks/studio/runs, the test-local
    '/studio/tests/:id' and no-id '/studio' route shapes, and App.tsx path="studio" and
    path="studio/:id". Its 25 hits in today's tree are each owned by a phase-1 subtask, including the
    ChecksStudioPage L694 comment (1.11, CRIT-20) and the two test-local routes (1.8, 1.9, CRIT-25a).
    /checks/studio/tests and /checks/studio/runs are still valid targets at this boundary.
    The editor framing changes surfaces 3-7. If the baseline moves:
    - On a critical or serious rule, fix the regression.
    - Otherwise keep the regenerated file and record "editor framing (increment 1), no surface added" in
      studio-wcag-audit.md.
    The baseline change and its reason stay in this increment.


## Dev Notes

**Source authority.** The [spec](spec/spec.md) owns behaviour and design calls. [requirements.json](spec/requirements.json) owns FR, NFR, CON and AC wording. The [plan](plan/implementation.yaml) owns file lists, order and verification commands. This section only gathers what the three say that bears on increment 1, so the dev does not need to read more than the plan notes in each task.

### Design calls that apply (spec §1.4)

| DC | Call (increment 1 reading) |
|---|---|
| DC-01 | **Autorun is consumed once.** The editor removes `autorun` from the URL with a replace navigation before it requests the run. It requests the run only for the test loaded by the route id, after `GET /studio/tests/{id}` succeeds. A reload or Back never starts a second run. The request is evaluated once, when the gate settles (§7.2). If the gate is not runnable then, the request is dropped and the existing caption explains why. The wait is bounded, and user activity before settle drops the request. |
| DC-04 | Create offers Development, Staging, UAT and Production, defaulting to Development. The editor select gains UAT. An environment change still moves READY to NEEDS_RELEARN (existing behaviour). |
| DC-05 | The silent 503/401 on guided start stays out of scope as a known issue (§16.2). |
| DC-06 | With the switch on, `?type=UI_TEST` wins on load over a stored create draft's type. (Its All Checks half is story .3.) |
| DC-09 | The breadcrumb's "All Checks" item goes to `/checks/all`. The Dashboard quick action and the palette entry follow DC-23. |
| DC-15 | **Create Check UI Test branch.** The card replaces the stepper with one form. The environment precedence follows the "environment chosen" rule (§6). Switching back restores the stepper and keeps the fields. The edit page does not offer the card. |
| DC-18 | **Availability is derived, with three states.** `'pending'` until sources and features are fetched. Then `'on'` if the UI_TEST source and STUDIO feature are on (missing entries and empty lists count as on), else `'off'`. In `'pending'` no Studio request is sent and a UI_TEST type from the URL or a stored draft is held (not applied, written or dropped). The editor's outer gate (ChecksStudioPage L1936-1940) reads the same hook and uses only existing renders: `'off'` shows the existing `StudioUnavailable` (L166); `'pending'` shows the editor's existing "Loading test…" text (L1167) in place of the editor body and sends no Studio request; `'on'` mounts the editor. `'pending'` always ends, because both `fetched` flags are also set on a failed fetch (sourcesSlice L42-45; featuresSlice L66-69), after which fail-open applies. In `'off'`, the held value is dropped and never written, a selected UI Test create type is reset, and the Dashboard and palette entries are hidden. In `'on'`, the held value is applied. |
| DC-19 | **No-id editor: the fallback is deleted (D7).** The editor always loads a test by route id. A no-id mount, which only a test can produce once the bare `studio` route is gone, loads nothing and offers nothing to run. The plan's minimal render (1.11): send no Studio request and show the existing "No test selected." panel (L1192-1195). Every editor test, including WCAG surfaces 3-7, mounts with a test id. This is a mount change only. |
| DC-20 | **Schedule dialog links.** The dialog takes its run-link target from its host. In increment 1 it targets the Runs-page run. From increment 2 it targets the ui-tests run path for every host. |
| DC-22 | **Removals by increment.** Increment 1: `studio/:id`, bare `studio`, the fallback, `navigationConfig`, `CreateTestDialog`. Each increment repoints its references, and the links are re-walked at every boundary. |
| DC-23 | **Interim Dashboard and palette target.** Both are repointed in this increment, when `/checks/studio` goes. They target `/checks/studio/tests` (the Tests page exists until increment 3). They show only when availability is `'on'`. |
| DC-24 | **One create path from increment 1.** Create Check → UI Test replaces `CreateTestDialog`, so the dialog is deleted here. Every other "Create Test" action goes to `/checks/create?type=UI_TEST`: the Tests page header (L75) and empty state (L106), and the Runs page header (L145) and empty state (L172). `createErrorMessage` (testErrors.ts) is reused for Create Check's inline error and stays, as do the shared `STUDIO_TEST_ENVIRONMENTS` and `TEST_NAME_MAX_LENGTH`. |

### Create Check UI Test (spec §6)

- **Card.** "UI Test (Checks Studio)" is selectable only when availability is `'on'`; otherwise it is dimmed. While `'pending'`, a UI_TEST type from `?type` or the stored draft is held. When availability turns `'off'`, it is dropped and a selected UI Test type is reset, so no one-form or submit shows. On `edit/:id` the card cannot be selected.
- **One form.** While UI Test is selected on the create page, the stepper header, the Check Configuration, Scheduling and Review steps, Back/Next, Test Now, Create Check and the tags field are not shown. Basic Information shows Name (required, max 255), Description, System/CSI (required, registered CSIs) and Environment (Development, Staging, UAT, Production). The only submit is "Create and open Studio". Draft autosave keeps working.
- **Environment precedence.** The environment counts as **chosen** once the user changes the Environment select, or once a stored draft whose type is UI Test is restored. Selecting the UI Test card (click or `?type=UI_TEST`) sets Development only while no environment has been chosen. That overrides the Production mount default (L130) and the environment of a restored non-UI-Test draft. So: with `?type=UI_TEST` and a restored UI Test draft, the restored environment is kept; a value picked after selecting the card is kept; re-selecting the card after switching to another card keeps a chosen environment.
- **Switching back.** Another type card brings back the four-step stepper at Basic Information, keeping name, description, CSI and the current environment. Regular-check behaviour is otherwise unchanged.
- **Create.** "Create and open Studio" sends the existing empty-draft request (`authoringSchemaVersion: 2`, `steps: []`, `variables: []`, default configuration). On success it removes `checks:create:draft` and replace-navigates to `ui-tests/{newId}/studio` without autorun. On failure the error shows inline through the existing `createErrorMessage` mapping and the route stays.
- **Legacy.** The legacy UI_TEST picker branches and the `uiTest` type field are removed here (FR-04).

### Editor: load by route id (spec §7.1)

The editor reads `GET /studio/tests/{id}` directly, both on first load and when the route id changes while it is mounted. The change detector at L705-716 today ignores ids outside the loaded list. The loaded test is merged into the editor's test list, and a list reload keeps the selection. A 403, or a 400 for a malformed id, shows "This UI test doesn't exist or you don't have access" and loads nothing else. The stream-closing switch and the change detector must keep working (R1).

### Autorun consumed once (spec §7.2)

**Settle event.** The autorun request is evaluated once, when all three hold:
1. the gate's own initial `GET /studio/tests/{id}` has completed (`loading` false, and a test or a load error set);
2. the gate's capabilities read has resolved (`'allowed'` or `'denied'`) or failed (permission stays `'unknown'`);
3. the editor draft for the route id is loaded, so "has steps" is known.

At settle, the request is served if RunControl's `runnable` predicate holds; otherwise it is dropped. The hook does not expose today whether the capabilities read has finished, so the plan adds an observable signal (`capabilitiesSettled`, task 1.12). An `'unknown'` permission does not block, and the server's refusal is the visible outcome.

**Bound and drop on activity.** The API client bounds the wait. Each attempt times out after 30 s, and a GET is retried at most twice (about 90.6 s in the worst case, PL-01); after that the read counts as failed. The pending request is dropped, and nothing is sent later, if any of these happens before settle: the user edits a step, a variable or the environment; presses Run or Stop; the route id changes; or the editor unmounts.

| State at settle | Today | Required |
|---|---|---|
| READY, has steps, permission allowed or unknown | `POST /execute`. Autorun stays in the URL, so a reload or Back runs again | One replay. Autorun is removed (replace) first, so a reload or Back sends nothing. A server 403 shows the forbidden narrative |
| UNLEARNED, has steps | Guided learn start | One learn start |
| NEEDS_RELEARN, has steps | Guided re-learn | One re-learn start |
| LEARNING | Held; can fire later | Dropped. The existing caption or the session view explains |
| No steps | Held; the first typed step starts a learn | Dropped, with the caption "Add a step to run this test." |
| Permission `'denied'` | Held indefinitely | Dropped, with the existing caption |
| Session view unreadable (learn modes), or a run in progress | Held | Dropped |
| Test read failed or 403 | Can run `list[0]` today | No request |
| User activity, route change or unmount before settle | n/a | Dropped |

"Run again" (PC-06) and the Run button keep their current behaviour.

### Editor framing (spec §7.3, §7.4)

Breadcrumb "All Checks › {name}" (item goes to `/checks/all`); in-page back to the Tests page until increment 2; "Open Tests" to the Tests page until increment 3; CSI read-only; the leave guard kept (in-page dialog plus `beforeunload`; the sidebar and browser Back stay unguarded); the schedule dialog opened with an explicit run-link target; layout unchanged. The environment select offers four values. Saving a changed environment moves READY to NEEDS_RELEARN and invalidates the schedule: existing behaviour, unchanged.

### Research findings and code facts that apply

| Ref | Fact |
|---|---|
| RF-01 | `autorun=1` is read once on mount. The fresh `GET /tests/{id}` then decides: READY replays, UNLEARNED learns, NEEDS_RELEARN re-learns, LEARNING starts nothing (ASM-01). Today the request is never dropped: it is held until the gate is runnable and can fire minutes later. `listTests()` has no params, so the server default size is 20; when the URL id is not in that page the editor falls back to `list[0]` and autorun then runs the wrong test. A guided start answered 503 or 401 is silent (DC-05). |
| RF-02 | Name and description never change readiness. The environment does: an environment change moves READY to NEEDS_RELEARN and invalidates the schedule. |
| RF-03 | `autorun=1` is never removed. A reload, or Back to the `?autorun=1` entry, re-requests a run with a fresh Idempotency-Key. The server dedupes only an identical (principal, key) pair and has no per-test guard. |
| RF-05 | The four environment values (Production, Staging, Development, UAT) match exactly everywhere. Only the editor select lacked UAT. |
| RF-07 | MUI 5.18.0 and React Router 6.30.1 are installed (CLAUDE.md says "v7": an observation, not fixed). Replace navigation and search params are available. |
| PL-01 | `apiClient` timeout is 30 000 ms (L22), with at most 2 GET retries on no response or 5xx (L97-108). `capabilities()` does not opt out of retries. |
| PL-02 | Sources and features are fetched asynchronously at bootstrap (store/index.ts L89-90), with `fetched` flags (sourcesSlice L8-16; featuresSlice L84) and fail-open selectors. |
| PC-03 | All Checks restores and saves `checks:catalog:prefs` (L120-138). Create Check restores `checks:create:draft` (L143) and removes it on create (L254). |
| PC-04 | The Dashboard "Open Checks Studio" quick action (L753) and the command palette "Studio" entry (L16) both go to `/checks/studio`, and neither is gated. |
| PC-06 | "Run again" shares the `runRequest` token (L1667). A followed learn's completion triggers a read, never a run (L820-823). |
| PC-07 | Both route trees end in a catch-all `*` that goes to module home (App.tsx L123, L160). |
| PC-08 | `StudioScheduleDialog` derives `runsPath` from `pathname.indexOf('/studio')` (L26-28), for "Inspect run" (L179) and "View run" (L214). It is hosted by `ChecksStudioPage` and `StudioTestsPage`. |
| PC-09 | CreateCheckPage has steps at L58, the Production mount default at L130, the type selector in step 0 at L318, and the action bar with the Test Now `fetch` at L451-476. `edit/:id` reuses the page (App.tsx L109). |
| PC-13 | `useRunGate` makes its own test read (L292-323). Its capabilities read leaves permission `'unknown'` both while pending and on failure (L325-347). `canRun` blocks only on `'denied'`. |
| PC-16 | `CreateTestDialog` is imported only by StudioTestsPage (L7) and StudioRunsPage (L20), and has no test file. It uses `createErrorMessage`, `STUDIO_TEST_ENVIRONMENTS`, `TEST_NAME_MAX_LENGTH` and `defaultConfiguration()`. The create-error cases live in `StudioTestsPage.test.tsx` L427-430. |
| PC-15 | Link inventory for this increment: bare `/checks/studio` at Dashboard L753, CommandPalette L16, `navigationConfig.ts` L28 and ChecksLayout L85; the editor at `/checks/studio/{id}` via `testHref` L69, `studioTestPath` and StudioRunsPage L111; `LayoutProvider` L70 maps `/checks/studio*`; `studioTestsPath` has no consumer. |

### Risks (spec §17, plan phase-1)

| # | Risk | Mitigation |
|---|---|---|
| R1 | Load-by-id breaks the stream-closing switch (L654-690), the route-change detector (L705-717) or autorun ordering, and every editor test now runs through it. | Keep both guards; test the on-load and the route-change id; re-mount the editor suites first (1.5–1.10) so they are the safety net before the fallback is removed (1.11). |
| R2 | Autorun consumption disturbs "Run again", or settle fires too early or never. | An observable settle (`capabilitiesSettled`) and a separate `autorunRequest` prop; tests for before settle, a failed capabilities read, activity before settle and "Run again" (1.12, 1.13). |
| R7 | The silent guided-start 503/401 shows up more often. | Known issue, out of scope (DC-05). |
| R8 | A malformed id answers 400 (inferred, not verified). | FR-25 treats 400 like 403. |
| R10 | Old bookmarks land on module home. | Accepted (CON-03, D7). |
| R11 | Line references drift. | The dev re-verifies each cited line before editing (ASM-06). |
| R12 | A saved `?type=UI_TEST` surprises a later plain visit. | Same as any filter change; dropped when off. |
| R13 | A late sources answer applies or saves UI_TEST. | Derived availability with `'pending'` (DC-18); late-sources tests (1.30). |
| R14 | Earlier removals (D7) break links or tests mid-story. | The link walk above, the per-tree route test (1.21), and gate 1.33. |

### Cross-story handoff

`accumulated-context.md` does not exist in this repository, so cross-story coherence is recorded here. This story leaves the following for the next stories to build on, and nothing else is promised:

- New shared pieces: `uiTestPaths.ts` (1.2), `useUiTestAvailability` (1.3), `newTestRequest.ts` (1.4), `renderStudioAt` (1.5), the `runHref` prop on `StudioScheduleDialog` (1.14), `App.routes.test.tsx` (1.21), the baseline record `implementation/baseline.json` (1.1, used by 4.2 in story .4).
- Still present at the end of this story: Tests page, Runs page, the sidebar Studio group (Tests, Runs), and LayoutProvider's two explicit prefixes (`/checks/studio/tests`, `/checks/studio/runs`). Story .2 removes the runs prefix and story .3 the tests prefix.

### Testing

Run narrow tests only (spec §12; NFR-09). The gates, which must pass **at the end of this story**, are `pnpm run type-check`, `pnpm run lint`, `pnpm run test <touched specs>` (Vitest) and the touched Playwright specs (`--project=msw`). There are no accessibility criteria (CON-04). Test files live next to their source (`*.test.ts[x]`); E2E specs are in `frontend/e2e/`. Mocks are the Node MSW harnesses (CON-10): the Vitest server and the Playwright `mswProxy`; there is no browser service worker.

**New tests** (spec §12.1, §12.2): UI test path helpers for both module bases; availability derivation (not fetched → pending; fetched with empty lists → on; UI_TEST disabled → off); the empty-draft request builder; Create Check UI Test (the one form; four environments; the "environment chosen" rule; no card on the edit page; one create request, draft removed, replace navigation; inline errors through `createErrorMessage` for 400 with and without detail, 403, 409 and 500; name over 255; CSI required; `?type` held while pending and ignored when off; sources arriving disabled after the first render); ChecksStudioPage (id beyond page 1 on load and on route change; 403 with no fallback; a no-id mount loads nothing and requests no run; breadcrumb, back and links; UAT listed; autorun once for each readiness, a failed capabilities read with execute answering 403, canManage false, a failed read, before settle, a draft edit, a Run press or a route change before settle, a remount after replace, and "Run again" unaffected); StudioScheduleDialog (the run link from the host goes to the Runs-page run); navigation and entry points (Dashboard and palette targets and hidden unless `'on'`); one route test per tree.

**Route test, one per tree** (spec §12.2, G5): render `App.tsx` with `ChecksLayout` mocked as a passthrough and the lazy pages as sentinels, because `ChecksLayout` mounts `PlatformSidebar` from `@put/core-components`. In the federated (`/checks/...`) and standalone (`/...`) trees, `ui-tests/{id}/studio` renders its sentinel behind the STUDIO gate, and `studio` and `studio/{id}` land on module home. The removed-path list grows in stories .2 and .3.

**Gherkin scenarios for this increment** (spec §12.3):

```gherkin
Scenario: Autorun runs once at settle (AC-29)
  Given a READY UI test with steps whose capabilities read answers canManage true
  And the URL ui-tests/{id}/studio?autorun=1
  When the gate's test read, its capabilities read and the editor draft have all completed
  Then exactly one POST /studio/tests/{id}/execute is sent
  And the current history entry no longer carries autorun
  When the page is reloaded
  Then no further execute is sent

Scenario: Activity before settle drops autorun (AC-29)
  Given the URL ui-tests/{id}/studio?autorun=1 and a capabilities read that has not answered
  When the user edits a step before the read completes
  Then nothing is sent when the read later completes

Scenario: Unknown permission defers to the server (AC-29)
  Given a READY UI test with steps whose capabilities read fails
  And POST /studio/tests/{id}/execute answers 403
  When the gate settles
  Then exactly one execute is sent and the forbidden narrative is shown

Scenario: The editor opens the linked test (AC-06)
  Given a UI test that is not in the first page of GET /studio/tests
  When the user opens ui-tests/{id}/studio
  Then the editor shows that test and no other

Scenario: Choosing UI Test sets Development unless one was chosen (AC-30)
  Given Create Check with a stored HTTP draft whose environment is Staging
  When the user selects the UI Test card
  Then the environment shows Development
  Given instead a stored UI Test draft whose environment is Staging and the URL create?type=UI_TEST
  Then the environment shows Staging
```

**Existing tests and E2E touched in this increment** (spec §12.4):

- Delete `UiTestConfig.test.tsx` (1.26).
- Re-mount on a route id (a mount change only): the 12 bare-router `ChecksStudioPage` mount sites in 10 files (`pageAuthoringUx`, `pageEvidence` ×3, `pageGuidedRun`, `pageIncrementalRecording`, `pageReplayAndReferences`, `pageRunGate`, `pageSaveAndStop`, `pageStepTimeout`, `test/pageBootstrapShape`, `studioWcagAudit`) through the shared `renderStudioAt` helper. Their MSW handlers already answer `GET /studio/tests/{id}`. The two test-local route shapes (`pageGuidedRun` L1012-1024 and `studioRunTransport.node` L170-175) are moved onto `ui-tests/:id/studio` by the plan (1.8, 1.9). `components/studio/run/replayFailure.test.tsx` does not mount the page and is not touched. `executionScenarioMatrix` and `executionFixtureMatrix` stay green.
- Update editor-URL assertions: `StudioTestsPage.test.tsx` L228, L273, L422; `StudioRunsPage.test.tsx` L107, L274; `runSnapshots.test.ts` L52-53; `scheduleProvenance.test.tsx` L28; `StudioScheduleDialog.test.tsx` (run-link target passed in, Runs-page hrefs kept). Rewrite "Tests page — create" (`StudioTestsPage.test.tsx` L355-439) and "Create Test" (`StudioRunsPage.test.tsx` L219-228): each page keeps one assertion that "Create Test" (header and empty state) navigates to `/checks/create?type=UI_TEST`, and the name, system and refusal cases move to the Create Check UI Test test. Update the `pageStepTimeout.test.tsx` L128 comment. Drop `UiTestConfig.tsx` from `referencePicker.test.tsx` L610's scan list.
- E2E: `studio-variables.spec.ts` L104, L174, L233-234 and `studio-guided.spec.ts` L185 (editor URL); `studio-authoring-real-backend.spec.ts` rewritten to start from Create Check → UI Test (runs only with `CHECKS_E2E_REAL_BACKEND=1`).

### Technical constraints (spec §2.3)

CON-01 frontend-only, no backend, API, schema or Flyway change. CON-02 `ChecksStudioPage` stays two-panel with an unchanged layout. CON-03 one path: no redirects, aliases or fallbacks. CON-04 ADR-SC-006. CON-05 React 18, strict TypeScript, MUI v5 (5.18.0) with `sx`, React Router v6 (6.30.1), Redux Toolkit 2, MSW 2 in Node, the centralized API client, pnpm only, no v7-only APIs, no new dependency. CON-06 Flow 2 forward-compatibility (type-segmented routes, single path helpers, the Create Check flow). CON-07 separate aggregates: no checks rows for UI tests. CON-09 both `App.tsx` trees carry the same `ui-tests` routes, with a route test per tree. CON-10 Node MSW harnesses; real-backend E2E only with `CHECKS_E2E_REAL_BACKEND=1`. NFR-04: no new or changed line uses a direct `fetch()`; the existing Test Now `fetch` (CreateCheckPage L465) is out of scope.

## Drafting flags and decisions pending

| # | Item | Handling | Changes |
|---|---|---|---|
| F1 | [AUTO-DECISION] ClickUp epic lookup and story task creation (task steps 5.1–5.4) | Not performed (reason: this mission writes exactly four local story files and was given no ClickUp epic or authority to mutate ClickUp; the task's error handling treats a local story as valid) | Nothing in the story |
| F2 | AC-04, AC-08, AC-09, AC-23, AC-26 and AC-27 are split across increments | Only increment 1's clauses are stated, per spec §14 and §14.1; the rest sit in stories .2–.3 | Those ACs |
| F3 | AC-08: spec §14's AC column says "AC-08 (breadcrumb, CSI)" for increment 1, while FR-07 (inc 1) also lists the leave guard, and AC-08's text names only the final back and "Open Tests" targets | The leave-guard clause is kept (AC-08 wording, FR-07 inc 1; task 1.15). The interim targets come from spec §7.3 and §14.1, not from AC-08's text | AC-08 |
| F4 | AC-23: spec §14's AC column says "AC-23 (card, entries)" for increment 1, while FR-24 text, spec §7.1 and plan 1.15 (CRIT-26) also place the editor's outer `'pending'`/`'off'` gate here | The editor gate clauses are kept in AC-23, as AC-23's own last sentence requires | AC-23 |
| F5 | The recorded WCAG reason is worded slightly differently in plan 1.10, plan 1.33 and spec §12.5 | AC-27's wording governs: "mount changed to a route id" and/or "editor framing", with "no surface added". Record whichever applies | AC-27 |
| F6 | Task 1.32 is a manual check (real backend) | With a local backend, run it. Without one, run `pnpm run type-check` and write "not run: no backend" in the Dev Agent Record | None |
| F7 | Spec Metadata and plan `qualityGate` pins lag by one revision (critique-4 CRIT-27) | Housekeeping for @pm and @architect at plan approval. @sm does not edit the spec or the plan | None |
| F8 | The working tree is dirty with changes this story did not make (backend, docs, agent memory) | Preserve all of them. The File List names only files this story touches | None |

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-23 | 0.1.0 | Draft created from the approved spec (Spec Pipeline critique round 4: APPROVED, 4.38), requirements.json and plan revision 4, phase-1. ClickUp sync not performed (F1). | River (@sm) |
| 2026-10-23 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. Tasks match plan revision 4 phase-1 1:1; F3 and F4 placements confirmed; F7 (CRIT-27) does not block. @dev starts only after the user approves the plan (C-1). | Pax (@po) |
| 2026-10-23 | 0.2.0 | Status: Ready → InProgress. User approved plan revision 4 (sha256 f2c9b274…) by instructing "start the stories we wrote a couple hours ago for STUDIO-UNIFY" after selecting AIOX Lean Delivery; executed as Lean work item STUDIO-UNIFY-001.1 (builder: Claude Code main session 651237b1, aiox-dev subagents as contributors). | Claude Code (@dev role) |
| 2026-10-23 | 0.2.1 | User decision: "We dont need WCAG, ignore/remove all accessibility tasks". AC-27 and task 1.10 removed; WCAG parts of 1.1 and 1.33 dropped; `studioWcagAudit.test.tsx` deleted and the axe assertion in `StudioScheduleDialog.test.tsx` removed; `docs/qa/accessibility/` left as history. Supersedes the audit-guard clause of ADR-SC-006 for this epic. | Claude Code (@dev role) |
| 2026-10-23 | 0.3.0 | Status: InProgress → InReview. All remaining tasks done (1.10 removed); File List and Dev Agent Record filled; handed to the independent Lean review. | Claude Code (@dev role) |
| 2026-10-23 | 1.0.0 | Independent Lean review PASS (14/14 criteria, 3 non-blocking findings); Lean acceptance recorded. Status: InReview → Done. | aiox-qa verdict, recorded by Claude Code coordinator |

## PO Validation (2026-10-23)

**Verdict: GO, 9/10. Status Draft → Ready.** Pax (@po), `validate-next-story.md` in YOLO mode with the 10-point checklist of `story-lifecycle.md`. Record: [spec/story-validation.json](spec/story-validation.json). Confidence: high.

**What was checked**
- **Tasks against the plan.** Tasks 1.1–1.33 match plan revision 4, phase-1, one to one. Order, description, files, dependencies, coverage, verification command and plan notes are the same, checked by script with js-yaml. No task is missing and none is extra.
- **AC share.** The 14 ACs are increment 1's share in spec §14. The text is the requirements.json text, except where an AC is split across increments.
- **D7.** Every spec §11 row-1 removal has a task in this story, and its references are repointed in this story. No redirect or fallback is added.
- **Order and scope.** Nothing depends on a later phase. No backend file is touched. There is no accessibility AC or task: the WCAG audit gets only the planned re-mount and baseline record (1.10, 1.33).
- **Verification.** Every task verifies with pnpm from `frontend/`. Task 1.32 is manual and falls back to `pnpm run type-check`.
- **Source check.** I ran the route-scan S1 dry run today: 25 lines (18 + 7), the same count the plan records. Cited lines also hold in the working tree: ChecksStudioPage L494, L495, L1061, L1167, L1194, L1212 and L1936-1940; App.tsx L110-114 and L139-143; StudioScheduleDialog L27-28; CreateCheckPage L130; LayoutProvider L70; ChecksLayout L85-87; DashboardPage L753; CommandPalette L16. Installed versions are MUI 5.18.0 and React Router 6.30.1.

**Flag rulings**
- **F3 (AC-08 leave-guard clause here): correct.** Spec §14 row 1 lists "FR-07 (breadcrumb, CSI, leave guard)", and plan 1.15 keeps the guard. The interim back and "Open Tests" targets come from spec §7.3, §14.1 and plan 1.15 and its linkWalkAtExit.
- **F4 (AC-23 editor-gate clauses here): correct.** The sources are FR-24's text, spec §7.1 "Availability gate", DC-18 and plan 1.15 (CRIT-26). Spec §14 row 1 also lists "FR-24 (card, routes, entries)".
- **F7 (CRIT-27): does not block.** The plan's `qualityGate` pins are already current. They match spec.md `93a67de4…`, requirements.json `ee462841…` and critique-4 `c7a1cf63…`. Only the spec's Metadata, its header Status line and §18 still name critique 2 and plan revision 2. No AC, task or verification depends on those lines. That housekeeping belongs to @pm at plan approval.
- F2, F5, F6 and F8 are accepted as handled.

**Conditions and follow-ups (none blocks)**
- **C-1: Ready does not authorize execution.** The plan still reads `status: pending` and `executionAuthorized: false`. @dev starts 1.1 only after the user approves plan revision 4 (sha256 `f2c9b27401f5…`). If approval changes the plan, @sm re-syncs the affected tasks and @po re-validates them.
- **SF-1 (@sm):** reword F7. The plan pins were refreshed in revision 4; only the spec-side lines lag.

## Dev Agent Record

### Agent Model Used

Coordinator and Lean builder: Claude Code main session (Opus 5.5, session 651237b1-faeb-45bb-9d2b-d4fa4eb9a3e7). Contributors: aiox-dev subagents on Sonnet 5.5, effort high: wave 1b foundations (1.2-1.5), 2a editor test re-mount (1.6-1.9), 2b schedule dialog and Tests/Runs pages (1.14, 1.16-1.20), 2c nav and entry points (1.22-1.24), 2d Create Check (1.25-1.30), 3 editor chain (1.11-1.13, 1.15, 1.21, 1.31, 1.32). Run under AIOX Lean Delivery (work item STUDIO-UNIFY-001.1; state outside the repo under ~/.aiox-lean/put-checks-ui-studio/).

### Debug Log References

Lean work record and check logs: ~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.1/ (binding.json, contract.json, logs/). Wave plan: ~/.aiox-lean/put-checks-ui-studio/WAVES.md.

### Completion Notes

- User decisions applied mid-run (2026-10-23): plan revision 4 approved by "start the stories…"; "We dont need WCAG, ignore/remove all accessibility tasks" removed AC-27, task 1.10 and the WCAG parts of 1.1 and 1.33; `studioWcagAudit.test.tsx` deleted and the axe test in `StudioScheduleDialog.test.tsx` removed; `docs/qa/accessibility/` untouched (history).
- 1.1: bundle baseline only (`implementation/baseline.json`; build exit 0).
- 1.28: the UI_TEST card label is now "UI Test (Checks Studio)" (spec §6, AC-01).
- 1.15: the breadcrumb "All Checks" link also goes through the leave guard when the draft is dirty; CSI chip reads `CSI {id}` (no name lookup in the editor).
- 1.11: selection is atomic: nothing is selected until `GET /studio/tests/{id}` answers; the list read is best-effort for the header merge. `studioRunTransport.node.test` SCEN-1 was rewritten because it asserted the removed fallback (contradicted AC-06); `pageEvidence` "No run history" now mounts on the id it serves.
- 1.31: `studio-guided.spec.ts` passes (msw, 8/8). `studio-variables.spec.ts` URL strings are updated but it was not run: it is guarded to Node v24.20.0 plus `CHECKS_VARIABLES354_EXECUTION=authorized` and a notice SHA (host has Node v23.10.0).
- 1.32: not run: no backend. `pnpm run type-check` and `tsc -p e2e/tsconfig.json` pass.
- CodeRabbit: not run (no CLI, no WSL on this macOS host); the independent Lean review is the documented manual fallback.
- Pre-existing, out of scope: `src/components/providers/realStudioStartup.test.ts` fails on the uncommitted `dev.sh` (excluded from the bound check); `SecretInput`/`StudioRunsPage` timing tests are load-sensitive (pass in isolation; checks capped at 4 workers).
- A separate session committed and pushed in-progress snapshots of this story's files at 21:05-21:09 (fd6586b03 and neighbours); this run made no commit.

### File List

Created: `frontend/src/components/studio/uiTestPaths.ts`, `uiTestPaths.test.ts`; `frontend/src/hooks/useUiTestAvailability.ts`, `useUiTestAvailability.test.tsx`; `frontend/src/components/studio/tests/newTestRequest.ts`, `newTestRequest.test.ts`; `frontend/src/test/renderStudioAt.tsx`; `frontend/src/pages/ChecksStudioPage/pageLoadById.test.tsx`, `pageAutorun.test.tsx`, `pageFraming.test.tsx`; `frontend/src/App.routes.test.tsx`; `frontend/src/utils/navigation/navigationSetup.test.ts`; `frontend/src/components/home/entryPoints.test.tsx`; `frontend/src/components/checks/wizard/UiTestCreateForm.tsx`; `frontend/src/pages/CreateCheckPage/CreateCheckPage.uiTest.test.tsx`; `docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/implementation/baseline.json`.

Modified: `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `pageRunGate.test.tsx`, `pageEvidence.test.tsx`, `pageStepTimeout.test.tsx`, `pageAuthoringUx.test.tsx`, `pageSaveAndStop.test.tsx`, `pageReplayAndReferences.test.tsx`, `pageIncrementalRecording.test.tsx`, `pageGuidedRun.test.tsx`, `studioRunTransport.node.test.tsx`; `frontend/src/test/pageBootstrapShape.test.tsx`; `frontend/src/components/studio/run/useRunGate.ts`, `RunControl.tsx`, `runGate.test.tsx`; `frontend/src/App.tsx`; `frontend/src/components/studio/scheduling/StudioScheduleDialog.tsx`, `StudioScheduleDialog.test.tsx`, `scheduleProvenance.test.tsx`; `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`, `StudioTestsPage.test.tsx`; `frontend/src/components/studio/tests/testListPresentation.ts`, `TestRow.tsx`; `frontend/src/pages/StudioRunsPage/StudioRunsPage.tsx`, `StudioRunsPage.test.tsx`; `frontend/src/components/studio/runs/runLinks.ts`, `runSnapshots.test.ts`; `frontend/src/components/layout/ChecksLayout/ChecksLayout.tsx`, `LayoutProvider/LayoutProvider.tsx`; `frontend/src/utils/navigation/navigationSetup.ts`; `frontend/src/components/home/CommandPalette.tsx`; `frontend/src/pages/DashboardPage/DashboardPage.tsx`; `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx`; `frontend/src/components/checks/wizard/ReviewStep.tsx`, `CheckTypeSelector.tsx`, `configs/index.ts`; `frontend/src/types/checks/checkTypes.ts`; `frontend/src/components/studio/references/referencePicker.test.tsx`; `frontend/e2e/studio-variables.spec.ts`, `studio-guided.spec.ts`, `studio-authoring-real-backend.spec.ts`; `.claude/rules/accessibility-scope.md`; this story file.

Deleted: `frontend/src/components/studio/tests/CreateTestDialog.tsx`; `frontend/src/utils/constants/navigationConfig.ts`; `frontend/src/components/checks/wizard/configs/UiTestConfig.tsx`, `UiTestConfig.test.tsx`; `frontend/src/test/a11y/studioWcagAudit.test.tsx`.

## QA Results

**Verdict: PASS** (independent AIOX Lean review, 2026-10-23). Reviewer: aiox-qa subagent (Sonnet 5.5, effort high; execution 651237b1:a04dfdbb15df75029), fresh context, read-only, independent of all authors. Candidate `473fdac7e53e7bfd1b8afe2323b3d8f19e66c6487d25a08b264b7fde8d0e5c1b`; Lean acceptance recorded (engineering acceptance only; not merge or release). Full payload: `~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.1/review-1.json`.

- All 14 criteria PASS: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-23, AC-26, AC-29, AC-30, DOD (AC-27 removed by user decision).
- Bound checks on the same candidate: type-check; lint 0 errors; Vitest editor 178/178, components 740/740 (pre-existing `realStudioStartup.test.ts` excluded), pages/routes/hooks/mocks 403/403; route scan S1 exit 0; Playwright msw `studio-guided` 8/8. Reviewer independently re-ran 8 files / 117 tests (pass) and S1.
- Not run: `studio-variables.spec.ts` (Node v24.20.0 + authorization guard), real-backend E2E (no backend), CodeRabbit (unavailable on host).
- Non-blocking findings: (1) small visual edits in `ChecksStudioPage.tsx` (save chip transition, Environment label shrink, Snackbar anchor, "No logs are available.") are not in this story's File List; they first appear in the other session's snapshot commit fd6586b03 and may predate this story. (2) Schedule-dialog run links hard-code the `/checks` base (as the plan prescribes); a standalone `/*` mount would fall to home. (3) `autorun` is read only at editor mount; an in-app navigation to another test's `?autorun=1` while the editor stays mounted would neither run nor strip it (no increment-1 link does this; relevant to story .2's "Run in Studio").
