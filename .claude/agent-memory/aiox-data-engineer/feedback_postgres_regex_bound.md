---
name: postgres-regex-bound
description: PostgreSQL regex repetition bounds max out at 255; {1,256} in a CHECK compiles at migrate time but fails every INSERT
metadata:
  type: feedback
---

Never write `{m,n}` with n > 255 in a PostgreSQL regex CHECK. Use `+` and let varchar(n) bound the length.

**Why:** the AR-1 R5 normative DDL had `~ '^[A-Za-z0-9_-]{1,256}$'`. V20 applied fine, but every INSERT raised "invalid repetition count(s)" (2026-10-13, caught by the migration IT and by B13). Architect-provided "exact DDL" is not pre-validated.

**How to apply:** always run an insert-positive IT case for every CHECK in a new table, not only negative cases. A negative case that expects a bare "check" message can pass on the wrong error, so assert "violates check constraint" or the SQLState.
