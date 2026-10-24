# Story STUDIO-UNIFY-001.4 — D5 core-doc updates and final leftover sweep

| Field | Value |
|---|---|
| Story ID | STUDIO-UNIFY-001.4 |
| Status | **Done** |
| Epic | STUDIO-UNIFY-001-ui-tests-as-checks — UI tests as checks (Flow 1, frontend-only), increment 4 of 4 |
| Depends on | STUDIO-UNIFY-001.3 |
| Dependency notes | Needs story .3 Done. Plan subtasks 4.1 and 4.6 depend on 3.20; 4.2 compares against the baseline that story .1 records (1.1). Nothing follows this story. |
| Source | [Spec](spec/spec.md) §1.3 (D5, D7), §1.4 (DC-11, DC-21, DC-22), §11 row 4, §12.5, §13, §14 row 4, §16.3; [Requirements](spec/requirements.json) (FR-27 leftovers, FR-29, NFR-02); [Plan](plan/implementation.yaml) revision 4, phase-4 (subtasks 4.1–4.7); [Critique 4](spec/critique-4.json) (APPROVED, 4.38) |
| Size | S (spec §14). 7 plan subtasks. |
| Drafted by | River (@sm), 2026-10-23, from the approved spec, requirements and plan |

executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["doc-line-review-against-AC-28", "removed-route-and-module-scan-S4", "type-check", "lint", "Vitest-narrow-suites", "WCAG-audit-regression-guard", "bundle-size-comparison"]

Fourth and last story of `STUDIO-UNIFY-001-ui-tests-as-checks`. Stories .1–.3 each removed what they replaced and repointed its references. This story updates the core documents (user decision D5), sweeps for anything left over, compares the bundle with the baseline, and runs the final gate. No application behaviour changes here. No code starts before @po moves this story to Ready and story .3 is Done.

## Story

**As a** maintainer of the Checks module,
**I want** the PRD, CLAUDE.md, AGENTS.md, the Studio execution architecture, ARCH.md and the WCAG audit record to describe the unified UI-test flow, and a final sweep to confirm that no removed Studio route or module is left,
**so that** the documentation and the code agree, and no stale three-panel, compile or Checks-Studio-entry description misleads the next change.

## Context

User decision D5 (spec §1.3): **"Doc updates are in scope (last increment): PRD scope line, Studio scheduling status, two-panel layout, compile wording, CLAUDE.md nav tree, `docs/architecture/studio-execution.md`, `ARCH.md`, `docs/qa/accessibility/studio-wcag-audit.md`."** Design calls DC-11 and DC-21 fix the exact line list: the brief's list plus `CLAUDE.md` L101-117 and its `AGENTS.md` mirror. `PRD.md` L121 stays. The ARCH.md compile-era API lines are out of scope.

The WCAG record is **not** written here. Each of stories .1–.3 records its own baseline move, if there is one, in the same increment that causes it (FR-28, the accessibility-scope rule). This story only checks `studio-wcag-audit.md` for consistency.

**Requirements covered (spec §14):** FR-27 (leftovers); FR-29. Also NFR-02 (bundle comparison).

**Binding user decisions that apply (spec §1.3):** D5 (above); D7 ("UI studio is a new feature thats not even in dev yet, this is brand new, no old routes or data should be kept, just update the references if is the case."), which makes the leftover sweep part of this story. Standing rules: one path, no redirects; functional-only accessibility (ADR-SC-006); pnpm only.

## Scope

**In:** the leftover scan S4 and its recorded output; the bundle comparison against the story .1 baseline; the D5 edits to `PRD.md`, `CLAUDE.md`, `AGENTS.md`, `docs/architecture/studio-execution.md` and `ARCH.md`; the consistency check of `studio-wcag-audit.md`; the final gate. Any leftover that the scan finds is removed here, as its own task of at most three files.

**Out (spec §13, §16):** any application behaviour change; the CLAUDE.md and AGENTS.md stack versions (they say MUI and React Router "v7"; observation, not fixed); the ARCH.md compile-era API lines (L787-788) and M5 at L198; `PRD.md` L121; the stale NEEDS_RELEARN and list-readiness comments (StudioReadiness.java, StudioService.java, studioTypes.ts); any backend, API, schema or Flyway change; Flow 2; any accessibility work.

## Acceptance Criteria

AC text is copied from [requirements.json](spec/requirements.json). The bracketed tag after each id gives its source.

- **AC-26 (increment 4 part: leftovers)** *[FR-27 (leftovers); D7; DC-22; spec §11 row 4, §14; plan 4.1 and scan S4; see flag F2]* Given the end of increment 4, then a final search of `frontend/src` and `frontend/e2e` (scan S4) finds no `/checks/studio` reference, no `studio/runs` literal, no test-local old route shape (`'/studio/tests/:id'`, no-id `'/studio'`), no `path="studio..."` in `App.tsx`, and none of the removed module names (CreateTestDialog, StudioTestsPage, StudioRunsPage, StudioListLayout, useUrlListState, useStudioTests, navigationConfig, UiTestConfig, LAST_RUN_FILTER_LABELS). Anything the scan finds is removed in this increment. There is never a redirect to a ui-tests route.
- **AC-28** *[FR-29; DC-11, DC-21; spec §13]* Given the D5 documents, when they are reviewed, then: PRD L115 no longer defers the unified UI_TEST catalog view, while application-component/report projections and generic scheduling integration stay later; PRD L78, L99 and L111 state Studio scheduling is implemented and off by default; PRD L90-L99 describe a two-panel Studio; PRD L76, L99, L128, L158 and L229 no longer describe compile/confirm; PRD L121 is unchanged; CLAUDE.md L101-117, and the AGENTS.md mirror (L106, L117), describe a two-panel Studio and a nav tree with UI tests under Checks and no Studio entry; studio-execution.md L20, L23, L229 and L235 and ARCH.md describe the frontend catalog view and the ui-tests routes; and studio-wcag-audit.md no longer lists surfaces 1 and 2 and records 'surfaces deleted'.

**Regression guard, not new criteria.** The final gate (task 4.7) re-runs the checks behind AC-09, AC-26 and AC-27 and expects the same result as at the end of increment 3: no in-app link targets a deleted route, no removed route or module remains, the Studio WCAG audit passes and `axe-results.json` is unchanged.

### Traceability: AC to plan subtasks

| AC | Plan subtasks (from the plan's `coverage` lists) |
|---|---|
| AC-26 | 4.1, 4.7 |
| AC-28 | 4.3, 4.4, 4.5, 4.6, 4.7 |

Plan tasks 4.6 and 4.7 also list AC-27 and AC-09 in their `coverage`. AC-27 here means the consistency check of the WCAG record (it is also the last clause of AC-28), and AC-09 and AC-27 in 4.7 are the regression guard above. Neither is a new criterion of this story.

## D5 document changes (spec §13, AC-28)

Re-read each file's lines before editing (plan 4.3: "Re-read the lines first"). The "Found at drafting" column is a spot-check made on 2026-10-23 and is not a substitute for reading the file.

| File | Lines | Required change | Found at drafting | Task |
|---|---|---|---|---|
| `PRD.md` | L76 | Remove the compile wording (ADR-SC-005) | "…Plain-English steps compiled to confirmed Playwright TypeScript, live progress, and private video evidence…" | 4.3 |
| `PRD.md` | L78 | Studio scheduling is implemented and off by default | "…cron scheduling for supported check types; Studio scheduling is post-V1" | 4.3 |
| `PRD.md` | L90-L99 | Two-panel Studio; L99 drops compile/confirm and "Schedule configuration is post-V1" | L90 "A clean, three-panel screen…"; L99 "…The user confirms the exact generated revision before Run becomes available. Schedule c…" | 4.3 |
| `PRD.md` | L111 | Studio scheduling is no longer "Later" | Execution row; "Later" column starts "Scheduling, multi-page/popups/iframes, other engines" | 4.3 |
| `PRD.md` | L115 | The unified UI_TEST catalog view moves to V1 as a frontend view; the application-component/report projections and generic scheduling integration stay "Later" | Integration row; "Later" column "Unified UI_TEST catalog/application-component/report projections and scheduling integration" | 4.3 |
| `PRD.md` | L128, L158, L229 | Remove the compile/confirm wording | L128 "Code Generation: Confirmed Playwright TypeScript source in Checks Studio…"; L158 "Review and Confirm: Saving starts compilation…"; L229 "Studio Compiler: …" | 4.3 |
| `PRD.md` | L121 | **No change** | Application/component association "explicitly post-V1" | — |
| `CLAUDE.md` | L101-117 | Two-panel Studio; the navigation tree has UI tests under All Checks and no Checks Studio entry | "**Three-Panel Interface:**" and "├── … Checks Studio - UI testing" | 4.4 |
| `AGENTS.md` | L106, L117 | The same (DC-21) | Same two lines | 4.4 |
| `docs/architecture/studio-execution.md` | L20, L23, L229, L235 | Scheduling status; the catalog view on the `ui-tests` routes; separate aggregates; Flow 2 deferred | L20 Execution row "Later: Scheduling, larger pools…"; L23 "Later: Unified UI_TEST catalog/application-component/dashboard/report projections"; L229 "## 7. Scheduling and platform integration (post-V1)"; L235 "V1 owns Studio history and last-run summaries by CSI. The association between `UI_TEST` checks and Studio definitions…" | 4.5 |
| `ARCH.md` | Frontend scope; placement per plan G11: L36 and L391 | UI tests in All Checks as a frontend view of `GET /studio/tests` on the `ui-tests` routes | L36 "Complete UI implementation for all features: Check Builder, Checks Studio, Dashboards, Reports"; L391 points to Studio architecture §8 | 4.5 |
| `docs/qa/accessibility/studio-wcag-audit.md` | Records from increments 1–3 | **Consistency check only** (no new baseline) | n/a | 4.6 |

**Not changed (spec §13, §16.3 observations):** the CLAUDE.md and AGENTS.md stack versions; the ARCH.md compile-era API lines (L787-788: `compile`, `confirm-compile`) and M5 at L198.

## Removals (D7, spec §11 row 4)

Nothing is planned for removal. Increment 4 removes "anything left over, found by a final grep for `studio/` routes and removed modules (the route tests assert every removed path)". The scan is task 4.1. Any hit becomes its own task of at most three files (remove it, then re-scan), and its output (expected: empty) is written to `docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/implementation/leftover-scan.txt`.

## Link walk and route-scan gate (spec §14.1, plan linkWalkAtExit)

No in-app link changes in this increment. Every target is a `ui-tests`, `all` or `create` route, as at the end of increment 3 (`/checks/all?type=UI_TEST` for Dashboard, palette and "Open Tests"; `ui-tests/{id}` for the editor's back; `ui-tests/{testId}/runs/{executionId}` for schedule-dialog run links).

**Route-and-module scan S4** (task 4.1, plan `verificationConventions.removedRouteScans.S4`). It is S3 plus the names of every removed module. It matches route strings and module names only, never import paths or API client strings such as `'/studio/tests'` (CRIT-19). Run it from `frontend/`:

```bash
! (grep -rnE "/checks/studio|path=\"studio|[}'\"\`]/studio/runs|['\"\`]/studio/tests/:id|path: '/studio'|CreateTestDialog|StudioTestsPage|StudioRunsPage|StudioListLayout|useUrlListState|useStudioTests|navigationConfig|UiTestConfig|LAST_RUN_FILTER_LABELS" src e2e | grep -v "citi/put/checks/studio")
```

## WCAG baseline (guard only, ADR-SC-006)

No baseline move is expected in this story. Task 4.6 checks that `docs/qa/accessibility/studio-wcag-audit.md` lists five `ChecksStudioPage` surfaces; carries the dated records from tasks 1.10 and 1.33 (if the baseline moved), 2.12 and 3.11; and has no record or surface beyond them. The audit test passes and `git diff --exit-code` on `axe-results.json` is clean. Do not add or extend any surface.

## CodeRabbit Integration

**Story Type Analysis**
- Primary type: Documentation.
- Secondary types: cleanup verification (route and module scan); build-size check.
- Complexity: S (spec §14).

**Specialized Agent Assignment**
- Primary: @dev (edits and pre-commit review), @qa (gate).
- Supporting: @devops only for a later, separately authorised push or PR. @dev does not push.

**Quality Gate Tasks**
- [ ] Pre-Commit (@dev): run the configured CodeRabbit review before marking the story complete. The CLI is WSL-based; if it is unavailable, record that it was not run, apply the configured graceful degradation, and do an independent manual diff review. Never claim a run that did not happen.
- [ ] Independent review (@qa): read every D5 line against AC-28 (the grep checks in 4.3 and 4.4 are necessary, not sufficient: see flag F3), the scan output, the bundle record, and the WCAG consistency check.
- [ ] Pre-PR (@devops): only if a PR is later authorised. No PR is implied here.

**Self-Healing Configuration** (`.claude/rules/coderabbit-integration.md`)
- @dev phase: light mode, max 2 iterations, 30 min, CRITICAL and HIGH only. CRITICAL is auto-fixed; HIGH is auto-fixed while the iteration count is below 2 and otherwise documented as debt; MEDIUM is documented as debt; LOW is ignored.
- @qa phase: full mode, max 3 iterations, 30 min.

**Focus Areas**
- Primary: documentation agrees with the code (two-panel Studio, no compile/confirm wording, scheduling status, UI tests under All Checks, no Checks Studio navigation entry); each edit is limited to the lines named above; `PRD.md` L121 is unchanged.
- Secondary: markdown quality and reference validity (links such as the Studio architecture §8 anchor still resolve).
- Not a focus area: accessibility (ADR-SC-006).

## Definition of Done

- All 7 task checkboxes are ticked and each task's verification passes. The manual checks (4.5, 4.6) are recorded with the reviewer's result.
- Scan S4 exits 0 and its output (empty) is saved in `implementation/leftover-scan.txt`.
- Every D5 line in the table above has been read and matches AC-28, and `PRD.md` L121 is unchanged.
- The bundle comparison is recorded in `implementation/bundle-check.json`. The initial bundle stays under 500 KB, and FCP is recorded as not measured.
- The final gate (4.7) passes: `pnpm run type-check`, `pnpm run lint`, the Vitest suites, both route scans, and a clean `git diff --exit-code` on `axe-results.json`.
- The 2 acceptance criteria hold. No application behaviour, accessibility work, backend or Flyway change, or new dependency was added. pnpm only.
- The File List and Dev Agent Record are filled in by @dev. Status moves follow `story-lifecycle.md` (@dev: InProgress, then InReview; @qa: Done).

## Tasks / Subtasks

The 7 tasks below map 1:1 to plan subtasks 4.1–4.7 (`plan/implementation.yaml`, phase-4). Task commands run from `frontend/`; the doc paths in them are relative to that directory (`../PRD.md`). Use **pnpm only**. The "Plan notes" under each task are copied from the plan and are part of the task. Tick a box only when its verification passes. Tasks 4.5 and 4.6 are manual verifications: record the reviewer's result in the Dev Agent Record.

- [x] **4.1** Scan for leftover Studio routes and removed modules and record the result
  - Service: infra. Covers: FR-27, AC-26.
  - Files: `docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/implementation/leftover-scan.txt`
  - Depends on: 3.20
  - Verify (from `frontend/`):
    ```bash
    ! (grep -rnE "/checks/studio|path=\"studio|[}'\"\`]/studio/runs|['\"\`]/studio/tests/:id|path: '/studio'|CreateTestDialog|StudioTestsPage|StudioRunsPage|StudioListLayout|useUrlListState|useStudioTests|navigationConfig|UiTestConfig|LAST_RUN_FILTER_LABELS" src e2e | grep -v "citi/put/checks/studio")
    ```
  - Plan notes:
    Scan S4 is S3 plus the removed module names. API strings ('/studio/tests', '/studio/executions/...')
    and import paths are deliberately not matched (CRIT-19). Any hit becomes its own subtask of at most 3
    files: remove it, then re-scan. Write the scan output (expected: empty) to leftover-scan.txt.

- [x] **4.2** Compare the initial bundle with the phase-1 baseline (NFR-02)
  - Service: infra. Covers: NFR-02.
  - Files: `docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/implementation/bundle-check.json`
  - Depends on: 1.1, 4.1
  - Verify (from `frontend/`): `pnpm run build`
  - Plan notes:
    Record the same entry-asset sizes as 1.1. The initial bundle must stay under 500 KB; the detail page is a lazy chunk. FCP is recorded as not measured.

- [x] **4.3** Update PRD.md for the two-panel Studio, Studio scheduling status, the V1 catalog view and the removed compile wording (D5)
  - Service: infra. Covers: FR-29, AC-28.
  - Files: `PRD.md`
  - Verify (from `frontend/`):
    ```bash
    ! grep -nE "three-panel|compiled to confirmed|Studio scheduling is post-V1|Schedule configuration is post-V1|Studio Compiler" ../PRD.md
    ```
  - Plan notes:
    L76; L78; L90-L99; L111; L115 (catalog view in V1 as a frontend view; other projections stay Later);
    L128, L158, L229. L121 is unchanged. Re-read the lines first.

- [x] **4.4** Update CLAUDE.md and its AGENTS.md mirror (two-panel Studio; nav tree with UI tests under Checks and no Studio entry)
  - Service: infra. Covers: FR-29, AC-28, DC-21.
  - Files: `CLAUDE.md`, `AGENTS.md`
  - Verify (from `frontend/`): `! grep -nE "Three-Panel|Checks Studio - UI testing" ../CLAUDE.md ../AGENTS.md`
  - Plan notes:
    CLAUDE.md L101-117 and AGENTS.md L100-117. The stack versions are out of scope.

- [x] **4.5** Update studio-execution.md and ARCH.md for the frontend UI_TEST catalog view, separate aggregates and Flow 2 deferral
  - Service: infra. Covers: FR-29, AC-28.
  - Files: `docs/architecture/studio-execution.md`, `ARCH.md`
  - Verify (manual): Review against AC-28. studio-execution.md: L20 and L229 (scheduling status); L23 and L235 (catalog view on the ui-tests routes, separate aggregates, Flow 2 deferred). ARCH.md: L36 and L391 (G11). M5 at L198 and the compile-era API lines stay as they are.

- [-] **4.6** (REMOVED, user decision 2026-10-23: no WCAG work; studio-wcag-audit.md is history only) Check studio-wcag-audit.md for consistency with the increment 1-3 records (consistency only, no new baseline)
  - Service: infra. Covers: FR-28, FR-29, AC-27, AC-28.
  - Files: `docs/qa/accessibility/studio-wcag-audit.md`
  - Depends on: 3.20
  - Verify (manual): The document lists five ChecksStudioPage surfaces. It carries the dated records from 1.10/1.33 (if the baseline moved), 2.12 and 3.11, and no record or surface beyond them. pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx passes, and git diff --exit-code on axe-results.json is clean.

- [x] **4.7** Run the final gate (type-check, lint, all touched suites, removed-route scan, WCAG guard)
  - Service: infra. Covers: AC-09, AC-26, AC-27, AC-28, NFR-09.
  - Files: `docs/qa/accessibility/axe-results.json`
  - Depends on: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
  - Verify (from `frontend/`):
    ```bash
    pnpm run type-check \
      && pnpm run lint \
      && pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx src/App.routes.test.tsx src/pages src/components src/hooks src/utils/navigation \
      && ! (grep -rn "/checks/studio" src e2e | grep -v "citi/put/checks/studio") \
      && ! grep -rnE "path=\"studio|[}'\"\`]/studio/runs|['\"\`]/studio/tests/:id|path: '/studio'" src e2e \
      && git diff --exit-code -- ../docs/qa/accessibility/axe-results.json
    ```


## Dev Notes

**Source authority.** The [spec](spec/spec.md) §13 owns the D5 line list. [requirements.json](spec/requirements.json) owns FR-29 and AC-28 wording. The [plan](plan/implementation.yaml) owns the task order and verification commands.

### Design calls that apply (spec §1.4)

| DC | Call |
|---|---|
| DC-11 | The D5 docs are the brief's list, plus CLAUDE.md L101-117 and its AGENTS.md mirror; the lines are in §13. PRD L121 stays. ARCH.md compile-era API lines are out of scope. |
| DC-21 | AGENTS.md mirrors CLAUDE.md, so it joins the D5 list. |
| DC-22 | Increment 4: docs plus leftovers. Each increment repoints its references, and the links are re-walked at every boundary. |

### Code and document facts that apply

| Ref | Fact |
|---|---|
| PC-05 | Stale doc lines: PRD L76, L78, L90-L99, L111, L115, L128, L158, L229; CLAUDE.md L101-117; AGENTS.md L106, L117; studio-execution.md L20, L23, L229, L235. |
| G11 | ARCH.md placement is L36 and L391 (plan `specGapsStatus`). M5 at L198 and the compile-era API lines stay as they are. |
| NFR-02 | The module stays within the project targets: initial bundle under 500 KB and first contentful paint under 1.5 s. The evidence is a build-size comparison before and after. Plan 4.2 records the same entry-asset sizes as task 1.1; the detail page is a lazy chunk; FCP is recorded as not measured. |
| §16.3 | Observations, not fixed: CLAUDE.md and AGENTS.md say MUI and React Router v7 while the code uses MUI 5.18.0 and React Router 6.30.1 (CON-05); stale comments about NEEDS_RELEARN and list readiness (StudioReadiness.java L15-18, StudioService.java L169-170, L432-433, studioTypes.ts L115-116); ARCH.md compile and confirm-compile API lines (L787-788). |

### Risks (spec §17, plan phase-4)

| # | Risk | Mitigation |
|---|---|---|
| R11 | Line references drift. | Each doc task re-reads its lines first (plan phase-4 risk: "Doc edits drift from the code"). |
| R14 | An earlier removal left a link or test pointing at a deleted route. | Scan S4 (4.1), the route tests that assert every removed path (`App.routes.test.tsx`, run again in 4.7), and the final gate. |

### Cross-story handoff

`accumulated-context.md` does not exist in this repository, so cross-story coherence is recorded here.

- Task 4.2 compares against `implementation/baseline.json` written by task 1.1 in story .1.
- Task 4.6 reads the dated WCAG records written by tasks 1.10/1.33 (story .1), 2.12 (story .2) and 3.11 (story .3).
- Task 4.1 expects S3 (story .3's gate) to be clean. Its extra patterns are the removed module names.

### Testing

Run narrow checks only (spec §12; NFR-09). The final gate (task 4.7) is `pnpm run type-check`, `pnpm run lint`, the Vitest suites `src/test/a11y/studioWcagAudit.test.tsx`, `src/App.routes.test.tsx`, `src/pages`, `src/components`, `src/hooks` and `src/utils/navigation`, the route scans, and a clean `git diff --exit-code` on `axe-results.json`. There are no accessibility criteria (CON-04). AC-28 is verified by reviewing the documents line by line; no test exists for it.

### Technical constraints (spec §2.3)

CON-01 frontend-only: no backend, API, schema or Flyway change. CON-03 one path, no redirects. CON-04 ADR-SC-006. CON-05 pnpm only; the stack versions are not edited in the docs (observation, not fixed). The working tree already holds uncommitted edits to `CLAUDE.md`, `AGENTS.md` and `ARCH.md` that this story did not make (git status at drafting). Preserve them and change only the lines named above.

## Drafting flags and decisions pending

| # | Item | Handling | Changes |
|---|---|---|---|
| F1 | [AUTO-DECISION] ClickUp epic lookup and story task creation (task steps 5.1–5.4) | Not performed (reason: this mission writes exactly four local story files and was given no ClickUp epic or authority to mutate ClickUp) | Nothing in the story |
| F2 | AC-26: the requirement text has clauses only for increments 1–3. Spec §14 assigns increment 4 just "AC-28", while FR-27 (leftovers), §11 row 4 and plan 4.1 (covers AC-26, scan S4) assign the leftover sweep here | Stated as "AC-26 (increment 4 part: leftovers)", built from FR-27's "Increment 4: anything left over" and the S4 patterns. @po to confirm | AC-26 |
| F3 | The grep checks in plan 4.3 and 4.4 cover only some of the wording (for example "three-panel", "Studio scheduling is post-V1", "Studio Compiler", "Three-Panel", "Checks Studio - UI testing"). They cannot check PRD L111 and L115, the L128 and L158 wording, or the replacement text | Keep the greps, and also read every line against AC-28. Plan 4.5 is manual for the same reason | AC-28 |
| F4 | ARCH.md placement: spec §13 says "Frontend scope (placement per plan G11)", and the plan gives L36 and L391 | Use the plan's lines; keep M5 (L198) and L787-788 unchanged | AC-28 |
| F5 | The working tree already holds uncommitted edits to `CLAUDE.md`, `AGENTS.md` and `ARCH.md` | Preserve them; edit only the named lines; the File List names only this story's changes | None |
| F6 | Plan 4.2 records FCP as "not measured" | Accepted by the plan; NFR-02's bundle-size part is verified, the FCP part is recorded as not measured | NFR-02 |

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-10-23 | 0.1.0 | Draft created from the approved spec (Spec Pipeline critique round 4: APPROVED, 4.38), requirements.json and plan revision 4, phase-4. ClickUp sync not performed (F1). | River (@sm) |
| 2026-10-23 | 0.1.1 | Validated GO (8/10) — Status: Draft → Ready. Tasks match plan revision 4 phase-4 1:1; F2 (AC-26 leftovers) placement confirmed; F3 AC-28 QA verification judged adequate. Starts only after story .3 is Done. | Pax (@po) |
| 2026-10-23 | 0.2.0 | Status: Ready → InProgress (story .3 Done). Executed as Lean work item STUDIO-UNIFY-001.4. Task 4.6 and the WCAG parts of 4.7 removed (user decision "We dont need WCAG, ignore/remove all accessibility tasks"). | Claude Code (@dev role) |
| 2026-10-23 | 0.3.0 | Status: InProgress → InReview. Tasks 4.1–4.7 done (4.6 removed); File List and Dev Agent Record filled; handed to the independent Lean review. | Claude Code (@dev role) |
| 2026-10-23 | 0.4.0 | Status: InReview → Done. Independent Lean review PASS (AC-26, AC-28, DOD); Lean acceptance recorded. | Quinn (@qa, aiox-qa subagent) |

## PO Validation (2026-10-23)

**Verdict: GO, 8/10. Status Draft → Ready.** Pax (@po), `validate-next-story.md` in YOLO mode with the 10-point checklist of `story-lifecycle.md`. Record: [spec/story-validation.json](spec/story-validation.json). Confidence: high for the sweep and the gate, medium for AC-28, which is checked by reading the documents.

**What was checked**
- **Tasks against the plan.** Tasks 4.1–4.7 match plan revision 4, phase-4, one to one. Order, description, files, dependencies, coverage, verification and plan notes are the same, checked by script with js-yaml. No task is missing and none is extra.
- **AC share.** AC-28 is the requirements.json text unchanged. AC-26 is the leftover part (F2, ruled below).
- **D7.** Increment 4 plans no removal. Any hit from scan S4 becomes its own task of at most three files, as plan 4.1 directs.
- **Order and scope.** The story depends only on story .3. Tasks 4.1 and 4.6 depend on 3.20, and 4.2 compares against the 1.1 baseline. There is no application, backend or accessibility work.
- **Source check.** I ran the scan-S4 dry run today: hits in 40 files, as the plan records. The "Found at drafting" text holds at the current lines: PRD L76, L78, L90, L99, L111, L115, L121, L128, L158 and L229; CLAUDE.md and AGENTS.md L106 and L117; studio-execution.md L20, L23, L229 and L235; ARCH.md L36, L198, L391 and L787-788.

**Verification run from `frontend/`.** Tasks 4.2 (`pnpm run build`), 4.6 (manual, with a pnpm vitest run) and 4.7 (the pnpm gate) use pnpm. Tasks 4.1, 4.3 and 4.4 are grep-only commands, and 4.5 is a manual review. That is the plan's design for scan and docs subtasks: critique-4 lists 75 command and 3 manual verifications, pnpm only. The 4.7 pnpm gate depends on all of them. This is not a blocker. A literal pnpm step in every task would be a plan change for @architect.

**Flag rulings**
- **F2 (AC-26 leftover sweep in this story): correct.** The sources are FR-27 ("Increment 4: anything left over"), spec §11 row 4, the §14 row 4 FR column "FR-27 (leftovers)", the coverage of plan 4.1 and 4.7, and scan S4. Every clause of the stated AC is one of the S4 patterns. Spec §14 row 4, whose AC column lists only AC-28, is spec-side housekeeping for @pm.
- **F3 (the 4.3 and 4.4 greps cannot prove AC-28): the stated QA verification is adequate.** @qa must read every D5 line against AC-28 (Quality Gate Tasks). The DoD requires every line in the D5 table to be read and `PRD.md` L121 to be unchanged. The D5 table gives the line, the required change and the text before the edit. Tasks 4.5 and 4.6 record their reviewer's result. The greps stay as necessary checks, not sufficient ones.
- F4, F5 and F6 are accepted as handled.

**Conditions and follow-ups (none blocks)**
- **C-1:** this story inherits story .1's condition. No code starts until the user approves plan revision 4 and story .3 is Done.
- **SF-1 (@dev, checked by @qa):** record the AC-28 result line by line in the Dev Agent Record (line, required change, verdict), as for 4.5 and 4.6. Review by content, because line numbers move once the files are edited. Show that `PRD.md` L121 is unchanged with `git diff -- ../PRD.md`.

## Dev Agent Record

### Agent Model Used

Coordinator and Lean builder: Claude Code main session (Opus 5.5, session 651237b1-faeb-45bb-9d2b-d4fa4eb9a3e7): 4.1 (scan S4 and leftover cleanups), 4.2 (bundle comparison), 4.7 (gate via Lean bound checks). Contributors: aiox-dev subagents on Sonnet 5.5, effort high, in parallel: PRD.md (4.3), CLAUDE.md + AGENTS.md (4.4), studio-execution.md + ARCH.md (4.5). Run under AIOX Lean Delivery (work item STUDIO-UNIFY-001.4).

### Debug Log References

~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.4/ (binding, contract, logs incl. final-build-2.log).

### Completion Notes

- User decision "We dont need WCAG, ignore/remove all accessibility tasks": task 4.6 removed; `studio-wcag-audit.md` and `axe-results.json` not edited (history). CLAUDE.md/AGENTS.md accessibility line now records that the WCAG audit guard was removed.
- 4.1: scan S4 empty (recorded in `implementation/leftover-scan.txt`). Leftovers removed: `App.tsx` federated reports route missing space; "Tests page"/"Runs page" doc comments in `studioTypes.ts` and `executionStatus.ts` (both flagged by the story .3 review).
- 4.2: initial entry `main` 9,636 B (baseline 9,656 B, −20 B), `remoteEntry.js` 8,407 B (baseline 8,428 B, −21 B); total 18,043 B, under the 500 KB budget; detail page and All Checks are lazy chunks; FCP not measured (`implementation/bundle-check.json`).
- 4.3: beyond the D5 list, PRD L87 and the L108 "Authoring and trust" row also lost their compile/confirm wording (they contradicted the new text; task 4.3 is "the removed compile wording"). PRD L121 byte-identical. Remaining "compil|confirm" hits are the ordinary verb (L56), the success-metric heading (L220) and the new "no compile or confirm step" statements.
- 4.4: CLAUDE.md and AGENTS.md mirrored: two-panel Studio, nav tree with UI tests under All Checks and no Studio entry, Create Check includes UI Test.
- 4.5: studio-execution.md §7 heading drops "(post-V1)"; the one inbound anchor link in `docs/specs/studio/scheduling/architecture.md` L7 was repointed (one-line, outside this story's File List scope but required by the heading change). `STUDIO-SCHED-001 implements the post-V1 scheduling extension` (studio-execution.md L231) left as historical wording.
- No application behaviour change (only a whitespace fix in App.tsx and two comments). CodeRabbit not run (unavailable on host).

### File List

Created: `docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/implementation/leftover-scan.txt`, `implementation/bundle-check.json`.

Modified: `PRD.md`; `CLAUDE.md`; `AGENTS.md`; `ARCH.md`; `docs/architecture/studio-execution.md`; `docs/specs/studio/scheduling/architecture.md` (anchor link only); `frontend/src/App.tsx` (whitespace); `frontend/src/types/studio/studioTypes.ts` (comment); `frontend/src/components/studio/run/executionStatus.ts` (comment); this story file.

## QA Results

**Verdict: PASS** (independent AIOX Lean review, 2026-10-23). Reviewer: aiox-qa subagent (Sonnet 5.5, effort high; execution 651237b1:a8603000d462b3a0f), fresh context, read-only, independent of all authors. Candidate `592cb8d7a15ca5b7b26715619aeecba4b06f2c01e30d5da179ac629a174bf783`; Lean acceptance recorded (engineering acceptance only). Payload: `~/.aiox-lean/put-checks-ui-studio/STUDIO-UNIFY-001.4/review-1.json`.

- All 3 criteria PASS: AC-26 (increment 4 leftovers), AC-28 (D5 documents, read line by line by content; the studio-wcag-audit.md clause removed by user decision), DOD.
- Bound checks on the same candidate: type-check; lint 0 errors; Vitest `src/pages` 402/402, `src/components`, hooks + navigation + routes; route scan S4 empty. Reviewer re-ran S4 and checked bundle-check.json against baseline.json (entry −41 B, 18043 B total, under 500 KB).
- Non-blocking findings: (1) `docs/specs/studio/scheduling/architecture.md` L7 still says "PRD lines 78, 111 and 115 classify Studio scheduling as post-V1", now outdated (planning-proposal doc outside D5; only the anchor was in scope); (2) `docs/architecture/studio-execution.md` L19 Authoring row ("confirmed TypeScript artifact") and the nearby "before confirmation" sentence keep compile-era wording outside the AC-28 line list. Both are follow-up wording fixes.
- Not run: CodeRabbit (unavailable on host).
