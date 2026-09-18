---
name: med2-hang-two-surfaces
description: MED-2 reproduces deterministically at StudioVisibilityIT on epic/EPIC-10, and one of its two surfaces is a RUNNABLE worker — grepping for BLOCKED misses it
metadata:
  type: project
---

The Testcontainers JDBC liveness bug (MED-2, owner @devops) reproduced **2 of 2** on
`epic/EPIC-10` at `78cc634b2` during story 10.18a, at the same class boundary each time: the last
result in both logs is `StudioOverloadIT > ordinaryRestTrafficContinuesWhileEveryStudioBoundIsUnderPressure
PASSED`, and the stall is in the `StudioVisibilityIT` that follows it, around test 434–436 of an
~874 baseline. It stalled on a fully idle machine as well as a loaded one, so load is not the
trigger.

**Why:** a stale daemon `HikariPool-4 connection adder`, belonging to an already-finished context's
pool, sits in `JdbcDatabaseContainer.createConnection`'s retry-sleep loop **holding** the
process-wide `org.testcontainers.jdbc.ContainerDatabaseDriver` monitor against a container that has
gone away.

**How to apply: do not key on thread state at all.** The holder is `TIMED_WAITING` in every dump,
so a `BLOCKED` grep misses it even when it happens to catch the worker. Key on the holder's
signature: `HikariPool-N connection adder` + `JdbcDatabaseContainer.createConnection` +
`locked <…ContainerDatabaseDriver>`.

The worker's own state varies and is not diagnostic:

| Surface | `Test worker` state | What it looks like |
|---|---|---|
| canonical | `BLOCKED (on object monitor)`, `waiting to lock … ContainerDatabaseDriver` | @qa's stack; 3 of the 4 observed hangs |
| the other one | **`RUNNABLE`**, on `SocketDispatcher.read0` inside `TestRestTemplate.exchange` | an in-process HTTP call that never returns, because the request thread inside the app is waiting for a connection from that pool. Observed once, and **@qa could not reproduce it** in two further attempts — so treat it as a surface that exists, not as one you should expect |

Count on this branch: **6 of 6 attempts hung** — two by @dev and two by @qa on 10.18a, and two
more by @dev on story 10.15 at `39939a213` (baseline before any edit, and the retry after). Both of
the 10.15 runs stopped at **435 and 436 test results**, with `StudioOverloadIT > ordinaryRestTraffic…`
as the last printed line in each, and both dumps carried the canonical signature.

**Do not compare runs by class count — only by the failing set.** The two 10.15 runs reached almost
the same *test* count (435 vs 436) but wildly different *class* counts: **184 vs 126**. Gradle
partitions classes across forks, so where the hang lands decides which classes ever ran, and the
class set is an artefact of the stall rather than a measurement of your change. What *was* stable
across both runs, byte for byte, was the failing set: 13 classes, 22 failures, zero in
`com.citi.put.checks.studio`. That is the comparison @po's MED-2 clause is actually satisfied by.

Backend static gates can still be run while this blocks `:test`:
`./gradlew --no-daemon spotlessCheck checkstyleMain checkstyleTest spotbugsMain --rerun-tasks --continue`
passes in ~22s. `check -x test --rerun-tasks` does **not** work — `:jacocoTestReport` fails Gradle's
task-validation ("uses this output of task ':compileJava' without declaring an explicit or implicit
dependency"), which is a build-script problem and not a coverage result.

Related: [[backend-check-baseline]], [[epic10-falsification-standard]].
