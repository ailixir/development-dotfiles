---
name: epic10-concurrency-proof-standard
description: Epic 10 concurrency claims require interleaving proof and intrinsic guards, not sequential happy-path tests — the standard story 10.4's QA round set
metadata:
  type: project
---

Since story 10.4's QA round, Epic 10 holds every concurrency claim to two rules:

1. **Guards must be intrinsic to the operation**, never dependent on a companion write or
   check elsewhere. 10.4's fix conditioned its state transitions on `configuration_revision`
   inside the same statement rather than checking first and writing after.
2. **Concurrency is proven by interleaving with real state held open**, not by sequential
   happy-path calls. 10.4 used deterministic interleaves holding a row lock open.

**Why:** a check-then-act pair passes every sequential test and fails in production. The
epic runs 3–6 API replicas, so nothing may assume a single instance.

**How to apply:** when validating any Epic 10 story, translate both rules into the
component under test rather than waiving them where there is no database. For a component
with no DB (the runner), the equivalents are concurrent in-flight HTTP requests against one
capacity pool, and an atomic slot acquire with no `await` between observing free capacity
and holding it — every `await` in single-threaded Node is a window. Demand a test the wrong
implementation must fail, not one the right implementation happens to pass.

Related: [[epic10-runner-isolation]]
