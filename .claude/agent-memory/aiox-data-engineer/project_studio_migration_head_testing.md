---
name: studio-migration-head-testing
description: Studio DB guarantees must be tested at the Flyway head, not the version that introduced them; later CREATE OR REPLACE of shared trigger functions silently dropped V18 guards
metadata:
  type: project
---

Studio migration guarantees must be verified at the current Flyway head, not only at the version that introduced them. V18 (story 10.23) protected every ui_test_revisions column via a generic to_jsonb diff. V21–V24 each `CREATE OR REPLACE ui_test_revisions_write_once()` with an explicit column list, so the V18 columns became mutable again. InferenceMigrationIT only migrated to V18 and could not see this. Found 2026-10-06 by InferenceMigrationLatestIT. V27 restored the generic V18 form, and the IT now tampers with every column read from information_schema. Expect future migrations to try redefining it again.

**Why:** shared trigger functions are redefined by later stories owned by other agents, and V19 is staged outside db/migration, so the real deployment path is V18 → V20..head.

**How to apply:** when adding or reviewing any Studio migration that touches ui_test_revisions or ui_test_executions guards, run the head-schema IT and check that the redefined function still covers earlier columns. Prefer generic guards (an exclusion list) over enumerated column lists.
