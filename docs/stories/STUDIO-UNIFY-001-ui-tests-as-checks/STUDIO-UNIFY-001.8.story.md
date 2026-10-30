# Story STUDIO-UNIFY-001.8 — Detail page fixes from the .7 real-stack check: Running row fit at 390 (M1), card padding alignment (m3), header follows a watched run (m1)

| Field | Value |
|---|---|
| Story ID | STUDIO-UNIFY-001.8 |
| Status | **Done** |
| Epic | STUDIO-UNIFY-001-ui-tests-as-checks — UI tests as checks (Flow 1, frontend-only), follow-up increment 8 (after .7) |
| Depends on | STUDIO-UNIFY-001.7 (Done in the working tree, **not yet committed**; HEAD is `dc1fbb7d4`). .6 is also uncommitted. Reuses from .7: `UiTestRecentRunsCard`, `UiTestLatestRunCard`, `UiTestDetailsPage`, `useUiTestDetail().refresh`, the 390/1440/1200 e2e block in `mobile-layout.spec.ts`. No backend, API, schema, runner or Flyway file is touched. |
| Source | `docs/qa/evidence/STUDIO-UNIFY-001/visual-check-001.7/REPORT.md` (task 7.6, verdict READY WITH FIXES): finding **M1** (Major), **m1** and **m3** (Minor). Precedent (user decision on the .5 and .6 rounds): fix the Majors and Minors, leave polish out. |
| Size | **S**. 6 acceptance criteria, 4 tasks (2 build lanes, a gate, the coordinator's re-check). 3 production files, 3 test files, frontend only. |
| Drafted by | River (@sm), 2026-10-24, checked against the working tree at HEAD `dc1fbb7d4` plus the uncommitted .6 and .7 changes |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["Vitest-RTL-MSW", "Playwright-msw-project", "type-check", "lint", "real-stack-visual-recheck", "CodeRabbit-or-documented-manual-fallback"]

Eighth story of `STUDIO-UNIFY-001-ui-tests-as-checks`. It closes the three findings of the .7 real-stack check that the owner's rule says to fix: a Running row breaks the Recent Runs table at 390 px, the table and note are outdented from the card title at 390 px, and the page header stays stale while a run is watched. It adds no feature. No code starts before @po moves this story to Ready.

## Story

**As a** Checks user watching a UI test's replay on my phone or desktop,
**I want** the Recent Runs table to fit at any run status, to line up with its card title, and the header status to follow the run I just watched,
**so that** I can read and trust the page at the moment I use it most.

## Context

### What exists today (verified 2026-10-24, working tree)

| Question | Answer | Evidence |
|---|---|---|
| Which status chips can the table show? | Six: Pending, Running (the only chip with a spinner: 12 px `CircularProgress`, `ml: 6px !important`), Passed, Failed, Error, and Cancelled (`ERROR` with `errorCode CANCELLED`). A status outside the vocabulary is shown as sent, so it cannot be enumerated. | `components/studio/run/executionStatus.ts` L12-18, L20, L24-26, L32-37; `runs/RunStatusChip.tsx` L9-13, L28 |
| What is wider at 390 with a Running row? | Header cell right edges moved `129/207/286/345` to `129/217/296/355` against a container right edge of 345 (container starts at x 45): Run 84, Status 78 to 88, Requested 79, Actions 59, so 310 against 300. Only Status grew, which matches the chip being the cause (REPORT M1; the cause is the report's inference, the cell widths are its measurement). | `visual-check-001.7/REPORT.md` M1 |
| Where is the width taken at 390 today? | `CardContent sx={{ px: { xs: 0.5, sm: 2 } }}` (`UiTestRecentRunsCard.tsx` L97-101) and cell `px: { xs: 0.5, sm: 2, lg: 1 }` (L134). At `sm` and up `px: 2` is 16 px, which equals MUI's default `CardContent` padding, so removing the override changes nothing from `sm` up. Below `sm` it grows each side from 4 px to 16 px: **24 px less table width** (276 px instead of 300 px, inference from the report's 300 px). | `UiTestRecentRunsCard.tsx` L97-101, L126-141 |
| Which levers exist inside the card? | (1) the table `sx` (L130-141) can address any descendant, so no `RunRow` edit is needed; (2) header labels: `Requested` and `Actions` are single words, and the measured header widths 79 and 59 match their text plus 8 px padding, so the labels set those two columns' minimum widths (inference); (3) cell padding L134; (4) the chip label padding, by `.MuiChip-label`; (5) the Run link font size, by `[data-testid="run-link"]`. **Not levers:** the relative time is already compact (`12m ago`, `3h ago`, `2d ago`, `formatRelativeTime.ts` L26-36) and already allowed to wrap below `sm` (L140); Duration is already hidden below `md` (L148) and Requested and Duration from `lg` (L138). | `UiTestRecentRunsCard.tsx` L130-149; `RunRow.tsx` L41, L61, L64, L71, L81; `utils/time/formatRelativeTime.ts` |
| Who else uses `RunRow`? | Only `scheduleProvenance.test.tsx` (L6, L21-22) besides this card. This story does not edit `RunRow.tsx`. | `grep RunRow src e2e` |
| What does the header read? | `test.lastRunStatus` and `test.lastRunAt` of the `TestDto` the shell read once. The status chip is `uiTestStatus(test)`: for a READY test it is "Passing", "Failing", "Error" or "Not run" from `lastRunStatus`; the "Last run:" line prints `executionStatusLabel(test.lastRunStatus)` (no `errorCode`) and the relative `lastRunAt`, or "Never run". | `UiTestDetailHeader.tsx` L48, L63, L82-98; `components/studio/tests/uiTestStatus.ts` L57-58; `studioTypes.ts` L352-353 |
| What re-read exists? | `useUiTestDetail().refresh()`: one `studioApi.getTest`, replaces `test` on success, never blanks the page, never rejects (a 403/400 turns the page into the not-available message, as today). It is stable (`useCallback`, `[testId]`) and already passed to the header (used at `UiTestDetailHeader.tsx` L167 after the schedule dialog). The shell holds it in `context` and mounts `UiTestLatestRunCard testId` with no callback. | `useUiTestDetail.ts` L108-119; `UiTestDetailsPage.tsx` L45, L48-51, L100-102 |
| What does the Latest run card know? | Its own size-1 newest-first list read, `latest`, `latest.status`, `latest.streamComplete`; it polls while `!latest.streamComplete` through `useLiveRunsRefresh` (2 s x 1.5 up to 15 s). It has no reference to the test or the header. | `UiTestLatestRunCard.tsx` L32-48; `runs/useLiveRunsRefresh.ts` L14-18, L38-91 |
| Backend meaning of `lastRunAt` / `lastRunStatus` (reported, not changed) | They are a projection written by `StudioService.applyLastRunProjection` only when the finishing execution is the newest **terminal** one of that test by `startedAt DESC, id DESC`; it sets `lastRunAt = execution.getStartedAt()` and `lastRunStatus = status`, where status is `PASSED`, `FAILED` or `ERROR`. A cancel is stored as `ERROR` (its cancel detail is in `errorCode`, which `TestDto` does not carry), so a header can show "Error" for a cancelled run, never "Cancelled". The only call site is `ProgressReportService.afterFinal` (runner FINAL reports), invoked from `apply`, which is one `@Transactional` method with the status write; so, as an inference, a reader that sees the terminal status also sees the projection. A terminal state reached by any other writer would not move the projection (grep finds no other caller): consistent with the .7 R6 observation (header "Passing / Passed just now" beside a Cancelled Latest run), but the cause was not isolated. | `StudioService.java` L925-946; `UITestExecutionRepository.java` L38-45; `ProgressReportService.java` L145, L263, L281, L526-531 |
| Which seeded tests show the six chips with no fixture edit? | `demoFixtures.ts` run specs: test index 0 (`d0000000-0000-4000-8000-000000000001`, READY): RUNNING (L109), PASSED (L113), PASSED (L139). Test index 6 (`...000000000007`, READY): PENDING (L112), Cancelled (L117), ERROR `DISPATCH_DISABLED` (L149). Test index 1 (`...000000000002`, the one the .7 e2e opens): FAILED (L114), PASSED (L131), PASSED (L148). `DEMO_NOW = Date.now()` (L35), so relative times read `1m ago` etc. | `services/mocks/studio/demoFixtures.ts` |

## Scope

**In:**
- **M1** The Recent Runs table fits at 390 px for every one of the six status chips, with Run, Status and the row menu never hidden and no inner horizontal scroll.
- **m3** At 390 px the card content (note, empty/loading/error text, table) aligns with the card title: MUI's default card padding is restored below `sm`, and the width is found elsewhere (levers above).
- **m1** The header (status chip and "Last run") follows a replay watched on the page: when the Latest run card sees the newest replay go from not terminal to terminal, the test is re-read once through the existing `refresh`.
- The 390 e2e measures with a Running row and every other chip, and the title/content alignment; unit tests for the m1 trigger; the coordinator's real-stack re-check.

**Out:** m2 and m4 (accepted rulings D3 and D6 of .7); polish p1 to p6; any backend, API, schema or runner change (including making the last-run projection move for a cancel, or putting `errorCode` on `TestDto`); a poll or new read of the test; a trigger for a run that starts while the page shows a settled run (the Latest run card does not poll then, and this story does not add polling for it); `RunRow.tsx`, `RunDetailsDrawer`, `ExecutionProgressView`; fixtures; accessibility work (ADR-SC-006).

## Constraints

- **Frontend only. pnpm only.** MUI `sx`, strict TypeScript, all HTTP through the existing API client, no new dependency (project `CLAUDE.md`).
- **Single path, no compat** (memory `feedback_single_path_no_compat`): no flag, alias or duplicate component. The new `UiTestLatestRunCard` prop is optional and is the only contract change.
- **From `sm` up nothing changes visually** (verified: `px: 2` equals MUI's default). The 1440 and 1200 measurements of .7 (373/373, 273/273, 5:7) must still hold.
- **No new request pattern.** One `GET /studio/tests/{id}` per watched run reaching terminal; none per poll tick; no timer on the test read; no change to `useLiveRunsRefresh`.
- **Load gating of .2/.7 is unchanged**: nothing of the test, its runs or the drawer renders or is requested before the test read succeeds.
- **Accessibility is out of scope** (ADR-SC-006, `.claude/rules/accessibility-scope.md`). Do not add ARIA tuning, keyboard work or axe checks.

## Acceptance Criteria

The bracketed tag gives the source (the .7 finding or a code fact).

- **AC-01 (Every chip fits at 390)** *[M1; `executionStatus.ts` L12-37]* Given the detail page at 390x844 for a test whose Recent Runs rows show each of Pending, Running, Passed, Failed, Error and Cancelled (across the three seeded tests of task 8.1), when it shows, then for each of those pages the Recent Runs table container has `scrollWidth <= clientWidth`, the document has no sideways scroll (`scrollWidth <= clientWidth`), every visible header cell's right edge is at or inside the container's right edge (so "Actions" reads in full; a header cell that is `display: none`, which only the last rung of task 8.1 allows for Requested, is skipped), and each row's Run link, Status chip and row-menu button lie fully inside the container. The table is not given an inner horizontal scroll to achieve this.
- **AC-02 (Content lines up with the title at 390)** *[m3; `UiTestRecentRunsCard.tsx` L97-101]* Given the same page at 390x844, when the Recent Runs card shows, then the left edges of the runs note and of the table container equal the left edge of the card title ("Recent Runs") within 1 px, the `CardContent` carries no `px` override below `sm`, and AC-01 holds with that padding. From `sm` up the card's padding and the table's cell padding are unchanged.
- **AC-03 (Header follows a watched run)** *[m1; `UiTestDetailHeader.tsx` L48, L82-98; `useUiTestDetail.ts` L108-119]* Given the page is open while the newest replay is `PENDING` or `RUNNING` and the header reads the earlier state ("Not run" and "Last run: Never run", or an older result), when the Latest run card reads that same run in a terminal status (`PASSED`, `FAILED` or `ERROR`, including Cancelled), then the shell re-reads `GET /studio/tests/{id}` exactly once and the header status chip and "Last run" line show what that read returned, without a reload and without remounting any card or closing the drawer.
- **AC-04 (The re-read is bounded)** *[m1; `useLiveRunsRefresh.ts`; Constraints]* Given AC-03, then the test is **not** re-read: when the Latest run card's first read of a run is already terminal; on any poll tick while the run is live; when the recording later settles (`PROCESSING` to `AVAILABLE`, `streamComplete` flips) after the terminal sight; or when the drawer opens or closes. A second run watched from live to terminal triggers one more re-read. A failed or empty re-read keeps the header as it was (the existing `refresh` behaviour). No timer, interval or new endpoint is added for the test read.
- **AC-05 (Cancelled and the backend's limits are stated, not worked around)** *[m1; `StudioService.java` L925-946]* Given a watched replay that ends Cancelled (`ERROR` with `errorCode CANCELLED`), when the Latest run card sees it, then the same single re-read happens and the header shows exactly what that read returns; the client derives no header status from the run. The Dev Agent Record states what the backend's `lastRunStatus` can and cannot express for a cancel (section "What exists today") and that no backend change was made.
- **AC-06 (No regression)** *[.7 AC-05; `scheduleProvenance.test.tsx`]* Given the change, when the 390 Passed-row page, the 1440x900 and 1200x800 pages are measured, then the .7 numbers still hold (390: table and document no overflow, pager and arrows inside the viewport, rows-per-page hidden, cards stacked; 1440 and 1200: no overflow, Latest run to the right, width ratio within 5:7 plus or minus 10 percent); `RunRow.tsx` is unchanged and `scheduleProvenance.test.tsx` passes; no backend, API, fixture or `useLiveRunsRefresh` diff relative to the working-tree baseline recorded before 8.1 and 8.2 start (the tree already holds uncommitted .6 and .7 changes in some of these paths, so a plain `git diff` cannot show this story's share; see 8.3).

### Traceability: AC to tasks

| AC | Tasks |
|---|---|
| AC-01, AC-02 | 8.1, 8.3, 8.4 |
| AC-03, AC-04, AC-05 | 8.2, 8.3, 8.4 |
| AC-06 | 8.1, 8.2, 8.3 |

## Tasks / Subtasks

Run commands from `frontend/` with **pnpm only**. Tick a box only when its verification passes. Line numbers were read on 2026-10-24 in the working tree and may drift; re-read before editing.

**Parallelism.** The two lanes share no file and run in parallel. Tasks 8.3 and 8.4 follow both.

| Lane | Task | File set |
|---|---|---|
| A (fit, alignment, e2e) | 8.1 | `frontend/src/pages/UiTestDetailsPage/UiTestRecentRunsCard.tsx`, `frontend/e2e/mobile-layout.spec.ts` (and `UiTestRecentRunsCard.test.tsx` only if a case there breaks) |
| B (header refresh) | 8.2 | `UiTestLatestRunCard.tsx` and `UiTestLatestRunCard.test.tsx`, `UiTestDetailsPage.tsx` and `UiTestDetailsPage.test.tsx`, `useUiTestDetail.ts` (the contract comment only), all in `frontend/src/pages/UiTestDetailsPage/` |

- [x] **8.1** Recent Runs fit for every chip, and card padding restored (lane A)
  - Covers: AC-01, AC-02, AC-06. Depends on: none.
  - Files: as in the table above. `RunRow.tsx` is not edited: every lever below is a descendant selector in the card's table `sx` (L130-141), so the production consumer is the only one affected.
  - Notes: **Red first.** In `mobile-layout.spec.ts`, inside the 390 block (`UI test detail page at 390x844`), add a test that opens, one after another, the three seeded tests `d0000000-0000-4000-8000-000000000001` (Running, Passed, Passed), `...000000000007` (Pending, Cancelled, Error) and the existing `UI_TEST_WITH_RUNS_ID` `...000000000002` (Failed, Passed, Passed) (no fixture edit; the rows are verified in Context). Per page: assert the expected chip labels are present (`getByTestId('run-status')` texts), so a fixture drift fails loudly; read the container's `scrollWidth`/`clientWidth` and the document's (the file's `documentWidths` helper); assert every visible `thead th` (computed `display` not `none`) right edge is `<=` the container's right edge and that `run-link`, `run-status` and the row menu button of each row lie inside the container box; print the widest status chip width and, on overflow, `columnWidths(container)` (the helper exists), in the file's console style. Add the alignment check on the page of the Running row: x of `.MuiCardHeader-title`, of `ui-test-runs-note` and of `.MuiTableContainer-root` within 1 px of each other. Run it on the current code first: the Running page is expected to fail at about 310/300, as in the report. Then, in `UiTestRecentRunsCard.tsx`: **(a)** delete the `px` override on `CardContent` (L100) and its comment (L98-99), keeping `sx={{ minWidth: 0 }}` out unless needed. **(b)** Find the 34 px or more that this takes (276 px available against 310 needed, inference) by adding levers to the table `sx`, in this order, stopping at the first rung where all three pages pass with at least 2 px to spare: 1. `'& .MuiTableCell-head': { fontSize: { xs: '0.75rem', sm: '0.875rem' } }` (estimated 17 px: Requested and Actions); 2. cell side padding `px: { xs: 0.25, sm: 2, lg: 1 }` in L134 (estimated 16 px over four columns); 3. `'& .MuiChip-label': { px: { xs: 0.75, sm: 1 } }` (estimated 4 px); 4. `'& [data-testid="run-link"]': { fontSize: { xs: '0.8125rem', sm: '0.875rem' } }` (estimated 6 px). The sum is estimated at 43 px against the 34 px needed, so a fit with about 9 px spare is expected; the estimates are inferences, the e2e numbers decide. From `sm` up every value must equal today's. **(c)** Rung 5, **only if rung 4 is applied and a chip still overflows** (coordinator ruling on D2, no round trip): hide the Requested column below `sm`. In the table `sx`, take `requested` out of the grouped `lg` rule at L138 (Duration keeps `display: { lg: 'none' }`) and give it its own rule `'& [data-column="requested"]': { display: { xs: 'none', sm: 'table-cell', lg: 'none' } }`, so `sm` up is exactly today's. `RunRow.tsx` is not edited (it already carries `data-column="requested"` on its cell). The request time stays available in the run drawer (`run-details-requested`) and in the Latest run card (`ui-test-latest-run-requested`). Keep rungs 1 to 4 as applied. Record in the Dev Agent Record that rung 5 was used and the measured widths. If a chip still overflows with Requested hidden, **stop and report** the column widths (not expected: it frees about 79 px); do not hide any other column. If rung 5 is applied and a case in `UiTestRecentRunsCard.test.tsx` that reads the Requested header or cell breaks in jsdom, adjust that case only. Keep the testids and the header texts (`Run, Status, Requested, Duration, Actions`) so the existing card test and header assertions stay valid. Extend the 1440 and 1200 blocks of the same file only if they break; they must still pass unchanged.
  - Verify: `pnpm run test:e2e -- e2e/mobile-layout.spec.ts` and `pnpm exec vitest run src/pages/UiTestDetailsPage/UiTestRecentRunsCard.test.tsx src/components/studio/scheduling/scheduleProvenance.test.tsx`

- [x] **8.2** Header follows a watched run (lane B)
  - Covers: AC-03, AC-04, AC-05, AC-06. Depends on: none.
  - Files: as in the table above.
  - Notes: **Trigger.** `UiTestLatestRunCard` gets one optional prop, `onRunTerminal?: () => void` (props become `{ testId, onRunTerminal? }`). Inside the card, keep the callback in a ref (the pattern of `useLiveRunsRefresh` L39-40, so a new function identity never re-runs the effect) and track the execution id last seen **not terminal** in a ref. An effect keyed on `latest?.executionId` and `latest?.status`: when `latest` is not terminal (`!isTerminalExecutionStatus`), remember its id (`isTerminalExecutionStatus` is in `frontend/src/types/studio/studioTypes.ts` L587 and already imported by the card); when `latest` is terminal and its id equals the remembered id, clear the ref and call the callback once. A first sight that is already terminal, a later `streamComplete` flip, and a re-render never call it. Cancelled needs no special case: `ERROR` is terminal. `UiTestDetailsPage.tsx` passes `onRunTerminal={context.refresh}` (L100-102), which is already stable and returns a `Promise<void>` (wrap as `() => { void context.refresh(); }` if the prop type is `() => void`). No change to `useUiTestDetail.refresh`; update its contract comment (the doc comment, L6-30) with one line saying the Latest run card calls `refresh()` when it sees a run reach terminal. The trigger is transition-based on purpose: comparing with `test.lastRunStatus`/`lastRunAt` would fail for Passed after Passed, and the backend writes `lastRunAt = startedAt` while the demo fixtures write `endedAt ?? acceptedAt` (`demoFixtures.ts` L260), so equality is not portable (see D3). **Tests, `UiTestLatestRunCard.test.tsx`** (MSW, the pattern of L50-140, the `serve` helper and `runningOf`): a Running run that the next read returns `PASSED` calls the callback once, and further ticks and the later `PROCESSING`-to-`AVAILABLE` settle do not call it again; a `PENDING` run through `RUNNING` to `FAILED` calls it once; a run that ends `ERROR` with `errorCode CANCELLED` calls it once; a first read that is already terminal never calls it; a second, newer live run that ends calls it a second time; a card with no callback prop still polls and renders as before. **Tests, `UiTestDetailsPage.test.tsx`** (the page with the three real cards; `serveDetail`, `testReads`): detail `lastRunStatus: null` (header "Not run", "Last run: Never run") and a list that serves a Running newest run, then a Passed one; after the transition `testReads(TEST_ID)` goes from 1 to 2 and stays 2 after a further wait, and the header now reads "Passing" and the Passed last-run chip from the re-served detail, with the Latest run card and the Recent Runs table not remounted (same DOM nodes); a page whose newest run is already terminal at load sends exactly one test read; opening and closing the drawer adds none; a cancelled ending causes the same single re-read and the header shows what the second read returned (serve `lastRunStatus: 'ERROR'`, and separately an unchanged detail to show the client invents nothing). Existing page cases must still pass unchanged.
  - Verify: `pnpm exec vitest run src/pages/UiTestDetailsPage/UiTestLatestRunCard.test.tsx src/pages/UiTestDetailsPage/UiTestDetailsPage.test.tsx && pnpm run type-check && pnpm run lint`. The two test files are lane B's own; the folder-wide run belongs to 8.3, because lane A is editing `UiTestRecentRunsCard.tsx` in parallel and `type-check`/`lint` may show a transient error in lane A's in-flight file (judge only lane B's files here; 8.3 is the combined gate).

- [x] **8.3** Final gate (Lean bound checks)
  - Covers: all ACs. Depends on: 8.1, 8.2.
  - Files: none (record the output in the Dev Agent Record)
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm run lint \
      && pnpm exec vitest run src/pages/UiTestDetailsPage src/components/studio/runs src/components/studio/scheduling/scheduleProvenance.test.tsx \
      && pnpm run test:e2e -- e2e/mobile-layout.spec.ts
    ```
  - Notes: the Vitest set is the directory this story edits, the runs components and `RunRow`'s other consumer; no wider sweep. Record any file that already failed before this story by name; never claim a check that did not run. The working tree already holds uncommitted .6 and .7 changes in some of the guarded paths, so a plain `git diff` cannot show this story's share. Therefore, **before starting 8.1 and 8.2**, from the repository root record a baseline: `git diff -- backend docs/specs frontend/src/services/mocks frontend/src/components/studio/runs frontend/src/components/studio/run | shasum` (and save the `--stat` output in the Dev Agent Record); at the gate the same command must print the same hash. If the coordinator commits .6 and .7 first, the baseline is simply an empty diff.

- [x] **8.4** Real-stack visual re-check (owner: coordinator, aiox-ux; not @dev)
  - Covers: AC-01, AC-02, AC-03, AC-05. Depends on: 8.3.
  - Files: none (screenshots and `REPORT.md` to `docs/qa/evidence/STUDIO-UNIFY-001/visual-recheck-001.8/`, beside `visual-check-001.7/`)
  - Precondition: the real local backend, runner and seed running, no mocks, as in the .7 check; the report records which commit and which uncommitted files were running. This story edits no backend file, so no backend restart is needed.
  - Verify (manual, at 1440 and 390 px; screenshots of what is listed): **M1** a Running row in the Recent Runs card at 390 (replay started from Studio via the autorun URL, then the detail page), the table fully inside the card with "Actions" and the menu intact, then the same row once Passed; a Cancelled row at 390 (the .7 probe test `c9cf1663-...` has one). **m3** the note and table lined up with the card title at 390 (compare with the Overview card above it). **m1** the header status chip and "Last run" move to the new result while the run is watched on the page, with no reload, at 1440 and at 390; and a watched replay ended by Cancel: record what the header shows after the re-read (expected from the backend semantics in Context: possibly unchanged), without calling it a defect of this story. Take the per-width numbers from the 8.1 e2e output; do not re-measure by hand.

## Dev Notes

**Source authority.** The .7 report owns the findings and their evidence; the ACs above own what the build must meet. Stories .1 to .7, the spec and the report are not edited.

### Where things are (verified in the working tree, 2026-10-24)

| Area | Pointer |
|---|---|
| Recent Runs card and its table `sx` | `frontend/src/pages/UiTestDetailsPage/UiTestRecentRunsCard.tsx` L94-188 |
| Row (not edited) | `frontend/src/components/studio/runs/RunRow.tsx` L27-86 |
| Status chip and labels | `runs/RunStatusChip.tsx`; `run/executionStatus.ts` L12-55 |
| Latest run card | `pages/UiTestDetailsPage/UiTestLatestRunCard.tsx` L32-130 |
| Shell and the existing re-read | `UiTestDetailsPage.tsx` L45-51, L81-104; `useUiTestDetail.ts` L108-119 |
| Header fields | `UiTestDetailHeader.tsx` L48, L82-98; `components/studio/tests/uiTestStatus.ts` L57-58 |
| e2e block and helpers | `frontend/e2e/mobile-layout.spec.ts` L257-372 (`UI_TEST_WITH_RUNS_ID`, `documentWidths`, `columnWidths`, `box`, `expectInsideViewportWidth`) |
| Seeds | `frontend/src/services/mocks/studio/demoFixtures.ts` L108-150 |
| Backend meaning of last run | `StudioService.java` L925-946; `ProgressReportService.java` L145, L526-531 |

### Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The levers do not free 34 px for the widest chip (estimates are inferences, and Cancelled or Running may be wider than modelled). | Red-first e2e prints per-column widths on the three pages; the ladder has four rungs with an estimated 9 px spare, and a pre-authorized fifth rung (hide Requested below `sm`, D2) if it still fails; only a failure after rung 5 stops @dev. |
| R2 | The re-read lands before the projection and the header stays stale. | By the code read, the terminal status and the projection are written in one `@Transactional` method (`ProgressReportService.java` L145), so this is not expected (inference: the ledger statements join that transaction). 8.4 checks it on the real stack. |
| R3 | A terminal state that the runner did not FINAL-report (for example a cancel finished by another writer) never moves the projection, so the header can stay on the older result after the one re-read. | Out of scope by owner rule (no backend change); AC-05 and 8.4 record the observed behaviour. |
| R4 | A transition-based trigger does not see a run that starts and ends while the page shows a settled one (no polling then). | Out of scope (Scope Out); the same limit exists for the Latest run card today. |
| R5 | The working tree holds uncommitted .6 and .7 work in the files this story edits. | Build on the working tree; do not revert anything; the coordinator commits earlier work first if a clean base is wanted. |

### Cross-story handoff

`accumulated-context.md` does not exist in this repository, so coherence is recorded here. From .7: the single-page layout, the 5:7 grid from `lg`, `UiTestRecentRunsCard`'s `lg` column drop (Requested and Duration, ruling D3), the e2e fit block and its helpers, `UiTestLatestRunCard`'s own size-1 read and `streamComplete` polling, `refresh()` in the shell context. From .6: the N4 pager `sx` and the cell padding comment. This story supersedes only the .7 `CardContent` padding override (`UiTestRecentRunsCard.tsx` L98-100).

### Testing

Narrow checks only (project preference): Vitest for the trigger, the Playwright msw project for every pixel claim (jsdom has no layout), the gate (8.3), the real-stack re-check (8.4). No accessibility tests, no axe.

## CodeRabbit Integration

**Story Type Analysis**: Frontend, a layout fix and a small data-refresh trigger. Complexity S.

**Specialized Agent Assignment**: Primary @dev (implementation and pre-commit review), @qa (gate). Supporting @ux-design-expert for the 8.4 re-check only (visible layout, no accessibility review). @dev does not push.

**Quality Gate Tasks**
- [ ] Pre-Commit (@dev): run the configured CodeRabbit review before marking the story complete. The CLI is WSL-based and was unavailable on this host for .7; if unavailable again, record that it was not run and do an independent manual diff review. Never claim a run that did not happen.
- [ ] Independent review (@qa): each AC against the code and tests; exactly one test re-read per watched run; nothing renders or is requested before the test read succeeds; `RunRow.tsx`, fixtures, backend and `useLiveRunsRefresh` untouched; the 8.4 screenshots.

**Self-Healing Configuration** (`.claude/rules/coderabbit-integration.md`): @dev phase light mode, max 2 iterations, CRITICAL and HIGH only; @qa phase full mode, max 3 iterations.

**Focus Areas**: Primary: the table fits for every chip at 390 with default card padding; the re-read fires once per live-to-terminal transition. Secondary: strict TypeScript, MUI `sx`, no change from `sm` up. Not a focus area: accessibility (ADR-SC-006).

## Definition of Done

- Tasks 8.1 to 8.3 are ticked with passing verification; 8.4 is recorded by the coordinator with screenshots at 1440 and 390 px.
- The 6 acceptance criteria hold.
- `pnpm run type-check`, `pnpm run lint`, the Vitest group of 8.3 and `e2e/mobile-layout.spec.ts` pass.
- The only changes are `UiTestRecentRunsCard.tsx`, `UiTestLatestRunCard.tsx`, `UiTestDetailsPage.tsx`, `useUiTestDetail.ts` (comment), `mobile-layout.spec.ts`, their tests, and this story file. No backend, API, fixture, runner, `RunRow`, drawer or polling-hook change; no new dependency, alias or compat layer; no accessibility work. pnpm only.
- The File List and Dev Agent Record are filled in by @dev, including the AC-05 statement. Status moves follow `story-lifecycle.md`.

## Drafting flags and decisions pending

| # | Item | Default chosen here | For @po (or owner) | Changes if overruled |
|---|---|---|---|---|
| F1 | [AUTO-DECISION] ClickUp epic lookup and story task creation | Not performed (reason: this mission writes one local story file and was given no ClickUp authority; same as .7) | none | none |
| D1 | Which chips count. Six are enumerable (Pending, Running, Passed, Failed, Error, Cancelled); a status outside the vocabulary is rendered as sent | Cover the six; an unknown status is not tested | Confirm | AC-01, task 8.1 |
| D2 | If the four-rung ladder does not fit the widest chip. The next candidate is hiding Requested below `sm` (the time stays in the drawer and the Latest run card) | **Ruled (coordinator, confirmed by @po 2026-10-24): a fifth rung is pre-authorized**, last resort, through the table `sx` only (no `RunRow` edit, no time carried in the Run cell). Same principle as .7 D3 (Requested is kept only while it fits) | none | AC-01, task 8.1 (c) |
| D3 | m1 trigger. Alternatives: compare the run with `test.lastRunStatus`/`lastRunAt` (fails for Passed after Passed, and `startedAt` vs fixture `endedAt` is not portable); or fire on `streamComplete` (delays the header by the recording's processing time) | Transition-based: live to terminal status seen by the Latest run card, once per run, no comparison with the header | Confirm | AC-03, AC-04, task 8.2 |
| D4 | e2e data. Adding a Running row to the shared demo corpus (`demoFixtures.ts`, also served to All Checks and the guided handlers) risks other suites; not checked, avoided | No fixture edit: three seeded tests already show all six chips (rows verified in Context) | Confirm | task 8.1 |
| D5 | Cancelled in the header. `TestDto.lastRunStatus` cannot say Cancelled, and the projection is written only on runner FINAL reports (observed in .7 R6: header stayed "Passed" beside a Cancelled run) | Report only (AC-05); no backend change | Open a backend follow-up story if the header should follow or name a cancel | AC-05 only |
| D6 | Width coverage. Reports and the user's evidence use 390 | 390 only (not 360) | Confirm | AC-01, AC-02 |
| D7 | m3 alignment is measured at the note and the table container, not at the first cell's text, which keeps its cell padding inset | Container and note vs title, within 1 px | Confirm | AC-02 |

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-24 | 0.1.0 | Draft created from the .7 real-stack check (REPORT.md): M1, m3, m1 fixed; m2, m4 and polish p1-p6 out. Frontend only; lanes A (fit, alignment, e2e) and B (header refresh); gate and coordinator re-check. ClickUp sync not performed (F1). | River (@sm) |
| 2026-10-24 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. Precision fixes only (rung 5 for D2, baseline for the untracked-tree diff gate, lane-B verify narrowed, visible-header wording, two path and line corrections, Dev Agent Record shell); D1-D7 ruled in the PO Validation section. | @po |
| 2026-10-24 | 0.2.0 | Status: Ready → InProgress. Lean work item STUDIO-UNIFY-001.8; one wave, lanes A (8.1) and B (8.2) in parallel, disjoint files; diff baseline recorded before the lanes. | Claude Code (@dev role) |
| 2026-10-24 | 0.3.0 | Status: InProgress → InReview. 8.1 and 8.2 done; Dev Agent Record and File List filled; handed to the 8.3 gate (Lean bound checks) and the independent review; 8.4 after acceptance. | Claude Code (@dev role) |
| 2026-10-24 | 1.0.0 | Status: InReview → Done. Lean candidate 0004a48e accepted: 4/4 bound checks PASS, guarded-path diff unchanged, independent review PASS. Task 8.4 real-stack re-check READY (M1, m3, m1 fixed); evidence `docs/qa/evidence/STUDIO-UNIFY-001/visual-recheck-001.8/`. | Claude Code (coordinator) |

## PO Validation (2026-10-24)

**Verdict: GO, 9/10. Status Draft → Ready.** Pax (@po), `validate-next-story.md` in YOLO mode with the 10-point checklist of `story-lifecycle.md`. Source authority: the .7 REPORT findings M1, m1, m3 and the user's precedent from .5 and .6 (fix Majors and Minors, polish out; m2 and m4 are accepted .7 rulings D3 and D6). No AC was added or removed.

**10-point checklist.** 1 title: pass. 2 description: pass. 3 testable ACs: pass (measured limits, exact read counts, bounded negatives in AC-04). 4 scope In/Out: pass (Out names m2, m4, p1-p6, backend, `RunRow`, fixtures, a11y). 5 dependencies: pass (.7 Done but uncommitted; R5). 6 size: pass (S, two disjoint lanes). 7 business value: pass (the page is readable at the moment a run is watched). 8 risks: pass (R1-R5). 9 Definition of Done: pass. 10 alignment: pass (frontend only, pnpm, single path, no a11y per ADR-SC-006, central API client; executor `@dev`, gate `@qa` as in .1-.7; CodeRabbit section present, enabled in the project config, WSL fallback worded).

**Verified against the working tree (read, not run).**
- `UiTestRecentRunsCard.tsx`: `CardContent` `px: { xs: 0.5, sm: 2 }` at L97-101, cell `px` and the grouped `lg` rule in the table `sx`, header cells with `data-column`, `hideBelowMd` on Duration: as cited. `RunRow.tsx` carries `data-column="requested"` and `"duration"` (L64, L71), so rung 5 needs no `RunRow` edit. Its only other consumer is `scheduleProvenance.test.tsx`.
- `RunStatusChip.tsx` (spinner only on RUNNING, `ml: '6px !important'`) and `executionStatus.ts` (five labels plus Cancelled, unknown status shown as sent): as cited.
- `demoFixtures.ts`: test index 0 = `...0001` READY with RUNNING (L109), PASSED (L113), PASSED (L139); index 6 = `...0007` READY with PENDING (L112), Cancelled (L117), ERROR `DISPATCH_DISABLED` (L149); index 1 = `...0002` READY with FAILED (L114), PASSED (L131), PASSED (L148). All six chips are covered with no fixture edit. `DEMO_NOW = Date.now()` (L35); the fixture writes `lastRunAt` as `endedAt ?? acceptedAt` (L260).
- `UiTestLatestRunCard.tsx` (own size-1 read, `useLiveRunsRefresh` keyed on `streamComplete`, `isTerminalExecutionStatus` already imported), `useUiTestDetail.ts` (`refresh` is `useCallback`, `[testId]`, replaces the read on success, never rejects; story cited L107-118, actual L108-119, corrected), `UiTestDetailsPage.tsx` (`refresh` in the context, `UiTestLatestRunCard testId` mounted with no callback at L100-102), `UiTestDetailHeader.tsx` (`uiTestStatus(test)` L48, "Last run" block, `executionStatusLabel(test.lastRunStatus)` without `errorCode`, `refresh` after the schedule dialog). The test-file helpers named in 8.2 exist (`serve`, `runningOf` in the card test; `serveDetail`, `testReads` in the page test).
- Backend (read only): `StudioService.applyLastRunProjection` at L924-946, `@Transactional`, writes `lastRunAt = startedAt` and `lastRunStatus = status` only for the newest terminal execution; its only caller is `ProgressReportService.afterFinal` (L526-527), reached from the `@Transactional apply` (L145). The R2 and D5 statements hold as inferences, labelled as such in the story.
- `formatRelativeTime` returns `Nm/Nh/Nd ago` as claimed. The drawer (`run-details-requested`) and the Latest run card (`ui-test-latest-run-requested`) both show the requested time, so rung 5 loses no information.
- Lanes: A (`UiTestRecentRunsCard.tsx`, `mobile-layout.spec.ts`, the card test only if broken) and B (`UiTestLatestRunCard*`, `UiTestDetailsPage*`, `useUiTestDetail.ts` comment) share no file. Verified.

**Fixes made in this validation**
1. **D2 rung 5.** 8.1 (c) now carries the pre-authorized last rung (hide Requested below `sm` through the table `sx`, with the exact rule so `sm` up and the `lg` drop stay as today); R1, D2 and AC-01 follow. The e2e skips `display: none` header cells.
2. **Diff gate was not decidable.** The tree already holds uncommitted .6 and .7 changes in the guarded paths, so "git diff must show nothing from this story" (8.3, AC-06) could not be checked. A before/after hash baseline replaces it (8.3).
3. **Lane B verify.** 8.2 ran the whole `UiTestDetailsPage` folder while lane A edits the Recent Runs card in parallel. It now runs lane B's two test files; the folder-wide run stays in 8.3.
4. **Two pointers.** `uiTestStatus.ts` is under `components/studio/tests/`; `isTerminalExecutionStatus` is in `types/studio/studioTypes.ts` L587. `refresh` is L108-119.
5. **Dev Agent Record shell** added (the template section the story already relies on for AC-05).

**Decisions ruled**
- **D1 accepted.** Six chips; an unknown status is not tested.
- **D2 accepted with rung 5** (see fix 1): pragmatic, no stop and round trip; consistent with .7 D3.
- **D3 accepted.** Transition-based, fire once when the Latest run card sees a run go from not terminal to terminal; no wait for `streamComplete`, no comparison with the header.
- **D4 accepted.** No fixture edit.
- **D5 accepted as report-only.** The header cannot say Cancelled because `TestDto` has no `errorCode`; the Dev Agent Record states it (AC-05). No backend story now.
- **D6 accepted.** 390 only.
- **D7 accepted.** Alignment measured at the note and the table container against the title.

**Conditions (none blocks)**
- @qa checks exactly one test read per watched run, nothing renders or is requested before the test read succeeds, and the 8.3 baseline hash matches.
- Known limit, stated in Scope Out and R4: a run that starts and ends while the page shows a settled run is not seen (no polling then).

## Dev Agent Record

### Agent Model Used

Coordinator: Claude Opus 5.5 (main session). Lanes: aiox-dev subagents on Sonnet 5.5, effort high — lane A (8.1), lane B (8.2).

### Debug Log References

Lean work record `~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.8/`.

### Completion Notes

- 8.3 baseline (before 8.1/8.2, repository root): `git diff -- backend docs/specs frontend/src/services/mocks frontend/src/components/studio/runs frontend/src/components/studio/run | shasum` = `b874517e80d215989737c6ba7b619414accac812` (`--stat`: 14 files changed, 754 insertions(+), 82 deletions(-) — the uncommitted .6/.7 changes). After both lanes: same hash.
- 8.1 (lane A): e2e first — on the unmodified card, `...0001` (Running) measured 310/300 and `...0007` (Pending, Cancelled, Error) 307/300 (both failed); `...0002` 300/300; title x 57 vs note/table x 45. Fix: the xs `CardContent` padding override removed (MUI default); rungs 1 (head cells 0.75rem below sm), 2 (cell `px: { xs: 0.25, sm: 2, lg: 1 }`) and 3 (chip label `px: { xs: 0.75, sm: 1 }`) applied; rungs 4 and 5 not needed (Requested stays visible). Final at 390 on all three pages: container 276/276, document 390/390, min-content spare 4/6/23 px; title, note and table at x 57. No regression: 1440 373/373, 1200 273/273, ratio 0.714; pager arrows inside. Playwright mobile-layout 12/12.
- 8.2 (lane B): `UiTestLatestRunCard` gains optional `onRunTerminal`; a ref holds the id of the run last seen not terminal and the callback fires when that same id turns terminal (never on first sight of a terminal run, poll ticks, `streamComplete` settling, drawer open/close, or a new callback identity); the page wires it to `useUiTestDetail`'s `refresh()`. Card tests 19, page tests 51 (6 new each; mutation-checked).
- AC-05 (backend semantics, report only): `TestDto` has no `errorCode`, so the header can never say "Cancelled"; a cancel is stored as `ERROR` (header shows "Error" at most). `lastRunStatus`/`lastRunAt` are written only by `applyLastRunProjection`, called only from `afterFinal` on runner FINAL reports, so a cancel finished by another writer does not move the projection and the one re-read can return the header unchanged (the .7 R6 observation). The client derives nothing from the run. No backend change.
- Not run: CodeRabbit (WSL CLI unavailable on this host).

### File List

Modified: `frontend/src/pages/UiTestDetailsPage/UiTestRecentRunsCard.tsx`; `UiTestLatestRunCard.tsx`; `UiTestLatestRunCard.test.tsx`; `UiTestDetailsPage.tsx`; `UiTestDetailsPage.test.tsx`; `useUiTestDetail.ts` (comment); `frontend/e2e/mobile-layout.spec.ts`; this story file.

## QA Results

**Gate (Lean, 2026-10-24): PASS.** Candidate 0004a48e accepted.

- Bound checks 4/4 PASS: type-check; lint (0 errors); vitest-story 101/101; Playwright msw mobile-layout 12/12. Guarded-path diff hash unchanged from the pre-build baseline (`b874517e`).
- Independent review (aiox-qa): PASS on AC-01..AC-06, non-blocking: a live run A followed by a newer run B first seen already terminal fires no re-read (same family as R4, out of scope); the Running row has 4 px spare at 390 (the e2e guards it); DoD boxes were open at review time.
- Task 8.4 real-stack re-check: READY. At 390 the table fits for Pending, Running, Passed, Cancelled and Error (276/276), title/note/table at x 57; the header follows a watched replay with one test read (+52–81 ms after Latest run turns terminal); Cancelled shows "Error" in the header (backend limit, AC-05). Minor: real-stack dispatch latency (two replays ended `AUTHORIZATION_REVOKED` after ~45 s Pending; UI handled them), the Cancelled/Error header wording. A FAILED replay was not producible on the real stack.
- Not run: CodeRabbit (WSL CLI unavailable on this host).
