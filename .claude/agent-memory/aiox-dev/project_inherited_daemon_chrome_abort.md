---
name: inherited-daemon-chrome-abort
description: Guided bootstrap fails (CONTEXT_PENDING -> FAILED, contextRefusal:307 UNKNOWN_OUTCOME) because Chrome for Testing SIGABRTs under the inherited Codex-started Gradle daemon 22246; --no-daemon fixes it
metadata:
  type: project
---

Since 2026-10-16 (R1 attempt07), every guided bootstrap in GuidedPublicationReplayIT failed in about 1-3 s. The session ended FAILED at `bootstrapPhase CONTEXT_PENDING` after one SOURCE_PLAN, with `finalize-exception` at `GuidedRunnerClient.contextRefusal:307`. The cause: Chrome for Testing aborts (SIGABRT, `kill EPERM`) right after `launchPersistentContext`.

- `~/.gradle/gradle.properties` pins `org.gradle.java.home=~/.jdks/...`, so every `./gradlew` (including the collector's) reuses daemon PID 22246.
- That daemon was started 2026-10-14 by a Codex CLI session (`CODEX_*` env), has PPID 1, and has no `SECURITYSESSIONID`.
- Its descendants cannot launch Chrome. The same test under `--no-daemon` launches fine (4/4 vs 4/4).
- The exact macOS mechanism is inferred, not proven.

**Why:** the failure looks like a runner or production regression (context refusal, `CONTEXT_LOST`), and `guided.log` is empty because `GuidedOwnership.context` swallows the error.

**How to apply:**
- Pass `--no-daemon` after `--` in `run-backend-tasked.py`.
- Never signal 22246 (handoff rule).
- To see a swallowed runner error, use a scratch ReplayIT copy with `node --import <register.mjs>` and a `module.register` load hook that rewrites the dist `ownership.js`/`browser.js` catch blocks in memory. Recipe: `r1-diagnosis01/review.md`.

Related: [[tooling-replayit-diagnostics]], [[host-port-and-chromium-flakes]].
