# Aria ruling: W11 stop-reason race (hard expiry vs lease)

Aria (@architect), 2026-10-17. Read-only. Inputs: `../w11-hard-expiry01/diagnosis.md`, `../w11-hard-expiry01/fix.patch`, runner `studio-runner/src/guided/{ownership,runtime,transport}.ts` (working tree; the patch hunks for `ownership.ts`/`runtime.ts` already appear applied), backend `GuidedSessionService`, `GuidedInternalController`, `GuidedSessionReaper`, `GuidedSessionRepository`, `bridge-design.md`. No tests run. `[V]` = read in source. `[I]` = inferred.

## Verdict

**ACCEPT (1) and (3). ACCEPT (2) with one required change (C-1), to be folded in before the gate.** Without C-1, (2) closes the zero-budget case only. A renewal whose budget is positive but shorter than the claim round-trip still ends the session as LEASE_LOST about 100 ms before E. That is the same class of defect, and non-secret sessions still hit it often.

## 1. Is (1)+(2) the right single-path fix?

**(1) Reason fixed at arm time, tie counts as EXPIRED: correct.** [V] The reason is computed from the same instants as the deadline, inside the same `schedule()` call. Every input change re-arms the timer and recomputes the reason: `applyAcknowledgedLease` (runtime.ts:138), `start` (:188), `update` (:286), and every `ownership.schedule`. So the reason cannot go stale. A tie is EXPIRED by construction: the backend caps the lease at the deadline (`GuidedSessionService.claim`, lines 967-972), so lease == E means "the session ends", not "ownership was lost". Only a lease strictly before E is a lost lease. This is the only reading that does not depend on timer phase.

**(2) Skip the renewal when lease == E and `E − now ≤ CLAIM_MARGIN_MS`: correct, but incomplete.** [V] It is exactly the complement of `insist(timeout > 0, 'LEASE_LOST')` in `requestClaim` when lease == E. It removes the zero-budget throw path and starts no claim. It does not cover a budget that is positive but smaller than the claim latency L. With lease == E, `timeout = min(cap, E − now − 100)`. A renewal starting at `E − 100 − x` with `0 < x < L` arms an abort at E − 100 (ownership.ts:84-88). The abort rejects `LEASE_LOST`, and `renew`'s catch stops the session as LEASE_LOST at E − 100.

How often this happens [I]:
- **Non-secret sessions.** Renewal start points follow roughly `s(k+1) = (2/3)(s(k) − L)`. One start lands in the band (100, 100 + L] with probability of about ln(1 + L/100) / ln(1.5). That is about 12% at L = 5 ms, about 45% at L = 20 ms, and about 100% at L ≥ 50 ms.
- **Secret sessions** (1 s grid): about L/1000.

The new unit test `renews until its hard expiry` uses a zero-latency claim stub, so it cannot see this band.

### Required change C-1 (runner only)

When the lease already equals the session expiry, a renewal claim **whose local abort came from the margin bound** must not stop the session. The armed expiry timers end it as EXPIRED at E.
- "Margin bound" means the budget term `lease − now − CLAIM_MARGIN_MS` was smaller than the 1 s / 10 s cap when the claim started. An abort of such a claim fires at E − 100 by construction.
- Everything else keeps today's behaviour:
  - Backend answers: `REVOKED`, `CLAIM_DENIED` (any non-202), and `checkGrant`/`live` refusals (`IDENTITY_MISMATCH`, `CONTEXT_LOST`, `LEASE_LOST`) still stop immediately with their current reason.
  - A cap-bound timeout (backend silent for the full 1 s / 10 s with more than the margin left) still stops as LEASE_LOST.
  - A lease strictly before E is unchanged.
- Implementation is Dex's choice. Suggested shape: one predicate computed at claim start, `finalRenewal = lease >= expires && expires - now - CLAIM_MARGIN_MS < cap`, passed to the catch. (2) becomes its budget ≤ 0 case. Do not use a latency constant: that only moves the band.

**Fail-closed cost:** at most 100 ms of authority the backend already acknowledged. Authority still ends at E, through two timers that are now both EXPIRED and through `live()` (`Date.parse(expiresAt) > Date.now()`). The lease is never extended. Under `bridge-design.md:153`, "expiry … closes local authority": with lease == E, the expiry is the closer, so no spec text changes. Record C-1 as a one-line row in the story's W11 deviation/notes table.

**Required tests for C-1** (fake timers, in `stopReason.test.ts`):
- (a) Secret session, grid renewal at E − 110 (`lifeMs: 4_110`), claim stub resolving after 20 ms. Expect EXPIRED, exactly one lifecycle message, no stop before E. This test must fail on the current patch.
- (b) Non-secret session to hard expiry with 20 ms claim latency, swept over at least 10 `lifeMs` values. Expect EXPIRED for all.
- (c) Controls, unchanged on both versions:
  - lease < E with a claim slower than the margin: LEASE_LOST;
  - lease == E, cap-bound budget, claim never answers: LEASE_LOST at the cap;
  - lease == E inside the band, stub rejects `REVOKED`: REVOKED.

## 2. Wire and backend contract: does (2) or C-1 change anything?

**Wire: no change.** Same reason enum (`bridge.schema.json`, `assignment-lifecycle.schema.json`), same routes, same claim body. No openapi or schema edit and no digest re-anchor. The claim count drops by one in the last ≤ 100 ms (C-1: the last claim may be abandoned locally, as today). No backend logic needs a renewal near expiry.

**What the backend does with the runner's reason** [V]:

| Path | Runner sends | Backend handling | Effect of the reason |
|---|---|---|---|
| Context lifecycle (any session with a runtime: the normal case) | `POST …/lifecycle` with fence, sent **after browser close** (runtime.ts:594) | `service.lifecycle` → `internal()`. `owner()` requires `leaseExpiresAt > now`; `active()` requires non-terminal and `expiresAt > now`. If accepted, the state becomes **FAILED** (or UNKNOWN_OUTCOME if any action is DISPATCHING) | **Reason ignored.** At or after backend E, the call is refused with 409 STALE_FENCE; the runner swallows it (`.catch`). The reaper (`fixedDelay` 10 s) then sets **EXPIRED**, with teardown reason EXPIRED |
| Assignment lifecycle (pre-context, no runtime) | `kind:'assignment'`, no fence | `assignmentLifecycle`: only `!terminal`; **not** fenced by lease or expiry | `EXPIRED` → state EXPIRED. Anything else (including LEASE_LOST) → **FAILED** |

**Backend-visible change for real sessions: yes, and it is the correct one.** [I on frequency]
- **Race 1 on a context session** (stop at E − 1 ms): the callback lands after close, which is normally after backend E. It is refused, so the backend already showed EXPIRED. Little visible change, unless the runner clock runs ahead of the backend by more than the close time.
- **Race 1 on an assignment-only entry:** the state was FAILED and now becomes EXPIRED.
- **Race 2 / band, non-secret sessions** (stop at E − 100 ms + close time): when close is quicker than about 100 ms plus clock skew, the callback is accepted before E and the session is FAILED. With (2) + C-1 the stop is at E, the callback is refused, and the reaper sets EXPIRED.

So yes: some non-secret sessions that reach hard expiry move from FAILED to EXPIRED. That is correct. The user hit the session time limit. FAILED misattributes that, carries no `errorCode`, and makes later commands on the session answer `PUBLICATION_CONFLICT` (`active()`, line 2588) instead of `EXPIRED`. Other consumers:
- `secretAudit.guidedTerminal` now records the true terminal state.
- Retention, CSI budget and terminal sets treat FAILED and EXPIRED alike (no change).
- No backend or runner metric keyed on the lifecycle reason was found (grep; not exhaustive).

**Tests and docs that assume the old reason: none found.**
- Backend ITs (`GuidedSessionIT:1496`, `GuidedServiceTransportFaultIT:4256-4420`, `GuidedPublicationReplayIT`) post hand-built `LEASE_LOST` bodies. They do not depend on runner timing, and none asserts that a hard-expiry session ends FAILED.
- Runner `ownership.test.ts:35` asserts LEASE_LOST for a lease that ends before E. That is a control the fix preserves (Dex's unit tier: 2286/0, not re-run by me).
- Docs: `bridge-design.md:153` is consistent, as above.

**Follow-up F-1 (pre-existing, backend, not a W11 gate item):** `service.lifecycle` ignores `reason`. An EXPIRED report accepted just before backend E still becomes FAILED. That happens when the runner clock is ahead of the backend, or when the close is faster than the skew. Recommendation: mirror `assignmentLifecycle:1822` by mapping reason EXPIRED to state EXPIRED, optionally only when `expiresAt − now` is within a small tolerance, so a worker cannot relabel an early stop. Security: owning-worker mTLS identity and fence are already required, and the field changes only the terminal label, so risk is low. Route this to @po for story placement.

## 3. Risks of skipping the claim

- **The backend does not expect a final renewal** [V]. At lease == E a claim is a no-op extension (`lease = min(now+30 s, deadline)`, lines 967-979). It writes the same lease plus one `studio_guided_commands` 'claim' row, which is an idempotency record, not an audit trail. The reaper and the expiry logic key only on `expiresAt`. No backend code counts renewals.
- **Ownership audit: no gap.** The secret audit fires on terminal (`guidedTerminal`), not per renewal. The lost evidence is one no-op idempotency row per session.
- **Revocation.** `SecretRevocationSweep` runs synchronously before each claim response, so the renewal also acts as a revocation probe. Skipping it in the last ≤ 100 ms bounds a missed revocation by E, which comes ≤ 100 ms later. The backend also pushes the stop itself (`secretRevoked` → `stop(CANCELLED)` with errorCode SECRET_USE_REVOKED and a REVOKED teardown), independent of the runner's reason. The 2 s cutoff oracle is unaffected. Only the runner-side label in that ≤ 100 ms window can read EXPIRED instead of REVOKED; the backend state is authoritative. Under C-1, a backend REVOKED answer still wins.
- **Control-state detection** (terminal, access or source change seen through a refused renewal): kept. C-1 defers only local margin aborts. Backend refusals still stop at once, and backend-initiated `/stop` with H8 redrive is unaffected.
- **Fixture assertion (3), `TIMER_EARLY_MS = 10`: accepted.** It is stricter for premature stops (asserts the stop instant, not a 25 ms poll) and looser only in the 0-10 ms band that a Node timer cannot honour. That is far below the 100 ms margin. The `EXPIRED` assertion is unchanged.

## Summary for the gate

| Item | Ruling |
|---|---|
| (1) arm-time reason, tie = EXPIRED | ACCEPT |
| (2) zero-budget skip | ACCEPT, completed by **C-1** (margin-bound final renewal abort → EXPIRED via expiry timer) plus tests (a)-(c) |
| (3) unit tests + fixtures hunk | ACCEPT |
| Wire / schema / openapi | Unchanged |
| Backend-visible | Hard-expiry sessions misattributed as FAILED now end EXPIRED (correct). No test or doc depends on the old outcome |
| F-1 backend `lifecycle` ignores reason | Pre-existing; follow-up via @po, not gate-blocking |
