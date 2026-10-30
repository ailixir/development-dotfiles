---
name: gotcha-isolated-builddir-cohort
description: Relocating Gradle's build dir with an init script breaks retain*GuidedCohort/requireFreshGuidedPartitions because the joined ITs write to the literal relative path build/; use a scratch tree copy for a full `check`
metadata:
  type: feedback
---

An init script that sets `layout.buildDirectory` elsewhere (the lane A recipe, `scratchpad/flexA/build-dir.init.gradle.kts`) is fine for plain `test --tests` runs but a `check` that includes GuidedPublicationReplayIT fails at `retainOriginalGuidedCohort` / `retainIncrementalGuidedCohort` ("Missing/ambiguous real ... JOIN lifecycle export"): the IT and `GuardDecisionTally` write `Path.of("build", "guided-cohorts"|"guard-tally", ...)` relative to the JVM working dir (`backend/`), while the build script reads `layout.buildDirectory`. Those tasks are not product failures in that setup, and the JVM still writes into the live `backend/build/guard-tally` and `guided-cohorts`.

**Why:** shared worktree, peers' watchers clobber `backend/build`, but a relocated build dir silently breaks the cohort gate.
**How to apply:** for a full gate rsync `backend/`, `helm-chart/`, `docs/` (symlink `docs/qa/evidence`, tests only read it) into `scratchpad/<x>/tree/`, symlink `studio-runner`, and run `check --continue` there with a copy of `.aiox/sdc/STUDIO-OBSERVED-ORCH/gradle-locked.sh` whose `cd` points at the copy (keeps the shared lock). Re-running a few classes with `test --tests` overwrites `build/jacoco/test.exec`, so copy `build/test-results` first if you need the earlier evidence. Without ReplayIT in the run, the `guidedIncrementalTest` task fails "No tests found" (expected).
