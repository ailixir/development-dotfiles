---
name: tooling-obs009-lane-i-scratch-emit-recipe
description: Run the folded-runner Java ITs before the F-merge dist rebuild - scratch tsc emit + OBS009_RUNNER_DIST + init-script class swap; main.js wrapper trap; harness exit-status race; gjf needs JDK 21 path
metadata:
  type: project
---

From STUDIO-OBS-009 W2 lane I (2026-10-18). Recipes are in `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/i/w2/recipes/`.

- **Scratch emit instead of waiting for the dist rebuild.** Copy `studio-runner/{dist,scripts,package.json}` into a scratch root, symlink `node_modules`, `package-lock.json`, `Dockerfile`, `.nvmrc`, `fixtures`, run `node_modules/.bin/tsc -p tsconfig.build.json --outDir <root>/dist`, then `node scripts/write-runtime-versions.mjs` (it needs those symlinks), delete stale `dist/run/guided{Main,Config,Shutdown}.*`. Run the ITs with env `OBS009_RUNNER_DIST=<root>/dist` and `-x verifyRunnerDist`, raw `./gradlew` inside `with-gradle-lock.py`, copying `build/test-results/test` while the lock is held. It is non-credited and does not touch `dist`.
- **ReplayIT against a scratch dist:** its `../studio-runner/dist` paths are hard-coded, so copy the class to a scratch srcDir under another file name (package-private class, name may differ), sed the path, and add an init script that excludes the original and adds the srcDir (`java.exclude(...)`, `java.srcDir(...)` in `afterEvaluate`). One ordered case (`...Order(1)` learning + two ordinary runs) takes about a minute.
- **FQCNs:** `GuidedBridgeIntegrationTest`, `GuidedBridgePlannedIT` and `GuidedPlanningIntegrationTest` are all `package ...guided.session` although the files sit in `bridge/` and `translation/`. A wrong `--tests` name only fails after the lock wait.
- **`main.js` starts itself only if `process.argv[1]` is its own file** (`main.ts:355`). Any wrapper must `import {main}` and call it (`RunnerProcessHarness.mainInvocation`).
- **The runner wipes `STUDIO_RUNNER_SCRATCH_DIR` at every start and defaults it, and the object store, to fixed `/tmp` paths.** Always give a test instance its own.
- **Harness exit-status race:** on macOS the handle can report a SIGTERMed process gone (zombie rule) before the JDK reaper has the exit status; `teardown` must `process.waitFor(...)` before reading `exitValue`, or `assertCleanExit` fails with "exit code null" in a few percent of cases.
- **gjf for a copy:** `java` on PATH is 11; use `~/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home/bin/java` with the `--add-exports` set, `--skip-reflowing-long-strings`; the repo's Java files were gjf-clean, so formatting a copy and copying it back changes only your hunks (including ReplayIT).
- **Gradle Kotlin DSL:** inside `build.gradle.kts` `java.time.X` resolves against the `java` extension; use plain millis or a top-level import. `--tests` is readable from `gradle.startParameter.taskRequests` (the internal `commandLineIncludePatterns` is not public API).
- **Mutation testing found a redundant guard:** `assertCleanExit` ignoring `escalatedToForce` stayed green until a report with exit code 0 and `escalatedToForce` was constructed directly. Test records directly when a real process cannot produce the combination.

**Why:** these cost a red/green round each. **How to apply:** any lane that needs the folded runner or a guided IT before F-merge. Related: [[tooling-obs009-w2-backend-lane-recipes]], [[tooling-gradle-focused-runs]], [[tooling-javac-precheck-outside-lock]].
