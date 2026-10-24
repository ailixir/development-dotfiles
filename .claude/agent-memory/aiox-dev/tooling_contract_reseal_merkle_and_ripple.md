---
name: tooling-contract-reseal-merkle-and-ripple
description: Re-baselining publication fixtures after an obligation/schema shape change - Merkle hash rewrite recipe, derive-based checks, and the test ripples a required field causes (round 057 scopeIntent)
metadata:
  type: project
---

Round 057 (2026-10-23) added the required-nullable `scopeIntent` to every plan obligation. Scratch tree `scratchpad/dex-r057/tree` (patches under `G/round-057/qualified-impl/`).

**Fixture reseal (the hard part).** `publication-fixtures.json` holds ~770 obligations and hundreds of content-addressed hashes (translationHash, basisHash, publicationEvidenceHash preimage, artifact/replayPolicy hashes, receipt `receiptHash`, vector `sha256`). Do NOT hand-chase the checker one failure at a time. Script `merkle-reseal.cjs base tree`: transform base (add field), then iterate to a fixed point: for every container node at the same path, map hash(base node) -> hash(current node); also map the evidence preimage `{version,basisHash,runAuthorizationHash,translationHash,bootstrapHash,sourceManifestHash}` and every self-hash (`xxxHash` = hash(object minus xxxHash)); replace those 64-hex strings in the transformed base; repeat (11-12 rounds). Then refresh `canonicalUtf8Hex`/`sha256`/`canonical` of vector-shaped objects, and mirror `studio-runner/fixtures/observed-reference/*` (manifest.canonicalVectors = vectors file). Schema bundle change also moves `build.schemaBundleHash` (pass `PRE=old:new`). `tools/check-studio-observed-contracts.cjs` then passes. Run the checker/generator from a scratch tree: they resolve paths from `__dirname`.

**Ripples outside the fixtures** (all were found only by a full `gradlew test` + `vitest run`, compare against a BASE run): negative-boundary literals in `studio-runner/test/helpers/incrementalNegativeBoundaries.ts` (rebase by recomputing hashes at each mutation pointer); `ObservedArtifactLowererTest` pins one artifact hash literal; `GuidedContracts.REPLAY_VALIDATION_SCHEMA_EPOCH` (recompute with a temp test that reflects `GuidedContracts.schema(name).getSchemaNode()` and `GuidedContracts.hash`; session/ledger/observation must reproduce their constants); ~20 test builders that create obligations need `.putNull("scopeIntent")`; V23's column adds a `GuidedRuntimeRolePrivilegeIT` ADDED_COLUMNS row + column grant.

**Test helper worth reusing:** `studio-runner/test/helpers/resealBasis.ts` (mutate a copy of a ValidationBasis, re-derive sub-document hashes plus the synthetic policyDecisionHash/operationHash preimages, independent serializer) lets a derive test change an observation without hand-resealing.

**Tooling gotchas:** BSD `patch` corrupts files with 100 KB lines (canonical vector strings): verify and apply with `git apply -p1`. Gradle cache can lose a guava jar mid-session (gjf NoClassDefFoundError): rebuild the gjf classpath from whatever guava jar exists. `verifyRunnerDist` fails the whole run if any `studio-runner/src` file is newer than `dist/main.js`: rebuild (`tsc -p tsconfig.build.json` + `node scripts/write-runtime-versions.mjs`, Node 24.20.0 at `~/.local/share/fnm/node-versions/v24.20.0/installation/bin`) after the last src edit.

Related: [[tooling-gate-hold-patch-prep]], [[tooling-contract-lane-gotchas]], [[tooling-schema-epoch-overlay]].
