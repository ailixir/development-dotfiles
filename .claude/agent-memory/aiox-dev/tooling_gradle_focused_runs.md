---
name: tooling-gradle-focused-runs
description: Focused backend Gradle runs here - zsh no word-split, copy XML while lock held, per-file spotless, out-of-tree init scripts for exclusions and probes
metadata:
  type: project
---

Things that bit STUDIO-OBS-012A lanes (Lane K 2026-10-12; R1/R2 2026-10-13):

1. The zsh Bash tool does not word-split `$VAR`, so `gradle test $T` with `T="--tests A --tests B"` passes one bogus task name. Build the args in a bash script with an array (`ARGS+=(--tests "$c")`).
2. `backend/build/test-results/test/` keeps XML only for classes in the latest `test` run. Summarize a run's XML before starting the next, or the counts are gone.
3. When another lane owns a test file that no longer compiles (e.g. GuidedPublicationReplayIT during a package move), exclude just that file with an out-of-tree init script passed as `-I <scratchpad>/x.init.gradle.kts` (`sourceSets.test.java.exclude("**/File.java")`). Do not edit the file or build.gradle.kts. Record the exclusion in evidence.

4. Another agent's run can wipe `build/test-results/test` right after the lock is released. Copy the XML while the lock is held: init script registers a `Copy` task (`from(layout.buildDirectory.dir("test-results/test"))`, `mustRunAfter(test)`) and `test.finalizedBy` it. `from(t.reports.junitXml.outputLocation)` fails ("does not have a task associated").
5. Format only your own files: `gradle-locked.sh spotlessApply -PspotlessIdeHook=<abs path>` (one file per call). Repo-wide spotlessApply touches other lanes.
   - The IDE hook formats the WHOLE file. GuidedPublicationReplayIT is not google-java-format clean (925 lines over 100 columns at f279), so the hook rewrote about 420 KB of it on 2026-10-16. Never run the hook on ReplayIT. Keep its edits hand-formatted, and diff against the frozen evidence copy before handing off.
   - GuidedPublicationAuthorityIT is not gjf-clean either (e622 base: 230 gjf diff lines, 59 lines >120 cols). To format only new members without Gradle: put them in a scratch `class Wrapper {}` in the same package, run the gjf 1.22 CLI on it, and paste the members back. Then check that the file's tail is unchanged under gjf (B3a source01, 2026-10-16).
6. An out-of-tree diagnostic test can be compiled in via an init script that adds a scratch dir to `sourceSets.test.java.srcDir(...)`; keep it out of backend/src.

7. Negative control on product code without editing the shared checkout (dex-r9, 2026-10-13): an init script compiles the old classes into scratch (`JavaCompile` task, classpath = main.compileClasspath + main.output.classesDirs), `Sync`s a scratch copy of main classes with those classes swapped, and sets `Test.classpath = files(copy) + classpath.filter { it !in mainDirs }` inside `afterEvaluate`. Guard with `name == "checks-backend"` because init-script `allprojects` also reaches buildSrc. Do NOT exclude/add sources on `compileJava`: that attempt left the two .class files missing from the shared build/classes.

**Why:** concurrent lanes share one checkout and one serialized Gradle lock; the lead forbids edits outside lane ownership.

**How to apply:** use these for any focused backend run during multi-lane work. Related: [[tooling-gradle-check-duration]], [[tooling-deletions-and-baselines]].
