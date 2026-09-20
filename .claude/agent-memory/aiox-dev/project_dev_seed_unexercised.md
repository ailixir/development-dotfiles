---
name: dev-seed-unexercised
description: The dev R__sample_data.sql seed is run by nothing but StudioSeedIT; schema migrations broke it silently once (V14)
metadata:
  type: project
---

`backend/src/main/resources/db/seed/R__sample_data.sql` loads only under the `dev` profile, and until
2026-09-18 no test applied it. V14 (chromium-only CHECK, `logs` → JSONB) made it fail at the
`ui_tests` insert on a fresh DB and nobody noticed for a week. `StudioSeedIT` (Studio v1 WP6) now
applies `db/migration` + `db/seed` to a fresh PG15 container and re-applies the seed once.

**Why:** a repeatable migration runs after every versioned one, so any new CHECK/type change can
break it, and the `local` profile (what everyone runs) never loads it.

**How to apply:** when a migration tightens a constraint or retypes a column on a seeded table,
run `--tests 'com.citi.put.checks.studio.StudioSeedIT'`. `ui_test_executions` has `started_at` in
its PK, so `ON CONFLICT` never fires for seed rows with `NOW()`-relative times — use `NOT EXISTS`.
