---
name: context-close-scales-with-hung-navigation
description: Closing a Playwright context under a hung page.goto takes ~38 ms per second of hang (4.1-4.6 s at 115 s); a locator wait closes in <0.1 s. Why the chart grace is 15 s.
metadata:
  type: project
---

Measured 2026-09-18 (Studio v1 WP11, `studio-runner/test/fixtures-tier/cancel-real-chromium.test.ts`,
laptop, 1280x720): the child's ordered stop (`context.close()` + webm finalization) takes longer the
longer the pending navigation has been hung. About 1.2 s at 30 s, 2.3 s at 60 s, 4.1-4.6 s at 115 s.
One 115 s run overran 5 s when the step's own 120 s timeout fired during the close. A stalled
locator wait (`expect(...).toBeVisible()`) closes in about 65 ms even after 100 s. Recording length
alone does not matter.

**Why:** a `goto` `timeout` is not clamped below the runtime cap, so a navigation can hang for about
120 s. The total-runtime deadline kill always happens at that worst point. The 5 s grace from D4 was
therefore too short, and the chart now deploys `STUDIO_RUNNER_BROWSER_STOP_TIMEOUT_MS: "15000"`. The
runner's fallback is still 5 s. This has not been confirmed on a real pod yet; staging needs to do that.

**How to apply:** to measure a stop, first let the step stall for a long time. A cancel issued right
after `RUNNING` shows about 40 ms and proves nothing. The committed samples stall for only 2 s; the
long numbers came from temporarily raising `STALL_BEFORE_CANCEL_MS`. When the browser is
`SIGSTOP`ped past the grace, the recorder leaves a 0-byte file, so evidence is `FAILED/partial:false`,
not a partial prefix.

Before D1, the interrupted step was reported `FAIL` with Playwright's text: `ERR_ABORTED at <url>`
or "expected the locator to be visible". It was not "Target closed", which is what the plan had
inferred. Related: [[playwright-process-groups]], [[process-table-observation]].
