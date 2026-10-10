---
name: verification-run-budgets
description: Measured wall-clock and load behaviour of the Studio verification suites on this host (2026-10-09); which runs fit a 10-minute bound and which do not
metadata:
  type: project
---

Backend `./gradlew test --tests 'com.citi.put.checks.studio.*'` does NOT fit a 10-minute bound on this host: at 14 min it had passed 1350 tests across 141 classes and was still running (killed, 0 failures seen). `tools/corun.sh --skip-build` (StudioCoRunIT, 11 legs, real API + real runner + real Chromium) finishes in ~1 min and is the highest-value single integration check. Runner fixtures tier (Chromium) ~4 min; runner default tier ~5 s; frontend full vitest ~1 min; frontend tsc ~6 s.

**Why:** the review brief capped each run at ~10 min; the backend Studio package grew past that after the OBS-001..006 wave (guided/* tests). Running Gradle concurrently with frontend vitest pushed 1-min load to 23 — the repo's own rule (closure plan §6) is one Gradle at a time, load < 5, JUnit-XML counts not exit codes.

**How to apply:** for bounded QA passes, run corun.sh + runner tiers + frontend suite; for the backend, pick named classes (`--tests '*RecoveryIT' ...`) or run the full package in the background with no bound and aggregate `backend/build/test-results/test/*.xml` afterwards (stale XMLs from earlier runs persist — check mtimes). Vitest 1.6 in frontend/: do not pass `--poolOptions.threads.maxThreads` alone (tinypool min/max conflict → "no tests", exit 1). zsh: quote `--include='*.java'` globs.
