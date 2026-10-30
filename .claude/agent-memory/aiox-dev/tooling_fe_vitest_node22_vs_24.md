---
name: tooling-fe-vitest-node22-vs-24
description: ui-studio frontend vitest under Node 24 fails 2 CreateCheckPage.uiTest tests (AbortSignal); use Node 22 for FE vitest, Node 24 for Playwright scripts
metadata:
  type: reference
---

FE vitest run under fnm Node 24.20.0 fails 2 tests in `src/pages/CreateCheckPage/CreateCheckPage.uiTest.test.tsx` ("sends one POST...", "sends the trimmed name...") with `RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal` (react-router navigate + MSW interceptor, jsdom AbortSignal vs undici). Same file passes 45/45 under `~/.local/share/fnm/node-versions/v22.23.2/installation/bin`. Not caused by UI edits.

**How to apply:** put Node 22 first on PATH for `pnpm exec vitest run ...`; use Node 24 (as the lead asks) for the Playwright visual scripts. Under Node 22, 61 files / 1405 tests across studio, checks, pages passed in ~3 minutes with `--poolOptions.threads.maxThreads=3 --poolOptions.threads.minThreads=1`.

Also: the live :5181/:8080 stack can be restarted by someone else mid-task with a fresh embedded DB (fixture tests vanish; DELETE then answers 403). Re-create fixtures rather than assuming they persist. A parallel session may be editing the same page files (AllChecksPage schedule dialog); read "changed on disk" notices as theirs and do not revert.
