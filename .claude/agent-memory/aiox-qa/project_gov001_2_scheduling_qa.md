---
name: gov001_2_scheduling_qa
description: STUDIO-GOV-001.2 (UI test scheduling on shared flow) review+fix 2026-10-24; V24 trips GuidedRuntimeRolePrivilegeIT; worktree harness recipes
metadata:
  type: project
---

Review+fix of GOV-001.2 in an isolated worktree (2026-10-24), no gate files by user choice.

Findings that matter for future migration work:
- Any migration adding a column to a pre-V19 table must also update `GuidedRuntimeRolePrivilegeIT` (ADDED_COLUMNS + PREPARED_COLUMN_GRANT). V24 added `schedules.ui_test_id` and the dev never ran that IT, so it failed. Run it with every V2x migration.
- V24 drops and re-adds `ui_test_executions.schedule_id`; the IT cannot see that, but a column-by-column runtime-role baseline loses its ACL. Low risk (runtime user owns Studio objects today); mentioned, not changed.
- Home upcoming (`DashboardService.getUpcomingItems`) inner-joined `checks`; fixed with UNION ALL over ui_tests (+ csi_systems for the name). `/checks/upcoming` (CheckRepository) not changed: its only consumer, DashboardPage, is not routed.
- Studio test fixtures: `guidedIncrementalTest` lane runs the incremental variants; `--tests` cannot pick one parameterized variant by display name (command-line patterns AND with the task's filter).

Worktree harness (cheap, no repo files touched): frontend `node_modules/.bin` copied from main tree + symlink `node_modules/@put/core-components`; studio-runner `node_modules` symlinked to main tree, `npx --no-install tsc -p tsconfig.build.json && node scripts/write-runtime-versions.mjs` builds `dist` for `verifyRunnerDist`. Log paths: `../x.log` from `backend/` lands inside the worktree root (untracked noise) - use the absolute scratchpad path.

Frontend full vitest takes ~10 min here; under load 4 files time out (AllChecksPage, pageAuthoringUx, pageReplayAndReferences, SplunkPrototypePage) and pass alone. `realStudioStartup.test.ts` fails at baseline (dev.sh lacks `STUDIO_RUNNER_OBJECT_STORE_PROVIDER=local`).
