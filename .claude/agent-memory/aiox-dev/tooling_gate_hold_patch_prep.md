---
name: tooling-gate-hold-patch-prep
description: Preparing contracts/v3 + Java + runner patches while a gate hashes the tree - Node epoch replica, generator in a sandbox, publication-fixtures bundle pin, tsc/vitest-shim overlays
metadata:
  type: project
---

Recipe from the MODEL-SIZING and catalog-producer prep (2026-10-18, G9 running, repo paths frozen). Receipts: `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/dex-prep/`.

- **Regenerate without touching the tree.** `tools/build-studio-observed-schemas.cjs` is `JSON.stringify` of the v3 schemas (deterministic). Copy it plus all `*.schema.json` into a scratch root with empty target dirs, edit the schema there, run it, and ship the four outputs in the patch. `--check` on the real tree is read-only.
- **Schema epoch without Java.** A Node replica of `GuidedContracts.schema()/expand()/canonical()/hash` (`dex-prep/epoch-probe.cjs`) reproduced all four constants on the unmodified tree, then gave the new `SESSION_SCHEMA_EPOCH`. Only session reaches `limits`; replay-validation/ledger/observation do not move.
- **A limits (or any packaged-bundle) edit moves `publication-fixtures.json`.** `build.schemaBundleHash` = hash(`observedSchemas.json`) appears 108 times, and `replayGrant.buildHash` = hash(build) twice; nothing else is sealed over the build (checked by hashing every ancestor). `tools/check-studio-observed-contracts.cjs:890` fails otherwise. Rulings that say "fixtures stay valid" miss this. `dex-prep/repin-publication-fixtures.cjs` re-pins by string replace and reproduced the hand patch byte for byte.
- **Run the contract checker on an overlay.** Symlink the real v3 files, copy the changed ones, copy `tools/*.cjs`, symlink `node_modules`, and add the four generated runner outputs (the checker calls `generator.check()`). 340 MB peak, ~10 s. A negative control (old fixture, new schemas) proves the pin matters.
- **Typecheck and logic without vitest.** `tsc --noEmit` on an overlay (symlinked `src`, `node_modules`, `test/helpers`; real new files) works. Logic: a ~40-line vitest shim on `node --experimental-strip-types` against `dist/` functions, plus hand mutations of the new code. Not a vitest run; label it so.
- **Hard-coded near-limit numbers hide in tests**: `GuidedPlanningIntegrationTest` had `31000 - before` ("1,000 under 32,000"). Grep for neighbours of a changed limit (`31000`, `127000`, `28672`), not only the limit itself.
- **Patches against a dirty tree**: `diff` per file with histogram, header rewrite to `a/ b/`, `git apply --check` from the repo root, and a scratch apply compared by sha256. `cp` paths relative to the wrong cwd silently copied the originals once - run the sha compare from inside the files dir.
- gjf 1.22 pre-check via `scratchpad/gjf.sh`; new hunks in the non-clean `GuidedPublicationReplayIT` go through a wrapper class.

**Why:** the lead forbade Gradle/vitest/builds during the gate, and the ruling's change list was incomplete.
**How to apply:** any contract-moving ruling prepared while another gate holds the tree. Related: [[tooling-schema-epoch-overlay]], [[tooling-contract-lane-gotchas]], [[tooling-scratch-tree-staged-unit]].
