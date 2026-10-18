# STUDIO-OBS-015 ledger 56: ruling on the "contradictory result" clause (Aria, @architect)

Date: 2026-10-16 UTC. This is a read-only ruling. No Gradle, Node, DB, Docker or network command ran. No source file was modified. The only files written are the two files in this directory. Unless a statement is marked **[I]** (inference), I verified it by reading the cited file and line.

## 1. The clause: exact original wording and where it came from

- Ledger `acceptanceCases[56]`, `IncrementalResultIT.receiptAndResultDistinguishBoundaryFromSuccess`, tier `HTTP+Postgres`, AC-3..6. Assertions, verbatim:
  > "Required relearnedFrom null before committed switch; boundary/drift/empty prefix reports entered boundary after switch even when later SOURCE_PLAN fails; learnedFromThisRun/publication success false on failure; missing field and contradictory result refuse"
- The source is the architect final-design **test delta**, `final-design/architect/acceptance-delta.json:213-224`. In `acceptance-inventory.json:752-765` it is marked `origin: FINAL_DELTA, disposition: ADDED`. It was copied byte-for-byte into `qa-final/planned-test-inventory.json:613-624`, which is the ledger's `sourcePlan`. No design file contains the word "contradict" anywhere except this one sentence (I grepped `final-design/`).
- The ledger does **not** contain the reading "BOUNDARY/EMPTY_PREFIX result carrying `driftSwitchStepId`". That reading first appears in `b1bcd-design01/design.md` §6 row 56 (line 1751), together with the claim that "refusing it needs a schema change". The QA pregate copied both (`qa-pregate01/map.json` ledger 56 `clauseDispositions`, and `GB-2`).

## 2. What the frozen contract already says about the combination

1. **The combination is contradictory.** These sources agree:
   - AC-2 (story line 28) defines `relearnedFrom` as "the first learned step, **and the drift switch point j when applicable**".
   - `contract-edits.json:41` says "drift stepId=j and driftSwitchStepId=j".
   - `algorithms.json:142` says "driftSwitchStepId=j **when drift**".
   - The normative projection is `{stepId}` for BOUNDARY/EMPTY_PREFIX and `{stepId, driftSwitchStepId}` only for DRIFT.

   So a BOUNDARY/EMPTY result that carries the key falls inside "contradictory result". The narrow reading is **not** an over-reading of the substance.
2. **A schema cannot express the refusal, and the contract never intended it to.** `RelearnedFrom` (`learned-plan.schema.json:320-337`) is `{stepId, driftSwitchStepId?}`, closed, and has **no `reason` field**. The reason is stored only in the immutable switch row (`studio_guided_relearn_switches.reason`) and in `IncrementalEvidence.switch`. "Contradictory" therefore means a mismatch between two documents, the result and the committed switch, so it is semantic by definition. The b1bcd §6 premise that refusal needs a schema change is the over-reading. It confuses the refusal mechanism with the obligation.
3. **The semantic refusal already exists in the frozen contract and in production.** Its only gap is that no evidence row exercises this combination:
   - **Contract oracle.** `tools/check-studio-observed-contracts.cjs:1367-1377` computes `expected = {stepId: switch.effectiveFirstLearnStepId, ...(reason==='DRIFT' ? {driftSwitchStepId} : {})}` and requires canonical equality (`same`, :78). A mismatch fails with `RESULT_SWITCH`, or `RECEIPT_SWITCH` for the receipt. A BOUNDARY or EMPTY result carrying `driftSwitchStepId` is therefore already refused. The 9 `incrementalContracts.resultCases` rows (`publication-fixtures.json:152120-`) do not include it. The existing negatives cover: fallback to k, drift reporting k, switch claiming null, and omission.
   - **Producer.** The backend is the **only** producer. Result (`GuidedPublicationResultProjector.java:138-142`, `GuidedSessionService.java:2743-2747`) and receipt (`GuidedPublicationRepository.java:345-349`) both project from the single SQL function `studio_015_relearned_from` (V21:769-773). Its non-DRIFT branch emits `{stepId}` only.
   - **Persistence refusal.** `tr_015_publication_result` (V21:815-824) refuses any stored `publicReceipt.relearnedFrom` that is `IS DISTINCT FROM` the projection. That includes an added `driftSwitchStepId`.
   - **No inbound path.** No endpoint, runner callback or FE path accepts a result or `relearnedFrom` (grep of `backend/src/main`, `studio-runner/src`, `frontend/src`). The runner carries only the generated types (`studio-runner/src/guided/types.ts:62`, `src/executor/observedOperations.ts:85,89`) and never produces the field. The FE never reads it.

## 3. Ruling

**Disposition: CLOSE BY EVIDENCE. This is not N/A-by-ruling, and it is not a contract or schema change.** The clause is in scope, and the refusal authority it needs already exists. Ledger 56 stays OPEN until the two evidence additions in §4 are green in a recorded run. After that, the clause is PROVEN by:
- (a) the contract `RESULT_SWITCH` rows (result tier);
- (b) the Postgres receipt refusal (persistence tier);
- (c) the existing exact HTTP producer pins in B1D-02.

Options considered:

| Option | Verdict | Trade-off / reason |
|---|---|---|
| A. Schema forbids `driftSwitchStepId` unless reason=DRIFT | **Rejected** | Impossible without adding a `reason` to `RelearnedFrom`, which duplicates "key present" and still cannot catch a lying reason, because truth lives in the switch row. Cost: schema + `build-studio-observed-schemas.cjs` regen of 4 outputs, `pins.runtime.observedSchemaBundleHash` re-pin with runner dist/image churn (collides with GB-3), the V21 function, the receipt guard, every fixture, and the openapi example re-anchor. All of that for zero added safety. |
| B. Backend runtime refuses or ignores the combination | **Rejected** | No inbound result exists to refuse. A Java self-check of the server's own single SQL projection is tautological. The receipt is already refused at commit by V21. |
| C. Prove the existing semantic refusal with explicit rows (chosen) | **Accepted** | No contract shape change and no regen. Two fixture rows plus one Postgres row. Satisfies "contradictory result refuse" at the tiers where a refusal actually exists. |
| D. N/A-by-ruling (producer pin alone) | **Rejected** | The clause says "refuse". The refusal exists and is cheap to prove, so waiving it would be under-delivery. |

## 4. Exact change spec (test and evidence only; one source window, never during a collector run)

**E1. Contract fixture rows (C-int lane).** File `docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json`, `incrementalContracts.resultCases`. Insert these two rows after `switch-result-cannot-claim-no-boundary` (row 8, ~:152466) and before `required-result-null-cannot-be-omitted` (~:152521):
- `boundary-result-cannot-carry-drift-switch`:
  - `switch` = deep copy of row `source-plan-failure-after-boundary-retains-boundary` (:152200) `.switch`, reason BOUNDARY, effective `...0003`;
  - `value` = deep copy of that row's `.value` with `relearnedFrom = {"stepId":"00000000-0000-4000-8000-000000000003","driftSwitchStepId":"00000000-0000-4000-8000-000000000003"}`;
  - `expected: "RESULT_SWITCH"`.
- `empty-prefix-result-cannot-carry-drift-switch`:
  - `switch` and `value` copied from `base-backed-empty-prefix-enters-first-step` (:152314), with `relearnedFrom = {"stepId":"00000000-0000-4000-8000-000000000001","driftSwitchStepId":"00000000-0000-4000-8000-000000000001"}`;
  - `expected: "RESULT_SWITCH"`.

Both values remain schema-valid, so `structural('result')` passes and `same` fails. Both rows have `publication.receipt: null`.

No change to any `*.schema.json`. **No generator regen.** `build-studio-observed-schemas.cjs` reads only `*.schema.json` (:9-10). Its byte-identity `check()` still runs inside the checker and must stay green.

Checked and not affected:
- `check-pins.mjs:343-347` hashes only `publication-fixtures.json#/observedChoice`.
- There is no checked-count pin on `runIncremental` (:1925-1934).
- No Java or TS test iterates `resultCases` (grep). `observedIncrementalValidation.test.ts` reads `basisCases` and `canonicalVectors` by index only.

Verify:
- `node tools/check-studio-observed-contracts.cjs` → `PASS incremental: <prior N + 2>`.
- Record the old and new publication-fixtures sha256. The current value is `86e42679…` (inputs). The runner checkpoints that quote it must be re-anchored.

**E2. Postgres receipt refusal (Dara/Dex test-only).** File `backend/src/test/java/com/citi/put/checks/studio/guided/GuidedReplayingPrefixMigrationIT.java`, method `publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys` (:840). Add this row after the `wrong` row (:843). The fixture is BOUNDARY, so `good.publicReceipt.relearnedFrom = {stepId:STEP2}` from `studio_015_relearned_from`:

```java
ObjectNode driftOnBoundary=good.deepCopy();((ObjectNode)driftOnBoundary.path("publicReceipt").path("relearnedFrom")).put("driftSwitchStepId",good.path("publicReceipt").path("relearnedFrom").path("stepId").asText());reject(f.c,publicationSql(f,driftOnBoundary,artifact),"publication relearned boundary differs");
```

**[I]** This takes the same deferred-trigger path as the existing `wrong` row. The shape guard excludes `relearnedFrom` (V21:890), so the expected message is the relearned-boundary one. EMPTY_PREFIX shares the same non-DRIFT SQL branch, so one row covers both reasons. An EMPTY receipt row is optional, not required.

Run `./gradlew test --tests '*GuidedReplayingPrefixMigrationIT.publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys'` in the next run window.

**E3. B1D-02 (`GuidedPublicationReplayIT#incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary`, :11292). No change required.** The HTTP+Postgres producer pins are already exact whole-object equality from the real switch row:
- BOUNDARY: `failed.relearnedFrom == {stepId:S3}` (:11311) with the switch reason asserted;
- EMPTY: entered and failed `== {stepId:S0}` (:11319, :11327).

`ObjectNode.equals` compares the full key set, so a stray `driftSwitchStepId` would fail these assertions.

**Do NOT** add a `drift-on-boundary` row to `b1AssertFailedResult`'s `C.validate("v3/result")` loop (:12639-12670). Structural validation lawfully accepts it, and the test would be red by design.

**Runner producer check.** None needed. The runner never produces `relearnedFrom` (see §2.3). The generated types stay unchanged.

**Backend production code.** None.

## 5. Ledger and pregate follow-through (owner: Quinn)

Ledger 56 clause `contradictory result (BOUNDARY/EMPTY_PREFIX + driftSwitchStepId) refuses`:
- disposition becomes `PROVEN-BY-RULING aria-ledger56-ruling01` once E1 and E2 are green and recorded;
- evidence = checker rows E1 + `GuidedReplayingPrefixMigrationIT#publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys` + ReplayIT B1D-02 :11311/:11327 (latest `w4-full-incr02` PASS on digest `66167ccf`; re-gate needed after the E1/E2 source window).

GB-2 closes on the same condition. Tier note for QA: no HTTP endpoint ingests a result. The ledger's "refuse" is satisfied at the contract tier (result) and the Postgres tier (receipt). This is the tier decomposition being ruled here; it does not weaken the obligation.
