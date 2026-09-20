---
name: runner-control-poll-scheduler
description: studio-runner's cancel control poll runs on its own injected timers (harness.controlScheduler); putting it on the deadline scheduler breaks every test that asserts scheduler.pending()
metadata:
  type: project
---

Since Studio v1 WP4's follow-up (commit `f53d55d54`), an active run in `studio-runner` polls
`GET /internal/studio/executions/{id}/control` every 2 s. The poll is scheduled on
`controlTimers`, **not** on the deadline `timers`. The test harness gives it a separate
`controlScheduler` that never fires unless a test advances it, and the fake HTTP client routes
`…/control` into `http.controlRequests`, not `reportRequests`.

**Why:** hung-child, deadline-outcome and similar suites assert `scheduler.pending()` equals
`[TOTAL_RUNTIME_MS]` and wait for "the deadline is armed" via `pending().length > 0`. A poll timer on
the same scheduler makes both wrong, and a real-timer poll would add stray requests to report counts.

**How to apply:** when adding any periodic runner activity, give it its own timer seam and its own
fake scheduler in `test/helpers/harness.ts`. Related: [[process-table-observation]].
