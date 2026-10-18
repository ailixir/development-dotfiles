# STUDIO-OBS-015 w6-format01: formatting window, step A (Dex-W6, @dev)

2026-10-16. Single writer in backend/, frontend/, docs/architecture. `--no-daemon` on every Gradle call; no commits; no installs. [V] = ran it and read the output. [I] = inferred.

## Results

| # | Item | Result |
|---|------|--------|
| 1 | `git apply --check -p0` then apply `frontend-contract-diagnosis01/fix.patch` (4 files) | [V] applied |
| 1 | `frontend` vitest full run (`pnpm exec vitest run`, default workers, host load ~4) | [V] 56/56 files, **701/701**, exit 0 (`fe-vitest.json`, `fe-vitest.log.gz`) |
| 1 | `type-check` / `lint` | [V] exit 0 / exit 0, 0 errors, 302 warnings (I read only the tail, which is `no-explicit-any`; not checked whether any are in the 4 patched files) |
| 1 | `docs/qa/accessibility/axe-results.json` side effect | [V] was already dirty before the run; sha256 identical after (`51c29bb4...`), so the run did not rewrite it |
| 2 | `StudioScheduleApiIT` @Disabled test (~line 996) | [V] counter-only bump replaced by the same real edit as the live port above it (`steps = ["Go somewhere else"]` plus counter). It is still @Disabled, so it is compile-checked only, not executed |
| 2 | ADR-002 s34 | [V] line 2938 and the s34.2 table row now say 500, each with "1024 when this section was written; superseded 2026-10-16, see the changelog row". I kept the history visible instead of silently rewriting a dated ruling. File: `docs/architecture/ADR-002-internal-contract-surface.md` |
| 3 | `spotlessApply` | [V] exit 0, **96 files** changed (47 main, 49 test), 0 added/removed; list with before/after sha in `manifest.json` |
| 3 | `spotlessCheck` | [V] exit 0 |
| 3 | `compileJava compileTestJava` after | [V] exit 0 |
| 3 | Bytecode neutrality | [V] 1265 classes before and after, same set. 1030 byte-identical, 235 differ in bytes but are identical under `javap -c -p -constants` with constant-pool indices stripped (line-number tables are the only difference). **0 classes differ in code, flags, members or constants.** Baseline = tree after my two edits and before spotless |
| 4 | `spotbugsMain` | [V] exit 0, **0 findings** at HIGH confidence, 676 classes analysed (XML via an out-of-tree init script; the repo build config has no report) |
| 4 | checkstyle | [V] **874 violations in 39 files**: main 40 in 12 files, test 834 in 27 files |

Checkstyle by rule: NeedBraces 555, LineLength 248, Indentation 57, WhitespaceAround 14. No naming, import, modifier or empty-catch hits. This matches the runbook estimate (873) within one.

## Findings to act on

1. **Gradle under-reports `checkstyleTest`.** Its console output and its XML list 786 of the 834 test violations; the XML is cut off mid-element (196 of 332 files) and `test.html` is not written at all. The 48 missing sites are in `support/LegacyV20ConfirmedBaseFixture` (41), `support/GuidedPublicationEvidenceFixture` (4), `ObservedPublicationFixture`, `StudioApiIT`, `StudioAuthorizationIT`. I do not know why [unverified; not investigated]. The inventory therefore comes from the checkstyle 10.18.1 CLI (same jar from the Gradle cache, same `checkstyle.xml`, `config_loc` set), run over `backend/src/main/java` and `backend/src/test/java`. Main matches Gradle exactly (40 = 40); the 786 Gradle test sites are a strict subset of the CLI's 834. Fixers should iterate with the CLI and use Gradle only for the final gate. A final Gradle `checkstyleTest` going green is still the real gate.
2. Runbook s2.1 row 1d lists `checkstyle/{main,test}.html` as receipts. `test.html` will not exist while violations remain.
3. The two ADR-002 edits and the `StudioScheduleApiIT` edit were made before the "before" snapshot, so the neutrality receipt does not cover them. They are one test body (disabled) and prose.
4. SpotBugs found nothing, which closes runbook risk 3 for HIGH confidence on main. The exclude filter is still an empty baseline.

## Partition (`partition.json`)

Effort units: NeedBraces 1, LineLength 1.5, Indentation and WhitespaceAround 3 (restructure sites, bytecode may change and must be listed for Quinn). ReplayIT alone, the other 38 files LPT-packed into four groups.

| Group | Files | Violations | Units | Notes |
|---|---|---|---|---|
| G1 | 1 (`GuidedPublicationReplayIT`) | 276 | 338 | 200 NeedBraces, 60 LineLength, 10 Indentation, 6 WhitespaceAround |
| G2 | 10 | 118 | 201 | holds `GuidedWireContractTest` (36 Indentation) |
| G3 | 10 | 160 | 201 | |
| G4 | 8 | 172 | 200 | holds `GuidedPublicationMigrationTest` (120) |
| G5 | 10 | 148 | 200 | |

Caveat: sizes are by unit weights I chose [I]; Indentation sites in `GuidedWireContractTest`, `SnapshotBasisParityTest` and ReplayIT will take longer than the weight suggests. Never run `-PspotlessIdeHook` formatting on ReplayIT outside Gradle's normal `spotlessApply`; after fixes, run `spotlessApply` then `spotlessCheck` once all groups are done, because gjf can re-wrap braces the fixers add.

## Files in this directory

`manifest.json` (hashes, spotless diff, neutrality), `neutrality.json`, `checkstyle-inventory.json` (per file and rule, with line numbers), `partition.json`, `checkstyle-cli-{main,test}.xml` (raw, paths relative), Gradle logs (`spotlessApply.log`, `spotlessCheck.log`, `compile-*.log`, `static.log`, `checkstyle.log`, `spotbugs.log`), frontend logs. Private paths are redacted.
