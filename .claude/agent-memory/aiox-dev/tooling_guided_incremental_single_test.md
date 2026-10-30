---
name: tooling-guided-incremental-single-test
description: Run one ReplayIT low-lane method via guidedIncrementalTest (plain test finds 0 tests); retain task fails harmlessly; ReplayIT is edited live by other sessions
metadata:
  type: project
---

`test --tests '...GuidedPublicationReplayIT.<method>'` reports "No tests found" for methods in `joinedAddedLowMethods` (build.gradle.kts ~line 140): `tasks.test` excludes them. Run them with `guidedIncrementalTest --tests '<FQCN>.<method>'` (about 2 min, spawns real runner and Chrome).

- `:retainIncrementalGuidedCohort` then fails ("Missing/ambiguous real guidedIncrementalTest JOIN lifecycle export") even when the test PASSED. Read the test line, not BUILD FAILED.
- macOS has no `timeout`; zsh then fails the whole line silently.
- ReplayIT was edited by another session while my run was in flight (stack line numbers drift against the current file). A first run failed at a `cut.entered.await(45s)` isTrue and the identical rerun passed: treat one failure there as flake until it repeats; snapshot the file before the run.

**Why:** found on 2026-10-25 while verifying the async GuidedTranslationCoordinator against `incrementalPrefixRecoveryUsesNextUnconsumedCoordinate` (it uses `b1ReplacementContinue`).

**How to apply:** use for any ReplayIT low-lane singleton; related [[tooling-gradle-focused-runs]], [[tooling-replayit-diagnostics]].
