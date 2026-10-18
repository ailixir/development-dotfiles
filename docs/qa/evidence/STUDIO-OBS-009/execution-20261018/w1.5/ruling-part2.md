# STUDIO-OBS-009 W1.5 (lane AR-W1), part 2: R1, ADJ-1 (C1), the A4 tripwire, go/no-go

- **Author:** Aria (@architect). **Date:** 2026-10-18. **Mode:** YOLO, docs only. Part 1 is `ruling-part1.md` in this directory.
- **Binding:** from now on, for lanes B, B-W3, D3 and DE. Root applies the `lanes.json` edits in §5.
- **Inputs:**
  - `../pr-be/receipt.md`. Credited runs: `obs009-prbe-r1-02`, results sha256 `66955e17…`; `obs009-prbe-adj1-02`, results sha256 `29dad2cc…`.
  - `../d3/receipt.md` (D3.0) and `../i/receipt.md` (I.0).
  - My T0 A4, A11 and C1 (`../../prep-20261016/t0-rulings/ruling.md` §1 A4, A11, §2 C1).
  - Story AC-11 ADJ-1 a–c (`STUDIO-OBS-009.story.md:261-271`) and R1 a–e (`:308-345`).
  - The 012A R8 ruling (`STUDIO-OBS-012A/root/architect-ruling-r8-preready-selfstop.json`, `-r8-adj.json`).
- **What I ran:** read-only `cat -n`/`awk`/`grep`/`python3 -c` over the cited files. No build, test, Gradle or git command, and no source change.
- **Legend:** **[V]** verified today by reading `file:line`; **[I]** inference.

---

## 1. R1: recording evidence during a pending append ACK

### 1.1 Probe result

**Reproduced** [V receipt].
- `recording-evidence` at v(n-1), sent while the v(n) delivery is `PENDING`, gets `409 STALE_FENCE`.
- The head-revision control is accepted, so the fixture is not the cause.
- The refusing check is the identity `require` at `GuidedSessionEvidenceService.java:116-126`. Its revision term is at `:120`: `context.contextRevision() == request.path("contextRevision").asInt()`. That term compares only against the materialization head row (`GuidedSessionEvidenceRepository.java:57-73`) [V].

R1 therefore does not close as "not reproduced".

### 1.2 Written non-consuming confirmation (AC-11 R1 b precondition)

**Confirmed, re-read today.** Recording evidence is non-consuming in L1's sense.
- `record()` (`GuidedSessionEvidenceService.java:79-172`) does five things: role and owner checks; fence and version checks; identity check; idempotency lookup; the DB-clock window check and the one-recording check.
- It then writes exactly two things: one evidence row (`evidence.insert`, `:158-168`) and the idempotency record of the command (`sessions.command`, `:170`).
- It creates no action, preparation, binding or counter. It calls neither `verify` nor `requireAcknowledged`. It changes no materialization or delivery.
- `GuidedRecordingTimings.acceptAndDerive` only reads the ledger (`:151-153`).

So the T0 A11 condition is met, and **the binding is required.**

### 1.3 Ruling: one derivation, used by both routes

**`GuidedMaterializationService`** (`bridge` package):
1. Add the pure function:
   ```java
   public static java.util.Set<Integer> acceptedContextRevisions(int head, boolean appendPending) {
     if (!appendPending) return java.util.Set.of(head);
     require(head >= 2, "RUNTIME_INCOMPATIBLE", 409);
     return java.util.Set.of(head, head - 1);
   }
   ```
   Add the instance form `acceptedContextRevisions(String sessionId, int head)`, which is `acceptedContextRevisions(head, pendingDeliveryId(sessionId) != null)`. It reuses the one pending query at `:154-162` [V].
2. `verifyLifecycle` (`:376-386`) is re-expressed through it, with identical behaviour:
   - no delivery pending: `verify(session, envelope)`, exactly as today (`:377-379`);
   - a delivery pending: accept iff `sameIdentity(issued.withRevision(r), envelope)` for some `r` in the accepted set.

   This is the same as today's `sameIdentity(issued) || sameIdentity(previous)` at `:385`, including the `RUNTIME_INCOMPATIBLE` rule from `:383`. **`sameIdentity` keeps its one body** (`:388-396`).

**`GuidedSessionEvidenceService`:**
3. The constructor gains a `GuidedMaterializationService materialization` argument (placed after `evidence`). At `:120`, replace **only** the revision term with `materialization.acceptedContextRevisions(id, context.contextRevision()).contains(request.path("contextRevision").asInt())`.
   - Every other term on `:116-126` stays byte-identical: `workerId`, `ownerFence`, `contextId`, `sourceRevision`, `configurationRevision`.
   - So do the scope check (`:96-97`), owner check (`:98-102`), fence check (`:104-107`), versions check (`:108-111`) and idempotency (`:128-135`).
   - The read happens inside the existing transaction, after `sessions.lock(id)` (`:88-90`), as L1's lifecycle route does under its session lock (`GuidedSessionService.java:2505-2515`) [V for both call sites; that the delivery ACK takes the same lock is [I], not required: a race could only accept one more revision of the same owner and fence for evidence].
   - In the impossible case of a pending delivery at head 1, the route answers `409 RUNTIME_INCOMPATIBLE` instead of `STALE_FENCE` [I that it is unreachable]. Both are refusals.

**Wiring and tests:**
4. `GuidedEvidenceConfiguration.guidedSessionEvidenceService` (`:43-51`) takes a `JdbcTemplate` and passes `new GuidedMaterializationService(jdbc, contracts)`. That is the same stateless construction `GuidedSessionConfiguration.java:61-62` and `:128` already use [V]. There is no new bean and no second copy of the pending query. The `evidence → bridge` package edge is new; no cycle exists (`bridge` imports nothing from `evidence`) [V grep].
5. `GuidedSessionEvidenceTest` updates its constructor call only.

**Unchanged:** `requireAcknowledged` on every consuming route; the runner and `dist`; schemas; migrations; OpenAPI.

### 1.4 Tests for lane B (`GuidedEvidencePendingAppendIT`, the PR-BE baton)

| Id | Case | Expected |
|---|---|---|
| R1-1 | v(n-1) while pending (today's probe case) | 202. One recording row whose `recordingId`, `state`, `partial` and `timings` are the report's own. The delivery stays `PENDING`. |
| R1-2 | v(n) while pending (today's control) | 202, as today |
| R1-3 | `contextRevision` n-2 while pending | `409 STALE_FENCE`, nothing written (no evidence row, no command row) |
| R1-4 | `contextRevision` n+1 while pending | the same |
| R1-5 | foreign `contextId` at v(n-1) while pending | the same |
| R1-6 | foreign fence at v(n-1) while pending (header and body) | `409 STALE_FENCE` from `:104-107`, nothing written |
| R1-7 | **no** pending delivery, v(n-1) | `409 STALE_FENCE`, as today |
| R1-8 | L1 regressions: the existing lifecycle tests in `GuidedServiceTransportFaultIT` and `GuidedSessionIT` | green, unchanged |
| R1-M | mutation: make the derivation return `{head}` while pending | R1-1 red. Record it, then revert. |

**Tripwires (B `verify`):**
- `grep -rn 'boolean sameIdentity' backend/src/main` returns exactly 1;
- `grep -rn 'contextRevision() ==' backend/src/main/java/com/citi/put/checks/studio/guided/evidence` returns 0.

**R1 d (joined, owner loss at v(n-1); the recording plays and seeks):** stays B-W3 after F-merge, as planned.

**R1 e:** KL-015-R1 stays disclosed until R1 d is evidenced.

### 1.5 Security

Evidence only, and the acceptance widens by exactly one revision, only while a delivery is pending. This is the binding already reviewed for L1 in 015. Owner, fence, scope, versions and idempotency checks are unchanged. Nothing becomes consumable. No separate review is needed beyond the B gate's normal QA.

---

## 2. ADJ-1 / C1: a secret revoked while the run is `ADMITTED`

### 2.1 Probe result and facts

**Reproduced** [V receipt].
- The runner's FINAL (outer `ERROR`/`CANCELLED`, every step `SKIPPED`) gets `409 TRANSITION_REJECTED`.
- The ledger stays `ADMITTED`.
- `RunningReaper` settles it as `DONE`/`ERROR`/`START_TIMEOUT`, never `AUTHORIZATION_REVOKED`.

Facts re-read today:

| Fact | Anchor |
|---|---|
| `applyFinal`'s owner predicate admits `RUNNING`, or `ADMITTED` only `AND cancel_requested_at IS NOT NULL` | [V `StudioDispatchLedgerStatements.java:628-629`] |
| `history` already accepts `e.status = 'PENDING' AND o.state = 'ADMITTED'` | [V `:655`] |
| The edge `ADMITTED → FINALIZING` is already in the transition matrix | [V `:64`] |
| `revoked_at` is an existing ledger column and write-once by trigger | [V `V13__executions_ledger.sql:387-390`; `V14__guided_sessions.sql:410-419`] |
| `apply` excludes revoked rows from the OBS-006 pre-Ready branch, and projects with `revoked` | [V `ProgressReportService.java:163-173`, `:232-243`] |
| A revoked row's FINAL therefore reaches `applyFinal` | [V `:246-249`, `:288-299`] |
| `errorCodeFor(ERROR, CANCELLED, cancelRequested=false, revoked=true)` = `AUTHORIZATION_REVOKED`; cancel takes precedence | [V `RunnerOutcomeCodes.java:80-92`] |
| R8 defines the runner's outer `CANCELLED` as backed by a backend record. One such record is an ack or control body with `revoked:true`. The 012A rule "never broaden the pre-Ready predicate to an **unrecorded** CANCELLED" stands. | [V `architect-ruling-r8-preready-selfstop.json`] |
| A revocation first discovered inside the report transaction (`:147-149`) is visible to the read at `:164-165` in the same transaction | [V order of lines]. Under (a) that FINAL commits, so the receipt's [I] rollback concern disappears for this path. |

### 2.2 Ruling: option (a), with one predicate and no SQL migration

**C1 test, applied.** (a) qualifies:
- **One added predicate:** one disjunct on the existing `applyFinal` owner CAS.
- **No widening:** no reaper, deadline, TTL or OBS-006 edge widening. `applyObservedPreReadyFailure` (`:700+`) and its reviewed reason set are not touched. The reaper is untouched.
- **No new vocabulary:** `AUTHORIZATION_REVOKED` exists.
- **The record is backend-owned:** write-once `revoked_at`, written by `SecretRevocationSweep`.

**The predicate** (`StudioDispatchLedgerStatements.applyFinal`, owner CTE, `:628-629`):

```sql
AND (state = 'RUNNING'
     OR (state = 'ADMITTED' AND cancel_requested_at IS NOT NULL)
     OR (state = 'ADMITTED' AND revoked_at IS NOT NULL AND ?))
```

**The new boolean parameter** is computed in Java inside `applyFinal` as `ExecutionErrorCode.AUTHORIZATION_REVOKED.equals(errorCode)`, where `errorCode` is the method's existing, API-projected argument. It is bound in the owner CTE's parameter list, right after `runnerSequence`.
- **Why the outcome is bound and not only the row state:** the new path accepts **only** the FINAL that the backend's own record names. That is the runner's outer `CANCELLED` under a recorded revocation, as mapped by `RunnerOutcomeCodes`.
- **Every other pre-Ready FINAL on a revoked row** (for example a launch failure) **is still refused and settled by the reaper, as today.** So the reviewed OBS-006 reason-set restriction is not bypassed for revoked rows.
- No literal `'AUTHORIZATION_REVOKED'` appears in SQL, so it cannot drift from the enum.

**No SQL migration and no V23.** This is statement text in Java over existing columns and an existing matrix edge. **Lane DE is unchanged.** @data-engineer review is not required [I: one disjunct on a row already locked by primary key].

**Javadoc (`:588-591`):** "The one `ADMITTED` path" becomes "the two recorded `ADMITTED` paths: a recorded cancel (ADR-002 §29), and a recorded revocation whose projected outcome is `AUTHORIZATION_REVOKED` (STUDIO-OBS-009 ADJ-1, W1.5 part 2)".

**ADR-002 note owed by me** (the contract owner), dated when B lands:
- one sentence under §29.2 item 7 (`ADR-002-internal-contract-surface.md:2688-2690`, which says "only when the ledger records a cancel"), plus
- one §13 change-log row.

It is internal behaviour only: no OpenAPI change, no digest re-anchor.

**Option (b), rejected:** it would leave a recorded revocation reported as `START_TIMEOUT`. That is a cause the backend can see is wrong, and it is the "invented cause" R8 forbids in the other direction.

### 2.3 Instructions and tests for lane B

**Code:** `StudioDispatchLedgerStatements.java` (`applyFinal` predicate, parameter and Javadoc only). **No change** to `ProgressReportService.java`: the revoked flag and the projection already flow (§2.1).

| Id | Case | Expected |
|---|---|---|
| A1 | `PreReadyRevocationProbeIT.aPreReadyRevocationIsSettledAsAuthorizationRevoked` (the target case; red today) | FINAL accepted. The ledger goes to `FINALIZING`, then `DONE` after evidence settles. Execution `ERROR` / `AUTHORIZATION_REVOKED`. `reapOnce()` changes 0 rows. The secret-use terminal audit replays as on the cancel path (`ProgressReportService.java:259-262`). |
| A2 | the characterization case `todayAPreReadyRevocationFinalIsRefused…` | **renamed and inverted** into the regression pin for narrowness: on a revoked `ADMITTED` row, a FINAL whose outer `errorCode` is **not** `CANCELLED` (for example `RUN_ERROR`) gets `409 TRANSITION_REJECTED`, and the reaper settles it `START_TIMEOUT`, as today |
| A3 | revoked **and** cancel-requested, pre-Ready | `CANCELLED` (precedence unchanged, `RunnerOutcomeCodes.java:87-89`) |
| A4 | not revoked, not cancelled, outer `CANCELLED` pre-Ready | unchanged: OBS-006 pre-Ready branch, outcome as `AdmissionCasIT` pins it (R8 rule) |
| A5 | regressions, all green **unchanged** | `AdmissionCasIT`, `CancelIT` (its `TRANSITION_REJECTED` pins), `DispatcherIT`, `SecretRevocationSweepIT`, the transition-matrix agreement test |
| A-M | mutation: drop the `AND ?` outcome binding | A2 red. Record it, then revert. |

**Security co-sign:** @qa (security lens) at the B gate, on the A12 precedent. The analysis is §2.2: recorded fact only, outcome-bound, no edge or reaper widening, write-once column.

**Joined real-runner leg** (story ADJ-1 a's initial-context pause seam; PR-BE simulated at the report boundary): **B-W3**, after F-merge, in `PreReadyRevocationProbeIT`. It uses the runner seams named in R8 (`initial-context-state.json {pause:true}`) through I's harness, and is credited on the F-merge `dist` digest. The report-boundary cases A1–A5 are sufficient to land the predicate in W2.

---

## 3. A4 tripwire: the third `SSLContext.getDefault`

**Fact** [V]: `GuidedTranslationCoordinator.java:45-50` builds its `HttpClient` with `SSLContext.getDefault()`. It calls `controller-origin` at `/internal/v2/studio/guided-sessions/…` (`:122-123`). That path is behind `guidedInternalChain` (`GuidedInternalSecurity.java:55`), which **requires a client certificate** on every request (`:134-140`; class comment `:36-41`, "clientAuth=need").

**Ruling: D3 moves it onto `StudioRunnerTls`. No exemption. The tripwire's final expected count is 0.**

- **Why not exempt:** with the default context, the coordinator presents a client certificate only through JVM-wide `javax.net.ssl.keyStore`. Lane D3's own prohibitions forbid exactly that. An exemption would therefore ship a coordinator that cannot authenticate to the guided chain wherever `mtls-required: true` [I, from the two [V] facts above]. AC-2 ("the chain fails closed when any part is absent") covers that hop.
- **Why `StudioRunnerTls` and not a second class:** after part 1 §1.5 c, the backend has **one** certificate on the private Studio service plane, used in both roles (runner-facing client, and the API guided connector's server). The coordinator needs exactly that identity and that trust store. A second `…Tls` class would duplicate the fail-closed loading that D3.0 already proved (19 cases, `../d3/receipt.md`). **No rename** (churn). D3 updates the class Javadoc: "the backend's identity on the private Studio service plane: the three runner clients and the guided-controller hop".
- **Deployment input** (D2/D3): the trust store holds the issuer(s) of the runner certificate and of the API guided connector's certificate. The connector's SANs cover the `controller-origin` host. The port and connector are still D3's to name (Gage §3.1, §3.7).

**Code (D3):**
- `GuidedTranslationCoordinator` takes `StudioRunnerTls` and builds with `tls.configure(HttpClient.newBuilder())`, then `.followRedirects(NEVER).connectTimeout(5 s)` unchanged. `throws NoSuchAlgorithmException` goes.
- `GuidedTranslationConfiguration.java:118-132` injects it under **the same rule D3 picks for the three runner clients** (one rule for four clients, including whatever D3 decides for contexts with no TLS settings).

**Test (D3):** one case in `RunnerTlsClientCertIT`, through a package-private factory seam D3 chooses. The coordinator's client completes a mutual-TLS handshake against a `RunnerTestTls` server that requires client auth, presenting `BACKEND`, and refuses a `ROGUE` server.

**Tripwire:** `grep -rn 'SSLContext.getDefault' backend/src/main/java/com/citi/put/checks/studio` returns **0**. That is A4's original expectation, now with the coordinator included.

---

## 4. Go/no-go (2026-10-18)

| Item | Decision |
|---|---|
| **AC-11 R1 binding** | **GO**, 2026-10-18. Reproduced (§1.1), non-consuming confirmed (§1.2). Lane B implements §1.3 in W2. |
| **AC-11 ADJ-1** | **GO for option (a)**, 2026-10-18, subject to the @qa security co-sign at the B gate (§2.3). |
| **A4 tripwire** | 0 expected; D3 adds the coordinator (§3). |
| **KL-015-D5** | ruled in part 1. R2 may start. |

## 5. W2 lane-plan changes the probes imply (root applies to `lanes.json`)

| Lane | Change |
|---|---|
| **B** | `writes` **add**: `dispatch/StudioDispatchLedgerStatements.java` (`applyFinal` predicate, parameter and Javadoc only); `guided/evidence/GuidedEvidenceConfiguration.java` (wiring only); `test/…/guided/evidence/GuidedSessionEvidenceTest.java` (constructor only). **Remove** `internal/ProgressReportService.java (only if C1 = (a))`: not needed. `verify` **adds** `--tests 'com.citi.put.checks.studio.dispatch.PreReadyRevocationProbeIT' --tests '*AdmissionCasIT' --tests '*CancelIT' --tests '*DispatcherIT' --tests '*SecretRevocationSweepIT' --tests '*GuidedServiceTransportFaultIT' --tests '*GuidedSessionIT'` and the `contextRevision() ==` tripwire. `prohibited` drops "ADJ-1 implementation before AR-W1" (satisfied). No other lane writes `StudioDispatchLedgerStatements.java` or `GuidedEvidenceConfiguration.java` in W2 [V write-set scan]. |
| **B-W3** | `writes` **remove** `ProgressReportService.java (only if C1 = (a))`. It keeps R1 d and the ADJ-1 joined real-runner leg (§2.3). |
| **D3** | `writes` **add** `guided/translation/GuidedTranslationCoordinator.java (TLS wiring only)`. `GuidedTranslationConfiguration.java` is already listed. Tripwire expectation stays "0". `RunnerTestTls.java` gains `BACKEND` serverAuth+SANs (part 1 §1.5 c). |
| **DE** | unchanged: no V23 from ADJ-1 |
| **R2, D1, D2, I** | as part 1 §4 |

## 6. Not claimed

- No test run by me. R1-1 and A1 are red today by the PR-BE receipt and become [V] green only through lane B's runs.
- The delivery-ACK lock order (§1.3 item 3) is [I] and not required by the ruling.
- That no other `SSLContext` default use exists outside `checks/studio` is not checked. The tripwire scope is A4's.
