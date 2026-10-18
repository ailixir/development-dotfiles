# STUDIO-OBS-015 w6-checkstyle-G1 (Dex, @dev)

2026-10-16. Scope: group G1 only, one file: `GuidedPublicationReplayIT.java`. No Gradle, no commits, no config or suppression changes. [V] = ran it and read the output.

## Result

| Item | Result |
|---|---|
| Checkstyle 10.18.1 CLI before | [V] 276 (NeedBraces 200, LineLength 60, Indentation 10, WhitespaceAround 6), matches the w6-format01 inventory |
| Checkstyle 10.18.1 CLI after | [V] **0** (`checkstyle-after.xml`) |
| google-java-format 1.22.0 `--dry-run --set-exit-if-changed` after | [V] exit 0, clean. Run with `--skip-reflowing-long-strings --skip-javadoc-formatting` (Spotless defaults); without those flags the CLI wants to reflow strings even on the untouched baseline, so that is a CLI default and not a drift |
| sha256 | before `e719ed7c...2c98657`, after `5758b8f7...d72c2b` (full values in `manifest.json`) |
| Bytecode | [V] 83 classes before and after; see below |

## What changed

1. NeedBraces (200): inserted `{`/`}` around every non-block `if`/`else`/`for`/`while` body using a javac Tree API scanner (exact body start/end offsets, `else if` skipped), then gjf. 200 sites wrapped, matching the inventory count.
2. LineLength (60): long string literals split with `+` (javac folds constant concatenation, so the constant is identical); the 14 lines inside the JS `"""` text block in `incrementalNativeFaultObserver` were wrapped with the text-block `\<newline>` continuation, which does not change the string value. No literal was edited.
3. Indentation (10, two switch expressions) and WhitespaceAround (6, three `() -> {}`): these conflict with gjf, so restructured:
   - `String code = switch (race) {...}` became `prefixSyncRaceCode(race)` (new private static helper, same arms).
   - `String passwords = switch (page) {...}` became `b2PasswordControls(page)` (new private static helper, same arms).
   - three `() -> {}` setups passed to `b2aFault` became `GuidedPublicationReplayIT::b2aNoSetup` (new empty private static method beside `B2aSetup`).
4. One side effect of braces: an `else if (...)` followed by a comment block and a detached `{` (LeftCurly + Indentation) was fixed by moving the 3 comment lines inside the block, after the `{`.

## Behaviour neutrality

[V] Compiled the pre- and post-edit file with the same javac 21 flags against the existing backend class output and compared `javap -c -p -constants -s` with constant-pool indices stripped (`bytecode-diff.txt`). The only code differences are the items in point 3 (two extracted switches, three lambdas to a method ref). Quinn should list those under the Indentation/WhitespaceAround restructure sites. All ldc string constants are identical. I did not run the IT; it needs Docker/Gradle and Gradle was off-limits.

## Receipts

`checkstyle-before.xml`, `checkstyle-after.xml`, `source.diff` (unified-style `diff` of the file, before to after), `bytecode-diff.txt`, `manifest.json`.

## Caveats

- Final gate remains a Gradle `spotlessCheck` + `checkstyleTest` once all groups are done; I only used the CLIs.
- The Spotless-equivalence of my gjf flags is inferred from Spotless 6.25 defaults, not run through Gradle. The baseline file was clean under the flags before any edit, which supports it.
