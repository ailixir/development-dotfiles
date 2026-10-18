# STUDIO-OBS-015 B2B-01: architect ruling on the owner-loss lifecycle callback while an append ACK is pending (L1)

Author: Aria (@architect), 2026-10-16 UTC.
- I worked read-only on source. I ran no Gradle, no runner and no build, and changed no repo, dist or fixture byte.
- This ruling releases no QA credit and changes no lifecycle. The change spec is for @dev (backend only); Quinn re-gates.
- Inputs and their hashes are listed in `manifest.json`.

Labels: **[V]** means I read the code or the artifact and cite it. **[I]** means inferred and not executed.

---

## 0. What actually happened

| Claim | Verdict | Evidence |
|---|---|---|
| The lifecycle callback is refused by `requireAcknowledged` while the v2 delivery is `PENDING` | **[V] confirmed** | `GuidedSessionService.lifecycle:2385` calls `materialization.verify`, and `GuidedMaterializationService.verify:286` calls `requireAcknowledged`, which raises `REVISION_CONFLICT` 409. The run XML has one stack trace at `07:03:53.247` on `tomcat-handler-8224` with this exact path. |
| "Refused 4×" | **[V] not reproduced; immaterial** | I found **one** refusal stack trace in the ReplayIT XML `system-out`, mirrored once in the HTML report. The runner sends lifecycle once: `runtime.ts closeResources` makes one `callback('lifecycle', …)` with `.catch(()=>undefined)`, and the key is random per call. The count does not affect the ruling. |
| Which identity the runner reports | **[V] v2, the PENDING identity, not v1** | The B2B ACK hold (`ReplayIT` preload `:24983-24997`) awaits `/obs015-ack` **after** `i15Update` returned. `runtime.update` has already set `this.context = next` (v2) before it returns the ACK. The test's `dispatch.stop(runnerContext(), "LEASE_LOST")` therefore passes `ownership.getRuntime` with v2. `runtime.stop` keeps the identity fields, so `closeResources` reports `identity(this.context)`, which is contextRevision 2. |
| Correction to aria-append-ruling01 (joined P3 note: "the runtime is still v1") | **[V] wrong detail** | This case is the A18-4 shape: the delivery was applied and only the ACK is in flight. P3's assignment target is still correct, because it was ruled for both v(n-1) and v(n). |
| Why the session then stays OBSERVING | **[I]** | The only terminal report is dropped. The runner swallows the failure, and the backend has no other signal until the lease or expiry path runs. At 07:04:20-21 there are `STALE_FENCE` refusals on `GuidedPlanningController.proposal` → `translationTransaction:171`, which fits a lease that ran out [V lines; I cause]. |

## 1. Contract ruling

**L1. While an append delivery is `PENDING`, the owner's identity-kind lifecycle report is accepted. It is the only callback exempt from `requireAcknowledged`.**

1. **Why lifecycle is different.**
   - Every other route that calls `verify`, `verifyAndCapture` or `verifyPrefixReceipt` (observations, bootstrap, prepare, dispatch, prefix receipts) **consumes** context. Those must stay refused across a pending append; this is ledger 46.
   - `lifecycle` consumes nothing. It only calls `stop()`, which is monotone: it moves the session to a terminal state, revokes ADMITTED actions and marks DISPATCHING actions `ACK_LOST`.
   - While a delivery is pending, V21 guarantees there are no ADMITTED or DISPATCHING actions (append refused otherwise, at `V21:166-171`) and no unexpired unadmitted preparations. So the outcome is `FAILED`, and no action, preparation, binding or counter is created.
2. **Identity binding: exactly two backend-derived identities, compared on all ten fields.**
   - **v(n)** = `identity(context(session))`. While pending, this is the frozen issued metadata, which V21 forces to equal the head row (`V21:258-271`). It covers the case where the runner applied the delivery and its ACK is in flight or lost. This is this run's case.
   - **v(n-1)** = the same identity with `contextRevision - 1`. It covers the case where the runner never applied the delivery.
   - This derivation is exact because V21 makes `context_id`, `worker_id`, `owner_fence`, `scope_hash`, `source_revision` and `configuration_revision` immutable on the materialization row (`studio_guided_materialization_identity`). Between v(n-1) and v(n) only `context_revision` changes. A pending delivery always has `context_revision >= 2` (CHECK).
   - v(n-1) is the last acknowledged version. Only one delivery can be pending (`uq_015_delivery_live`), and an append is refused while one is pending. So v(n-1) was either v1 (bootstrap) or an `ACKNOWLEDGED` delivery.
   - **"Last acknowledged identity only" is REJECTED.** It would still refuse this run's callback, which carries v2.
   - **"Pending identity only" is REJECTED.** It would refuse a runner that never applied v(n).
   - **The assignment is not used as the binding.** The assignment-kind lifecycle stays its own route (`GuidedInternalController:114-116` → `assignmentLifecycle`) and is unchanged.
3. **The existing gates are unchanged and still apply first.** In `internal()` and `owner()`:
   - the role is `owning-worker` and `caller.getName() == owner.workerId`;
   - the `X-Owner-Fence` header equals the current fence and the lease is unexpired;
   - the idempotency duplicate check runs;
   - `active()` passes.
   - `context()` also requires `live`, the same worker and the same fence (`assembleContext:188-194`), and the issued `context_hash` (`EVIDENCE_MISMATCH`).
4. **Without a pending delivery, behaviour is exactly today's `verify`:** head identity only, plus `requireAcknowledged`, which passes.

### No stale or forged callback gains authority [V]
- **Forged:** the callback needs the owning worker's internal credentials and the current fence. That same principal can already end the session at any moment through the assignment-kind lifecycle: `assignmentLifecycle` → `GuidedAssignmentStore.verifyLifecycle:164-178`, which has no `requireAcknowledged`. L1 therefore grants **no new capability**. It only lets the identity-kind report express a right the worker already holds.
- **Stale:** any other `contextRevision` (≤ n-2 or ≥ n+1), `contextId`, `ownerFence`, `workerId`, `scopeHash`, source or configuration revision, or `versions` gives `STALE_FENCE`. A callback from an earlier owner fails at `owner()`. A replay after the session is terminal fails at `active()` or returns the duplicate.
- **Effect ceiling:** the only effect is `stop(session, "FAILED" | "UNKNOWN_OUTCOME")`. It cannot acknowledge, append, bump, prepare, dispatch or reserve.

### Ledger 77, at-most-once, and P3 consistency
- **Ledger 77 (owner or browser loss while the ACK is pending changes nothing).** `stop()` writes only:
  - session state and progress (`teardownStatus`, `teardownRequest`);
  - `materializations.live=false`, which V21 allows because `materialization_revision` is unchanged;
  - `assignments.live=false`.

  It does not touch snapshots, allocations, producers, `materialization_revision` or the delivery row. The delivery stays `PENDING` with `ack IS NULL`. P3's IT already proved this for a pending delivery under `failTranslation` [V, review.md §2].
- **The late ACK changes nothing.** After the lifecycle commits, the released runner ACK reaches `acknowledgeContext` → `translationTransaction`. The session is terminal, so `active()` refuses it, and in any case V21 refuses the ACK because `NOT m.live`.
  - `pushMaterializedContext` (P2) rethrows a non-closed failure.
  - If the runner instead replies with a closed refusal, the `REFUSED` marker transaction itself fails on the terminal session. Either way nothing is written [V code; I runtime].
- **Either arrival order settles the session.**
  - If the ACK lands first, the delivery becomes `ACKNOWLEDGED` and the later lifecycle is verified strictly against the head v(n). The runner holds v(n), so it is accepted.
  - If the lifecycle lands first, see the late-ACK case above.
  - A runner at v(n-1) cannot produce an ACK at all.
- **At-most-once.** No application effect can be in flight under a pending delivery (V21 plus `requireAcknowledged` on every consuming route, which is kept). `UNKNOWN_OUTCOME` arises only if a DISPATCHING action exists, and V21 makes that impossible here.
- **P3.** `stop()` runs inside the accepted lifecycle transaction while the delivery is still `PENDING`, so `unacknowledgedAppend` is true and the durable target is the **assignment** (`GuidedSessionService:2510-2521`). The runner answers the assignment stop with a `STOPPED` receipt: its `entry.stopping` is already set by the test's identity stop, and the digest matches (`ownership.ts:144-158`).
  - The test's identity stop blocks until `closeResources` has awaited the lifecycle callback. The backend `teardownAttempt` runs only `afterCompletion(COMMITTED)`. So there is no deadlock [V code; I timing].
- **Runner change: none. Dist rebuild: none.** No wire, schema or migration change. The lifecycle schema already carries identity plus `reason`, including `LEASE_LOST`.

### Rejected options

| Option | Ruling | Reason |
|---|---|---|
| Drop `requireAcknowledged` from `verify` in general | REJECTED | Observations, prepare and dispatch would cross the append, which breaks ledger 46 and the P2 at-most-once argument. |
| Accept only the last acknowledged v(n-1) | REJECTED | It does not fix this run, where the runner reports v2. |
| Accept only the pending v(n) | REJECTED | It strands a runner that never applied the delivery. |
| Runner reports loss with kind `assignment` while an ACK is unconfirmed | REJECTED | The runner cannot know whether the backend recorded its ACK. It changes the bridge semantics for every session and needs a dist rebuild. It also binds more loosely: any version under the assignment. |
| Leave it, and rely on lease expiry or the reaper | REJECTED | Browser loss stays unreported until the lease ends. B2B-01 requires settlement within 30 s, and ledger 77 expects the loss to end the session. |

---

## 2. Change spec (backend only; mechanically applicable)

### 2.1 `backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedMaterializationService.java`
Insert directly after `verify(...)` (current `:285-292`):
```java
  /**
   * STUDIO-OBS-015 B2B-01 L1: identity binding for the owning worker's terminal lifecycle report.
   * Without a PENDING append delivery this is exactly {@link #verify}. With one, the runner holds
   * v(n-1) (delivery never applied) or v(n) (applied, ACK in flight or lost); exactly those two
   * backend-derived identities are accepted. Lifecycle consumes no context and only ends the
   * session, so it is the one callback exempt from {@link #requireAcknowledged}.
   */
  public void verifyLifecycle(JsonNode session, JsonNode envelope) {
    if (pendingDeliveryId(session.path("sessionId").asText()) == null) {
      verify(session, envelope);
      return;
    }
    ObjectNode issued = identity(context(session));
    int revision = issued.path("contextRevision").asInt();
    require(revision >= 2, "RUNTIME_INCOMPATIBLE", 409);
    ObjectNode previous = issued.deepCopy().put("contextRevision", revision - 1);
    require(sameIdentity(issued, envelope) || sameIdentity(previous, envelope), "STALE_FENCE", 409);
  }

  private static boolean sameIdentity(ObjectNode expected, JsonNode envelope) {
    for (var fields = expected.fields(); fields.hasNext(); ) {
      var field = fields.next();
      if (!field.getValue().equals(envelope.path(field.getKey()))) {
        return false;
      }
    }
    return true;
  }
```
- `verify`, `verifyAndCapture`, `verifyPrefixReceipt`, `bump` and `requireAcknowledged` are **unchanged**.
- `context(session)` may lazily issue a pending delivery's metadata. That is the same as `stop()` already does, and a refused lifecycle rolls the transaction back.

### 2.2 `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java`
In `lifecycle(...)` (`:2372-2392`), replace the line at `:2385`:
```java
          materialization.verify(session.document(), request);
```
with:
```java
          // OBS-015 B2B-01 L1: owner/browser loss must land while an append ACK is pending.
          materialization.verifyLifecycle(session.document(), request);
```
- Nothing else changes: not `stop()`, not P3, not `assignmentLifecycle`, not the controller.

### 2.3 Not changed
- Runner, dist, schemas, migrations, `GuidedTranslationService`, `GuidedRunnerClient`, `GuidedDispatchService`.

---

## 3. Tests (@dev; Quinn re-gates)

**Integration (embedded PG), `GuidedServiceTransportFaultIT`.**
- Reuse `translationTeardownService`, `materializedTeardownSession` and `appendPendingDelivery`.
- Worker auth: `new GuidedInternalSecurity.Identity(<session owner.workerId>, "owning-worker")`, with the fence header `1`.
- Request: `materialization.identity(sessions.runnerContext(controller, id, 1))`, plus `reason`, captured **before** any stop.

Cases:
1. **`lifecycleAtPendingAppendIdentityEndsSessionAndChangesNothing`**: identity with contextRevision 2 and `LEASE_LOST`.
   - Before the call, capture:
     - `materialization_revision`;
     - the allocations and producers rows;
     - the delivery `status|ack IS NULL|context_hash`;
     - the delivery count;
     - the frozen context and the `contextDeliveryId`.
   - Expect:
     - the returned document has state `FAILED`;
     - `teardownRequest.target` equals the assignment, with `assignmentId` and no `contextRevision`;
     - the stub `TeardownStub(o -> null)` gets exactly 1 call, `assignment|reason`, and the status becomes `CONFIRMED`;
     - the delivery is still `PENDING|true` with the same hash, the count is 1, and revision, allocations and producers are unchanged;
     - `materializations.live` is false.
   - Then the late ACK: build a `ContextAcknowledgement` from the captured frozen context and delivery id, with `contextHash = GuidedContracts.hash(frozen)`. `acknowledgeContext(controller, id, 1, ack)` throws a `GuidedSessionException`, and the delivery is still `PENDING|true`.
2. **`lifecycleAtLastAcknowledgedIdentityEndsSession`**: the same setup with contextRevision 1. Expect `FAILED`, the assignment target, `CONFIRMED`, and the delivery still `PENDING|true`.
3. **`lifecycleAtAnyOtherIdentityIsRefusedWhilePending`**. Each case below gives `STALE_FENCE` 409:
   - contextRevision 0;
   - contextRevision 3;
   - a random `contextId`;
   - envelope `ownerFence` 2 with header 1;
   - another `scopeHash`;
   - fence header 2, which `owner()` refuses.

   After all of them:
   - the state is unchanged and non-terminal;
   - there is no `teardownStatus`;
   - the stub has 0 calls;
   - the delivery is still `PENDING`.
4. **`consumingVerificationStaysRefusedWhilePending`**: `materialization.verify(doc, v2Identity)` and `verifyAndCapture(doc, v2Identity)` both give `REVISION_CONFLICT`. This pins the ledger 46 guard.
5. **Control `lifecycleWithoutPendingDeliveryIsExactlyVerify`**: with no append, contextRevision 0 gives `STALE_FENCE` (v(n-1) is not accepted without a pending delivery). Then v1 gives `FAILED`, an identity target (contextRevision 1, no `assignmentId`) and `CONFIRMED`, with 0 delivery rows.

**Mutation checks, each recorded like `p3-mutation-check.log`:**
- Revert 2.2 to `verify`: case 1 fails with `REVISION_CONFLICT`.
- Drop `previous`: case 2 fails.
- Drop `issued` from the OR: case 1 fails.

**Joined (real runner, current dist; no rebuild).**
- `guidedIncrementalTest --tests …GuidedPublicationReplayIT.incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority`, `--no-daemon`, low lane. Expect `b2bOwnerLoss` to pass:
  - state `FAILED`, within 30 s;
  - `p3AwaitTeardown` `CONFIRMED`;
  - all A77-4 snapshot equalities hold;
  - zero `REVISION_CONFLICT` stack traces from `GuidedMaterializationService.verify` in a `lifecycle` frame;
  - zero `refused the context` WARN lines for the session.
- Then run the full `guidedIncrementalTest` lane. Compared with `w3-w01-full-incr01`, expect 0 newly failing cases, and B2B-01 removed from the 7 failures.
- Regression: the `test` lane cases `incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck` (B2A-02) and `append-input` stay green.
- Dist hash `060d9a53…` must stay unchanged in the receipt.

---

## 4. Residuals (not 015 blockers)
- **R1 [I].** `GuidedSessionEvidenceService` (recording evidence) binds `contextRevision` to the materialization head (`:116-124`).
  - When the runner never applied v(n), its recording settlement after a loss would be refused `STALE_FENCE`.
  - This is evidence, not settlement, and B2B-01 does not exercise it (the runner is at v(n)).
  - Record it for Quinn as a known limit. If @po wants it fixed, apply the same two-identity binding there.
- **R2 [I].** If the owner's lease has already expired when the runner reports loss, `owner()` refuses as today, and settlement falls to the existing expiry and reaper paths. This is unchanged and outside L1.

## Auto-decisions
- `[AUTO-DECISION]` Should lifecycle be accepted while an append is pending? → Yes, lifecycle only (reason: it is non-consuming and monotone, and the same principal already holds this right through the assignment-kind lifecycle).
- `[AUTO-DECISION]` Which identity binding? → The set {v(n) issued, v(n-1)}, compared on all ten fields (reason: the runner holds exactly one of the two, and this run's runner holds v(n)).
- `[AUTO-DECISION]` Should the runner change instead? → No (reason: the runner cannot observe whether its ACK was recorded, and a runner change needs a dist rebuild).

## Security and compatibility
- No new values are logged, and there is no wire, schema or migration change.
- No authority is widened beyond the existing assignment-kind lifecycle, and stale or forged identities are refused as listed above.
- Studio is unreleased (single path, no compatibility layer). Without a pending delivery, behaviour is byte-identical.

## What I ran
- I read the files in `manifest.json` `inputsRelied`.
- I searched the `w3-w01-full-incr01` ReplayIT XML for `requireAcknowledged`. There are 3 traces: one lifecycle trace at 07:03:53.247 (`REVISION_CONFLICT`), and two at 07:23:43 on `reserveModel:1471`. The latter is a consuming route, and refusing it there is correct. The 07:04:20-21 `STALE_FENCE` traces are on the planning proposal.
- Not run: Gradle, JUnit, the runner, a dist build, or any probe.
