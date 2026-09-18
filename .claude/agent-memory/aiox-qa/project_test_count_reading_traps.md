---
name: test-count-reading-traps
description: Two ways a test result in this repo reads as the opposite of what happened — Gradle `-i` suppresses PASSED lines, and a single-file runner vitest run always exits 1 on coverage
metadata:
  type: project
---

Two traps that make a green run look red or an uncounted run look counted. Both were hit live during
the 10.19 gate; both are invisible unless you know to look.

**1. `./gradlew test -i` silently emits zero `PASSED` lines.**
`backend/build.gradle.kts` declares `testLogging { events("passed", "skipped", "failed") }`, which
configures Gradle's **LIFECYCLE** container only. Passing `-i` selects the **INFO** container, whose
Gradle default event set is `[FAILED, SKIPPED]`, and the build never configures a `testLogging.info`
block. Controlled proof (same class, same `--rerun-tasks`, only the flag differing): **3 `PASSED`
lines without `-i`, 0 with `-i`**, tests demonstrably executing in both.

**2. A single-file `npx vitest run <file>` in `studio-runner/` exits 1 even when every test passes.**
Coverage is enabled in `vitest.config.ts` with global thresholds (85/85/80/80). One file alone can
never meet them, so `$?` is 1 on a fully green run — observed on 20 consecutive runs, 18 of which
were green. `grep -E 'FAILED$'` additionally matches `> Task :test FAILED`.

**Why:** Epic 10 had two agents report different `PASSED` counts for the same package and both were
right; the `-i` flag was the entire difference. A protocol scripted on `$?` would have read 20
failures out of 20 green runs.

**How to apply:** Count by aggregating `backend/build/test-results/test/*.xml` (assert the suite
count is non-zero and no file is zero-length) — it is invariant to log level, to `-i`, and to
Gradle's habit of printing "N tests completed" only on failure. Treat console event lines as
corroboration only, and never use exit code as the instrument for a narrow run. See
[[qa-review-verification-depth]] and [[backend-testcontainers-stall]].
