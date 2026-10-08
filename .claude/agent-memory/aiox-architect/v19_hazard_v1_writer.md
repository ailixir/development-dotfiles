---
name: v19-hazard-v1-writer
description: Applying staged V19 at HEAD breaks every V1 Run compile; runbook rollback-floor row (571e779e1 safe) is wrong; V1 writes no compile-request row
metadata:
  type: project
---

At HEAD ccf3b9743 (2026-10-07), the live V1 path (CompilePipeline -> beginCompile -> publishAcceptedCandidate -> insertOrReuseRevision) never writes ui_test_compile_requests and inserts revisions without compile_request_id. V19's require-request trigger therefore rejects every V1 publication. InferenceMigrationLatestIT's "LEGACY_WRITER" has the same column list as the live writer. The deadline guards (NOT EXISTS on request deadline_at) are vacuous for V1 for the same reason.

**Why:** 554277fcb (2026-09-22) rerouted the live path away from the capability-gated publishCandidate. The 2026-10-06 runbook floor (docs/runbooks/studio-inference-rollout.md:83) missed this.

**How to apply:** never recommend applying V19 until the §35 fix story (S2 in the decisions.md 2026-10-07 record) lands: a request row per V1 compile plus a V19-applied IT. Grep for a beginCompile request insert before trusting this memory. See [[run-auto-accept-ruling]] and [[v1-plus-scope-decision]].
