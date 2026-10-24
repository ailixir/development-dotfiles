# Story STUDIO-UNIFY-001.2 — UI test detail page with Overview and Runs; Runs page removed

| Field | Value |
|---|---|
| Story ID | STUDIO-UNIFY-001.2 |
| Status | **Done** |
| Epic | STUDIO-UNIFY-001-ui-tests-as-checks — UI tests as checks (Flow 1, frontend-only), increment 2 of 4 |
| Depends on | STUDIO-UNIFY-001.1 |
| Dependency notes | Needs story .1 Done. This story reuses what .1 delivers: the UI test path helpers (1.2), the availability hook (1.3), the `runHref` prop on `StudioScheduleDialog` (1.14), the editor framing (1.15) and the per-tree route test (1.21). The plan's phase-2 subtasks depend on 1.3, 1.14, 1.15 and 1.21. Story .3 follows. |
| Source | [Spec](spec/spec.md) §1.3 (D1, D3, D7), §1.4 (DC-02, 03, 10, 13, 14, 16, 17, 18, 20, 22), §5, §8, §10, §11 row 2, §12, §14 row 2, §14.1; [Requirements](spec/requirements.json); [Plan](plan/implementation.yaml) revision 4, phase-2 (subtasks 2.1–2.18); [Research](spec/research.json) (RF-04, RF-06); [Critique 4](spec/critique-4.json) (APPROVED, 4.38) |
| Size | M (spec §14). 18 plan subtasks. |
| Drafted by | River (@sm), 2026-10-23, from the approved spec, requirements and plan |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["Vitest-RTL-MSW", "type-check", "lint", "WCAG-audit-regression-guard", "removed-route-scan-S2", "CodeRabbit-or-documented-manual-fallback"]

Second of four stories, one per increment of `STUDIO-UNIFY-001-ui-tests-as-checks`. It adds the detail page that replaces the cross-test Runs page, and it removes that page in the same story (user decision D7). No code starts before @po moves this story to Ready and story .1 is Done.

## Story

**As a** Checks user,
**I want** a detail page for each UI test with an Overview and its own Runs tab, and a "Run in Studio" action that goes through the editor's run gate,
**so that** I can see a test's steps, schedule and replays in the Checks area without a separate cross-test Runs page, and I never see runs or content of a test I cannot access.

## Context

Today the Studio Runs page lists runs across all tests. User decision D3 drops that list: **"Drop the cross-test runs list (today's Studio Runs page). Runs live only on each UI test's detail page."** This story adds `ui-tests/:id` (Overview), `ui-tests/:id/runs` and `ui-tests/:id/runs/:executionId` (Runs), gates every render on a successful read of the test, and then removes `studio/runs`, `StudioRunsPage`, the sidebar Runs child and the Runs-page route builders. The editor's in-page back now goes to the detail page, and every schedule dialog host passes the ui-tests run path.

At the end of this story the Tests page and the sidebar Studio group (Tests only) still exist. Story .3 removes them.

**Requirements covered (spec §14):** FR-07 (back); FR-08 (dialog); FR-09–FR-12; FR-13 (detail); FR-25 (detail); FR-26; FR-27 (inc 2); FR-28 (surface 2).

**Binding user decisions that apply (spec §1.3):** D1 (frontend-only; Studio's own scheduler owns UI test schedules); D3 (above); D7 (no old route, page or fallback survives an increment: "UI studio is a new feature thats not even in dev yet, this is brand new, no old routes or data should be kept, just update the references if is the case."). Standing rules: one path, no redirects; functional-only accessibility (ADR-SC-006); pnpm only; MUI with `sx`; all HTTP through the centralized API client.

## Scope

**In:** the detail page shell with availability gating and the test-read gate; header with Edit in Studio, Schedule, Run in Studio and Delete; the read-only Overview tab; the Runs tab (replays only, note, own header, server paging, live refresh, test-bound drawer, copy link); the single-test `RunRow`; the detail routes; the editor's back target; every schedule dialog host's ui-tests run link; the increment-2 removals; WCAG surface 2 dropped.

**Out (other stories or spec §16.1):** the All Checks merge and the Tests page removal (.3); the D5 docs (.4); a cross-test runs list (D3); showing learns in Runs, or releasing an abandoned learn sooner (backend); filters on the Runs tab; editing steps, variables or secrets outside Studio; any backend, API, schema or Flyway change; Flow 2; any accessibility work.

## Routes added and removed (spec §5)

All routes are behind `FeatureGate STUDIO`, in both trees (CON-09).

| Path | Screen | Notes |
|---|---|---|
| `ui-tests/:id` | UI test detail, Overview tab | Added here |
| `ui-tests/:id/runs` | Detail, Runs tab | Added here; replays only |
| `ui-tests/:id/runs/:executionId` | Runs tab with the drawer open | Added here; bound to `:id` (FR-12) |
| `studio/runs`, `studio/runs/:executionId` | **Removed here** | No redirect; the catch-all sends to module home (PC-07) |

Routes are type-segmented, because check ids and test ids are separate namespaces. Route strings come from the one set of UI test path helpers (`uiTestPath`, `uiTestRunsPath`, `uiTestRunPath`, `uiTestEditorPath`), which never search the pathname for `/studio` (PC-08). [CON-06, CON-09; NFR-03]

## Acceptance Criteria

AC text is copied from [requirements.json](spec/requirements.json). Where the spec splits an AC across increments (§14), only this increment's part is stated. The bracketed tag after each id gives its source.

- **AC-08 (increment 2 part: back)** *[FR-07; DC-22; spec §7.3, §14.1]* Given the editor is open on a test, then the in-page back action targets ui-tests/{id}.
- **AC-09 (increment 2 part)** *[FR-08; DC-20; spec §14.1]* Given the built frontend, when its source and the rendered nav, command palette, dashboard, schedule dialog and run links are inspected, then none target a removed studio route; the Dashboard 'Open Checks Studio' quick action and the command palette 'Studio' entry open /checks/studio/tests; at the increment 2 boundary no in-app link targets a route deleted so far; and the schedule dialog's 'Inspect run' and 'View run' links, opened from every host, resolve to ui-tests/{id}/runs/{executionId}.
- **AC-10** *[FR-09; spec §8.2]* Given an accessible UI test, when ui-tests/{id} opens, then the header shows name, status chip, 'UI Test' chip, CSI, environment and last run. Edit in Studio goes to ui-tests/{id}/studio. Schedule opens the existing Studio schedule dialog. Run in Studio goes to ui-tests/{id}/studio?autorun=1. Delete confirms in the existing dialog, then goes to /checks/all.
- **AC-11** *[FR-10; NFR-04; DC-02; spec §8.3]* Given a test with steps and variables including a secret, when the Overview tab shows, then steps are numbered and read-only, readiness is shown, each variable shows name and kind, the secret shows only its vault reference name, no edit controls exist, and the schedule summary is shown.
- **AC-12** *[FR-11; DC-02, DC-03, DC-10, DC-17; spec §8.4]* Given a test with more runs than one page, when the Runs tab opens, then the request to GET /studio/executions carries testId equal to the route id; no row or drawer content renders before GET /studio/tests/{id} has succeeded; rows render newest first under the tab's own header, with the run's short id as the row link instead of a test name and no 'Open test' menu item; the tab states that it lists replays and that learning happens in Studio; the next page is reachable through the existing paging; selecting a row opens the run details drawer at ui-tests/{id}/runs/{executionId}; opening that URL directly opens the same drawer; the drawer's test link targets ui-tests/{id}/studio and its copy-link action copies the ui-tests run URL; and a running execution updates live.
- **AC-13** *[FR-12; DC-03, DC-17; RF-04; spec §8.1, §8.4]* Given ui-tests/{id}/runs/{executionId} where the execution belongs to another test, when the page loads, then not-found is shown and none of that run's steps, logs or video render. Given GET /studio/tests/{id} answers 403 while GET /studio/executions/{executionId} answers 200 (soft-deleted parent), then only the FR-25 message is shown and no run content renders. Given the drawer is open and a live snapshot arrives whose testId differs from expectedTestId, then the drawer switches to its not-found state.
- **AC-14 (increment 2 part: detail page)** *[FR-13; NFR-05; DC-14; spec §8.2]* Given the detail page, when Run in Studio is used, then the app navigates to ui-tests/{id}/studio?autorun=1, no execute request is sent from the detail page, and the run starts only if the editor's run gate admits it. *(The All Checks half of AC-14 belongs to STUDIO-UNIFY-001.3.)*
- **AC-23 (increment 2 part: detail routes)** *[FR-24; DC-18; spec §8.1, §10; plan 2.5, 2.17; see flag F3]* Given the STUDIO feature is off, or the UI_TEST source is disabled, then every ui-tests route (here the detail and runs routes) shows the feature-unavailable state. Given sources and features have not been fetched yet ('pending'), then the detail routes show a loading state and no Studio request is sent.
- **AC-24** *[FR-25; NFR-03, NFR-06; DC-13; spec §8.1]* Given GET /studio/tests/{id} answers 403 (or 400 for a malformed id), when ui-tests/{id} or a runs route under it opens, then 'This UI test doesn't exist or you don't have access' is shown and no request is sent to /checks/{id}. Given the read fails with 500 or no response, then a load error with Retry is shown, nothing from the test or its runs renders, and Retry repeats the read.
- **AC-25** *[FR-26; RF-06; DC-02; spec §8.4, §10]* Given a replay in progress in the editor, when the user navigates to the detail page's Runs tab, then the editor's live subscription is closed and the replay appears in progress in the Runs tab and updates to its terminal state. Given a learn in progress (the server reports LEARNING), when the user opens the detail page, then the Runs tab lists no entry for the learn, and the status chip and Overview read 'Learning'.
- **AC-26 (increment 2 part)** *[FR-27; D7; DC-22; spec §11 row 2]* Given the end of increment 2, then studio/runs and studio/runs/{executionId} land on module home too, the Runs page is gone, and the sidebar has no Runs child. There is never a redirect to a ui-tests route.
- ~~**AC-27 (increment 2 part)**~~ **Removed by user decision 2026-10-23 ("We dont need WCAG, ignore/remove all accessibility tasks").** *[FR-28; CON-04; spec §12.5]* Given the Studio WCAG audit, when it runs at the end of increment 2, then it passes. After increment 2, surface 2 is gone. Any baseline move is regenerated, with its reason recorded in that increment ('surfaces deleted'). If a change breaks the audit, the regression is fixed instead (accessibility-scope rule). No surface is added for the new pages.

### Traceability: AC to plan subtasks

| AC | Plan subtasks (from the plan's `coverage` lists) |
|---|---|
| AC-08 | 2.10 |
| AC-09 | 2.10, 2.11, 2.18 |
| AC-10 | 2.6, 2.17 |
| AC-11 | 2.7, 2.17 |
| AC-12 | 2.3, 2.8, 2.16, 2.17 |
| AC-13 | 2.4, 2.8, 2.17 |
| AC-14 | 2.6, 2.17 |
| AC-23 | 2.1, 2.5, 2.17 |
| AC-24 | 2.5, 2.17 |
| AC-25 | 2.7, 2.8, 2.17 |
| AC-26 | 2.9, 2.13, 2.14, 2.18 |
| AC-27 | 2.12, 2.18 |

Plan task 2.2 also lists AC-16 in its `coverage`. It builds the shared status mapping (spec §9.3, seven cases) that feeds the header status chip here (AC-10) and the All Checks chips in story .3, where AC-16 is delivered. AC-16 is therefore not an acceptance criterion of this story.

## Removals (D7, spec §11 row 2)

| Removed | Task | Its references, repointed in this story |
|---|---|---|
| Routes `studio/runs` and `studio/runs/:executionId`, both trees; the lazy `StudioRunsPage` import | 2.9 | Detail routes `ui-tests/:id`, `runs`, `runs/:executionId` are added in the same task. |
| `StudioRunsPage`, its barrel and its test | 2.12 (WCAG surface first), 2.13 | The Runs tab on the detail page replaces it (D3). |
| The sidebar Runs child and its page-id mapping (`navigationSetup` L30, L73); ChecksLayout's `studio/runs` clause (L87) | 2.14 | The sidebar Studio group keeps Tests only. |
| The Runs-page builders `runsListPath` and `runDetailsPath`, `RUNS_SEGMENT` (L9) and its L12 comment; LayoutProvider's `/checks/studio/runs` prefix | 2.15 | `copyText` stays in `runLinks.ts` (the drawer's copy-link uses it). |
| `RunRow`'s test-name form and its `onOpenTest` ("Open test") | 2.16 | `RunRow` becomes the single-test form with no new prop (DC-17); its only consumer is the Runs tab. |

Also in this story, without a removal: the editor's in-page back and every schedule-dialog host move to the ui-tests paths (2.10), and `scheduleProvenance.test.tsx`'s `/studio/runs/...` literals become `uiTestRunPath` values (2.16).

## Link walk and route-scan gate (spec §14.1, plan linkWalkAtExit)

Only routes that exist at this boundary are targets: `studio/tests` still exists, `studio/runs/*` is gone, and `ui-tests/*` exists from this story.

| Link source | Target after increment 2 |
|---|---|
| Editor in-page back | `ui-tests/{id}` |
| Editor "Open Tests" | `/checks/studio/tests` (still exists) |
| Editor breadcrumb "All Checks" | `/checks/all` |
| Schedule dialog "Inspect run" / "View run" (hosts: editor, detail page, Tests page) | `ui-tests/{testId}/runs/{executionId}` |
| Tests page row (`TestRow`) | `ui-tests/{id}/studio` |
| "Create Test" on the Tests page (the Runs page is gone) | `/checks/create?type=UI_TEST` |
| Runs tab drawer `testHref` | `ui-tests/{testId}/studio` |
| Runs tab drawer "Copy link" | origin plus `ui-tests/{id}/runs/{executionId}` |
| Detail page: Edit in Studio / Run in Studio / Delete | `ui-tests/{id}/studio` / `ui-tests/{id}/studio?autorun=1` / `/checks/all` |
| Dashboard "Open Checks Studio" and command palette "Studio" (only when `'on'`) | `/checks/studio/tests` |
| Sidebar | Studio group: Tests only |
| Create Check UI Test → editor | `ui-tests/{newId}/studio` |
| `studio/runs` and `studio/runs/{id}` | Catch-all, module home |

**Route-scan S2** (task 2.18, plan `verificationConventions.removedRouteScans.S2`). It exits 0 only when no `studio/runs` route string remains (federated, standalone, template-built, or App path). It matches route strings only, never import paths such as `'@/components/studio/runs/RunRow'` (CRIT-19). Run it from `frontend/`:

```bash
! grep -rnE "/checks/studio/runs|[}'\"\`]/studio/runs|path=\"studio/runs" src e2e
```

## WCAG baseline (guard only, ADR-SC-006)

This story drops WCAG **surface 2** (`StudioRunsPage`) and its pin from `studioWcagAudit.test.tsx`: remove the L27 import, the L97 pin and L299-310, set the describe title to "six", and update the header comments that name `StudioRunsPage` (around L86-90), because task 2.13 asserts that no source mentions it (task 2.12). `axe-results.json` may then differ only by the removed `StudioRunsPage` entry. In `docs/qa/accessibility/studio-wcag-audit.md`, drop the surface 2 rows (L63, L75, L87 and the `StudioRunsPage` mentions at L13, L103, L145) and add a dated entry: "surfaces deleted (StudioRunsPage, increment 2); no surface added". The record belongs in **this** story and is never deferred to the docs story. Do not add the detail page or the Runs tab to the audit, and do not extend it.

## CodeRabbit Integration

**Story Type Analysis**
- Primary type: Frontend (new page, tabs, drawer binding).
- Secondary types: removal and test migration; routing; security-sensitive rendering (inaccessible tests).
- Complexity: M (spec §14).

**Specialized Agent Assignment**
- Primary: @dev (implementation and pre-commit review), @qa (gate).
- Supporting: @ux-design-expert on request, for layout or interaction questions only (no accessibility review, ADR-SC-006); @devops only for a later, separately authorised push or PR. @dev does not push.

**Quality Gate Tasks**
- [x] Pre-Commit (@dev) — CodeRabbit NOT RUN (no CLI/WSL on this host); graceful degradation: independent Lean review is the manual diff review. Original text: run the configured CodeRabbit review before marking the story complete. The CLI is WSL-based; if it is unavailable, record that it was not run, apply the configured graceful degradation, and do an independent manual diff review. Never claim a run that did not happen.
- [x] Independent review (@qa): implementation evidence, AC-13 and AC-24 cases (no run content without the test), the link walk, route scan S2, and the WCAG guard record. — PASS, see QA Results (WCAG items removed by user decision).
- [ ] Pre-PR (@devops): only if a PR is later authorised. No PR is implied here.

**Self-Healing Configuration** (`.claude/rules/coderabbit-integration.md`)
- @dev phase: light mode, max 2 iterations, 30 min, CRITICAL and HIGH only. CRITICAL is auto-fixed; HIGH is auto-fixed while the iteration count is below 2 and otherwise documented as debt; MEDIUM is documented as debt; LOW is ignored.
- @qa phase: full mode, max 3 iterations, 30 min.

**Focus Areas**
- Primary: nothing from a test or its runs renders before `GET /studio/tests/{id}` succeeds (R4); absent and forbidden tests are indistinguishable and no call probes `/checks/{id}` (NFR-03); secrets show only the vault reference name (NFR-04); no execute is sent from the detail page (NFR-05); no link survives to the deleted Runs page.
- Secondary: centralized API client only; strict TypeScript; MUI v5 `sx`; React Router v6 APIs only; responsive layout kept.
- Not a focus area: accessibility (ADR-SC-006).

## Definition of Done

- All 18 task checkboxes are ticked and each task's verification passes.
- At the end of the story `pnpm run type-check`, `pnpm run lint`, the narrow Vitest suites and any touched Playwright specs pass.
- The link walk table above holds, and route scan S2 exits 0.
- The Studio WCAG audit passes with surface 2 gone, and the reason "surfaces deleted" is recorded in `studio-wcag-audit.md` in this story. No surface was added.
- The 12 acceptance criteria hold. No run content renders before the test read succeeds. No accessibility work, backend or Flyway change, new dependency, redirect or fallback was added. pnpm only.
- The File List and Dev Agent Record are filled in by @dev. Status moves follow `story-lifecycle.md` (@dev: InProgress, then InReview; @qa: Done).

## Tasks / Subtasks

The 18 tasks below map 1:1 to plan subtasks 2.1–2.18 (`plan/implementation.yaml`, phase-2). Run them **in the listed order**. Ordering matters for D7: routes and links first (2.9–2.11), then WCAG surface 2 (2.12), then the files (2.13) (R14). Run every command from `frontend/`. Use **pnpm only**. Re-read the cited lines before editing: they were verified on 2026-10-23 and may have drifted (ASM-06, R11). The "Plan notes" under each task are copied from the plan and are part of the task. Tick a box only when its verification command passes.

- [x] **2.1** Extract the editor's local StudioUnavailable into a shared component for the detail page
  - Service: frontend. Covers: FR-24, AC-23.
  - Files: `frontend/src/components/studio/StudioUnavailable.tsx`, `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/test/pageBootstrapShape.test.tsx src/pages/ChecksStudioPage/pageRunGate.test.tsx \
      && pnpm run type-check
    ```
  - Plan notes:
    Move L166 unchanged in text and DOM. L1939 imports it.

- [x] **2.2** Add the shared UI test status mapping (readiness and last run to chip, colour and filter group) per spec §9.3
  - Service: frontend. Covers: FR-16, AC-16, DC-08.
  - Files: `frontend/src/components/studio/tests/uiTestStatus.ts`, `frontend/src/components/studio/tests/uiTestStatus.test.ts`
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/tests/uiTestStatus.test.ts`
  - Plan notes:
    Seven cases. Readiness states belong to their own filter values only. Used by 2.6 and 3.1.

- [x] **2.3** Add an optional testId to useStudioRuns for the list and running-count requests
  - Service: frontend. Covers: FR-11, AC-12.
  - Files: `frontend/src/components/studio/runs/useStudioRuns.ts`
  - Verify (from `frontend/`): `pnpm exec vitest run src/pages/StudioRunsPage/StudioRunsPage.test.tsx && pnpm run type-check`
  - Plan notes:
    StudioRunsQuery (L13-22) gains testId?, passed at L84 and L89. When testId is absent, behaviour is identical.

- [x] **2.4** Bind RunDetailsDrawer to an expected test id so a mismatched read or live snapshot shows not-found (G3)
  - Service: frontend. Covers: FR-12, AC-13.
  - Files: `frontend/src/components/studio/runs/RunDetailsDrawer.tsx`
  - Verify (from `frontend/`): `pnpm exec vitest run src/pages/StudioRunsPage/StudioRunsPage.test.tsx && pnpm run type-check`
  - Plan notes:
    On first paint, on the getExecution read and on every snapshot, a testId other than expectedTestId sets the existing 'not-found' state.

- [x] **2.5** Add the detail page shell with availability gating, the test-read gate and the error states
  - Service: frontend. Covers: FR-09, FR-12, FR-24, FR-25, NFR-03, NFR-06, AC-23, AC-24.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestDetailsPage.tsx`, `frontend/src/pages/UiTestDetailsPage/useUiTestDetail.ts`, `frontend/src/pages/UiTestDetailsPage/index.ts`
  - Depends on: 2.1, 1.3
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/pages/UiTestDetailsPage`
  - Plan notes:
    - 'pending': a loading state with no request.
    - 'off': StudioUnavailable.
    - 'on': getTest(id). On 403 or 400, show the single message. Any other failure shows a load error
      with Retry.
    - Never call /checks/{id}.
    - Tabs (Overview index, Runs) and the header render through Outlet only after the read succeeds.

- [x] **2.6** Add the detail header (name, status, UI Test chip, CSI, environment, last run) with Edit, Schedule, Run in Studio and Delete
  - Service: frontend. Covers: FR-09, FR-13, AC-10, AC-14.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestDetailHeader.tsx`
  - Depends on: 2.2, 2.5, 1.14
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/pages/UiTestDetailsPage/UiTestDetailHeader.tsx`
  - Plan notes:
    - Edit in Studio: uiTestEditorPath(id).
    - Run in Studio: uiTestEditorPath(id, {autorun:true}); no execute is sent.
    - Schedule: StudioScheduleDialog with runHref = uiTestRunPath.
    - Delete: DeleteTestDialog, then /checks/all.
    - The CSI shows its name from the store, or the id.

- [x] **2.7** Add the read-only Overview tab (numbered steps, readiness, variables with secret reference names, schedule summary)
  - Service: frontend. Covers: FR-10, NFR-04, AC-11, AC-25.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestOverviewTab.tsx`
  - Depends on: 2.5
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/pages/UiTestDetailsPage/UiTestOverviewTab.tsx`
  - Plan notes:
    Variables show name and kind. A secretRef shows only its secretId, and a plain value is never
    rendered. StudioScheduleSummary takes the refreshToken built as at ChecksStudioPage L1142-1143.

- [x] **2.8** Add the Runs tab (replays only, note, own header, paging, live refresh, test-bound drawer and copy-link)
  - Service: frontend. Covers: FR-11, FR-12, FR-26, AC-12, AC-13, AC-25.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestRunsTab.tsx`
  - Depends on: 2.3, 2.4, 2.5
  - Verify (from `frontend/`): `pnpm run type-check && pnpm exec eslint src/pages/UiTestDetailsPage/UiTestRunsTab.tsx`
  - Plan notes:
    - Data: useStudioRuns({testId, page, pageSize}) with TablePagination. No filters, and no
      StudioListLayout.
    - The note reads "Runs lists replays of this test. Learning happens in Studio."
    - useLiveRunsRefresh keeps rows live.
    - The drawer gets expectedTestId = id, testHref = uiTestEditorPath and copy-link = copyText(origin +
      uiTestRunPath).
    - Rows use RunRow, which becomes single-test in 2.16.

- [x] **2.9** Add the detail routes and remove studio/runs and studio/runs/:executionId in both trees; extend the route test
  - Service: frontend. Covers: FR-09, FR-11, FR-27, CON-09, AC-26.
  - Files: `frontend/src/App.tsx`, `frontend/src/App.routes.test.tsx`
  - Depends on: 2.5, 2.7, 2.8, 1.21
  - Verify (from `frontend/`): `pnpm exec vitest run src/App.routes.test.tsx && pnpm run type-check`
  - Plan notes:
    ui-tests/:id gets an index child (Overview), runs and runs/:executionId (Runs), behind FeatureGate
    STUDIO. Remove L112-113 and L141-142 and the lazy StudioRunsPage import (L22). The route test asserts
    that the detail paths render and the two runs paths land on module home.

- [x] **2.10** Retarget the editor's in-page back to the detail page and every schedule-dialog host to ui-tests run links
  - Service: frontend. Covers: FR-07, FR-08, AC-08, AC-09, DC-20.
  - Files: `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`, `frontend/src/pages/ChecksStudioPage/pageFraming.test.tsx`
  - Depends on: 2.9, 1.15
  - Verify (from `frontend/`):
    ```bash
    pnpm exec vitest run src/pages/ChecksStudioPage/pageFraming.test.tsx src/pages/StudioTestsPage/StudioTestsPage.test.tsx
    ```
  - Plan notes:
    The back goes to uiTestPath(id). The L1144 and Tests-page L173 hosts pass runHref = (e) => uiTestRunPath(test.id, e).

- [x] **2.11** Update the schedule dialog test's run-link assertions to the ui-tests run path
  - Service: frontend. Covers: FR-08, AC-09.
  - Files: `frontend/src/components/studio/scheduling/StudioScheduleDialog.test.tsx`
  - Depends on: 2.10
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/scheduling/StudioScheduleDialog.test.tsx`
  - Plan notes:
    L145, L234 and L252.

- [-] **2.12** (REMOVED, user decision 2026-10-23: no WCAG work) Drop WCAG surface 2 (StudioRunsPage) and its pin, regenerate the baseline and record 'surfaces deleted'
  - Service: frontend. Covers: FR-28, CON-04, AC-27.
  - Files: `frontend/src/test/a11y/studioWcagAudit.test.tsx`, `docs/qa/accessibility/axe-results.json`, `docs/qa/accessibility/studio-wcag-audit.md`
  - Depends on: 2.9
  - Verify (from `frontend/`): `pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx && git diff --stat -- ../docs/qa/accessibility/`
  - Plan notes:
    Remove the L27 import, the L97 pin and L299-310, and set the describe title to "six". Also update the
    header comments that name StudioRunsPage (around L86-90), because 2.13 asserts that no source
    mentions it. axe-results.json may differ only by the removed StudioRunsPage entry. In studio-wcag-audit.md, drop the surface 2 rows
    (L63, L75, L87 and the StudioRunsPage mentions at L13, L103, L145) and add a dated entry: "surfaces
    deleted (StudioRunsPage, increment 2); no surface added".

- [x] **2.13** Delete the Studio Runs page (the cross-test runs list, D3), its barrel and its test
  - Service: frontend. Covers: FR-27, AC-26, D3.
  - Files: `frontend/src/pages/StudioRunsPage/StudioRunsPage.tsx`, `frontend/src/pages/StudioRunsPage/index.ts`, `frontend/src/pages/StudioRunsPage/StudioRunsPage.test.tsx`
  - Depends on: 2.9, 2.12
  - Verify (from `frontend/`): `pnpm run type-check && ! grep -rn "StudioRunsPage" src`

- [x] **2.14** Remove the sidebar Runs child, its page-id mapping and ChecksLayout's runs clause
  - Service: frontend. Covers: FR-27, AC-26.
  - Files: `frontend/src/utils/navigation/navigationSetup.ts`, `frontend/src/utils/navigation/navigationSetup.test.ts`, `frontend/src/components/layout/ChecksLayout/ChecksLayout.tsx`
  - Depends on: 2.13
  - Verify (from `frontend/`): `pnpm exec vitest run src/utils/navigation/navigationSetup.test.ts && pnpm run type-check`
  - Plan notes:
    navigationSetup L30 and L73; ChecksLayout L87.

- [x] **2.15** Remove the remaining Runs-page route references (runLinks builders and their tests, LayoutProvider's runs prefix)
  - Service: frontend. Covers: FR-27.
  - Files: `frontend/src/components/studio/runs/runLinks.ts`, `frontend/src/components/studio/runs/runSnapshots.test.ts`, `frontend/src/components/layout/LayoutProvider/LayoutProvider.tsx`
  - Depends on: 2.13
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/runs/runSnapshots.test.ts && pnpm run type-check`
  - Plan notes:
    Delete runsListPath, runDetailsPath, RUNS_SEGMENT (L9) and the L12 comment, and the L49-51
    assertions. copyText stays in runLinks.ts. In LayoutProvider, L70 keeps only the
    '/checks/studio/tests' prefix set in 1.22.

- [x] **2.16** Make RunRow the single-test form (short id link, no 'Open test') now that the Runs tab is its only consumer
  - Service: frontend. Covers: FR-11, DC-17, AC-12.
  - Files: `frontend/src/components/studio/runs/RunRow.tsx`, `frontend/src/components/studio/runs/RunRowMenu.tsx`, `frontend/src/components/studio/scheduling/scheduleProvenance.test.tsx`
  - Depends on: 2.13
  - Verify (from `frontend/`): `pnpm exec vitest run src/components/studio/scheduling/scheduleProvenance.test.tsx && pnpm run type-check`
  - Plan notes:
    No prop (DC-17). The first cell is the run's short id as the link, with the trigger below it.
    onOpenTest is removed from RunRow and RunRowMenu. scheduleProvenance L20-21 is updated to the
    single-test form, and its href literals change from /studio/runs/... to uiTestRunPath values,
    because the 2.18 scan rejects /studio/runs.

- [x] **2.17** Add detail-page and Runs-tab component tests (header actions, Overview, gating, errors, test binding, learn vs replay)
  - Service: frontend. Covers: AC-10, AC-11, AC-12, AC-13, AC-14, AC-23, AC-24, AC-25.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestDetailsPage.test.tsx`, `frontend/src/pages/UiTestDetailsPage/UiTestRunsTab.test.tsx`
  - Depends on: 2.6, 2.7, 2.8, 2.9, 2.16
  - Verify (from `frontend/`): `pnpm exec vitest run src/pages/UiTestDetailsPage`
  - Plan notes:
    Cases:
    - Header targets; no execute is sent.
    - Overview with a secret.
    - 403 test with a 200 execution: message only, and zero /checks/{id} calls.
    - 400; 500 with Retry.
    - 'pending' and 'off'.
    - Runs: testId, gating, note, own header, short-id link, no "Open test", second page.
    - Drawer deep link, testHref and copy-link.
    - Mismatched testId shows not-found.
    - LEARNING: no row, and the chip reads "Learning".
    - A live replay reaches its terminal state.

- [x] **2.18** Run the phase-2 gate (type-check, lint, WCAG guard, touched suites, removed-route scan for studio/runs)
  - Service: infra. Covers: FR-27, FR-28, NFR-09, AC-09, AC-26, AC-27.
  - Files: `docs/qa/accessibility/axe-results.json`
  - Depends on: 2.11, 2.12, 2.14, 2.15, 2.16, 2.17
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm run lint \
      && pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx src/pages src/components/studio src/App.routes.test.tsx src/utils/navigation \
      && ! grep -rnE "/checks/studio/runs|[}'\"\`]/studio/runs|path=\"studio/runs" src e2e \
      && git diff --exit-code -- ../docs/qa/accessibility/axe-results.json
    ```
  - Plan notes:
    The gate only verifies. Scan S2 matches studio/runs route strings only: "/checks/studio/runs", a quote,
    backtick or "}" directly before "/studio/runs", or path="studio/runs". Import paths such as
    '@/components/studio/runs/RunRow' are excluded by design (CRIT-19), and the API has no /studio/runs
    path. Its 24 hits in today's tree are each owned by a phase-1 or phase-2 subtask. The axe diff is
    checked against the baseline committed in 2.12.


## Dev Notes

**Source authority.** The [spec](spec/spec.md) owns behaviour and design calls. [requirements.json](spec/requirements.json) owns FR, NFR, CON and AC wording. The [plan](plan/implementation.yaml) owns file lists, order and verification commands.

### Detail page behaviour (spec §8)

**Load gating and errors (§8.1).** Every detail route reads `GET /studio/tests/{id}` first. Until that read succeeds, no header data, Overview, runs list or drawer content renders. Execution reads are authorized on the execution, not on the test (RF-04).

| Test read result | Shown |
|---|---|
| 403 or 400 | The single message: "This UI test doesn't exist or you don't have access" |
| Any other failure | A load error with Retry (DC-13) |

No call ever probes `/checks/{id}`. When availability is `'pending'`, the route shows a loading state; when it is `'off'`, the route shows feature-unavailable (DC-18).

**Header (§8.2).** Name, status chip (the §9.3 mapping, built in task 2.2), a "UI Test" chip, CSI (name from the store, or the id: DC-16, PC-12), environment and last run. Actions: **Edit in Studio** goes to `ui-tests/{id}/studio`. **Schedule** opens `StudioScheduleDialog`, whose run links go to `ui-tests/{id}/runs/{executionId}`. **Run in Studio** goes to `…/studio?autorun=1` (the tooltip and label are the same for every readiness: DC-14). **Delete** (overflow menu) runs `DeleteTestDialog`, then navigates to `/checks/all`, a route that exists in every increment.

**Status mapping (§9.3), used by the header chip and by story .3:**

| Readiness | Last run | Chip | Chip colour | Status filter value |
|---|---|---|---|---|
| UNLEARNED | any | Not learned | warning | Not learned (own value only) |
| LEARNING | any | Learning | info | Learning (own value only) |
| NEEDS_RELEARN | any | Needs re-learn | warning | Needs re-learn (own value only) |
| READY | PASSED | Passing | as the checks' Passing | Passing |
| READY | FAILED | Failing | as the checks' Failing | Failing |
| READY | ERROR | Error | as the Warning group | Warning |
| READY | none | Not run | as the Pending group | Pending |

**Overview tab (§8.3).** Read-only numbered steps, readiness (with "Learning" while a learn is open), and read-only variables (name and kind; a secret shows only its vault reference name). It also shows `StudioScheduleSummary`. In task 2.7 terms, a `secretRef` shows only its `secretId`, and a plain value is never rendered.

**Runs tab (§8.4).** `GET /studio/executions?testId={id}` lists replays newest first, with `TablePagination` server paging and no filters. Learns never appear (RF-06). A one-line note says so: "Runs lists replays of this test. Learning happens in Studio." The tab renders its own table header. `RunRow` takes its single-test form, introduced in this story with no prop because the Runs page is deleted in the same story: the short run id is the row link with the trigger source below it; the other cells are unchanged; there is no "Open test". `useLiveRunsRefresh` keeps the list live. A row opens `RunDetailsDrawer` at `ui-tests/{id}/runs/{executionId}`, and opening that URL directly also opens the drawer. The drawer receives `expectedTestId` = the route id (a mismatch in its own read, or in any live snapshot, switches it to its existing not-found state: G3), has its `testHref` going to `ui-tests/{testId}/studio`, and copies the ui-tests run URL through `copyText` from "Copy link".

### Design calls that apply (spec §1.4)

| DC | Call |
|---|---|
| DC-02 | **The Runs tab lists only executions (replays)** and states that learning happens in Studio. While a learn is open, Overview and the status chip show "Learning". |
| DC-03 | **No runs before the test loads.** The Runs tab and drawer render nothing until `GET /studio/tests/{id}` succeeds. A snapshot whose `testId` differs from the route id shows not-found. |
| DC-10 | The Runs tab uses the existing server paging (newest first) with MUI `TablePagination` and no filter controls. `StudioListLayout` is not reused: its required search, filter, title and icon props don't fit a tab (PC-11). Both deleted pages import it, so it goes with the last one, in increment 3. |
| DC-13 | On the detail page, a test-read failure other than 403 or 400 shows a load error with Retry. |
| DC-14 | The Execute tooltip and "Run in Studio" label stay the same for every readiness. |
| DC-16 | The CSI name comes from the store, falling back to the CSI id. No CSI request is added. |
| DC-17 | **Run row and drawer in the Runs tab.** In increment 2 `RunRow` becomes a single-test form: the run's short id is the link, and there is no "Open test". No prop is added, because its only other consumer, the Runs page, is deleted in the same increment (D7). The tab owns its header. `RunDetailsDrawer` gains `expectedTestId` (G3), and a mismatch in the read or a live snapshot uses its existing not-found state. Its `testHref` goes to the editor, and its copy-link copies the ui-tests run URL using `copyText`. |
| DC-18 | Availability is derived (`'pending'`, `'on'`, `'off'`). The detail routes show a loading state when `'pending'` and feature-unavailable when `'off'`. |
| DC-20 | From increment 2 (when the Runs page is removed), the schedule dialog targets the ui-tests run path for every host. |
| DC-22 | Increment 2 removes: `studio/runs` and its child, the Runs page, the Runs nav child. Each increment repoints its references, and the links are re-walked at every boundary. |

### Edge states that apply (spec §10)

| Edge | Handling |
|---|---|
| Availability `'pending'` | Detail routes show a loading state; no Studio request. |
| Availability `'off'` | Detail routes show feature-unavailable. |
| 403 or 400 on the test read | Single message; no other test; no run content; no check probing. |
| Other test-read failure | Load error with Retry. |
| Leaving mid-replay or mid-learn | The replay stays live in Runs. A learn is not listed, reads "Learning", and expires after 600 s unless the user returns in the same tab. |
| Live snapshot for another test inside the drawer | Drawer shows not-found. |
| Run URL for another test | Not-found. |
| Delete from the detail page | Existing dialog, then `/checks/all`. |
| Bookmark to a removed studio route | Module home via the catch-all. |

### Research findings and code facts that apply

| Ref | Fact |
|---|---|
| RF-04 | `GET /studio/tests/{id}` answers the same 403 `STUDIO_FORBIDDEN` for absent, forbidden, soft-deleted and quarantined tests. The execution routes key on the execution, not the test: `GET /studio/executions?testId=` never answers 403 (empty page for an absent or forbidden test, the run history for a soft-deleted one), and `GET /studio/executions/{id}`, SSE and video answer 200 for runs of a soft-deleted test and for the user who started the run even after losing CSI read access. A malformed id's 400 is unverified (R8). Hence FR-12 and the test-read gate. |
| RF-06 | Guided sessions are not executions: a learn never appears in `GET /studio/executions` or the Runs tab, and it is published only while an editor for that test is mounted in the same tab (client-only finalize). The server expires a left learn after 600 s. Until then the test reads LEARNING and holds a CSI learn slot. |
| PC-02 | `useStudioRuns` is server-paged. |
| PC-08 | `StudioScheduleDialog` is hosted by `ChecksStudioPage` and `StudioTestsPage`; it takes its run-link target from its host since story .1. |
| PC-10 | `RunRow` props are at L11-23, with the test-name link as its first cell and `csiName ?? run.csiId`. Its only consumer is `StudioRunsPage`. `RunDetailsDrawer` requires `onCopyLink` and `testHref` (L53-57), and its only page consumer is `StudioRunsPage`. The drawer's not-found state is on 403/404 (L185-188). |
| PC-11 | `StudioListLayout` is imported by `StudioTestsPage` (L5) and `StudioRunsPage`, and by its own test. It stays until story .3. `studioListSx.ts` stays (imported by `RunRow`). |
| PC-12 | `csiApi.listCsis` defaults to limit 20, so the store may lack a CSI name (id fallback). |
| PC-15 | Link inventory owned by this increment: `studio/runs` route strings at `App.tsx` L112-113 and L141-142, `navigationSetup` L30 and L73, ChecksLayout L87, `runLinks.ts` (`runsListPath`, `runDetailsPath`, `RUNS_SEGMENT`), `StudioRunsPage` and its test, `runSnapshots.test.ts` L49-51, `scheduleProvenance.test.tsx` L20-21 and `StudioScheduleDialog.test.tsx` L145, L234, L252. `StudioScheduleDialog.tsx` L28 was repointed in story .1. |

### Risks (spec §17, plan phase-2)

| # | Risk | Mitigation |
|---|---|---|
| R3 | A learn started from Execute is lost if the user leaves. | The Runs note and the "Learning" chip; follow-up outside this story (§16.2). |
| R4 | Runs of an inaccessible test leak onto the detail page or into the drawer. | Load gating (2.5), the `testId` check and the drawer's `expectedTestId` (2.4, DC-03, DC-17); AC-13 tests. |
| R8 | A malformed id answers 400 (inferred). | FR-25 treats 400 like 403. |
| R9 | Schedule summary reads for a soft-deleted test are unverified. | The test read gates the page first. |
| R11 | Line references drift. | The dev re-verifies each cited line before editing. |
| R14 | Deleting the Runs page before every link is repointed breaks links or tests. | Order: routes and links first (2.9–2.11), WCAG surface 2 (2.12), then the files (2.13); the link walk above; gate 2.18. |

### Cross-story handoff

`accumulated-context.md` does not exist in this repository, so cross-story coherence is recorded here.

- From story .1 this story uses: `uiTestPaths.ts`, `useUiTestAvailability`, the `runHref` prop, the editor framing and `App.routes.test.tsx` (extended in 2.9).
- This story hands to story .3: `uiTestStatus.ts` (2.2, used by task 3.1's catalog rows), the shared `StudioUnavailable` component (2.1), and `StudioScheduleDialog` hosts that already pass ui-tests run links. At the end of this story `LayoutProvider` keeps only the `/checks/studio/tests` prefix (2.15), which story .3 removes.
- Task 2.8 renders `RunRow` in its existing form until task 2.16 makes it the single-test form. Task 2.17's tests run after 2.16.

### Testing

Run narrow tests only (spec §12; NFR-09). The gates, which must pass **at the end of this story**, are `pnpm run type-check`, `pnpm run lint`, `pnpm run test <touched specs>` (Vitest) and the touched Playwright specs. There are no accessibility criteria (CON-04). Mocks are the Node MSW harnesses (CON-10). Serve any endpoint without an MSW handler inline in the test.

**New tests** (spec §12.2, "UI test detail page" row): header and actions; Overview; Runs (`testId`, gating, note, header, short-id link, no "Open test", paging); drawer deep link, `expectedTestId` mismatch in the read and in a live snapshot, editor `testHref`, copy-link; a 403 test with a 200 execution; 400 and 500 with Retry; Run in Studio sends no execute; a learn is not listed; pending shows a loading state. Also: the Runs child gone from the sidebar; the schedule dialog's run link goes to `ui-tests/{id}/runs/{executionId}`; the route test extended (the detail paths render their sentinels; `studio/runs` and `studio/runs/{id}` land on module home).

**Gherkin scenario for this increment** (spec §12.3):

```gherkin
Scenario: No run content without the test (AC-13)
  Given GET /studio/tests/{id} answers 403 and GET /studio/executions/{executionId} answers 200
  When the user opens ui-tests/{id}/runs/{executionId}
  Then only "This UI test doesn't exist or you don't have access" is shown
```

**Existing tests touched in this increment** (spec §12.4): delete `StudioRunsPage.test.tsx` (2.13); update `runSnapshots.test.ts` L49-51 (Runs-page builders removed, 2.15), `scheduleProvenance.test.tsx` L20-21 (`RunRow` in single-test form, 2.16) and `StudioScheduleDialog.test.tsx` L145, L234, L252 (ui-tests run hrefs, 2.11).

### Technical constraints (spec §2.3)

CON-01 frontend-only. CON-03 one path, no redirects, aliases or fallbacks. CON-04 ADR-SC-006. CON-05 React 18, strict TypeScript, MUI v5 (5.18.0) with `sx`, React Router v6 (6.30.1), Redux Toolkit 2, MSW 2 in Node, the centralized API client, pnpm only, no v7-only APIs, no new dependency. CON-06 and CON-09: both `App.tsx` trees carry the same `ui-tests` routes, with a route test per tree. NFR-03: absent and forbidden are indistinguishable, and zero `/checks/{id}` calls for UI test ids. NFR-04: no direct `fetch()`. NFR-05: the run gate is the only run entry.

## Drafting flags and decisions pending

| # | Item | Handling | Changes |
|---|---|---|---|
| F1 | [AUTO-DECISION] ClickUp epic lookup and story task creation (task steps 5.1–5.4) | Not performed (reason: this mission writes exactly four local story files and was given no ClickUp epic or authority to mutate ClickUp) | Nothing in the story |
| F2 | AC-08, AC-09, AC-14, AC-26 and AC-27 are split across increments | Only increment 2's clauses are stated, per spec §14 and §14.1 | Those ACs |
| F3 | AC-23: spec §14 lists no AC-23 or FR-24 for increment 2, and the §19 traceability table maps FR-24 to increments 1 and 3. But spec §8.1 and §10 and plan 2.5 and 2.17 require the detail routes to show a loading state when `'pending'` and feature-unavailable when `'off'` | Kept as "AC-23 (increment 2 part: detail routes)", using only the spec §8.1/§10 wording. @po to confirm | AC-23 |
| F4 | AC-14: spec §14 lists AC-10–AC-14 for increment 2 (so the detail page half), and FR-13 is traced to increments 1, 2 and 3 | Only the detail-page half is stated. The All Checks half is in story .3 | AC-14 |
| F5 | The Runs-tab note: spec §8.4 gives "for example" wording, plan 2.8 fixes it | Use the plan's string, "Runs lists replays of this test. Learning happens in Studio." AC-12 requires only that the tab states replays and that learning happens in Studio | AC-12 |
| F6 | AC-11 says the secret shows "only its vault reference name"; plan 2.7 says a `secretRef` shows only its `secretId` | Same thing: `secretId` is the vault reference name | AC-11 |
| F7 | The working tree is dirty with changes this story did not make | Preserve all of them. The File List names only files this story touches | None |

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-23 | 0.1.0 | Draft created from the approved spec (Spec Pipeline critique round 4: APPROVED, 4.38), requirements.json and plan revision 4, phase-2. ClickUp sync not performed (F1). | River (@sm) |
| 2026-10-23 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. Tasks match plan revision 4 phase-2 1:1; F3 (AC-23 detail-route clause) placement confirmed. Starts only after story .1 is Done. | Pax (@po) |
| 2026-10-23 | 0.2.0 | Status: Ready → InProgress (story .1 Done). Executed as Lean work item STUDIO-UNIFY-001.2. AC-27 and task 2.12 removed; WCAG parts of 2.18 dropped (user decision "We dont need WCAG, ignore/remove all accessibility tasks"). | Claude Code (@dev role) |
| 2026-10-23 | 0.3.0 | Status: InProgress → InReview. Tasks 2.1–2.18 done (2.12 removed); File List and Dev Agent Record filled; handed to the independent Lean review. | Claude Code (@dev role) |
| 2026-10-23 | 1.0.0 | Independent Lean review PASS (12/12 criteria, 3 non-blocking findings); Lean acceptance recorded. Status: InReview → Done. | aiox-qa verdict, recorded by Claude Code coordinator |

## PO Validation (2026-10-23)

**Verdict: GO, 9/10. Status Draft → Ready.** Pax (@po), `validate-next-story.md` in YOLO mode with the 10-point checklist of `story-lifecycle.md`. Record: [spec/story-validation.json](spec/story-validation.json). Confidence: high.

**What was checked**
- **Tasks against the plan.** Tasks 2.1–2.18 match plan revision 4, phase-2, one to one. Order, description, files, dependencies, coverage, verification command and plan notes are the same, checked by script with js-yaml. No task is missing and none is extra.
- **AC share.** The 12 ACs are increment 2's share in spec §14, plus the AC-23 detail-route clause (F3, ruled below). AC-10 to AC-13, AC-24 and AC-25 are the requirements.json text unchanged.
- **D7.** Every spec §11 row-2 removal is in this story: the `studio/runs` routes, `StudioRunsPage` and its test, the Runs nav child and its mapping, ChecksLayout L87, `runsListPath` and `runDetailsPath`, the LayoutProvider runs prefix, and RunRow's test-name form. Its references are repointed here (2.10, 2.11, 2.16). WCAG surface 2 goes before the page files (2.12 before 2.13).
- **Order and scope.** Dependencies point back only to 1.3, 1.14, 1.15 and 1.21, and the story depends only on story .1. No backend file is touched. There is no accessibility AC or task; the WCAG change is the planned surface-2 removal and its "surfaces deleted" record.
- **Verification.** Every task verifies with pnpm from `frontend/`.
- **Source check.** I ran the route-scan S2 dry run today: 24 lines and 0 import lines, the same as the plan records. Cited lines also hold: App.tsx L112-113 and L141-142, navigationSetup L30 and L73, runLinks.ts `RUNS_SEGMENT` at L9, useStudioRuns L13, L84 and L89, and StudioTestsPage L173.

**Flag rulings**
- **F3 (AC-23 detail-route clause in this story): correct.** The detail routes first exist in this increment, so this is the only increment where the clause can be verified. Its sources are FR-24's text ("shows the feature-unavailable state on ui-tests routes"; "the detail routes show a loading state"), spec §8.1, §10 and DC-18, and the coverage of plan 2.1, 2.5 and 2.17. Spec §14 row 2 and the §19 table, which leave FR-24 out of increment 2, are spec-side housekeeping for @pm. They do not block.
- F2, F4, F5, F6 and F7 are accepted as handled.

**Conditions and follow-ups (none blocks)**
- **C-1:** this story inherits story .1's condition. No code starts until the user approves plan revision 4 and story .1 is Done.
- **NTH-1 (@qa):** AC-25's first clause, "the editor's live subscription is closed", has no named case in the 2.17 list. Confirm that it is evidenced, either by the existing editor stream-closing coverage or by a 2.17 assertion.

## Dev Agent Record

### Agent Model Used

Coordinator and Lean builder: Claude Code main session (Opus 5.5, session 651237b1-faeb-45bb-9d2b-d4fa4eb9a3e7). Contributors: aiox-dev subagents on Sonnet 5.5, effort high, run in parallel waves with one writer per file set: shared pieces (2.1a, 2.2); runs data and drawer (2.3, 2.4, 2.11); detail shell (2.5); header (2.6); Overview (2.7); Runs tab (2.8); routes (2.9); editor retarget (2.1b, 2.10); Runs page deletion (2.13); sidebar (2.14); link cleanup (2.15); RunRow (2.16); detail-page tests and Runs-tab tests (2.17). Wave plan pre-computed by a read-only aiox-analyst. Run under AIOX Lean Delivery (work item STUDIO-UNIFY-001.2).

### Debug Log References

~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.2/ (binding, contract, logs); ~/.aiox-lean/put-checks-ui-studio/WAVES.md; PREPLAN-STUDIO-UNIFY-001.2-3.md.

### Completion Notes

- User decision "We dont need WCAG, ignore/remove all accessibility tasks": AC-27 and task 2.12 removed; WCAG parts of 2.18 dropped; `docs/qa/accessibility/` untouched.
- Shared `StudioUnavailable` module also exports `TEST_NOT_AVAILABLE_MESSAGE` and `isUnavailableTestRead` (pre-plan D-2); `ChecksStudioPage` keeps one re-export of the message because `pageLoadById.test.tsx` imports it from the page.
- Detail page: nested layout route `ui-tests/:id` (index Overview; `runs`, `runs/:executionId` Runs tab) behind FeatureGate STUDIO in both trees; with STUDIO off, FeatureGate's own panel shows on the real route.
- Header: Delete sits in a "More actions" menu; closing the schedule dialog re-reads the test once; CSI name from the CSI store, id fallback.
- Runs tab: replays only with the note "Runs lists replays of this test. Learning happens in Studio."; `RunRow` link text is `#shortId`; "Open test" removed.
- X-1: `ChecksLayout.a11y.test.tsx` mobile-nav test now clicks the Studio "Tests" child (the Runs child is gone); no assertion added.
- `runLinks.ts` keeps only `copyText` (still used by the Runs tab).
- AC-25 first clause (editor live subscription closed on navigation) relies on the editor's existing unmount cleanup; not asserted in the new tests.
- CodeRabbit not run (unavailable on host). Pre-existing out-of-scope failure `realStudioStartup.test.ts` not in the bound suites.

### File List

Created: `frontend/src/components/studio/StudioUnavailable.tsx`, `StudioUnavailable.test.tsx`; `frontend/src/components/studio/tests/uiTestStatus.ts`, `uiTestStatus.test.ts`; `frontend/src/components/studio/runs/RunDetailsDrawer.test.tsx`, `useStudioRuns.test.tsx`; `frontend/src/pages/UiTestDetailsPage/` (`UiTestDetailsPage.tsx`, `useUiTestDetail.ts`, `UiTestDetailHeader.tsx`, `UiTestOverviewTab.tsx`, `UiTestRunsTab.tsx`, `index.ts`, `UiTestDetailsPage.test.tsx`, `UiTestRunsTab.test.tsx`).

Modified: `frontend/src/App.tsx`, `App.routes.test.tsx`; `frontend/src/components/layout/ChecksLayout/ChecksLayout.tsx`, `ChecksLayout.a11y.test.tsx`; `frontend/src/components/layout/LayoutProvider/LayoutProvider.tsx`; `frontend/src/components/studio/runs/RunDetailsDrawer.tsx`, `RunRow.tsx`, `RunRowMenu.tsx`, `runLinks.ts`, `runSnapshots.test.ts`, `useStudioRuns.ts`; `frontend/src/components/studio/scheduling/StudioScheduleDialog.test.tsx`, `scheduleProvenance.test.tsx`; `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `pageFraming.test.tsx`; `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx`; `frontend/src/utils/navigation/navigationSetup.ts`, `navigationSetup.test.ts`; this story file.

Deleted: `frontend/src/pages/StudioRunsPage/` (`StudioRunsPage.tsx`, `StudioRunsPage.test.tsx`, `index.ts`).

## QA Results

**Verdict: PASS** (independent AIOX Lean review, 2026-10-23). Reviewer: aiox-qa subagent (Sonnet 5.5, effort high; execution 651237b1:a2cef8ca8280a8e22), fresh context, read-only, independent of all authors. Candidate `8f59d4ab7493426d28c59d9ca9c197ed809f8749dc2cd3453ff3027af3bd4e31`; Lean acceptance recorded (engineering acceptance only). Payload: `~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.2/review-1.json`.

- All 12 criteria PASS: AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-23, AC-24, AC-25, AC-26, DOD (AC-27 removed by user decision).
- Bound checks on the same candidate: type-check; lint 0 errors; Vitest `src/pages` 314/314, `src/components/studio` + `src/components/layout` 757/757, routes + navigation 36/36; route scan S2 exit 0. Reviewer re-ran 95 tests and S2.
- Non-blocking findings: (1) stale "SLOTS 2.7 and 2.8" scaffolding comment in `UiTestDetailsPage.tsx` L98 (and the matching note in `useUiTestDetail.ts`); (2) the Tests-page schedule host's ui-tests run link has no test (page is removed in .3), and the sidebar "no Runs child" is only implied by tests; (3) AC-25's editor-subscription-close clause rests on the editor's unmount cleanup and the transport test's unmount cycles rather than a Runs-tab navigation assertion. With STUDIO off the real routes show FeatureGate's panel (same pattern as the editor route), judged acceptable for AC-23.
