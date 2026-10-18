# STUDIO-OBS-015 B2B-01: architect ruling on the append-path defects (P1, P2/A18-4, P3) and the authored-literal scrub (Q4)

Author: Aria (@architect), 2026-10-16 UTC.
- I worked read-only on source. I ran no Gradle, no runner and no build, and changed no repo, dist or fixture byte.
- This ruling releases no QA credit and changes no lifecycle.
- Change specs are for @dev (backend only); Quinn re-gates.

Inputs (hashes are in `manifest.json`):
- `../review.md` (Dex-D3), section 2 and P-A;
- `../../b2ab-source01/notes.md` F1;
- `../../r2-diagnosis01/aria-h8-h6-ruling01/ruling.md` H8.

Labels: **[V]** means I read the code or the artifact and cite it. **[I]** means inferred and not executed.

---

## 0. Verification of the diagnosis

| Claim in review.md | Verdict | Evidence |
|---|---|---|
| Admitting a binding consumer bumps `materialization_revision` after the prefix's same-version push | **[V] confirmed** | `advancePrefix` pushes at `GuidedTranslationService:398` and admits later at `:484`. `sessions.admit` reaches `GuidedBindingStore.attachConsumer:240` → `materialization.bump`. Nothing pushes again after the last prefix coordinate. |
| The append is `DB+1`, but the runner requires `runtime+1` | **[V] confirmed** | `freeze` sets `materialization_revision+1` (`GuidedMaterializationService:97-103`). `runtime.ts:180` requires `next.materializationRevision === this.context.materializationRevision + 1`, otherwise `CONTEXT_REVISION`. That code is not in `DEFINITE_CONTEXT_REFUSALS` (`GuidedRunnerClient:28,306`), so the result is `UNKNOWN_OUTCOME`. |
| **Wider than stated** | **[V] new** | Two other paths also bump between the last push and the append: `GuidedBindingStore.allocate:88`, called from `learnSuffix:992` whenever the merged plan adds a consumer, and `successfulRead:281`, reached when a prefix ends with a read. So the off-by-one is not specific to "prefix ends with a consumer". The fix must be a general sync of the head before the append. |
| 513 retries, all `IDENTITY_MISMATCH` | **[V] confirmed** | The run log has 513 WARN lines for `b3f70b8a`, all with one `contextHash 0e69c8a1…`. The body is byte-identical because the pending delivery's `context_metadata` is frozen at first issue (`GuidedMaterializationService.context:143-160`), including `leaseExpiresAt`. |
| A replay with the same key is masked as `IDENTITY_MISMATCH` | **[V] confirmed** | On replay, `transport.ts:111` calls `ownership.getRuntime(identity(v2 body))` before it awaits the cached promise. `ownership.ts:123` compares that with the runtime's v1 identity, so the replay fails with `IDENTITY_MISMATCH`. Even without that check, the rejected promise is cached and never evicted (`transport.ts:96,112`). |
| `finishSuffixMaterialization` has no refusal handling | **[V] confirmed** | `:1004-1014` makes a bare `dispatch.pushContext` call. `GuidedTranslationCoordinator.continueRuns` re-posts `plans` every poll while `continuation=MATERIALIZE`, with no bound. |
| Teardown targets the unacknowledged v2 identity | **[V] confirmed** | `GuidedSessionService.stop:2506` takes `materialization.context()`, which returns the pending v2 metadata. The runner's identity stop requires `sameIdentity` (`ownership.ts:162`). The client turns a non-200 stop into `UNKNOWN_OUTCOME` (`GuidedRunnerClient:204-207`). `teardownAttempt` resends, then the H8 reaper re-drives the same target until the window ends. |
| **New: the delivery has a hard deadline** | **[V] new** | The V21 ACK guard refuses any ACK once `context_metadata.leaseExpiresAt <= clock_timestamp()` (`V21__guided_session_replaying_prefix.sql`, `studio_015_delivery_guard`). After that point (≤ 30 s after the append), even a real runner ACK cannot be recorded. `acknowledge` then raises a non-`GuidedSessionException` from the trigger, and the coordinator would spin. Any retry bound must also stop at this deadline. |
| **F1 (b2ab notes): "a renewed `leaseExpiresAt` changes the digest, giving `IDEMPOTENCY_CONFLICT`"** | **[V] refuted** | Resends of a pending delivery reuse the frozen metadata, so the digest is stable. On a lost response, a same-key resend replays the resolved ACK: `transport.ts:111` → `getRuntime(v2)` passes once v2 is applied → `prior.promise`. A18-4 is therefore reachable by a lost-response injection. It stays OPEN only because that injection was not added. |
| Exact first refusal code was `CONTEXT_REVISION` | **[I] still inferred** | Non-definite codes are not logged today. P2 below logs every closed code, so the next run will show it. |

---

## P1: sync the head before the append (backend, mandatory)

**Ruling.** Before the append, the runtime must hold the head `materializationRevision`. This is the rule `advancePrefix` already states: "apply the current metadata before…".
- The fix is a same-version context push before `sessions.materialize` in `finishSuffixMaterialization`. A definite refusal of that push is terminal, exactly as at `advancePrefix:397-404`.
- **Rejected:** relaxing the runner to `>= +1`.
  - The `+1` rule is the runner's proof that it applied every same-version metadata delta (allocations, producers, edges) before an append.
  - Relaxing it changes the bridge contract and needs a dist rebuild, with no benefit once the backend syncs.

**Change spec: `GuidedTranslationService`**
1. Add a private helper, behaviour-identical to `advancePrefix:397-404`:
   ```java
   /** Applies the current same-version head to the runtime; a definite refusal is terminal. */
   private void syncContext(Authentication controller, String id, long fence) {
     try {
       dispatch.pushContext(controller, id, fence);
     } catch (RuntimeException failure) {
       if (GuidedRunnerClient.definiteContextRefusal(failure)) {
         sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE");
       }
       throw failure;
     }
   }
   ```
   `advancePrefix:397-404` may call it. This is optional and changes no behaviour.
2. `finishSuffixMaterialization`: insert this between computing `revision` and `sessions.materialize(...)`:
   ```java
   // OBS-015 B2B-01 P1: admissions, allocations and reads bump materialization_revision after the
   // last push; the runner accepts an append only at runtime+1 (runtime.ts:180).
   if (sessions.contextDeliveryId(controller, id, fence) == null) {
     syncContext(controller, id, fence);
   }
   ```
   - The guard skips the sync on a retried continuation that has already appended (pending delivery). In that state `runnerContext` returns the frozen v2, so the push would be the delivery itself.
   - After an ACK whose REFRESH commit was lost, the sync is a harmless same-version push.
   - Between this sync and the append nothing can bump. V21 refuses an append while ADMITTED/DISPATCHING actions or unexpired unadmitted preparations exist, and same-version bumps are refused while a delivery is pending. If an off-by-one remains anyway, P2 makes it terminal and logged instead of a spin.
3. Replace the bare `dispatch.pushContext(controller, id, fence);` at `:1008` with `pushMaterializedContext(controller, id, fence);` (P2).

---

## P2 / A18-4: retry semantics for a keyed append delivery

### Contract ruling

1. **Every closed refusal of a keyed append delivery is final for that delivery, and terminal on first receipt.**
   - The delivery id is the runner's idempotency key. `GuidedRunnerClient:235` requires `ack.deliveryId == key`.
   - V21 binds exactly one immutable `delivery_id` per context revision: `PRIMARY KEY(session_id, context_revision)`, the trigger message `delivery identity immutable`, and `ack.deliveryId = delivery_id`.
   - The runner caches the first result per `[session, 'context', key]` for the life of the process.
   - So no resend can ever change a 409 answer to that delivery. Refusals raised before caching (SCHEMA, envelope IDENTITY_MISMATCH, CAPACITY, IDEMPOTENCY_CONFLICT) are deterministic for a byte-identical frozen body.
   - The backend therefore ends the session `FAILED RUNTIME_INCOMPATIBLE` in the same continuation, for any code, and logs the code.
2. **Transport uncertainty is the only resend case, and it is bounded.**
   - This covers a timeout, a connection loss, a non-409 status, and an unparseable or nonconforming 409 body.
   - The resend uses the **same key** and the same frozen body. It either joins the in-flight promise or replays a resolved ACK; that is the lawful A18-4 path.
   - Bound: at most **3 sends per delivery**, persisted, and **never at or after the frozen `leaseExpiresAt`** (the V21 ACK deadline).
   - When exhausted: `FAILED RUNTIME_INCOMPATIBLE`.
3. **No fake ACK.**
   - The delivery becomes `ACKNOWLEDGED` only from a validated runner ACK: key echo and `contextHash` (`GuidedRunnerClient:233-237`), plus the V21 guard.
   - On a refusal or on exhaustion, the delivery stays `PENDING` forever. `materialization.stop` sets `live=false`, so V21 refuses any later ACK.
4. **At-most-once.**
   - Context is metadata, not an application effect.
   - While the delivery is `PENDING`, `verify`/`verifyAndCapture`/`bump` call `requireAcknowledged` [V]. So no callback-verified prepare or dispatch can commit under v2 [I: inferred from those call sites; I did not trace every caller].
   - The terminal stop (P3) tears down whichever runtime version exists.

### Rejected options

| Option | Ruling | Reason |
|---|---|---|
| A new delivery id per attempt, after re-reading state | **REJECTED** | It contradicts the V21 delivery identity (one immutable id per version; the ACK is bound to it) and the client's key==deliveryId check. That would need a migration and a contract change. The backend cannot "re-read" runner state except by pushing. Two keys for one version would give two ACK identities for one historical authority, which is exactly what A18-4 forbids. |
| Runner evicts rejected `context` promises or skips the replay `getRuntime` precheck | **REJECTED for 015** | It is not needed for correctness after P1 and P2. It changes the bridge idempotency semantics and needs a runner rebuild. After P1, the append path has no expected transient refusal. |
| Keep retrying until the session lease or expiry (today) | **REJECTED** | It is unbounded, hides the real code, keeps the coordinator busy, and cannot succeed after the frozen lease. |

### Change spec

**`GuidedRunnerClient`**
- Add `public static final String CONTEXT_CLOSED_REFUSAL = "RUNNER_CONTEXT_CLOSED_REFUSAL";`.
- Add `public static boolean closedContextRefusal(RuntimeException f)`. It returns `definiteContextRefusal(f) || (f instanceof GuidedSessionException g && "UNKNOWN_OUTCOME".equals(g.getMessage()) && CONTEXT_CLOSED_REFUSAL.equals(g.messageCode()))`.
- `contextRefusal(...)`: once the body validates as a closed `refusal`, emit the **existing** `LOG.warn(...)` line for **every** code, not only the definite ones. It stays value-free: session id, context hash and closed code.
- For a non-definite closed code, return `new GuidedSessionException("UNKNOWN_OUTCOME", 409, CONTEXT_CLOSED_REFUSAL, false, null)`.
- Unparseable, nonconforming or non-409 replies are unchanged (`new GuidedSessionException("UNKNOWN_OUTCOME", 409)`).
- Public `code`, `status` and `retryable` are unchanged. Only the internal `messageCode` differs.
- Unkeyed callers (`bootstrap`, `advancePrefix`, `prepareAndAdmit`) behave exactly as today.

**`GuidedDispatchService.pushContext`**
- In the keyed branch, send with the frozen deadline: `runner.send("context", context, delivery, java.time.Instant.parse(context.path("leaseExpiresAt").asText()))`.
- The existing caller-deadline overload then refuses locally, as `UNKNOWN_OUTCOME`, once the deadline is past.
- The unkeyed branch is unchanged.

**`GuidedTranslationService`: new `pushMaterializedContext(controller, id, fence)`**
1. `String delivery = sessions.contextDeliveryId(controller, id, fence);`. If it is `null` (no new input was appended), call `syncContext(controller, id, fence)` and return.
2. In one `sessions.translationTransaction`:
   - Read `progress.suffixDelivery`. If it is absent or its `deliveryId` ≠ `delivery`, reset it to `{deliveryId: delivery, sends: 0}`.
   - Read `Instant lease = Instant.parse(sessions.runnerContext(controller, id, fence).path("leaseExpiresAt").asText())`. While pending, this is the frozen value.
   - If `sends >= 3 || !clock.instant().isBefore(lease)`: return `exhausted`.
   - Otherwise set `sends+1`, `repository.save(current)`, and return `send`.
   - Everything stored is value-free: a UUID and an integer.
3. If the result is `exhausted`:
   - call `sessions.failTranslation(controller, id, fence, "RUNTIME_INCOMPATIBLE")`;
   - throw `new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409, GuidedRunnerClient.CONTEXT_REFUSED, false, null)`.
4. Otherwise call `dispatch.pushContext(controller, id, fence)` and catch `RuntimeException failure`:
   - If `GuidedRunnerClient.closedContextRefusal(failure)`:
     - in a `translationTransaction`, set `progress.suffixDelivery.outcome = "REFUSED"`;
     - call `sessions.failTranslation(... "RUNTIME_INCOMPATIBLE")`;
     - throw the terminal `RUNTIME_INCOMPATIBLE` exception from step 3.
   - Otherwise rethrow `failure` unchanged. The next continuation resends with the same key and is counted.
   - The same applies when the runner ACKed but `acknowledgeContext` failed. Once the frozen lease passes, step 2 makes it terminal.
5. No other state, action, ledger, counter or evidence is touched.

---

## P3: append-path teardown target (backend, mandatory)

**Ruling.** While an append delivery is `PENDING`, the runner holds one of two versions:
- `v(n-1)`, if the delivery was never applied (this run's case), or
- `v(n)`, if only the ACK was lost (A18-4).

An identity-addressed stop can be right for only one of them. Only the assignment names both. This is the append analogue of `unacknowledgedBootstrap`, and the runner already honours it:
- `ownership.ts:154-160`: the digest must equal `hash(assignment)`, then `stopEntry` stops any runtime under the assignment;
- the response is a `STOPPED` receipt, written only after cleanup (H8 rule intact).

No runner change is needed.

**Change spec: `GuidedSessionService`**
- At `:2510`, change the condition to:
  ```java
  if (assignments != null
      && (stoppedContext == null || unacknowledgedBootstrap(session) || unacknowledgedAppend(session))) {
  ```
- Add:
  ```java
  /** OBS-015 B2B-01 P3: a PENDING append delivery leaves the runner at v(n-1) or, if only the ACK
   * was lost, v(n); only the assignment addresses both. */
  private boolean unacknowledgedAppend(GuidedSessionRepository.Session session) {
    return materialization.pendingDeliveryId(session.document().path("sessionId").asText()) != null;
  }
  ```
- Effects:
  - The existing `if (assignment != null || stoppedContext == null)` fallback is kept.
  - `teardownRequest.target` (H8) then persists the assignment, so `teardownAttempt` and `redriveTeardowns` re-drive the right target with the deterministic `teardown-<hash>` key.
  - There is no reaper change.
  - Sessions without a pending delivery behave byte-identically.
- **Residual [I]:** a pending append with no assignment row would still target v2. Every translation session is assigned through `dispatch.assign` in `plan()`, so I see no such path. A WARN is not needed.

---

## Tests (@dev; Quinn re-gates)

**Unit, no Spring.**
- `GuidedRunnerContextRefusalTest.anyOtherContextReplyStaysAnUnknownOutcome`: extend it.
  - `{"code":"BUSY"}` gives `UNKNOWN_OUTCOME`/409, not retryable, `definiteContextRefusal` false and `closedContextRefusal` true, with exactly one WARN containing `BUSY`.
  - The extra-field, non-JSON, oversize, empty and 503 cases give `closedContextRefusal` false.
  - `rendered()` still has no `CANARY`.
- `identityMismatchAndSchemaRefusalsOfAContextAreDefinite` is unchanged; it keeps 2 logs.
- New `translation/GuidedSuffixMaterializationTest`.
  - Use Mockito with inline mocks, as `GuidedPlanningIntegrationTest` already spies the final `GuidedRunnerClient`.
  - Mock `GuidedSessionService`, `GuidedDispatchService`, `GuidedTranslationStore` and `GuidedSessionRepository`. `translationTransaction` applies its lambda to a fake `Session` whose `progress()` is a real `ObjectNode`. The clock is fixed.
  - Cases:
    1. `appendIsPrecededBySameVersionSync`: with no pending delivery, the `InOrder` is `pushContext` → `materialize` → `pushContext`.
    2. `retriedContinuationWithPendingDeliverySkipsSync`: `materialize` → exactly one keyed `pushContext`.
    3. `closedNonDefiniteAppendRefusalIsTerminalOnFirstReceipt` (marker `CONTEXT_CLOSED_REFUSAL`): one send, `failTranslation(..,"RUNTIME_INCOMPATIBLE")` once, terminal exception, `suffixDelivery.outcome=REFUSED`.
    4. `definiteAppendRefusalIsTerminal`: as case 3, with `CONTEXT_REFUSED`.
    5. `uncertainAppendResendsSameDeliveryAtMostThreeTimes`: three plain `UNKNOWN_OUTCOME`s are rethrown with `sends` 1→3. The 4th continuation calls `failTranslation` with zero further sends.
    6. `appendAtOrAfterFrozenLeaseFailsWithoutSending`.
    7. `acknowledgedAppendMovesToRefresh`: `sends=1`, no `failTranslation`.
    8. `presyncDefiniteRefusalIsTerminal`.
- `GuidedDispatchService` unit: the keyed `pushContext` passes `Instant.parse(frozen leaseExpiresAt)` as the caller deadline, and the unkeyed path passes none.

**Integration (embedded PG; `GuidedServiceTransportFaultIT` with `installStopSender`).**
- `pendingAppendDeliveryTeardownTargetsTheAssignment`.
  - Seed an assigned session at v1 plus a `PENDING` v2 delivery. Use the SQL seeding pattern of `GuidedReplayingPrefixMigrationIT.appendRefuses…`; its fixture reuse is [I].
  - Then call `failTranslation`.
  - Expect `teardownRequest.target` to have `assignmentId` and no `contextRevision`.
  - The captured stop target and reason are identical across the `afterCompletion` call and `redriveTeardowns`.
  - Once the stub returns: `CONFIRMED`.
  - Delivery row: still `PENDING`, `ack IS NULL`.
- Control: `noPendingDeliveryKeepsIdentityTarget` (byte-identical to today).

**Joined (real runner, current dist).**
- `guidedIncrementalTest --tests …ReplayIT.incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority`. This is B2B-01, low lane, `--no-daemon`. It proves **P1**: sibling 2 reaches `/obs015-ack` and "v2 ACK pending" passes.
  - It also proves **P3**: `b2bOwnerLoss` ends the session while the v2 ACK is held, so the runtime is still v1. The cleanup must reach `teardownStatus CONFIRMED` within the existing 20 s wait, and `cleanupUnconfirmed` must stay false for the rest of the low lane.
  - Expected: zero `refused the context` WARN lines for that session.
- The `guidedIncrementalTest` label `append-input` (`INCREMENTAL_VARIANTS`) uses the same append path and has never passed in 11 runs. It must pass. It also confirms P1 without the test-side push that sibling 1 does at `:7790`.
- Regression: the default-lane `incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck` (B2A-02, with the D3 fixture patch) exercises an ACKed append and must stay green.
- P2's terminal branch has no joined injection. The unit tests are its proof. The pre-fix run `h8h6-w01-full01` (513 sends) is the "before" evidence.

**Runner changes and dist:** none for P1, P2 or P3, so no rebuild. Dist "stable" must stay unchanged in the next receipt.

---

## Q4: authored literals make same-named targets unlearnable

### What the code does [V]
- At start, `runtime.ts:163` withholds **every** non-secret authored input value. That covers every `nonsecretText` and `destination` input in every slot: `fill.value`, `selectOption.value`, `assert.expected` and `navigate.destination`. At an append, `:201` withholds the new ones.
- `observationCollector.ts:619` stores them as **strict** private values, in raw and normalized form.
- `:498-505` drops any node whose name or locator hint *contains* a value, as a plain substring at any length, and counts it as a withheld region.
- Consequences:
  - "Click Reports … check title is Reports" cannot learn the link.
  - Neither can "Check the heading says Order confirmed": the asserted heading itself is withheld.
  - Nor can "Select London from City": an option or listbox node named London is withheld.
  - A short literal such as `1` or `OK` scrubs every node whose name contains it.
- The same happens in a full learn. It is not caused by incremental re-learning.

### Is it intended? Partly
- **The boundary is intended.**
  - INPUT-POLICY-01 branch A permits authored nonsecret literals at the *gateway*, but states that "trusted backend materialization and the runner retain their separate private input boundary" (consensus-plan.md:88).
  - It also says "do not widen runner context/source-reference wire semantics to implement the policy" (bridge-design.md:111).
  - account-provider-readiness-design.md:378 says "authored input channel retains existing separately private contract".
- **The collision is not specified anywhere I found.** It removes page structure the model needs, and that structure discloses nothing beyond the literal branch A already lets the model see.
- **Configuration-provenance values are different.** Their provenance is `configuration`, they are resolved only in the backend or runner, and they are excluded from the gateway. They must stay strictly withheld.

### Decision
- **Not a 015 defect, and not fixed in 015.**
  - It is spec-conformant behaviour of the OBS-004 runner boundary and independent of incremental learning.
  - Changing it changes a privacy boundary in the runner contract. That needs @po placement and a security/compliance acknowledgement, alongside the pending OBS-014 compliance approvals on page-metadata export.
  - It also needs a runner rebuild.
  - 015 keeps the D3 fixture correction (`B2A_TITLE="Reports overview"`) as a **disclosed** fixture adjustment.
  - Record **KL-015-Q4** in the 015 QA record: an authored literal contained in a target's accessible name makes that target unobservable.
- **Placement: neither 011 nor 008 alone.**
  - OBS-011 is behaviour-neutral cleanup (G8), so a behaviour change cannot go there.
  - OBS-008 copy can explain the limitation but cannot make the target learnable.
  - Decision: a PO-placed item, **AUTHORED-ECHO-01** (runner + contract text + fixture tier), must land **before the OBS-009 D-C benchmark (≥ 90 %, 20×3) runs**. Otherwise that benchmark measures this artifact [I: assertion and select steps are common in checklist tests].
  - OBS-008 carries one copy obligation only if AUTHORED-ECHO-01 has not landed by its UI work: when a target is not found and its expected or selected text equals an authored literal, explain this.
- **Recommended rule for AUTHORED-ECHO-01** (design direction only; @po/security decide):
  - Strict withholding continues for secrets, `knownSecrets`, captured business values and `configuration`-provenance values.
  - `sourceSpan`-provenance literals (gateway-visible under branch A) are not node-withheld.
  - Optionally, `fill.value` and `selectOption.value` literals get a token-bounded (`strict=false`) echo scrub, and only after their own action was dispatched.
  - The runner already has provenance on every input (`authored-inputs.schema.json` → `source-reference` kinds `sourceSpan|configuration|secretRef`), so no wire change is needed.

---

## Auto-decisions
- `[AUTO-DECISION]` P2: is a closed non-definite refusal (BUSY) of an append terminal? → Yes (reason: the runner caches it per immutable delivery id, so a resend cannot change it; after P1 no transient refusal is expected; failing honestly beats a spin).
- `[AUTO-DECISION]` P2 bound → 3 sends, the same number as bootstrap (`beginBootstrapDelivery:512`), and the frozen lease (reason: the V21 ACK deadline).
- `[AUTO-DECISION]` P2 counter storage → `progress.suffixDelivery` jsonb, no migration (reason: same pattern as `translationBootstrap.deliveries`; progress has no schema validation per the H8 ruling).
- `[AUTO-DECISION]` Q4 placement → before the OBS-009 benchmark through PO placement, not 011 or 008 (reason above).

## Security and compatibility
- Logs add only a closed refusal code; there are no new values.
- The teardown target is the value-free assignment intent (H8).
- The counter is a UUID plus an integer.
- Studio is unreleased (single path, no compatibility layer). The only observable difference is the internal `messageCode` on non-definite closed context refusals.

## What I ran
- Read the files listed in `manifest.json` `inputsRelied`.
- Counted refusal WARN lines in `execution/h8h6-w01-full01*`: 513 lines for `b3f70b8a`, each repeated in the XML and HTML reports.
- Not run: Gradle, JUnit, the runner, a dist build, or any probe.
