---
name: tooling-flex-lane-a-backend-recipes
description: STUDIO-FLEX-001 Lane A (backend allowed domains) - isolated Gradle build dir + project cache dir, gjf CLI list trap, harness env keys the runner now requires, ReplayIT vs the V27 proof lane
metadata:
  type: project
---

Done 2026-10-25 (backend AllowedDomains, V28, deployment capacity cap, observe POLICY_DENIED -> ORIGIN_NOT_ALLOWED).

- **Shared `backend/build` gets clobbered** by other sessions' `gradlew -t classes` watchers and bootRun. Run Gradle with `-I <init>` setting `layout.buildDirectory` to a scratch dir AND `--project-cache-dir <scratch>/pcache` (shared `.gradle` executionHistory made main classes vanish mid-run, NoClassDefFoundError). Keep `gradle-locked.sh` for the lock. `-x verifyRunnerDist` only while Lane B's dist is stale.
- **zsh does not word-split a file-list variable**: pipe lists through `xargs` into the google-java-format CLI (1.22.0 jar + guava 33.3.0-jre + failureaccess, `--skip-reflowing-long-strings`, jdk.compiler add-exports). It reproduces spotless exactly, including on GuidedPublicationReplayIT.
- **Runner-spawning test harness must set** `STUDIO_RUNNER_ALLOWED_DOMAINS` and, with guided on, `STUDIO_RUNNER_GUIDED_CAPACITY` (exit 78 CONFIGURATION_REJECTED otherwise). ReplayIT builds its own guided env, its ordinary launcher needs `allowedDomains:[...]` in `createChildBrowserLauncher`.
- **Read grant id** = sha256 of the whitelist ENTRY (not the origin); `ObservedReadProfile.ruleId(url)` finds the entry in `TestDomains.ENTRIES`.
- **GuidedPublicationReplayIT** is concurrently edited by the V27 learn-proof lane (another session): publication queues an AFTER_LEARN proof execution, so `dispatchOnce()` returns 2 and the class cascades red. Not Lane A. Its formatting violations at ~5680 are theirs.
- Fixture sessions use `MutableClock` in 2026-10; budget counts use the DB clock, so a capacity test must set `clock.now = Instant.now()`.
