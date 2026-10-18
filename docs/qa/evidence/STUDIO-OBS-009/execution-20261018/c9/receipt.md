# STUDIO-OBS-009 lane C9 receipt (W1, final)

Author: Dex (@dev). No commit, stash, push or dist rebuild.

## openapi
- Old `b5ecdcad4c5e152d0edde5ad14af1a04438f3d9153b04037ef9ce5bc0ae29244`, final `bbf37fd1f96c0da33bbca6db4c04c94222a44429a4b6f0e33c92dfc59fca02c4`. Operations 44, unchanged. (An intermediate `556b1f97…` existed during the work and is not pinned anywhere.)
- `RuntimeVersions` and `ReportedRuntimeVersions` descriptions per A7 (five public names kept). Two report `runtimeVersions` examples and all nine non-null public `runtime` examples carry the A7 values.
- `startGuidedSession` declares `422`: closed v3 error, `INVALID_CONTRACT`, `retryable false`, `messageCode AUTHORING_REFERENCE_AMBIGUOUS` (IncrementalAuthoringIdentity.java:63-90, :379-382); also `messageCode INVALID_CONTRACT` for an unreadable stored source. Reuses `error.schema.json`.

## Pins
StudioContractTest and confinement.test.ts `BASE_SHA256` = final hash, comment quotes `b5ecdcad…ae29244` -> final. ADR-002 §13 row (one row) quotes `b5ecdcad…ae29244` -> `bbf37fd1…fca02c4`. Op count 44 untouched.

## Mirror (guidedHandlers.ts `hasAmbiguousDeclarations`)
Three reachable backend refusals mirrored; the fourth ("same secretId, different declaration") compares records equal by construction and cannot fire (tested as accepted). Placed after zero-step and revision 409, before the base hints.

## Verify (final state)
| Check | Result |
|---|---|
| build-schemas `check()` | exit 0 |
| `check-studio-observed-contracts.cjs` | exit 0, 7 PASS lines (44 ops, 40 examples) |
| confinement `obs009-c9-confinement02` | 19/19, source and dist stable |
| StudioContractTest `obs009-c9-pins03` | 14/14, source, test input and dist stable |
| FE `src/services/mocks/studio` + `src/components/studio/guided` | 14 files, 597/597 (Node v23.10.0) |
| FE type-check | exit 0 |
| eslint on guidedHandlers.ts, guidedHandlers.test.ts, executionFixtures.ts | exit 0 |
| mutation (mirror line off) | 11 new tests fail, restored |

## Root-authorized additions
1. `tools/check-studio-observed-contracts.cjs`: `'422'` added to the start response set (one line).
2. `frontend/src/services/mocks/studio/executionFixtures.ts`: `replayRuntime` moved to the A7 values with the three tied openapi examples.

## Disclosures
- StudioContractTest.java: I also edited the `POST /guided-sessions` status-set row and its message (needed, same file as the pin).
- The collectors wrote `obs009-c9-*` files under `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/execution/`.
- Listening sockets before backend runs: `listen-before-backend{,2,3}.txt`.

## Files and sha256 (before -> after)
- `docs/specs/studio/openapi.yaml`: `b5ecdcad4c5e152d0edde5ad14af1a04438f3d9153b04037ef9ce5bc0ae29244` -> `bbf37fd1f96c0da33bbca6db4c04c94222a44429a4b6f0e33c92dfc59fca02c4`
- `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java`: `fdb4123fb50a008a5f672421f802f2d41c990fdb842652e097bb663ff5b1fed9` -> `a3479bffc9cb2a1cc1d96901ff7a9f12b91ae78d72ab686239432c14455f3e33`
- `studio-runner/test/run/confinement.test.ts`: `5df2b6535ebd0907552b4e75c28a4e8ffa36ecfd4152aa57cd5cf0d03c5d9720` -> `c39785e685bc09ab608049d26803b5fd38c19bc3cdc8cff059a112d69b954a06`
- `docs/architecture/ADR-002-internal-contract-surface.md`: `1f8e5fbd94c8034cdca77dd5bf2e20d3863147133077f03286c4cbde9e7b9695` -> `5a346a0a3810e62212e0ccf24e9cb97ceb5c30bc18deaccabf25fbd349bbb839`
- `frontend/src/services/mocks/studio/guidedHandlers.ts`: `a32125ba750ffb59657b91097872634c6af9d4ae8d9375ccbaa394fa10bb7290` -> `a710e8b026fd4f35a38a6782a3c51581fb5d240e98a44b6d284b969bfc83d0df`
- `frontend/src/services/mocks/studio/guidedHandlers.test.ts`: `f16ea682d7f2ad90be469cff9c3f13b38505bfb266d067f250971a2f0a1afd26` -> `b53ece8cfdb9a78842149aff45acefa8e8baafdeeab2420c528a23c5e84d86fc`
- `tools/check-studio-observed-contracts.cjs`: `758787d447e0829fd185eee8085a135a7b6fadef73b762654385a86311a48c12` -> `ed641bdce8b10171b6b132c1375a4e4cb24bdfbbe710f5f8e3a3360ea279e3ce`
- `frontend/src/services/mocks/studio/executionFixtures.ts`: `a9a69867be0aab7115fa7f8c61d02fcf30db4b77ddfcdc6b0e3c183b7c57f8d7` -> `16ea5df01d89d9ddd2a2592253d7a734bbe7838f49b0926d27e70200b57521ff`
