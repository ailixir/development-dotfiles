# Story STUDIO-UNIFY-001.7 — UI test detail page aligned to the check detail page (no tabs; Latest run card)

| Field | Value |
|---|---|
| Story ID | STUDIO-UNIFY-001.7 |
| Status | **Done** |
| Epic | STUDIO-UNIFY-001-ui-tests-as-checks — UI tests as checks (Flow 1, frontend-only), follow-up increment 7 (after .6) |
| Depends on | STUDIO-UNIFY-001.6 (Done in the working tree, **not yet committed**; HEAD is `dc1fbb7d4`) |
| Dependency notes | Needs .1–.6 Done. Reuses from .2: `useUiTestDetail` and the load gating, `UiTestDetailHeader`, `RunRow`, `RunDetailsDrawer` (`expectedTestId`), `useStudioRuns`, `useLiveRunsRefresh`, `uiTestRunPath`. Reuses from .6: `LastLearningAttemptNote` in the header, the N4 pager treatment (`ui-test-runs-pagination`), `displayLogMessage` / `logEntryTime` (through `ExecutionProgressView`). No backend, API, schema, runner or Flyway file is touched. |
| Source | User decision 2026-10-24, verbatim choice **"Align to check page"**: the UI test detail page (`ui-tests/:id`) drops its Overview/Runs tabs and mirrors the layout of the other checks' detail page (`/checks/:id`, `CheckDetailsPage.tsx`). Why (user): the spec §8 and FR-09–FR-12 introduced tabs without comparing with `CheckDetailsPage`, and the goal of STUDIO-UNIFY is "UI tests are checks". The user's chosen mock is quoted in the Context. |
| Size | **M**. 12 acceptance criteria, 6 tasks, 3 lanes. About 11 production files (3 new by rename or creation) and 5 test files. Frontend only; the biggest piece is the new Latest run card. |
| Drafted by | River (@sm), 2026-10-24, from the user decision above, checked against the working tree at HEAD `dc1fbb7d4` plus the uncommitted .6 changes |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["Vitest-RTL-MSW", "Playwright-msw-project", "type-check", "lint", "removed-tab-symbol-scan-S5", "real-stack-visual-check", "CodeRabbit-or-documented-manual-fallback"]

Seventh story of `STUDIO-UNIFY-001-ui-tests-as-checks`. It changes how the UI test detail page is laid out and adds no feature the user did not choose: the page loses its tab strip and gets the check detail page's structure (header card; left Overview then Recent Runs; right a "Latest run" card where the checks have "Live Output"). Data, actions, gating and the run drawer stay. No code starts before @po moves this story to Ready.

## Story

**As a** Checks user,
**I want** a UI test's detail page to look and work like any other check's detail page, with its latest replay (status, video, logs) next to its overview and recent runs,
**so that** I see a UI test as a check, and I see how its last run went without opening another tab or a drawer.

## Context

The user's chosen mock (verbatim structure):

```
Header card: name · status · CSI · Edit in Studio  Schedule  Run   (existing UiTestDetailHeader actions, kept)
Left  (~5/12): Overview (steps, readiness, variables, schedule: today's UiTestOverviewTab content)
               Recent Runs (rows: #id  status  duration)
Right (~7/12): Latest run (status · duration · relative time; video; logs)
```

Columns stack on mobile.

### What exists today (verified 2026-10-24, working tree)

| Question | Answer | Evidence |
|---|---|---|
| What is the target structure? | A header `Card` (L144-198), then `Grid container` (L200): left `Grid item xs={12} md={5}` (L202) holding an Overview `Card` (L205) and a Recent Runs `Card` (L277); right `Grid item xs={12} md={7}` (L318) holding a "Live Output" `Card` (L319, `position: sticky`). The page is prototype-era, uses the legacy `Grid item` API and Redux `checks` state. | `frontend/src/pages/CheckDetailsPage/CheckDetailsPage.tsx` |
| How is the UI test page built now? | `UiTestDetailsPage` is the layout route of `ui-tests/:id`. In its success branch (L80-99) it renders `UiTestDetailHeader`, a `Tabs` strip (L88-91: Overview links to `uiTestPath`, Runs to `uiTestRunsPath`) and an `<Outlet context>` (L97). The active tab comes from the pathname (`uiTestDetailTab`, L82). | `pages/UiTestDetailsPage/UiTestDetailsPage.tsx` |
| Where is the tab plumbing? | `useUiTestDetail.ts`: `UiTestDetailTab` (L31), `uiTestDetailTab` (L37-41), `useUiTestDetailContext` via `useOutletContext` (L2, L64-68), and a contract comment that describes the tab parts (L7-28). `UiTestDetailContext` / `UiTestDetailHeaderProps` (L47-61) stay useful as plain prop types. Barrel: `index.ts` exports `UiTestOverviewTab`, `UiTestRunsTab`, `useUiTestDetailContext`, `uiTestDetailTab`, `UiTestDetailTab`. | `pages/UiTestDetailsPage/useUiTestDetail.ts`, `index.ts` |
| What is the Overview content? | `UiTestOverviewTab.tsx` L27-115: sections Readiness (L35), Steps (L51, numbered, read-only), Variables (L72, secret shows `secretId` only), Schedule (L106, `StudioScheduleSummary` with the refresh token). Reads `useUiTestDetailContext()` (L28). | `pages/UiTestDetailsPage/UiTestOverviewTab.tsx` |
| What does the Runs tab hold? | `UiTestRunsTab.tsx`: note and empty text constants (L33-34); `useStudioRuns({testId, page, pageSize})` (L57-65); `useLiveRunsRefresh` while a row is active (L67-69); table with columns Run, Status, System, Requested, Duration, Actions (L138-147) and `RunRow` per run with `csiName` (L149-159); the N4 pager (L163-181); `RunDetailsDrawer` bound with `expectedTestId` (L185-194); copy-link snackbar (L196-207). Close goes to the runs list: `closeRun = navigate(uiTestRunsPath(testId))` (L87). | `pages/UiTestDetailsPage/UiTestRunsTab.tsx` |
| Does the list read already carry what a Latest run card needs? | **Yes.** `GET /executions` items are the same `ExecutionSnapshot` as `GET /executions/{id}` and the SSE frames ("The same output backs ... the items of GET /executions", `ExecutionSnapshotMapper.java` L24): `status`, `durationMs`, `acceptedAt`, `stepResults`, `logs`, `video`, `videoPath`, `streamComplete`. The drawer itself first-paints from a list row (`RunDetailsDrawer.tsx` L171, L185). So the newest replay needs no new read: `useStudioRuns({ testId, sort: DEFAULT_EXECUTION_SORT ('acceptedAt,desc'), page: 1, pageSize: 1 })`. | `docs/specs/studio/openapi.yaml` L999-1058; `studioTypes.ts` L427-474, L505; `useStudioRuns.ts` |
| When is a run "settled"? | `streamComplete` is true only when the status is terminal **and** the video is not `PROCESSING`. A list poll that stops at "terminal status" would leave a fresh recording stuck on "processing" until a reload. | `ExecutionSnapshotMapper.java` L180-182 |
| What can render a run? | The drawer body composes: `RunStatusChip`, duration (`runDurationText`), relative time (`formatRelativeTime`), `ExecutionProgressView` (outcome, steps, logs; `showLogs` prop) and, for a terminal snapshot only, `VideoEvidencePanel` (L346-392). The in-progress message is "Waiting for a browser..." / "The browser is running this test..." (L381-387). `ExecutionProgressView` already applies the .6 log rules. | `components/studio/runs/RunDetailsDrawer.tsx`; `components/studio/run/ExecutionProgressView.tsx` L86-89, L492-524; `evidence/VideoEvidencePanel.tsx` |
| Is the `System` column needed in a single-test list? | No. Every row is the same test and the header shows the CSI. `RunRow`'s only production consumer is `UiTestRunsTab`; `csiName` is passed only there. | `RunRow.tsx` L14, L29, L66; `UiTestRunsTab.tsx` L153; `scheduleProvenance.test.tsx` L21-22 passes no `csiName` |

### Consumers of the runs-list route and the tab helpers (grep over `frontend/src` and `frontend/e2e`, 2026-10-24)

The user rule is single path, no compat: the `ui-tests/:id/runs` tab route and the tab helpers are removed, not redirected. Nothing outside the page links to the bare runs list. Every consumer that changes:

| Consumer | What changes | Task |
|---|---|---|
| `App.tsx` L23-28 (lazy `UiTestOverviewTab`, `UiTestRunsTab`); L116-120 and L146-150 (the `index`, `runs`, `runs/:executionId` children, both trees) | Lazy tab imports go. Each tree keeps `ui-tests/:id` with one child, `runs/:executionId`, and no `index` or `runs` child | 7.3 |
| `App.routes.test.tsx` L19-21 (comment), L56-60 (tab sentinels), L120-139 (three detail tests), L147-152 (`it.each` gate cases) | Rewritten to the new route set; the bare `runs` path joins the "removed, lands on module home" cases | 7.3 |
| `uiTestPaths.ts` L26-34 (`uiTestRunsPath`, used by `uiTestRunPath`) and `uiTestPaths.test.ts` L6, L13, L29, L39, L50 | `uiTestRunsPath` export removed; `uiTestRunPath` builds `${uiTestPath(id)}/runs/${id}` itself. The deep link URL does not change | 7.3 |
| `UiTestDetailsPage.tsx` L3, L6, L8, L82, L88-97 | Tabs, `Outlet`, `uiTestDetailTab` removed | 7.3 |
| `useUiTestDetail.ts` L2, L7-31, L37-41, L64-68; `index.ts` | `UiTestDetailTab`, `uiTestDetailTab`, `useUiTestDetailContext` removed; barrel updated | 7.3 |
| `UiTestRunsTab.tsx` L28, L87 | `closeRun` goes to `uiTestPath(testId)` | 7.2 |
| `UiTestDetailsPage.test.tsx` L27, L38-39, L236-239, L615-631, L660-664; `UiTestRunsTab.test.tsx` L17, L28-29, L196-199 and the `renderAt(uiTestRunsPath(...))` calls (L241, 288, 322, 342, 356, 376, 465, 483) | Follow the new routes and component names | 7.2, 7.3 |
| `e2e/mobile-layout.spec.ts` L254-297 (`/ui-tests/{id}/runs`, `ui-test-runs-tab`) | Opens `ui-tests/{id}` and reads the Recent Runs card | 7.4 |
| Docs: `CLAUDE.md` L101, L116; `AGENTS.md` L101, L116; `PRD.md` L113; `docs/architecture/studio-execution.md` L237 | "Overview and Runs" wording and the route list | 7.4 |

**Checked and unchanged (they link to the page or to a run, not to the runs list):** the editor's back and breadcrumb (`ChecksStudioPage.tsx` L1241, L1252, `uiTestPath`); the All Checks row link and menu (`UiTestCatalogRow.tsx` L93, L175); every schedule dialog host's run link (`ChecksStudioPage.tsx` L1403, `UiTestCatalogRow.tsx` L198, `UiTestDetailHeader.tsx` L162, all `uiTestRunPath`); the drawer's own copy link and test link (built by the card). Historical records (`spec/spec.md` §8, `requirements.json` FR-09–FR-12, stories .2 and .5, `docs/qa/**`) describe tabs and are not edited (Done / evidence).

## Scope

**In:** the new page structure (header card; two-column grid; stack below `lg`); the Overview card (today's content, same behaviour); the Recent Runs card (today's replays table with its server paging, note, empty and error states, live refresh, drawer and copy link, now in a card and without the System column); the new Latest run card (newest replay: status, duration, relative time, recording, step results, logs; opens the drawer; empty state; live update); the drawer closing to `ui-tests/:id`; removal of the tab route, tab helpers and tab components; tests, the e2e fit checks and the docs wording; a real-stack visual check at 1440 and 390 px.

**Out:** any backend, API, schema, runner or Flyway change; a new server read; a separate "View all runs" page; changes to `CheckDetailsPage` or to its Redux state; porting `CheckDetailsPage` extras (Send to Comms, copy and maximize output, average duration, sticky right card); the editor, All Checks, and the learn path (.6); showing learning attempts in Recent Runs; filters on Recent Runs; step-to-video seeking on the Latest run card; editing the spec, requirements, or Done stories in this story's build (a one-line "layout superseded by STUDIO-UNIFY-001.7" note in `spec.md` §8 is @po's, see D7); any accessibility work (ADR-SC-006).

## Constraints (cited from the project rules)

- **Frontend only.** Edits are allowed in `frontend/src`, `frontend/e2e` and the four doc lines listed above. Existing data hooks and components are reused; no new endpoint, no new dependency. **pnpm only.** All HTTP through the centralized API client (`useStudioRuns` and `useUiTestDetail` already do).
- **Single path, no compat** (memory `feedback_single_path_no_compat`, epic D7): the `ui-tests/:id/runs` tab route, `uiTestRunsPath`, `uiTestDetailTab`, `useUiTestDetailContext` and the tab components are deleted. No redirect, alias, or fallback. The deep link `ui-tests/:id/runs/:executionId` stays (user decision).
- **Match `CheckDetailsPage`'s structure, not its code.** It uses the legacy MUI `Grid item` API and Redux `checks`. New code uses MUI `sx` (the repo is on MUI `^5.15`, `frontend/package.json` L27). `CheckDetailsPage` is not modified.
- **Load gating is unchanged** (.2 AC-12, AC-24): nothing of the test, its runs or the drawer renders, and no execution request is sent, before `GET /studio/tests/{id}` succeeds. The cards and the drawer mount only in the shell's success branch.
- **Accessibility is out of scope** (ADR-SC-006, `.claude/rules/accessibility-scope.md`): no ARIA tuning, keyboard work or axe. Visible text, layout and the responsive layout do count.
- **Code rules** (project `CLAUDE.md`): strict TypeScript, MUI `sx`, unit tests for logic and component tests for UI, narrow verification.
- **Component and prop contract (so lanes can work in parallel).** Each card renders its own `Card variant="outlined"` with a `CardHeader`, like `CheckDetailsPage`; the shell only lays them out. Named and default exports:
  - `UiTestOverviewCard({ testId, test })` in `UiTestOverviewCard.tsx` (renamed from `UiTestOverviewTab.tsx`)
  - `UiTestRecentRunsCard({ testId })` in `UiTestRecentRunsCard.tsx` (renamed from `UiTestRunsTab.tsx`)
  - `UiTestLatestRunCard({ testId })` in `UiTestLatestRunCard.tsx` (new)

  `test` is the shell's already-read `TestDetailDto`; the cards do not read the test.

## Acceptance Criteria

The bracketed tag gives the source (the user decision, a .2 or .6 behaviour kept, or a code fact).

- **AC-01 (Page structure)** *[user decision "Align to check page"; `CheckDetailsPage.tsx` L144-348]* Given a readable UI test, when `ui-tests/{id}` opens at 1200 px or wider, then the page shows, in this order, a header card, and below it a two-column area: the left column holds the Overview card, then the Recent Runs card; the right column holds the Latest run card; the columns are in the ratio 5:7 and may shrink without forcing a sideways scroll. No tab strip and no "Overview" or "Runs" tab link exists. Given a width below 1200 px (including 390 px), then the same cards stack in one column in the order header, Overview, Recent Runs, Latest run.
- **AC-02 (Header card)** *[.2 AC-10, AC-14; .6 AC-04]* Given the header, when it shows, then it is a card with the same content and actions as today (name, status chip, "UI Test" chip, CSI, environment, last run, the .6 "Last learning attempt failed" line where it applies; Edit in Studio, Schedule, Run in Studio, More actions with Delete), and every action does what it does today (Edit to `ui-tests/{id}/studio`, Run in Studio to `ui-tests/{id}/studio?autorun=1` with no execute request from this page, Delete to `/checks/all` after the existing dialog, Schedule opens the existing dialog whose run links go to `ui-tests/{id}/runs/{executionId}`).
- **AC-03 (Overview card)** *[.2 AC-11; `UiTestOverviewTab.tsx` L27-115]* Given the Overview card, when it shows, then it is titled "Overview" and holds today's content unchanged: readiness, the numbered read-only steps, the variables (a secret only by its vault reference name; a plain value never), and the schedule summary; no edit control exists; a `LEARNING` test reads "Learning" in the status chip and in the readiness.
- **AC-04 (Recent Runs card)** *[.2 AC-12; .6 AC-06]* Given the Recent Runs card, when it shows, then it is titled "Recent Runs" and: the request to `GET /studio/executions` carries `testId` equal to the route id; rows are replays of this test, newest first, with the note "Runs lists replays of this test. Learning happens in Studio."; the columns are Run (the short id `#xxxxxxxx` as the row link, the trigger below it), Status, Requested, Duration and the row menu, with **no System column**; the existing server paging (rows-per-page and page arrows) works inside the card, so the full history is reachable in place and no "View all" page exists; with no replays it shows the existing empty text; a failed read shows the error with Retry; and while a row is `PENDING` or `RUNNING` the list refreshes in the background with the existing backoff.
- **AC-05 (Fit at 1440 and 390)** *[.6 AC-06 kept; user's evidence widths]* Given the page at 1440x900 with the sidebar expanded and at 390x844, with a test that has more than one page of replays, when it shows, then the document has no horizontal scroll, the Recent Runs table container has `scrollWidth <= clientWidth`, and at 390 px the pager (range text and both arrows) lies fully inside the viewport and the rows-per-page selector is hidden below `sm`. At 1200 px the same two measurements hold. If the table does not fit, columns are dropped from `lg` up (where the two columns sit side by side) in this order, Requested first, then Duration, never the Run link, Status or the row menu; if Run, Status and the row menu alone still overflow at 1200 px, the Status cell's fixed width and the cell padding are reduced; an inner horizontal scroll is not an option (task 7.2).
- **AC-06 (Latest run card, a replay exists)** *[user decision; list item = full snapshot]* Given a test with replays, when the Latest run card shows, then it is titled "Latest run" and shows the **newest** replay of this test (the first item of the same newest-first list, read with `testId`, page 1, size 1): its status chip, its duration (`runDurationText`), the time it was requested in relative form (absolute time in a tooltip) and its short id; when the run is terminal, its recording through `VideoEvidencePanel` (every evidence state keeps its existing narrative), and its step results and its logs through `ExecutionProgressView` with logs shown (the .6 log rules apply, as the component already does); and an "Open run details" button that opens the run in the drawer at `ui-tests/{id}/runs/{executionId}`. It never shows a run of another test and never a learning attempt.
- **AC-07 (Latest run stays current)** *[`useLiveRunsRefresh`; `streamComplete` semantics]* Given the newest replay is not settled (`streamComplete` is false: `PENDING`, `RUNNING`, or terminal with the recording still `PROCESSING`), when the card is on screen, then it re-reads in the background with the existing backoff and updates in place (status, duration, steps, logs, then the recording) until `streamComplete` is true, then stops. While the run is not terminal the card shows the same in-progress message as the drawer and mounts no video. A newer replay started later replaces it on a read.
- **AC-08 (Latest run, no replay or read failure)** *[user decision; .2 AC-25]* Given a test with no replay (including a `LEARNING` or never-run test), when the card shows, then it states that there are no replays yet and that learning happens in Studio, and renders no video, steps or logs; while the first read is in flight it shows a loading indicator; given the read fails, it shows the list error with a Retry button and nothing else of a run.
- **AC-09 (Drawer and deep link)** *[.2 AC-12, AC-13 kept; user decision]* Given a row or the "Open run details" button is used, or `ui-tests/{id}/runs/{executionId}` is opened directly, when the page shows, then it is the same single page with the run drawer open over it, bound to this test (`expectedTestId`): the test link goes to `ui-tests/{id}/studio`, Copy link copies the origin plus `ui-tests/{id}/runs/{executionId}`, Previous and Next walk the Recent Runs page, a run that belongs to another test shows the drawer's not-found state with none of its content, and Close (and "Back to runs" in the not-found alert) go to `ui-tests/{id}`. Opening and closing the drawer neither re-reads the test (`GET /studio/tests/{id}` is not sent again) nor remounts the cards.
- **AC-10 (Gating and errors kept)** *[.2 AC-23, AC-24]* Given availability is `'pending'` or `'off'`, or `GET /studio/tests/{id}` answers 403 or 400, or fails with another error, then the page shows exactly what it shows today (loading state with no Studio request; feature-unavailable; the single not-available message with no run content and no `/checks/{id}` call; the load error with Retry), and no header, card, run request or drawer is rendered or sent before the read succeeds. Given the route `ui-tests/{id}/runs/{executionId}` and a 403 test read with a 200 execution read, then only the not-available message shows.
- **AC-11 (The tab route and helpers are gone)** *[single path, no compat]* Given the built frontend, when the router and the source are inspected, then `ui-tests/{id}/runs` (without an execution id) is not a route and lands on module home through the catch-all with no redirect, in both route trees; `ui-tests/{id}` and `ui-tests/{id}/runs/{executionId}` render the page, behind the STUDIO gate; and the scan S5 of task 7.5 finds none of `uiTestRunsPath`, `uiTestDetailTab`, `UiTestDetailTab`, `UiTestRunsTab`, `UiTestOverviewTab`, `useUiTestDetailContext` in `frontend/src` or `frontend/e2e`.
- **AC-12 (Docs say what the page is)** *[docs hygiene; D5 of the epic]* Given the core docs, when `CLAUDE.md`, `AGENTS.md`, `PRD.md` and `docs/architecture/studio-execution.md` are read, then none says the UI test detail page has "Overview and Runs" or lists a `ui-tests/:id/runs` route; they describe the page as header, Overview, Recent Runs and Latest run (wording change only on the lines named in the consumer table), and `grep -rn "Overview and Runs" CLAUDE.md AGENTS.md PRD.md docs/architecture` prints nothing.

### Traceability: AC to tasks

| AC | Tasks |
|---|---|
| AC-01 | 7.3, 7.4 (fit), 7.6 |
| AC-02 | 7.3 |
| AC-03 | 7.3 |
| AC-04 | 7.2 |
| AC-05 | 7.2, 7.4, 7.6 |
| AC-06 | 7.1 |
| AC-07 | 7.1 |
| AC-08 | 7.1 |
| AC-09 | 7.2, 7.3 |
| AC-10 | 7.3 |
| AC-11 | 7.3, 7.5 |
| AC-12 | 7.4 |

Tasks 7.5 (gate) and 7.6 (real-stack visual check) cover every AC.

## Tasks / Subtasks

Run commands from `frontend/` with **pnpm only**. Tick a box only when its verification passes. Line numbers were read on 2026-10-24 in the working tree (which holds uncommitted .6 work in several of these files, see R4) and may drift; re-read before editing. Test files are listed with the task that changes them.

**Parallelism.** The "Files" sets below are disjoint, so lanes run in parallel. Order inside and across lanes:

| Lane | Tasks | Order | File set |
|---|---|---|---|
| A (Latest run, then the shell) | 7.1 then 7.3 | 7.1 first; 7.3 starts when 7.1 **and** 7.2 are done (it mounts both cards) | `UiTestLatestRunCard.tsx` + test (new); then `UiTestDetailsPage.tsx`, `UiTestDetailHeader.tsx`, `UiTestOverviewCard.tsx` (renamed), `useUiTestDetail.ts`, `index.ts`, `UiTestDetailsPage.test.tsx`, `App.tsx`, `App.routes.test.tsx`, `uiTestPaths.ts`, `uiTestPaths.test.ts` |
| B (Recent Runs) | 7.2 | starts at once, parallel to 7.1 | `UiTestRecentRunsCard.tsx` and `UiTestRecentRunsCard.test.tsx` (renamed), `RunRow.tsx` |
| C (e2e and docs) | 7.4 | the docs part may start at once; the e2e part starts after 7.2 and 7.3 | `frontend/e2e/mobile-layout.spec.ts`, `CLAUDE.md`, `AGENTS.md`, `PRD.md`, `docs/architecture/studio-execution.md` |
| After lanes | 7.5, 7.6 | 7.5 after 7.1–7.4; 7.6 (coordinator) after 7.5 | gates; evidence folder |

Between 7.2 and 7.3 `uiTestRunsPath` still exists (only 7.3 deletes it) and 7.2 stops importing it. The rename in 7.2 leaves three references to `UiTestRunsTab` in 7.3-owned files (`index.ts`, `App.tsx`, `UiTestDetailsPage.test.tsx`), so the project-wide `type-check` is red between 7.2 and 7.3 and only there. 7.2 therefore verifies with Vitest alone; `type-check` is the gate from 7.3 on. No shim or alias is added to bridge the gap.

- [x] **7.1** Latest run card (new)
  - Covers: AC-06, AC-07, AC-08. Depends on: none. Lane A.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestLatestRunCard.tsx` (new), `frontend/src/pages/UiTestDetailsPage/UiTestLatestRunCard.test.tsx` (new)
  - Notes: props `{ testId }`. Data: its own `useStudioRuns({ q: '', status: '', csiId: null, sort: DEFAULT_EXECUTION_SORT, testId, page: 1, pageSize: 1 })` (D2). `latest = runs[0] ?? null`. Live: `useLiveRunsRefresh({ active: latest !== null && !latest.streamComplete && error === null, refresh: () => reload({ silent: true }) })`. Card: `Card variant="outlined"` with `CardHeader title="Latest run"`; the "Open run details" button navigates with `uiTestRunPath(testId, latest.executionId)` and is shown only with a run. Body for a run, in this order: a meta row (`RunStatusChip`, `runDurationText`, `formatRelativeTime(acceptedAt)` with the absolute time in a `Tooltip` as in `RunRow`, `#shortRunId`); the in-progress `Alert` copied from `RunDetailsDrawer.tsx` L381-387 while the status is not terminal (same two sentences, as module constants local to the new card file; the drawer's text is inline today and the drawer is not touched); `VideoEvidencePanel snapshot={latest}` only when `isTerminalExecutionStatus(latest.status)`; then `ExecutionProgressView snapshot={latest}` (logs on, no `onSeekStep`, no `onRerun`). Empty: `Typography` stating no replays yet and that learning happens in Studio (wording delegated to @ux; see D4). Loading: `LinearProgress` on the first read. Error: `Alert severity="error"` with the hook's message and a Retry button calling `reload()`. Not sticky. Do not touch `RunDetailsDrawer`, `ExecutionProgressView` or `VideoEvidencePanel`. The drawer's `FailedStepSummary` is private to the drawer and is not reused; the step list and outcome of `ExecutionProgressView` show the failing step. Tests (MSW, the pattern of `UiTestRunsTab.test.tsx` L60-160): the request carries `testId` and `size=1`, newest first; a terminal run shows chip, duration, time, `#id`, the video element for `AVAILABLE` evidence, the step results and the log lines (with the .6 `step 1` numbering); a running run shows the in-progress message and no video, then updates to terminal and shows the video after a background re-read, and the polling stops once `streamComplete`; a terminal run with `PROCESSING` evidence keeps polling until it settles; no replays shows the empty text with no video or logs; a failed read shows the error and Retry, and Retry reads again; the button navigates to `uiTestRunPath`; another test's run served by the mock never renders.
  - Verify: `pnpm exec vitest run src/pages/UiTestDetailsPage/UiTestLatestRunCard.test.tsx && pnpm run type-check`

- [x] **7.2** Recent Runs card: the Runs tab becomes a card (rename), without the System column
  - Covers: AC-04, AC-05, AC-09 (close target, copy link). Depends on: none. Lane B.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestRecentRunsCard.tsx` (git mv from `UiTestRunsTab.tsx`), `frontend/src/pages/UiTestDetailsPage/UiTestRecentRunsCard.test.tsx` (git mv from `UiTestRunsTab.test.tsx`), `frontend/src/components/studio/runs/RunRow.tsx`
  - Notes: component `UiTestRecentRunsCard({ testId })` (it no longer reads `useUiTestDetailContext`; `testId` is a prop). Wrap the content in `Card variant="outlined"` + `CardHeader title="Recent Runs"` + `CardContent`; keep the note, empty text, loading, error, table, pager, drawer and snackbar exactly as in `UiTestRunsTab.tsx` L97-210 and keep its `data-testid`s (`ui-test-runs-note`, `ui-test-runs-empty`, `ui-test-runs-loading`, `ui-test-runs-pagination`); the root testid becomes `ui-test-recent-runs` (was `ui-test-runs-tab`). `closeRun` becomes `navigate(uiTestPath(testId))` (L87); `uiTestRunsPath` is no longer imported. Read `executionId` with `useParams<{ executionId?: string }>()` as today (React Router 6 hands a layout route the params of its matched child; the routes test in 7.3 proves it). Drop the `System` header cell (L142), the `csiName` prop of `RunRow` (L14, L29) and its System cell (starts L66), the `fetchCSIs` effect and `csiNames` memo (L51-55) and the `csiName` argument (L153). Table fit: card content padding stays MUI's; keep the cell padding and `run-requested` wrapping `sx` of L129-136; apply the AC-05 ladder only if the e2e check of 7.4 shows an overflow: hide the Requested cells with `display: { xs: 'table-cell', lg: 'none' }` (the opposite direction of `hideBelowMd`, because the columns sit side by side from `lg`), then the Duration cells the same way (they are already hidden below `md`), then, if Run, Status and the menu alone overflow at 1200 px, reduce `width: 140` of the Status cell in `RunRow` and the `px` at `lg`. Estimate (inference, not measured): at 1440 the left column has about 400 px of content, Run, Status and the menu take about 300 px, Duration about 90 and Requested about 120, so the first rung is likely needed. Update the tests: `renderAt` mounts `UiTestRecentRunsCard` through the page route set of 7.3 (or a minimal `Routes` with `ui-tests/:id` and `runs/:executionId`), calls `uiTestPath(TEST_ID)` where it used `uiTestRunsPath`, the header assertion at L285-300 becomes `['Run', 'Status', 'Requested', 'Duration', 'Actions']`, a close test expects `uiTestPath(TEST_ID)` (L376). Listing tests that count `served.listCalls` must now filter the Latest run card's `size=1` call.
  - Verify: `pnpm exec vitest run src/pages/UiTestDetailsPage/UiTestRecentRunsCard.test.tsx src/components/studio/scheduling/scheduleProvenance.test.tsx` (no `type-check` here, see Parallelism)

- [x] **7.3** Shell, header card, Overview card, routes, helper removal
  - Covers: AC-01, AC-02, AC-03, AC-09, AC-10, AC-11. Depends on: 7.1, 7.2. Lane A.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestDetailsPage.tsx`, `UiTestDetailHeader.tsx`, `UiTestOverviewCard.tsx` (git mv from `UiTestOverviewTab.tsx`), `useUiTestDetail.ts`, `index.ts`, `UiTestDetailsPage.test.tsx`; `frontend/src/App.tsx`, `frontend/src/App.routes.test.tsx`; `frontend/src/components/studio/uiTestPaths.ts`, `uiTestPaths.test.ts`
  - Notes:
    - **Shell** (`UiTestDetailsPage.tsx`): keep the availability, loading, unavailable and error branches (L55-78) untouched. In the success branch (L80-99) remove `Tabs`, `Tab`, `RouterLink`, `Outlet`, `uiTestDetailTab` and the `uiTestPath`/`uiTestRunsPath` imports, and render the header, then a CSS grid: `Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 5fr) minmax(0, 7fr)' }, alignItems: 'start' }}` with the left column `Stack spacing={3}` of `UiTestOverviewCard` then `UiTestRecentRunsCard`, and the right column `UiTestLatestRunCard` (D1: `lg`, not `CheckDetailsPage`'s `md`; `minmax(0, ...)` so the table can never widen a column). Keep `data-testid="ui-test-detail"` and `p: { xs: 2, md: 3 }`. Add `data-testid="ui-test-detail-grid"`.
    - **Header card** (`UiTestDetailHeader.tsx`): wrap the existing content in `Card sx={{ mb: 2 }}` + `CardContent` (as `CheckDetailsPage.tsx` L144-145) in place of the root `Box` (L52). The `data-testid="ui-test-detail-header"` moves onto the `Card` (`UiTestDetailsPage.test.tsx` L547 and L803 use it). Content, actions, dialogs and the .6 note are not changed.
    - **Overview card** (`UiTestOverviewCard.tsx`): props `{ testId, test }` instead of `useUiTestDetailContext()`; wrap the existing `Stack` (L34-113) in `Card variant="outlined"` + `CardHeader title="Overview"` + `CardContent`; sections, order and testids (`ui-test-overview`, `ui-test-overview-readiness`, `-steps`, `-variables`, `-schedule`) unchanged.
    - **Plumbing**: in `useUiTestDetail.ts` delete `UiTestDetailTab`, `uiTestDetailTab`, `useUiTestDetailContext` and the `useOutletContext` import, and rewrite the header comment (L7-28) to describe the cards; keep `UiTestDetailContext` and `UiTestDetailHeaderProps` as plain types and `useUiTestDetail`. Update `index.ts` to export the default page, `UiTestDetailHeader`, and the three cards (type exports follow).
    - **Routes** (`App.tsx` L23-28, L116-120, L146-150): delete the two lazy tab imports; in both trees the block becomes `<Route path="ui-tests/:id" element={<FeatureGate featureKey="STUDIO"><UiTestDetailsPage /></FeatureGate>}><Route path="runs/:executionId" /></Route>` (a child route with no element: it only lets the URL match, and the page reads `executionId`). No `index` child, no `runs` child.
    - **Helper**: delete `uiTestRunsPath` from `uiTestPaths.ts` (L26-29); `uiTestRunPath` returns `` `${uiTestPath(id, options)}/runs/${encodeURIComponent(executionId)}` ``. In `uiTestPaths.test.ts` remove the `uiTestRunsPath` import and its four expectations (L13, L29, L39, L50); keep every `uiTestRunPath` expectation.
    - **Tests**: `App.routes.test.tsx` (mock the page as a sentinel that renders its params, without `Outlet` tab sentinels): `ui-tests/{id}` renders the page; `ui-tests/{id}/runs/{executionId}` renders the page and exposes the execution id; the bare `ui-tests/{id}/runs` lands on module home in both trees with no page rendered (build the path from parts as the existing `REMOVED_RUNS` constant does; S5 itself matches symbols only); the three paths are behind the STUDIO gate (`it.each` at L147-152 loses the bare `runs` row). `UiTestDetailsPage.test.tsx`: mount the real route set of App (`ui-tests/:id` with the `runs/:executionId` child) with the three real cards; replace the tabs test (L615-631) with: no `tab` role exists, the grid has the three cards in order, and `ui-test-recent-runs` precedes `ui-test-latest-run` in DOM order; `DETAIL_ROUTES` (L660-664) keeps `detail` and `run drawer`; a test that opening `uiTestRunPath` shows the drawer over the page and Close lands on `uiTestPath` with `GET /studio/tests/{id}` counted once; the 403/400/500/pending/off cases and the header, Overview and .6 learning-note cases (L257-613, L666-840) keep passing with only mount changes. Use `getByRole('table', { name: 'Runs of this UI test' })` unchanged.
  - Verify: `pnpm exec vitest run src/pages/UiTestDetailsPage src/App.routes.test.tsx src/components/studio/uiTestPaths.test.ts && pnpm run type-check && pnpm run lint`

- [x] **7.4** e2e fit checks and docs wording
  - Covers: AC-01 (stack), AC-05, AC-12. Depends on: docs none; e2e after 7.2 and 7.3. Lane C.
  - Files: `frontend/e2e/mobile-layout.spec.ts`, `CLAUDE.md`, `AGENTS.md`, `PRD.md`, `docs/architecture/studio-execution.md`
  - Notes: **e2e** (msw project). Rewrite the `UI test Runs tab at 390x844` block (L254-297): open `/checks/ui-tests/${UI_TEST_WITH_RUNS_ID}` (the seeded test with replays), read `ui-test-recent-runs`; keep the four measurements (table container no overflow; pager and both arrows inside the viewport via `expectInsideViewportWidth`; rows-per-page hidden), add: `document.documentElement.scrollWidth <= clientWidth`, and the cards are stacked (the Latest run card's top is below the Recent Runs card's bottom). Add one describe at 1440x900 (pattern of the editor-header describe, L300) and one at 1200x800: same document and table measurements, plus at 1440 that the Latest run card sits to the right of the Recent Runs card (its left edge is greater than the other card's right edge) and that the two columns' width ratio is within 5:7 plus or minus 10 percent. Print the measured numbers (the existing style). No axe, no a11y assertions. **Docs**: `CLAUDE.md` and `AGENTS.md` (identical lines) L101 "...and each has a detail page (Overview and Runs)" becomes "...and each has a detail page like any check's (header, Overview, Recent Runs and Latest run)"; L116 "UI test - Overview and Runs; opens Studio" becomes "UI test - Overview, Recent Runs and Latest run; opens Studio". `PRD.md` L113 "each with a detail page for Overview and Runs" becomes "each with a detail page with Overview, Recent Runs and Latest run". `docs/architecture/studio-execution.md` L237 "`ui-tests/:id`, `ui-tests/:id/runs` and `ui-tests/:id/studio` routes" becomes "`ui-tests/:id`, `ui-tests/:id/runs/:executionId` (the run drawer over the detail page) and `ui-tests/:id/studio` routes". Minimal wording only; no other doc line changes.
  - Verify: `pnpm run test:e2e -- e2e/mobile-layout.spec.ts` (from `frontend/`) and, from the repository root, `! grep -rn "Overview and Runs" CLAUDE.md AGENTS.md PRD.md docs/architecture`

- [x] **7.5** Final gate
  - Covers: all ACs. Depends on: 7.1–7.4.
  - Files: none (record the output in the Dev Agent Record)
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm run lint \
      && pnpm exec vitest run src/pages/UiTestDetailsPage src/components/studio/runs src/components/studio/scheduling/scheduleProvenance.test.tsx src/components/studio/uiTestPaths.test.ts src/App.routes.test.tsx \
      && pnpm run test:e2e -- e2e/mobile-layout.spec.ts \
      && ! grep -rnE "uiTestRunsPath|uiTestDetailTab|UiTestDetailTab|UiTestRunsTab|UiTestOverviewTab|useUiTestDetailContext" src e2e
    ```
  - Notes: the last command is scan S5 and must print nothing. `studio-guided.spec.ts` and `harness.spec.ts` do not open the detail page (grep: only `mobile-layout.spec.ts` navigates to `ui-tests/{id}` or `/runs`), so they are not rerun. The Vitest set is the directories this story edits plus `RunRow`'s other consumer; no wider sweep. Record any Vitest file that already failed before this story by name; never claim a check that did not run.

- [x] **7.6** Real-stack visual check (owner: coordinator, aiox-ux; not @dev)
  - Covers: all ACs. Depends on: 7.5.
  - Files: none (screenshots and `REPORT.md` to `docs/qa/evidence/STUDIO-UNIFY-001/visual-check-001.7/`, beside `visual-recheck-001.6/`)
  - Precondition: the real local backend, runner and seed running (`./dev.sh --seed` shape, as in the .6 re-check); no mocks. This story edits no backend file, so no backend restart is needed; the check records which commit and which uncommitted files were running.
  - Verify (manual, at 1440 and 390 px; screenshots of what is listed): a test with several replays (page structure, 5:7 columns, stacked at 390, pager fit, Latest run with the recording playing and the logs); a test with no replays (Latest run empty state); a failed replay (outcome and failing step in the Latest run card); a replay started from Studio and watched on the page (the Latest run card and the Recent Runs row move to terminal and the recording appears without a reload); the drawer from a row, from "Open run details" and by pasting the deep link, then Close back to `ui-tests/{id}`. The AC-05 numbers (document and table `scrollWidth`/`clientWidth` at 1440, 1200 and 390, and the column ratio) are taken from the 7.4 e2e output and copied into the REPORT, not re-measured by hand. The `UNLEARNED` failed-learn line and the forbidden or unknown id are covered by the Vitest cases kept in 7.3 and are not repeated here.

## Dev Notes

**Source authority.** The user decision quoted in the header table and the mock in the Context own the layout; the ACs own the wording the build must meet. Stories .1–.6 and the spec own what they delivered and are not edited. `CheckDetailsPage.tsx` is the structural reference only.

### Where things are (verified in the working tree, 2026-10-24)

| Area | Pointer |
|---|---|
| Target structure | `frontend/src/pages/CheckDetailsPage/CheckDetailsPage.tsx` L144-198 (header card), L200-315 (left column), L318-348 (right column) |
| Page shell | `pages/UiTestDetailsPage/UiTestDetailsPage.tsx` L55-99 |
| Read hook and types | `pages/UiTestDetailsPage/useUiTestDetail.ts` L47-61 (context types), L98-149 (`useUiTestDetail`) |
| Header | `pages/UiTestDetailsPage/UiTestDetailHeader.tsx` L52-170 |
| Overview content | `pages/UiTestDetailsPage/UiTestOverviewTab.tsx` L27-115 |
| Runs content | `pages/UiTestDetailsPage/UiTestRunsTab.tsx` L41-210 |
| Row | `components/studio/runs/RunRow.tsx` L29-100 |
| List hook and live refresh | `components/studio/runs/useStudioRuns.ts` L12-22, L57-125; `useLiveRunsRefresh.ts` (backoff 2 s x 1.5 up to 15 s) |
| Run rendering | `components/studio/runs/RunDetailsDrawer.tsx` L346-392; `run/ExecutionProgressView.tsx` L354-529; `evidence/VideoEvidencePanel.tsx`; `runs/runPresentation.ts` (`runDurationText`, `shortRunId`) |
| Paths | `components/studio/uiTestPaths.ts` L21-40 |
| Routes | `App.tsx` L116-120 (federated), L146-150 (standalone) |
| Wire shape | `docs/specs/studio/openapi.yaml` L999-1058; `backend/.../studio/ExecutionSnapshotMapper.java` L24, L180-182 |

### Design calls

| Call | Reason |
|---|---|
| Cards own their `Card` and `CardHeader`; the shell lays out only | Lets lanes A and B work in parallel and keeps each card testable alone. |
| The Latest run card uses a second small `useStudioRuns` (size 1) instead of sharing the table's read | The table can be on page 2 while the Latest run must stay the newest replay; a shared read would show the wrong run or go empty. The cost is one extra pair of list requests (the hook also asks the running count). |
| `streamComplete` decides when to stop polling the Latest run | A terminal status with `PROCESSING` evidence still lacks its recording; polling on status alone would leave "processing" on screen. |
| No `Outlet` and a child route with no element | The only remaining sub-route is the drawer URL; the page already reads `executionId`. One page, no tab children, no compat. |
| System column dropped in `RunRow` | One test per list, same CSI as the header; frees about 120 px in a 5/12 column. |

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The left column is narrow (about 430 px at 1440 with the sidebar, about 330 px at 1200); the table may not fit. | `minmax(0, ...)` columns, no System column, AC-05 measured at 1440, 1200 and 390, and the column-dropping ladder in task 7.2. |
| R2 | The Latest run card adds one list request pair per load and per poll tick beside the table's. | Size 1; polling only while the run is unsettled; Vitest `listCalls` assertions filter by size. |
| R3 | The Latest run card renders a video element and an unbounded log list in the right column. | Replay logs are a handful of lines; the card is not sticky; the drawer keeps its own collapsed log view. |
| R4 | The working tree holds uncommitted .6 work in files this story edits (`UiTestDetailHeader.tsx`, `UiTestRunsTab.tsx` and its test, `UiTestDetailsPage.test.tsx`, `RunDetailsDrawer.tsx`, `mobile-layout.spec.ts`). | Build on the working tree; do not revert anything; @devops/coordinator commits .6 first if a clean base is wanted. |
| R5 | A layout route's `useParams()` must see the child route's `executionId` (React Router 6 shares matched params across a branch). | The route set is used in the page tests of 7.3; if it fails, read the id with `useMatch('ui-tests/:id/runs/:executionId')` in the card. |
| R6 | Hiding the System column changes the .2 header-list assertion and any test counting `Actions`/`System`. | Listed in task 7.2; `scheduleProvenance.test.tsx` passes no `csiName` and is rerun. |
| R7 | The spec §8.2–§8.4 and FR-09–FR-12 still describe tabs. | This story supersedes the layout by user decision; the spec and the Done stories are not edited (Drafting flags, D7). |

### Cross-story handoff

`accumulated-context.md` does not exist in this repository, so coherence is recorded here. From .2: load gating, `RunRow`, `RunDetailsDrawer.expectedTestId`, `uiTestRunPath`. From .6: `LastLearningAttemptNote` in the header (its seven tests in `UiTestDetailsPage.test.tsx` L525-613 must still pass), the N4 pager `sx`, the log numbering and closing-line time (applied by `ExecutionProgressView`). Superseded by this story: .2's Overview/Runs tabs (AC-10..AC-12 layout parts), the `ui-tests/:id/runs` route and its helper, and the .6 e2e block "UI test Runs tab at 390x844" (rewritten in 7.4).

### Testing

Narrow checks only (project preference): Vitest per component and for the routes, the Playwright msw project for the pixel claims (7.4), the final gate (7.5), the real-stack check (7.6). No accessibility tests, no axe, no WCAG record (ADR-SC-006).

## CodeRabbit Integration

**Story Type Analysis**
- Primary type: Frontend (page layout, one new component).
- Secondary types: routing and route removal; test migration; docs wording.
- Complexity: M.

**Specialized Agent Assignment**
- Primary: @dev (implementation and pre-commit review), @qa (gate).
- Supporting: @ux-design-expert for the empty-state and card wording and the breakpoint (D1, D4), visible text and layout only, no accessibility review; @devops only for a later, separately authorised push. @dev does not push.

**Quality Gate Tasks**
- [ ] Pre-Commit (@dev): run the configured CodeRabbit review before marking the story complete. The CLI is WSL-based; if it is unavailable, record that it was not run, apply the configured graceful degradation, and do an independent manual diff review. Never claim a run that did not happen.
- [ ] Independent review (@qa): each AC against the code and tests; nothing renders or is requested before the test read succeeds; no run of another test renders; the tab route and helpers are gone (S5); no backend, runner or API diff; the 7.6 screenshots.
- [ ] Pre-Commit and Pre-PR (@devops): only if a PR is later authorised. No PR is implied.

**Self-Healing Configuration** (`.claude/rules/coderabbit-integration.md`): @dev phase light mode, max 2 iterations, CRITICAL and HIGH only; @qa phase full mode, max 3 iterations.

**Focus Areas**
- Primary: load gating survives the move out of the Outlet; the Latest run card shows the newest replay of this test only and stops polling on `streamComplete`; the removed route lands on module home with no redirect.
- Secondary: strict TypeScript, MUI `sx`, no new dependency, no horizontal overflow at 1440, 1200 and 390 px.
- Not a focus area: accessibility (ADR-SC-006).

## Definition of Done

- All 6 task checkboxes are ticked and each verification passes; 7.6 is recorded by the coordinator with screenshots at 1440 and 390 px.
- The 12 acceptance criteria hold.
- `pnpm run type-check`, `pnpm run lint`, the Vitest groups of 7.5 and `e2e/mobile-layout.spec.ts` pass; scan S5 prints nothing; `grep -rn "Overview and Runs" CLAUDE.md AGENTS.md PRD.md docs/architecture` prints nothing.
- The only changes are the frontend files and the four doc lines named in the consumer table. No backend, API, contract, runner, schema or Flyway change; `CheckDetailsPage` is untouched; no new dependency, redirect, alias or compat layer; no accessibility work. pnpm only.
- The File List and Dev Agent Record are filled in by @dev. Status moves follow `story-lifecycle.md` (@dev: InProgress, then InReview; @qa: Done).

## Drafting flags and decisions pending

| # | Item | Default chosen here | For @po (or owner) | Changes if overruled |
|---|---|---|---|---|
| F1 | [AUTO-DECISION] ClickUp epic lookup and story task creation (task steps 5.1-5.4) | Not performed (reason: this mission writes one local story file and was given no ClickUp authority) | none | none |
| D1 | Breakpoint. `CheckDetailsPage` goes two-column at `md` (900 px). At `md` with no sidebar the left column is about 345 px, too narrow for the runs table; the sidebar appears from 1200 px | Two columns from `lg` (1200 px), stacked below; "mobile" in the user's words covers tablets too | Confirm `lg`. Alternative: `md` and accept dropping table columns earlier | AC-01, AC-05, task 7.3 |
| D2 | Latest run read. The table's paging means the table's first row is not always the newest replay | A second `useStudioRuns` (size 1) in the Latest run card, no new server read | Confirm. Alternative: one shared read and a Latest run that follows the table page (wrong on page 2) | AC-06, AC-07, tasks 7.1, 7.2 |
| D3 | Recent Runs columns. The user's mock lists "#id status duration"; today's table also has Requested and System | Drop System (redundant with the header CSI); keep Requested and the row menu; drop Requested then Duration only if the fit measurements fail | Confirm | AC-04, AC-05, task 7.2 |
| D4 | Latest run content. The mock lists status, duration, time, video and logs; `ExecutionProgressView` is the one reusable piece that renders logs and it also shows the outcome and step results | Use it as is (logs on, no seek-to-step, no rerun); empty-state and card wording delegated to @ux | Confirm. Alternative: logs only, which needs a change to the shared view | AC-06, AC-08, task 7.1 |
| D5 | Component and testid names. "Tab" names would mislead after this story | Rename `UiTestOverviewTab` to `UiTestOverviewCard`, `UiTestRunsTab` to `UiTestRecentRunsCard`, root testid `ui-test-runs-tab` to `ui-test-recent-runs`; other testids kept | none | tasks 7.2, 7.3 |
| D6 | Mobile order. `CheckDetailsPage` stacks left then right | Header, Overview, Recent Runs, Latest run | Confirm. Alternative: Latest run before Recent Runs on mobile | AC-01, task 7.3 |
| D7 | Spec drift. `spec.md` §8.2–§8.4 (L308-345), `requirements.json` FR-09–FR-12 and stories .2/.5 describe the tabs | Not edited (historical, Done); this story supersedes the layout | @po to decide whether to add a "superseded by STUDIO-UNIFY-001.7" note to the spec | none here |
| D8 | The drawer's not-found button reads "Back to runs" (`RunDetailsDrawer.tsx` L348); it now returns to the detail page | Left as is (the page still lists the runs) | Confirm, or rename to "Back to test" | one string and its test |
| D9 | `.6` is Done but uncommitted (HEAD `dc1fbb7d4`); several files this story edits carry its changes | Draft is written against the working tree | @devops/coordinator to commit .6 before .7 starts if a clean base is wanted | none |

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-24 | 0.1.0 | Draft created from the user decision "Align to check page" (2026-10-24): tabs dropped, `CheckDetailsPage` structure adopted (header card; left Overview and Recent Runs; right Latest run). Frontend only; consumers of the removed runs-list route and tab helpers listed and assigned; lanes A–C. ClickUp sync not performed (F1). | River (@sm) |
| 2026-10-24 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready. Precision fixes only (compile order between 7.2 and 7.3, AC-05 column-drop direction and last rung, header testid, local in-progress constants, narrower 7.5 and 7.6); D1–D9 ruled in the PO Validation section. | @po |
| 2026-10-24 | 0.2.0 | Status: Ready → InProgress. Executed as Lean work item STUDIO-UNIFY-001.7 in waves (W1 lanes A 7.1, B 7.2, C docs; W2 A 7.3; W3 C e2e, then B's AC-05 ladder), one writer per file set. | Claude Code (@dev role) |
| 2026-10-24 | 0.3.0 | Status: InProgress → InReview. Tasks 7.1–7.4 done; File List and Dev Agent Record filled; handed to the 7.5 gate (Lean bound checks) and the independent Lean review. 7.6 follows acceptance on the real local stack. | Claude Code (@dev role) |
| 2026-10-24 | 1.0.0 | Status: InReview → Done. Lean candidate 859c5d7a accepted: 6/6 bound checks PASS; independent review PASS. Task 7.6 real-stack check READY WITH FIXES (M1 Running row overflows Recent Runs at 390; m1 header stale while a run is watched; m3 390 padding outdent) → follow-up STUDIO-UNIFY-001.8. Evidence `docs/qa/evidence/STUDIO-UNIFY-001/visual-check-001.7/`. | Claude Code (coordinator) |

## PO Validation (2026-10-24)

**Verdict: GO, 8/10. Status Draft → Ready.** Pax (@po), `validate-next-story.md` in YOLO mode with the 10-point checklist of `story-lifecycle.md`. Authority: user decision 2026-10-24 "Align to check page". No ACs were added or removed; the fixes below are wording and precision.

**10-point checklist.** 1 title: pass. 2 description: pass (user story plus the verbatim mock). 3 testable ACs: pass (Given/When/Then, measured limits in AC-05, exact route outcomes in AC-11). 4 scope In/Out: pass (Out names the `CheckDetailsPage` extras that are not ported). 5 dependencies: pass (.1–.6; .6 uncommitted, D9). 6 size: pass (M, three lanes). 7 business value: pass (UI tests read as checks). 8 risks: pass (R1–R7), with the R1 fix below. 9 Definition of Done: pass. 10 alignment: pass (single path, no compat, frontend only, pnpm, no a11y per ADR-SC-006; the epic's own spec §8 is superseded by user decision, D7). Executor `@dev`, quality gate `@qa` follow the epic's convention (.1–.6). CodeRabbit section present (enabled in the project config), with the WSL fallback worded.

**Verified against the working tree (read, not run).**
- `CheckDetailsPage.tsx` L144-145 header `Card`, L200 `Grid container`, L202 `md={5}`, L205 and L277 outlined cards, L318 `md={7}`, L319 sticky "Live Output" card: all as cited.
- `UiTestDetailsPage.tsx` L55-99 (tabs, `Outlet`, `uiTestDetailTab`), `useUiTestDetail.ts` (tab type, helper, `useOutletContext`), `index.ts` exports, `UiTestRunsTab.tsx` (columns, `fetchCSIs`, `csiNames`, `closeRun`, pager, drawer), `RunRow.tsx` (`csiName` prop and System cell), `App.tsx` L23-28, L116-120, L146-150, `uiTestPaths.ts` L26-34, `App.routes.test.tsx` sentinels and `it.each`, `mobile-layout.spec.ts` L254-297, the docs lines (`CLAUDE.md`/`AGENTS.md` L101 and L116, `PRD.md` L113, `studio-execution.md` L237): all as cited. `grep` for the removed symbols over `frontend/src` and `frontend/e2e` finds exactly the files in the consumer table. `RunRow` has one other consumer, `scheduleProvenance.test.tsx`, which passes no `csiName` and indexes no cell.
- `useStudioRuns` (testId, page, size, silent reload, extra RUNNING count request), `useLiveRunsRefresh` (2 s x 1.5 to 15 s), `ExecutionProgressView` (`showLogs`), `RunDetailsDrawer` L381-387 (the in-progress text is inline), `ExecutionSnapshotMapper` L24 (list items are the full snapshot) and L180-182 (`streamComplete`), MUI `^5.15.0`, React Router `^6.21.0` (a parent route sees its child's params, so the elementless `runs/:executionId` child works; R5 keeps the fallback).
- Lanes: A (`UiTestLatestRunCard*`, then the 7.3 set), B (`UiTestRecentRunsCard*`, `RunRow.tsx`), C (`mobile-layout.spec.ts`, four doc files) share no file. Verified.

**Fixes made in this validation**
1. **Compile order (was wrong).** The draft said every lane compiles throughout. The 7.2 rename leaves `UiTestRunsTab` references in `index.ts`, `App.tsx` and `UiTestDetailsPage.test.tsx`, which 7.3 owns, so `type-check` is red between 7.2 and 7.3. 7.2 now verifies with Vitest only; `type-check` is the gate from 7.3. No shim.
2. **AC-05 ladder.** `hideBelowMd` hides below `md`, the wrong direction: the columns sit side by side from `lg`. The ladder now says "from `lg` up" and 7.2 gives the `sx`. A last rung was missing: at 1200 px Run, Status and the menu alone take about 300 px of about 300 available, so a dead end was possible; the Status cell width and the `lg` padding may now shrink, and an inner horizontal scroll is excluded. The estimate is marked as an inference.
3. **Header card testid.** `ui-test-detail-header` (used at `UiTestDetailsPage.test.tsx` L547, L803) moves onto the `Card`.
4. **In-progress text.** Module constants local to the new card; the drawer stays untouched (the draft said "exported constants" while forbidding drawer edits). `FailedStepSummary` is drawer-private and not reused.
5. **7.5 and 7.6 made proportionate.** 7.5 runs Vitest on the directories this story edits plus `RunRow`'s other consumer (the draft ran all of `src/pages` and `src/components/studio`). 7.6 drops the two scenarios already covered by Vitest (failed-learn line, forbidden id) and takes the AC-05 numbers from the 7.4 e2e output instead of re-measuring.
6. **Scope Out (spec).** Clarified that the spec note is @po's, not part of the build.

**Decisions ruled**
- **D1 accepted.** Two columns from `lg`. At `md` with no sidebar the left column is about 345 px, too narrow for the table; stacking below 1200 px is the pragmatic fit.
- **D2 accepted.** A second `useStudioRuns` (size 1) is a read the API already has; a shared read would show the wrong run on table page 2. The extra RUNNING-count request is accepted (R2).
- **D3 accepted, with one expectation.** System is dropped (redundant with the header CSI). The user's mock rows read "#id status duration"; Requested is kept only while it fits and is expected to drop from `lg` up (fix 2). Nothing is lost: the drawer and tooltips carry the time.
- **D4 accepted.** `ExecutionProgressView` as is (logs on, no seek, no rerun); no change to the shared view. Empty-state wording stays with @ux.
- **D5 accepted.** The renames stop "Tab" names misleading; only the root testid changes.
- **D6 accepted.** Header, Overview, Recent Runs, Latest run on mobile, as `CheckDetailsPage` stacks; DOM order equals visual order.
- **D7 accepted, no dev work.** The build does not edit the spec, requirements or Done stories. A one-line "layout superseded by STUDIO-UNIFY-001.7" note under spec §8 is cheap; it is @po's, outside this one-file validation, and the coordinator can authorize it at close. Leaving it out does not block the build.
- **D8 accepted.** "Back to runs" still fits: the detail page lists the runs. One string, not worth a change.
- **D9 accepted.** Build on the working tree; commit .6 first only if the coordinator wants a clean base.

**Conditions (none blocks)**
- @qa checks nothing renders or is requested before the test read succeeds, that no run of another test renders, that the S5 scan prints nothing, and that no backend, runner, API or accessibility work was added.
- Known accepted limit: a terminal run whose recording stays `PROCESSING` keeps the Latest run card polling at the 15 s ceiling while the page is open; the drawer has the same property.

## Dev Agent Record

### Agent Model Used

Coordinator: Claude Opus 5.5 (main session). Lanes: aiox-dev subagents on Sonnet 5.5, effort high — lane A (7.1, 7.3), lane B (7.2 and the AC-05 ladder), lane C (7.4 docs, then e2e).

### Debug Log References

Lean work record `~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.7/` (binding, contract, plan, logs).

### Completion Notes

- 7.1 (lane A): `UiTestLatestRunCard` with its own size-1 `useStudioRuns` read (D2); picks the newest run whose `testId` matches the route id (defensive, same result for a correct server). Reuses `ExecutionProgressView` and `VideoEvidencePanel`; empty state "No replays yet. Learning happens in Studio; run the test from there and its result appears here." 13 tests.
- 7.2 (lane B): `UiTestRunsTab` → `UiTestRecentRunsCard` (plain `mv`); `RunRow` lost the System column (`csiName`) and gained `data-column` markers on Requested and Duration; Close returns to `uiTestPath(testId)`. Shell-only tests moved to the page test (7.3). 11 tests.
- 7.3 (lane A): single page — header `Card` (`ui-test-detail-header`), `ui-test-detail-grid` 5fr/7fr from `lg`, stacked below; Overview card (plain `mv` from `UiTestOverviewTab`); `ui-tests/:id/runs` route, `uiTestRunsPath`, `uiTestDetailTab`, `UiTestDetailTab`, `useUiTestDetailContext` removed; drawer child route `runs/:executionId` has `element={null}` so React Router logs no element warning. Page test 45 (incl. held-test-read gating, 403 with 200 executions, LEARNING chip, drawer open/close with one test read); routes test 26; paths test 5. type-check green, lint 0 errors.
- 7.4 (lane C): docs lines in `CLAUDE.md`, `AGENTS.md` (L101, L116), `PRD.md` L113, `docs/architecture/studio-execution.md` L237; e2e `mobile-layout.spec.ts` — Runs-tab describe replaced by detail-page fit checks at 390, 1440 and 1200.
- AC-05 ladder (lane B, after the e2e measured 291/276, 496/373 and 496/273): Requested and Duration hidden from `lg` through the card table's `sx` (other `RunRow` consumers unchanged), cell padding `lg: 1`, card `CardContent` padding `xs: 0.5` (coordinator widened the margin from `xs: 1`). Measured: 390 table 300/300, 1440 373/373, 1200 273/273; page never scrolls sideways; columns 5:7 (0.714). Playwright mobile-layout 9/9.
- Not run: CodeRabbit (WSL CLI unavailable on this macOS host). 7.5 runs as the Lean bound checks; 7.6 is the coordinator's real-stack check after acceptance.

### File List

Modified: `frontend/src/pages/UiTestDetailsPage/UiTestDetailsPage.tsx`; `UiTestDetailHeader.tsx`; `useUiTestDetail.ts`; `index.ts`; `UiTestDetailsPage.test.tsx`; `frontend/src/components/studio/runs/RunRow.tsx`; `frontend/src/App.tsx`; `frontend/src/App.routes.test.tsx`; `frontend/src/components/studio/uiTestPaths.ts`; `uiTestPaths.test.ts`; `frontend/e2e/mobile-layout.spec.ts`; `CLAUDE.md`; `AGENTS.md`; `PRD.md`; `docs/architecture/studio-execution.md`; this story file.

New: `frontend/src/pages/UiTestDetailsPage/UiTestLatestRunCard.tsx` (+ test).

Renamed (plain `mv`, unstaged): `UiTestRunsTab.tsx` → `UiTestRecentRunsCard.tsx`; `UiTestRunsTab.test.tsx` → `UiTestRecentRunsCard.test.tsx`; `UiTestOverviewTab.tsx` → `UiTestOverviewCard.tsx` (all in `frontend/src/pages/UiTestDetailsPage/`).

## QA Results

**Gate (Lean, 2026-10-24): PASS.** Candidate 859c5d7a accepted.

- Bound checks 6/6 PASS: type-check; lint (0 errors); vitest-story 120/120 (UiTestDetailsPage folder, studio runs, scheduleProvenance, uiTestPaths, App routes); Playwright msw mobile-layout 9/9 (fit at 390, 1200, 1440); route scan S4; symbol scan S5.
- Independent review (aiox-qa): PASS on AC-01..AC-12, non-blocking: the e2e fit uses a 3-row fixture; Requested and Duration drop together from `lg`; DoD met (7.5/7.6 boxes were open at review time).
- Task 7.6 real-stack check (real backend, runner, Vertex): READY WITH FIXES. Structure, Latest run (recording plays, live update without reload), drawer from row / "Open run details" / deep link, empty and Cancelled states all work; no HTTP >= 400 or console errors. Follow-up STUDIO-UNIFY-001.8 for M1 (a Running row at 390 overflows the Recent Runs table: 310/300), m1 (the header's status and last run stay stale while a run is watched) and m3 (390 note and table outdented from the card title). m2 and m4 are accepted rulings (D3, D6); polish p1–p6 out. A FAILED replay could not be produced on the real stack (not verified).
- Not run: CodeRabbit (WSL CLI unavailable on this host).
