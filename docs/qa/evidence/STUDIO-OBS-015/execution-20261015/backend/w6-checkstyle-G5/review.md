# STUDIO-OBS-015 w6-checkstyle-G5 (Dex, @dev)

2026-10-16. Owner of partition group G5 only (10 files: 4 main, 6 test). No Gradle, no commits. [V] = ran it and read the output.

| Item | Result |
|---|---|
| checkstyle 10.18.1 CLI (Gradle-cache jar, `backend/config/checkstyle/checkstyle.xml`, `-Dconfig_loc`) | [V] before **148** (LineLength 52, NeedBraces 83, Indentation 11, WhitespaceAround 2; matches partition.json), after **0** |
| google-java-format 1.22.0 `--dry-run --set-exit-if-changed` on the 10 files | [V] exit 0 (spotless-equivalent clean) |
| Bytecode neutrality (javac 21, `-g:none`, orig vs fixed G5 files, rest of tree identical) | [V] 19 classes: 18 byte-identical (all 4 main classes incl. nested), 1 differs (below) |
| sha256 before/after | `manifest.json` |

## Edits by rule
- NeedBraces (83): braces inserted by a javac-AST tool at the exact reported constructs, then gjf `--replace`. Bytecode identical.
- LineLength (52): over-long single-line string literals split into `"a" + "b"` (javac folds these to the same constant; escape sequences never split; a literal used as a method receiver would have been parenthesized). Bytecode identical. One text-block line (`StudioApiIT` ~line 69) was split with the text-block `\` line continuation; value unchanged, bytecode identical.
- WhitespaceAround (2): `GuidedSourceSnapshotRepository` `csi -> {}` became `csi -> { /* no authorization hook */ }` (gjf lays it out multi-line). Comment only, bytecode identical. This is a main-code file.
- Indentation (11): `SnapshotBasisParityTest` switch expression (checkstyle vs gjf conflict) extracted into `private static JsonNode alteredEvidenceValue(String field)` with `return switch`; same arms and values. **The only bytecode change: one added private static method in a test class** (Quinn: list as restructure site).

## Caveats
- Verified with the CLI and javac, not Gradle. The Gradle `checkstyleTest`/`spotlessCheck` gate remains for the end of the window.
- Compile was a standalone javac over a copy of the tree (classpath = latest jars in the Gradle cache), not the Gradle build; other fixers' concurrent edits were in that copy identically for before and after.
- No tests were run.

Files: `manifest.json`, `checkstyle-cli-before.xml`, `checkstyle-cli-after.xml`.
