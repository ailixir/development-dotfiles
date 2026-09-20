---
name: not-supported-stale-read
description: A Propagation.NOT_SUPPORTED service method still holds one persistence context for its whole body, so a JPA re-read after a JdbcTemplate write returns the pre-write entity
metadata:
  type: project
---

In put-checks `StudioService` (class-level `@Transactional(readOnly = true)`), a method annotated
`Propagation.NOT_SUPPORTED` that reads an entity via a repository, writes the same row with a
`JdbcTemplate` statement, then re-reads via the repository gets the **stale** entity: the shared
EntityManager stays bound for the method's scope (transaction synchronization is on even without a
transaction). Found on Studio v1 WP4's cancel route: the 202 snapshot said `PENDING` after the
statement had closed the row `ERROR/CANCELLED`.

**Why:** the symptom looks like the SQL did nothing, and a narrower ledger-only test passes, so the
statement gets blamed first.

**How to apply:** after a JDBC write inside such a method, `entityManager.clear()` before
re-reading (ProgressReportService does the same for report statements). Related:
[[hibernate-locked-read-stale]].
