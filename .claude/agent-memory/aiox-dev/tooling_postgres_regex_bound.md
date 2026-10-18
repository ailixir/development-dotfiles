---
name: tooling-postgres-regex-bound
description: PostgreSQL regex repetition bounds max at 255 — a CHECK like ~ '^[..]{1,256}$' migrates fine but fails every INSERT
metadata:
  type: project
---

PostgreSQL ARE bounds `{m,n}` accept only 0..255. A CHECK such as `recording_id ~ '^[A-Za-z0-9_-]{1,256}$'` still passes Flyway, because the regex is compiled lazily, but every INSERT then fails with "invalid regular expression: invalid repetition count(s)". This was found in STUDIO-OBS-013 V20 on 2026-10-13. The same pattern is valid in Java and JSON Schema, so contract tests do not catch it.

**Why:** the migration looked green, and only the first real insert exposed it.

**How to apply:** when reviewing or writing DDL that mirrors a `{1,256}` ID pattern, use `~ '^[...]+$'` and let `varchar(256)` bound the length. Make sure a migration IT inserts at least one positive row. Related: [[tooling-deletions-and-baselines]].
