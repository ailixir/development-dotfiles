---
name: tooling-fixtures-probe-no-dist-and-close-bound
description: Running one fixtures-tier file without re-emitting dist (scratch config sans globalSetup); measured Playwright 30 s close bound on a SIGSTOPped Chrome and the guided server's 30 s socket timeout
metadata:
  type: reference
---

`vitest.fixtures.config.ts` has `globalSetup` = `emitDist()` (tsc API, in place), so ANY fixtures-tier command rebuilds `dist/`. When dist must not change (shared with backend ITs), write a plain-object `.mjs` config in the scratchpad (no imports; `root` = studio-runner, `include` = the one file, no `globalSetup`) and pass it as `--config <abs path>`; tests that import `src/` directly (`launchGuidedBrowser`, `createGuidedServer`) need no dist. Prove dist untouched: sha256 over `dist/**/*.js` before/after and `find dist -newermt`. A scratch `tsc -p tsconfig.build.json --outDir` diff (`diff -rq -x '*.map'`) shows whether an emit would change content.

Measured 2026-10-18 (macOS arm64, Chrome for Testing 1243, playwright-core 1.63.0): with Chrome frozen by `SIGSTOP` on its group, `acquired.close()` of `launchGuidedBrowser` resolves after 30.03-30.06 s with every frozen pid dead (Playwright's 30 s `DEFAULT_PLAYWRIGHT_TIMEOUT` then force-kill; mechanism inferred). So "close never settles" is NOT reproduced for SIGSTOP; a probe window under ~31 s will wrongly report a hang. The guided server's `server.timeout = 30_000` (transport.ts:127) ends an unanswered request with no HTTP response at 30.0 s, so replies to a ~30 s close are lost. Stop-before-spawn (`launchPersistentContext` stubbed pending) replies at launch + 15.04 s regardless of stop timing.

Wire-level guided harness: `test/helpers/guided.ts` + `guidedTls.ts` (testTls, jwt, ownershipSession, assignmentFor) with a stub HTTPS controller answering `claim` with the grant; wrap `launch` to freeze Chrome at a phase (`withhold`/`blankMatches` wrappers); `trackClose` wrapper to timestamp the runtime's own close. Freeze only direct children of the test process whose argv names `checks-guided-`.
