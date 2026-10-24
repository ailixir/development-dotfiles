# Spec: UI tests as checks (Flow 1, frontend-only)

> **Story ID:** STUDIO-UNIFY-001-ui-tests-as-checks
> **Complexity:** STANDARD (13/25)
> **Generated:** 2026-10-23T20:57:19Z. **Revised:** 2026-10-23T21:15:00Z (iteration 2, after critique 1); 2026-10-23T23:24:08Z (iteration 3, spec patch: plan gaps G1-G10 and user decision D7); iteration 4, the single create path (DC-24); see §21
> **Status:** Approved by the user on 2026-10-23 (critique 2: APPROVED, 4.20), and then patched for D7 and the plan gaps. No product code before a Ready story.
> **Inputs:** [requirements.json](requirements.json) (see its `changelog`), [complexity.json](complexity.json), [research.json](research.json), [critique.json](critique.json), [plan/implementation.yaml](../plan/implementation.yaml) (specGaps, critiqueFold), the main-session source brief (2026-10-23).

## 1. Overview

UI tests (Checks Studio tests) become first-class rows in the Checks area. A user creates one from Create Check, finds it in All Checks, opens a UI test detail page with Overview and Runs, and authors and runs it in the existing Studio page.

The separate Studio Tests and Runs pages, their routes and the sidebar group are removed. Each one goes in the increment that replaces it (D7). The backend is unchanged. Checks and Studio tests stay separate aggregates. Screens and routes are shaped so that a later backend link (Flow 2) needs no change to them. [FR-01–FR-29; CON-01, CON-03, CON-06, CON-07]

### 1.1 Goals

- Create a UI test the same way as a regular check, then land in Studio. [FR-01–FR-04]
- Keep ChecksStudioPage as the only authoring page, always loaded by the URL's test id, and frame it in the Checks area. [FR-05–FR-07; CON-02]
- Give each UI test a detail page with Overview and its own Runs, replacing the cross-test Runs page. [FR-09–FR-12; D3]
- Route every Run and Execute through the editor's run gate, exactly once. [FR-13; NFR-05]
- Merge UI tests into All Checks with truthful status, safe bulk behaviour, and clear failure, cap and empty states. [FR-14–FR-24]
- Remove every old Studio surface in the increment that replaces it, with no redirects. Keep the WCAG audit green as a guard only, and update the core docs. [FR-27–FR-29; CON-03, CON-04; D7]

### 1.2 Non-goals

See §16. In short: no backend change and no Flow 2 work; no cross-test runs list; no tags or bulk actions for UI tests; no accessibility work; no fixes to existing editor feedback gaps. [D1, D3, D6; CON-01, CON-04]

### 1.3 User decisions (binding, 2026-10-23)

| # | Decision |
|---|---|
| D1 | Flow 1: frontend-only unification for V1. Backend unchanged. Studio's own scheduler (`/studio/tests/{id}/schedule`) owns UI test schedules. |
| D2 | ChecksStudioPage stays the authoring page (layout unchanged). |
| D3 | Drop the cross-test runs list (today's Studio Runs page). Runs live only on each UI test's detail page. |
| D4 | A new UI test defaults to environment Development. |
| D5 | Doc updates are in scope (last increment): PRD scope line, Studio scheduling status, two-panel layout, compile wording, CLAUDE.md nav tree, `docs/architecture/studio-execution.md`, `ARCH.md`, `docs/qa/accessibility/studio-wcag-audit.md`. |
| D6 | One spec covering Flow 1, planned as 4 increments. Flow 2 (backend link) is out of scope, but it must be able to land later with no change to routes or screens. |
| D7 | Verbatim: "UI studio is a new feature thats not even in dev yet, this is brand new, no old routes or data should be kept, just update the references if is the case." No old route, page or fallback survives across increments: each is removed in the increment that replaces it, and its references are repointed in that same increment. It applies within Flow 1's frontend scope; there is no backend data change (D1). |

Standing rules: one path, with no back-compat routes or redirects (Studio is unreleased); functional-only accessibility (ADR-SC-006); pnpm only; MUI with `sx`; all HTTP through the centralized API client. [CON-03, CON-04, CON-05]

### 1.4 Design calls closed in this spec

| ID | Call | Trace | Decided |
|---|---|---|---|
| DC-01 | **Autorun is consumed once.** The editor removes `autorun` from the URL with a replace navigation before it requests the run. It requests the run only for the test loaded by the route id, after `GET /studio/tests/{id}` succeeds. A reload or Back never starts a second run. The request is evaluated once, when the gate settles (§7.2). If the gate is not runnable then, the request is dropped and the existing caption explains why. The wait is bounded, and user activity before settle drops the request. | FR-13; RF-01, RF-03; R-01, R-02; CRIT-2, CRIT-18 | 2026-10-23, main session, routine. Settle and bound rules: @pm in spec, routine |
| DC-02 | **The Runs tab lists only executions (replays)** and states that learning happens in Studio. While a learn is open, Overview and the status chip show "Learning". | FR-10, FR-11, FR-26; RF-06; R-03 | 2026-10-23, main session, routine |
| DC-03 | **No runs before the test loads.** The Runs tab and drawer render nothing until `GET /studio/tests/{id}` succeeds. A snapshot whose `testId` differs from the route id shows not-found. | FR-11, FR-12; RF-04; R-06 | 2026-10-23, main session, routine |
| DC-04 | **Environment.** Create offers Development, Staging, UAT and Production, defaulting to Development. The editor select gains UAT. An environment change still moves READY to NEEDS_RELEARN (existing behaviour). | FR-01; RF-02, RF-05; R-07 | 2026-10-23, main session, routine |
| DC-05 | **The silent 503/401 on guided start stays out of scope** as a known issue (§16.2). | §16.2; RF-01; R-12 | 2026-10-23, main session, routine |
| DC-06 | With the switch on, `?type=UI_TEST` wins on load over stored catalog preferences and over a stored create draft's type, and is then saved like any filter change. | FR-03, FR-22; OQ-01; PC-03 | 2026-10-23, @pm in spec, routine |
| DC-07 | The Studio list is requested with `sort=updatedAt,desc`. Mixed rows are ordered by `createdAt` descending, with id as tie-break. UI tests match search on name and description only. Superseded requests are cancelled. | FR-14, FR-15; OQ-02; RF-08, RF-09; PC-01 | 2026-10-23, @pm in spec, routine |
| DC-08 | Readiness states are selected only by their own filter values. Warning covers WARNING checks and Error UI tests; Pending covers PENDING checks and Not run UI tests. | FR-16; OQ-03 | 2026-10-23, @pm in spec, routine |
| DC-09 | The Dashboard "Open Checks Studio" quick action and the command palette "Studio" entry follow DC-23. The breadcrumb's "All Checks" item goes to `/checks/all`. | FR-07, FR-08; OQ-04; PC-04 | 2026-10-23, @pm in spec, routine |
| DC-10 | The Runs tab uses the existing server paging (newest first) with MUI `TablePagination` and no filter controls. `StudioListLayout` is not reused: its required search, filter, title and icon props don't fit a tab (PC-11). Both deleted pages import it, so it goes with the last one, in increment 3. | FR-11, FR-27; OQ-05; PC-02, PC-11 | 2026-10-23, @pm in spec, routine |
| DC-11 | The D5 docs are the brief's list, plus CLAUDE.md L101-117 and its AGENTS.md mirror; the lines are in §13. PRD L121 stays. ARCH.md compile-era API lines are out of scope. | FR-29; OQ-08; PC-05 | 2026-10-23, @pm in spec, routine |
| DC-12 | The All Checks Type filter hides its "UI Test" option unless availability is "on". | FR-24; OQ-09 | 2026-10-23, @pm in spec, routine |
| DC-13 | On the detail page, a test-read failure other than 403 or 400 shows a load error with Retry. | FR-25; NFR-06 | 2026-10-23, @pm in spec, routine |
| DC-14 | The Execute tooltip and "Run in Studio" label stay the same for every readiness. | FR-13, FR-19; OQ-06; RF-01; R-04 | 2026-10-23, @pm in spec, routine |
| DC-15 | **Create Check UI Test branch.** The card replaces the stepper with one form. Environment precedence follows the "environment chosen" rule in §6. Switching back restores the stepper and keeps the fields. The edit page does not offer the card. | FR-01; D4; CRIT-6, CRIT-15; PC-09 | 2026-10-23, @pm in spec, routine. The chosen rule follows the plan's CRIT-15 fold (G8) |
| DC-16 | **UI test row columns** as in §9.2. The CSI name comes from the store, falling back to the CSI id. No CSI request is added. | FR-14; CRIT-5, CRIT-11; PC-10, PC-12 | CSI id fallback: 2026-10-23, main session, routine. Column mapping: @pm in spec, routine |
| DC-17 | **Run row and drawer in the Runs tab.** In increment 2 `RunRow` becomes a single-test form: the run's short id is the link, and there is no "Open test". No prop is added, because its only other consumer, the Runs page, is deleted in the same increment (D7). The tab owns its header. `RunDetailsDrawer` gains `expectedTestId` (G3), and a mismatch in the read or a live snapshot uses its existing not-found state. Its `testHref` goes to the editor, and its copy-link copies the ui-tests run URL using `copyText`. | FR-11, FR-12; CRIT-4, CRIT-8; G3; D7; PC-10 | 2026-10-23, @pm in spec, routine |
| DC-18 | **Availability is derived, with three states** (G10, CRIT-14). It is `'pending'` until sources and features are fetched. It is then `'on'` if the UI_TEST source and STUDIO feature are on (missing entries and empty lists count as on), else `'off'`. In `'pending'`, no Studio request is sent, a UI_TEST type from the URL, stored preferences or stored draft is held (not applied, written or dropped), and ui-tests routes do not render their content. The detail routes show a loading state. The editor's outer gate (ChecksStudioPage L1936-1940) reads the same hook and uses only existing renders: `'off'` shows the existing `StudioUnavailable` (L166); `'pending'` shows the editor's existing "Loading test…" text (L1167) in place of the editor body, and sends no Studio request; `'on'` mounts the editor. `'pending'` always ends, because both `fetched` flags are also set on a failed fetch (sourcesSlice L42-45; featuresSlice L66-69), after which the fail-open rule applies. In `'off'`, the held value is dropped and never written, a selected UI Test create type is reset, and the Dashboard and palette entries are hidden. In `'on'`, the held value is applied. | FR-03, FR-08, FR-22, FR-24; CRIT-7, CRIT-14 | 2026-10-23, main session, routine (ignore, don't persist). States per the plan's CRIT-14 fold: @pm in spec, routine |
| DC-19 | **No-id editor: the fallback is deleted (D7).** It reverses the earlier call that kept `list[0]`. The editor always loads a test by route id. A no-id mount, which only a test can produce once the bare `studio` route is removed in increment 1, loads nothing and offers nothing to run; the Plan decides the minimal render. Every editor test, including WCAG surfaces 3-7, mounts with a test id. This is a mount change only (ADR-SC-006). | FR-06; D7; CRIT-1, CRIT-16 | D7 (user, 2026-10-23) |
| DC-20 | **Schedule dialog links.** The dialog takes its run-link target from its host. In increment 1 it targets the Runs page run. From increment 2 (when that page is removed), it targets the ui-tests run path for every host. | FR-08; CRIT-3; PC-08; D7 | 2026-10-23, main session, routine |
| DC-21 | **AGENTS.md** mirrors CLAUDE.md, so it joins the D5 list. | FR-29; CRIT-10 | 2026-10-23, main session, routine |
| DC-22 | **Removals by increment (D7).** Increment 1: `studio/:id`, bare `studio`, the fallback, `navigationConfig`, `CreateTestDialog` (DC-24). Increment 2: `studio/runs` and its child, the Runs page, the Runs nav child. Increment 3: `studio/tests`, the Tests page, the Studio nav group, and their components (`StudioListLayout` among them, because StudioTestsPage imports it at L5). Increment 4: docs plus leftovers. Each increment repoints its references, and the links are re-walked at every boundary (§14.1). | FR-27, CON-08; D7 | D7 (user); increment allocation by the main session, 2026-10-23, routine |
| DC-23 | **Interim Dashboard and palette target.** Both are repointed in increment 1, when `/checks/studio` goes. They target `/checks/studio/tests` (the Tests page, which exists until increment 3), and `/checks/all?type=UI_TEST` from increment 3. They show only when availability is `'on'`, from increment 1. | FR-08, FR-24; D7; PC-04 | 2026-10-23, @pm in spec, routine (the main session gave this target as an example) |
| DC-24 | **One create path from increment 1.** Create Check → UI Test replaces `CreateTestDialog`, so the dialog is deleted in increment 1. It has no test file of its own. Every other "Create Test" action goes to `/checks/create?type=UI_TEST`: the Tests page header (L75) and empty state (L106), and the Runs page header (L145) and empty state (L172). `createErrorMessage` (testErrors.ts) is reused for Create Check's inline error and stays, as do the shared `STUDIO_TEST_ENVIRONMENTS` and `TEST_NAME_MAX_LENGTH`. | FR-02, FR-27; D7; PC-16 | 2026-10-23, main session, applying D7 |

## 2. Requirements summary

Full text and acceptance criteria are in [requirements.json](requirements.json). Section references are in §19.

### 2.1 Functional requirements

| ID | Requirement (short) | P | AC |
|---|---|---|---|
| FR-01 | The "UI Test (Checks Studio)" card turns Create Check into one form: Name ≤255, CSI, Environment (4 values), Description. The "environment chosen" rule and the switch-back rule apply, and the editor select gets the same 4 values | P0 | AC-01, AC-30 |
| FR-02 | "Create and open Studio" sends the empty-draft `POST /studio/tests`, clears the wizard draft and replace-navigates to the editor. Errors show inline | P0 | AC-02, AC-03 |
| FR-03 | `create?type=UI_TEST` preselects the card, held while availability is pending and ignored when off | P1 | AC-04 |
| FR-04 | Remove the legacy UI_TEST picker path and the stale `uiTest` type field | P0 | AC-05 |
| FR-05 | The editor is served at `ui-tests/:id/studio` in both trees, behind the STUDIO gate | P0 | AC-06 |
| FR-06 | The editor always loads by route id. The no-id fallback is deleted (D7), and tests mount with an id | P0 | AC-06, AC-07 |
| FR-07 | Editor framing: breadcrumb, back to the detail page, read-only CSI, the leave guard kept, "Open Tests" | P1 | AC-08 |
| FR-08 | Entry points are repointed in the increment that removes their target. The dialog's run link is passed in. The Dashboard and palette follow DC-23 | P0 | AC-09 |
| FR-09 | Detail page header and actions | P0 | AC-10 |
| FR-10 | Overview tab | P0 | AC-11 |
| FR-11 | Runs tab: replays only, with the note. A single-test `RunRow`, its own header, server paging, the drawer (`expectedTestId`, editor `testHref`, copy-link). Gated on the test read | P0 | AC-12 |
| FR-12 | Run snapshot bound to the route test. The drawer's `expectedTestId` gives not-found on a mismatch | P0 | AC-13 |
| FR-13 | Every Run/Execute goes through `?autorun=1`, consumed once at a bounded settle | P0 | AC-14, AC-29 |
| FR-14 | All Checks union, dedupe, CSI name or id, createdAt order, column mapping | P0 | AC-15 |
| FR-15 | Studio list only when on: server filters, sort, size 100, cancellation | P0 | AC-15, AC-23 |
| FR-16 | Status mapping and filter grouping | P0 | AC-16 |
| FR-17 | No bulk selection of UI test rows | P0 | AC-17 |
| FR-18 | A tag filter hides UI test rows | P1 | AC-18 |
| FR-19 | Row actions | P0 | AC-19 |
| FR-20 | Cap notice | P1 | AC-20 |
| FR-21 | A Studio list failure keeps the checks and offers Retry | P0 | AC-21 |
| FR-22 | The `all?type=UI_TEST` preselect follows availability (DC-18) | P1 | AC-04 |
| FR-23 | Empty state | P1 | AC-22 |
| FR-24 | Derived availability, `'pending' \| 'on' \| 'off'` | P0 | AC-23 |
| FR-25 | A 403/400 shows the single message, other failures offer Retry, and nothing probes `/checks` | P0 | AC-07, AC-24 |
| FR-26 | Leaving mid-replay: the replay stays visible. Learns are not runs | P1 | AC-25 |
| FR-27 | Removals by increment (DC-22) | P0 | AC-26 |
| FR-28 | WCAG guard by increment: re-mount 3-7 in 1, drop 2 in 2, drop 1 in 3, never add | P0 | AC-27 |
| FR-29 | D5 doc updates, including AGENTS.md | P1 | AC-28 |

All FRs are in scope for Done. P1 means supporting behaviour, not optional.

### 2.2 Nonfunctional requirements

| ID | Category | Requirement | Evidence target |
|---|---|---|---|
| NFR-01 | performance | One Studio list request per settled change; superseded requests cancelled; CSI names from the store | Request-count assertions (zero unless `'on'`) |
| NFR-02 | performance | Within the <500 KB initial bundle and <1.5 s FCP targets | Build-size comparison before and after |
| NFR-03 | security | Absent and forbidden are indistinguishable; no cross-namespace probing | Same message on 403; zero `/checks/{id}` calls for UI test ids |
| NFR-04 | security | Secrets show only the vault reference name; the centralized client only | No secret value rendered; no direct `fetch` in new or changed lines. The existing Test Now `fetch` (CreateCheckPage L465) is out of scope |
| NFR-05 | reliability | The run gate is the only run entry | No execute from lists, detail or bulk; AC-29 |
| NFR-06 | reliability | Each source fails on its own; a 403 never shows another test | AC-07, AC-21, AC-24 |
| NFR-07 | scalability | At most 100 UI tests per request, with the cap notice | One page per load |
| NFR-08 | usability | Created, found and run from the same places as checks; the responsive layout kept | E2E from Create Check and All Checks |
| NFR-09 | reliability | Narrow tests; a route test per tree (ChecksLayout mocked); stale tests fixed in the increment that removes their target; editor tests mount with a test id | type-check, lint, narrow tests and the touched E2E pass at every increment; WCAG audit green |

### 2.3 Constraints

- **CON-01 (technical):** Frontend-only. No backend, API, schema or Flyway change.
- **CON-02 (business):** ChecksStudioPage stays two-panel with an unchanged layout.
- **CON-03 (business):** One path. No redirects, aliases or fallbacks. **D7:** no old route, page or fallback survives an increment.
- **CON-04 (business):** ADR-SC-006. The audit is a guard only, never extended.
- **CON-05 (technical):** React 18, strict TS, MUI v5 (5.18.0) with `sx`, React Router v6 (6.30.1), Redux Toolkit 2, MSW 2 in Node, the centralized API client, pnpm only. No v7-only APIs. *Observation, not fixed:* CLAUDE.md and AGENTS.md say "v7".
- **CON-06 (technical):** Flow 2 forward-compat (§15).
- **CON-07 (technical):** Separate aggregates. No checks rows for UI tests.
- **CON-08 (business):** Four increments, each removing what it replaces and leaving no link to a deleted route (§14).
- **CON-09 (technical):** Both App.tsx trees carry the same `ui-tests` routes. There is a route test per tree.
- **CON-10 (technical):** Node MSW harnesses. Real-backend E2E only with `CHECKS_E2E_REAL_BACKEND=1`.

### 2.4 Assumptions after research

| ID | Status |
|---|---|
| ASM-01 | Confirmed (RF-01): READY replays, UNLEARNED learns, NEEDS_RELEARN re-learns, LEARNING starts nothing. |
| ASM-02 | Partly holds (RF-06): the session expires after 600 s; until then an abandoned learn holds LEARNING and capacity, and is never published. |
| ASM-03 | Confirmed (RF-04): FR-12 is required. |
| ASM-04 | Resolved (RF-02): name and description never change readiness; the environment does. |
| ASM-05 | Confirmed (RF-05): the four environment values match exactly. |
| ASM-06 | Unchanged: the Plan re-verifies every file:line (done in `plan/implementation.yaml` lineReverification). |

## 3. Evidence

### 3.1 Research trace map

| Label | research.json source | Applied to |
|---|---|---|
| RF-01 | `findings[RQ-01]`: autorun behaviour per readiness; the held token; autorun runs `list[0]` beyond page 1; a guided start answered 503/401 is silent | FR-06, FR-13; DC-01, DC-05, DC-14 |
| RF-02 | `findings[RQ-02]`: name and description keep readiness; an environment change moves READY to NEEDS_RELEARN | FR-01; DC-04 |
| RF-03 | `findings[RQ-03]`: autorun is never removed; a fresh Idempotency-Key per run; no per-test guard | FR-13; DC-01 |
| RF-04 | `findings[RQ-04]`: test reads answer 403 for absent, forbidden, soft-deleted and quarantined tests; execution routes key on the execution | FR-11, FR-12, FR-25; DC-03 |
| RF-05 | `findings[RQ-05]`: the four environment values match; the editor select lacks UAT | FR-01, FR-15; DC-04 |
| RF-06 | `findings[RQ-06]`: guided sessions are not executions; client-only finalize; 600 s expiry | FR-10, FR-11, FR-26; DC-02 |
| RF-07 | `dependencies[MUI and React Router]`: installed versions; replace navigation and search params | CON-05; FR-02, FR-13 |
| RF-08 | `dependencies[Studio public API].patterns`: list readiness, sort values, `q` fields, no readiness filter, size ≤100 | FR-14–FR-16; DC-07 |
| RF-09 | `recommendations[R-09]`: per-row cost unmeasured; AbortSignal | FR-15; NFR-01 |
| RF-10 | `recommendations[R-12]`: existing feedback gaps | §16.2 |

From the plan (`plan/implementation.yaml`, re-read by the architect on 2026-10-23):
- **PL-01** (critiqueFold CRIT-18): `apiClient` timeout is 30 000 ms (L22), with at most 2 GET retries on no response or 5xx (L97-108). `capabilities()` does not opt out of retries.
- **PL-02** (critiqueFold CRIT-14): sources and features are fetched asynchronously at bootstrap (store/index.ts L89-90), with `fetched` flags (sourcesSlice L8-16; featuresSlice L84) and fail-open selectors.
- **PL-03** (specGaps G1-G6): the E2E and page-test URL assertions, the drawer's self-read, dead code, the route-test environment, and that `replayFailure.test.tsx` does not mount the page.

The main session verified: autorun at ChecksStudioPage L494, L507-510; the editor environment options at L1212; the installed MUI and React Router versions; StudioScheduleDialog L27-28; CreateCheckPage L58, L130.

### 3.2 Code checks made while writing and revising the spec (2026-10-23)

| Label | Fact | Used by |
|---|---|---|
| PC-01 | `GET /checks` sorts by `createdAt` descending (CheckService.java L115). | DC-07 |
| PC-02 | `useStudioRuns` is server-paged. | DC-10 |
| PC-03 | All Checks restores and saves `checks:catalog:prefs` (L120-138). Create Check restores `checks:create:draft` (L143) and removes it on create (L254). | DC-06, DC-18 |
| PC-04 | The Dashboard "Open Checks Studio" quick action (L753) and the command palette "Studio" entry (L16) both go to `/checks/studio`, and neither is gated. | DC-09, DC-23 |
| PC-05 | Stale doc lines: PRD L76, L78, L90-L99, L111, L115, L128, L158, L229; CLAUDE.md L101-117; AGENTS.md L106, L117; studio-execution.md L20, L23, L229, L235. | DC-11, DC-21 |
| PC-06 | "Run again" shares the `runRequest` token (L1667). A followed learn's completion triggers a read, never a run (L820-823). | §17 R2 |
| PC-07 | Both trees end in a catch-all `*` that goes to module home (App.tsx L123, L160). | FR-27 |
| PC-08 | StudioScheduleDialog derives `runsPath` from `pathname.indexOf('/studio')` (L26-28), for "Inspect run" (L179) and "View run" (L214). It is hosted by ChecksStudioPage and StudioTestsPage. | DC-20 |
| PC-09 | CreateCheckPage has steps at L58, the Production mount default at L130, the type selector in step 0 at L318, and the action bar with the Test Now `fetch` at L451-476. `edit/:id` reuses the page (App.tsx L109). | DC-15; NFR-04 |
| PC-10 | `RunRow` props at L11-23, with the test-name link as its first cell and `csiName ?? run.csiId`. Its only consumer is StudioRunsPage. `RunDetailsDrawer` requires `onCopyLink` and `testHref` (L53-57), and its only page consumer is StudioRunsPage. | DC-16, DC-17 |
| PC-11 | `StudioListLayout` is imported by **StudioTestsPage (L5)** and StudioRunsPage, and by its own test. It requires title, icon, query, onQueryChange, filter and paging props (L101-131). The plan's CRIT-17(c) correction does not hold, so it is deleted in increment 3. | DC-10 |
| PC-12 | `csiApi.listCsis` defaults to limit 20 (csiApi.ts L14-16). | DC-16 |
| PC-13 | `useRunGate` makes its own test read (L292-323). Its capabilities read leaves permission `'unknown'` both while pending and on failure (L325-347). `canRun` blocks only on `'denied'`. | DC-01, §7.2 |
| PC-14 | All Checks columns L494-566. | DC-16 |
| PC-15 | Link inventory (grep of `frontend/src` and `e2e`, 2026-10-23):<ul><li>`/checks/studio` bare: Dashboard L753, CommandPalette L16, `navigationConfig.ts` L28, ChecksLayout L85.</li><li>`studio/runs`: navigationSetup L30, L73; ChecksLayout L87; StudioScheduleDialog L28; `runLinks.ts`; StudioRunsPage and its test; `runSnapshots.test.ts` L49-51; `scheduleProvenance.test.tsx` L20-21.</li><li>`studio/tests`: navigationSetup L25, L29, L74; ChecksLayout L86; editor L1061 and L1194; `harness.spec.ts` L57, L94, L142; `studio-authoring-real-backend.spec.ts` L128; `ChecksLayout.a11y.test.tsx` L45; `StudioScheduleDialog.test.tsx` L27, L56, L233; StudioTestsPage and its test.</li><li>The editor at `/checks/studio/{id}`: `testHref` L69, `studioTestPath`, StudioRunsPage L111.</li><li>`LayoutProvider` L70 maps `/checks/studio*`.</li><li>`studioTestsPath` has no consumer.</li><li>`useUrlListState` is used by `useStudioTests` and StudioRunsPage. `LAST_RUN_FILTER_LABELS` is used by StudioTestsPage.</li><li>`CreateTestDialog` is used by StudioTestsPage and StudioRunsPage.</li></ul> | §14.1 |
| PC-16 | `CreateTestDialog` is imported only by StudioTestsPage (L7) and StudioRunsPage (L20); it has no test file of its own. It uses `createErrorMessage` (testErrors.ts, which has no other product consumer), `STUDIO_TEST_ENVIRONMENTS` and `TEST_NAME_MAX_LENGTH` (both also used by the Tests page and `useStudioTests`), and `defaultConfiguration()` (used widely). Its "Create Test" entry points are StudioTestsPage L42 `openCreate` (header L75, empty state L106) and StudioRunsPage L64 (header L145, empty state L172). The create-error cases live in `StudioTestsPage.test.tsx` L427-430. | DC-24 |

### 3.3 Dependencies

| Dependency | Version | Purpose | Verified |
|---|---|---|---|
| react / react-dom | ^18.2.0 | UI | Yes |
| @mui/material | 5.18.0 (locked) | Components, `sx`, `TablePagination` | Yes (RF-07) |
| react-router-dom | 6.30.1 (locked) | Nested routes, replace navigation, search params | Yes (RF-07) |
| @reduxjs/toolkit | ^2.0.0 | CSI store, source and feature flags | Yes |
| msw | 2.15.0 | Node mocks | Yes |

Internal modules:
- **Reused unchanged:** `studioApi`/`apiClient`, `VideoEvidencePanel`, `useLiveRunsRefresh`, `StudioScheduleSummary`, `DeleteTestDialog`, `FeatureGate`, the CSI store, `dashboard.searchContext`, `studioListSx` (still imported by `RunRow`).
- **Adapted:**
  - `RunDetailsDrawer`: adds `expectedTestId`, and the editor `testHref` and copy-link targets (G3, DC-17).
  - `RunRow`: the single-test form, in increment 2.
  - `useStudioRuns`: `testId`.
  - `StudioScheduleDialog`: run-link target passed in.
  - `RunControl`/`useRunGate`: autorun consumption and an observable settle.
- **Not reused, and deleted in increment 3:** `StudioListLayout`.
- **New:** a derived availability hook (`'pending' | 'on' | 'off'`, DC-18).

There is no new dependency. [CON-05; IDS]

## 4. Journey

1. **Create.** All Checks → Create Check → "UI Test (Checks Studio)". One form with Name, System/CSI, Environment and Description. "Create and open Studio" lands in the editor, with the create page replaced in history. [FR-01–FR-03]
2. **Author.** Studio keeps its layout. The breadcrumb reads "All Checks › {name}", and Back goes to the detail page. CSI is read-only, and the leave guard is kept. [FR-05–FR-07]
3. **Manage.** All Checks lists the UI test alongside checks. The detail page has a header, Overview and Runs. [FR-09–FR-12, FR-14–FR-19]
4. **Run.** Execute or Run in Studio opens `…/studio?autorun=1`, which the editor consumes once. [FR-13; RF-01]

## 5. Routes

All routes are under `/checks` (federated) or at the root (standalone), behind `FeatureGate STUDIO`, in both trees. [FR-05, FR-11, FR-27; CON-09]

| Path | Screen | Notes |
|---|---|---|
| `ui-tests/:id` | UI test detail, Overview tab | Increment 2 |
| `ui-tests/:id/runs` | Detail, Runs tab | Increment 2; replays only |
| `ui-tests/:id/runs/:executionId` | Runs tab with the drawer open | Increment 2; bound to `:id` (FR-12) |
| `ui-tests/:id/studio` | ChecksStudioPage | Increment 1; `?autorun=1` consumed once (DC-01) |
| `create?type=UI_TEST` | Create Check, UI Test preselected | Increment 1; follows availability (DC-18) |
| `all?type=UI_TEST` | All Checks, Type = UI Test | Increment 3; follows availability (DC-18) |
| `studio`, `studio/:id` | **Removed in increment 1** | No redirect; the catch-all sends to module home (PC-07) |
| `studio/runs`, `studio/runs/:executionId` | **Removed in increment 2** | Same |
| `studio/tests` | **Removed in increment 3** | Same |

Routes are type-segmented, because check ids and test ids are separate namespaces. Route strings come from one set of UI test path helpers (brief §4.5: `uiTestPath`, `uiTestEditorPath(id, {autorun})`, `uiTestRunPath`). The helpers resolve the module base for each tree, without searching the pathname for `/studio` (PC-08). [CON-06, CON-09; NFR-03]

## 6. Create Check (UI Test)

- **Card.** "UI Test (Checks Studio)" is selectable only when availability is `'on'`; otherwise it is dimmed. While availability is `'pending'`, a UI_TEST type from `?type` or the stored draft is held. When availability turns `'off'`, it is dropped and a selected UI Test type is reset, so no one-form or submit shows (DC-18). On `edit/:id` the card cannot be selected. [FR-01, FR-03, FR-24; DC-15]
- **One form.** While UI Test is selected on the create page, the stepper header, the Check Configuration, Scheduling and Review steps, Back/Next, Test Now, Create Check and the tags field are not shown. Basic Information shows Name (required, max 255), Description, System/CSI (required, registered CSIs) and Environment (Development, Staging, UAT, Production). The only submit is "Create and open Studio". Draft autosave keeps working. [FR-01; D4; DC-15; PC-09]
- **Environment precedence.** The environment counts as **chosen** once the user changes the Environment select, or once a stored draft whose type is UI Test is restored. Selecting the UI Test card (click or `?type=UI_TEST`) sets Development only while no environment has been chosen. That overrides the Production mount default (L130) and the environment of a restored non-UI-Test draft. So:
  - with `?type=UI_TEST` and a restored UI Test draft, the restored environment is kept;
  - a value picked after selecting the card is kept;
  - re-selecting the card after switching to another card keeps a chosen environment.

  [FR-01; D4; DC-15; G8/CRIT-15]
- **Switching back.** Another type card brings back the four-step stepper at Basic Information, keeping name, description, CSI and the current environment. Regular-check behaviour is otherwise unchanged. [FR-01; DC-15]
- **Create.** "Create and open Studio" sends the existing empty-draft request (`authoringSchemaVersion: 2`, `steps: []`, `variables: []`, default configuration). On success it removes `checks:create:draft` and replace-navigates to `ui-tests/{newId}/studio` without autorun. On failure the error shows inline, through the existing `createErrorMessage` mapping, and the route stays. From increment 1 this is the only create path (DC-24). [FR-02; RF-07; PC-03]
- **Preselect.** `?type=UI_TEST` preselects the card over a type restored from the stored draft, subject to DC-18. [FR-03; DC-06]
- **Legacy.** The legacy UI_TEST picker branches and the `uiTest` type field are removed in increment 1. [FR-04]

## 7. Editor (ChecksStudioPage)

### 7.1 Always loaded by route id

The editor reads `GET /studio/tests/{id}` directly, both on first load and when the route id changes while it is mounted. The change detector at L705-716 today ignores ids outside the loaded list. The loaded test is merged into the editor's test list, and a list reload keeps the selection. A 403, or a 400 for a malformed id, shows "This UI test doesn't exist or you don't have access" and loads nothing else. The stream-closing switch and the change detector must keep working (§17 R1).

**Availability gate.** The editor's outer gate follows DC-18 and uses only existing renders: `StudioUnavailable` when `'off'`, the existing "Loading test…" text when `'pending'` (no Studio request is sent), and the editor when `'on'` [FR-24; CRIT-25].

**There is no fallback (D7, DC-19).** The `list[0]` selection is deleted in increment 1, together with the bare `studio` route, so no product route mounts the editor without an id. A no-id mount, which only a test can produce, loads no test and offers nothing to run; the Plan decides the minimal render. Every test that mounts the editor moves to a route-id mount in increment 1 (§12.4), including WCAG surfaces 3-7 (§12.5). [FR-06, FR-25; RF-01; D7]

### 7.2 Autorun consumed once (DC-01)

**Settle event.** The autorun request is evaluated once, when all three hold:
1. the gate's own initial `GET /studio/tests/{id}` has completed (`loading` false, and a test or a load error set);
2. the gate's capabilities read has resolved (`'allowed'` or `'denied'`) or failed (permission stays `'unknown'`);
3. the editor draft for the route id is loaded, so "has steps" is known.

At settle, the request is served if RunControl's `runnable` predicate holds; otherwise it is dropped. The hook does not expose today whether the capabilities read has finished, so the Plan adds an observable signal. An `'unknown'` permission does not block, and the server's refusal is the visible outcome. [FR-13; NFR-05; PC-13; CRIT-2]

**Bound and drop on activity (G9, CRIT-18).** The API client bounds the wait. Each attempt times out after 30 s, and a GET is retried at most twice (about 90.6 s in the worst case, PL-01); after that the read counts as failed. The pending request is dropped, and nothing is sent later, if any of these happens before settle: the user edits a step, a variable or the environment; presses Run or Stop; the route id changes; or the editor unmounts. [FR-13; AC-29]

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

"Run again" (PC-06) and the Run button keep their current behaviour. [FR-13; RF-01, RF-03]

### 7.3 Framing

- **Breadcrumb:** "All Checks › {name}", where "All Checks" goes to `/checks/all`.
- **In-page back:** goes to the Tests page until increment 2, then to `ui-tests/{id}`.
- **"Open Tests":** goes to the Tests page until increment 3, then to `/checks/all?type=UI_TEST`.
- **CSI:** read-only.
- **Leave guard:** kept. The sidebar and browser Back stay unguarded.
- **`StudioScheduleDialog`:** opened with an explicit run-link target (DC-20).
- **Layout:** unchanged.

[FR-07, FR-08; CON-02; DC-09; D7]

### 7.4 Environment

The select offers four values. Saving a changed environment moves READY to NEEDS_RELEARN and invalidates the schedule; this is existing behaviour and does not change. [FR-01; DC-04; RF-02, RF-05]

## 8. UI test detail page (increment 2)

### 8.1 Load gating and errors

Every detail route reads `GET /studio/tests/{id}` first. Until that read succeeds, no header data, Overview, runs list or drawer content renders. Execution reads are authorized on the execution, not on the test (RF-04).

| Test read result | Shown |
|---|---|
| 403 or 400 | The single message |
| Any other failure | A load error with Retry (DC-13) |

No call ever probes `/checks/{id}`. When availability is `'pending'`, the route shows a loading state; when it is `'off'`, the route shows feature-unavailable (DC-18). [FR-12, FR-24, FR-25; NFR-03, NFR-06; DC-03]

### 8.2 Header

The header shows name, status chip (§9.3), a "UI Test" chip, CSI, environment and last run. Its actions:

- **Edit in Studio:** goes to `ui-tests/{id}/studio`.
- **Schedule:** opens `StudioScheduleDialog`, whose run links go to `ui-tests/{id}/runs/{executionId}`.
- **Run in Studio:** goes to `…/studio?autorun=1`.
- **Delete (overflow menu):** runs `DeleteTestDialog`, then navigates to `/checks/all`, a route that exists in every increment.

[FR-08, FR-09, FR-13; DC-14, DC-20]

### 8.3 Overview tab

The tab shows read-only numbered steps, readiness (with "Learning" while a learn is open), and read-only variables (name and kind; a secret shows only its vault reference name). It also shows `StudioScheduleSummary`. [FR-10; NFR-04; DC-02]

### 8.4 Runs tab

`GET /studio/executions?testId={id}` lists replays newest first, with `TablePagination` server paging and no filters. Learns never appear (RF-06). A one-line note says so, for example: "Runs lists replays of this test. Learning happens in Studio."

The tab renders its own table header. `RunRow` takes its single-test form, introduced in this increment with no prop because the Runs page is deleted in the same increment:

- the short run id is the row link, with the trigger source below it;
- the other cells are unchanged;
- there is no "Open test".

`useLiveRunsRefresh` keeps the list live. A row opens `RunDetailsDrawer` at `ui-tests/{id}/runs/{executionId}`, and opening that URL directly also opens the drawer. The drawer:

- receives `expectedTestId` = the route id. A mismatch in its own read, or in any live snapshot, switches it to its existing not-found state (G3);
- has its `testHref` going to `ui-tests/{testId}/studio`;
- copies the ui-tests run URL through `copyText` from "Copy link".

[FR-11, FR-12; D3, D7; DC-02, DC-03, DC-10, DC-17]

## 9. All Checks (increment 3)

### 9.1 Loading

Studio tests are fetched only when availability is `'on'`. The request is `GET /studio/tests?csiId&environment&q&sort=updatedAt,desc&size=100`, with one request per settled change and superseded requests cancelled. [FR-15; NFR-01, NFR-07; RF-08, RF-09; DC-07, DC-18]

### 9.2 Catalog rows and columns

Each row is `{kind:'check', check}` or `{kind:'uiTest', test, csiName}`. Rows are deduplicated by id, and the UI test wins. They are ordered by `createdAt` descending, with id as the tie-break (PC-01). `csiName` comes from the store; it falls back to the CSI id when the store's first page of 20 CSIs lacks it (PC-12). [FR-14; DC-07, DC-16]

| Column | UI test row |
|---|---|
| Selection | Disabled (FR-17) |
| Check Name | Name linking to `ui-tests/{id}`; a caption with the CSI name (or id); the description |
| Type | UI test icon and "UI Test" |
| Status | §9.3 chip |
| Last Execution | `lastRunAt` formatted as for checks, or "Never" |
| Actions | Execute and the row menu (§9.5) |

The environment is not shown, matching the check rows (PC-14).

### 9.3 Status mapping

| Readiness | Last run | Chip | Chip colour | Status filter value |
|---|---|---|---|---|
| UNLEARNED | any | Not learned | warning | Not learned (own value only) |
| LEARNING | any | Learning | info | Learning (own value only) |
| NEEDS_RELEARN | any | Needs re-learn | warning | Needs re-learn (own value only) |
| READY | PASSED | Passing | as the checks' Passing | Passing |
| READY | FAILED | Failing | as the checks' Failing | Failing |
| READY | ERROR | Error | as the Warning group | Warning |
| READY | none | Not run | as the Pending group | Pending |

Readiness filtering is client-side over at most 100 rows. [FR-16; DC-08; EC-05]

### 9.4 Filters and preselect

- **Type:** "UI Test" selects UI test rows. The option is hidden unless availability is `'on'` (DC-12).
- **Tags:** any active tag filter hides UI test rows.
- **Preselect:** `?type=UI_TEST` and a stored UI_TEST preference follow DC-18. While `'pending'` they are held. When `'on'` they are applied, with the URL winning over stored preferences, and the result is saved like any filter change (DC-06). When `'off'`, the Type filter shows All Types and UI_TEST is never written.

[FR-18, FR-22, FR-24]

### 9.5 Row actions and bulk

- **Execute:** tooltip "Run in Studio", opening `…/studio?autorun=1`.
- **Row menu:** Open, Edit in Studio, Schedule (ui-tests run links), Delete (then refresh).
- **Bulk:** UI test checkboxes are disabled, and select-all selects check rows only.

[FR-13, FR-17, FR-19; NFR-05]

### 9.6 Cap, failure, empty

- **Cap:** "Showing 100 of N UI tests — narrow by system or search".
- **Failure:** the inline message "UI tests could not be loaded · Retry". Check rows stay.
- **Empty:** "No UI tests yet", with a "Create UI test" action to `create?type=UI_TEST`.

[FR-20, FR-21, FR-23; NFR-06]

## 10. Availability and edge states

| Edge | Handling | Trace |
|---|---|---|
| Availability `'pending'` (sources or features not fetched yet) | No Studio request; a UI_TEST type from the URL, stored preferences or the stored draft is held, not applied, written or dropped; the detail routes show a loading state, and the editor shows its existing "Loading test…" text (L1167) with no Studio request | FR-24; DC-18; G10; CRIT-25 |
| Availability `'off'` | No Studio fetch and no UI test rows; Type option hidden; held UI_TEST dropped, never written; selected create type reset; card dimmed; Dashboard and palette entries hidden; ui-tests routes show feature-unavailable | FR-24, FR-22, FR-08; EC-03 |
| Sources arrive disabled after the first render | Same as `'off'`, applied immediately (derived state) | FR-24; AC-23 |
| Deep link or route change beyond page 1 | Loaded by id, with no fallback | FR-06; EC-01 |
| Editor mounted without an id (tests only) | No test loaded, nothing to run; the render is the Plan's minimal choice | FR-06; DC-19 |
| 403 or 400 on the test read | Single message; no other test; no run content; no check probing | FR-25, FR-12; EC-02 |
| Other test-read failure (detail page) | Load error with Retry | FR-25; DC-13 |
| Studio list failure | Checks stay; inline Retry | FR-21; EC-04 |
| More than 100 UI tests | Cap notice | FR-20; EC-05 |
| CSI not in the store's first page | CSI id shown | FR-14; DC-16 |
| No UI tests | Empty state | FR-23; EC-06 |
| Leaving mid-replay or mid-learn | The replay stays live in Runs. A learn is not listed, reads "Learning", and expires after 600 s unless the user returns in the same tab | FR-26; EC-07 |
| Reload or Back to an autorun URL; user activity before settle | No second run; the request is dropped | FR-13; EC-14 |
| Live snapshot for another test inside the drawer | Drawer shows not-found | FR-12; G3 |
| Run URL for another test | Not-found | FR-12; EC-08 |
| Same id in both sources | One UI test row | FR-14; EC-09 |
| Bookmark to a removed studio route | Module home via the catch-all | FR-27; EC-10 |
| Bulk select-all on a mixed page | Check rows only | FR-17; EC-11 |
| Create fails | Inline error | FR-02; EC-12 |
| Delete from the detail page | Existing dialog, then `/checks/all` | FR-09; EC-13 |

## 11. Removals (by increment, D7)

No old route, page or fallback survives the increment that replaces it. There are no redirects. [FR-04, FR-27; CON-03; D7; DC-22]

| Increment | Removed | Its references repointed in the same increment |
|---|---|---|
| 1 | Route `studio/:id` and the bare `studio` route, in both trees; the editor's no-id `list[0]` fallback; the legacy `UiTestConfig` picker, its export, its test and its Create/Review branches; the `uiTest` type field; `testHref` and `studioTestPath` (replaced by `uiTestEditorPath`); the dead `studioTestsPath`; the StudioScheduleDialog pathname derivation; the unused `navigationConfig.ts` (it targets `/checks/studio`); ChecksLayout's `/checks/studio` landing clause (L85); `CreateTestDialog` (DC-24) | Tests-page rows and the Runs-page test links and drawer `testHref` go to the new editor path. The "Create Test" actions on the Tests and Runs pages (header and empty state) go to `/checks/create?type=UI_TEST`. Dashboard and palette go to `/checks/studio/tests`, gated (DC-23). The dialog gets the Runs-page run link from its host. LayoutProvider maps `ui-tests` to Checks |
| 2 | Routes `studio/runs` and `studio/runs/:executionId`; `StudioRunsPage` and its test; the sidebar Runs child and its active-path mapping (navigationSetup L30, L73); ChecksLayout's `studio/runs` clause (L87); the Runs-page builders `runsListPath` and `runDetailsPath`; `RunRow`'s test-name form | Every dialog host passes the ui-tests run path. The editor back goes to the detail page. `RunRow` and `RunDetailsDrawer` serve only the Runs tab |
| 3 | Route `studio/tests`; `StudioTestsPage` and its test; the sidebar Studio group and its mapping (navigationSetup L19-33, L74-75); `useStudioTests`; `TestRow`; `TestRowMenu`; `StudioListLayout` with `SortableHeaderCell` and its test; `hooks/useUrlListState.ts` and its test; `LAST_RUN_FILTER_LABELS` (G4); ChecksLayout's `studio/tests` clause (L86); LayoutProvider's `/checks/studio` mapping (L70) | Dashboard and palette go to `/checks/all?type=UI_TEST`. The editor's "Open Tests" goes to `all?type=UI_TEST`. The dialog test drops its `TestRow` import |
| 4 | Anything left over, found by a final grep for `studio/` routes and removed modules (the route tests assert every removed path) | — |

These stay:
- `READINESS` (used by `readinessFor` and the contract test);
- `copyText` (used by the drawer's copy-link; the Plan decides whether it stays in `runLinks.ts` or moves);
- `createErrorMessage` (reused by Create Check's inline error), and `STUDIO_TEST_ENVIRONMENTS` and `TEST_NAME_MAX_LENGTH` (shared constants);
- `studioListSx.ts` (imported by `RunRow`).

The comment at ChecksStudioPage L734 is updated where that code is touched.

## 12. Test strategy

Run only narrow tests. The gates are `pnpm run type-check`, `pnpm run lint`, `pnpm run test <touched specs>`, and `pnpm run test:e2e` for the touched E2E specs (MSW project), and they must pass **at the end of every increment**. There are no a11y criteria. [NFR-09; CON-04, CON-10]

### 12.1 Unit

| Test | Covers |
|---|---|
| Catalog rows: kind, dedupe, order, the 7 status cases, grouping, tag hiding, CSI fallback, column values | FR-14, FR-16, FR-18 |
| UI test path helpers, for both module bases | FR-05, FR-11; CON-06, CON-09 |
| Availability derivation: not fetched → pending; fetched with empty lists → on; UI_TEST disabled → off | FR-24; DC-18 |
| Empty-draft request builder | FR-02 |

### 12.2 Component and route (Vitest + RTL + Node MSW)

| Surface | Scenarios | AC |
|---|---|---|
| Create Check, UI Test | The one form; the four environments; the "environment chosen" rule (HTTP Staging draft → Development; a later UAT pick kept; switch back keeps the fields; re-selecting keeps a chosen value; a UI Test Staging draft with `?type` keeps Staging); no card on the edit page; one create request, draft removed, replace navigation; inline error through `createErrorMessage` (400, 403, 409, 500, moved from the Tests page test); `?type` held while pending, ignored when off; sources arriving disabled after the first render leave no one-form and no submit | AC-01–AC-05, AC-23, AC-30 |
| ChecksStudioPage | Id beyond page 1, both on load and on route change; 403 with no fallback; a no-id mount loads nothing and requests no run; breadcrumb, back and links per increment; UAT listed. Autorun once: READY with permission allowed; READY with the capabilities read failed and execute answering 403; UNLEARNED; LEARNING; no steps; canManage false; failed read; before settle; a draft edit, a Run press or a route change before settle; a remount after replace; "Run again" unaffected | AC-01, AC-06–AC-08, AC-29 |
| StudioScheduleDialog | Increment 1: the run link from the host goes to the Runs-page run. From increment 2: it goes to `ui-tests/{id}/runs/{executionId}` | AC-09 |
| UI test detail page | Header and actions; Overview; Runs (`testId`, gating, note, header, short-id link, no "Open test", paging); drawer deep link, `expectedTestId` mismatch in the read and in a live snapshot, editor `testHref`, copy-link; a 403 test with a 200 execution; 400 and 500 with Retry; Run in Studio sends no execute; a learn is not listed; pending shows a loading state | AC-10–AC-14, AC-24, AC-25 |
| All Checks | Rows, params, columns and the CSI fallback; order; cancellation; chips and filters; bulk; tags; actions; cap; failure; empty; availability pending, on and off, including sources arriving late; `?type` versus prefs | AC-04, AC-14–AC-23 |
| Navigation and entry points | Per increment: the Runs child gone (2), the Studio group gone (3); Dashboard and palette targets (`/checks/studio/tests`, then `/checks/all?type=UI_TEST`) and hidden unless `'on'` | AC-09, AC-23, AC-26 |
| **Route test, one per tree** | Renders App.tsx with `ChecksLayout` mocked as a passthrough and the lazy pages as sentinels (G5), because ChecksLayout mounts `PlatformSidebar` from `@put/core-components`. In the federated (`/checks/...`) and standalone (`/...`) trees, each `ui-tests` path renders its sentinel behind the STUDIO gate, and each path removed so far lands on module home. Created in increment 1; its removed-path list grows in increments 2 and 3 | AC-26; CON-09 |

### 12.3 Acceptance scenarios (highest risk)

```gherkin
Feature: UI tests as checks

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

  Scenario: Late sources switch UI tests off (AC-23)
    Given all?type=UI_TEST opened before sources are fetched
    When sources arrive with UI_TEST disabled
    Then no GET /studio/tests was sent and UI_TEST is not in the stored preferences

  Scenario: No run content without the test (AC-13)
    Given GET /studio/tests/{id} answers 403 and GET /studio/executions/{executionId} answers 200
    When the user opens ui-tests/{id}/runs/{executionId}
    Then only "This UI test doesn't exist or you don't have access" is shown

  Scenario: UI tests cannot be bulk-selected (AC-17)
    Given All Checks shows check rows and UI test rows
    When the user clicks select-all
    Then only check ids are in the bulk selection
```

The full criteria are AC-01 to AC-30 in requirements.json.

### 12.4 Existing tests and E2E, by increment

**Increment 1**

- **Delete:** `UiTestConfig.test.tsx`.
- **Re-mount on a route id** (D7; a mount change only): every bare-router `ChecksStudioPage` mount. These are 12 sites in 10 files (PL-03, plan lineReverification; critique 3), and a shared route-id mount helper covers them:
  - `pageAuthoringUx`
  - `pageEvidence` ×3
  - `pageGuidedRun` (its existing `/studio/tests/:id` case stays)
  - `pageIncrementalRecording`
  - `pageReplayAndReferences`
  - `pageRunGate`
  - `pageSaveAndStop`
  - `pageStepTimeout`
  - `test/pageBootstrapShape` (fail-open intent kept)
  - `studioWcagAudit` (§12.5)

  Their MSW handlers already answer `GET /studio/tests/{id}`. `studioRunTransport.node` already mounts with an id; its test-local `/studio` route without an id is changed to one with an id. The test-local route shapes in `pageGuidedRun` (L1012-1024) and `studioRunTransport.node` (L170-175) look like the old product route (`/studio/tests/:id`), but they are not product routes, so D7 does not require changing them; the Plan may point them at `ui-tests/:id/studio` (critique 3, CRIT-25a). `components/studio/run/replayFailure.test.tsx` does not mount the page and is not touched (G6). `executionScenarioMatrix` and `executionFixtureMatrix` stay green.
- **Update editor-URL assertions** (G2):
  - `StudioTestsPage.test.tsx` L228, L273, L422;
  - `StudioRunsPage.test.tsx` L107, L274;
  - `runSnapshots.test.ts` L52-53 (`studioTestPath` removed);
  - `scheduleProvenance.test.tsx` L28 (`testHref`);
  - `StudioScheduleDialog.test.tsx` (the run-link target is passed in; the Runs-page hrefs are kept);
  - `StudioTestsPage.test.tsx` "Tests page — create" (L355-439: the 255-character counter L376, the system field L389, the create-and-open case L404-423, the refusal cases L425-430) and `StudioRunsPage.test.tsx` "Create Test" (L219-228) are rewritten (K4). Each page keeps one assertion that "Create Test" (header and empty state) navigates to `/checks/create?type=UI_TEST`. The name, system and refusal cases move to the Create Check UI Test test, where `createErrorMessage` is reused;
  - the `pageStepTimeout.test.tsx` L128 comment ("The Tests page creates a draft") now names Create Check.
  - `referencePicker.test.tsx` L610: drop `../../checks/wizard/configs/UiTestConfig.tsx` from its static-source scan list, because that file is deleted in this increment and `fs.readFileSync` would fail (K3).
- **E2E** (G1):
  - `studio-variables.spec.ts` L104, L174, L233-234 and `studio-guided.spec.ts` L185: the editor URL;
  - `studio-authoring-real-backend.spec.ts`: rewritten to start from Create Check → UI Test, with its id parse at L151 reading the segment before `/studio`. It runs only with `CHECKS_E2E_REAL_BACKEND=1`.

**Increment 2**

- **Delete:** `StudioRunsPage.test.tsx`.
- **Update:**
  - `runSnapshots.test.ts` L49-51 (Runs-page builders removed);
  - `scheduleProvenance.test.tsx` L20-21 (`RunRow` in single-test form);
  - `StudioScheduleDialog.test.tsx` L145, L234, L252 (ui-tests run hrefs).

**Increment 3**

- **Delete:** `StudioTestsPage.test.tsx`, `StudioListLayout.test.tsx`, `hooks/useUrlListState.test.tsx`.
- **Update:**
  - `StudioScheduleDialog.test.tsx`: drop the `TestRow` import (L17) and `RowFlow` (L53-56); entries L27 and L233 move off `/studio/tests`;
  - `ChecksLayout.a11y.test.tsx` L45 (entry path only);
  - E2E `harness.spec.ts` L57, L94 and L142 move from `/checks/studio/tests` to `/checks/all` (they record `GET /api/v1/studio/tests`, which All Checks sends). The E2E MSW handler set gains an empty `GET */api/v1/checks` handler in `e2e/previewBootstrapHandlers.ts` (plan subtask 3.19). Today it serves `*/api/v1/checks/sources`, `*/api/v1/features` and `*/api/v1/csi` (L33-35) but not `GET /api/v1/checks`, and without the new handler All Checks replaces the page with its error state (AllChecksPage.tsx L339-341) (K2).

[NFR-09; brief §4.7; G1, G2, G6; D7; CRIT-12, CRIT-17]

### 12.5 WCAG regression guard (ADR-SC-006), by increment

| Increment | Change | Reason recorded if the baseline moves (in `studio-wcag-audit.md`, same increment) |
|---|---|---|
| 1 | Surfaces 3-7 (ChecksStudioPage states) re-mounted on a route id instead of the bare `MemoryRouter` (`renderPage` L203-208). Increment 1 also changes the editor DOM those surfaces render: the breadcrumb, the read-only CSI and the UAT option (§7.3, §7.4). `axe-results.json` records every finding, not only failures (studioWcagAudit.test.tsx L243-275), so the baseline may move | "mount changed to a route id (D7)" and/or "editor framing (increment 1: breadcrumb, read-only CSI, UAT option)", "no surface added" |
| 2 | Surface 2 (`StudioRunsPage`) and its pins removed; its import (L27) dropped | "surfaces deleted" |
| 3 | Surface 1 (`StudioTestsPage`) and its pins removed; its import (L26) dropped | "surfaces deleted" |

The baseline `docs/qa/accessibility/axe-results.json` is regenerated whenever it moves, and a moved baseline is never committed silently. The rule is `.claude/rules/accessibility-scope.md`: if a change breaks the audit, fix the regression; otherwise regenerate the baseline with the recorded reason. No surface is ever added, including the detail page and All Checks. The audit passes at every increment. The guard rule (`.claude/rules/accessibility-scope.md`) requires the reason to be recorded in the same increment, so it is never deferred to the increment 4 docs. The D5 pass in increment 4 only checks that file for consistency. [FR-28; CON-04; D7]

## 13. Documentation updates (D5, increment 4)

| File | Lines | Change |
|---|---|---|
| PRD.md | L76 | Remove the compile wording (ADR-SC-005) |
| PRD.md | L78 | Studio scheduling is implemented and off by default |
| PRD.md | L90-L99 | Two-panel Studio; L99 drops compile/confirm and "Schedule configuration is post-V1" |
| PRD.md | L111 | Studio scheduling is no longer "Later" |
| PRD.md | L115 | The unified UI_TEST catalog view moves to V1 as a frontend view; the other projections stay "Later" |
| PRD.md | L128, L158, L229 | Remove the compile/confirm wording |
| PRD.md | L121 | No change |
| CLAUDE.md | L101-117 | Two-panel Studio; the nav tree has UI tests under All Checks and no Checks Studio entry |
| AGENTS.md | L106, L117 | The same (DC-21) |
| docs/architecture/studio-execution.md | L20, L23, L229, L235 | Scheduling status; the catalog view on the `ui-tests` routes; separate aggregates; Flow 2 deferred |
| ARCH.md | Frontend scope (placement per plan G11) | UI tests in All Checks as a frontend view of `GET /studio/tests` on the `ui-tests` routes |
| docs/qa/accessibility/studio-wcag-audit.md | Records from increments 1-3 | Consistency check only (§12.5) |

Not changed (observations):
- the CLAUDE.md and AGENTS.md stack versions;
- the ARCH.md compile-era API lines.

[FR-29; DC-11, DC-21; PC-05]

## 14. Increments

Each increment removes what it replaces (D7), repoints its references, passes its gates, and leaves no link to a deleted route. [CON-08; DC-22]

| # | Size | Scope | FRs | ACs |
|---|---|---|---|---|
| 1 | S–M | <ul><li>Editor at `ui-tests/:id/studio`, always loaded by id, no fallback.</li><li>Autorun consumed once at a bounded settle; UAT option.</li><li>Create Check UI Test branch as the only create path; `CreateTestDialog` deleted, and the "Create Test" actions repointed (DC-24).</li><li>Availability hook; card gating.</li><li>Path helpers; schedule dialog run link passed in.</li><li>Dashboard and palette repointed and gated; layout mapping.</li><li>Breadcrumb and read-only CSI; route tests.</li><li>Editor tests and WCAG surfaces 3-7 re-mounted on an id.</li><li>Increment 1 removals and test and E2E updates (§11, §12.4).</li></ul> | FR-01–FR-06; FR-07 (breadcrumb, CSI, leave guard); FR-08 (editor links, dialog, Dashboard and palette); FR-13 (editor); FR-24 (card, routes, entries); FR-25 (editor); FR-27 (inc 1); FR-28 (re-mount) | AC-01–AC-07; AC-08 (breadcrumb, CSI); AC-09 (inc 1); AC-23 (card, entries); AC-26 (inc 1); AC-27 (inc 1); AC-29; AC-30 |
| 2 | M | <ul><li>Detail page: header, Overview, Runs with the single-test `RunRow`, drawer with `expectedTestId`.</li><li>Gating and errors; Run in Studio.</li><li>Editor back goes to the detail page.</li><li>Dialog links go to the ui-tests run path.</li><li>Increment 2 removals (§11); WCAG surface 2 dropped.</li></ul> | FR-07 (back); FR-08 (dialog); FR-09–FR-12; FR-13 (detail); FR-25 (detail); FR-26; FR-27 (inc 2); FR-28 (surface 2) | AC-08 (back); AC-09 (inc 2); AC-10–AC-14; AC-24; AC-25; AC-26 (inc 2); AC-27 (inc 2) |
| 3 | M | <ul><li>All Checks merge (rows, columns, CSI fallback, loading, mapping, filters, bulk, tags, actions, cap, failure, empty, availability).</li><li>`?type` on All Checks.</li><li>"Open Tests", Dashboard and palette go to All Checks.</li><li>Increment 3 removals (§11); WCAG surface 1 dropped; harness E2E.</li></ul> | FR-07 (Open Tests); FR-08 (inc 3 targets); FR-14–FR-24; FR-27 (inc 3); FR-28 (surface 1) | AC-04 (all); AC-08 (Open Tests); AC-09 (inc 3); AC-15–AC-23; AC-26 (inc 3); AC-27 (inc 3) |
| 4 | S | D5 docs (§13) and any leftovers from the final grep | FR-27 (leftovers); FR-29 | AC-28 |

### 14.1 Link walk at each increment boundary

| Link source | After increment 1 | After increment 2 | After increment 3 |
|---|---|---|---|
| Editor in-page back (L1061) | `/checks/studio/tests` | `ui-tests/{id}` | `ui-tests/{id}` |
| Editor "Open Tests" (L1194) | `/checks/studio/tests` | `/checks/studio/tests` | `/checks/all?type=UI_TEST` |
| Editor breadcrumb "All Checks" | `/checks/all` | `/checks/all` | `/checks/all` |
| Schedule dialog "Inspect run" / "View run" (every host) | `/checks/studio/runs/{executionId}` | `ui-tests/{id}/runs/{executionId}` | same |
| Tests page row (`TestRow`) | `ui-tests/{id}/studio` | `ui-tests/{id}/studio` | removed |
| "Create Test" on the Tests page and the Runs page (header and empty state) | `/checks/create?type=UI_TEST` | Tests page only: same | removed |
| Runs page test link and drawer `testHref` | `ui-tests/{id}/studio` | removed | — |
| Runs tab drawer `testHref` | — | `ui-tests/{testId}/studio` | same |
| Detail page Delete | — | `/checks/all` | `/checks/all` |
| Dashboard "Open Checks Studio", command palette "Studio" (only when `'on'`) | `/checks/studio/tests` | `/checks/studio/tests` | `/checks/all?type=UI_TEST` |
| Sidebar | Studio group: Tests, Runs | Studio group: Tests | No Studio group |
| Create Check UI Test → editor | `ui-tests/{newId}/studio` | same | same |
| All Checks UI test rows | — | — | detail page, editor, autorun |

Only routes that exist at that boundary are targets: `studio/tests` until increment 3, `studio/runs/*` until increment 2, and `ui-tests/*` from the increment that adds each path. [D7; CON-08; PC-15]

## 15. Flow 2 forward-compatibility (constraint only)

The later backend link (shared id, `UiTestConfiguration`, check written on create, `check_id` on executions, outcomes in check history, 403 parity, refusal of UI_TEST by generic schedule and bulk, `GET /checks` UI_TEST rows, `CheckDetailsPage` redirect) must land without changing these routes, screens or the create flow. The seams that allow this are the type-segmented routes, the id dedupe with the UI test winning, the single path helpers, and the Create Check flow. None of it is done here. [CON-06; D6; brief §4.9]

## 16. Out of scope, known issues, observations

### 16.1 Out of scope

- Flow 2; any backend, API, schema or Flyway change; backend data cleanup (D7 applies to the frontend scope, D1).
- A cross-test runs list; any ChecksStudioPage layout change.
- Tags, direct or bulk execute, and acknowledge or assign for UI tests.
- A server union; a server-side readiness filter.
- Redirects or aliases; guarding the sidebar or browser Back.
- Editing steps, variables or secrets outside Studio; generic scheduler integration.
- Any a11y work; application-component and report projections.
- Showing learns in Runs, or releasing an abandoned learn sooner (backend).
- Raising the CSI store's 20-CSI page.
- Replacing the existing Test Now `fetch`.

### 16.2 Known issues and follow-ups (existing behaviour; DC-05)

1. A guided start answered 503 or 401 shows nothing, and the next mount re-sends it.
2. A Vault 503 on execute is worded as a platform-wide switch-off.
3. `GuidedSessionException` refusals render the "no wording for" narrative.
4. An abandoned learn holds LEARNING and capacity until it expires (600 s).

### 16.3 Observations (not fixed)

- CLAUDE.md and AGENTS.md say MUI and React Router v7.
- Stale comments about NEEDS_RELEARN and list readiness (StudioReadiness.java L15-18, StudioService.java L169-170, L432-433, studioTypes.ts L115-116).
- ARCH.md compile and confirm-compile API lines (L787-788).

## 17. Risks and mitigations

| # | Risk | Prob. | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Load-by-id breaks the stream-closing switch, the route-change detector or autorun ordering, and the editor tests now all run through it | Med | High | Keep both guards; tests for both the on-load and the route-change id; the re-mounted editor family and WCAG surfaces 3-7 now cover the real path (§12.4, §12.5) |
| R2 | Autorun consumption disturbs "Run again", or settle fires too early or never | Med | Med | An observable settle; the client bound and drop-on-activity (§7.2); tests for before settle, a failed capabilities read, activity before settle and "Run again" |
| R3 | A learn started from Execute is lost if the user leaves | Med | Med | The Runs note and the "Learning" chip; follow-up (§16.2) |
| R4 | Runs of an inaccessible test leak onto the detail page or into the drawer | Med | High | Load gating, the `testId` check and the drawer's `expectedTestId` (DC-03, DC-17) |
| R5 | The `size=100` Studio list is costly | Med | Med | One request per settled change, with cancellation; measure in the pilot |
| R6 | CSI ids shown beyond the store's 20 CSIs | Med | Low | Id fallback; out of scope to raise |
| R7 | The silent guided-start 503/401 shows up more often | Med | Low | Known issue |
| R8 | A malformed id answers 400 (inferred) | Low | Low | FR-25 treats 400 like 403 |
| R9 | Schedule summary reads for a soft-deleted test are unverified | Low | Low | The test read gates the page first |
| R10 | Old bookmarks land on module home | Low | Low | Accepted (CON-03, D7) |
| R11 | Line references drift | Med | Low | The Plan re-verifies (ASM-06) |
| R12 | A saved `?type=UI_TEST` surprises a later plain visit | Low | Low | Same as any filter change; dropped when off |
| R13 | A late sources answer applies or saves UI_TEST | Low | Med | Derived availability with `'pending'` (DC-18); late-sources tests |
| R14 | Earlier removals (D7) make an increment's links or tests break mid-story | Med | Med | The §14.1 link walk, the §12.4 per-increment test list, the route test asserting removed paths, and the gates at each increment |

## 18. Open questions

None are open. No item blocks the Plan, and none needs backend work. The plan has been re-sequenced for D7 (plan revision 2, 78 subtasks), with no blocked subtasks left, and K1-K4 are resolved (DC-24; §12.4). The next steps are the plan's approval and then @sm.

## 19. Traceability

| FR | Spec sections | AC | Increment |
|---|---|---|---|
| FR-01 | §6, §7.4 | AC-01, AC-30 | 1 |
| FR-02 | §6 | AC-02, AC-03 | 1 |
| FR-03 | §6 | AC-04 | 1 |
| FR-04 | §6, §11 | AC-05 | 1 |
| FR-05 | §5, §7 | AC-06 | 1 |
| FR-06 | §7.1, §12.4 | AC-06, AC-07 | 1 |
| FR-07 | §7.3 | AC-08 | 1, 2, 3 |
| FR-08 | §5, §7.3, §8.2, §14.1 | AC-09 | 1, 2, 3 |
| FR-09 | §8.2 | AC-10 | 2 |
| FR-10 | §8.3 | AC-11 | 2 |
| FR-11 | §8.4 | AC-12 | 2 |
| FR-12 | §8.1, §8.4 | AC-13 | 2 |
| FR-13 | §7.2, §8.2, §9.5 | AC-14, AC-29 | 1, 2, 3 |
| FR-14 | §9.2 | AC-15 | 3 |
| FR-15 | §9.1 | AC-15, AC-23 | 3 |
| FR-16 | §9.3 | AC-16 | 3 |
| FR-17 | §9.5 | AC-17 | 3 |
| FR-18 | §9.4 | AC-18 | 3 |
| FR-19 | §9.5 | AC-19 | 3 |
| FR-20 | §9.6 | AC-20 | 3 |
| FR-21 | §9.6 | AC-21 | 3 |
| FR-22 | §9.4 | AC-04 | 3 |
| FR-23 | §9.6 | AC-22 | 3 |
| FR-24 | §6, §8.1, §9.1, §9.4, §10 | AC-23 | 1, 3 |
| FR-25 | §7.1, §8.1 | AC-07, AC-24 | 1, 2 |
| FR-26 | §8.4, §10 | AC-25 | 2 |
| FR-27 | §5, §11, §14 | AC-26 | 1, 2, 3, 4 |
| FR-28 | §12.5 | AC-27 | 1, 2, 3 |
| FR-29 | §13 | AC-28 | 4 |

The NFRs are covered in these sections:
- §9.1: NFR-01, NFR-07
- §12: NFR-02, NFR-09
- §5 and §8.1: NFR-03
- §8.3 and §2.2: NFR-04
- §7.2 and §9.5: NFR-05
- §8.1 and §9.6: NFR-06
- §4: NFR-08

The constraints are reflected in §1.3, §2.3, §11, §12.2, §14 and §15.

## 20. Implementation checklist

- [ ] **Increment 1:** helpers; availability hook; one create path (`CreateTestDialog` deleted, "Create Test" repointed); editor route and load by id with the fallback deleted; autorun once (bounded settle, drop on activity); UAT; Create Check UI Test branch; card and entry gating; Dashboard and palette set to `/checks/studio/tests`; dialog link passed in; route tests; editor-test and WCAG surface 3-7 re-mount; increment 1 removals and test and E2E updates; gates.
- [ ] **Increment 2:** detail page (gating, header, Overview, Runs, single-test `RunRow`, drawer `expectedTestId`); back target; dialog links to ui-tests runs; increment 2 removals; WCAG surface 2; gates.
- [ ] **Increment 3:** All Checks merge; All Checks targets for Open Tests, Dashboard and palette; increment 3 removals (including `StudioListLayout`, `useUrlListState`, `LAST_RUN_FILTER_LABELS`); WCAG surface 1; harness E2E; gates.
- [ ] **Increment 4:** D5 docs; final grep for leftovers; gates.

## 21. Revision log

| Item | Iteration | Resolution |
|---|---|---|
| CRIT-1 to CRIT-13 | 2 | See critique-1 resolutions (DC-15 to DC-21) |
| CRIT-14 (G10) | 3 | Derived `'pending' \| 'on' \| 'off'` availability (DC-18, §10, AC-23) |
| CRIT-15 (G8) | 3 | The "environment chosen" rule (§6, AC-30) |
| CRIT-16 (G7) | 3 | Superseded by D7: the fallback is deleted in increment 1 (DC-19) |
| CRIT-17 | 3 | Dialog-test `TestRow` change moved with TestRow to increment 3; `studioListSx` stays; AC-23 split across increments 1 and 3; PC-11 confirmed (StudioTestsPage L5 imports `StudioListLayout`), so the plan's (c) correction does not apply |
| CRIT-18 (G9) | 3 | Client-bounded settle and drop on activity (§7.2, AC-29) |
| G1, G2 | 3 | E2E, editor-URL and page-test fixes land in increment 1 (§12.4) |
| G3 | 3 | Drawer `expectedTestId` (DC-17, FR-12, AC-13) |
| G4 | 3 | `useUrlListState` and `LAST_RUN_FILTER_LABELS` removed in increment 3 (§11) |
| G5 | 3 | Route test mocks ChecksLayout (§12.2) |
| G6 | 3 | `replayFailure.test.tsx` dropped from the mount list (§12.4) |
| D7 | 3 | Removals by increment (§11, DC-22), the link walk (§14.1), WCAG per increment (§12.5), Dashboard and palette interim target (DC-23) |
| D7 create-path conflict | 4 | `CreateTestDialog` deleted in increment 1, with one create path from then on (DC-24, main session, applying D7) |
| `StudioListLayout` timing | 4 | Stays until increment 3, because StudioTestsPage imports it at L5 (PC-11, DC-10) |
| WCAG record timing | 4 | Each baseline move is recorded in the increment that moves it, never deferred to increment 4 (§12.5, FR-28) |
| K2-K4 (re-sequenced plan) | 5 | K2: empty `GET */api/v1/checks` E2E handler in increment 3. K3: `referencePicker.test.tsx` L610 scan entry dropped in increment 1. K4: the create-dialog test cases (StudioTestsPage.test L355-439, StudioRunsPage.test L219-228) rewritten in increment 1 (§12.4). K1 was already covered by DC-24 |
| Critique 3 LOW (CRIT-21, CRIT-24, CRIT-25) | 6 | 12 bare-mount sites in 10 files; the K2 handler text; the §18 and Metadata state; the increment 1 WCAG reason names the editor framing; the editor's `'pending'` render uses the existing "Loading test…" text, with `StudioUnavailable` for `'off'` (DC-18, §7.1); the test-local route shapes noted |

## Metadata

- **Generated by:** @pm (Morgan) via spec-write-spec
- **Inputs:** requirements.json, complexity.json, research.json, critique.json (iteration 2, APPROVED), plan/implementation.yaml, the source brief, user decision D7
- **Iteration:** 6 (post-approval patches: D7, plan gaps, the single create path, plan gaps K2-K4, critique 3 LOW fixes)
- **Next:** plan approval (plan revision 2 is done), then @sm drafts the four stories
