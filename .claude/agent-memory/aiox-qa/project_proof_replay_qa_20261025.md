---
name: proof-replay-runner-frontend-qa-20261025
description: QA 2026-10-25 of proof = replay lanes (runner PASS, frontend CONCERNS); how to run focused suites, which failures are pre-existing, fixture-tier side effects
metadata:
  type: project
---

Runner lane (PUBLISHED stop discards the learn recording) PASS; frontend lane CONCERNS (autorun gating can stall silently if the followed proof snapshot never arrives; failed-proof "Learn again" untested).

**Facts that save time next time**
- Runner unit tier: `npx vitest run --coverage.enabled=false` (coverage thresholds print ERROR noise otherwise); full tier 3091 passed / 25 skipped. Node 24 via fnm path.
- Runner fixtures tier (`--config vitest.fixtures.config.ts`) rewrites tracked `docs/qa/evidence/STUDIO-OBS-007/*.json` and creates `docs/qa/evidence/STUDIO-OBS-015/native-fixtures/r1/*` dirs. Do not revert; mention in report.
- The earlier "secret-login 22 failures / mixed-mode-prefix 1" was in-flight allowedDomains (whitelist) migration by another agent; fixtures edited mid-run (secret-login.test.ts mtime moved while I ran). Re-run before trusting a fixtures failure.
- Frontend is vitest 1.6.1: `--maxWorkers` errors (minThreads conflict); use `--poolOptions.threads.maxThreads=3 --poolOptions.threads.minThreads=1`. The 47-file guided/page set takes ~11 min (pageGuidedRun alone ~8.5 min).
- `realStudioStartup.test.ts` fails at HEAD, not from working tree: commit 2d49e5a57 removed `STUDIO_RUNNER_OBJECT_STORE_PROVIDER` from dev.sh (`git show 2d49e5a57~1:dev.sh | grep -c` = 1, `2d49e5a57` = 0).
- zsh: no word-splitting of `$FILES`; use arrays. `PIPESTATUS` is `pipestatus`.

**Why:** shared worktree with many agents; failures are often another lane's in-flight work.
**How to apply:** attribute a failure by checking mtime of the failing test file and `git show HEAD:` of the asserted artifact before blaming a lane.
