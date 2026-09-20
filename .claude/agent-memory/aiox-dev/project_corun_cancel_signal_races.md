---
name: corun-cancel-signal-races
description: Real-runner cancel legs race the progress ack against the poll/DELETE, and a seeded test's 30 s timeoutSeconds ends a "stalled" run by itself; how StudioCoRunIT legs 5-9 pin the signal
metadata:
  type: project
---

Found building the WP12 co-run cancel legs (branch `feat/studio-v1-rb-corun`, 2026-09-18):

- **The progress ack wins if you cancel too soon.** Cancelling the moment the black-hole page
  receives step 1's request lands while step 0/1 PROGRESS reports are still in flight; their 2xx
  ack carries `cancelRequested` and the runner logs `source: progress-ack`, not `control`. Leg 5
  was green by luck on its first run. The fix is to wait until the API snapshot shows step 1
  `RUNNING` (the report was applied), then for one control read after that, before cancelling.
  Found only by mutating `ExecutionControlService` to always answer `false` (M2).
- **`timeoutSeconds` is two budgets.** The dispatcher sends it as `deadlines.totalRuntimeMs` and the
  runner uses it as the step timeout; `seedTest` writes 30. A 120 s `goto` timeout in the artifact
  does not help — the run still ends ~30 s in. Raise `ui_tests.timeout_seconds` and the runner's
  `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` together.
- A leg that forgets to drive `dispatchOnce()` tests only the poll; assert the runner's
  `run.cancel_requested` `source` field, never infer it.

**Why:** a cancel leg that names the wrong signal passes against a broken signal path.
**How to apply:** for any new real-runner cancel test, falsify each signal separately (disable the
control answer, make the DELETE relay return FAILED) and check which leg reddens. Related:
[[epic10-falsification-standard]], [[skip-asymmetry-is-the-tell]].
