# Controller-cut summary provenance: unresolved constraint conflict

`GST-CUT-REF-PROVENANCE-01` is **UNRESOLVED**. The genuine production source path and the frozen original `ref-PASS` assertion cannot both be satisfied. No fixture correction, candidate, or patch is proposed.

The closed unit05 projection reports both controller-cut tests failing an assertion at archived `runGuidedControllerCut:2846`. That assertion is one conjunction of four fields. The projection establishes neither individual row values nor which conjunct failed. This audit proves a separate static contradiction; it does not reconstruct the actual database row.

## Exact source path

The immutable unit05 Transport archive is `7856020f0fb27e9bca9c1d1f235bd9a0c2eecd3bf135b7c16c6c7aa4ad4f269d`. Its `prepareGuidedControllerCut` writes ordinary authoring data: a source step with `STEP_ID` and a declared secret `PASS`. The `service` factory uses `productionAccess`, installs real translation and `SecretAuditLifecycle`, and does not stub initialization or source resolution. The real session start calls `GuidedProductionSessionAccess.initialize`; that method calls the real classifier before storing the manifest. The child later reads the same current manifest through `GuidedSourceInputResolver.sources` and cannot start replacement authority.

`GuidedSourceClassifier.java:150–163` constructs every declared secret reference as `"cfg-" + UUID.nameUUIDFromBytes((stepId + ":secret:" + name + ":fill.value").getBytes(UTF_8))`. Changing ordinary step IDs, text, or secret declarations cannot remove this fixed prefix. The fixture's `sourceSecretReference` reads this genuinely initialized manifest. The planner builds a source-plan reference from the manifest and reserves admission through real `translation.advance`; the fixture reads the committed obligation association. It does not construct an alternate `ref-PASS` manifest identity.

After the child exits, `lostAcknowledgment` reaches session terminal cleanup. `SecretAuditLifecycle.guidedTerminal` reads the manifest and consumed action/materialization snapshot. Its match requires the selected input ID, secret ID, source step, slot, provenance reference ID, and action step to agree. For a consumed admission without a recorded resolution decision, it passes that manifest `referenceId` into `recordConsumedNoDecision`. `SecretUseAuditRecorder.row` maps Scope fields directly into the audit columns, then binds that row into the real SQL INSERT.

V17's audit guard requires exact manifest/input lineage for a non-null summary reference. V21 updates the input lookup to the historical materialization snapshot and preserves that exact-reference check. The guard does not provide a reference renaming path. The old `FixtureAccess.sources` hardcoded `ref-PASS` map is outside the real production manifest path used here; its presence cannot satisfy the frozen summary assertion.

## Four asserted values

| Column | Frozen expected value | Source-guaranteed provenance | Static assessment |
| --- | --- | --- | --- |
| `coordinate_step_id` | `STEP_ID` | Planner source step → obligation step → real proposal validator → ledger coordinate → terminal Scope | The public contract's secret action and secret reference use the same step. No independent contradiction found. |
| `coordinate_ordinal` | `0` | Controlled source-plan occurrence0 → real proposal coordinate ordinal → ledger → terminal Scope | No independent contradiction found. |
| `source_reference_id` | `ref-PASS` | Real classifier's `cfg-…` manifest ID → selected source input provenance → terminal Scope → SQL column | Contradiction: every generated ID begins `cfg-`; `ref-PASS` does not. |
| `attempt_id` | `sessionId + ":1"` | Terminal writer uses session ID plus the consumed action's owner fence; ledger copied the session owner fence | The fixture already asserts committed ownerFence1. Terminal state changes retain the action fence. No independent contradiction found. |

The first, second, and fourth assessments are source-path comparisons, not observations of actual summary values. The earlier successfully reached assertions do not expose the private row or identify the failed conjunct.

## Required ruling

These three constraints are incompatible: retain the current classifier's generated reference identity; retain genuine manifest/input/summary provenance without authority rewrites; retain the exact original equality to `ref-PASS`. A fixture-only input change cannot resolve the disjoint prefixes. Satisfying the literal by replacing the production manifest, inserting a synthetic audit row, changing the summary result, or bypassing the lineage guard would violate the authorized scope.

A further ruling is required on the frozen literal oracle versus the current production identity contract. This package does not select a policy, change an assertion, weaken an oracle, or propose a production change. Root must obtain and record the applicable architectural/QA ruling before composing any correction for this finding. All source/native/retry releases remain separate.

## Static preservation and limits

`base/` holds unchanged copies of all three unit05 formatted files solely for later composition. They are explicitly base files, with zero proposed candidates and no draft manifest or patches. The pure verifier confirms all three are byte exact, preserves 80 ordered annotated methods and 751 original assertion expressions, and carries the exact99-case catalog, nine modes, and 11 sentinels. Every original assertion, timer, real planner/SQL/rollback/secret/budget/canary subject, authority boundary, and cleanup/completion wait is unchanged.

`source-witness.json` pins the public source files and exact excerpts, including the four-field dataflow and a closed public contract coordinate projection. No live SQL or row query, Java/compiler/Gradle/native/probe/signal, process or lock interaction, raw XML/log/thread/binary/TEMP/journal/business body, private locator, product edit, main/migration edit, or prior seal mutation occurred. Only this new directory was written. All main506/Replay/generalW1/C8/IR/F1/GS-Mb/lane/baton/external/custody/lifecycle holds and prior/new reds and gaps remain.
