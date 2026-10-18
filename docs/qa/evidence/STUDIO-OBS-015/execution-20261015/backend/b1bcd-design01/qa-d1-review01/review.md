# QA independent review — B1bcd design findings D1 / F2 / F3 (STUDIO-OBS-015)

Reviewer: Quinn (@qa), 2026-10-15. Subject: `../design.md` (Aria, sha256 `5d74d55d…5b12f`).
Mode: read-only static trace. **Nothing was executed except read-only shell** (`shasum`, `jq`, `grep`, `sed`,
and `python3 -I` parsing of existing JUnit XML). No Gradle, pnpm, Node, JVM, DB or browser ran. No source,
dist, story, ledger or prior evidence was changed. Only this file and `manifest.json` beside it were written.

Every production/runner/schema file I cite has the same sha256 as Aria's manifest
(verified: `GuidedMaterializationService` `d61340b7…`, `GuidedSessionService` `e3b1f3c0…`,
`GuidedTranslationService` `d8c494b2…`, `runtime.ts` `23d89e6d…`, `bridge.schema.json` `039ad401…`,
`observedReplayAdapter.ts` `473653e3…`, `browser.ts` `19893b2a…`, `V21` `b012dddd…`, ReplayIT `9f54372c…`).
Additional files read (not in Aria's manifest) are hashed in `manifest.json`.

---

## Verdicts

| ID | Aria's claim | QA ruling |
|---|---|---|
| D1 | Every authentic `prefixDrift` is refused 409 STALE_FENCE | **CONFIRMED** (static). Fix A is correct with one change: also bind `authoredInputsHash` and `prefixProgramHash`. Exact spec in §1.5. No contract or runner change. |
| F2 | Prefix confirmation refresh always ends one `/plans` with STALE_GENERATION | **CONFIRMED, ruled FIX** (one predicate). Do not accept it and do not pin it in B1B-05. |
| F3 | Ledger 27 redirect/click-away may be classified as drift | **Mechanism as described is REFUTED** by a collector gate Aria did not cite. **Not a defect at current source.** One residual, run-only risk is recorded; the B1C-02 strict assertions stay. |

---

## 1. D1 — CONFIRMED

### 1.1 Trace (verified by reading)

1. `GuidedSessionService.outcomeV2` (2169–2173) routes `kind=prefixDrift` to `prefixDrift` (2241).
2. `prefixDrift` validates `v3/bridge#/definitions/PrefixDriftCallback` (2244), then checks role, key, path, owner/fence (2251), duplicate (2253), `active`, `owner(...)` lease (2257), `checkCurrent`, `checkSourceCurrent`, and then calls **`materialization.verify(session.document(), receipt)`** (2260).
3. `GuidedMaterializationService.verify` (285–292) builds `identity(context(session))` and requires `expected.get(f).equals(envelope.path(f))` for **every** field, otherwise `STALE_FENCE 409`.
4. `identity()` (265–283) includes `"versions"` (278), taken from `session.path("versions")` (215). It is validated against `v3/bridge#/definitions/identity`, where `versions` is **required** (`bridge.schema.json` identity.required).
5. Receipt shape: `PrefixDriftCallback.receipt` → `DriftReceipt` = `oneOf[PreAdmissionDrift, AdmittedDrift]`. Both are `additionalProperties:false` and have **no `versions` property** (22 properties each). So a receipt *cannot* carry `versions`: it would fail the schema at 2244 with 422.
6. Runner producer: `runtime.ts` `makeDrift` (294–298) spreads the `BridgePrefixRequestIdentity` (`PrefixRequestIdentity`: 13 fields, no `versions`) plus receipt-only fields. `guidedCallback` (`transport.ts` 155–163) sends the message unchanged.
7. Therefore `envelope.path("versions")` is `MissingNode`, `ObjectNode{"contract":3}.equals(MissingNode)` is false, and every authentic receipt gets **409 STALE_FENCE**. The runner treats non-202 as failure: `stop('UNKNOWN_OUTCOME')`, at 288–289 (PRE_ADMISSION) and 449–451 (ADMITTED_PRE_INVOCATION).

The defect is structural. No schema-valid receipt can pass `verify`, so the whole positive `prefixDrift` path is unreachable.

### 1.2 Affected variants (verified against ReplayIT `9f54372c…`)

The 8 entries in the `drifted` list (ReplayIT:4101: `drift2, admitted-drift2, admitted-literal2, pre-literal2, same-pair-literal, drift-first, drift-auth, drift-auth-pre`) plus `drift-plan-fail` (4084–4094, which requires `driftSwitchStepId`). That is **9 of the 35** `INCREMENTAL_VARIANTS` (136), matching Aria's list.

`assertActualDriftCallbackAuthorityThenRelease` (4556–4590) is **vacuous** for its 9 forged-field rows (4576–4587). Each row asserts only `isIn(403,409,422)`, and at current source the *authentic* body also gets 409 STALE_FENCE at `verify`. The rows cannot tell a guard working from the defect.

### 1.3 Why no test caught it (verified)

- **No committed baseline.** `prefixDrift`, `DriftReceipt` and `makeDrift` exist only in the uncommitted tree. `git show HEAD:` has no `prefixDrift` in `GuidedSessionService`, no `makeDrift` in `runtime.ts`, and no `contracts/v3/bridge.schema.json`.
- **Runner tests mock the backend.** `test/guided/incrementalRuntime.test.ts:67` and `test/fixtures-tier/mixed-mode-prefix.test.ts:144` assert the *sent* drift body against a mocked callback that accepts anything.
- **`GuidedWireContractTest`** (457, 608, 745) is schema-level only and never calls `prefixDrift`.
- **Joined runs never reached the drift callback.** I parsed every `TEST-*GuidedPublicationReplayIT.xml` under `STUDIO-OBS-015/`:
  - `backend-join85-frozen-attempt07-task-outputs/guidedIncrementalTest/xml/…`: 43 cases, 43 FAIL. **35 of them fail with the identical message `[second explicit learning; …]` at ReplayIT:19281 ← 3937 ← 3354**, including all 9 drift variants (listed by name in the XML). The other 8 are PFXSYNC, origin-ceiling and edit4 cases at 19281 ← 3595/3937, plus `executionError`. That is base learning, before any prefix replay. The XML contains **0** `STALE_FENCE` and **0** `prefixDrift` strings.
  - The worker-generation attempt05, outcome-capture attempt04, incremental2048 attempt01, raw-head attempt04, firstsuffix attempt03, accounting attempt02 and prefix-sync-authority attempt05 runs contain no drift-variant testcase. Their only incremental cases are `incrementalEditFourOfTen…` and `incrementalStartCannotWiden…`, both FAIL at second learning or origin-ceiling, plus PFXSYNC cases.
  - I found no `actual04/05` files by that name. The nearest are `joined-edit4-outcome-capture-attempt04` and `joined-edit4-worker-generation-attempt05`; neither contains a drift variant.
- **Conclusion:** no recorded run has ever executed an authentic drift receipt against Java. D1 is established by static trace only. Aria's statement about attempt07 is accurate.

### 1.4 Does dropping `versions` lose authority? No (verified)

- `versions.schema.json` is `{"contract": {"const": 3}}`, required, `additionalProperties:false`. It is a **constant**: no session, owner, context or epoch information. The receipt's own `schemaVersion: const 3` (DriftReceipt schema) and `GuidedInternalController.currentContract` (`receipt.schemaVersion == 3`, else 409 RUNTIME_INCOMPATIBLE) already bind the contract generation.
- Precedent on the runner: `transport.ts:91` builds the inbound prefix-prepare envelope as `{ ...prefix.request, versions: { contract: 3 } }`. The runner already treats `versions` as implied for prefix-request identity.

### 1.5 Exact fix spec (D1)

**Where.** Add one method to `GuidedMaterializationService` and change only the call at `GuidedSessionService.prefixDrift` line 2260. Keep that call's position: after `owner`/lease/`checkCurrent`/`checkSourceCurrent`, before the `REPLAYING_PREFIX`/`pending` check. Error precedence for every other probe row stays unchanged.

```java
/** Prefix drift receipts carry the issued PrefixRequestIdentity, which has no versions field
 *  (versions is the constant {"contract":3}; schemaVersion=3 is enforced by schema and controller). */
public void verifyPrefixReceipt(JsonNode session, JsonNode receipt) {
  requireAcknowledged(session.path("sessionId").asText());          // keep: REVISION_CONFLICT on pending delivery
  ObjectNode context = context(session);                             // keep: live/owner/fence STALE_FENCE inside
  ObjectNode expected = identity(context);                           // keep: validates server-side identity incl. versions
  expected.remove("versions");
  expected.set("authoredInputsHash", context.path("authoredInputsHash"));
  expected.set("prefixProgramHash", context.path("prefixProgramHash"));
  for (var fields = expected.fields(); fields.hasNext(); ) {
    var field = fields.next();
    require(field.getValue().equals(receipt.path(field.getKey())), "STALE_FENCE", 409);
  }
}
```

**Bound fields: exactly 11.** `schemaVersion, sessionId, workerId, ownerFence, scopeHash, contextId, contextRevision, sourceRevision, configurationRevision` (identity minus `versions`), plus `authoredInputsHash` and `prefixProgramHash`.

Why the two additions are required. Aria's option A lists only the 9 identity fields; this is the one correction to it.
- `authoredInputsHash`. The V21 receipt trigger `studio_015_no_invocation_guard` (438–471) compares the receipt with the **issued** request `q.document`, not with the *current* materialization. For PRE_ADMISSION it never calls `studio_015_current_version`. Today a contextRevision bump is impossible while a prefix is pending (V21:166 `studio_015_prefix_pending`), and inputs cannot change without a revision bump (V21:154–156). So `contextRevision` currently implies `authoredInputsHash`. That is a cross-table invariant inference, and the consume path already binds the field explicitly (`GuidedSessionService` 2155–2156). Bind it the same way here.
- `prefixProgramHash`. `context()` exposes it from `studio_guided_relearn_plans` (`assembleContext` 254–259). It equals the request's value by construction (`issue()` 283; prefix-request trigger V21:426). Binding it costs nothing, and it turns a forged-value row into a deterministic STALE_FENCE instead of a trigger exception.

Still bound elsewhere, unchanged:
- `coordinate`, `evidenceHash`, `requestDigest` and the 13-field request identity: trigger 442/448/449. The receipt minus 9 receipt-only fields must equal `q.document` exactly.
- `operationHash` ∈ verified program: trigger 452.
- Lease/expiry/owner fence: trigger 444–447, plus Java 2251/2257.
- Self-hash: `incremental.receipt` 353 and table CHECK 316–317.
- ADMITTED action/preparation lineage: trigger 458–468, plus Java 2264–2274.

**Do NOT:**
- change `verify()`, `verifyAndCapture()` or `identity()`. Their other callers bind `versions`-carrying identity envelopes: `verify` at `GuidedSessionService` 1817, 1849, 2010, 2153, 2189, 2321; `verifyAndCapture` at 2063; `identity` at `observationRefreshKey` 2042 and `GuidedTranslationService` 342.
- inject `versions` into the receipt (option B, tautological).
- add `versions` to `DriftReceipt` (option C, contract churn).
- change the runner or the contract. Neither needs a change.

**Sufficiency caveat (inference).** D1 is *necessary*. It is not proven *sufficient*: no authentic receipt has ever reached `incremental.receipt`, the V21 receipt/switch triggers, or `switchToLearning` against Java. Later latent defects there are unexercised. The first post-fix run of the 9 variants is the proof.

**Test consequence.**
- After the fix, the 9 probe rows in `assertActualDriftCallbackAuthorityThenRelease` should assert exact outcomes, not `isIn(403,409,422)`. These fields should get `409 STALE_FENCE` from Java: `scopeHash, authoredInputsHash, contextRevision, workerId, prefixProgramHash, sourceRevision`.
- `requestDigest, operationHash, evidenceHash` are rejected only by the DB trigger or FK. Inference: a PL/pgSQL `RAISE` or `no_data_found` surfaces through `GuidedInternalController.unexpected` as `409 UNKNOWN_OUTCOME`. Pin whichever code the first run shows, together with the zero-write snapshot asserts already present.
- The pinned regression for D1 is the B1B-03 `positive-pre`/`positive-admitted` rows plus the 9 original variants.

---

## 2. F2 — CONFIRMED; ruling: **FIX**

### 2.1 Trace (verified)

1. `GuidedTranslationService.advancePrefix`: confirmation `CONFIRMED` and matching evidence (338–347) returns a `refresh`, and then `dispatch.observe(...)` runs (379–381).
2. `GuidedDispatchService.observe` (106–125): `beginObservationRefresh`, then `runner.send("observe")`, then `committedObservationRefresh(…, response)`.
3. `beginObservationRefresh` explicitly **admits** `REPLAYING_PREFIX` (1923, 1932) and writes `state = pending ? "REPLAYING_PREFIX" : "OBSERVING"` (1961).
4. The worker's observation callback commits `state = pending ? "REPLAYING_PREFIX" : "PROPOSING"` (1181).
5. `committedObservationRefresh` → `committedRefresh` (2013–2034) requires **`state(session).equals("PROPOSING")`** (2026). In a prefix the state is `REPLAYING_PREFIX`, so it throws **409 STALE_GENERATION** after the refresh is durable.

### 2.2 Why FIX, not accept

- The begin and commit sides disagree. The state machine deliberately writes `REPLAYING_PREFIX` for a prefix refresh (1181, 1961), but the commit-side reader was not updated. This is an omission, not a design choice.
- More than one `/plans` 409 is broken. `committedRefresh` is also the **idempotent replay** path (`beginObservationRefresh` 1908–1912) and the **lost-response recovery** path (`GuidedDispatchService.observe` 117–121). For a prefix refresh, both now throw STALE_GENERATION instead of returning the committed result. Convergence currently depends on the next continuation noticing the changed evidence (340) and skipping the refresh.
- A gate test must not pin a defect as expected behaviour. B1B-05 as designed (design.md 1186, 1257–1260) asserts "exactly one STALE_GENERATION from `committedRefresh`".

### 2.3 Exact fix

In `GuidedSessionService.committedRefresh`, replace the predicate `state(session).equals("PROPOSING")` (2026) with:

```java
state(session).equals(
    incremental.pending(session.document().path("sessionId").asText()) ? "REPLAYING_PREFIX" : "PROPOSING")
```

This is the same predicate the writer uses at 1181. Every other conjunct (generation strictly greater than `expectedGeneration`, equal to progress, observation hash equal to progress) and the exact correlated `observation-refresh-result` lookup stay unchanged. The check does not get looser: if a drift or boundary switch happened in between, `pending` is false, `PROPOSING` is expected, and the call is still STALE_GENERATION.

B1B-05 REFRESH row, amended:
- exactly one `observation-refresh` and one `observation-refresh-result`;
- the `/plans` call that carries the refresh returns 200;
- **zero** STALE_GENERATION diagnostics whose frames include `GuidedSessionService#committedRefresh`;
- the remaining row asserts unchanged.

Owner: Dex, with root approval (production change). Apply in the same window as D1.

---

## 3. F3 — mechanism REFUTED at current source; not a defect (static)

### 3.1 Requirement (verified)

- Ledger `acceptanceCases[27]`: "Prefix origin/navigation/password-policy refusal stops, no model call or publication; never mislabeled target drift" (AC-4, AC-6; `executionStatus NOT_RUN`).
- Story AC-4(1): `POLICY_REFUSED` in the prefix stops the run; only target/observation drift switches.
- Ruling R-2: a non-governed prefix origin is refused at start (`403 PREFIX_ORIGIN_NOT_GOVERNED`); during the prefix it is a policy stop.

### 3.2 Trace

- **Direct unapproved destination** in a prefix navigate. `runtime.ts resolve()` (307) throws `POLICY_DENIED` before `beginInvocation`. The run gets `failedBeforeEffect` (`FAILED`/`POLICY_DENIED`) and stops (453–454). That is correct, and R-2 refuses it at start anyway.
- **Redirect or click-away to an unapproved origin, where the browser commits an error page** (Aria's scenario):
  - The context route aborts (`browser.ts` 572–576).
  - `mainDocumentTransition` (73–76) resolves on any main-frame commit, so the navigate or click reports **SUCCEEDED** (outcome callback 428–431).
  - `collectObservation` (471–487) then calls the collector, which throws **`SCOPE_DENIED`** for any `location.origin` outside `approvedOrigins` (`observationCollector.ts:270`). An error page has an opaque or non-approved origin.
  - `dispatch`'s catch sees `completed` and calls `stop('CONTEXT_LOST')` (435).
  - The error-page document **never becomes `this.observation`**, so the next prefix coordinate is never prepared. The `observation.origin !== guard.origin → TARGET_DRIFT` step that Aria cites (`observedReplayAdapter.ts:23`) is unreachable on this path. No receipt and no switch.
- **Prefix `initialBlank` navigate where the transition never commits.** `observedNavigateBlank` throws a plain `Error('TARGET_DRIFT')` after `beginInvocation` (234). The adapter's catch maps the unrecognised reason to `ObservedRefusal('OUTCOME_UNKNOWN')` (79–83). The runtime gets `UNKNOWN_OUTCOME` with **outcomeCode `ACK_LOST`**, not `TARGET_CHANGED`. Aria's `TARGET_CHANGED` citation (runtime 438–443) applies to the *ordinary* `navigateBlank` (`browser.ts` 592–601), not the prefix path. There is no receipt, because `provenBeforeEffect` is false. The run stops.

**Ruling.** Ledger 27's required properties hold by static trace: the run stops, there is no model call, no publication, no drift receipt, no switch, and no `TARGET_CHANGED` ledger code on the prefix paths. **F3 is not a defect at current source.** Keep B1C-02's strict assertions as designed. A red B1C-02 is still a production finding and must not be weakened.

### 3.3 Residual risk (inference; only a run can settle it)

1. **Page left unchanged.** If Chromium cancels a blocked navigation without committing an error page (ERR_ABORTED-like behaviour, or a click whose navigation is dropped), the next observation is the *unchanged approved* page and succeeds. The next prefix acquisition can then exhaust its WAITs and raise `TARGET_DRIFT`, which produces a PRE_ADMISSION receipt and a switch: the forbidden mislabel. Inference: Playwright `route.abort()` defaults to `net::ERR_FAILED`, which commits an error page, so the fixture should take the SCOPE_DENIED path. I have not verified this by execution. B1C-02 should add an assertion that no `observations` callback in the case carries a non-approved origin, and keep the zero-receipt/zero-switch asserts.
2. **Terminal label (LOW, not a ledger-27 failure).** On the error-page path the blocked navigate/click is recorded `SUCCEEDED` and the stop reason is `CONTEXT_LOST`, not a policy code. Ledger 27 and AC-4 require "stops" and "never drift", and both hold. Whether the terminal label must be `POLICY_DENIED` is a PO/architect wording question. B1C-02 should pin the actual observed label so that question can be ruled with evidence.

---

## 4. Gate statement

This is a design-finding review, not a story gate. No QA verdict on STUDIO-OBS-015 is issued or changed.

Required before R3:
- D1 fix (§1.5), with root approval and Quinn production review of the diff.
- F2 fix (§2.3), in the same window.
- B1B-05 REFRESH row and the drift-authority probe rows amended as above.

F3 needs no production change.
