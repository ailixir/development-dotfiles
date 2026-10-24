---
name: w53-login-journey-it
description: GuidedLoginJourneyJoinedIT - scripted-model backend+runner repro of the login journey; pre-fix dist negative control recipe; case432 reading
metadata:
  type: project
---

`backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedLoginJourneyJoinedIT.java` (trimmed copy of GuidedFocusMutationJoinedIT scaffolding, listed in `runnerSpawningTestClasses` in build.gradle.kts, else `verifyRunnerDist` is skipped for `--tests`): real PG + production `translation.advance` loop + real runner/Chromium + scripted provider (SOURCE_PLAN then NEXT_ACTION = first remaining obligation, the observation's own node + role or label hint). 4 steps (open, `<var USER>`, `<secret PASS>`, Sign in) complete with the fixed dist in ~12 s per test.

**Negative control without touching dist:** `OBS009_RUNNER_DIST=<dir named dist>` (must be named `dist`, sibling of `scripts/`, `package.json`, `node_modules`; copy the real dist and overwrite only `run/observationCollector.js` with a scratch tsc emit of `git show HEAD:...observationCollector.ts`). Pre-fix: turn 2 throws `UNKNOWN_OUTCOME 409` (runner prepare non-200 -> HttpRunnerDispatchClient ~690), no step-2 action row, stepIndex stays 1.

**case432 reading:** in `diagnostic432/result-b.json` the only APPLIED NEXT_ACTION is step 1's navigate; the REJECTED one with tokens ABSENT is the step-2 call. Non-OK, non-INVALID_RESPONSE model code (TRANSPORT/TIMEOUT/BUSY/TOO_LARGE/DISABLED) goes straight to terminal `failTranslation(INVALID_CONTRACT)` at GuidedTranslationService ~1937 with no retry. Step-2 admission was never exercised in 432.

No `timeout` binary on macOS; run gradle via a background script and poll. See [[w48-password-label-poisons-hints]].
