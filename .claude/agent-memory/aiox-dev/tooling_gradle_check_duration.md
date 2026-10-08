---
name: tooling-gradle-check-duration
description: backend ./gradlew check takes ~10.5 min (1386 tests); exceeds the 600s Bash cap, so run it in background
metadata:
  type: project
---

`cd backend && ./gradlew check` took 10m 31s on 2026-09-23 (1386 tests, Zonky Postgres ITs).

**Why:** the Bash tool's foreground cap is 600 s, so a foreground run gets moved to background mid-way.

**How to apply:** start `./gradlew check > <scratchpad>/check.log 2>&1` with `run_in_background: true`, and do not start another Gradle run until it finishes (serialize Gradle). Count results from `build/test-results/test/*.xml`, not from grepping "FAILED", because some test names contain the word FAILED.
