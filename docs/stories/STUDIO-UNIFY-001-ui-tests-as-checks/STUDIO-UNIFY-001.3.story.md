# Story STUDIO-UNIFY-001.3 — All Checks lists UI tests; Tests page and Studio nav group removed

| Field | Value |
|---|---|
| Story ID | STUDIO-UNIFY-001.3 |
| Status | **Ready** |
| Epic | STUDIO-UNIFY-001-ui-tests-as-checks — UI tests as checks (Flow 1, frontend-only), increment 3 of 4 |
| Depends on | STUDIO-UNIFY-001.2 |
| Dependency notes | Needs story .2 Done. This story reuses what .1 and .2 deliver: `uiTestPaths.ts` (1.2), `useUiTestAvailability` (1.3), the `runHref` prop on `StudioScheduleDialog` (1.14), the Dashboard and palette entries (1.24), the shared status mapping `uiTestStatus.ts` (2.2) and the route test (1.21, 2.9). The plan's phase-3 subtasks depend on 1.2, 1.3, 1.14, 1.24, 2.2 and 2.10. Story .4 follows. |
| Source | [Spec](spec/spec.md) §1.3 (D6, D7), §1.4 (DC-06–DC-10, DC-12, DC-14, DC-16, DC-18, DC-22, DC-23), §5, §9, §10, §11 row 3, §12, §14 row 3, §14.1; [Requirements](spec/requirements.json); [Plan](plan/implementation.yaml) revision 4, phase-3 (subtasks 3.1–3.20); [Research](spec/research.json) (RF-08, RF-09); [Critique 4](spec/critique-4.json) (APPROVED, 4.38) |
| Size | M (spec §14). 20 plan subtasks. |
| Drafted by | River (@sm), 2026-10-23, from the approved spec, requirements and plan |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["Vitest-RTL-MSW", "Playwright-MSW-project", "type-check", "lint", "WCAG-audit-regression-guard", "removed-route-scan-S3", "CodeRabbit-or-documented-manual-fallback"]

Third of four stories, one per increment of `STUDIO-UNIFY-001-ui-tests-as-checks`. It merges UI tests into All Checks, and in the same story removes the Tests page, the Studio sidebar group and the components only they used (user decision D7). No code starts before @po moves this story to Ready and story .2 is Done.

## Story

**As a** Checks user,
**I want** UI tests listed in All Checks next to my regular checks, with a truthful status, working filters, safe bulk behaviour, and clear failure, cap and empty states,
**so that** I find, open, schedule and run UI tests from the same place as regular checks, without a separate Studio navigation group or a Tests page.

## Context

UI tests become rows in All Checks (spec §9). The page keeps loading checks as today and adds one Studio list request, only when availability is `'on'`. Rows are merged, deduplicated and ordered client-side. UI test rows open the detail page from story .2, run through the editor's gate, and cannot be bulk-selected. Then the old Studio entry points are removed: `studio/tests`, the Tests page, the sidebar Studio group, `useStudioTests`, `TestRow`, `TestRowMenu`, `StudioListLayout` (with `SortableHeaderCell`), `useUrlListState` and `LAST_RUN_FILTER_LABELS`. The editor's "Open Tests", the Dashboard quick action and the command palette entry now go to `/checks/all?type=UI_TEST`.

After this story no `/checks/studio` route or helper remains in the codebase. Story .4 only updates the docs and sweeps for leftovers.

**Requirements covered (spec §14):** FR-07 (Open Tests); FR-08 (inc 3 targets); FR-14–FR-24; FR-27 (inc 3); FR-28 (surface 1).

**Binding user decisions that apply (spec §1.3):** D1 (frontend-only; Studio's own scheduler owns UI test schedules); D6 (Flow 2, the backend link, must be able to land later without changing these routes or screens: kind is derived from the type, the id dedupe lets the UI test win); D7 ("UI studio is a new feature thats not even in dev yet, this is brand new, no old routes or data should be kept, just update the references if is the case."). Standing rules: one path, no redirects; functional-only accessibility (ADR-SC-006); pnpm only; MUI with `sx`; all HTTP through the centralized API client.

## Scope

**In:** the pure catalog-row union; the availability-gated UI test catalog hook; the UI test catalog row and its actions; the merged table, filters, status mapping, `?type` preselect, bulk and tag rules; the cap notice, failure notice and empty state; "Open Tests", Dashboard and palette retargeting; the increment-3 removals; WCAG surface 1 dropped; the harness E2E moved to All Checks.

**Out (other stories or spec §16.1):** the D5 docs (.4); a server union or a server-side readiness filter; tags, direct or bulk execute, acknowledge or assign for UI tests; raising the CSI store's 20-CSI page; any backend, API, schema or Flyway change; Flow 2; any accessibility work.

## Routes (spec §5)

| Path | Screen | Notes |
|---|---|---|
| `all?type=UI_TEST` | All Checks, Type = UI Test | Added here; follows availability (DC-18) |
| `studio/tests` | **Removed here** | No redirect; the catch-all sends to module home (PC-07) |

## Acceptance Criteria

AC text is copied from [requirements.json](spec/requirements.json). Where the spec splits an AC across increments (§14), only this increment's part is stated. The bracketed tag after each id gives its source.

- **AC-04 (increment 3 part: All Checks)** *[FR-22; DC-06, DC-18; spec §9.4, §14]* Given the URL all?type=UI_TEST, when the page opens, then the All Checks Type filter shows UI Test, even when stored catalog preferences hold another type. Afterwards the stored catalog preferences hold UI Test. *(The `create?type=UI_TEST` clause was delivered in STUDIO-UNIFY-001.1.)*
- **AC-08 (increment 3 part: Open Tests)** *[FR-07; spec §7.3, §14.1]* Given the editor is open on a test, then the 'Open Tests' action targets all?type=UI_TEST. *(FR-07 places the action in the editor's no-test state.)*
- **AC-09 (increment 3 part)** *[FR-08; DC-23; spec §14.1]* Given the built frontend, when its source and the rendered nav, command palette, dashboard, schedule dialog and run links are inspected, then none target a removed studio route; the Dashboard 'Open Checks Studio' quick action and the command palette 'Studio' entry open /checks/all?type=UI_TEST; at the increment 3 boundary no in-app link targets a route deleted so far; and on ui-tests paths the layout treats the page as part of the Checks area.
- **AC-14 (increment 3 part: All Checks)** *[FR-13; NFR-05; DC-14; spec §9.5; see flag F3]* Given an All Checks UI test row, when Execute is used, then the app navigates to ui-tests/{id}/studio?autorun=1, no execute request is sent from All Checks, and the run starts only if the editor's run gate admits it. *(The detail-page half was delivered in STUDIO-UNIFY-001.2.)*
- **AC-15** *[FR-14, FR-15; NFR-01; DC-07, DC-16; spec §9.1, §9.2]* Given flags on and both lists returning data, when All Checks loads, then check rows and UI test rows render in one table; UI test rows show the CSI name from the CSI store, or the CSI id when the store has no entry for it; each UI test row shows its name linking to ui-tests/{id}, 'UI Test' in Type, the FR-16 chip in Status and lastRunAt (or 'Never') in Last Execution; GET /studio/tests is sent with the global csiId and environment, the search text as q, sort=updatedAt,desc and size=100; rows are ordered by createdAt descending, with id as the tie-break; a request superseded by a newer search is cancelled; and a check and a UI test with the same id render as one UI test row.
- **AC-16** *[FR-16; DC-08; spec §9.3]* Given UI tests in each state (UNLEARNED, LEARNING, NEEDS_RELEARN, and READY with PASSED, FAILED, ERROR or no run), when All Checks renders them, then the chips read Not learned, Learning, Needs re-learn, Passing, Failing, Error and Not run. The Warning status filter includes the Error test and no readiness-state test, the Pending filter includes the Not run test and no readiness-state test, and each new readiness filter value selects exactly the tests in that readiness.
- **AC-17** *[FR-17; EC-11; spec §9.5]* Given All Checks showing check rows and UI test rows, when the user uses row checkboxes or select-all, then UI test checkboxes are disabled and the bulk selection contains only check ids.
- **AC-18** *[FR-18; spec §9.4]* Given a global or page tag filter is active, when All Checks renders, then no UI test rows are shown; when the tag filter is cleared, they reappear.
- **AC-19** *[FR-19; spec §9.5]* Given a UI test row, then Execute shows the tooltip 'Run in Studio' and behaves as AC-14, and the row menu offers Open (→ ui-tests/{id}), Edit in Studio (→ ui-tests/{id}/studio), Schedule (existing Studio dialog) and Delete (existing confirmation).
- **AC-20** *[FR-20; NFR-07; spec §9.6]* Given GET /studio/tests reports totalElements 150, when All Checks renders, then 'Showing 100 of 150 UI tests — narrow by system or search' is shown; with totalElements of 100 or fewer, no notice is shown.
- **AC-21** *[FR-21; NFR-06; spec §9.6]* Given GET /studio/tests fails and GET /checks succeeds, when All Checks loads, then check rows render and 'UI tests could not be loaded · Retry' shows inline; Retry sends GET /studio/tests again and on success UI test rows appear.
- **AC-22** *[FR-23; spec §9.6]* Given no UI tests exist and Type = UI Test, when All Checks renders, then 'No UI tests yet' and 'Create UI test' are shown, and 'Create UI test' opens create?type=UI_TEST.
- **AC-23 (increment 3 part: All Checks)** *[FR-24; DC-12, DC-18; spec §9.1, §9.4, §10]* Given the STUDIO feature is off, or the UI_TEST source is disabled, then no GET /studio/tests is sent, no UI test rows render, and the All Checks Type filter has no 'UI Test' option. all?type=UI_TEST, or stored preferences holding UI_TEST, show All Types and leave no UI_TEST in the stored preferences. Given sources and features have not been fetched yet ('pending'), then no GET /studio/tests is sent and a UI_TEST type from the URL or stored preferences is neither applied nor written. When sources then arrive with UI_TEST disabled, that type is dropped and never written. Given an empty sources list with the STUDIO feature on, UI tests behave as enabled. *(The card, editor and entry clauses were delivered in STUDIO-UNIFY-001.1 and the detail-route clause in .2.)*
- **AC-26 (increment 3 part)** *[FR-27; D7; DC-22; spec §11 row 3]* Given the end of increment 3, then studio/tests lands on module home too; the Tests page, the sidebar Studio group, useStudioTests, TestRow, TestRowMenu, StudioListLayout, useUrlListState and LAST_RUN_FILTER_LABELS are gone. There is never a redirect to a ui-tests route.
- **AC-27 (increment 3 part)** *[FR-28; CON-04; spec §12.5]* Given the Studio WCAG audit, when it runs at the end of increment 3, then it passes. After increment 3, surface 1 is gone. Any baseline move is regenerated, with its reason recorded in that increment ('surfaces deleted'). If a change breaks the audit, the regression is fixed instead (accessibility-scope rule). No surface is added for the new pages, and the ChecksLayout a11y test passes with its entry path updated in increment 3.

### Traceability: AC to plan subtasks

| AC | Plan subtasks (from the plan's `coverage` lists) |
|---|---|
| AC-04 | 3.5, 3.9 |
| AC-08 | 3.7 |
| AC-09 | 3.8, 3.20 |
| AC-14 | 3.3, 3.9 |
| AC-15 | 3.1, 3.2, 3.3, 3.4, 3.9 |
| AC-16 | 3.1, 3.5, 3.9 |
| AC-17 | 3.3, 3.4, 3.9 |
| AC-18 | 3.1, 3.5, 3.9 |
| AC-19 | 3.3, 3.9 |
| AC-20 | 3.2, 3.6, 3.9 |
| AC-21 | 3.2, 3.6, 3.9 |
| AC-22 | 3.6, 3.9 |
| AC-23 | 3.2, 3.5, 3.8, 3.9 |
| AC-26 | 3.10, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 3.20 |
| AC-27 | 3.11, 3.18, 3.20 |

## Removals (D7, spec §11 row 3)

| Removed | Task | Its references, repointed in this story |
|---|---|---|
| Route `studio/tests`, both trees; the lazy `StudioTestsPage` import | 3.10 | `studio/tests` lands on module home. |
| `StudioTestsPage`, its barrel and its test | 3.11 (WCAG surface first), 3.13 | All Checks replaces it. |
| `useStudioTests`, `TestRow`, `TestRowMenu` | 3.14 | The dialog test drops its `TestRow` import and `RowFlow` (3.12). |
| `StudioListLayout` with `SortableHeaderCell`, and its test | 3.15 | None. `studioListSx.ts` stays, because `RunRow` imports `hideBelowMd`. |
| `hooks/useUrlListState.ts` and its test; `LAST_RUN_FILTER_LABELS` | 3.16 | The All Checks debounce uses its own 300 ms constant and must not import this hook. |
| The sidebar Studio group and its page-id mapping (`navigationSetup` L19-33 and L74; the bare-`studio` line L75 went in story .1); ChecksLayout's `studio/tests` clause (L86) | 3.17 | Sidebar has no Studio group; `ui-tests` paths highlight Checks. |
| LayoutProvider's `/checks/studio` mapping (L70) | 3.18 | The `ChecksLayout.a11y.test.tsx` entry path moves to `/checks/all` (L45). |

**These stay** (spec §11): `READINESS` (used by `readinessFor` and the contract test); `copyText` (the drawer's copy-link); `createErrorMessage` and the shared constants `STUDIO_TEST_ENVIRONMENTS` and `TEST_NAME_MAX_LENGTH`; `studioListSx.ts`; `DeleteTestDialog`, `newTestRequest.ts`, `uiTestStatus.ts` and the remaining `testListPresentation` exports (plan 3.14).

Retargeted in this story without a removal: the editor's "Open Tests" (3.7), the Dashboard quick action and the command palette entry (3.8).

## Link walk and route-scan gate (spec §14.1, plan linkWalkAtExit)

Only routes that exist at this boundary are targets: `studio/tests` and `studio/runs/*` are both gone, and `ui-tests/*`, `all` and `create` exist.

| Link source | Target after increment 3 |
|---|---|
| Editor in-page back | `ui-tests/{id}` |
| Editor "Open Tests" | `/checks/all?type=UI_TEST` |
| Editor breadcrumb "All Checks" | `/checks/all` |
| Schedule dialog "Inspect run" / "View run" (hosts: editor, detail page, All Checks row) | `ui-tests/{testId}/runs/{executionId}` |
| Tests page row, and "Create Test" on the Tests page | removed |
| Runs tab drawer `testHref` | `ui-tests/{testId}/studio` |
| Detail page Delete | `/checks/all` |
| Dashboard "Open Checks Studio" and command palette "Studio" (only when `'on'`) | `/checks/all?type=UI_TEST` |
| Sidebar | No Studio group; `ui-tests` paths highlight Checks |
| Create Check UI Test → editor | `ui-tests/{newId}/studio` |
| All Checks UI test rows | detail page `ui-tests/{id}`; Edit in Studio `ui-tests/{id}/studio`; Execute `ui-tests/{id}/studio?autorun=1` |
| All Checks row Schedule / Delete / empty state | ui-tests run links in the dialog / list refresh / `/checks/create?type=UI_TEST` |
| `studio/tests` | Catch-all, module home. No `/checks/studio` target remains |

**Route-scan S3** (task 3.20, plan `verificationConventions.removedRouteScans.S3`). It exits 0 only when no `/checks/studio` reference of any kind, no `studio/runs` literal, no test-local old route shape and no `path="studio..."` remains. It matches route strings only, never import paths (CRIT-19). Run it from `frontend/`:

```bash
! (grep -rn "/checks/studio" src e2e | grep -v "citi/put/checks/studio") \
  && ! grep -rnE "path=\"studio|[}'\"\`]/studio/runs|['\"\`]/studio/tests/:id|path: '/studio'" src e2e
```

## WCAG baseline (guard only, ADR-SC-006)

This story drops WCAG **surface 1** (`StudioTestsPage`) and its pin from `studioWcagAudit.test.tsx`: remove the L26 import, the L96 pin and L289-297, set the describe title to "five", and update the header comments that name `StudioTestsPage` (around L86-90), because task 3.13 asserts that no source mentions it (task 3.11). In `docs/qa/accessibility/studio-wcag-audit.md`, drop the surface 1 rows (L62, L74, L86 and the `StudioTestsPage` mentions at L14, L103, L145) and add a dated entry: "surfaces deleted (StudioTestsPage, increment 3); no surface added". The record belongs in **this** story. Task 3.18 updates `ChecksLayout.a11y.test.tsx` L45 to `/checks/all` (entry path only). Do not add All Checks or any new page to the audit, and do not extend it. The gate (3.20) checks `git diff --exit-code` on `axe-results.json` against the baseline committed in 3.11.

## CodeRabbit Integration

**Story Type Analysis**
- Primary type: Frontend (list merge, filters, row actions).
- Secondary types: removal and test migration; navigation; performance of a 100-row request.
- Complexity: M (spec §14).

**Specialized Agent Assignment**
- Primary: @dev (implementation and pre-commit review), @qa (gate).
- Supporting: @ux-design-expert on request, for layout or interaction questions only (no accessibility review, ADR-SC-006); @devops only for a later, separately authorised push or PR. @dev does not push.

**Quality Gate Tasks**
- [ ] Pre-Commit (@dev): run the configured CodeRabbit review before marking the story complete. The CLI is WSL-based; if it is unavailable, record that it was not run, apply the configured graceful degradation, and do an independent manual diff review. Never claim a run that did not happen.
- [ ] Independent review (@qa): implementation evidence, request counts (zero Studio requests unless `'on'`; one per settled change; superseded requests cancelled), bulk behaviour, the link walk, route scan S3, and the WCAG guard record.
- [ ] Pre-PR (@devops): only if a PR is later authorised. No PR is implied here.

**Self-Healing Configuration** (`.claude/rules/coderabbit-integration.md`)
- @dev phase: light mode, max 2 iterations, 30 min, CRITICAL and HIGH only. CRITICAL is auto-fixed; HIGH is auto-fixed while the iteration count is below 2 and otherwise documented as debt; MEDIUM is documented as debt; LOW is ignored.
- @qa phase: full mode, max 3 iterations, 30 min.

**Focus Areas**
- Primary: no Studio request unless availability is `'on'`; no UI test id ever reaches a bulk action; no UI test row can start a run except through the editor's gate; each source fails on its own (a Studio list failure keeps the check rows); no `/checks/studio` target survives.
- Secondary: request cancellation and debounce; centralized API client only; strict TypeScript; MUI v5 `sx`; React Router v6 APIs only; responsive layout kept.
- Not a focus area: accessibility (ADR-SC-006).

## Definition of Done

- All 20 task checkboxes are ticked and each task's verification passes.
- At the end of the story `pnpm run type-check`, `pnpm run lint`, the narrow Vitest suites and the touched Playwright specs (`--project=msw`) pass.
- The link walk table above holds, and route scan S3 exits 0: no `/checks/studio` reference of any kind remains.
- The Studio WCAG audit passes with surface 1 gone, and the reason "surfaces deleted" is recorded in `studio-wcag-audit.md` in this story. No surface was added.
- The 15 acceptance criteria hold. No Studio request is sent unless availability is `'on'`. No accessibility work, backend or Flyway change, new dependency, redirect or fallback was added. pnpm only.
- The File List and Dev Agent Record are filled in by @dev. Status moves follow `story-lifecycle.md` (@dev: InProgress, then InReview; @qa: Done).

## Tasks / Subtasks

The 20 tasks below map 1:1 to plan subtasks 3.1–3.20 (`plan/implementation.yaml`, phase-3). Run them **in the listed order**: several touch `AllChecksPage.tsx`, each for a distinct concern after the one before it. Run every command from `frontend/`. Use **pnpm only**. Re-read the cited lines before editing: they were verified on 2026-10-23 and may have drifted (ASM-06, R11). The "Plan notes" under each task are copied from the plan and are part of the task. Tick a box only when its verification command passes.

- [ ] **3.1** Build the pure catalog-row union (kind, dedupe with UI test winning, createdAt/id order, status, filters, tag hiding, CSI fallback)
  - Service: frontend. Covers: FR-14, FR-16, FR-18, AC-15, AC-16, AC-18, DC-07, DC-08, DC-16.
  - Files: `frontend/src/pages/AllChecksPage/catalogRows.ts`, `frontend/src/pages/AllChecksPage/catalogRows.test.ts`
  - Depends on: 2.2
  - Verify (from `frontend/`): `pnpm exec vitest run src/pages/AllChecksPage/catalogRows.test.ts`
  - Plan notes:
    kind is derived from the type (the Flow 2 seam). Order is createdAt descending, then id. An active tag filter hides uiTest rows.

- [ ] **3.2** Add the UI test catalog hook (availability-gated GET /studio/tests with server filters, debounce, cancellation, error, retry, total)
  - Service: frontend. Covers: FR-15, FR-20, FR-21, NFR-01, NFR-07, AC-15, AC-20, AC-21, AC-23.
  - Files: `frontend/src/pages/AllChecksPage/useUiTestCatalog.ts`, `frontend/src/pages/AllChecksPage/useUiTestCatalog.test.tsx`
  - Depends on: 1.3
  - Verify (from `frontend/`): `pnpm exec vitest run src/pages/AllChecksPage/useUiTestCatalog.test.tsx`
  - Plan notes:
    The request is listTests({csiId, environment, q, sort:'updatedAt,desc', size:100}, {signal}). A
    superseded request is aborted. Nothing is sent while 'pending' or 'off'. The hook returns
    {tests, totalElements, loading, error, retry}.

- [ ] **3.3** Add the UI test catalog row (cells per §9.2, disabled checkbox, Execute and row menu with Schedule and Delete)
  - Service: frontend. Covers: FR-13, FR-14, FR-17, FR-19, NFR-05, AC-14, AC-15, AC-17, AC-19.
  - Files: `frontend/src/pages/AllChecksPage/UiTestCatalogRow.tsx`
  - Depends on: 3.1, 1.2, 1.14
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/pages/AllChecksPage/UiTestCatalogRow.tsx`
  - Plan notes:
    - Execute (tooltip "Run in Studio") goes to the autorun editor path.
    - The menu offers Open, Edit in Studio, Schedule (runHref = uiTestRunPath) and Delete
      (DeleteTestDialog, then refresh).

- [ ] **3.4** Wire the merged rows into AllChecksPage (data, rendering, bulk and select-all restricted to check ids)
  - Service: frontend. Covers: FR-14, FR-17, AC-15, AC-17.
  - Files: `frontend/src/pages/AllChecksPage/AllChecksPage.tsx`
  - Depends on: 3.1, 3.2, 3.3
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/pages/AllChecksPage/AllChecksPage.tsx`
  - Plan notes:
    Filters (L138-191) and paging (L194-198) run over CatalogRow. Select-all (L200-209) and toggleRow take only check ids. L104 is unchanged.

- [ ] **3.5** Extend AllChecksPage filters (readiness values, UI Test type option, ?type preselect, derived switch-off, prefs persistence)
  - Service: frontend. Covers: FR-16, FR-18, FR-22, FR-24, AC-04, AC-16, AC-18, AC-23.
  - Files: `frontend/src/pages/AllChecksPage/AllChecksPage.tsx`
  - Depends on: 3.4
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/pages/AllChecksPage/AllChecksPage.tsx`
  - Plan notes:
    - Status options (L409-413) gain the readiness values.
    - The UI_TEST type option (L432) shows only when 'on'.
    - ?type beats the restored prefs when 'on'.
    - Effective type = 'on' ? raw : (raw === 'UI_TEST' ? '' : raw).
    - The prefs save (L132-138) is skipped while 'pending' and writes the effective value otherwise.

- [ ] **3.6** Add the cap notice, the failure-with-Retry notice and the 'No UI tests yet' empty state
  - Service: frontend. Covers: FR-20, FR-21, FR-23, NFR-06, AC-20, AC-21, AC-22.
  - Files: `frontend/src/pages/AllChecksPage/UiTestCatalogNotices.tsx`, `frontend/src/pages/AllChecksPage/AllChecksPage.tsx`
  - Depends on: 3.5
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/pages/AllChecksPage`

- [ ] **3.7** Retarget the editor's 'Open Tests' (no-test state) to /checks/all?type=UI_TEST
  - Service: frontend. Covers: FR-07, AC-08.
  - Files: `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `frontend/src/pages/ChecksStudioPage/pageFraming.test.tsx`
  - Depends on: 3.5
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage/pageFraming.test.tsx src/pages/ChecksStudioPage/pageLoadById.test.tsx
    ```
  - Plan notes:
    L1194.

- [ ] **3.8** Retarget the Dashboard quick action and command palette entry to /checks/all?type=UI_TEST (still gated)
  - Service: frontend. Covers: FR-08, FR-24, AC-09, AC-23, DC-23.
  - Files: `frontend/src/components/home/CommandPalette.tsx`, `frontend/src/pages/DashboardPage/DashboardPage.tsx`, `frontend/src/components/home/entryPoints.test.tsx`
  - Depends on: 3.5, 1.24
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/home/entryPoints.test.tsx`

- [ ] **3.9** Add All Checks page tests (mixed rows, params, order, cancel, chips and filters, bulk, tags, actions, cap, failure, empty, switch-off incl. late sources, preselect)
  - Service: frontend. Covers: AC-04, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23.
  - Files: `frontend/src/pages/AllChecksPage/AllChecksPage.test.tsx`
  - Depends on: 3.6
  - Verify (from `frontend/`): `pnpm exec vitest run src/pages/AllChecksPage`
  - Plan notes:
    Serve GET /checks inline, since no MSW handler exists for it. The cases include sources resolving
    disabled after the first render: zero Studio requests, and no UI_TEST written.

- [ ] **3.10** Remove studio/tests from both trees and extend the route test
  - Service: frontend. Covers: FR-27, CON-09, AC-26.
  - Files: `frontend/src/App.tsx`, `frontend/src/App.routes.test.tsx`
  - Depends on: 3.7, 3.8, 2.10
  - Verify (from `frontend/`): `pnpm exec vitest run src/App.routes.test.tsx && pnpm run type-check`
  - Plan notes:
    Remove L111 and L140 and the lazy StudioTestsPage import (L23). studio/tests then lands on module home.

- [ ] **3.11** Drop WCAG surface 1 (StudioTestsPage) and its pin, regenerate the baseline and record 'surfaces deleted'
  - Service: frontend. Covers: FR-28, CON-04, AC-27.
  - Files: `frontend/src/test/a11y/studioWcagAudit.test.tsx`, `docs/qa/accessibility/axe-results.json`, `docs/qa/accessibility/studio-wcag-audit.md`
  - Depends on: 3.10
  - Verify (from `frontend/`): `pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx && git diff --stat -- ../docs/qa/accessibility/`
  - Plan notes:
    Remove the L26 import, the L96 pin and L289-297, and set the describe title to "five". Also update the
    header comments that name StudioTestsPage (around L86-90), because 3.13 asserts that no source
    mentions it. In
    studio-wcag-audit.md, drop the surface 1 rows (L62, L74, L86 and the StudioTestsPage mentions at
    L14, L103, L145) and add a dated entry: "surfaces deleted (StudioTestsPage, increment 3); no surface
    added".

- [ ] **3.12** Remove the TestRow-based case and the Tests-page entries from the schedule dialog test
  - Service: frontend. Covers: FR-27, CRIT-17.
  - Files: `frontend/src/components/studio/scheduling/StudioScheduleDialog.test.tsx`
  - Depends on: 3.10
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/scheduling/StudioScheduleDialog.test.tsx`
  - Plan notes:
    Remove L17 and L53-56; the entries at L27 and L233 move off /studio/tests.

- [ ] **3.13** Delete the Studio Tests page, its barrel and its test
  - Service: frontend. Covers: FR-27, AC-26.
  - Files: `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`, `frontend/src/pages/StudioTestsPage/index.ts`, `frontend/src/pages/StudioTestsPage/StudioTestsPage.test.tsx`
  - Depends on: 3.10, 3.11
  - Verify (from `frontend/`): `pnpm run type-check && ! grep -rn "StudioTestsPage" src`

- [ ] **3.14** Delete the Tests-page-only helpers useStudioTests, TestRow and TestRowMenu
  - Service: frontend. Covers: FR-27, AC-26.
  - Files: `frontend/src/components/studio/tests/useStudioTests.ts`, `frontend/src/components/studio/tests/TestRow.tsx`, `frontend/src/components/studio/tests/TestRowMenu.tsx`
  - Depends on: 3.12, 3.13
  - Verify (from `frontend/`): `pnpm run type-check && ! grep -rnE "useStudioTests|TestRowMenu|from '.*/TestRow'" src`
  - Plan notes:
    DeleteTestDialog, newTestRequest, uiTestStatus and testListPresentation (READINESS, readinessFor, STUDIO_TEST_ENVIRONMENTS, TEST_NAME_MAX_LENGTH) stay.

- [ ] **3.15** Delete StudioListLayout (with SortableHeaderCell) and its test, keeping studioListSx
  - Service: frontend. Covers: FR-27, DC-10, AC-26.
  - Files: `frontend/src/components/studio/list/StudioListLayout.tsx`, `frontend/src/components/studio/list/StudioListLayout.test.tsx`
  - Depends on: 3.13
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec vitest run src/components/studio/runs`
  - Plan notes:
    studioListSx.ts stays, because RunRow imports hideBelowMd.

- [ ] **3.16** Delete the list-URL hook and LAST_RUN_FILTER_LABELS that only the deleted Tests page used (G4)
  - Service: frontend. Covers: FR-27, AC-26.
  - Files: `frontend/src/hooks/useUrlListState.ts`, `frontend/src/hooks/useUrlListState.test.tsx`, `frontend/src/components/studio/tests/testListPresentation.ts`
  - Depends on: 3.14, 3.15, 3.2
  - Verify (from `frontend/`): `pnpm run type-check && ! grep -rnE "useUrlListState|LAST_RUN_FILTER_LABELS" src`
  - Plan notes:
    The All Checks debounce (3.2) must not import this hook. It uses its own 300 ms constant.

- [ ] **3.17** Remove the sidebar Studio group, its page-id mapping and ChecksLayout's tests clause
  - Service: frontend. Covers: FR-27, NFR-08, AC-26.
  - Files: `frontend/src/utils/navigation/navigationSetup.ts`, `frontend/src/utils/navigation/navigationSetup.test.ts`, `frontend/src/components/layout/ChecksLayout/ChecksLayout.tsx`
  - Depends on: 3.10
  - Verify (from `frontend/`): `pnpm exec vitest run src/utils/navigation/navigationSetup.test.ts && pnpm run type-check`
  - Plan notes:
    navigationSetup L19-33 and L74 (the studioVisible predicate goes as well, if nothing else uses it); ChecksLayout L86.

- [ ] **3.18** Drop LayoutProvider's studio mapping and update the ChecksLayout a11y test's entry path
  - Service: frontend. Covers: AC-26, AC-27.
  - Files: `frontend/src/components/layout/LayoutProvider/LayoutProvider.tsx`, `frontend/src/components/layout/ChecksLayout/ChecksLayout.a11y.test.tsx`
  - Depends on: 3.17
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/layout/ChecksLayout/ChecksLayout.a11y.test.tsx && pnpm run type-check`
  - Plan notes:
    LayoutProvider L70; ChecksLayout.a11y L45 becomes /checks/all (entry path only). If the a11y file
    fails at file level because @put/core-components does not resolve (G5), record that as pre-existing.

- [ ] **3.19** Move the MSW harness E2E to All Checks and give the E2E proxy an empty GET /checks answer
  - Service: frontend. Covers: NFR-09, CON-10.
  - Files: `frontend/e2e/harness.spec.ts`, `frontend/e2e/previewBootstrapHandlers.ts`
  - Depends on: 3.10, 3.6
  - Verify (from `frontend/`): `pnpm exec playwright test --project=msw e2e/harness.spec.ts`
  - Plan notes:
    L57, L94 and L142 move from /checks/studio/tests to /checks/all. The handler is
    http.get('*/api/v1/checks', ...) returning an empty page, because AllChecksPage L339-341 replaces the
    page on a checks failure (K2). The L106-110 first-name check holds: 25 demo tests, createdAt order
    equals updatedAt order, all on one page.

- [ ] **3.20** Run the phase-3 gate (type-check, lint, WCAG guard, touched suites, full removed-route scan)
  - Service: infra. Covers: FR-27, FR-28, NFR-09, AC-09, AC-26, AC-27.
  - Files: `docs/qa/accessibility/axe-results.json`
  - Depends on: 3.9, 3.11, 3.14, 3.15, 3.16, 3.17, 3.18, 3.19
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm run lint \
      && pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx src/pages src/components src/hooks src/utils/navigation src/App.routes.test.tsx \
      && ! (grep -rn "/checks/studio" src e2e | grep -v "citi/put/checks/studio") \
      && ! grep -rnE "path=\"studio|[}'\"\`]/studio/runs|['\"\`]/studio/tests/:id|path: '/studio'" src e2e \
      && git diff --exit-code -- ../docs/qa/accessibility/axe-results.json
    ```
  - Plan notes:
    The gate only verifies. Scan S3 rejects any /checks/studio reference, any studio/runs literal, the
    old test-local route shapes, and any App.tsx path="studio...". Every line it matches in today's tree
    is owned by a subtask in phases 1-3: ChecksStudioPage L694 by 1.11, L1061 by 2.10, L1194 by 3.7.
    The axe diff is checked against the baseline committed in 3.11.


## Dev Notes

**Source authority.** The [spec](spec/spec.md) owns behaviour and design calls. [requirements.json](spec/requirements.json) owns FR, NFR, CON and AC wording. The [plan](plan/implementation.yaml) owns file lists, order and verification commands.

### All Checks behaviour (spec §9)

**Loading (§9.1).** Studio tests are fetched only when availability is `'on'`. The request is `GET /studio/tests?csiId&environment&q&sort=updatedAt,desc&size=100`, with one request per settled change and superseded requests cancelled. The check list request is unchanged (AllChecksPage L104, limit 100).

**Rows and columns (§9.2).** Each row is `{kind:'check', check}` or `{kind:'uiTest', test, csiName}`. Rows are deduplicated by id, and the UI test wins. They are ordered by `createdAt` descending, with id as the tie-break (PC-01). `csiName` comes from the store; it falls back to the CSI id when the store's first page of 20 CSIs lacks it (PC-12).

| Column | UI test row |
|---|---|
| Selection | Disabled (FR-17) |
| Check Name | Name linking to `ui-tests/{id}`; a caption with the CSI name (or id); the description |
| Type | UI test icon and "UI Test" |
| Status | The status chip below |
| Last Execution | `lastRunAt` formatted as for checks, or "Never" |
| Actions | Execute and the row menu |

The environment is not shown, matching the check rows (PC-14: All Checks columns L494-566).

**Status mapping (§9.3).** Readiness filtering is client-side over at most 100 rows.

| Readiness | Last run | Chip | Chip colour | Status filter value |
|---|---|---|---|---|
| UNLEARNED | any | Not learned | warning | Not learned (own value only) |
| LEARNING | any | Learning | info | Learning (own value only) |
| NEEDS_RELEARN | any | Needs re-learn | warning | Needs re-learn (own value only) |
| READY | PASSED | Passing | as the checks' Passing | Passing |
| READY | FAILED | Failing | as the checks' Failing | Failing |
| READY | ERROR | Error | as the Warning group | Warning |
| READY | none | Not run | as the Pending group | Pending |

**Filters and preselect (§9.4).**
- **Type:** "UI Test" selects UI test rows. The option is hidden unless availability is `'on'` (DC-12).
- **Tags:** any active tag filter hides UI test rows.
- **Preselect:** `?type=UI_TEST` and a stored UI_TEST preference follow DC-18. While `'pending'` they are held. When `'on'` they are applied, with the URL winning over stored preferences, and the result is saved like any filter change (DC-06). When `'off'`, the Type filter shows All Types and UI_TEST is never written. (Plan 3.5: effective type = `'on'` ? raw : (raw === 'UI_TEST' ? '' : raw); the prefs save is skipped while `'pending'`.)

**Row actions and bulk (§9.5).**
- **Execute:** tooltip "Run in Studio", opening `…/studio?autorun=1` (the same label for every readiness: DC-14).
- **Row menu:** Open, Edit in Studio, Schedule (ui-tests run links), Delete (then refresh).
- **Bulk:** UI test checkboxes are disabled, and select-all selects check rows only.

**Cap, failure, empty (§9.6).**
- **Cap:** "Showing 100 of N UI tests — narrow by system or search".
- **Failure:** the inline message "UI tests could not be loaded · Retry". Check rows stay.
- **Empty:** "No UI tests yet", with a "Create UI test" action to `create?type=UI_TEST`.

### Design calls that apply (spec §1.4)

| DC | Call |
|---|---|
| DC-06 | With the switch on, `?type=UI_TEST` wins on load over stored catalog preferences and over a stored create draft's type, and is then saved like any filter change. (The create half was delivered in .1.) |
| DC-07 | The Studio list is requested with `sort=updatedAt,desc`. Mixed rows are ordered by `createdAt` descending, with id as tie-break. UI tests match search on name and description only. Superseded requests are cancelled. |
| DC-08 | Readiness states are selected only by their own filter values. Warning covers WARNING checks and Error UI tests; Pending covers PENDING checks and Not run UI tests. |
| DC-09 | The Dashboard "Open Checks Studio" quick action and the command palette "Studio" entry follow DC-23. The breadcrumb's "All Checks" item goes to `/checks/all`. |
| DC-10 | `StudioListLayout` is not reused by the Runs tab. Both deleted pages import it, so it goes with the last one, in increment 3 (PC-11). |
| DC-12 | The All Checks Type filter hides its "UI Test" option unless availability is "on". |
| DC-14 | The Execute tooltip and "Run in Studio" label stay the same for every readiness. |
| DC-16 | **UI test row columns** as in §9.2. The CSI name comes from the store, falling back to the CSI id. No CSI request is added. |
| DC-18 | **Availability is derived, with three states.** `'pending'` until sources and features are fetched. Then `'on'` if the UI_TEST source and STUDIO feature are on (missing entries and empty lists count as on), else `'off'`. In `'pending'`, no Studio request is sent and a UI_TEST type from the URL or stored preferences is held (not applied, written or dropped). In `'off'`, the held value is dropped and never written. In `'on'`, the held value is applied. `'pending'` always ends, because both `fetched` flags are also set on a failed fetch. |
| DC-22 | Increment 3 removes: `studio/tests`, the Tests page, the Studio nav group, and their components (`StudioListLayout` among them, because `StudioTestsPage` imports it at L5). Each increment repoints its references. |
| DC-23 | Dashboard and palette target `/checks/studio/tests` until increment 3, and `/checks/all?type=UI_TEST` from increment 3. They show only when availability is `'on'`. |

### Edge states that apply (spec §10)

| Edge | Handling |
|---|---|
| Availability `'pending'` | No Studio request; a UI_TEST type from the URL or stored preferences is held. |
| Availability `'off'` | No Studio fetch and no UI test rows; Type option hidden; held UI_TEST dropped, never written. |
| Sources arrive disabled after the first render | Same as `'off'`, applied immediately (derived state). |
| Studio list failure | Checks stay; inline Retry. |
| More than 100 UI tests | Cap notice. |
| CSI not in the store's first page | CSI id shown. |
| No UI tests | Empty state. |
| Same id in both sources | One UI test row (the UI test wins). |
| Bulk select-all on a mixed page | Check rows only. |
| Bookmark to a removed studio route | Module home via the catch-all. |

### Research findings and code facts that apply

| Ref | Fact |
|---|---|
| RF-08 | Studio public API: server sort values are `name`, `updatedAt` and `lastRunAt` (asc or desc; default `updatedAt,desc`); `q` matches name and description only; `lastRun` accepts PASSED, FAILED, ERROR or NEVER; there is no readiness filter, so readiness filtering stays client-side over at most 100 rows; size is at most 100. |
| RF-09 | Readiness is derived per row on `GET /studio/tests`, and the cost is unmeasured. `studioApi.listTests` accepts an `AbortSignal` (studioApi.ts:66-70). Debounce `q` and cancel stale requests. |
| RF-05 | The four environment values match exactly between the global filter and the server's exact, case-sensitive filter. |
| PC-01 | `GET /checks` sorts by `createdAt` descending (CheckService.java L115), so a `createdAt` order keeps the current check order. |
| PC-03 | All Checks restores and saves `checks:catalog:prefs` (L120-138). |
| PC-11 | `StudioListLayout` is imported by `StudioTestsPage` (L5), `StudioRunsPage` (deleted in .2) and its own test. |
| PC-12 | `csiApi.listCsis` defaults to limit 20 (csiApi.ts L14-16). |
| PC-15 | Link inventory owned by this increment: `studio/tests` at `navigationSetup` L19-33 and L74 (the Studio group and its page ids), ChecksLayout L86, the editor's "Open Tests" (L1194), `harness.spec.ts` L57, L94 and L142, `ChecksLayout.a11y.test.tsx` L45, and `StudioScheduleDialog.test.tsx` L17, L27, L53-56 and L233; `LayoutProvider` L70 maps `/checks/studio*`. `useUrlListState` is used by `useStudioTests` (and, until story .2, by `StudioRunsPage`). `LAST_RUN_FILTER_LABELS` is used by `StudioTestsPage`. |
| Fixtures | The MSW demo fixtures hold 25 tests with `createdAt = updatedAt + 7 days` (demoFixtures.ts L71-97, L258), so `createdAt` order equals `updatedAt` order and fits one 25-row page (plan 3.19). |
| K2 | The E2E proxy serves `*/api/v1/checks/sources`, `*/api/v1/features` and `*/api/v1/csi` (previewBootstrapHandlers.ts L33-35) but not `GET /api/v1/checks`. Without a new empty handler, All Checks replaces the page with its error state (AllChecksPage.tsx L339-341). |

### Risks (spec §17, plan phase-3)

| # | Risk | Mitigation |
|---|---|---|
| R5 | The `size=100` Studio list is costly. | One request per settled change, with cancellation; a 300 ms debounce (the default of `useUrlListState`, L94, copied as a constant before that hook is deleted); measure in the pilot. |
| R6 | CSI ids shown beyond the store's 20 CSIs. | Id fallback; raising the page is out of scope. |
| R12 | A saved `?type=UI_TEST` surprises a later plain visit. | Same as any filter change; dropped when off. |
| R13 | A late sources answer applies or saves UI_TEST. | Derived availability with `'pending'` (DC-18); the late-sources tests (3.9). |
| R14 | Earlier removals (D7) break links or tests mid-story. | Order the removals after their repoints; the link walk above; gate 3.20. |
| K2 | The harness at `/checks/all` needs a `GET /checks` E2E handler. | Task 3.19. |

### Cross-story handoff

`accumulated-context.md` does not exist in this repository, so cross-story coherence is recorded here.

- From stories .1 and .2 this story uses: `uiTestPaths.ts`, `useUiTestAvailability`, the `runHref` prop, `uiTestStatus.ts` (2.2), the detail routes, `App.routes.test.tsx` (extended in 3.10) and the Dashboard and palette entries (1.24, retargeted in 3.8).
- This story leaves for story .4: a codebase with no `/checks/studio` route, helper or removed module. The final scan S4 in story .4 is S3 plus the removed module names.

### Testing

Run narrow tests only (spec §12; NFR-09). The gates, which must pass **at the end of this story**, are `pnpm run type-check`, `pnpm run lint`, `pnpm run test <touched specs>` (Vitest) and the touched Playwright specs (`--project=msw`). There are no accessibility criteria (CON-04). Mocks are the Node MSW harnesses (CON-10). No MSW handler exists for `GET /checks`: serve it inline in the Vitest tests (plan 3.9).

**New tests** (spec §12.1, §12.2): catalog rows (kind, dedupe, order, the 7 status cases, grouping, tag hiding, CSI fallback, column values); All Checks (rows, params, columns and the CSI fallback; order; cancellation; chips and filters; bulk; tags; actions; cap; failure; empty; availability pending, on and off, including sources arriving late; `?type` versus stored preferences); navigation and entry points (the Studio group gone; Dashboard and palette targets `/checks/all?type=UI_TEST`, hidden unless `'on'`); the route test extended (`studio/tests` lands on module home).

**Gherkin scenarios for this increment** (spec §12.3):

```gherkin
Scenario: Late sources switch UI tests off (AC-23)
  Given all?type=UI_TEST opened before sources are fetched
  When sources arrive with UI_TEST disabled
  Then no GET /studio/tests was sent and UI_TEST is not in the stored preferences

Scenario: UI tests cannot be bulk-selected (AC-17)
  Given All Checks shows check rows and UI test rows
  When the user clicks select-all
  Then only check ids are in the bulk selection
```

**Existing tests and E2E touched in this increment** (spec §12.4): delete `StudioTestsPage.test.tsx`, `StudioListLayout.test.tsx` and `hooks/useUrlListState.test.tsx`. Update `StudioScheduleDialog.test.tsx` (drop the `TestRow` import at L17 and `RowFlow` at L53-56; the entries at L27 and L233 move off `/studio/tests`) and `ChecksLayout.a11y.test.tsx` L45 (entry path only). E2E `harness.spec.ts` L57, L94 and L142 move from `/checks/studio/tests` to `/checks/all` (they record `GET /api/v1/studio/tests`, which All Checks sends), and the E2E MSW handler set gains an empty `GET */api/v1/checks` handler in `e2e/previewBootstrapHandlers.ts`.

### Technical constraints (spec §2.3)

CON-01 frontend-only. CON-03 one path, no redirects, aliases or fallbacks. CON-04 ADR-SC-006. CON-05 React 18, strict TypeScript, MUI v5 (5.18.0) with `sx`, React Router v6 (6.30.1), Redux Toolkit 2, MSW 2 in Node, the centralized API client, pnpm only, no v7-only APIs, no new dependency. CON-06 Flow 2 forward-compatibility. CON-07 separate aggregates: no checks rows for UI tests. NFR-01: one Studio list request per settled change; CSI names from the store; zero requests unless `'on'`. NFR-04: no direct `fetch()`. NFR-05: no execute from lists, detail or bulk. NFR-07: at most 100 UI tests per request.

## Drafting flags and decisions pending

| # | Item | Handling | Changes |
|---|---|---|---|
| F1 | [AUTO-DECISION] ClickUp epic lookup and story task creation (task steps 5.1–5.4) | Not performed (reason: this mission writes exactly four local story files and was given no ClickUp epic or authority to mutate ClickUp) | Nothing in the story |
| F2 | AC-04, AC-08, AC-09, AC-14, AC-23, AC-26 and AC-27 are split across increments | Only increment 3's clauses are stated, per spec §14 and §14.1 | Those ACs |
| F3 | AC-14 and FR-13: spec §14's increment-3 row lists neither, but AC-19 says Execute "behaves as AC-14", the §19 table traces FR-13 to increments 1, 2 and 3, and plan 3.3 and 3.9 cover AC-14 | Kept as "AC-14 (increment 3 part: All Checks)". @po to confirm | AC-14 |
| F4 | AC-04: spec §14 says "AC-04 (all)" for increment 3 while increment 1's row also lists AC-04 | Read as: .1 delivers the Create Check half, this story the All Checks half and the persistence of stored preferences | AC-04 |
| F5 | The 300 ms debounce is plan-derived: spec §9.1 requires "one request per settled change" and research R-09 recommends debouncing `q`, but only the plan (phase-3 risks, 3.2, 3.16) fixes the value | Use the plan's 300 ms constant, defined locally in the catalog hook | None |
| F6 | `ChecksLayout.a11y.test.tsx` may fail at file level if `@put/core-components` does not resolve (plan gap G5) | If so, record it as pre-existing (plan 3.18) | None |
| F7 | The working tree is dirty with changes this story did not make | Preserve all of them. The File List names only files this story touches | None |

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-23 | 0.1.0 | Draft created from the approved spec (Spec Pipeline critique round 4: APPROVED, 4.38), requirements.json and plan revision 4, phase-3. ClickUp sync not performed (F1). | River (@sm) |
| 2026-10-23 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. Tasks match plan revision 4 phase-3 1:1; F3 (AC-14 All Checks half, FR-13) placement confirmed. Starts only after story .2 is Done. | Pax (@po) |

## PO Validation (2026-10-23)

**Verdict: GO, 9/10. Status Draft → Ready.** Pax (@po), `validate-next-story.md` in YOLO mode with the 10-point checklist of `story-lifecycle.md`. Record: [spec/story-validation.json](spec/story-validation.json). Confidence: high.

**What was checked**
- **Tasks against the plan.** Tasks 3.1–3.20 match plan revision 4, phase-3, one to one. Order, description, files, dependencies, coverage, verification command and plan notes are the same, checked by script with js-yaml. No task is missing and none is extra.
- **AC share.** The 15 ACs are increment 3's share in spec §14, plus the AC-14 All Checks half (F3, ruled below). AC-15 to AC-22 are the requirements.json text unchanged.
- **D7.** Every spec §11 row-3 removal is in this story: `studio/tests`, `StudioTestsPage` and its test, `useStudioTests`, `TestRow`, `TestRowMenu`, `StudioListLayout` with `SortableHeaderCell`, `useUrlListState`, `LAST_RUN_FILTER_LABELS`, the Studio nav group and its mapping, ChecksLayout L86 and LayoutProvider L70. Its references are repointed here (3.7, 3.8, 3.12, 3.18, 3.19). WCAG surface 1 goes before the page files (3.11 before 3.13).
- **Order and scope.** Dependencies point back only to 1.2, 1.3, 1.14, 1.24, 2.2 and 2.10, and the story depends only on story .2. No backend file is touched. There is no accessibility AC or task; the WCAG changes are the planned surface-1 removal and the `ChecksLayout.a11y` entry-path change.
- **Verification.** Every task verifies with pnpm from `frontend/`.
- **Source check.** I ran the route-scan S3 dry run today: 50 + 21 lines, the same as the plan records. Cited lines also hold: StudioTestsPage L5 imports `StudioListLayout`, AllChecksPage L104, L339 and L432, `useUrlListState` L94 (`debounceMs = 300`), previewBootstrapHandlers L33-35 (no `GET /checks` handler), and `ChecksLayout.a11y.test` L45.

**Flag rulings**
- **F3 (AC-14 All Checks half and FR-13 in this story): correct.** FR-13's own text covers "on the detail page and on All Checks UI test rows". The §19 table traces FR-13 to increments 1, 2 and 3. Spec §9.5 is in the increment-3 section, AC-19 says Execute "behaves as AC-14", and plan 3.3 and 3.9 cover AC-14. Spec §14 row 3, which leaves FR-13 and AC-14 out, is spec-side housekeeping for @pm. It does not block.
- **F4 (AC-04 split):** accepted. Story .1 delivers the Create Check half (FR-03), and this story delivers the All Checks half plus the stored-preferences sentence (FR-22).
- F2, F5, F6 and F7 are accepted as handled.

**Conditions and follow-ups (none blocks)**
- **C-1:** this story inherits story .1's condition. No code starts until the user approves plan revision 4 and story .2 is Done.

## Dev Agent Record

### Agent Model Used

_Populated by @dev during implementation._

### Debug Log References

_Populated by @dev during implementation._

### Completion Notes

_Populated by @dev during implementation._

### File List

_Empty until implementation. @dev lists only files this story creates, modifies or deletes._

## QA Results

_Populated by @qa._
