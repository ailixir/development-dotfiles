---
name: tooling-verify-runner-dist-wildcard
description: backend `test` depends on verifyRunnerDist; any --tests pattern with `*` selects it and a stale runner dist fails the run in 8 s with 0 tests; list classes (nested as Outer$Inner) instead
metadata:
  type: project
---

`backend/build.gradle.kts` (I lane, 2026-10-18): `tasks.test` depends on `verifyRunnerDist`, which fails when `studio-runner/dist/main.js` is older than ANY file under `studio-runner/src`. It is skipped only if every `--tests` pattern has no `*` and names none of the runner-spawning ITs (`GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT`, `GuidedPlanningIntegrationTest`, `GuidedPublicationReplayIT`, `GuidedFocusMutationJoinedIT`, `GuidedAuthoredEchoJoinedIT`, `ObservedCoRunIT`).

**How to apply:** while the F-merge dist rebuild is pending (any runner `src` edit makes dist stale), run focused backend tests with explicit class names, no wildcard. A nested JUnit class is its own filter entry: `--tests 'pkg.Outer$Inner'` (single quotes in bash). `Outer` alone does not pick up the nested classes. The collector refuses to reuse a label, so a failed attempt burns it (use `-green02`).

Also from the same lane: `ConnectorScope`-style servlet filters are cheap to pin with `MockHttpServletRequest` (`setLocalPort`, `setServletPath`); a driver script that chains `with-gradle-lock.py` runs should be killed at the bash-loop level first (kill the driver and run-mut shell, then let a running `mutate_multi.py` restore its file) and the file sha checked after.
