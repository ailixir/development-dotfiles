---
name: pg15-partitioned-constraint
description: PostgreSQL 15.19 behaviour for ADD CONSTRAINT NOT VALID / VALIDATE on a range-partitioned parent — verified twice, load-bearing for Epic 10's forward-only migrations
metadata:
  type: project
---

On `postgres:15-alpine` (**PostgreSQL 15.19**, the exact image `application-test.yml`'s
`jdbc:tc:postgresql:15-alpine` runs), against a table shaped like `ui_test_executions`
(`PARTITION BY RANGE (started_at)`, `PRIMARY KEY (id, started_at)`, one named partition plus
DEFAULT):

1. `ALTER TABLE <partitioned parent> ADD CONSTRAINT … CHECK (…) NOT VALID` is **accepted**. It
   recurses: one `pg_constraint` row per relation — parent plus every partition — all
   `convalidated = false`. No scan.
2. While still `NOT VALID` it is **enforced on every new write**, per partition, with the offending
   row in the error `DETAIL`.
3. `VALIDATE CONSTRAINT` on dirty data fails naming the **relation**, not the row:
   `check constraint "…" of relation "ui_test_executions_default" is violated by some row`.
4. After repairing the rows, `VALIDATE` succeeds and flips every relation to `convalidated = true`.

**Why:** ADR-002 §18.2 fixes this form for O-11's `error_code` CHECK and warns that if PG refused
`NOT VALID` on a partitioned parent that would be "a finding to record and escalate, not a licence
to silently switch form". The question was left open by @sm and @po; @dev settled it during story
10.14 and @qa re-derived it independently at the gate. Both runs agree in every particular.

**How to apply:** any future Epic 10 migration adding a constraint to `ui_test_executions` may use
`NOT VALID` then `VALIDATE` in one migration without escalating. Because point 3 names the relation
and not the row, the migration must carry a row-finding `SELECT` in its operator-remedy comment —
and beware [[epic10-vacuous-guard-shapes]] #14: that comment then quotes the statement, so any test
grepping the migration text for its own form is satisfied by the comment. Prove the form with a
two-stage container test (`flywayTo(prev)` → seed across ≥2 partitions including DEFAULT → migrate),
never with a text scan.

Related: [[epic10-migration-test-blindspot]], [[epic10-vacuous-guard-shapes]]
