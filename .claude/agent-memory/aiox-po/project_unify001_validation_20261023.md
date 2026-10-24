---
name: unify001-validation-20261023
description: STUDIO-UNIFY-001 (UI tests as checks) 4-story validation 2026-10-23 — all GO/Ready (9,9,9,8); C-1 plan-approval condition; flag rulings on out-of-§14 AC placements, AC-28 review, CRIT-27
metadata:
  type: project
---

On 2026-10-23, @po validated STUDIO-UNIFY-001.1–.4 (`docs/stories/STUDIO-UNIFY-001-ui-tests-as-checks/`), one story per plan phase. All four got GO and moved to Ready, scoring .1 9, .2 9, .3 9 and .4 8. The single record covering all four is `spec/story-validation.json`, and each story got a `## PO Validation (2026-10-23)` section before its Dev Agent Record.

**Why:** the plan is still `status: pending`, `executionAuthorized: false`. Ready was granted with condition C-1: no code starts until the user approves plan revision 4 (sha256 f2c9b274…). If approval changes the plan, @sm re-syncs the affected tasks and @po re-validates.

**How to apply:**
- Rulings: these out-of-§14 placements are correct, traced through FR text, the §19 table and plan subtask `coverage`, not the §14 AC column:
  - AC-23 detail routes in .2;
  - AC-14 All Checks half in .3;
  - AC-26 leftovers in .4;
  - AC-08 leave guard and AC-23 editor gate in .1.
- The §14/§19 omissions are @pm housekeeping. CRIT-27 is spec-side only, because the plan pins matched the current hashes, so it does not block.
- AC-28 is verified by a line-by-line @qa read. The greps are necessary but not sufficient. SF-1: record the per-line result.
- Story .4 tasks 4.1, 4.3 and 4.4 are grep-only and 4.5 is manual, by plan design. Not a blocker.
- Method that worked: a js-yaml script compares story tasks with plan subtasks field by field. Run the plan's route-scan dry runs (S1 25, S2 24, S3 50+21, S4 40 files) to confirm the counts.
- See also [[studio-observed-wave-po-conventions]].
