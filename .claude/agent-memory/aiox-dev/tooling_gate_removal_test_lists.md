---
name: tooling_gate_removal_test_lists
description: Removing a backend gate with ReplayIT cases - build.gradle.kts and ReplayIT carry hard-coded test-method name sets; targeted ReplayIT runs work; GuidedBridgePlannedIT lives in guided.session
metadata:
  type: reference
---

When deleting a `@Test` in `GuidedPublicationReplayIT` or a class in `runnerSpawningTestClasses`, also drop its name from
`backend/build.gradle.kts` (`joinedDefaultMethods`, `joinedAddedLowMethods`, `runnerSpawningTestClasses`) and from the
in-file `SINGLETON_METHODS` / `INCREMENTAL_METHODS` sets, or the lane filters match nothing.

- `./gradlew test --tests '<pkg>.GuidedPublicationReplayIT.<method>'` runs a single joined case in ~2 min when `studio-runner/dist` is fresh (Docker + Chrome present). No need for the full lane.
- `./gradlew spotlessApply` only touches dirty files in this worktree; safe even with ReplayIT edited.
- `GuidedBridgePlannedIT` and `GuidedPlanningIntegrationTest` are in package `...studio.guided.session` although the files sit under `guided/bridge` and `guided/translation`; a wrong `--tests` package silently selects nothing.
- Script-assisted deletion that worked: balanced-paren arg dropper for constructor signature changes (applied across ~30 test files), then compile to find the remainder.
