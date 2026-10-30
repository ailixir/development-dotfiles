---
name: tooling-shared-build-dir-clobber
description: Other agents' Gradle runs wipe backend/build/classes mid-run (NoClassDefFoundError) and their half-applied edits break compile; run IT batches in an rsync scratch tree
metadata:
  type: project
---

2026-10-25, proof backend lane: another agent applied GOV-001.4 in the same checkout while I tested (contracts, ObservedReplayPins, fixtures changed for ~30 min; main did not compile for ~10 min). Symptoms: whole IT classes red with INVALID_CONTRACT at `ObservedReplayPins.requirements` or "Fixture must declare its governed origins"; later `NoClassDefFoundError` for test support classes because their compile replaced `build/classes` during my run; a "Gradle Test Executor N" suite error.

Recipe that worked: `rsync -a --delete --exclude build --exclude .gradle --exclude .claude backend/ scratch/tree/backend/`, same for `docs/specs/studio-observed-authoring` and `docs/specs/studio`, symlink `studio-runner`, copy `docs/qa/evidence/STUDIO-OBS-015`; then `./gradlew --offline test -x verifyRunnerDist --tests <FQCN>...` there (own build dir, ~9 min for 460 tests). Wait for the live tree to compile first (loop `./gradlew compileJava -q | grep -c error:`) or the snapshot is itself broken. Mutation controls: edit the scratch copy only, restore from the in-memory original in a `finally`.

**How to apply:** when a batch shows classes that passed earlier failing in bulk, check `find backend/src docs/specs -newermt` for foreign edits before debugging your own change.
