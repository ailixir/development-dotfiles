# Studio scheduling: UX analysis and proposed interaction plan

Status: planning proposal, not an implemented capability or approved delivery commitment. Prepared by Uma, UX/UI Designer & Design System Architect, on 2026-10-05. Scope assumption: recurring execution of individual saved Studio tests; the parent workflow is eliciting scope. No product code is changed by this document.

## Requirement and evidence boundary

The user requested analysis and a plan to build scheduling for UI Studio tests. Existing product artifacts explicitly defer Studio scheduling: `PRD.md:78`, `PRD.md:99`, `PRD.md:111`, and `PRD.md:115`. The platform goal is scheduling without specialist assistance (`PRD.md:47`); UC-02 supplies a platform example of a five-minute cadence (`PRD.md:144`), not a Studio capacity promise. The Studio trust model requires confirmation of generated instructions and separates outcome from evidence (`PRD.md:87`, `PRD.md:110`, `PRD.md:119`). Accessibility is already a product requirement (`PRD.md:130`).

Everything under “Proposed” below is a recommendation derived from that request and the verified implementation findings. It becomes an implementation requirement only when accepted in the product/architecture plan and story acceptance criteria. This document adds no suites, recipients, reports, notifications, custom run variables, alternate browsers, or runtime translation.

## Verified implementation findings

| Finding | Source and consequence |
|---|---|
| UI Tests already has a server-paged list with global CSI/environment scope, readiness, last run and row actions. | `frontend/src/pages/StudioTestsPage/StudioTestsPage.tsx:20`, `:124`, `:146`. Put schedule management beside the test rather than create a new destination for MVP. |
| Test row actions are Open and Delete. There is deliberately no Run now action bypassing the editor gate. | `frontend/src/components/studio/tests/TestRowMenu.tsx:14`, `:45`. A scheduling action must call a schedule service, not start execution or clone the run gate. |
| The editor header exposes Saved/Unsaved changes, Save and Run Test. Saving is version-conditional and can return a conflict. | `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx:717`, `:750`, `:759`, `:600`, `:615`. Scheduling needs an explicit saved-version boundary and must not save authoring edits as a side effect. |
| Manual Run may save and translate before execution. | `frontend/src/components/studio/run/RunControl.tsx:13`, `:43`. The scheduling worker must not imitate this authoring interaction: unattended work requires an already confirmed current revision. |
| Readiness has five distinct states and is not schedule state. | `frontend/src/components/studio/tests/testListPresentation.ts:21`. Preserve Ready to run / Needs confirmation / Translating / Needs changes / Not translated vocabulary. |
| Studio has an inert `schedule: string \| null`, while its write request has no schedule member. | `frontend/src/types/studio/studioTypes.ts:274`, `:388`; `docs/specs/studio/openapi.yaml:2307`. Do not interpret this string as a live schedule or overload it with a new structured contract. |
| Studio mock drafts are given `status: 'PAUSED'` and `schedule: null`. | `frontend/src/services/mocks/studio/handlers.ts:347`; fixture examples at `frontend/src/services/mocks/studio/fixtures.ts:70`. That legacy status does not mean a real schedule was paused. Schedule state needs its own authoritative projection. |
| Generic schedule CRUD supports check IDs, cron, timezone, enabled and nextExecutionAt. | `frontend/src/services/api/schedulesApi.ts:7`, `:35`, `:48`; `frontend/src/services/api/mappers/scheduleMapper.ts:3`. Studio test IDs are a separate resource; this adapter cannot be reused unchanged. |
| Generic scheduling requires a Check row and its CSI write permission. | `backend/src/main/java/com/citi/put/checks/scheduling/ScheduleService.java:61`. Studio manual execution is currently open to authenticated application users and secret access is checked separately. |
| Studio manual execution and secret use are deliberately distinct permissions. | `backend/src/main/java/com/citi/put/checks/studio/StudioController.java:170`; `backend/src/main/java/com/citi/put/checks/studio/dispatch/StudioAcceptanceService.java:220`. The product/architecture plan must select schedule-manage and scheduled-execution identity policies; frontend should not infer them from a Run button. |
| The existing ScheduleDialog is coupled to CheckEntity, generic schedule calls and a Redux check refresh. | `frontend/src/components/scheduling/ScheduleDialog.tsx:35`, `:104`, `:118`. Reuse the field layout and patterns through a pure form; provide a Studio-specific adapter. |
| That dialog hides timezone selection and defaults to America/New_York when missing. It estimates presets as now plus duration. | `frontend/src/components/scheduling/ScheduleDialog.tsx:110`, `:127`, `:138`. A five-minute cron ticks on clock boundaries; now-plus-five-minutes is not a reliable next-run promise. |
| Its cron helper accepts five/six numeric fields without a timezone input. UI examples include named weekdays, and its helper text names the fields incorrectly. | `frontend/src/utils/cronNextRun.ts:48`, `:78`, `:89`; `frontend/src/components/scheduling/ScheduleDialog.tsx:282`, `:289`. Prefer backend validation/preview rather than carry these discrepancies into Studio. |
| Generic backend normalizes five-field input and validates cron/timezone. | `backend/src/main/java/com/citi/put/checks/scheduling/ScheduleService.java:190`, `:201`, `:230`. Agree a single Studio syntax and reuse validated server semantics where feasible; do not make the client parser the authority. |
| Studio runs already support status filters, deep links, live details and recordings. | `frontend/src/pages/StudioRunsPage/StudioRunsPage.tsx:54`, `:155`; `frontend/src/components/studio/runs/RunDetailsDrawer.tsx:171`. Scheduled browser executions belong in this history. |
| Execution snapshots contain revisionId but currently no trigger/schedule/occurrence provenance. | `frontend/src/types/studio/studioTypes.ts:477`. “Scheduled” labels and scheduled-for timestamps require additive contract fields. |
| Existing error narratives distinguish definite non-execution, ambiguous dispatch, revoked permission and unavailable references. | `frontend/src/components/studio/run/executionErrorNarratives.ts:58`, `:65`, `:95`, `:111`. Reuse those explanations for real accepted executions; skipped schedule occurrences require distinct language. |
| Studio MSW handlers cover test authoring/compile/confirmation/execution, not schedule CRUD. | `frontend/src/services/mocks/studio/handlers.ts:281`, `:428`, `:447`, `:484`. Add a schedule fixture/state module and handlers before building frontend interactions. |

## Proposed smallest coherent experience

### Entry points and information hierarchy

1. Add a secondary **Schedule** action in the saved test editor header and the UI Tests row menu. Existing schedule changes the menu label to **Manage schedule**. Run Test remains the prominent execution action.
2. Under each test's name, display a compact schedule summary in its existing metadata area: **No schedule**, **Active · Every 15 minutes**, **Paused · Every 15 minutes**, or **Blocked · Needs confirmation**. Preserve the readiness column. This avoids squeezing another required column into the responsive list. A detail line can show the next due time where space permits.
3. In the editor, show the same summary immediately below the header, with **Next scheduled run** and a management link. Use an alert only for a blocked schedule with a corrective action; ordinary active/paused state is metadata.
4. Use one Studio schedule dialog from both entry points, showing the test name, System (CSI), environment and saved revision context. Global CSI/environment filters scope list discovery; they must not silently replace the scheduled test's persisted configuration.
5. No new navigation item is needed for an individual-test MVP. Integration into the generic Schedules page is a separate platform-contract decision because it presently treats every target as a Check.

### Create and edit

The proposed MVP has at most one schedule per test, matching the existing generic check-schedule pattern but requiring an explicit Studio uniqueness rule. Opening an unscheduled, eligible test shows **Schedule UI test**. Opening an existing schedule shows **Manage schedule**.

Dialog content, in order:

- Test identity/context, read-only.
- **Frequency**, with a small familiar preset list sourced from the agreed scheduling contract. Recommend Every 5 minutes, Every 15 minutes, Every hour, Daily, and Custom cron if allowed by backend Studio admission/capacity policy. Do not expose Every minute solely because the generic dialog does. Capacity policy and minimum frequency remain architecture decisions.
- **Time** when Daily is selected, rather than requiring cron knowledge for a common daily schedule. The default time must be visible and editable.
- **Time zone**, required and searchable; recommend an explicit UTC default until a user/platform preference is established. Show IANA identity such as `America/New_York`, with a readable label. Do not silently take browser time zone or use “EST” as a year-round label.
- An advanced **Cron expression** field for Custom. Propose canonical six fields `second minute hour day-of-month month day-of-week`; only advertise forms supported by the final server contract. State five-field normalization explicitly if retained. Weekday-name examples are permitted only when the agreed parser accepts them.
- **Next scheduled run**, from an authoritative timezone-aware preview for the entered values. Show the selected-zone date/time with zone ID and offset; an optional “Your local time” companion is secondary. While pending, say **Calculating next run…**; failure says **Next run could not be calculated** with Retry, never a fabricated time. Label future times as scheduled due time, not guaranteed browser start time.
- **Schedule status** defaults to Paused on creation. Explain that **Resume schedule** separately approves the current saved confirmed revision and approved execution identity. Permit editing frequency/timezone while paused. Pausing must not require a valid new cron expression. If a form offers Active on creation, it must disclose this activation acknowledgment and perform paused creation followed by validated Resume; an activation failure leaves a visibly created Paused schedule with a remedy.
- A short plain-language rule: **Scheduled runs use this test's saved, confirmed steps and settings. After changing those steps or settings, prepare and confirm the test, then resume its schedule.** This is the architect's proposed explicit-resume policy, pending approval.

Save actions: **Create schedule** or **Save changes**, plus Cancel. Default creation saves a Paused schedule; **Resume schedule** is the explicit next action when eligible. Existing schedules additionally have **Pause schedule** or **Resume schedule** and a secondary **Remove schedule** action. Show progress on the specific mutation and prevent duplicate submission. Use committed server responses to refresh editor/list state; do not close the dialog before a failed save is explained. Never say creation failed or the schedule is Active when paused creation committed but Resume failed. Frequency and timezone changes recalculate the next future due time; they do not replay earlier due times.

### Pause, resume and remove

Pause is a reversible action, not a confirmation dialog. Its success notice says **Schedule paused. Runs already accepted continue.** Use the same effect statement near the pause action if an accepted run exists. Pause does not press Stop. Resume requires current readiness, permission and authoritative server validation; success shows the next scheduled due time.

Removing a schedule requires a small confirmation: **Remove schedule for “{test name}”? Future scheduled runs will stop. The test and run history will remain.** Confirm action **Remove schedule**. A successful response changes the projection to No schedule. Removing does not itself cancel previously accepted browser executions. Test deletion also disables future schedule occurrences atomically, but preserves the existing dispatch lifecycle check: queued accepted work can be refused before browser admission when its test is deleted/quarantined; admitted work continues under existing recovery/cancel. Extend `DeleteTestDialog.tsx:53` copy: **Deleting this test stops future scheduled runs. Accepted runs that have not been dispatched may be refused. Already admitted runs follow the existing stop and recovery controls. Run history remains.**

## Proposed state and trust model

Schedule intent and effective eligibility are separate. The backend should supply them independently rather than make the client reconstruct eligibility from compileStatus alone; Ready to run is already only a hint before full server readiness checks. Under the proposed explicit-resume policy, the schedule contract needs an authoritative `resume_required` flag (exact wire naming belongs to the architect). Execution-affecting edits set it; reconfirmation alone does not clear it; an authorized, readiness-validated Resume clears it. A true flag prevents dispatch even when compileStatus is READY.

| Author's schedule choice / effective eligibility | Display | Actions and next time |
|---|---|---|
| No schedule | No schedule | Create only when saved and eligible. |
| Enabled, eligible | Active | Pause, edit, remove; show next scheduled due time. |
| Disabled by author | Paused | Edit, remove; Resume only when eligible. No live next-run promise. |
| Enabled, not eligible / activation approval required | Blocked · {reason}, or Ready to resume after reconfirmation | Edit, pause, remove; explain how to recover. After readiness is restored, enable Resume explicitly. Show no executable next-run promise until resumed. |
| Disabled and not eligible | Paused, plus readiness issue | Preserve Paused as primary state; reconfirmation does not resume an author-paused schedule. |

On an unsaved editor draft, show **Save your changes before scheduling.** Provide the existing Save control/action without combining save, translation, confirmation and schedule creation into one opaque click. If saving affects execution inputs, require author preparation/review/confirmation first. Managing an existing saved schedule may still be viewed while the editor has unsaved changes, but enabling or creating must clearly operate on the current saved test; recommend disabling those mutations until the author resolves the dirty state to prevent ambiguity. Pause and removal remain available.

Execution-affecting saved edits block enabled schedules; metadata-only name/description edits do not. Blocking preserves frequency, timezone and the author's enabled/paused choice. No unattended compilation, automatic confirmation or implicit execution of an old configuration is introduced. Schedule configuration edits must not invalidate the test's executable revision.

Proposed readiness explanations reuse existing vocabulary. Apply authoring-state recovery copy only when server readiness actually fails; `compileStatus` alone cannot prove that unchanged confirmed content is unrunnable. This qualifier applies to AWAITING_CONFIRMATION and NEEDS_REVISION as well as STALE/COMPILING.

| Condition | Message and action |
|---|---|
| Server-confirmed readiness failure after execution-affecting edit | **Scheduled runs are blocked because the saved test needs to be prepared again.** Open test. STALE alone does not establish this failure. |
| COMPILING with no valid unchanged confirmed revision | **The test is being prepared. Scheduled runs cannot start yet.** Do not repeatedly submit compile. An optional compile of unchanged confirmed input does not itself block scheduling. |
| AWAITING_CONFIRMATION | **Review and confirm the saved test before scheduled runs can start.** Open review. |
| NEEDS_REVISION | **Some steps need changes before this test can run on a schedule.** Open test. |
| Runtime incompatibility | **The confirmed test no longer matches the supported runtime. Prepare and confirm it again.** Use server reason. |
| Permission revoked | **Scheduled execution is blocked because permission was withdrawn.** Explain entitlement owner without revealing secret values or hidden test details. |
| Reference unavailable | **A variable or secret needed by this test is unavailable.** Open settings or show the declared-reference remedy appropriate to the caller. |
| Deleted/quarantined | Stop future dispatch and deny enable; do not keep reporting Active or offer a recovery that bypasses quarantine. |

Re-confirmation changes what subsequent runs execute. Align with the architect's proposed policy: execution-affecting edits block future dispatch, then preparation/confirmation restores readiness but requires an explicit **Resume schedule** action to approve recurring execution of the newly confirmed content. Display **Ready to resume** after confirmation, retaining cadence/timezone. The confirmation view says **Your schedule remains stopped. Resume it when you are ready to run these confirmed steps automatically.** An author-paused schedule stays Paused. Resume schedules the next future due time; it does not replay missed occurrences. This policy still requires product acceptance before stories become Ready.

Align the timezone experience with the architect's proposed DST policy: skip a nonexistent spring-forward wall-clock time and execute once per local scheduled slot when clocks fall back. For a repeated local time, preview must identify the chosen occurrence with its UTC offset, and the helper text says **Runs once at this local time. Times skipped by daylight saving changes are skipped.** Aria verified that the existing cached Spring runtime can return both fallback offsets for the same local time, so this proposal requires explicit backend duplicate-slot suppression; the frontend must not suggest that timezone selection alone provides this policy.

## Proposed history and failure experience

Real accepted scheduled browser executions appear in the existing Runs list and details drawer with the same evidence, status and authorized deep links. Add a **Scheduled** origin label and details **Scheduled for**, **Requested**, and confirmed revision identity from server provenance. Scheduled for is the occurrence's due time; Requested remains execution acceptance time. Queue delay is not browser duration (`studioTypes.ts:491`). Manual runs carry a **Manual** origin when authoritative provenance is available; absence in legacy data must display Unknown rather than assume Manual.

Do not create fake failed browser executions for due occurrences refused before acceptance. Show the latest schedule occurrence outcome in the schedule detail area, with **View run** when it has an accepted execution ID. If it does not, show **Scheduled run skipped — {reason}** or **Scheduled run delayed — capacity unavailable**, according to the final occurrence policy. Minimum operator-visible information is the due time, outcome, reason and actual accepted run link; a dedicated occurrence table is optional if the implementation contract makes the latest occurrence sufficient for MVP.

Keep assertion failure (**Failed**) distinct from infrastructure failure (**Error**) and scheduled admission/refusal. An accepted execution may have unavailable or expired video; this does not rewrite its result. Reuse existing error narratives. For ambiguous dispatch, the explanation remains **We cannot tell whether a browser ran** and must not offer automatic retry. Aria's proposed policy keeps recurrence blocked after relevant manual or scheduled `DISPATCH_UNKNOWN`/`STALE`, even when its ledger closes. Show **Blocked · Previous run needs investigation** and retain that state until investigation and an authorized audited Resume acknowledge the uncertain execution. Resume permits only future slots; it never replays the uncertain slot. Product adoption of this policy remains D-13. Missed/skipped occurrences do not silently replay when a browser reconnects, schedule resumes, or capacity returns.

## Permissions and failure handling

Recommend schedule management follow authorized test maintenance rights; this is a proposal because current Studio Run permission and generic schedule write permission differ. The server must decide and expose capability/denial information. The UI can show a read-only schedule summary to callers permitted to read it, and **You do not have permission to change this schedule** where a visible disabled action helps them understand the limitation. Keep permission to manage, run, stop, read history and use secret references separate.

Map contract outcomes into contextual copy: invalid cron/timezone to labelled fields; readiness conflict to the blocked-test explanation; concurrent schedule mutation to **This schedule changed since you opened it. Reload to review the latest settings.** Retain edits until Reload is chosen. A duplicate schedule creation refreshes existing management instead of creating another. Network failure retains values and offers retry without optimistic success. Unknown/forbidden resource reads use a non-disclosing not-found state following `RunDetailsDrawer.tsx:185`. Do not echo raw backend/internal diagnostics or secret material.

## Accessible and responsive behavior

Use existing MUI components, theme tokens and `sx`, matching Studio rather than introducing a second visual system. Give the Dialog itself `aria-labelledby` (the generic dialog currently attaches it only to content), restore focus to the invoking editor button or row action, and keep keyboard interaction within the open dialog. Every switch, frequency option, timezone control and cron error must have a programmatic label and associated help/error text. Do not communicate Active/Paused/Blocked or failures with color alone.

Keep focus on the first invalid field after validation. Announce save/pause/resume/remove results once through an appropriate status region; asynchronous preview updates must not steal focus. Disabled actions need a visible or described reason, not hover-only explanation. Use the existing row-menu accessible-name convention (`TestRowMenu.tsx:29`). On narrow screens stack fields and retain schedule status in the Test cell, since CSI/environment/update columns are already hidden (`TestRow.tsx:57`). Absolute timezone-specific dates must be available in visible dialog content, not only tooltips.

## Mock-first frontend sequencing

1. Freeze proposed schedule and occurrence projections, cron/timezone syntax, permitted frequencies, identity/permission rules and readiness/resumption policy with the architect and product owner. Update Studio OpenAPI before frontend implementation; preserve the legacy schedule string compatibility boundary.
2. Add MSW Studio schedule state and handlers through the existing Studio mock server. Model create/update/pause/resume/remove, unique-per-test conflict, stale schedule version, timezone-aware preview, eligibility changes, authorization denial, deleted test and acceptance/skip/delay provenance. Use fixed clock fixtures around cron boundaries and DST transitions. These simulate the UI contract, not claim production dispatch exists.
3. Extract a pure scheduling form using existing platform field patterns, adding explicit timezone, correct cron help and authoritative preview. Build the Studio adapter through the centralized API client; keep Redux check refresh out of it. Avoid broad generic scheduling refactors in this MVP.
4. Integrate editor management and schedule summary; add the row-menu entry and responsive list summary. Handle dirty draft, readiness updates, paused preservation, conflict refresh and deletion effect copy.
5. Extend Runs/details with additive scheduled provenance and schedule latest-occurrence display; reuse existing evidence and terminal-error presentation.
6. Validate meaningful MSW-backed integration flows and accessibility, then run repository frontend gates. Add Playwright critical-path coverage of create → visible next due → scheduled result history and pause/resume. Production due dispatch remains a backend implementation/verification workstream.

## Proposed acceptance scenarios for stories

1. An authorized user opens a saved confirmed test, chooses a permitted preset and timezone, sees an authoritative due-time preview and creates one Paused schedule. Explicit Resume acknowledges the saved confirmed revision/approved identity and shows Active with matching summary in editor and Tests list. If Resume fails, the Paused schedule remains visible and can be managed.
2. At `12:02:10`, a five-minute aligned cron previews the next clock boundary in the selected zone, not now plus five minutes; the browser's different local zone does not change persisted schedule semantics.
3. A Daily schedule makes time and timezone explicit. DST fixture previews skip a nonexistent spring-forward local time, use only the agreed single occurrence of a repeated fallback slot, and display its zone/offset. Due dispatch agrees with that preview.
4. Named-weekday cron input either succeeds consistently in client help/server validation/preview or is rejected consistently by the agreed contract. Invalid input does not persist or fabricate next-run time.
5. A user edits a paused schedule without enabling it. Pausing with an unrelated invalid unsaved cron still succeeds using the separate pause mutation; a later save validates that new cron.
6. Saved execution-affecting edits block an active schedule and keep its cadence/timezone. Metadata edits leave it eligible. Existing manual Run behavior remains available through its own gate.
7. Server readiness, rather than compileStatus alone, controls scheduling explanations. An optional failed recompile leaves unchanged confirmed content eligible. Actual readiness failures during authoring show the appropriate recovery message; a scheduler never silently translates or confirms. Re-confirmation shows Ready to resume rather than silently restarting an affected active schedule; explicit Resume accepts the newly confirmed content and leaves previously author-paused schedules paused until the user resumes them.
8. An editor with unsaved or conflicting changes cannot ambiguously create/enable a schedule against unseen saved content. Viewing, pausing and removing an existing schedule remains understandable.
9. Pausing/removing stops future occurrences and does not itself cancel accepted executions; history remains. Deleting/quarantining the test stops future scheduling and preserves pre-send refusal of queued accepted work; admitted work follows existing recovery/cancel. The UI explains the distinct boundary.
10. A user without schedule-manage permission cannot mutate it via editor, row menu or API. Permission revocation/secret-resolution loss has clear recovery language and does not expose secrets or hidden resources.
11. Concurrent creation/edit returns a coherent existing/latest schedule conflict, retains unsaved form values and offers reload. Rapid double-click/network retry produces no duplicate schedule or occurrence.
12. An accepted scheduled run appears in Runs with due time, acceptance time, scheduled provenance and its confirmed revision. Failed, Error and evidence unavailable remain distinct. A refused/skipped due occurrence shows its reason without pretending a browser failed.
13. An ambiguous dispatch uses the existing ambiguity explanation and cannot cause an automatic replay. Under proposed D-13, relevant terminal manual or scheduled `DISPATCH_UNKNOWN`/`STALE` leaves recurrence blocked even after ledger closure. Investigation plus audited Resume explicitly acknowledges uncertainty and permits only future slots.
14. Keyboard-only users can open, edit, submit, pause, resume, remove and cancel; focus returns correctly. Screen readers receive labelled fields, associated errors and one result announcement. Small-screen users retain schedule status and access to management.

## Decisions needed before implementation-ready stories

- Individual-test-only and one-schedule-per-test MVP approval; no suite abstraction is assumed.
- Approval of current confirmed revision binding and explicit Resume after execution-affecting edits/reconfirmation; no implicit old-configuration execution.
- Schedule mutation entitlements, execution identity, creator/owner departure and revocation behavior; do not retain browser JWTs for cron.
- Allowed presets/minimum interval and overload/missed/overlap handling, given Studio's currently small worker capacity (`PRD.md:117`).
- Server preview contract, timezone default, cron syntax and approval/implementation of once-per-local-slot fallback plus skipped spring-forward gaps.
- Paused-create followed by explicit Resume/activation; truthful partial-success messaging if creation succeeds and activation fails (D-14).
- Occurrence refusal/delay/ambiguity visibility and adoption of durable ambiguity blocking with audited future-only Resume (D-13).
- Additive schedule/provenance projection with conflict/version controls; compatibility handling of the legacy nullable schedule string.
