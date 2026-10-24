---
name: video-finalize-qa-r065
description: Round 065 QA gate of runner recording-finalization patch PASS 2026-10-23; launcher sha vs catalog identity facts
metadata:
  type: project
---

PASS at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-065/qa-video/`. Patch e3bf90fa (runtime.ts, browser.ts, guidedBrowser.ts + 4 tests).

**Why it matters:** `dist/run/browser.js` sha is recorded as `observedBrowserLauncherSha256` in `dist/runtime-versions.json` and checked at startup, but it is NOT in the catalog entry (profileHash, schema/reference bundle hashes, image digest, chromiumBuild). So a runner-only code change moves launcher sha + dist pins, not the code434 catalog. Stale runtime-versions with new browser.js gives PROFILE_MISMATCH (negative-controlled).

**How to apply:** for runner dist changes: clean build both copies (`tsc -p tsconfig.build.json` + `scripts/write-runtime-versions.mjs`), diff dist, run `loadObservedBuild` with the catalog (loadcheck.mjs), and flag round-062 preflight P2/P8/P9/P14 pin refresh. zsh: quote `==` in echo and `--include=*.ts` globs. Scratch copies outside repo make ~32 unit and mixed-mode-prefix fixture failures (need repo docs/); compare against a base copy.
