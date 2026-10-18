# w4-qa-ack03: QA delta-ack for w4-bridge01 (D4(c), ack02 delta, PlannedIT #22, bridge #16 key, L1)

Quinn (@qa), 2026-10-16. This was a read-only review from diff files and the live tree. I did not run Gradle, JUnit,
javac or Chromium, did not edit source, and did not commit. Every run result cited here is Dex-W4's, taken from
`w4-bridge01/manifest.json`; I did not re-run any of them. Input hashes are in `manifest.json`.
[V] = I read the code or ran the check. [I] = inferred.

## 0. Live-tree binding [V]

| File | Live sha256 | Pre-image (reverse-applied on a scratch copy) |
|---|---|---|
| GuidedPublicationReplayIT | `bef430ba…` | `replayit/ack02-delta.diff` reversed gives exactly `6315dee2…` (base + D5 + D4, verified in ack02 §0) |
| GuidedBridgePlannedIT | `f21c9266…` | `planned-it-fix.diff` reversed gives exactly `760e84d0…` |
| GuidedMaterializationService | `0247251e…` | `l1/l1.diff` reversed gives `ad8742a8…` |
| GuidedSessionService | `bda27005…` | gives `d10ec5cb…` |
| GuidedServiceTransportFaultIT | `beb28ec4…` | gives `7d711a43…` |
| GuidedBridgeIntegrationTest | `a0ab8e7e…` | (unchanged by this window) |

So each file differs from its reviewed base by exactly the diff I reviewed, with no other bytes.

## 1. Summary

| # | Item | Verdict |
|---|---|---|
| 1a | D4(c) observer race: skip only when `p8TerminatedUnsignalled(handle)` | **ACK** (one optional advisory) |
| 1b | ack02 item 3 (B2B-02 exact `authoringContext` equality) | **Implemented as required. ACK** |
| 1c | ack02 items 5+4 (shared `neverAssignedSettled` guard) | **Implemented as required. ACK**, including the disclosed B3B-1 branch edit |
| 1d | ack02 item 6 (metadata bound 16,384 / 8,388,608) | **Implemented as required. ACK.** Conditions (a) to (d) met |
| 2 | PlannedIT #22 pins `JpaSystemException` | **ACK** |
| 3 | Bridge #16 probe key `"assignment"` | **Ruling: no swap. #16 stands as is** and still proves its assigned behaviour |
| 4 | L1 `verifyLifecycle` vs aria-lifecycle-ruling01 | **ACK.** Verbatim to §2.1/§2.2; exactly v(n)/v(n-1) on all ten fields; case-1 deviation accepted |

**Gate decision for these deltas: APPROVED.** This is not a 015 story gate. The full incremental lane is still
60/62, and the two open failures (FirstSuffix `b3EdgeMatrix` precondition; B3B `INVALID_CONTRACT` vs
`EVIDENCE_MISMATCH`) are outside this ack and still need diagnosis.

## 2. Item 1a: D4(c) `ownedCommandHash` exiting-process race. ACK

**Change** (`ReplayIT:566-573`): the observer catch adds the failure only when
`candidate.process.isAlive() && !candidate.stopping && !p8TerminatedUnsignalled(candidate.handle)`.

**Mechanism verified [V]:**
- `recordOwnedDescendants:597-598` returns early unless `process.isAlive()`. It then calls `verifyOwnedRoot`, which
  calls `ownedCommandHash(handle)` (`:499`, `commandLine().orElseThrow()`). If the root exits between those two
  reads, `NoSuchElementException` is thrown. It is an `Exception`, so the observer catch receives it.
- In that window, `Process.isAlive()` stays true until the JDK reaper collects the exit status, so the old guard
  recorded it. That is the r2fix-join-attempt02 / w3-d4 §2 race.
- `p8TerminatedUnsignalled:22005-22013` returns true only if the handle is not alive, or if `/bin/ps` reports `X` or
  `Z*`. Any probe failure returns **false**, which keeps the original failure. So the skip is fail-closed.
- It is the same predicate QA already accepted for `p8KillRefusedWhileAlive` (`:21999`).

**Scope is minimal [V]:**
- Only the observer is relaxed. `verifyOwnedRoot` is **unchanged**. D4 §2(c) also proposed relaxing it, and it was
  not done.
- That is correct. `verifyOwnedRoot` gates every signal (`stopOwnedProcessTree:30557/30570`, `p6Signal`,
  `verifyRecordedOwnedHandle`), so it must stay strict.
- A live root whose identity cannot be re-proven is still a failure.
- Skipping a terminated root loses no safety. The observer never signals. A terminated root's descendants can no
  longer be discovered through `root.handle.descendants()` anyway. The teardown checks (recorded descendants gone,
  root exited) are unchanged.

**Side effect checked [V]:**
- `p6Status` spawns `/bin/ps` through `registerOwnedTool`. That is a new behaviour on the observer thread.
- The `ps` root is registered in the `CopyOnWriteArrayList` (`:458`), so the observer's iteration is snapshot-safe.
- `p6Status` waits up to 5 s and closes the command in its `finally` (`:18330-18332`) before returning, so no `ps`
  outlives the call.
- Its SPAWN rows count against the metadata bound. That headroom is ample (item 1d).
- The `ps` probe is only reached on the already-failing branch.

**Advisory (optional, non-blocking):** the skip is silent. Add a value-free counter, for example
`observerSkippedTerminated` in the owned-worker cleanup summary, so a future run shows how often the race fired.
incr02 cannot tell us whether it fired: `cleanupFailureCount 0` is consistent with either.

## 3. Items 1b to 1d: ack02 delta implemented exactly as required

### 1b. Item 3, B2B-02 (§4.3) [V `ReplayIT:8299-8337`]

| §4.3 requirement | Live |
|---|---|
| Exact equality vs an array rebuilt from `current.authoring` | `assertThat(manifestCopy.path("authoringContext")).isEqualTo(expectedContext)` (Jackson deep equality) |
| Mirror `safeContext`: global first, then each step in order; `kind=="text"`, non-empty value; `{stepId,text}` | `b2SafeContext(globalContext,"global")`, then `steps[*].context` with `steps[i].id`. It is the same filter as `GuidedSourceClassifier.safeContext:182-194` and the same call order as `:99/:101/:139` (`b3769877…`). Production rejects a non-textual text value (`INVALID_CONTRACT`), so the test's `isTextual()` skip is equivalent for any stored manifest |
| Positive control: non-empty, and contains `ctxText` | Both asserted |
| Keep everything else | Kept: `isObject`, `authoringSnapshot` equality, `ctxLiteral` absence, removal of the two subtrees, per-canary sink names, `whole` checks for plain/secret, ORDER tail on `whole` |

B2B-02 passed in `w4-full-incr02` (Dex's run, not re-run by me).

### 1c. Items 5+4, shared guard (§6) [V `ReplayIT:2886-2890`, `:23848-23880`]

| §6 requirement | Live |
|---|---|
| One predicate shared by both sites | `neverAssignedSettled(id)` is used by `b3AwaitCancelSettled` and the failed-test cleanup |
| One read; terminal state; 0 assignments; 0 materializations; `teardownStatus` null/empty; `teardownRequest` null | One `queryForObject`. The state set is exactly `SUCCEEDED,PUBLICATION_CONFLICT,FAILED,UNKNOWN_OUTCOME,CANCELLED,EXPIRED`, with `NOT EXISTS` ×2, `COALESCE(...,'')=''` and `progress->'teardownRequest' IS NULL` |
| Cleanup: evaluate only after the cancel branch | Placed after the cancel `if` block closes |
| Cleanup true branch: `NOT_ASSIGNED`, 0, 0, no `cleanupUnconfirmed` | `cleanup.put(...)`, then `continue` inside the per-session try. `cleanupUnconfirmed` is not touched |
| Otherwise the 20 s CONFIRMED wait is byte-for-byte unchanged | The hunk adds lines only; the wait loop is unchanged |
| Disclosed as a shared-guard edit | `manifest.json` `sharedGuardDisclosure` and review §3 |

**Disclosed B3B-1 edit: accepted.** The old branch (`assigned==0` ⇒ assert `materialized==0` and `teardown==null`)
failed fast on violation. Every violating combination now falls through to `p3AwaitTeardown`.
- `assigned==0 && materialized>0` cannot occur: there is an FK from V14:128 (ack02 §5).
- `assigned==0` with a teardown status set cannot reach CONFIRMED without a runtime [I]. It therefore still fails red,
  just after 20 s.
- If it did reach CONFIRMED, a runtime existed, and CONFIRMED is the correct demand.

So nothing goes green that went red before. The predicate also adds the `teardownRequest IS NULL` check that ack02 §5
listed as optional, which makes it stricter.

One conservative edge [I]: a JSON `null` `teardownRequest` makes the predicate false. That leads to the wait, which is
fail-closed. Acceptable.

Observed: the guard fired once in incr02 (the B3B CANCELLED session), `allActualTeardownsConfirmed=true`, with no
cascade (Dex's evidence).

### 1d. Item 6, bound (§7) [V `ReplayIT:527-536`]

- (a) The bound is exactly `>= 16384` events and `> 8388608` bytes.
- (b) The following are unchanged:
  - the throw;
  - the UTF-8 `line.length`;
  - the `rw-------` create;
  - row fields.

  The 1 MiB summary bound is not in the delta, so it is unchanged.
- (c) The disclosure lists both superseded records (`manifest.json` `boundDisclosure.supersedes`, review §3).
- (d) incr02 reported 4354 events / 3,054,967 B, `cleanupFailureCount 0`, 212 roots, 0 alive [V
  `owned-worker-cleanup-incr02.json`]. That is about 3.8× / 2.7× headroom.

## 4. Item 2: PlannedIT #22 `JpaSystemException`. ACK

[V]
- Production `GuidedSessionConfiguration:22-25` builds the repository on the injected `PlatformTransactionManager`.
- `spring-boot-starter-data-jpa` is on the classpath (build.gradle.kts:42), so that manager is the JPA one.
- Ruling N4 requires the same form in PlannedIT (`repository(JdbcTemplate, PlatformTransactionManager)`,
  PlannedIT:579-582).
- The old bridge class used `DataSourceTransactionManager` (bridge:489).
- Under JPA, a deferred-trigger commit failure surfaces as `JpaSystemException`, which is a `DataAccessException` and
  not a `TransactionException`. So the old type pin was a fixture artifact.

The new pin is stricter: type, plus "Unable to commit", plus a root cause containing "injected commit failure". That
cause proves the failure is the injected deferred trigger and nothing else.

Production impact checked:
- `GuidedDispatchService` catches `RuntimeException` (`:119/:141/:277`), so it treats both types the same.
- The only `DataAccessException` handler in the guided code (`GuidedTranslationService:2160`) is on the question
  path, not the consume/dispatch commit.

So the type change hides no production behaviour. The at-most-once assertions are unchanged: `NAVIGATIONS==0`,
`dispatchCount==0` and the rollback checks.

## 5. Item 3: bridge #16 probe key. Ruling: no swap; #16 stands

**What Aria assigned to #16** (bridge ruling §3 row 16; §4.3 "#16 … NAV | N9 only"): "a held *renewal* response
released after stop cannot revive context or ownership". The swap to `translation-assignment` was required for **#2
only**. Its assertion is a *positive* duplicate `dispatch.assign`. The backend's `prepareAssignment(key)` idempotency
decides that outcome, so the key has to match the planner's (GuidedTranslationService:152). Under R-4, #16's probe is
a *negative*, hand-crafted, direct runner probe.

**Why a fresh key still proves "cannot revive ownership" [V `studio-runner/src/guided/transport.ts:96-112`]:**
- For `assign`, the runner's replay record only adds a pre-check: same digest and secret identity, otherwise
  `IDEMPOTENCY_CONFLICT`. It then **re-executes** `ownership.assign(body)` (":109-110 OWNED is current acknowledged
  authority, never a historical winning claim replay").
- A first-seen key executes the same `ownership.assign(body)`.
- So an original-key replay and a fresh key reach the **same ownership decision**. The original key can only add an
  extra refusal (`IDEMPOTENCY_CONFLICT`), and `GuidedRunnerClient` maps that to the same public `UNKNOWN_OUTCOME`.
- The fresh key is therefore the *cleaner* probe. Its `UNKNOWN_OUTCOME` can only come from the runner's
  post-stop ownership state, which is exactly the "revival" question. An idempotency conflict cannot mask it.
- The context probe (`runner.send("context", oldContext)`), `state == CANCELLED` and `NAVIGATIONS == 1` are unaffected
  by the key.

**The original-key-after-stop path is also pinned elsewhere.** It is covered by the retained
`assignmentRenewsBeforeContextAndCancellationReleasesItsOnlyCapacitySlot` (GuidedBridgeIntegrationTest:1130). That test
calls `dispatch.assign(…, "assignment", …)` and then, after CONFIRMED, `runner.send("assign", assignment(id),
"assignment")` gives `UNKNOWN_OUTCOME`. It is in the retained 9, which passed 9/9 in run02 (Dex's run).

**Disposition:**
- No change is required.
- Optional, for readability: rename the probe key to `"fresh-assign-after-stop"` with a one-line comment citing
  transport.ts:110. That would be a test-text-only edit with no QA re-ack needed.
- Dex's review §1 O-1 is closed by this ruling.

## 6. Item 4: L1 vs aria-lifecycle-ruling01. ACK

**Production [V]:**
- §2.1: the `verifyLifecycle` and `sameIdentity` text in `l1.diff` is identical to the ruling's block. A line diff
  differs only in where the hunk places the shared `/**` opener.
- §2.2: the single `lifecycle` call-site swap plus the comment is identical.
- No other production line changed. The reversed pre-images match (§0).
- **Exactly v(n)/v(n-1):** with no pending delivery, the path is `verify` (with `requireAcknowledged`, which passes).
  With one, it requires `revision >= 2` and then accepts `sameIdentity(issued) || sameIdentity(issued with revision-1)`.
  Nothing else is accepted.
- **All ten fields:** `identity()` (`:265-282`) builds `schemaVersion, sessionId, workerId, ownerFence, scopeHash,
  contextId, contextRevision, sourceRevision, configurationRevision, versions`. `sameIdentity` iterates every
  field of that node with `JsonNode.equals`. Extra envelope fields (`reason`) are ignored, the same as `verify`.
- `verify`, `verifyAndCapture`, `verifyPrefixReceipt`, `requireAcknowledged`, `stop()`/P3 and `assignmentLifecycle` are
  untouched.

**Tests vs ruling §3 [V `l1.diff`]:**
- Cases 2 to 5 match their specs. Case 3 has all six probes, each with `STALE_FENCE` 409, then state unchanged, no
  `teardownStatus`, 0 stub calls and the delivery `PENDING`. Case 4 pins `REVISION_CONFLICT` for both consuming
  verifies. Case 5 refuses revision 0, then v1 gives `FAILED`, an identity target, CONFIRMED and 0 deliveries.
- Mutation logs M1, M2 and M3 match §3 exactly [V logs]:
  - M1: case 1 fails with `REVISION_CONFLICT` from `requireAcknowledged`.
  - M2: case 2 fails with `STALE_FENCE` from `verifyLifecycle`, and case 1 passes.
  - M3: case 1 fails with `STALE_FENCE`, and case 2 passes.

**Case-1 deviation: accepted.**
- The premise is true [V]: `teardownAttempt` removes `teardownRequest` when it writes CONFIRMED
  (`GuidedSessionService:2620-2621`). The §3.1 "read `teardownRequest.target` after CONFIRMED" was not executable.
- The substitute is equivalent. `stop()` writes `teardownRequest.target = target` and hands `sent = target.deepCopy()`
  to the stop sender (`:2538-2542`), and `TeardownStub.accept` records `target + "|" + reason`.
- So `calls.size()==1 && calls[0].startsWith(assignment + "|")`, together with `assignment.has("assignmentId")` and
  `!has("contextRevision")`, proves the durable target was the assignment. That is P3 under a pending delivery.
- Case 5's `startsWith(identity + "|")` is the discriminating control.
- The `PUBLICATION_CONFLICT` pin on the late ACK is stricter than the ruling's "any `GuidedSessionException`".

**Advisories (non-blocking; tighten in a later touch):**
1. Pin the full stub string, not just the prefix. For a `FAILED` stop the reason is `UNKNOWN_OUTCOME` (`:2531-2536`),
   so use `isEqualTo(assignment + "|UNKNOWN_OUTCOME")`. That would also pin the ruling's `assignment|reason`.
2. Case 3's pre-check `doesNotContain` lists four terminal states. Add `SUCCEEDED` and `PUBLICATION_CONFLICT` so it
   literally means "non-terminal".
3. In this fixture, allocations and producers are empty, so their "unchanged" check is vacuous (disclosed). The joined
   B2B-01 A77-4 snapshot equalities carry that part.

The ruling's joined expectation is met by Dex's runs:
- B2B-01 passed 1/1 (`w4-l1-b2b01`), with 0 lifecycle `REVISION_CONFLICT` and 0 "refused the context".
- B2B-01 passed in `w4-full-incr02`.

The ruling §3 `test`-lane regression (B2A-02, `append-input`) is **still unrun**, as Dex disclosed. It stays an open
condition before L1 earns lifecycle credit.

## 7. Open conditions carried forward
- L1: run the `test`-lane B2A-02 + `append-input` regression (ruling §3).
- 015 lane: diagnose FirstSuffix (`b3EdgeMatrix:5687` precondition) and B3B (`b3AssertMultiVersionReturnedHistoryRefuses:4812`).
  Never change an oracle to make them pass.
- Spotless, Checkstyle, SpotBugs and `./gradlew check` were not run on any of these edits. That is the owner's job
  before the story gate.
- Ack02 §4.1: the A68-3 spec amendment is still routed to @architect.

## 8. Not done
- I did not run Gradle, JUnit, javac, Chromium, CodeRabbit or SYNAPSE diagnostics. CodeRabbit is WSL-only, and this
  host is darwin.
- No source edits and no commit. The only scratch copies were under the session scratchpad, for the reverse-apply
  checks.
