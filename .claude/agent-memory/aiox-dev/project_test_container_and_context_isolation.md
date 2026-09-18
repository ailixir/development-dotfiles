---
name: test-container-and-context-isolation
description: put-checks backend test-isolation traps that pass in isolation and fail together — tc container lifecycle, global dispatcher scans, global quota and SSE registry leaks
metadata:
  type: project
---

Failure modes in `put-checks/backend` that are **green in isolation and red in the full suite**,
which makes them expensive to diagnose:

1. **The Testcontainers JDBC container is stopped when its connection count reaches zero.** Spring
   evicting a cached test context closes that context's Hikari pool; if it held the last
   connections, the container stops and every *other* cached context is left pointed at a dead port
   ("Connection refused"). What landed is `systemProperty("spring.test.context.cache.maxSize", "64")`
   on the `test` task in `backend/build.gradle.kts` — it stops the eviction, so the container is
   never orphaned. It is a **mitigation, not a cure**: a suite that outgrows 64 contexts brings it
   back.
   **`TC_DAEMON=true` on the `jdbc:tc:` URL is NOT the fix and is not in the tree.** It was tried
   and reverted: it keeps the container alive but its non-daemon thread then blocks the Gradle
   worker JVM from being recycled at a `forkEvery` boundary, so the suite stalls after ~565 tests
   instead of failing. A stall is worse than a failure because it reads as slowness.
2. **`StudioDispatcher.dispatchOnce()` and both reapers scan the whole ledger**, not one CSI. A test
   asserting a global send count *or a global return value* is coupled to whatever queued rows other
   test classes left behind. Assert on the execution under test (`runner.sent()` filtered by
   `executionId`), never on a total.
   **Sweep for every instance once you find one.** Story 10.7 fixed this in `RecoveryIT` and missed
   the identical bug in `DispatcherIT.asecondDispatchPassDoesNotPickUpADispatchingRow`, which
   asserted on `dispatchOnce()`'s return value and reached the QA gate. One instance of this
   coupling means the others are in the same commit.

3. **An `@AfterAll` on an abstract test base tears down a shared static resource once per
   *subclass*.** Story 10.9 put a static WireMock server and an `@AfterAll stopRunner()` on
   `AbstractRepairPipelineTest` so three repair test classes could share one Spring context. JUnit
   inherits `@AfterAll`, so the first subclass to finish stopped the server the other two were still
   bound to: all three classes passed in isolation and twelve tests failed together, with assertion
   messages that read like a product bug (the compile "never reached AWAITING_CONFIRMATION" —
   because the validator was unreachable). **Stop a shared static resource from a JVM shutdown hook
   in the static initializer, never from an inherited `@AfterAll`.**

4. **Global Studio bounds leak between classes too, and even a two-class `--tests` run can change
   order between identical invocations.** Found while repairing DEF-08 (2026-09-16):
   - The global pending quota is `count(*) ... WHERE state <> 'DONE'` over **every** CSI. A class
     that deletes only its own CSI's ledger rows gets every accept refused if another class ran
     first and left rows behind. `ExecutionVideoAuthorizationIT` leaves one `DISPATCHING` row per
     test. The symptom points somewhere else entirely: `EmptyResultDataAccessException` on a
     ledger lookup.
   - The SSE `WatchedExecutionRegistry` releases a client-closed stream only when a heartbeat write
     fails. A following test in the same context can find the pod bound already full and get
     `SSE_POD_LIMIT` 429 on its own first open. Nothing notices unless the open's status is
     asserted.
   Reproduce the bad order deterministically (seed the leftover state in `setUp`) instead of
   rerunning until Gradle happens to pick it.

**Adding test classes reorders the suite, so trap 2 detonates on a branch that did not cause it.**
Gradle's discovery order shifts when a package gains a class, and `DispatcherIT` went from running
*before* `AcceptanceIT` to *after* it purely because story 10.8 added
`studio/compile/CompilePipelineIT`. The dispatcher then claimed `AcceptanceIT`'s 20 queued rows and
`asecondDispatchPassDoesNotPickUpADispatchingRow` failed on a branch whose runtime code creates no
ledger row at all. Compare `timestamp` attributes across `build/test-results/test/*.xml` on both
commits to see the reorder; it is faster than reading the test.

**Why:** all of these were found only by running `./gradlew test` end to end after per-class runs
were all green — worth budgeting one full-suite run before declaring a story done. And when the
suite is red, check out the merge base into a throwaway worktree and run the same narrow selection
there: it separates "my code broke it" from "my class list exposed it" in about five minutes.

**How to apply:** when a backend IT fails only in the suite, check these before suspecting the
production code. Related: [[two-context-one-database]], [[backend-check-baseline]].
