---
name: backend-suite-baseline-failures
description: 23 backend tests fail on a clean checkout, so `./gradlew check` cannot go green — verify against a baseline worktree before blaming your change
metadata:
  type: project
---

The Java backend suite has ~23 pre-existing failures unrelated to any current story, so
`./gradlew check` fails even on an untouched checkout. Verified 2026-09-10 against a detached
worktree at commit `910de104d`: the identical 23 failures reproduce there.

Affected classes (all HTTP/auth/rate-limit integration tests, none in `studio`):
`CheckCrudIT`, `BulkDeleteIT`, `RateLimitFilterIT`, `CsiFetchIT`, `ReportsCrudIT`,
`ReportsDuplicateIT`, `ReportsExecutionIT`, `ReportsPreviewIT`, `ReportDeliveryDispatcherIT`,
`ScheduleAuthzIT`, `BffFilter503IT`, `BffFilterUnauthIT`, `IdentityCacheIT`, `UserMeEndpointIT`.
Symptoms are 404/500 where 200/201/503 is expected and rate-limit buckets leaking across tests.

**Why:** without this, an agent finishing a story sees a red `check` and burns self-heal rounds
trying to fix code it never touched.

**How to apply:** run the narrow slice for your story (`--tests 'com.citi.put.checks.<pkg>.*'`)
plus the static gates (`spotlessCheck checkstyleMain checkstyleTest spotbugsMain rdsParityLint
antiRegressionCheck`) — those do pass. If you must claim `check` is green, first reproduce the
failures on a baseline worktree (`git worktree add --detach <scratchpad> HEAD`) and report the
delta, not the absolute count. Re-verify the list before trusting it: someone may have fixed them.

Related: `spotlessCheck` also had pre-existing violations in `dc/` and `SplunkCheckExecutor.java`;
running `./gradlew spotlessApply` reformats files outside your story's scope, which is unavoidable
if you need the gate green.
