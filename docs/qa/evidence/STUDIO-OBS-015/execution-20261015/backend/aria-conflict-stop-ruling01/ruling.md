# STUDIO-OBS-015 aria-conflict-stop-ruling01: PUBLICATION_CONFLICT never requests a runtime stop

Aria (@architect), 2026-10-16. Read-only on source. No Gradle was run, and nothing was committed.
Trigger: `w5-window01/review.md` §2 "New finding", run `w5-w01-full-incr01` (B3B-1, #62).
[V] means I read the code or evidence. [I] means inferred, not executed. Hashes are in `manifest.json`.

> **Line anchors drift.** `GuidedSessionService.java` (mtime 10:19) and `GuidedPublicationReplayIT.java`
> were edited concurrently while I read them; the H8 WARN work is landing.
> - Anchors below are at the hashes in the manifest. The gen-2 `p3AwaitTeardown(id)` is **ReplayIT:5009 in
>   the w5 digest and :5032 at `21c41779…`**.
> - Locate by method name, not by line.

## 0. Verdict

**The defect is confirmed in production code. Severity: Medium. It must be fixed before the B3B-1 QA gate.**
Two transitions write the terminal state `PUBLICATION_CONFLICT` and never call `GuidedSessionService.stop`:
- `GuidedPlanPublisher.conflictBeforeClaim` (:248-266);
- `GuidedPublicationRepository.conflict` (:407-426), which the publisher calls at :236-243.

Consequences [V code]:
1. **No durable teardown.** No `teardownStatus=PENDING` or `teardownRequest` is written, so:
   - the H8 reaper (`pendingTeardowns`) never re-drives a stop;
   - `teardownAttempt` (:2607-2639) can never flip the row to CONFIRMED, because it only moves `PENDING → CONFIRMED`.
2. **No stop is sent.** The worker and browser stay alive until the runner's own lease timer fires.
   - `ownership.ts:53` stops the entry with `LEASE_LOST` once the lease lapses.
   - Renewal is refused, because `claim → active()` returns 409 `PUBLICATION_CONFLICT`.
   - So on a healthy runner the leak is [I] bounded by the lease (≤ 30 s, `ownership.ts:68`). On a wedged runner
     nothing retries and nothing ever records it.
3. **Authority stays open.** `studio_guided_assignments.live` and `studio_guided_materializations.live` stay `true`
   on a terminal row. `stop()` closes them at :2577-2578.
4. **No secret-use audit closure.** `SecretAuditLifecycle.guidedTerminal` is never called for these sessions, so:
   - no USAGE closure for open DISPATCH releases;
   - no `recordUnreachedGuided` summary for declared-but-unreached `secretRef`s.

   This is a compliance gap: the audit of the session's terminal outcome is incomplete.
5. **Actions are not settled.** Leftover `ADMITTED` and `DISPATCHING` actions are not revoked or settled.

Evidence [V]: `w5-window01/replayit/failed-test-cleanup-guidedIncrementalTest-62-…json`:
- session `3c920a0f…` has `beforeState PUBLICATION_CONFLICT` and `teardownStatus ""`;
- the SUCCEEDED siblings are `CONFIRMED`;
- `allActualTeardownsConfirmed` is false.

## 1. Audit of every terminal transition (TERMINAL = SUCCEEDED, PUBLICATION_CONFLICT, FAILED, UNKNOWN_OUTCOME, CANCELLED, EXPIRED)

I traced every writer of `studio_guided_sessions.state` [V grep across `src/main`].
- Two methods take whatever state is in the document: `GuidedSessionRepository.save` and `writeRenewalAndCommand`.
- Every terminal value they receive is put there by `stop()` or by the publisher rows below.
- `GuidedTranslationStore` writes progress only.
- `SecretRevocationSweep` writes `revoked_at` and then calls `guidedStop` → `secretRevoked` → `stop`.
- The V19 prune function writes `progress` and `pruned_at` only.
- No migration or trigger sets a terminal state.

| # | Path (GuidedSessionService unless noted) | Terminal state | Calls `stop()`? |
|---|---|---|---|
| 1 | `secretRevoked` :91 | CANCELLED (reason REVOKED) | yes |
| 2 | model settle/accounting over budget :231, :256, :265, :1535 | FAILED | yes |
| 3 | `failTranslation` :391 | FAILED | yes |
| 4 | `annotateLoginFailure` :430 | FAILED | yes |
| 5 | secret resolution refusal :540 | FAILED | yes |
| 6 | `refuseResolvedSecret` :573 | FAILED | yes |
| 7 | `cancel` :742 | CANCELLED | yes |
| 8 | `claim` with uncertain or unrecoverable work :962 | UNKNOWN_OUTCOME | yes |
| 9 | `expire` :1550 | EXPIRED | yes |
| 10 | `lostAcknowledgment` (both overloads) :1611, :1624 | UNKNOWN_OUTCOME | yes |
| 11 | assignment-kind lifecycle (~:1766) | UNKNOWN_OUTCOME / EXPIRED / FAILED | yes |
| 12 | non-SUCCEEDED outcome report :2305 | report state | yes |
| 13 | identity-kind `lifecycle` (L1) :2398 | UNKNOWN_OUTCOME / FAILED | yes |
| 14 | `GuidedPublicationRepository.commit` :391-403, then `publicationCommitted` :2494-2509 | SUCCEEDED | yes, in the same transaction |
| 15 | **`GuidedPublicationRepository.conflict` :422-426 (via publisher :236-243)** | **PUBLICATION_CONFLICT** | **NO** |
| 16 | **`GuidedPlanPublisher.conflictBeforeClaim` :261-263** | **PUBLICATION_CONFLICT** | **NO** |

Only rows 15 and 16 miss the stop.

Non-terminal exits are out of scope:
- Most publisher failures leave the session in FINALIZING: EXPIRED, IDEMPOTENCY_CONFLICT, FORBIDDEN_SCOPE,
  INVALID_CONTRACT, BUDGET_EXCEEDED, MISSING_SOURCE.
- `conflictBeforeClaim`'s early returns (:252-259) also leave the session non-terminal.
- Such a session still ends through `expire()` with a stop (row 9).

## 2. Ruling

### R1: Where the hook goes

**Add `GuidedSessionService.publicationConflicted(String id)`, the twin of `publicationCommitted`. Call it inside
the same transaction that writes `PUBLICATION_CONFLICT`, right after the write, and only when that write actually
happened.**

"After commit, outside the row lock" is already how `stop()` works [V :2534-2560], so nothing new is needed for it:
- **Inside the transaction**, `stop()` writes `teardownStatus=PENDING` and the value-free
  `teardownRequest{target,reason}` together with the terminal state. That is the H8 durability rule.
- **After commit**, `stop()` registers `afterCompletion(STATUS_COMMITTED)`. That callback submits `teardownAttempt`
  to the `guided-teardown` executor, so the network send runs after commit, off the session row lock, and never on
  rollback.
- **Confirmation** happens later in a fresh transaction (`PENDING → CONFIRMED`).

Rejected alternatives:
- **(B) Call `stopSender` / `GuidedDispatchService.stop` from the publisher after its transaction returns.**
  - Nothing durable is written, so a crash or lost ACK leaks with no reaper re-drive. That violates H8.
  - It also duplicates the target selection, the P3 assignment fallback and the reason mapping.
- **(C) A separate follow-up transaction that calls a stop.**
  - A committed terminal row would exist without a `teardownRequest`. That is the same defect class, only narrower.
- **(D) Move the conflict state write into `GuidedSessionService`.**
  - This is larger and crosses package ownership: `conflict()` keeps its guarded SQL, source lock and attempt check
    in `publication/`.
  - It also breaks symmetry with SUCCEEDED, where publication writes the state and the lifecycle owns the teardown.

### R2: Stop reason and code

**Send `reason = "UNKNOWN_OUTCOME"` by reusing the existing mapping in `stop()` (:2539-2544) unchanged. Persist the
state as `PUBLICATION_CONFLICT`.** No contract change.

- The bridge v3 `stop` and `lifecycle` enums are exactly `CANCELLED, EXPIRED, UNKNOWN_OUTCOME, LEASE_LOST,
  CONTEXT_LOST, REVOKED` [V `bridge.schema.json`].
- SUCCEEDED already sends `UNKNOWN_OUTCOME` through the same default branch. The two publication-terminal paths stay
  symmetric.
- In the runner the reason only flows into `closeResources` and an echo `lifecycle` callback [V `runtime.ts:488-500`,
  `ownership.ts:141-147`]:
  - that echo is refused 409 by `active()` on a terminal row;
  - it is swallowed (`.catch`).

  So the reason has no functional effect on cleanup.
- Rejected: **a new enum value** such as `PUBLICATION_CONFLICT`. It would change the v3 schema, runner types, codegen
  ("four byte-identical outputs"), fixtures and pinned hashes, for no behavioral gain.
- Rejected: **`CANCELLED`**. It misstates the cause to the runner and to logs.
- The persisted `errorCode` stays as each path writes it today: `conflictBeforeClaim` sets `PUBLICATION_CONFLICT`,
  and `conflict()` sets none. That difference already exists and is not ruled here (§6).

### R3: Idempotency with a concurrent stop

These are monotone at four levels. No new mechanism is needed.
1. **Row lock.** Every terminal transition serializes on `SELECT … FOR UPDATE` of the session row.
   - `conflict()` updates `WHERE state='FINALIZING'`, and `conflictBeforeClaim` re-checks FINALIZING under the lock.
   - So if cancel, expire, lifecycle (L1) or lost-ACK wins, the conflict write affects 0 rows. The new gate then
     skips the hook, and the winner's own `stop()` has already written the teardown.
   - If the conflict wins, the later callers see a terminal row. `cancel`, `expire` and `lostAck` check
     `!terminal`; the `internal(...)` routes call `active()` and get 409.
   - So `stop()` runs at most once per session.
2. **Hook guard.** `publicationConflicted` calls `stop()` only if `teardownStatus` is absent, like
   `publicationCommitted`. A replay of the hook is a no-op.
3. **In-JVM.** `TEARDOWNS_IN_FLIGHT` de-duplicates the post-commit send and the reaper re-drive.
4. **Runner.**
   - The idempotency key is `"teardown-" + hash(stop body)`, so re-drives join the original stop.
   - `ownership.stopEntry` returns the existing `entry.stopping`, and `runtime.stop` returns `this.closing`.
   - So a self-stop (`LEASE_LOST`, `UNKNOWN_OUTCOME`) and our stop join each other whatever the reason.

### R4: Consistency with H8, P3 and L1
- **H8.**
  - The durable request is written in the same transaction as the terminal state.
  - The reaper already includes `PUBLICATION_CONFLICT`: `GuidedSessionRepository.TERMINAL_STATES` :15-16, used by
    `pendingTeardowns`, `abandonedTeardowns` and `teardownRequest`.
  - The count-only abandoned WARN (`aria-warn-ruling01`) covers these rows with no change.
- **P3.** Targeting is inherited from `stop()`. If an append delivery is pending (`unacknowledgedAppend`), the
  bootstrap is unacknowledged, or the context is unreadable, the target is the assignment. No special case.
- **L1.**
  - An identity lifecycle that arrives during a pending append either ends the session first (then the conflict
    writes 0 rows) or loses to the conflict and gets 409 `PUBLICATION_CONFLICT` from `active()`.
  - Either way exactly one teardown is recorded.
  - No consuming route gains authority.

## 3. Exact change spec (production: 3 files; no schema, contract, migration or config change)

**3.1 `GuidedSessionService.java`.** Add this directly after `publicationCommitted` (:2494-2509):
```java
  /**
   * STUDIO-OBS-015 aria-conflict-stop-ruling01: publication owns the PUBLICATION_CONFLICT write; the
   * transaction that made it requests the one monotone teardown (H8: the durable request commits
   * with the terminal state; the send runs after commit).
   */
  public void publicationConflicted(String id) {
    require(
        org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive(),
        "RUNTIME_INCOMPATIBLE",
        409);
    var session = repository.lock(id);
    require(state(session).equals("PUBLICATION_CONFLICT"), "PUBLICATION_CONFLICT", 409);
    if (!session.progress().has("teardownStatus")) {
      stop(session, "PUBLICATION_CONFLICT");
    }
  }
```
- Do **not** edit `stop()`, its reason ternary, `teardownAttempt` or the reaper.
- The `require` is strict on purpose, like `publicationCommitted`. Both call sites gate on a real transition, so it
  cannot fire. If it ever did, it rolls back with the same public code `PUBLICATION_CONFLICT` 409, which fails closed.
- `stop(session, "PUBLICATION_CONFLICT")` re-saves the same terminal state. V14's `tr_guided_identity` allows a
  terminal row to keep its own state (it refuses only `NEW.state <> OLD.state`). The SUCCEEDED path already relies on
  this.

**3.2 `GuidedPublicationRepository.conflict`** (:407-426). Change the return type from `void` to `boolean`. It
returns true only when this call moved the row FINALIZING → PUBLICATION_CONFLICT:
```java
  /** True iff this call moved FINALIZING to PUBLICATION_CONFLICT; the caller then requests teardown. */
  public boolean conflict(String id, String expectedSnapshotHash, Instant now) {
    GuidedPublicationBaseRepository.transaction();
    if (receipt(id).isPresent()) {
      return false;
    }
    ObjectNode s = session(id);
    bases.lockCurrent(UUID.fromString(s.path("testId").asText()));
    if (!s.path("state").asText().equals("FINALIZING")) {
      return false;
    }
    require(/* unchanged attempt/snapshotHash check */, "IDEMPOTENCY_CONFLICT", 409);
    return jdbc.update(/* unchanged UPDATE … WHERE session_id=? AND state='FINALIZING' */, id) == 1;
  }
```
The repository stays free of any `session` package dependency; the publisher owns the hook call.

**3.3 `GuidedPlanPublisher.java`.**
- In the catch at :235-243:
  ```java
          sessions.transaction(
              () -> {
                sessions.lock(id);
                if (publications.conflict(id, prepared.snapshot().hash(), clock.instant())) {
                  lifecycle.publicationConflicted(id);
                }
                return null;
              });
  ```
- In `conflictBeforeClaim`, insert one line after `sessions.save(current);` (:263), still inside the same lambda:
  ```java
          lifecycle.publicationConflicted(id);
  ```
- No wiring change.
  - `lifecycle` is already a constructor dependency: `GuidedPublicationConfiguration:84-86` in production and a real
    service in `GuidedSessionIT:1675-1677`.
  - `ObservedArtifactLowererTest:391-394` passes a Mockito mock, so the call is a no-op there.

Compatibility: the public signature change from `void` to `boolean` is source-compatible with the only other callers,
the three `GuidedPublicationRaceTest` statements at :226, :258 and :332, because a discarded result is legal.
`[AUTO-DECISION]` Backfill existing `PUBLICATION_CONFLICT` rows that lack teardown? → **No** (reason: Studio is
unreleased and has a single path with no compatibility layers; no deployed rows exist; a test DB is recreated per run).

## 4. Tests

**4.1 Unit-level, real Postgres: `GuidedPublicationRaceTest`. Edit existing methods only.**
- `twoSessionsContendOnActualTestLockOnlyOnePublishes`, loop at :217-235: capture the result of `conflict` through
  `db.tx.execute(t -> { db.sessions.lock(..); return db.publications.conflict(..); })` and assert `isFalse()`. The
  state is unchanged, which is already asserted.
- `race(...)` at :254-260: return or record the boolean. Assert that it equals
  `stateBefore == FINALIZING && stateAfter == PUBLICATION_CONFLICT`.
- `terminalOrChangedAuthorityCannotAdoptOrBeOverwrittenByLateConflict[cancel]` at :329-340: assert `isFalse()`.
  CANCELLED is unchanged, which is already asserted.

**4.2 Hook and teardown: `GuidedServiceTransportFaultIT` (TFIT). Four new methods** reusing `TeardownStub`,
`teardownService`, `assignedExpiringSession`, `translationTeardownService`, `materializedTeardownSession`,
`appendPendingDelivery`, `teardownProgress`, `teardownState`, `teardownInvariants` and `awaitTeardown`.

The fixture for all four mirrors `conflictBeforeClaim`:
- transaction 1: lock, then set `state=FINALIZING` and save. This is the same pattern as
  `GuidedSessionIT.takeoverCannotReopenFinalizingAfterExecutedEffects`.
- transaction 2: lock, set `state=PUBLICATION_CONFLICT` and `progress.errorCode=PUBLICATION_CONFLICT`, save, then
  call `sessions.publicationConflicted(id)`.

The four methods:
- **T1 `publicationConflictTeardownTargetsTheAssignmentAndConfirms`.** The stub always returns OK.
  - `stub.calls` is exactly `[assignment + "|UNKNOWN_OUTCOME"]`.
  - The status reaches `CONFIRMED`, and `teardownRequest` is absent.
  - `teardownState(id)` is `PUBLICATION_CONFLICT`.
  - `SELECT live FROM studio_guided_assignments WHERE session_id=?` is false.
- **T2 `publicationConflictedIsIdempotentAndFailsClosed`**, starting after T1's flow:
  - a second hook call in a new transaction adds no stub call and leaves progress byte-identical;
  - calling the hook outside a transaction raises `RUNTIME_INCOMPATIBLE`;
  - on a separate session ended by `cancel` (CANCELLED, one stub call with `|CANCELLED`), the hook in a transaction
    raises `PUBLICATION_CONFLICT`, the state stays CANCELLED, and `stub.calls` is unchanged.
- **T3 `publicationConflictTeardownIsRedrivenAfterResendsExhausted`.** The stub fails `ordinal <= 3` with
  `UNKNOWN_OUTCOME`.
  - After 3 calls with nothing in flight, the status is `PENDING`, `teardownRequest.reason` is `UNKNOWN_OUTCOME`, and
    `target` equals the assignment. Snapshot `teardownInvariants`.
  - Then call `redriveTeardowns(TEARDOWN_WINDOW, 32)`. The status becomes `CONFIRMED`, `stub.calls` has 4 identical
    entries, and the invariants are unchanged.
  - This proves the reaper re-drives `PUBLICATION_CONFLICT`.
- **T4 `pendingAppendPublicationConflictTargetsTheAssignment` (P3).** Use `materializedTeardownSession` with
  `appendPendingDelivery`, then the conflict fixture.
  - `teardownRequest.target` equals the assignment: it has `assignmentId` and no `contextRevision`.
  - The delivery row is still `PENDING|true`.
  - Mirror `pendingAppendDeliveryTeardownTargetsTheAssignment` (:4008).

**4.3 Joined proof: `GuidedPublicationReplayIT`. No test edit and no oracle change.**
- The proving method is **B3B-1 `incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution`**,
  generation 2, at the final `p3AwaitTeardown(id)`: ReplayIT:5009 in the w5 digest, :5032 at `21c41779…`.
- The destructive source CAS reaches `conflictBeforeClaim` through `prepare → bases.requireCurrent →
  PUBLICATION_CONFLICT` (publisher :100-104) [V].
- After the fix it must reach `CONFIRMED` within 20 s against the actual runner.
- `failed-test-cleanup-…-62-…json` must no longer be emitted, or must show every session `CONFIRMED`/`NOT_ASSIGNED`
  with `allActualTeardownsConfirmed: true`.
- [I] Path 15 (post-claim `conflict()`) has no joined body with a live runtime. It is covered by 4.1 (the gate) and
  4.2 (the identical hook). An extra joined body is optional, not required for the gate.

**4.4 Required runs** (collector, `--no-daemon`, fresh labels):

| Selection | Expected |
|---|---|
| B3B-1 alone | PASS |
| full `guidedIncrementalTest` | **62/62** (w5: 61/62) |
| `test` lane ReplayIT + AuthorityIT | 73/73 |
| TFIT + StopKeyTest + BridgeIntegration + BridgePlannedIT | 60/60 + 4 new = **64/64** |
| `GuidedPublicationRaceTest` | all pass |
| `GuidedSessionIT` | all pass |
| `SecretAuditLifecycleIT` | all pass |

- `GuidedSessionIT.noStateCanPublishWithoutExactVerifier` is the guard that a non-FINALIZING
  `conflictBeforeClaim` does not transition and does not stop.
- `SecretAuditLifecycleIT` is required because `guidedTerminal` now runs for conflict sessions.

## 5. Security implications
- **Fixed: credential residency.** A guided run that logged in through `<secret>` refs keeps an authenticated browser
  context and its runner-held `values`/`secretValues` alive after a terminal outcome, until lease loss. The stop clears
  them immediately (`runtime.ts:515-520`).
- **Fixed: authority closure.** Assignment and materialization `live` become false in the terminal transaction, as on
  every other path.
- **Fixed: audit completeness.** `guidedTerminal` now closes the secret-use audit for conflict sessions.
- **New failure mode, consistent with SUCCEEDED.** `guidedTerminal` can throw `IllegalStateException("Missing source
  reference identity")`. That throw would roll back the conflict transaction, the same exposure the SUCCEEDED path
  already has.
  - The publisher then rethrows the original `PUBLICATION_CONFLICT` only if the catch transaction succeeds.
    Otherwise the caller sees a 500-class error and the row stays FINALIZING until `expire()`, which fails closed.
  - Accepted, because it is consistent with SUCCEEDED.
- **No new surface.** There is no new endpoint, route, enum value or data in the stop body. The request stays
  value-free (target identity or assignment plus reason).

## 6. Not ruled here (observed, logged as residuals)
- **R-a (H8, pre-existing, all paths).** `stop()` puts `teardownStatus=PENDING` before it checks `teardownTarget(...)
  != null` (:2534-2537).
  - A null target leaves a row in `PENDING` with no `teardownRequest`.
  - That row is invisible to `pendingTeardowns` and `abandonedTeardowns`, whose `PENDING_TEARDOWN` filter requires
    the request.
  - [I] It is reachable only if `materialization.identity` throws on a stored context.
  - Route it to an H8 follow-up. It does not block this fix.
- **R-b.** Post-claim `conflict()` does not write `progress.errorCode`, but `conflictBeforeClaim` does, so the
  result's `errorCode` differs by path. This is cosmetic and was not changed.

## 7. Trade-offs
| Option | Durability (H8) | Diff size | Contract change | Symmetry with SUCCEEDED | Ruling |
|---|---|---|---|---|---|
| A: hook inside the conflict transaction (this ruling) | yes | ~25 production lines | none | exact | **CHOSEN** |
| B: direct send after the transaction | no | small | none | no | rejected |
| C: follow-up transaction | crash window | small | none | no | rejected |
| D: move the state write into the session service | yes | large | none | partial | rejected |
| New reason enum value | n/a | large | v3 bridge + codegen + fixtures | n/a | rejected |

## 8. Verified vs inferred; not run
- **[V], by reading the code at the manifest hashes:**
  - both missing call sites;
  - all 16 terminal paths;
  - `stop()` H8 mechanics and `afterCompletion`;
  - the reaper's state set;
  - the trigger allowing same-state terminal saves;
  - the bridge reason enum;
  - runner reason use and the lease-loss timer;
  - B3B-1 gen 2 reaching `conflictBeforeClaim`;
  - the cleanup evidence.
- **[I]:**
  - production leak duration (bounded by lease);
  - B3B-1 passing after the fix;
  - R-a reachability;
  - the 500-class mapping of a `guidedTerminal` throw (§5).
- **Not run:** Gradle (forbidden for this role), tests, spotless/checkstyle, SYNAPSE diagnostics, CodeRabbit.
