---
name: backend-testcontainers-driver-stall
description: The backend suite can hang forever on a Testcontainers driver monitor — a stale Hikari connection adder blocks the next Spring context's Flyway; the full suite is not immune
metadata:
  type: project
---

`./gradlew test` on `put-checks/backend` can **hang indefinitely** instead of failing. It is not a
Spring context-cache subtlety and it is not specific to a `--tests` slice.

**Why:** `org.testcontainers.jdbc.ContainerDatabaseDriver.connect` synchronises on one process-wide
driver instance. When a finished Spring context leaves a daemon `HikariPool-N connection adder`
running, that thread sits inside `JdbcDatabaseContainer.createConnection`'s retry-sleep loop against
a container that has already gone away — **holding the driver monitor the whole time**. The next
context's `FlywayMigrationInitializer` then blocks (`BLOCKED (on object monitor)`, not sleeping) on
its very first connection and never proceeds.

**How to apply:**
- Symptom: the log stops advancing, the Gradle test worker sits near 0 % CPU, and `docker ps` shows
  a healthy postgres nobody is connecting to. `--tests "com.citi.put.checks.studio.*"` reproduces it
  at **142 passed, right after `StudioMigrationIT`**, every time (observed 3×, twice by @dev, once
  by @qa on 2026-09-11).
- **The full suite is not immune** — a `check --continue` hung with the identical stack after 612
  tests. @dev's "only a subset provokes it" is wrong; do not repeat it in a gate.
- Diagnose in 30 seconds rather than inferring:
  `jcmd <worker-pid> Thread.print | grep -A 12 '"Test worker"'`, then find the thread that
  `locked <same monitor address>` — it will be a `HikariPool-N connection adder`.
- Recovery: `kill -9` the gradle launcher, the daemon and the worker, confirm no postgres container
  survives, and re-run. A clean re-run completed twice.
- **Do not key a detector on the `Test worker`'s thread state.** (10.18a, 2026-09-15.) Across four
  runs on `story/10.18a` the worker was `BLOCKED` three times and **`RUNNABLE` on a socket read**
  once (an in-process HTTP `DELETE` waiting for a connection from the stale pool) — a `BLOCKED` grep
  misses that run entirely. Worse, the **holder** is `TIMED_WAITING (sleeping)` in every dump, so a
  `BLOCKED` grep misses the holder even when it catches the worker. The invariant present in all
  four: a thread named `HikariPool-N connection adder` with a frame at
  `org.testcontainers.containers.JdbcDatabaseContainer.createConnection` **and** a
  `locked <…ContainerDatabaseDriver>` line. Detect on that.
- **It can be deterministic, not just intermittent.** On `story/10.18a` it reproduced **4 of 4** —
  twice for @dev, twice for @qa — always at **435/436 of a ~874 baseline**, always at the same class
  boundary: the last result is `StudioOverloadIT > ordinaryRestTrafficContinuesWhileEveryStudioBound
  IsUnderPressure PASSED` and the stall is in the `StudioVisibilityIT` that follows. Same
  `HikariPool-4` ordinal every time. When a branch is in this state the honest gate outcome is **no
  backend result**, and the story's backend effect is unverified — say so rather than substituting
  narrow runs for the suite.
- `check -x test --rerun-tasks` is not a usable substitute: `:jacocoTestReport` fails Gradle's own
  task-validation ("uses this output of task ':compileJava' without declaring … dependency") in that
  combination. Exit 1 there is a build-script problem, not a coverage result.
- It hides **liveness, not correctness**: two completed full runs agreed exactly (831/23/6). But CI
  hitting it **hangs rather than fails**, which is worse, so never report a stalled run as a result.

- **A second, different load signature: a mass `ResourceAccessException: Unexpected end of file from
  server` across an IT class, including its `200` cases.** This is not the stall (the run completes
  and fails rather than hanging) and it is not a defect in the code under test. On 10.31 @dev
  recorded it as an unexplained finding — a constant whose value seemed to break all request
  handling — and it **did not reproduce at rest**: 14 passed / 1 failed, zero
  `ResourceAccessException`. Before recording any connection-level failure as a finding, re-run the
  exact mutation alone with nothing else on the host and `grep -c ResourceAccessException` the log.
  A cascade that includes the happy path is a host symptom until proven otherwise.

**Also worth knowing about this build:** `check` declares `dependsOn(jacocoTestCoverageVerification)`,
but that task depends on `:test`, so a `check --continue` whose tests fail **never runs coverage at
all** — it does not appear in the task list. Coverage must be verified separately with
`./gradlew jacocoTestCoverageVerification -x test`, and only **immediately after a full `test` run**:
the exec file is whatever the last test invocation wrote, so a narrow `--tests` run in between makes
it report 0.00 % everywhere.

Related: [[studio-suite-shared-container]], [[epic10-gate-policy-non-green-baseline]],
[[qa-review-verification-depth]]
