---
name: runner-coverage-ceiling
description: studio-runner src/run/** 85% unit gate is unreachable after 012A (ceiling 81.16%) because AC-25 forbids unit tests loading browser.ts; secret-control cutoff flake is product-side (trackTree ps polling)
metadata:
  type: project
---

After STUDIO-OBS-012A deleted playwrightAdapter.ts, the unit-tier `src/run/**` line/statement gate (85%) has a ceiling of 81.16%. Measured on 2026-10-13: 81.09%, with every line outside browser.ts/child.ts/guidedMain.ts covered. `test/run/confinement.test.ts` (AC-25) fails any non-fixtures test whose source mentions `run/browser.js` or imports Playwright. child.ts and guidedMain.ts import browser.js, so loading them would get past that check only by indirection.

**Why:** The lead's "mock playwright and cover browser.ts" approach collides with the 10.12 AC-25 tripwire. An owner ruling is pending (architect/PO): amend AC-25, measure the browser files in the fixtures tier, or waive. Evidence: docs/qa/evidence/STUDIO-OBS-012A/runner-coverage/ledger.json.

**How to apply:** Do not try to reach 85% with more unit tests or by working around the tripwire. Check whether the ruling has landed first. The `observed-secret-control` lost-control-body flake (cutoff 2000–2021 ms) existed before 012A. Its cause is on the product side: launcher `trackTree` runs a blocking `spawnSync('ps')` every 25 ms, and the stop deadline has almost no headroom. Never "fix" it by loosening the test bound.
