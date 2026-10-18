---
name: project-d5-conflicts-with-profile-safety-fixture
description: STUDIO-OBS-009 W2 R2 - ruling D5-1 (failed guided launch = hard teardown only) turns two browser-profile-safety fixtures red; needs QA or architect decision
metadata:
  type: project
---

2026-10-18, lane R2: deleting the graceful `cleanup()` on a failed guided launch (ruling part1 D5-1 item 2) makes `browser-profile-safety.test.ts` "retains cleanup capability..." and "refuses a Default directory redirected..." red; `ProfileSafetyFixture` demands exactly one real production `context.close()`. Safety facts (canary, outside identity, refusal, 0 survivors) still hold. Pre-change baseline was 10/10 green. Reported as finding F-R2-1 in `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/r2/receipt.md`; decision (fixture accepts hard teardown, or ruling keeps a bounded graceful stage) belongs to QA/@architect.

**Why:** a ruling can silently contradict a QA oracle in a file no lane owns. **How to apply:** before deleting a close/cleanup path, grep fixtures for tests asserting `context.close` or the cleanup capability.
