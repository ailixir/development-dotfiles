# Independent Quinn: unit04 mutation-parent fingerprint correction

**Decision: repair derived fingerprint constants in the existing runner test helper only.** Parent selection and the canonical current vectors are correct. The12 cases failed the exact-preimage guard before their malicious validation boundary. No canonical/source/guard weakening is justified.

I independently computed canonical-v1 hashes in Python from the actual archived and current source JSON, without importing or running the application/oracle/test code. All29 original helper descriptors match the historical C-int ledger, and all their historical old/new hashes match the actual archived before-file values. Every current case differs from its selected current positive parent only at its original declared pointers. The current fixture remains SHA256 `86e42679bda53a932905f444daf68b276868fb08c87fa9df20166674fa5ed9f2` and matches the captured unit04 source manifest, as do the inspected test/helper files.

## Cause and responsibility

`current-vector-preservation-implementation/install.cjs:10` computes ledger `oldHash/newHash` from `parents[index]` and its old mutation, while applying that delta to `newparents[index]`. The ledger therefore records **historical** preimages, not current rebased parent fingerprints. At line24 the installer then recomputes two malicious publication-preimage hashes against the corrected current basis, after capturing the ledger. Those two historical `newHash` values are also stale for current execution.

My earlier review05 copied that historical mutation ledger into a purported current exact descriptor without checking its pointer fingerprints against the resealed current parents. That derived current interpretation was incorrect. The immutable previous review/ledger remains historical evidence; this directory supplies a justified **CURRENT** correction rather than rewriting it. The helper's guard correctly exposed the inconsistency.

There is no wrong-parent counterexample and no canonical semantic contradiction in these12 cases. The parent evolution is finite and independently recorded in [parent-evolution.json](parent-evolution.json):

- `graph/admitted-binding-replacement`: omit the exact unanchored observation from the valid parent and update its whole-basis publicationEvidenceHash.
- `incrementalBasis/ordinary`: remove the unused effective input/configuration reference while retaining raw history, then update the publicationEvidenceHash.
- `incrementalBasis/admittedDrift`: the same effective-input correction plus current translation head correction, then publication hash update.
- `incrementalBasis/appendedHistorical`: additionally restore bootstrap context/hash/materialization to its actual version1 while head is2, correct translation head, then publication hash update.

These are the previously reviewed C-int world corrections. A parent is not selected to fit an old hash.

## Exact correction and preserved malicious subjects

[Current12 corrections](current-12-corrections.json) records the exact pointers/values and archived/current fingerprints. [Current29 descriptors](current-29-boundary-descriptors.json) retains all29 original names, sections, parent names, routes, pointer paths and removal flags. [Minimal helper repair](minimal-runner-helper-repair.json) identifies exactly **14 constant changes:12 oldHash and2 newHash literals**. Its remaining17 cases are unchanged.

For the two graph cases, `/expectedArtifact/replayPolicy/publicationEvidenceHash` is an actual offered malicious candidate input. The guard hashes the canonical JSON string containing that hash value; it is not the publicationEvidenceHash value itself. The independent current guard fingerprints are:

| Case | Current parent value fingerprint | Current malicious value fingerprint |
|---|---|---|
| publication-preimage-must-commit-raw-failed-edge | `7500a8cceb2953574f29bc7920463462e207386a66ad349ce03545a114d70e1a` | `644c2163d21337cd07049d035eaeb451c8223143ae0c251be4db418992a24c03` |
| publication-preimage-envelope-cannot-change | `7500a8cceb2953574f29bc7920463462e207386a66ad349ce03545a114d70e1a` | `2f7a155fd43698e8125bc76cc86c050ddeb1ebe070aacc3ebda3fb24bdcab9a9` |

[Two independent formula checks](publication-2-formula-checks.json) also retain the actual hash-string values and complete preimages. The first still computes the publication commitment as if the raw failed consumer edge were erased only from the hashed basis. The second still substitutes illegal envelope version2. The actual row basis stays identical to its valid current parent. These exact current malicious values already exist in the canonical source; they must not be replaced with historical ones merely to fit the stale descriptor.

The other10 contradictions are `/expectedArtifact` removals from incremental negative fixture rows. Here `expectedArtifact` is **fixture expectation metadata**, not an offered malicious request input: these private-authority cases execute `deriveObservedArtifact(row.basis)` and the explicit synthetic sidecar oracle, rather than sending `request(row)` with an absent artifact. Retain the removal marker and its absence assertion, but describe its role accurately. The real malicious subject remains the original private input hash, exact issued preparation revision, omitted ledger inventory or authenticated worker authority mutation.

The correct parent artifact fingerprints for those expectation markers are:

| Current coherent parent | Fingerprint |
|---|---|
| ordinary | `023a74abb72c95a84f2a01e70c9bcc273ff2a8211807b520e10f787db0d35d3c` |
| appendedHistorical | `5d01f5fd79e511c2bf22aadd13fb504b006e46e5e3af3808a061358d8182e9ce` |
| admittedDrift | `259aab6f643462694b03b5c3586acac0bb8bc69cfc5c3a2214ca680c15531c03` |

No unknown old preimage was recovered or invented: the archived before-source exists and was read directly. Current old/new values for every malicious pointer and source-bound references for the expectation markers are recorded in the correction artifact.

## Positive-parent evidence and limits

Unit04's exact test code validates `deriveObservedArtifact(parent).artifact == parent.expectedArtifact` and the actual parent request's `ok:true,errorCode:null` **before** calling the failing helper guard. The captured failures originate inside that subsequent guard. Thus the recorded execution already proves those positive parent preconditions at the captured source; it does not prove the12 failing malicious boundary assertions. Prior C-int selected pure receipts independently retain valid ordinary/admittedDrift/appendedHistorical controls and the original two `GRAPH_PUBLICATION_PREIMAGE` refusal subjects, explicitly at synthetic scope.

The recommended repair copies only the reviewed current constants into `studio-runner/test/helpers/incrementalNegativeBoundaries.ts`, under root's separate release. Keep fixed expected fingerprints, exact old/new guards, removal checks, full remainder comparison, every original test name and all malicious documents unchanged. Do not generate expectations from the row under test, remove guards, swallow failures, filter/skip cases, switch parents or edit canonical/generated/pin sources. No QA-artifact runtime import is needed.

The other12 unit04 failures concern the separate lowercase prefixPrepare selector and are outside this metadata diagnosis. All15 real backend private/authenticated companions remain **unfulfilled by the synthetic runner oracle**. A fresh actual full default unit/coverage run is required after authorized repairs; no negative test was fixed, executed or marked passing by this review. All86/24/55 obligations, configured gates, native/joined evidence and015then008 independent closure remain required.
