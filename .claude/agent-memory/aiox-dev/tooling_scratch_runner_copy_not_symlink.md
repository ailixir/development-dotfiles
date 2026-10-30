---
name: tooling-scratch-runner-copy-not-symlink
description: Runner-spawning ITs in a scratch tree need a REAL studio-runner copy on Node 24; a symlinked runner exits 0 with an empty log; GuidedPlanningIntegrationTest is package guided.session; flaky ObservedProfileDriftTest 401 under load
metadata:
  type: project
---

2026-10-26, template-span lane. Recipe for the scratch backend tree (`scratchpad/mt/`: `sync.sh`, `gr.sh`, `gjf.sh`, `init.gradle`):

- `rsync -a` of `backend/` (no build/.gradle), `docs/specs/studio-observed-authoring`, `docs/specs/studio`, and a REAL `studio-runner/` copy (dist, node_modules, src, scripts, fixtures; exclude coverage and test). A symlinked studio-runner makes every runner-spawning IT fail `RunnerStartException: exited before ready: exit 0 (CLEAN)` with a 0-byte runner.log (53/53 red in GuidedPlanningIntegrationTest). Put Node 24 first on PATH in the Gradle wrapper script too.
- `GuidedPlanningIntegrationTest` lives in `guided/translation/` but is package `com.citi.put.checks.studio.guided.session`; a `guided.translation.` FQCN reports "No tests found". Use `--tests '*Name'` or the right package.
- zsh does not word-split `$FILES`: gjf over a list needs a `while read f` loop (dirname got the whole list once). gjf `--skip-reflowing-long-strings` + guava 33.3.0 + failureaccess reproduces spotless; run it on a copy, `diff` against the live file, and only copy back when the diff is inside your hunks.
- `ObservedProfileDriftTest ... publication=false replay=false` answered 401 on the start POST once in a 1036-test batch and passed 4/4 alone: load flake, not a regression.
- Waiter loops: do not `pkill -f "until grep"`; it kills the correct waiter too (exit 144). Use the absolute scratch path, never a `..` path (an unreachable log makes `until grep -q` spin forever).

**How to apply:** any backend IT batch from a scratch copy while the live tree is dirty. Related: [[tooling-scratch-gradle-stale-dist-and-cold-cap]], [[tooling-shared-build-dir-clobber]].
