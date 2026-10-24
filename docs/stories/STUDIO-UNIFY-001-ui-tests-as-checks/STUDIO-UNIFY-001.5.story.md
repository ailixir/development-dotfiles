# Story STUDIO-UNIFY-001.5 — Visual-pass fixes: Run guidance, not-available states, navigation names and mobile layout

| Field | Value |
|---|---|
| Story ID | STUDIO-UNIFY-001.5 |
| Status | **Done** |
| Epic | STUDIO-UNIFY-001-ui-tests-as-checks — UI tests as checks (Flow 1, frontend-only), follow-up increment 5 (after the four planned increments) |
| Depends on | STUDIO-UNIFY-001.4 |
| Dependency notes | Needs stories .1–.4 Done (they are). Reuses `uiTestPaths.ts` (1.2), `useUiTestAvailability` (1.3), the `StudioUnavailable` module (2.1), `UiTestDetailsPage` and its not-available state (2.5), `uiTestStatus.ts` (2.2) and the catalog rows in `AllChecksPage` (3.x). B1 (guided governance provisioning on the local stack) is **not** this story; it is local stack configuration handled separately. |
| Source | Expert visual pass on the real stack after .1–.4 were Done: `docs/qa/evidence/STUDIO-UNIFY-001/visual-pass-20261024/REPORT.md`, screenshots in `docs/qa/evidence/STUDIO-UNIFY-001/visual-pass-20261024/shots/`. The report's own line 4 still names the session scratchpad; the shot names are the same. User decision 2026-10-24, verbatim: "Fix all Majors and Minors" (M1, M2, m1–m11). Polish p1–p8 are out of scope. |
| Size | **M**. 14 acceptance criteria, 17 tasks, about 15 production files in 8 independent lanes. No new component family; most items are one-file edits. |
| Drafted by | River (@sm), 2026-10-24, from the visual-pass report, checked against the code at commit `5c160a2ae` |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["Vitest-RTL-MSW", "Playwright-msw-project", "type-check", "lint", "removed-route-scan-S4", "real-stack-visual-recheck", "CodeRabbit-or-documented-manual-fallback"]

Fifth story of `STUDIO-UNIFY-001-ui-tests-as-checks`. It fixes what a human-style pass over the built stack found once the four planned increments were Done. It adds no feature: it makes refusals say what to do, makes the not-available state the same everywhere, finishes the rename that .1–.3 deliberately postponed, makes the mobile layout usable, and removes console noise. No code starts before @po moves this story to Ready.

## Story

**As a** Checks user (on desktop or a phone),
**I want** the UI test screens to tell me what to do when something is refused or missing, to use the same names as the unified flow, and to fit my screen,
**so that** I am never left with a green button that does nothing, a full editor for a test I cannot open, or a table I have to scroll sideways.

## Context

The visual pass verdict was "NOT READY (run path blocked)". The block (B1) is environment provisioning, not code. Everything else it found is in this story. Each finding was re-checked against the current code while drafting; the result is in the table below, because four findings are not exactly as reported.

### Findings verified against the code (2026-10-24)

| Finding | Verified | What the code shows |
|---|---|---|
| M1 Run stays enabled after refusal | Confirmed, with a constraint | `useRunGate` reads capabilities only **after** Run is pressed and saved (`useRunGate.ts` L448-471), so Run cannot be disabled in advance. The refusal is `learnBlock {kind:'unavailable'}` shown by `GuidedStartFeedback` (`GuidedCompletion.tsx` L322-326, L364-377): developer-style sentence plus the raw code. Chosen fix: a plain caption beside Run (AC-01). |
| M2 Missing test renders the whole editor | Confirmed | `ChecksStudioPage.tsx` L1320-1324: `testUnavailable` only swaps one summary line; header, Save, Templates, coach, steps and "Add a test step" all render. |
| m1 "UI Tests" link opens the detail page | Confirmed | L1157-1184: breadcrumb "All Checks" › non-link name; a separate "UI Tests" `Button` goes to `uiTestPath(openTestId)`. |
| m2 260 px gap on mobile | Confirmed | L1344: `flex: '1 1 260px'` on Environment inside a column `Stack` below `sm`; the basis becomes height. |
| m3 Mobile opens scrolled 593 px | **Cause unknown** | No `autoFocus`. Best hypothesis (inference, not verified): `OnboardingCoach.tsx` L45-48 calls `scrollIntoView({block:'center'})` on mount and on every step change. Second candidate: the step-focus effect at `ChecksStudioPage.tsx` L486-495. |
| m4 Mobile table 491 px wide | Confirmed, one correction | `AllChecksPage.tsx` L593 and `UiTestCatalogRow.tsx` L92 already hide **Last Execution below md**, so on a phone that value is not reachable at all, not just behind a scroll. |
| m5 Create form validation silent | Confirmed | `UiTestCreateForm.tsx` L53-54, L138: disabled button only; the CSI helper text exists but nothing names a missing or blank name. |
| m6 Missing detail page is bare | Confirmed | `UiTestDetailsPage.tsx` L66-72: one `Typography`, no heading, no way back. |
| m7 Old names | Confirmed | `CommandPalette.tsx` L19 "Studio"; `ChecksStudioPage.tsx` L1323, L1328 "Open Tests"; unrouted `DashboardPage.tsx` L762 "Open Checks Studio". |
| m8 Console errors | Confirmed, cause found for part | `apiClient.ts` L72-80 logs every error; L92-103 retries a GET that has no response, and a cancelled request has none, so one cancelled request logs three times (inference from the code; AC-10 proves it). The RunControl prop-type warning is **not** identified by reading; task 5.7 reproduces it. |
| m9 Create form below the fold on mobile | Confirmed | `CreateCheckPage.tsx` L443-455: the full `CheckTypeSelector` card grid renders above the form. |
| m10 Standalone mobile has no navigation | **Different cause** | The mobile "Navigation" button and drawer already exist (`ChecksLayout.tsx` L124-141, L167; pinned by `ChecksLayout.a11y.test.tsx`). `LayoutProvider.tsx` L38-46 classes any `localhost` dev server not on port 5173 as **federated**, and federated + mobile hides the sidebar and the button. The pass ran Vite on :5181. See decision D3. |
| m11 Navigation differs from CLAUDE.md | Confirmed | `navigationSetup.ts` registers Home / Checks / Reports. `CLAUDE.md` L110-118 lists Dashboard, All Checks, Create Check, Reports. `DashboardPage` is rendered by no route (only `entryPoints.test.tsx` imports it); `/checks` renders `HomePage`. |

## Scope

**In:** the 14 acceptance criteria below, one per finding (m8 split in two): Run refusal guidance; the shared not-available state for the editor and the detail page; the editor breadcrumb; mobile layout of the editor, All Checks and Create Check; create-form reasons; the rename of the Studio-era names; cancelled-request logging and the RunControl prop-type warning; standalone mode detection; the CLAUDE.md and AGENTS.md navigation tree.

**Out:** B1 and any guided-governance provisioning; polish p1–p8 (type label wrap, orange "Not learned" chip, repeated name, "Back to runs" wrap, Splunk banner on Create, `?type` not written to the URL, CitiSansDisplay font 404, mobile step field width); deleting the unrouted `DashboardPage` (see decision D4); any backend, API, schema or Flyway change; any new dependency; Flow 2; any accessibility work.

## Constraints (cited from the project rules)

- **Frontend only.** Edits only in `frontend/src` and `frontend/e2e`, plus the two doc files in AC-14. No backend, API, schema or Flyway change. No new dependency. **pnpm only** (user and project rule).
- **Single path, no compat.** Studio is unreleased (memory `feedback_single_path_no_compat`, user decision D7 of this epic): no legacy routes, redirects or compat layers. Renames replace the old name; nothing keeps the old label.
- **Accessibility is out of scope.** ADR-SC-006, `.claude/rules/accessibility-scope.md`, user decision 2026-10-23 "We dont need WCAG". No a11y ACs, tasks, ARIA tuning or axe in this story. Visible labels and visible text, focus that is part of a flow, and the responsive mobile-first layout **do** count: AC-04, AC-05, AC-06, AC-12 and AC-13 are layout work, and the captions in AC-01 and AC-07 are visible text.
- **Code rules** (project `CLAUDE.md`): MUI v5 `sx` styling, strict TypeScript, all HTTP through the centralized API client, unit tests for logic and component tests for UI.
- **Harness B** (`frontend/e2e`) pins the Run and Stop button names (`Run Test`, `Stop`, `Stopping…`). AC-01's new guidance is a **caption**, never a renamed or added button label.
- **Reuse, do not rebuild:** `uiTestPaths.ts`, `useUiTestAvailability`, the `StudioUnavailable` module (text and DOM of the feature-off state stay as they are), `UiTestDetailsPage`'s not-available branch, `uiTestStatus.ts`, the catalog rows in `AllChecksPage`.

## Acceptance Criteria

Each AC is one finding of the visual pass; the bracketed tag gives the finding id and the code facts. Wording that needs a product decision carries the default chosen here and a pointer to "Drafting flags and decisions pending".

- **AC-01 (Run refusal says what to do)** *[M1; useRunGate L470-473; GuidedCompletion L322-326; see D1]* Given a test with steps whose Run press ends in a guided-start refusal that the page shows through `GuidedStartFeedback` (for example capabilities `guidedStart {available:false, code:RUNTIME_INCOMPATIBLE}`), when the refusal shows, then a plain-language caption beside the Run button states that nothing was started and what to do next, without naming a cause; the alert carries the raw code only as a secondary line labelled "Reference"; pressing Run again replaces the message and never stacks a second `guided-start-feedback`; and the Run button's accessible name and visible text stay `Run Test`. The caption is absent when no refusal is showing.
- **AC-02 (Missing or forbidden test shows no editor)** *[M2; ChecksStudioPage L1320-1324; see AC-08]* Given `/checks/ui-tests/{id}/studio` where `GET /studio/tests/{id}` answers 403 or 400, when the page settles, then the page shows only the shared not-available state (AC-08) and none of the editor: no "Checks Studio" title, no save-state chip, no coach, no step guidance, no "Add a test step", no Templates, Save, Run or Manage schedule control; and no request is sent to `/checks/{id}`. Given a 500 or no response, the existing load error behaviour is unchanged.
- **AC-03 (Editor breadcrumb is a path)** *[m1; ChecksStudioPage L1157-1184]* Given the editor open on a readable test, when the header shows, then the breadcrumb reads All Checks › {test name} › Studio, where "All Checks" links to `/checks/all`, the test name links to `ui-tests/{id}`, and "Studio" is the current, non-link item; the separate blue "UI Tests" button is gone; and both links obey the same unsaved-changes leave guard as the in-page back.
- **AC-04 (Editor environment row fits on mobile)** *[m2; ChecksStudioPage L1333-1344]* Given a 390 px wide viewport, when the editor's Test setup card shows, then the Environment field and the Variables button are separated by no more than 24 px of vertical space; at `sm` and wider the row keeps its current side-by-side layout.
- **AC-05 (Editor opens at the top on mobile)** *[m3; hypothesis OnboardingCoach L45-48; see D5]* Given a 390x844 viewport and a test that has steps, when the editor finishes loading, then the window scroll position is at most 16 px (as on desktop) and the header with Save and Run is inside the viewport. The investigation outcome (the actual cause, and why the fix addresses it) is recorded in the Dev Agent Record. If the cause is the coach's `scrollIntoView`, the coach no longer scrolls itself into view on first mount; user-triggered coach steps may still scroll.
- **AC-06 (All Checks table fits on mobile)** *[m4; AllChecksPage L577-704; UiTestCatalogRow L50-138]* Given a 390 px wide viewport on `/checks/all` with a UI test row and a regular check row, when the table shows, then the table container has no horizontal overflow (scroll width not larger than client width); the row actions (Run in Studio and the more-actions menu for UI test rows, Execute and the menu for check rows) are fully visible; the pager arrows are fully visible; and the row's last-execution value is still shown, as a caption under the name below `md`, with the Last Execution column unchanged from `md` up.
- **AC-07 (Create UI test form says what is missing)** *[m5; UiTestCreateForm L53-54, L138]* Given the UI test create form, when "Create and open Studio" is disabled because the name is empty or only whitespace, or no system is chosen, or the name is too long, then visible text next to the button names the missing item ("Enter a name to continue.", "Choose a system to continue.", or the length limit), listing every missing item; the name field shows its error state once it has been left; the text is absent when the button is enabled and while the test is being created.
- **AC-08 (One not-available state)** *[m6; UiTestDetailsPage L66-72; StudioUnavailable L17]* Given `ui-tests/{id}` or a runs route under it where the test read answers 403 or 400, when the page settles, then it shows a heading, the existing message "This UI test doesn't exist or you don't have access" (unchanged text), and a "Back to All Checks" button that goes to `/checks/all`; nothing from the test or its runs renders; and the editor (AC-02) renders the same component, so the two screens cannot drift.
- **AC-09 (Names match the unified flow)** *[m7; supersedes AC-09 and DC-09 "repoint without renaming" of stories .1–.3; see D2]* Given the built frontend, when the command palette, the editor and the Dashboard component are inspected, then the palette entry reads "UI tests" (still shown only when availability is `'on'`, still opening `/checks/all?type=UI_TEST`); every remaining "Open Tests" button in the editor reads "Back to UI tests" and still opens `/checks/all?type=UI_TEST`; the Dashboard quick action reads "Open UI tests"; and no source string "Open Tests", "Open Checks Studio" or a palette "Studio" entry remains in `frontend/src` outside test titles that describe the rename.
- **AC-10 (Cancelled requests are not errors)** *[m8; apiClient L72-103]* Given a GET that is cancelled (axios cancel or an aborted `AbortController` signal, as All Checks does when a newer list request supersedes it), when the request rejects, then no `API Error` is logged through `console.error` and the request is not retried; and for a genuine failure (network error, 5xx, 4xx) logging and the GET retry behave exactly as before.
- **AC-11 (No prop-type warning from RunControl)** *[m8; RunControl.tsx]* Given the editor mounting with a readable test, when the page renders, then React logs no "Failed prop type" or other prop-type warning attributed to `RunControl`; the root cause (which prop, and which caller) is recorded in the Dev Agent Record.
- **AC-12 (Create form reachable on mobile)** *[m9; CreateCheckPage L443-455; see D6]* Given a 390 px wide viewport on `/checks/create?type=UI_TEST`, when the page loads, then the form's Name field starts no lower than 700 px from the top of the page: below `sm` the type cards are collapsed behind a one-line summary of the chosen type with a "Change type" button that shows them again. At `sm` and wider the page is unchanged.
- **AC-13 (Standalone dev server is standalone on any port)** *[m10; LayoutProvider L38-46; ChecksLayout L124-167; see D3]* Given the Vite standalone entry served on any port, when the app starts, then the layout mode is `standalone`, and below 1200 px the "Navigation" button shows and opens the sidebar drawer. Given the federated build loaded by a host (no standalone entry executed), then the mode detection is exactly the current one and the federated host-shell behaviour does not change.
- **AC-14 (Navigation docs match the sidebar)** *[m11; navigationSetup L10-34; CLAUDE.md L110-118; see D4]* Given the registered module navigation, when `CLAUDE.md` and `AGENTS.md` are read, then their navigation tree lists exactly what the sidebar shows (Home, Checks, Reports; Reports is hidden only when the REPORTS feature is explicitly disabled), with UI tests under Checks (Overview and Runs, opening Studio) and Create Check described as opened from the Checks page, not as a sidebar entry; "Dashboard" is no longer claimed; the tree is stated once for both modes, because standalone and federated render the same registered `checks` module navigation (`PlatformSidebar` reads it from `navigationRegistry`); the deployment mode only decides whether the module shows it below 1200 px (standalone: the "Navigation" button and drawer; federated: none, the host shell provides navigation), and the docs say so in one line; the existing `navigationSetup.test.ts` pins the registered ids, labels and paths and the REPORTS-off case; and `navigationSetup.ts` itself is unchanged.

### Traceability: AC to tasks

| AC | Tasks |
|---|---|
| AC-01 | 5.6 |
| AC-02 | 5.1, 5.3 |
| AC-03 | 5.4 |
| AC-04 | 5.5, 5.14 |
| AC-05 | 5.5, 5.14 |
| AC-06 | 5.9, 5.14 |
| AC-07 | 5.10 |
| AC-08 | 5.1, 5.2, 5.3 |
| AC-09 | 5.4, 5.12 |
| AC-10 | 5.8 |
| AC-11 | 5.7 |
| AC-12 | 5.11, 5.14 |
| AC-13 | 5.13 |
| AC-14 | 5.15 |

Task 5.16 (gate) and 5.17 (real-stack re-check) cover every AC.

## Tasks / Subtasks

Run every command from `frontend/`. Use **pnpm only**. Tick a box only when its verification passes. Line numbers were read on 2026-10-24 and may drift; re-read before editing (R11 of the epic). Test files are listed with the task that changes them.

**Parallelism.** The "Files" lists below are disjoint across lanes, so lanes can run in parallel. Within a lane, tasks share a file and run in order.

| Lane | Tasks | Shared file set |
|---|---|---|
| A (editor page) | 5.3 → 5.4 → 5.5 | `ChecksStudioPage.tsx`, `OnboardingCoach.tsx`, `pageFraming.test.tsx`, `pageRunGate.test.tsx` |
| B (Run control) | 5.6 → 5.7 | `RunControl.tsx`, `GuidedCompletion.tsx`, `guidedNarratives.ts` and run/guided tests |
| C (API client) | 5.8 | `apiClient.ts` |
| D (All Checks) | 5.9 | `AllChecksPage.tsx`, `UiTestCatalogRow.tsx` |
| E (Create) | 5.10, 5.11 (independent of each other) | `UiTestCreateForm.tsx` / `CreateCheckPage.tsx` |
| F (names) | 5.12 | `CommandPalette.tsx`, `DashboardPage.tsx`, `entryPoints.test.tsx` |
| G (layout mode) | 5.13 | `LayoutProvider.tsx`, `main.tsx` |
| H (docs) | 5.15 | `CLAUDE.md`, `AGENTS.md`, `navigationSetup.test.ts` |
| Shared first | 5.1 → 5.2 | `StudioUnavailable.tsx` then `UiTestDetailsPage.tsx` (5.3 waits for 5.1) |
| After lanes | 5.14, 5.16, 5.17 | new e2e spec, then gates, then visual re-check |

- [x] **5.1** Add a shared `TestNotAvailable` state to the StudioUnavailable module (heading, unchanged message, "Back to All Checks")
  - Covers: AC-02, AC-08. Depends on: none.
  - Files: `frontend/src/components/studio/StudioUnavailable.tsx`, `frontend/src/components/studio/StudioUnavailable.test.tsx`
  - Notes: keep `StudioUnavailable` (feature off) and `TEST_NOT_AVAILABLE_MESSAGE` byte-identical. The new component takes the root `data-testid` as a prop so the detail page keeps `ui-test-detail-unavailable` and the editor keeps `studio-test-unavailable`. The button navigates with the router to `/checks/all` (no `window.location`).
  - Verify: `pnpm exec vitest run src/components/studio/StudioUnavailable.test.tsx && pnpm run type-check`

- [x] **5.2** Detail page uses `TestNotAvailable` for the 403/400 branch (m6)
  - Covers: AC-08. Depends on: 5.1.
  - Files: `frontend/src/pages/UiTestDetailsPage/UiTestDetailsPage.tsx`, `frontend/src/pages/UiTestDetailsPage/UiTestDetailsPage.test.tsx`
  - Notes: replace the L66-72 `Box`. Keep the `!id` guard. Test: heading, message, back button target, and (existing) no `/checks/{id}` request and no test content.
  - Verify: `pnpm exec vitest run src/pages/UiTestDetailsPage`

- [x] **5.3** Editor shows only the not-available state when the route test read is 403/400 (M2)
  - Covers: AC-02, AC-08. Depends on: 5.1.
  - Files: `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `frontend/src/pages/ChecksStudioPage/pageFraming.test.tsx`
  - Notes: add an early `if (testUnavailable) return <TestNotAvailable … />` in `ChecksStudioPageInner` **after the last hook** and before the main `return` (L1137); never before a hook. Remove the now-dead `testUnavailable` branch in the summary block (L1320-1324). Rewrite the pageFraming case at L298-306 (it asserted "Open Tests" on the unavailable state): assert the not-available state, the back button target, and that no editor control (Save, Run Test, Templates, "Add a test step", the "Checks Studio" title) is in the document.
  - Verify: `pnpm exec vitest run src/pages/ChecksStudioPage/pageFraming.test.tsx src/pages/ChecksStudioPage/pageRunGate.test.tsx && pnpm run type-check`

- [x] **5.4** Editor breadcrumb All Checks › {name} › Studio; rename the remaining "Open Tests" (m1, m7 editor part)
  - Covers: AC-03, AC-09. Depends on: 5.3 (same file).
  - Files: `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `frontend/src/pages/ChecksStudioPage/pageFraming.test.tsx`, `frontend/src/pages/ChecksStudioPage/pageRunGate.test.tsx`
  - Notes: L1157-1184. The name segment is a link to `uiTestPath(openTestId)` through `requestNavigation` (as the "All Checks" link does) once the test is read, and plain text before. The current item reads "Studio" (`data-testid="studio-breadcrumb-current"`). Delete the "UI Tests" button. The two tests that click `button 'UI Tests'` (`pageFraming.test.tsx` L238, L249; `pageRunGate.test.tsx` L230) now click the breadcrumb link by name and keep their assertions (clean leave goes to the detail path; dirty leave opens the dialog first). Rename the "No test selected" button (L1328) to "Back to UI tests".
  - Verify: `pnpm exec vitest run src/pages/ChecksStudioPage && pnpm run type-check`

- [x] **5.5** Editor mobile layout: Environment row height (m2) and scroll-on-open (m3)
  - Covers: AC-04, AC-05. Depends on: 5.4 (same file).
  - Files: `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`, `frontend/src/components/studio/OnboardingCoach.tsx`, `frontend/src/pages/ChecksStudioPage/pageFraming.test.tsx`
  - Notes: m2: replace `flex: '1 1 260px'` (L1344) with a basis that applies only from `sm` (for example `{ xs: '0 0 auto', sm: '1 1 260px' }`). m3 is an **investigation first**: (1) reproduce in the Playwright msw project at 390x844 and log `window.scrollY` after load; (2) test the hypothesis by disabling the coach's mount-time `scrollIntoView` (L45-48), then the step-focus effect (L486-495); (3) fix the real cause; (4) write the cause and evidence in the Dev Agent Record. Expected outcome: editor opens at the top on mobile. Do not remove the coach's scroll when the user presses Next. Vitest: a component test that mounting the coach on step 0 does not call `scrollIntoView`, if that is the cause.
  - Verify: `pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio && pnpm run type-check`

- [x] **5.6** Run refusal caption and plain wording, raw code secondary (M1)
  - Covers: AC-01. Depends on: none.
  - Files: `frontend/src/components/studio/run/RunControl.tsx`, `frontend/src/components/studio/guided/GuidedCompletion.tsx`, `frontend/src/components/studio/guided/guidedNarratives.ts`, and the tests that assert the changed copy (find them with `pnpm exec vitest run src/components/studio` and fix only the ones that fail for this reason)
  - Notes: add a `Typography variant="caption"` beside Run with `data-testid="run-start-unavailable"`, shown when `startFeedback?.kind === 'unavailable'` or the refusal view is the RUNTIME_INCOMPATIBLE one (`runtimeIncompatibleView`, GuidedCompletion L327-335). Copy comes from `guidedNarratives.ts` entries (each entry needs `basis`, `source` and `note` like its neighbours; mark the new wording `delegated` to @ux per D1). The alert keeps its warning style; the code line gets a "Reference:" prefix and stays monospace and selectable so it can be quoted in a ticket (existing intent of `reasonShownBelow`). Do not change `RUN_LABEL`. Do not pre-disable Run (capabilities are read only after the press, `useRunGate` L448).
  - Verify: `pnpm exec vitest run src/components/studio/run src/components/studio/guided && pnpm run type-check`

- [x] **5.7** Find and fix the RunControl prop-type warning (m8)
  - Covers: AC-11. Depends on: 5.6 (same file).
  - Files: `frontend/src/components/studio/run/RunControl.tsx` (and the caller or child the warning names), `frontend/src/components/studio/run/runGate.test.tsx`
  - Notes: if the warning names a prop passed by `ChecksStudioPage.tsx`, that one-file edit joins lane A and runs after 5.5 (same file); otherwise lane B stays independent. Reproduce first: render the editor in a Vitest page test with `vi.spyOn(console, 'error')` and read the "Failed prop type" message (it names the prop and the component). Fix the cause. Add a regression assertion that the mount produces no prop-type warning. Record the message and the fix in the Dev Agent Record.
  - Verify: `pnpm exec vitest run src/components/studio/run src/pages/ChecksStudioPage/pageRunGate.test.tsx`

- [x] **5.8** Cancelled requests are neither logged as errors nor retried (m8)
  - Covers: AC-10. Depends on: none.
  - Files: `frontend/src/services/api/apiClient.ts`, `frontend/src/services/api/apiClient.test.ts` (new)
  - Notes: in the response error interceptor, detect a cancelled request (`axios.isCancel(error)`, or `error.code === 'ERR_CANCELED'`) before the `console.error` at L72 and before the retry decision at L92-103; reject it without logging or retry. Keep the normalized error shape (callers such as `useUiTestCatalog` check their own `signal.aborted`). Tests: a cancelled GET logs nothing and is sent once; a 500 GET still logs and retries; a 404 logs once.
  - Verify: `pnpm exec vitest run src/services/api/apiClient.test.ts src/pages/AllChecksPage && pnpm run type-check`

- [x] **5.9** All Checks table fits a phone (m4)
  - Covers: AC-06. Depends on: none.
  - Files: `frontend/src/pages/AllChecksPage/AllChecksPage.tsx`, `frontend/src/pages/AllChecksPage/UiTestCatalogRow.tsx`, `frontend/src/pages/AllChecksPage/AllChecksPage.test.tsx`
  - Notes: both row kinds change together so the column set stays aligned (L590-594 header and L615-685 / `UiTestCatalogRow` L50-138 cells). Default: below `sm` hide the Type column (the UI test row keeps its flask icon beside the name), keep Status and Actions, and show the last-execution value as a caption under the name below `md`. Keep `data-testid` values (`ui-test-last-run-…` must exist exactly once per row: render the caption with its own testid or switch the existing element responsively, not both). The flask (`Science`) icon is in the Type cell today (`UiTestCatalogRow.tsx` L78-83), so hiding Type below `sm` would hide it: below `sm` render the icon beside the name in the name cell so UI test rows stay recognisable (PO ruling D7). The pager: below `sm` hide the rows-per-page selector so the arrows are not clipped. Vitest asserts structure (caption present, columns present); the pixel assertion is task 5.14.
  - Verify: `pnpm exec vitest run src/pages/AllChecksPage && pnpm run type-check`

- [x] **5.10** Create UI test form names what is missing (m5)
  - Covers: AC-07. Depends on: none.
  - Files: `frontend/src/components/checks/wizard/UiTestCreateForm.tsx`, `frontend/src/components/checks/wizard/UiTestCreateForm.test.tsx` (new)
  - Notes: derive the list of missing items from the same booleans that build `canSubmit` (L53-54); render one `Typography variant="caption"` before the submit button with `data-testid="ui-test-create-reason"`. Name error state after blur (`nameTouched`), as `csiTouched` does for the system field. Reuse the existing helper-text wording for the system ("Choose the system this test belongs to."). Tests: empty name, whitespace-only name, no CSI, too-long name, both missing, valid (no reason), creating (no reason).
  - Verify: `pnpm exec vitest run src/components/checks/wizard src/pages/CreateCheckPage && pnpm run type-check`

- [x] **5.11** Create Check on a phone: collapsed type cards for UI Test (m9)
  - Covers: AC-12. Depends on: none.
  - Files: `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx`, `frontend/src/pages/CreateCheckPage/CreateCheckPage.uiTest.test.tsx`
  - Notes: in the `isUiTest` branch (L443-455) render a summary row ("Type: UI Test" and a "Change type" button) that is visible below `sm` and toggles a local `typesOpen` state; the `CheckTypeSelector` box is `display: { xs: typesOpen ? 'block' : 'none', sm: 'block' }`. Choosing another type through the selector closes it as today (type changes leave the UI test branch). Do not write `?type` to the URL (p6, out of scope). Vitest asserts the summary and the toggle in DOM; the 700 px assertion is task 5.14.
  - Verify: `pnpm exec vitest run src/pages/CreateCheckPage && pnpm run type-check`

- [x] **5.12** Rename the palette entry and the Dashboard quick action (m7)
  - Covers: AC-09. Depends on: none.
  - Files: `frontend/src/components/home/CommandPalette.tsx`, `frontend/src/pages/DashboardPage/DashboardPage.tsx`, `frontend/src/components/home/entryPoints.test.tsx`
  - Notes: palette title "Studio" → "UI tests" (L19); keep the `STUDIO_PATH` constant name or rename it to `UI_TESTS_PATH` (rename, single path). Dashboard button text L762 → "Open UI tests". Update `entryPoints.test.tsx` (L75-115): the describe titles, `getByText('UI tests')`, and the button name regexp. Note the palette filter is a title substring match, so typing "studio" no longer finds it; that is accepted (D2). Check `frontend/e2e` has no pinned "Studio"/"Open Tests" text (none at drafting).
  - Verify: `pnpm exec vitest run src/components/home && pnpm run type-check`

- [x] **5.13** Standalone entry marks standalone mode (m10)
  - Covers: AC-13. Depends on: none.
  - Files: `frontend/src/main.tsx`, `frontend/src/components/layout/LayoutProvider/LayoutProvider.tsx`, `frontend/src/components/layout/LayoutProvider/LayoutProvider.test.tsx` (new)
  - Notes: `main.tsx` is the Vite standalone entry only (the host loads `remoteEntry`/`bootstrap`, never `main.tsx`). Set a flag there (default name `window.__CHECKS_STANDALONE__ = true`, declared in `vite-env.d.ts` if the project types globals there) **before** `Bootstrap` loads. In `detectDeploymentMode`, return `'standalone'` first when the flag is set; leave every other branch as it is. Tests: flag set on `localhost:5181` → standalone; flag unset and port 3000 → federated; unset on jsdom's localhost → unchanged (federated), as `ChecksLayout.a11y.test.tsx` documents.
  - Verify: `pnpm exec vitest run src/components/layout && pnpm run type-check`

- [x] **5.14** Mobile layout Playwright spec (m2, m3, m4, m9)
  - Covers: AC-04, AC-05, AC-06, AC-12. Depends on: 5.5, 5.9, 5.11.
  - Files: `frontend/e2e/mobile-layout.spec.ts` (new)
  - Notes: msw project, viewport 390x844, seeded demo tests from the MSW fixtures. Assertions: editor `window.scrollY` ≤ 16 after load; vertical gap between the Environment field and the Variables button ≤ 24 px; `/checks/all` table container `scrollWidth <= clientWidth`, row action buttons and pager arrows inside the viewport; `/checks/create?type=UI_TEST` Name field top ≤ 700 px. No axe, no a11y checks. If the msw fixtures hold no UI test with steps, add one through the existing fixtures, not through a new backend call.
  - Verify: `pnpm run test:e2e -- e2e/mobile-layout.spec.ts`

- [x] **5.15** Navigation docs match the sidebar and a test pins it (m11)
  - Covers: AC-14. Depends on: none.
  - Files: `CLAUDE.md`, `AGENTS.md` (repo root, "Navigation Structure" block, L110-118 in both), `frontend/src/utils/navigation/navigationSetup.test.ts`
  - Notes: write the tree as Home, Checks (All Checks including UI tests: Overview and Runs, opens Studio; Create Check opened from the Checks page), Reports, plus one line that the same tree shows in both modes and that below 1200 px it opens from the "Navigation" button in standalone and comes from the host shell in federated mode. Change nothing else in those files (the working tree may hold unrelated edits; check `git diff` first). `navigationSetup.test.ts` **already exists** and already asserts the ids `home`, `checks`, `reports` with no children (case "registers Home, Checks and Reports with no Studio group"); extend it, do not create a new file: add the labels and paths, and a case where the store holds `REPORTS` with `enabled: false` and `reports` is absent. `navigationSetup.ts` is not edited.
  - Verify: `pnpm exec vitest run src/utils/navigation && ! grep -n "Dashboard - Health overview" ../CLAUDE.md ../AGENTS.md`

- [x] **5.16** Final gate
  - Covers: all ACs. Depends on: 5.1–5.15.
  - Files: none (record the output in the Dev Agent Record)
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm run lint \
      && pnpm exec vitest run src/pages src/components src/services src/hooks src/utils/navigation src/App.routes.test.tsx \
      && pnpm run test:e2e -- e2e/mobile-layout.spec.ts e2e/studio-guided.spec.ts \
      && ! (grep -rnE "/checks/studio|path=\"studio|[}'\"\`]/studio/runs|['\"\`]/studio/tests/:id|path: '/studio'|CreateTestDialog|StudioTestsPage|StudioRunsPage|StudioListLayout|useUrlListState|useStudioTests|navigationConfig|UiTestConfig|LAST_RUN_FILTER_LABELS" src e2e | grep -v "citi/put/checks/studio") \
      && ! grep -rn "Open Tests\|Open Checks Studio" src e2e
    ```
  - Notes: `studio-guided.spec.ts` is the Harness B spec that pins Run/Stop names. The last `grep` may match test titles that quote the old names in a rename assertion; if so, narrow it to non-test files and say so in the record. Never claim a check that did not run.

- [x] **5.17** Real-stack visual re-check (owner: coordinator, not @dev)
  - Covers: all ACs. Depends on: 5.16.
  - Files: none (screenshots to `docs/qa/evidence/STUDIO-UNIFY-001/visual-recheck-001.5/`, beside the original pass in `visual-pass-20261024/`)
  - Verify (manual, on `./dev.sh --seed`): re-run the visual pass for M1, M2 and m1–m11 against the same test ids. Record before and after screenshots per finding (names as in REPORT.md plus `-after`). M1 will still end in a refusal on a stack without guided governance (B1): the check is that the caption appears and the code is secondary, not that learning starts. Run the Vite server on a port other than 5173 for m10.

## Dev Notes

**Source authority.** The visual-pass REPORT.md owns the findings; this story's AC text owns the wording the fixes must meet. Stories .1–.4 own everything they delivered; their text is not edited (they are Done). Where AC-09 here supersedes their "repoint without renaming" rule, the Change Log records it.

### Where things are (verified at commit `5c160a2ae`)

| Area | Pointer |
|---|---|
| Editor header, breadcrumb, Run control mount | `pages/ChecksStudioPage/ChecksStudioPage.tsx` L1137-1265 |
| Editor unavailable state, Environment row | same file L1320-1349 |
| Editor outer gate (feature off / pending) | same file L2076-2083 |
| Coach scroll | `components/studio/OnboardingCoach.tsx` L45-48 |
| Run gate, capabilities read after press | `components/studio/run/useRunGate.ts` L436-475 |
| Run control and alert slot | `components/studio/run/RunControl.tsx` L284-298, L302-334 |
| Refusal wording and view | `components/studio/guided/GuidedCompletion.tsx` L322-335, L364-377; copy keys in `guidedNarratives.ts` L686-700 |
| Not-available message, 403/400 predicate | `components/studio/StudioUnavailable.tsx` L17-23 |
| Detail page branches | `pages/UiTestDetailsPage/UiTestDetailsPage.tsx` L55-82 |
| All Checks table and row cells | `pages/AllChecksPage/AllChecksPage.tsx` L577-704; `UiTestCatalogRow.tsx` L50-138 |
| Create page branch for UI Test | `pages/CreateCheckPage/CreateCheckPage.tsx` L443-455; form `components/checks/wizard/UiTestCreateForm.tsx` |
| Palette entries | `components/home/CommandPalette.tsx` L13-21 |
| Mode detection and mobile nav | `components/layout/LayoutProvider/LayoutProvider.tsx` L35-56; `ChecksLayout.tsx` L52, L124-167 |
| Registered sidebar | `utils/navigation/navigationSetup.ts` L10-34 |
| API client logging and retry | `services/api/apiClient.ts` L72-103 |

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The early return for AC-02 sits before a hook and breaks hook order. | Place it after the last hook of `ChecksStudioPageInner`; the page tests mount both the unavailable and the readable path. |
| R2 | The copy registry in `guidedNarratives.ts` has source and basis checks (neighbouring tests read it). | Add entries in the same shape; run `src/components/studio/guided` before and after. |
| R3 | Responsive assertions do not run in jsdom (no layout, no media queries). | Vitest checks DOM structure; pixel claims are asserted only in the Playwright spec (5.14) and the coordinator's visual re-check (5.17). |
| R4 | The `?type=UI_TEST` mobile collapse hides the card grid from a Vitest query that looks for it. | The grid stays in the DOM (display toggled with `sx`), so existing queries still find it. |
| R5 | The mobile spec needs a UI test with steps in the MSW fixtures. | Use or extend the existing fixtures; do not add a backend route. |
| R6 | Renaming the palette entry changes which text finds it. | Accepted (D2); the palette still finds it by "ui" and "tests". |

### Cross-story handoff

`accumulated-context.md` does not exist in this repository, so coherence is recorded here. Reused artefacts: `StudioUnavailable.tsx` (2.1), `UiTestDetailsPage` branches (2.5), `uiTestPaths.ts` (1.2), `useUiTestAvailability` (1.3), catalog rows (3.x). Superseded text: AC-09 and DC-09 of stories .1–.3 on renaming (AC-09 here); CLAUDE.md navigation tree written by story .4 (AC-14 here corrects its first line).

### Testing

Narrow checks only (project preference). Vitest for logic and structure, Playwright msw project for the four pixel claims, the final gate in 5.16. No accessibility tests, no axe, no WCAG record (ADR-SC-006; the audit test was deleted in 1.1).

## CodeRabbit Integration

**Story Type Analysis**
- Primary type: Frontend (UX fixes across eight areas).
- Secondary types: copy changes, responsive layout, one doc edit.
- Complexity: M.

**Specialized Agent Assignment**
- Primary: @dev (implementation and pre-commit review), @qa (gate).
- Supporting: @ux-design-expert for the copy in AC-01 and the mobile defaults in AC-06 and AC-12 (layout and wording only, no accessibility review); @devops only for a later, separately authorised push. @dev does not push.

**Quality Gate Tasks**
- [ ] Pre-Commit (@dev): run the configured CodeRabbit review before marking the story complete. The CLI is WSL-based; if it is unavailable, record that it was not run, apply the configured graceful degradation, and do an independent manual diff review. Never claim a run that did not happen.
- [ ] Independent review (@qa): each AC against the code and tests, the Run button name unchanged (Harness B), no `/checks/{id}` request on the not-available states, the real-stack screenshots from 5.17.
- [ ] Pre-PR (@devops): only if a PR is later authorised. No PR is implied.

**Self-Healing Configuration** (`.claude/rules/coderabbit-integration.md`): @dev phase light mode, max 2 iterations, CRITICAL and HIGH only; @qa phase full mode, max 3 iterations.

**Focus Areas**
- Primary: hook order in the editor early return; the not-available states render nothing from the test; the cancel handling does not swallow real errors; mode detection leaves the federated path untouched.
- Secondary: strict TypeScript, MUI v5 `sx`, centralized API client only, responsive layout, no new dependency.
- Not a focus area: accessibility (ADR-SC-006).

## Definition of Done

- All 17 task checkboxes are ticked and each verification passes; 5.17 is recorded by the coordinator with screenshots.
- The 14 acceptance criteria hold. M1, M2 and m1–m11 are each fixed or, for m3 and m8's prop-type warning, explained in the Dev Agent Record with the actual cause and the fix.
- `pnpm run type-check`, `pnpm run lint`, the narrow Vitest suites, `e2e/mobile-layout.spec.ts` and `e2e/studio-guided.spec.ts` pass; scan S4 is still empty.
- No backend, API, schema or Flyway change, no new dependency, no redirect or compat layer, no accessibility work. pnpm only.
- Polish p1–p8 and B1 are untouched.
- The File List and Dev Agent Record are filled in by @dev. Status moves follow `story-lifecycle.md` (@dev: InProgress, then InReview; @qa: Done).

## Drafting flags and decisions pending

| # | Item | Default chosen here | For @po (or owner) | Changes if overruled |
|---|---|---|---|---|
| F1 | [AUTO-DECISION] ClickUp epic lookup and story task creation (task steps 5.1-5.4) | Not performed (reason: this mission writes one local story file and was given no ClickUp authority) | none | none |
| D1 | M1: Run cannot be disabled in advance (capabilities are read only after the press). Caption wording and remedy | Caption beside Run: nothing was started; ask your Studio administrator and quote the reference; no cause named (keeps the W5 UX-01 rule that a `RUNTIME_INCOMPATIBLE` refusal names no cause and no remedy). Raw code shown as a "Reference:" line. Wording delegated to @ux. | Confirm the wording and that a generic "ask your administrator" is acceptable. Alternative: disable Run after a refusal until the test or environment changes (changes `useRunGate`, larger). | AC-01, task 5.6 |
| D2 | m7: rename. This **supersedes** the earlier AC-09 and DC-09 "repoint without renaming" of stories .1–.3 | Palette "Studio" → "UI tests"; editor "Open Tests" → "Back to UI tests"; Dashboard "Open Checks Studio" → "Open UI tests". Stories .1–.3 text is left as a historical record. | Confirm the three labels and the explicit supersession. | AC-09, tasks 5.4, 5.12 |
| D3 | m10: the pass found "no navigation on standalone mobile". The menu already exists; the real cause is the port-based mode heuristic that calls Vite on any port but 5173 "federated". The brief asked for a minimal mobile menu; none is needed | Fix the detection: the Vite standalone entry (`main.tsx`) marks standalone mode; federated detection and host-shell behaviour are unchanged. No new menu. | Confirm. If the host shell is also expected to be detected differently, that is a separate change. | AC-13, task 5.13 |
| D4 | m11: sidebar is Home / Checks / Reports; CLAUDE.md says Dashboard, All Checks, Create Check, Reports; `DashboardPage` is unrouted | Least new surface: correct CLAUDE.md and AGENTS.md to the real sidebar and pin it with a test. No route is added and `navigationSetup.ts` is untouched. The Dashboard quick action stays unreachable and is no longer claimed. | Confirm. Follow-up for @po: the unrouted `DashboardPage` (about 845 lines, imported only by `entryPoints.test.tsx`) is dead code under the single-path rule; deleting it is a separate cleanup and would also retire the Dashboard clauses of AC-09 in .1 and .3. | AC-14, task 5.15 |
| D5 | m3: cause not known | Investigation inside task 5.5 with the stated expected outcome; hypothesis is the coach `scrollIntoView` | none unless the cause turns out to be elsewhere | AC-05 |
| D6 | m9: how to bring the form up on mobile | Collapse the type cards below `sm` behind "Type: UI Test" and "Change type"; no change at `sm` and wider. Alternative: move the form above the cards. | Confirm | AC-12, task 5.11 |
| D7 | m4: Last Execution is hidden below `md` today | Show it as a caption under the name below `md`; hide the Type column below `sm`; hide the rows-per-page selector below `sm` | Confirm the dropped Type column on phones | AC-06, task 5.9 |
| D8 | The visual-pass report lived in a session scratchpad | Resolved by @po 2026-10-24: copied by the coordinator to `docs/qa/evidence/STUDIO-UNIFY-001/visual-pass-20261024/`; Source row and task 5.17 point there | none | Source row, task 5.17 |
| D9 | m8 prop-type warning source unknown from reading | Task 5.7 reproduces it before fixing | none | AC-11 |

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-24 | 0.1.0 | Draft created from the expert visual-pass report (user decision 2026-10-24: "Fix all Majors and Minors"). Findings re-verified against the code at `5c160a2ae`; m4, m10 and m8 differ from the report (see Context). AC-09 supersedes the earlier "repoint without renaming" rule of .1–.3. ClickUp sync not performed (F1). | River (@sm) |
| 2026-10-24 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. D1–D9 ruled (all defaults accepted; D7 clarified, D8 resolved). AC-14 restated for both deployment modes (same registered tree; mode only decides mobile visibility). Task 5.15 extends the existing `navigationSetup.test.ts`; 5.9 moves the flask icon beside the name below `sm`; 5.7 lane note; evidence paths moved to `docs/qa/evidence/STUDIO-UNIFY-001/`. | Pax (@po) |
| 2026-10-24 | 0.2.0 | Status: Ready → InProgress. Executed as Lean work item STUDIO-UNIFY-001.5 with parallel aiox-dev lanes A–F (one writer per file set). | Claude Code (@dev role) |
| 2026-10-24 | 0.3.0 | Status: InProgress → InReview. Tasks 5.1–5.15 done (lanes A–F + 5.14); File List and Dev Agent Record filled; handed to the 5.16 gate (Lean bound checks) and the independent Lean review. 5.17 follows acceptance. | Claude Code (@dev role) |
| 2026-10-24 | 0.4.0 | Status: InReview → Done. Independent Lean review PASS (15/15); Lean acceptance recorded; task 5.17 real-stack re-check recorded (all 13 findings PASS; verdict READY WITH FIXES with new findings N1–N9 for a follow-up). | Quinn (@qa, aiox-qa subagent) + coordinator |

## PO Validation (2026-10-24)

**Verdict: GO, 9/10. Status Draft → Ready.** Pax (@po), `validate-next-story.md` in YOLO mode with the 10-point checklist of `story-lifecycle.md`. Authority: user decision 2026-10-24 "Fix all Majors and Minors" (M1, M2, m1–m11; p1–p8 out; B1 is local configuration). Confidence: high for the code facts and the navigation ruling, medium for AC-05 and AC-11, whose causes are found during the work (D5, D9).

**10-point checklist.** 1 title: pass. 2 description: pass (verdict, B1 split, verified-findings table). 3 testable ACs: pass (Given/When/Then, pixel limits for the four layout claims). 4 scope In/Out: pass. 5 dependencies: pass (.1–.4 Done; B1 excluded). 6 size: pass (M, 17 tasks, 8 lanes). 7 business value: pass. 8 risks: pass (R1–R6). 9 DoD: pass. 10 alignment: pass after the AC-14 restatement below. Deduction: two drafting inaccuracies (the "new" navigation test already exists; the flask icon is in the Type cell, not beside the name), both fixed in this pass.

**What was checked against the code at `5c160a2ae`**
- The cited lines hold: `ChecksStudioPage.tsx` breadcrumb and "UI Tests" button (L1157-1184), unavailable branch and "Open Tests" (L1320-1329), `flex: '1 1 260px'` (L1344), step-focus effect (L486-495); `OnboardingCoach.tsx` `scrollIntoView` on `[step]` (L45-48); `apiClient.ts` logging (L72) and GET retry with no response treated as retriable (L97-103); `UiTestCreateForm.tsx` `canSubmit` (L53-54) and the button (L138); `CreateCheckPage.tsx` UI Test branch (L443-455); `CommandPalette.tsx` "Studio" (L19); `DashboardPage.tsx` "Open Checks Studio" (L762); `StudioUnavailable.tsx` message and 403/400 predicate (L17-23); `UiTestDetailsPage.tsx` bare branch (L66-72). The three "UI Tests" clicks are at `pageFraming.test.tsx` L238, L249 and `pageRunGate.test.tsx` L230; no other file reads `studio-breadcrumb-current`. `frontend/e2e` holds no "Open Tests", "Open Checks Studio" or "UI Tests" text.
- MUI is `^5.15.0` in `frontend/package.json`, so the story's "MUI v5 `sx`" is correct (project `CLAUDE.md` says v7; not this story's concern).
- CodeRabbit section: `coderabbit_integration.enabled: true`; all subsections present; light/full self-healing as configured. `quality_gate: "@qa"` follows the epic's convention (story .4).

**Navigation ruling (coordinator note on port 5181, D3, D4, AC-13, AC-14)**
- Read `LayoutProvider.tsx` L35-48, `ChecksLayout.tsx` L19, L28-33, L52, L114-141, L167, `navigationSetup.ts`, `App.tsx` L92-100 and L108-167, `main.tsx`, `index.tsx`, `webpack.config.js` and `PlatformSidebar.tsx` in `put-core-components`.
- There is **one** sidebar definition. Both modes mount `ChecksLayout`, which registers `navigationSetup.ts` (Home `/checks`, Checks `/checks/all`, Reports `/checks/reports`, Reports hidden only when the REPORTS feature is explicitly disabled) and renders `PlatformSidebar currentModule="checks"`, which reads that registration from `navigationRegistry`. There is no separate standalone navigation config.
- Mode only gates visibility: `shouldShowSidebar = standalone || !isMobile` with `isMobile = down('lg')` (1200 px; no theme breakpoint override found). At desktop width both modes show the same sidebar, so `01-home.png` (1440 px, federated on :5181) is also the standalone sidebar. Below 1200 px standalone shows the "Navigation" button and drawer; federated shows nothing.
- Therefore m10 is a visibility bug only and m11 does **not** dissolve when AC-13 is fixed: the docs claim Dashboard and Create Check entries that no mode registers. AC-14 now states the tree once for both modes plus the mobile visibility difference.
- Side facts for @dev: the Playwright harness serves Vite on `127.0.0.1:4177`, and the heuristic only tests `hostname === 'localhost'`, so e2e runs already detect standalone; the 5.14 mobile spec will see the "Navigation" button above the content. The webpack dev server (:3002, `index.tsx` entry, `__webpack_require__` defined) stays federated, because the AC-13 flag is set only in `main.tsx`, which webpack never loads.

**Decisions ruled**
- **D1 accepted.** Caption beside Run, raw code as a "Reference:" line, no cause named, wording delegated to @ux. Pre-disabling Run is not possible without reading capabilities before the press, and the reviewer's expectation was "disabled **or** a caption", so the smaller change meets it.
- **D2 accepted.** "UI tests", "Back to UI tests", "Open UI tests", superseding AC-09/DC-09 of .1–.3. Single path rule: the old labels go.
- **D3 accepted.** The fix is mode detection in the Vite entry, not a new menu; the drawer already exists and is pinned by `ChecksLayout.a11y.test.tsx`. Federated detection unchanged.
- **D4 accepted.** Correct `CLAUDE.md`/`AGENTS.md` to the registered tree; no Dashboard route. Follow-up (backlog, not this story): the unrouted `DashboardPage` (imported only by `entryPoints.test.tsx`) is dead code under the single-path rule; deleting it is a separate cleanup that would retire its AC-09 label clause.
- **D5 accepted.** Investigate-then-fix inside 5.5; AC-05 states the measurable outcome either way.
- **D6 accepted.** Collapse the type cards below `sm`; nothing changes at `sm` and up, and the grid stays in the DOM (R4).
- **D7 accepted with a clarification.** Drop the Type column below `sm`, show last execution as a caption below `md`, hide rows-per-page below `sm`. The flask icon lives in the Type cell today, so task 5.9 now renders it beside the name below `sm`.
- **D8 resolved.** Evidence is in `docs/qa/evidence/STUDIO-UNIFY-001/visual-pass-20261024/`; the Source row and task 5.17 point there.
- **D9 accepted.** Reproduce the warning before fixing; if the caller is `ChecksStudioPage.tsx`, that edit runs in lane A after 5.5.
- F1 (no ClickUp sync) accepted.

**AC and task changes made in this validation**
- AC-14: Reports wording made exact; the tree applies to both modes; one line on the mobile visibility difference; the pinning test is the existing `navigationSetup.test.ts`.
- 5.15: extend the existing test (ids already pinned) with labels, paths and a REPORTS-disabled case; add the one-line mode note to the docs.
- 5.9: flask icon beside the name below `sm`. 5.7: lane note. 5.17: evidence folder.

**Conditions and follow-ups (none blocks)**
- @qa checks that `CLAUDE.md`/`AGENTS.md` change only in the Navigation Structure block (`git diff`), and that the accessibility exclusions of ADR-SC-006 hold (no ARIA, axe or keyboard work added).
- Backlog follow-up: delete the unrouted `DashboardPage` (D4).

## Dev Agent Record

### Agent Model Used

Coordinator: Claude Opus 5.5 (main session 651237b1). Lanes: aiox-dev subagents on Sonnet 5.5, effort high — A editor (a643db2d332236b6e), B run control (ad1056fa25f616887), C API client (a96406298b3d67cc4), D All Checks (a0da2e5afd6700194, incl. the 5.14 follow-up), E Create (a570f6feeb504930f), F names/layout/docs (a9c15286272e3c9e5), 5.14 mobile spec (a7e22c722c4431fba). One writer per file set.

### Debug Log References

Lean work record: `~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.5/` (binding, contract, plan, logs/). Lane notes: `dev-notes.md` there.

### Completion Notes

#### Lane F (5.12, 5.13, 5.15) — done
- 5.12: CommandPalette title 'Studio'→'UI tests' (L19), STUDIO_PATH→UI_TESTS_PATH; DashboardPage L762 "Open UI tests"; entryPoints.test updated.
- 5.13: main.tsx sets window.__CHECKS_STANDALONE__ = true before lazy Bootstrap; declared in vite-env.d.ts; LayoutProvider.detectDeploymentMode returns standalone first when set; new LayoutProvider.test.tsx (6 cases). Webpack (index.tsx) stays federated. Not run against unfixed code.
- 5.15: CLAUDE.md/AGENTS.md Navigation Structure block → Home / Checks (All Checks incl. UI tests; Create Check from Checks page) / Reports (hidden only when REPORTS disabled) + one-line mode note; navigationSetup.test.ts extended to 4 cases; navigationSetup.ts untouched.
- Verify: vitest home+layout+navigation 5 files/27 tests pass; eslint 0 errors; type-check clean; no e2e pins old names.
Files: CommandPalette.tsx, entryPoints.test.tsx, DashboardPage.tsx, main.tsx, vite-env.d.ts, LayoutProvider.tsx, LayoutProvider.test.tsx (new), navigationSetup.test.ts, CLAUDE.md, AGENTS.md
#### Lane E (5.10, 5.11) — done
- 5.10: UiTestCreateForm nameMissing/nameTooLong/systemMissing (L53-55) build canSubmit and the reason caption (data-testid ui-test-create-reason, L151-155; "Enter a name to continue." / "Shorten the name to 255 characters or fewer." / "Choose a system to continue."); nameTouched error on blur; data-testid ui-test-create-name. New UiTestCreateForm.test.tsx (13).
- 5.11: CreateCheckPage typesOpen state; below sm summary "Type: UI Test" (create-type-summary) + toggle "Change type"/"Hide types" (create-type-toggle); CheckTypeSelector wrapper create-type-cards with display {xs: open?block:none, sm:block} and data-open; selecting a type closes. 6 new tests appended.
- [AUTO-DECISION] open label "Hide types"; data-open attribute (jsdom ignores media queries; aria out of scope).
- Verify: vitest wizard+CreateCheckPage 58/58; eslint 0 errors; type-check clean.
- 5.14 selectors: [data-testid=ui-test-create-name], create-type-summary/toggle/cards, ui-test-create-reason.
Files: UiTestCreateForm.tsx, UiTestCreateForm.test.tsx (new), CreateCheckPage.tsx, CreateCheckPage.uiTest.test.tsx
#### Lane D (5.9) — done
- Below sm: Type column hidden (header, check rows, UI test rows); flask icon beside name in UI test rows (ui-test-name-icon-{id}, D7); rows-per-page hidden; tighter cell padding px {xs:1,sm:2}; action spacing {xs:0,sm:1}. Below md: "Last run: {value}" caption under the name (ui-test-last-run-caption-{id}, check-last-run-caption-{id}); ui-test-last-run-{id} still once per row. Names wrap anywhere; status chips wrap.
- Testids: all-checks-table-container, all-checks-pagination, check-row/execute/more-{id}, ui-test-run/more-{id}.
- [AUTO-DECISION] separate caption testid; caption wording "Last run: …".
- Verify: vitest AllChecksPage 4 files/109 pass; eslint 0 errors; type-check clean. Pixel check → 5.14 (estimate name column ~110 px at 390).
- 5.14 selectors: table container scrollWidth<=clientWidth; pager arrows [data-testid=all-checks-pagination] .MuiTablePagination-actions button.
Files: AllChecksPage.tsx, UiTestCatalogRow.tsx, AllChecksPage.test.tsx
#### Lane C (5.8) — done
- apiClient response interceptor detects axios.isCancel || ERR_CANCELED before console.error and the GET retry; rejects with the normalized error (shared normalizeError(), AxiosError-typed). Confirmed against HEAD: an aborted GET logged "API Error:" 3x (retry path; retries reused the aborted signal so never reached the server); a CancelToken cancel crashed with "Cannot read properties of undefined".
- New apiClient.test.ts (6): abort mid-flight, CancelToken, pre-aborted signal, 500 (3 sends/3 logs), 404 (1/1), network error (3/3). 3 of 6 fail on HEAD, all pass with fix.
- Verify: vitest services/api + AllChecksPage 11 files/176 pass; eslint 0 errors.
Files: apiClient.ts, apiClient.test.ts (new)
#### Lane B (5.6, 5.7) — done
- 5.6: RunControl caption run-start-unavailable (L181-186, L347-356) "Nothing was started. Ask your Studio administrator for help and quote the reference shown below." shown only on RUNTIME_INCOMPATIBLE refusal (server or capabilities); GuidedStartFeedbackView.unavailable flag (set only by runtimeIncompatibleView); alert code as secondary "Reference: <code>" (monospace, userSelect all); copy startUnavailableCaption/referenceLabel delegated to @ux (D1), storyUnify0015 in COPY_SOURCE_FILES. RUN_LABEL untouched, Run not pre-disabled; second press replaces, not stacks.
- Deviation accepted by coordinator: reasonShownBelow entry removed (contradicted the "Reference:" line).
- 5.7: reproduced on real page: "Invalid prop `children` supplied to `ForwardRef(Box)`, expected a ReactNode" at Box in RunControl. Cause: bare createPortal(alerts, alertsContainer) as a child of RunControl's root Box (PropTypes.node rejects portals). Fix: Fragment wrap (L428-433). Regression runGate.test (g4), mutation-checked. No ChecksStudioPage edit.
- Verify: vitest run/guided + pageRunGate + pageGuidedRun 16 files/522 pass; eslint 0 errors; type-check clean.
Files: RunControl.tsx, runGate.test.tsx, GuidedCompletion.tsx, guidedNarratives.ts, guided.test.tsx
#### Lane A (5.1-5.5) — done
- 5.1: TestNotAvailable(testId) in StudioUnavailable.tsx: h1 "UI test not available", unchanged message, "Back to All Checks" (router navigate /checks/all); StudioUnavailable and TEST_NOT_AVAILABLE_MESSAGE unchanged; 3 tests.
- 5.2: UiTestDetailsPage unavailable branch → <TestNotAvailable testId="ui-test-detail-unavailable"/>; tests updated + back-button test.
- 5.3: ChecksStudioPage early return <TestNotAvailable testId="studio-test-unavailable"/> after last hook; dead summary branch removed. pageFraming it.each([403,400]) asserts no editor controls, no /checks/{id} request, back target; 500 keeps editor.
- 5.4: breadcrumb All Checks › {name → uiTestPath(id), dirty guard via requestNavigation; plain "UI test" before read} › Studio (studio-breadcrumb-current); "UI Tests" button deleted; "No test selected" button → "Back to UI tests"; 3 tests click breadcrumb link.
- 5.5 m2: Environment flex {xs:'0 0 auto', sm:'1 1 260px'}: 390 px field 260→40 px, gap 12 px; 900 px unchanged.
- 5.5 m3 root cause: OnboardingCoach [step] effect scrollIntoView({behavior:'smooth',block:'center'}) on mount (editor starts with empty step list, coach mounts, smooth scroll starts). Playwright 390x844 msw: scrollY 342 baseline (with m2 fix) / 0 with coach scroll no-op'd / 342 with step-focus effect no-op'd; only caller OnboardingCoach.tsx:47. Fix: no scroll on first mount, scroll on step change; revealOnMount prop (page passes forceCoach for "Show guide"). After fix scrollY 0. New OnboardingCoach.test.tsx (3) + pageFraming no-scroll case.
- [AUTO-DECISION] heading "UI test not available"; pre-read crumb "UI test"; revealOnMount.
- Coordinator follow-up: pageLoadById.test.tsx (outside lane A) updated for AC-02 (403/400 and route change assert the not-available heading and no Run Test) → 7/7 pass.
- Verify: lane A vitest 169 pass + coordinator fix of 3; type-check clean; eslint 0 errors.
Files: StudioUnavailable.tsx(+test), UiTestDetailsPage.tsx(+test), ChecksStudioPage.tsx, pageFraming.test.tsx, pageRunGate.test.tsx, OnboardingCoach.tsx, OnboardingCoach.test.tsx (new), pageLoadById.test.tsx (coordinator)
#### Task 5.14 (aiox-dev, a7e22c722c4431fba) — spec written
- frontend/e2e/mobile-layout.spec.ts: 4 tests, msw, 390x844, fixture d0000000-...-0003; AC-06 check row injected via spec-local page.route (harness serves empty /checks); soft asserts; extra assertion: row actions inside the table container.
- Results: AC-05 scrollY 0; AC-04 gap 12 px; AC-12 Name top 529 px; AC-06 FAIL scrollWidth 371 > clientWidth 340 (checkbox 52, name 111, status 125, actions 84), more-menus right 388.3 > container 365. Harness + studio-guided 13/13 pass; eslint exit 0.
- Defect returned to lane D (resumed) for fix.
#### Lane D follow-up (5.9 → 5.14 green)
- Compact controls below sm (sm+ values = MUI defaults): compactChipSx (label 0.6875rem, px 0.75, height auto, label wraps), compactCheckboxSx p {xs:0.5, sm:1.125}, compactIconButtonSx p {xs:'3px', sm:'5px'}, in AllChecksPage.tsx (~L111) and UiTestCatalogRow.tsx (~L31). Testids unchanged.
- Measured 390x844: container 340/340; run buttons right 327; more buttons right 357 (container edge 365); pager 323/363.
- mobile-layout.spec 4/4; vitest AllChecksPage 109/109; eslint 0 errors; type-check clean.

Not run by the lanes: CodeRabbit (WSL CLI unavailable on this macOS host). 5.16 runs as the Lean bound checks; 5.17 is the coordinator's real-stack re-check after acceptance.

### File List

Modified: `CLAUDE.md`, `AGENTS.md` (Navigation Structure block only); `frontend/src/main.tsx`; `frontend/src/vite-env.d.ts`; `frontend/src/components/layout/LayoutProvider/LayoutProvider.tsx`; `frontend/src/components/home/CommandPalette.tsx`; `frontend/src/components/home/entryPoints.test.tsx`; `frontend/src/pages/DashboardPage/DashboardPage.tsx`; `frontend/src/utils/navigation/navigationSetup.test.ts`; `frontend/src/components/studio/StudioUnavailable.tsx`; `frontend/src/components/studio/StudioUnavailable.test.tsx`; `frontend/src/components/studio/OnboardingCoach.tsx`; `frontend/src/pages/UiTestDetailsPage/UiTestDetailsPage.tsx`; `frontend/src/pages/UiTestDetailsPage/UiTestDetailsPage.test.tsx`; `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx`; `frontend/src/pages/ChecksStudioPage/pageFraming.test.tsx`; `frontend/src/pages/ChecksStudioPage/pageRunGate.test.tsx`; `frontend/src/pages/ChecksStudioPage/pageLoadById.test.tsx`; `frontend/src/components/studio/run/RunControl.tsx`; `frontend/src/components/studio/run/runGate.test.tsx`; `frontend/src/components/studio/guided/GuidedCompletion.tsx`; `frontend/src/components/studio/guided/guidedNarratives.ts`; `frontend/src/components/studio/guided/guided.test.tsx`; `frontend/src/services/api/apiClient.ts`; `frontend/src/pages/AllChecksPage/AllChecksPage.tsx`; `frontend/src/pages/AllChecksPage/UiTestCatalogRow.tsx`; `frontend/src/pages/AllChecksPage/AllChecksPage.test.tsx`; `frontend/src/components/checks/wizard/UiTestCreateForm.tsx`; `frontend/src/pages/CreateCheckPage/CreateCheckPage.tsx`; `frontend/src/pages/CreateCheckPage/CreateCheckPage.uiTest.test.tsx`; this story file.

New: `frontend/src/components/layout/LayoutProvider/LayoutProvider.test.tsx`; `frontend/src/components/studio/OnboardingCoach.test.tsx`; `frontend/src/services/api/apiClient.test.ts`; `frontend/src/components/checks/wizard/UiTestCreateForm.test.tsx`; `frontend/e2e/mobile-layout.spec.ts`; `docs/qa/evidence/STUDIO-UNIFY-001/visual-pass-20261024/` (REPORT.md + 79 screenshots, copied by the coordinator per D8).

## QA Results

**Verdict: PASS** (independent AIOX Lean review, 2026-10-24). Reviewer: aiox-qa subagent (Sonnet 5.5, effort high; execution 651237b1:a3f63adc5434198da), fresh context, read-only, independent of all authors. Candidate `2637a7d9a5372b4194b6feb5c1a18819dd1baee886b42cfa3ac698146fd91259`; Lean acceptance recorded (engineering acceptance only). Payload: `~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.5/review-1.json`.

- All 15 criteria PASS: AC-01 through AC-14 and DOD.
- Bound checks on the same candidate (task 5.16): type-check; lint 0 errors; Vitest `src/pages` 413/413, `src/components` 784/784 (pre-existing `realStudioStartup.test.ts` excluded), services + hooks + navigation + routes 395/395; Playwright msw `mobile-layout.spec.ts` + `studio-guided.spec.ts` 12/12; scan S4 empty; old-names scan empty.
- Non-blocking findings: (1) `UiTestCreateForm.tsx` L51: while the CSI list is loading or errored the reason caption can briefly say "Choose a system to continue." even with a system selected (transient; button genuinely disabled); (2) the Run caption shows only for RUNTIME_INCOMPATIBLE refusals, consistent with task 5.6 and D1 (other refusals carry their own remedy); (3) `OnboardingCoach` step-change scroll branch cannot fire today because the coach renders only at step 0 (harmless).
- Not run: CodeRabbit (unavailable on host). Task 5.17 (real-stack visual re-check) follows acceptance; the story moves to Done when it is recorded.
- **Task 5.17 (real-stack visual re-check, coordinator via aiox-ux, 2026-10-24):** M1, M2 and m1–m11 all PASS with after screenshots; the run path works in the browser (learn ~21 s, publish, replay PASSED 1.1 s, Runs tab, drawer video, deep-link reload). Verdict READY WITH FIXES: new findings N1 (Major: failed learn does not name the failing step or the fix; learning runs show no logs), N2–N6 (Minor; N3 is a header layout side effect of the M1 caption), N7–N9 (polish). These are outside this story's ACs and go to a follow-up. Evidence: `docs/qa/evidence/STUDIO-UNIFY-001/visual-recheck-001.5/` (REPORT.md + 72 screenshots). Stack: real backend, studio-runner/Chromium and Vertex with guided governance provisioned locally; one stand-in for platform Core's session re-check on publish.
