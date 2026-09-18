---
name: postgres-partitioned-not-valid
description: PG15 accepts ADD CONSTRAINT NOT VALID on a partitioned parent — but VALIDATE names the relation, not the row
metadata:
  type: project
---

Measured on `postgres:15-alpine` (**PostgreSQL 15.19**, the image `application-test.yml`'s
`jdbc:tc:postgresql:15-alpine` gives every backend IT), against a table shaped like
`ui_test_executions` — `PARTITION BY RANGE (started_at)`, `PRIMARY KEY (id, started_at)`, a named
partition plus a DEFAULT one:

1. `ALTER TABLE <partitioned parent> ADD CONSTRAINT … CHECK (…) NOT VALID` **is accepted**. It
   recurses and writes one `pg_constraint` row per relation — parent *plus every partition* — all
   with `convalidated = false`. So a count assertion should expect `1 + partitions`, not 1.
2. While still `NOT VALID` it is **enforced on every new write**, per partition, and the error
   `DETAIL` carries the failing row.
3. `VALIDATE CONSTRAINT` scans once and, on dirty data, fails with
   `check constraint "<name>" of relation "<partition>" is violated by some row` — it names the
   **relation, not the row**. Any migration using this form needs the row-finding query in its own
   comment, or the operator has a partition name and nothing else.

**Why:** ADR-002 §18.2 prescribed the `NOT VALID` → `VALIDATE` form for O-11 but left "does PG15
even allow it on a partitioned parent?" explicitly unverified through @sm *and* @po. A throwaway
`docker run --rm postgres:15-alpine` plus two `psql -c` calls settled it in under a minute — far
cheaper than a Gradle IT round trip, and it is how to answer this class of question before writing
the SQL rather than after.

**How to apply:** when a migration's *form* is uncertain, probe it in a throwaway container first
and put the observed behaviour in the migration's comment. Related:
[[backend-check-baseline]], [[epic10-falsification-standard]].
