---
name: empty-run-is-not-a-result
description: A filtered or scripted test run that executed nothing looks like a result — zsh does not word-split $VAR, and vitest -t is a regex; check the executed count on every falsification row
metadata:
  type: feedback
---

Before recording a falsification row, check that the run **executed the test you meant**: a
non-zero "passed"/"failed" count for it, not "N skipped" or "No test files found".

**Why:** on the 2026-09-17 carry-forward pass, two batches of rows were silently empty.
(1) `npx vitest run -t "(i) the default path-only base: …"` reported `12 skipped` — the `-t` value
is a **regex**, so `(i)` is a group and the name never matched; three squeeze rows "passed" with
nothing run. (2) The Bash tool's shell is **zsh**, which does **not** word-split `$F`, so
`F="a.test.ts b.test.ts"; npx vitest run $F` passed one bogus path → "No test files found", and a
grep-filtered log line came out empty for five ENV-2 rows. Both looked like data until read closely.

Two more from story 10.30 (2026-09-17), both of which looked like results: **`WATCH` is a zsh special
scalar** (tied to `watch`), so `WATCH=(--tests …)` aborted a whole mutation-table script before its
first row — name arrays something else. And a `shasum -a 256 -c` file written with **relative paths**
reported "FAILED" for untouched files, because the Bash tool's cwd resets to the primary checkout, not
the worktree — `cd` into the worktree (or store absolute paths) before checking a restore.

A Gradle instance from the 2026-09-17 co-run harness: an `@EnabledIfEnvironmentVariable`-gated
class run **without** the variable produced `BUILD SUCCESSFUL`, **gradle exit 0**, and a JUnit XML
of `tests="4" skipped="4"`. Gradle prints no tally when green, so nothing on the console said the
class had not run. Read `tests` vs `skipped` out of `build/test-results/test/TEST-*.xml` and treat
`tests == skipped` as a failure — an exit code cannot distinguish "every leg passed" from "the
class declined to run".

**How to apply:** escape regex metacharacters in `-t` (or use `.` for punctuation); pass multiple
paths with a zsh array `F=(a b); … "${F[@]}"`; and make the row's recorded output include the
`Tests …` summary line so an empty or all-skipped run is visible in the table itself. Related:
[[skip-asymmetry]], [[mutation-table-is-tree-specific]], [[falsify-from-the-unfavourable-side]].
