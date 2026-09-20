---
name: cross-stack-config-pins
description: Backend Studio config keys and dispatcher SQL are pinned by tests in unexpected places — a frontend vitest regexes application.yml env-var names, and a Mockito test observes which SQL dispatchOnce issues
metadata:
  type: project
---

Two pins sit far from the code they guard (found during Studio v1 WP8/WP9, 2026-09-18):

- `frontend/src/components/studio/review/compilePollBounds.test.ts` reads
  `backend/src/main/resources/application.yml` and regexes the **env-var name** of the compile
  sweep threshold/interval (`STUDIO_COMPILE_ABANDONMENT_THRESHOLD`, `..._INTERVAL_MS` since WP9;
  `STUDIO_COMPILE_SWEEP_THRESHOLD` before). Renaming the key or changing the default reddens a
  frontend test, and the frontend watch window constant must move with it.
- `StudioKillSwitchWiringTest` tells the kill-switch branches apart by what `dispatchOnce()`
  reaches for (mocked `JdbcTemplate` / `StudioDispatchLedgerStatements`). Any change to how the
  dispatch pass selects rows breaks it; it only shows up in a `studio.*` package run, not in
  `DispatcherIT`.

**Why:** both were missed by a narrow per-class run and caught only by the full package run.

**How to apply:** when touching Studio config keys or the dispatcher's pass, grep the frontend for
the env-var name and run `--tests 'com.citi.put.checks.studio.*'` before committing. Related:
[[backend-check-baseline]], [[test-container-and-context-isolation]].
