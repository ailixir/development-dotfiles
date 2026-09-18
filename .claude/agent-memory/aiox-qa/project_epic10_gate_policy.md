---
name: epic10-gate-policy-non-green-baseline
description: Epic 10 QA gates must not fail stories for the ~23 pre-existing backend test failures; CONCERNS is the expected verdict for externally gated ACs
metadata:
  type: project
---

For the Epic 10 (Checks UI Studio) run, the `backend/` module does **not** start from a green
`./gradlew check`. As of base commit `910de104d` there are 23 pre-existing integration-test
failures — all `AssertionFailedError` on auth/BFF/rate-limit assertions, spread across
`security` (BffFilter503IT, BffFilterUnauthIT, IdentityCacheIT), `config` (RateLimitFilterIT),
`checks` (CheckCrudIT, BulkDeleteIT), `reports` (ReportsCrudIT, ReportsDuplicateIT,
ReportsExecutionIT, ReportsPreviewIT, ReportDeliveryDispatcherIT), `csi` (CsiFetchIT),
`users` (UserMeEndpointIT) and `scheduling` (ScheduleAuthzIT). Total suite is 319 tests.

Gate policy in force: judge a story on **its own surface** only. `CONCERNS` is the expected — and
mergeable — verdict for stories with externally gated ACs. `FAIL` is reserved for an unmet AC, a
breakable immutability/concurrency guarantee, a wrong migration, or a faked deferral.

**Why:** the epic runs multiple stories in parallel worktrees against a brownfield backend whose
auth layer is still stubbed (see ED-02 in `docs/epics/EPIC-10-EXECUTION.yaml`). Failing every story
on the shared baseline would block the whole epic.

**How to apply:** when gating an Epic 10 story, run the narrow suite first
(`./gradlew test --tests 'com.citi.put.checks.<context>.*' --rerun` — note `--rerun`, the task is
otherwise UP-TO-DATE from the dev's run). Then run `./gradlew check --continue` and confirm the
failure list is a subset of the 23 above and that no failing class references the story's surface.
State explicitly in the gate whether you independently reproduced the baseline — `git worktree` is
typically unavailable to review agents, so usually you have not.

Related: [[epic10-studio-review-gotchas]]
