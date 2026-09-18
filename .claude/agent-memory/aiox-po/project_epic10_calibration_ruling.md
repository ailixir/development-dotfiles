---
name: epic10-calibration-ruling
description: ADR-002 §11 closed O-7 — calibration is runner-side at the clock, recordingOriginMs rejected; the API applies none
metadata:
  type: project
---

ADR-002 §11 (amendment, 2026-09-11) closed open item O-7: **calibration is applied
runner-side, at the clock.** Story 10.12's proposed `recordingOriginMs` field was **rejected**
and the contract gained no field. Remaining work is open item **O-8**, owned by 10.12.

**Why:** subtracting two readings of one monotonic clock is exact wherever it happens, so a
wire constant conveys nothing the runner could not apply itself and only makes correctness
depend on every consumer remembering it. Retry semantics agree — zeroing at observation fixes
each entry's value across cumulative reports, byte-identical terminal retries, and the Sonic
manifest recovery path. A live defect motivated it: `runCoordinator` injects no clock, so
`executeSteps` falls back to a process-origin `performance.now()` while the browser-start line
carries a literal `0` — two origins on one wire body.

**How to apply:**
- **10.12 owes (O-8):** remove the process-origin default from production; pair the
  `browserStartedAt` and clock-zero reads at recording-context readiness; measure the
  readiness-to-first-frame gap **in staging**; assert the **scale**, since the runner's
  contract-test validator ignores `minimum`.
- **10.7 / any API story:** `at = browserStartedAt + atMs` stands. The API applies **no**
  calibration, never re-bases against the lowest reading, never treats `0` as missing, rounds
  **once** at persistence. A report with `browserStartedAt: null` carries **no** reading.
- 10.7 is correct by contract today and correct in fact only when 10.12 lands the clock.
  Derived instants will be absurd until then — **let them be**; compensating in API code
  installs a second undocumented calibration.

See [[adr002-amendment-authority]] and [[epic10-runner-isolation]].
