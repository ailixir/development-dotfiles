---
name: postgres-limit-in-subquery
description: In put-checks, `UPDATE ... WHERE id IN (SELECT ... LIMIT n)` does not bound the statement — measured updating 5 rows with a batch of 2; use a CTE
metadata:
  type: project
---

**A batch bound written as `UPDATE t SET ... WHERE id IN (SELECT id FROM t WHERE ... ORDER BY ...
LIMIT ? FOR UPDATE SKIP LOCKED)` does not bound the `UPDATE`.** Measured on PostgreSQL 15 in
`put-checks/backend` while building story 10.9's abandoned-compile sweep: with five eligible rows
and a batch size of two, the subquery selected 2 and the `UPDATE` touched **5**. The planner is free
to re-evaluate an uncorrelated `IN` subquery per outer row, which makes the `LIMIT` bound each
evaluation rather than the statement.

**Why:** it matters because the whole point of a batch size is that a scheduled sweep is never an
unbounded `UPDATE`. The subquery form looks correct, passes any test that only counts the final
state, and fails only a test that drives the bound past its cap and asserts the *return value*.

**How to apply:** write the selection as a CTE, which is evaluated once:

```sql
WITH victims AS (SELECT id FROM t WHERE ... ORDER BY ... LIMIT ? FOR UPDATE SKIP LOCKED)
UPDATE t SET ... FROM victims v WHERE t.id = v.id AND <the predicate, re-stated>
```

Re-state the predicate in the outer `WHERE` as well: PostgreSQL re-evaluates it against the
committed row version once the lock is acquired, so a row that settled between selection and update
is skipped rather than overwritten. And always assert the *returned row count* of a bounded
statement, not just the resulting state — that is the only assertion that catches this.

Related: [[epic10-falsification-standard]], [[backend-check-baseline]].
