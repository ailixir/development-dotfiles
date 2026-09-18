---
name: studio-suite-shared-container
description: Every backend Studio IT shares one Postgres container and one context cache, so full-suite failure counts are order-dependent and one dead context can fail 15 tests at once
metadata:
  type: project
---

All backend Studio integration tests run against a single `jdbc:tc:` Postgres container per JVM,
and Spring's context cache is raised to 64 in `backend/build.gradle.kts`. Two consequences bite
during QA rounds:

1. **Order-dependent assertions.** Any test asserting a deployment-global count is zero (e.g. a
   dispatcher pass picking up no rows) will fail when an earlier class leaves rows behind under a
   different CSI — most `setUp` methods only `DELETE ... WHERE csi_id = ?` for their own CSI.
   Symptom: `expected: 0 but was: <n>` in one run, green in the next.
2. **One dead context fails a whole cluster of classes.** Fifteen failures all reading
   `Unexpected end of file from server` against the *same* port is one evicted/dead embedded
   server, not fifteen defects. Check whether the failing ports are identical before treating it
   as a regression.

**Why:** found during the story 10.7 review — one of three full runs gave 40 failures instead of
24, and both causes above accounted for all 16 extras.

**Named instance, confirmed 2026-09-11 (story 10.8 review):**
`DispatcherIT.asecondDispatchPassDoesNotPickUpADispatchingRow` is the canonical case of cause 1 —
`DispatchService.dispatchOnce()` is a global scan and the test asserts it claims zero, which only
holds while `AcceptanceIT` has not run first. On `story/10.8` it failed in one full run and passed
in the next. Attribution technique that settled it without a second worktree: `git archive <merge
base> | tar -x -C <scratchpad>` and run the two classes together there — it reproduces with none of
the branch's code present, and the class alone is green. Use `git archive` rather than `git
worktree add` when other sessions hold the repo.

**How to apply:** never judge a failure count from a single `./gradlew test` run. Run it at least
twice, and before reporting an extra failure, group by port and check whether the assertion depends
on global database emptiness. Combine with [[epic10-gate-policy-non-green-baseline]].
