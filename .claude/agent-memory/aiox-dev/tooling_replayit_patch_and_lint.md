---
name: tooling-replayit-patch-and-lint
description: Building p0 patches for the 22k-line ReplayIT and linting them without Gradle: histogram diff, checkstyle CLI recipe, gjf/checkstyle switch-expression conflict
metadata:
  type: reference
---

These are lessons from writing the STUDIO-OBS-015 B1bcd patch on 2026-10-16. It added about 2,800 lines to `GuidedPublicationReplayIT`.

**Making the patch**
- **Use a histogram diff.** Plain `diff -u` on a large insertion merged unrelated edits into one hunk (-2744/+5598). Run `git diff --no-index --histogram base new`, then replace the header with `--- <repo path>` / `+++ <repo path>` so `git apply -p0` works. Prove the patch two ways:
  - `git apply --check -p0` against the live file;
  - apply it to a scratch copy and compare the sha256.
- **Anchor edits by text.** Use a `build.py` with exact-once string anchors. Do not anchor by line number; parallel lanes edit the same file.

**Checkstyle CLI outside Gradle**
- Run `com.puppycrawl.tools.checkstyle.Main` with `-c backend/config/checkstyle/checkstyle.xml` and `-p` pointing to a file that sets `config_loc`.
- Classpath: the checkstyle 10.18.1 jar plus the newest cache versions of antlr4-runtime, picocli, guava, failureaccess, commons-beanutils, commons-lang3, Saxon-HE, xmlresolver, reflections, javassist, commons-collections and httpclient5/core5.
- You also need **spring-jcl** for commons-logging: the commons-logging cache directory has no jar.
- The ReplayIT base already has about 1010 violations. Compare base vs patched and filter to the added lines (`-U0` hunk ranges).

**gjf vs checkstyle**
- gjf formats `x = switch (k) { case ... }` as an assignment RHS. Checkstyle `Indentation` then flags the `case` lines.
- Fix it by moving the switch into a method that does `return switch ...`.
- Do not run gjf `--lines` on lines inside the old non-gjf `/flow` or `incrementalTenModel` statements. It reflows the surrounding pre-existing lines. Hand-wrap those edits instead.

**Production fact:** internal `/plans` success is **202** (`GuidedPlanningController.plan` → `ResponseEntity.accepted()`), not 200.

Related: [[tooling-javac-precheck-outside-lock]], [[tooling-scratch-tree-staged-unit]].
