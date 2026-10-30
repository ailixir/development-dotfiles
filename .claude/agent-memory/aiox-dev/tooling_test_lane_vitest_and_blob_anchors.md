---
name: test-lane-vitest-and-blob-anchors
description: WI-3 test-lane.cjs vitest mode semantics (file::title substring, empty title = whole file, named skipped = red) and pure-node git blob ids equal to git hash-object
metadata:
  type: reference
---

`docs/qa/evidence/adr-sc-007/wi-3/tools/test-lane.cjs vitest --lane ID --json FILE --must-run "path/file.test.ts::title substring" ... -- <command that writes the vitest JSON report>`:
the entry file is matched with `endsWith`, the title is a substring of the assertion `fullName` (describe + title), every hit must have status `passed` (a skipped named test is red), an empty title (`file::`) means every test of the file, `::` cannot appear in a title. The global pending count is NOT checked, so the default tier's 63 intended skips do not matter. The inner command must use `--reporter=json --outputFile=FILE` (WI-3's own checks do).

Gradle mode deletes `TEST-*.xml` in `--results` first, then requires each `--must-run FQCN[=MIN]` to have a result file with skipped = failures = errors = 0, and each `--must-method FQCN#PART` to have one passed case whose name contains PART.

A git blob id is `sha1("blob " + size + "\0" + bytes)`; computing it in node matched `git hash-object` on 169 files, so checks can anchor files to HEAD without spawning git (tools/blob-anchors.cjs in the WI-4 scratchpad).

JUnit `timestamp` in Gradle XML is UTC; suite end = timestamp + `time`.

Java text blocks put page HTML/JS at column 2, which fools a "method declaration at 2-space indent" regex; skip lines between `"""` pairs and require a non-space after the two spaces.
