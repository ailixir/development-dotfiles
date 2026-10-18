# STUDIO-OBS-015 w6-checkstyle-G2 (Dex, @dev)

2026-10-16. Scope: partition group G2 only (10 files: 4 main, 6 test). No Gradle, no commits, no config or suppression changes. [V] = ran it and read the output.

## Result

| Check | Result |
|-------|--------|
| checkstyle 10.18.1 CLI, `backend/config/checkstyle/checkstyle.xml`, G2 files | [V] 118 violations before (NeedBraces 72, Indentation 36, LineLength 6, WhitespaceAround 4), **0 after** |
| google-java-format 1.22.0 `--dry-run --set-exit-if-changed` on G2 files | [V] exit 0 (gjf `--replace` was run on G2 files only after each edit pass) |
| Bytecode, G2 files compiled before vs after (javac 21, `-g -parameters`, classpath = w6 `classes-after`) | [V] 19 classes each, same set. 7 byte-identical, 11 differ in bytes only (identical under `javap -c -p -constants`, constant-pool indices stripped), **1 differs: `GuidedWireContractTest`** |
| Gradle `checkstyleTest` / `spotlessCheck` | not run (instruction: no Gradle). Final Gradle gate belongs to the lead |

## What changed, by rule

- **NeedBraces (72)**: braces added around the single-statement bodies, by a small token-aware script (scratchpad, not in repo) run on the exact checkstyle line:col sites, then gjf. Main files read in full against the diff; test files covered by the bytecode-equivalence receipt above.
- **LineLength (6)**: SQL / JSON string literals split with `+` at points that do not cut an escape; concatenation of constants is folded by javac, so the constants are identical (confirmed by the bytecode comparison for `GuidedPublicationRepository`, `GuidedTranslationStore`, `IncrementalIdentityTest`, `GuidedBootstrapPlanHistoryIT`).
- **WhitespaceAround (4)**: the two `(execution, validation) -> {}` lambdas (two sites each reported) now have a body containing the comment `// intentionally empty`. Bytecode of the lambda is unchanged.
- **Indentation (36)**: all in `GuidedWireContractTest.outcomeCases()`. Cause [V, reproduced on a 20-line scratch file]: with `braceAdjustment=2` Checkstyle expects every standalone `{ ... }` block at indent+2, while google-java-format places it at indent+0, so no formatting of a bare block can satisfy both. The 18 bare blocks were extracted into three private helpers in the same class (placed above `outcomeCases()`):
  - `addAbsentFieldCase(cases, controls, control, pointer, field, id)` replaces 13 `REQUIRED-*` blocks
  - `addDiagnosticLedgerCase(cases, controls, id, state, outcomeCode, dispatchCount)` replaces the 4 `DIAG-*` blocks
  - `addHybridCase(cases, controls)` replaces the `HYBRID` block
  Call-site arguments were extracted from old and new source by regex and compared: 13/13 and 4/4 tuples identical and in the same order; the case insertion order into `cases` is unchanged.

## For Quinn

- **Bytecode is not neutral for one class**: `GuidedWireContractTest.class` gains 3 private methods and the `outcomeCases()` body changes shape. Test code only; the sequence of `OutcomeCase` values produced is intended to be identical. [Inferred from the argument comparison and the unchanged call order; the test was not executed in this lane.]
- No main-code class changed in bytecode (all 4 main classes are byte-identical or identical under javap with constant-pool indices stripped).
- sha256 before/after for every file: `manifest.json`.
