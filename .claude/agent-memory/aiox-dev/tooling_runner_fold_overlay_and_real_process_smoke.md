---
name: tooling-runner-fold-overlay-and-real-process-smoke
description: studio-runner D1 fold (2026-10-18) - TLS-only listener turns every createHarness suite red; scratch-tree + out-of-set patch recipe, DER cert issuer for EKU tests, real-process smoke without touching dist
metadata:
  type: project
---

OBS-009 W2 lane D1 made the runner listener TLS-only (`node:https`, `requestCert`, controller pin). `createApplication` now needs a `listener` dependency, so `test/helpers/harness.ts` (plaintext `net.connect` raw helpers in `runner.ts`) and every suite using it (165 tests: routes, admission, cancel, concurrency, reporting...) are red in the live tree until the helpers speak TLS. `lanes.json` gave harness.ts + 3 fixtures-tier files to P2 and `cancel.test.ts` to R1, so D1 shipped them as `d1/w2/out-of-set-tests.patch` instead of editing.

**Why:** a lane's write set can be too small for its own breaking change; the brief says an out-of-set need is a finding for root.

**How to apply:**
- Verify in a scratch copy: rsync `studio-runner` (no node_modules/dist/coverage), symlink those back plus `docs helm-chart backend frontend tools` one level up (tests read `../../../docs/specs`), rsync an `overlay/` of patched test files over it. Keep the overlay as the patch source: `git diff --no-index --diff-algorithm=patience`, rewrite headers to `a/studio-runner/...`, check with `git apply --check -p1` on the live tree and by applying to copies and comparing sha256.
- Mutation checks run in that scratch copy (copy the live file in, replace once, run `vitest --reporter=json`, copy back, assert live sha == scratch sha). 25 mutations in ~3 min; the live src is never touched.
- Real-process smoke without a `dist` rebuild: `tsc -p tsconfig.build.json --outDir emit-d1` inside the scratch tree (node_modules symlink resolves), copy `dist/runtime-versions.json` in, run `env -i ... node emit-d1/main.js`. With `PLAYWRIGHT_BROWSERS_PATH=~/Library/Caches/ms-playwright` the real `assertObservedBrowserStartup()` passes on this host. macOS has no `timeout`; use `perl -e 'alarm 10; exec @ARGV'`.
- eslint forbids dynamic `import()` (also in tests) and `node:child_process` outside `src/run`; a dead pid for sweep tests is any pid where `process.kill(pid,0)` gives ESRCH (2147000000 works).
- EKU/branch tests need real certs: a ~40-line DER writer signing with the fixture key (`test/fixtures/guided-tls/key.fixture`, `CN=localhost`, CA:TRUE) works; `X509Certificate.keyUsage` is `undefined` with no EKU extension.
- Foreign process 44737 is a pre-fold `dist/run/guidedMain.js` daemon; never signal it. A plain `tsc` build leaves stale `dist/run/guided{Main,Config,Shutdown}.js`.

Related: [[tooling-scratch-tree-staged-unit]], [[project-obs009-w1-probes-and-harness]].
