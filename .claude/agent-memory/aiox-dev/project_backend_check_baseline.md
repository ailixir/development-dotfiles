---
name: backend-check-baseline
description: put-checks backend `./gradlew check` is red at baseline — 23 failing ITs (spotless since fixed) unrelated to any new story
metadata:
  type: project
---

`./gradlew check` in `backend/` does **not** pass on a clean checkout of the Epic 10 base
(commit `910de104d`, Sept 2026). Two independent pre-existing failures:

- **23 failing integration tests.** Causes observed: GreenMail `BindException` on fixed port 3025
  (`ReportDeliveryDispatcherIT`), and auth/rate-limit ITs asserting a principal but getting
  `platform-bypass` (`UserMeEndpointIT`, `RateLimitFilterIT`, `BffFilter503IT`, reports/schedule ITs).
- **6 spotless format violations** in `SplunkCheckExecutor`, `DailyChecksAdapter`, `DcClient`,
  `DcErrorMapper`, `CsiListIT`, `SplunkMappingTest`. **Fixed, and confirmed fixed twice**: green at
  `86a187267`, and re-measured at `50f770ed2` (2026-09-11) where
  `spotlessCheck checkstyleMain checkstyleTest spotbugsMain --rerun-tasks` is **clean on the base
  tree** and the only violations that appear are the ones your own edits introduce. `spotlessApply`
  is therefore safe on this branch — but still check `git status` afterwards.

**The 23 are stable and worth diffing against test-by-test, not just counting.** At `50f770ed2`:
`CheckCrudIT` 2, `bulk.BulkDeleteIT` 2, `config.RateLimitFilterIT` 4, `csi.CsiFetchIT` 1,
`reports.ReportDeliveryDispatcherIT` 1, `reports.ReportsCrudIT` 2, `reports.ReportsDuplicateIT` 1,
`reports.ReportsExecutionIT` 2, `reports.ReportsPreviewIT` 2, `scheduling.ScheduleAuthzIT` 2,
`security.BffFilter503IT` 1, `security.BffFilterUnauthIT` 1, `security.IdentityCacheIT` 1,
`users.UserMeEndpointIT` 1. Save `grep 'FAILED$' | grep ' > ' | sort` before you start and `diff`
it at the end — that is the whole gate, and it takes seconds.

**`jacocoTestReport` declares `dependsOn(tasks.test)`**, so under `check --continue` with a failing
`:test` the coverage pair never runs. Run it separately against the fresh `test.exec`:
`./gradlew jacocoTestReport jacocoTestCoverageVerification -x test`. And use `--rerun-tasks` on the
static gates, or Gradle's UP-TO-DATE cache answers for them without checking anything.

**Why:** neither is caused by story work; both predate Epic 10 wave 1. Verified by running the same
commands in a detached worktree at the base commit and diffing the failing-test sets (empty both ways).

**How to apply:** do not treat a red `./gradlew check` as your own regression without first
diffing against the base commit. Use
`./gradlew check -x spotlessCheck -x spotlessJavaCheck --continue` plus a base-commit comparison,
and scope verification to `--tests '<your package>.*'`. Never run bare `spotlessApply` and commit
the result — it rewrites those six out-of-scope files; revert them with `git checkout --` afterwards.
Related: [[story-scope-discipline]]

**UPDATE 2026-09-16 (story 10.18b, branch `story/10.18b`): twelve of the 23 are now GREEN, and the
number is expected to move for the right reason.** AC-19a made the three `BffSessionAuthenticationFilter`
bypasses configuration-driven and **default-closed**, so the ITs that were asserting a `401` the
unconditional bypass made unreachable now pass: `BffFilterUnauthIT` 1, `BffFilter503IT` 1,
`RateLimitFilterIT` 4, `ScheduleAuthzIT` 2, `BulkDeleteIT` 2, `IdentityCacheIT` 1, `CsiFetchIT` 1.
**The residue is 10 and is not identity-related**: `CheckCrudIT` 2, `ReportsCrudIT` 2,
`ReportsExecutionIT` 2, `ReportsPreviewIT` 2, `ReportsDuplicateIT` 1, `ReportDeliveryDispatcherIT` 1.
If you diff a failing set against the pre-10.18b list you will see twelve "disappear" — that is the
fix, not a skipped run.

**Two profiles now open `checks.security.bypass.identity-headers`, and only that one flag**:
`application-test.yml` and `application-local.yml`. Twelve IT files inject their caller with
`X-User-Id`; with the header path closed they authenticate as nobody and the route answers 401
before the assertion is reached. If a new IT suddenly 401s, check which profile it runs under before
assuming a regression.

**UPDATE 2026-09-16 (story 10.11c, base `f868c31df`): the "residue of 10 is not in `studio`" claim
is wrong.** The residue above is the set the *whole* `check` reports; scoping to the Studio package
finds more. Measured in a throwaway worktree at `f868c31df` with
`./gradlew --no-daemon test --tests 'com.citi.put.checks.studio.*'` (≈4 min, completes — it does not
hit MED-2): **90 files / 687 tests / 7 skipped / 6 failures across 4 classes** —
`StudioOverloadIT` 1, `compile.CompileRouteContractDivergenceTest` 1,
`evidence.ExecutionVideoAuthorizationIT` 2, `evidence.ExecutionVideoContractEscalationTest` 2.

Two of those six are story 10.15's **deliberately red** `ESC-1`/`ESC-2` escalation, recorded in
ADR-002 §13 as `0/2 before and after, on purpose`. One is a genuine stale assertion:
`CompileRouteContractDivergenceTest:212` still asserts `x-not-yet-implemented: true` on
`getExecutionVideo`, which 10.15 removed — FOC-04's shape again, a merged story's legitimate contract
edit reddening a sibling assertion nobody updated.

**How to apply:** `--tests 'com.citi.put.checks.studio.*'` is the cheap, complete, non-hanging gate
for Studio work — take it in a base-commit worktree before your first edit and diff the
class/failure tuple at the end. Do not accept a per-package count quoted in a task brief; the briefs
have carried the whole-`check` residue and described it as package-scoped.
