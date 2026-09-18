---
name: epic10-migration-test-blindspot
description: Studio migration ITs build the schema from scratch, so V-migration data-transformation bugs (backfills, type conversions, constraint reordering) pass CI silently — always probe with a two-stage Flyway run
metadata:
  type: project
---

Every Studio migration IT in `backend/` (e.g. `StudioMigrationIT`) creates the schema from empty
through Flyway and *then* inserts. That proves the DDL but proves nothing about any `UPDATE`,
backfill, `USING` type conversion, or constraint-drop ordering inside a migration, because those
statements match zero rows on an empty database.

**Why:** a real defect shipped behind a fully green suite this way. Story 10.1's `V14` ran
`UPDATE ui_tests SET browser = 'chromium'` before dropping V1's inline
`ui_tests_browser_check` (which permitted only `chrome|firefox|safari|edge`), so Flyway aborted
with SQLSTATE 23514 on any database holding one legacy row — and no test noticed.

**How to apply:** when gating any story that adds a migration containing data statements, do not
trust the suite. Write a throwaway two-stage probe modelled on story 10.4's `RevisionMigrationIT`
(the only two-stage harness in the repo): `Flyway.configure().target("<N-1>").migrate()`, seed
realistic legacy rows, then `.target("<N>").migrate()` and assert the transformation. Run it,
report, delete it, confirm `git status` clean. Gotchas when seeding: `csi_systems.owner_email` and
`ui_tests.created_by` are FKs into `users`, and V12 adds `ck_ui_tests_csi_registered`, so a
no-CSI draft must also set `quarantined_at`.

**Worktree gotcha when measuring the frontend:** `frontend/node_modules/@put/core-components` is a
*relative* symlink (`../../../../put-core-components`) that resolves from the main checkout but not
from a worktree at a different depth. Left alone it produces two phantom `TS2307` errors and a
failing `ChecksLayout.a11y` suite that are environmental, not defects. Repoint it to the absolute
path to measure, then restore the exact relative target; `node_modules` is untracked either way.

Related: [[epic10-gate-policy-non-green-baseline]],
[[qa-review-verification-depth]]
