# STUDIO-OBS-015 w6-checkstyle-G3 (Dex, @dev)

2026-10-16. Scope: only the 10 files of partition group G3 (`w6-format01/partition.json`). No Gradle, no commits, no config or suppression changes. [V] = ran it and read the output.

## Result

| Item | Result |
|---|---|
| Checkstyle 10.18.1 CLI, repo `checkstyle.xml`, over the 10 files | [V] 160 violations before (74 LineLength, 84 NeedBraces, 2 WhitespaceAround; matches the inventory per file), **0 after** |
| google-java-format 1.22.0 `--dry-run --set-exit-if-changed` (reflow of long strings off, as spotless does by default) | [V] rc 0, no file would change. The 10 originals were also clean under the same wrapper before editing, so the wrapper reproduces spotless |
| Bytecode neutrality | [V] compiled the 10 files before and after (55 classes each); `javap -c -p -constants` with constant-pool indices stripped hashes identically (`2adbf642...`). String constants are included, so split literals and the text block fold to the same values |
| sha256 before/after, lines added/removed | `manifest.json` |

I did not run the Gradle `checkstyleMain/checkstyleTest` or `spotlessCheck` gates; those remain for the final pass after all groups finish. [unverified under Gradle]

## What was changed (all behaviour-neutral)

- NeedBraces (84): braces added around single-statement `if`/`else`/`for` bodies (script-assisted, then gjf `--replace`). Includes `GuidedSessionService.java` (main, one `if` at ~1842) and the 83 test sites.
- LineLength (74): string literals split with `"a" + "b"` at a space or comma boundary, never inside an escape, with a `(...)` wrapper whenever the literal was followed by `.`/`[` (none needed in the end). Main: `GuidedPublicationEvidenceRepository.java` SQL at ~836 (two sites). One text block in `IncrementalHashTest` split with a `\` line continuation (the continuation line starts at the block's common indent, so the value is unchanged).
- WhitespaceAround (2): `GuidedServiceTransportFaultIT` field `onEntry = ordinal -> {}` became a lambda with a comment-only body (`// intentionally empty: ...`). gjf would collapse `{ }` back to `{}`, so a comment is what keeps both tools satisfied. Bytecode identical per the javap check.

No names, assertion values or string contents changed. Main files diffs are 6+/3- and 2+/1-; read them directly.

## Caveats

- Neutrality compares against the pre-edit snapshot of these 10 files, compiled against `backend/build/classes` as it stood (other fixers may be editing other files concurrently; those classes were taken from the existing build output, not their live edits).
- Splits make some SQL strings read slightly less naturally in the source; runtime values are identical.
