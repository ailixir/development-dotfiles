---
name: vitest16-list-and-e2e-harness
description: vitest 1.6.1 has no `list` subcommand (starts watch mode, vacuous grep); how to prove e2e exclusion; Playwright MSW harness layout in frontend/e2e
metadata:
  type: reference
---

`pnpm exec vitest list` on frontend vitest 1.6.1 runs a watch-mode test run with filter "list" and never exits. A `| grep -c /e2e/` on it is vacuous. Prove collection with `createVitest('test',{watch:false,config}).globTestFiles()` and a mutation (same config minus the `exclude`), then `ctx.close(); process.exit(0)`.

The Playwright harness (lane L3H, 2026-10-17) lives in `frontend/e2e/`: `start-servers.mjs` (Vite on 127.0.0.1:4177 plus an MSW Node proxy on 4178 loaded via `ssrLoadModule`), `mswProxy.ts` (`getResponse` from msw, unhandled gives 502, `/__test/scenario|requests`). Real backend: `CHECKS_E2E_REAL_BACKEND=1`, project `real-backend`, only `*-real-backend.spec.ts`. `grep "npm run"` also matches `pnpm run`; use `(^|[^p])npm`.
