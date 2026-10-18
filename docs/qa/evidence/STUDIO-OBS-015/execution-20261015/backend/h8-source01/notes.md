# STUDIO-OBS-015 H8 source 01: durable teardown re-drive (apply-ready patch)

Author: Dex-H8 (@dev, backend). 2026-10-16 UTC. No file under `backend/`, `frontend/`, `studio-runner/`,
`tools/`, `docs/specs/` or `.github/` was written. No Gradle run. No commit.
Spec: `../r2-diagnosis01/aria-h8-h6-ruling01/ruling.md` (sha256 `86a53bec…`), section H8.4/H8.5.

## Apply

```
git apply -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/h8-source01/h8.patch
```

`git apply --check -p0` passed against the live tree at 2026-10-16T08:15Z. The live files were
byte-identical to `work/base/` at that time (sha256 values are in `manifest.json`). `work/new/` holds the
patched files. Applying the patch to `work/base/` reproduces `work/new/` exactly (round trip checked).
The patch does not touch `GuidedPublicationReplayIT.java` or `build.gradle.kts`.

## What changed, mapped to H8.4

| H8.4 | Change |
|---|---|
| 1 | `GuidedDispatchService.stop` sends with `"teardown-" + GuidedContracts.hash(stop)` (73 chars). The body is unchanged. |
| 2 | `GuidedSessionService.stop`: in the same transaction that sets `teardownStatus PENDING`, it writes `progress.teardownRequest = {target, reason}`. The wire reason is computed once, with the same ternary as before. |
| 3 | `afterCompletion` (only when committed) submits `teardownAttempt` to a bounded executor that belongs to the service: 2 daemon threads named `guided-teardown`, `ArrayBlockingQueue(64)`, `DiscardPolicy`, core threads time out after 30 s. The common ForkJoinPool is no longer used. |
| 4 | `teardownAttempt` (private): a per-JVM in-flight guard (`ConcurrentHashMap.newKeySet()`). The sender is called outside any transaction. A `GuidedSessionException("UNKNOWN_OUTCOME")` gets at most 2 immediate re-sends. Only a normal return leads to `lock` and then, if the row is terminal and `PENDING`, sets `CONFIRMED`, removes `teardownRequest` and saves. Any other `RuntimeException` is swallowed. It never calls `stop(...)` and never touches state, actions, ledger, counters or evidence. |
| 5 | `redriveTeardowns(Duration window, int batch)` is called by `GuidedSessionReaper.expire()` right after `service.expire()`. It uses `repository.pendingTeardowns` (the ruling's SQL, bind `now − window`, no jsonb `?`), then a short read of `teardownRequest` for each id. It submits to the executor and never blocks the caller on the network. It then runs `abandonedTeardowns` and logs one `WARN` with the count only. The reaper reads `studio.guided-authoring.teardown-redrive-window` (default `PT15M`) and `…teardown-redrive-batch` (default `32`) through `@Value`. `GuidedSessionProperties` is not touched. |
| 6 | There is no migration and no change to the runner, the `lifecycle` route, the transport deadline, the V19 retain list, publication, recording, or ReplayIT. Legacy `PENDING` rows that have no request are not re-driven. Pruning drops `teardownRequest` because it is not on the retain list. |

## [AUTO-DECISION]s and deviations (please review)

1. **The persisted target is the value-free projection, not the raw `notifyContext`.**
   - **[V]** `notifyContext` comes from `GuidedMaterializationService.context(...)`. That is the full runner context: `authoredInputs`, `applicationPolicy`, `prefixProgram`, `limits` and so on (`assembleContext`). The ruling's statement that "the target is either a context identity from `materialization.identity` or the assignment intent" only holds once the context is projected.
   - So `teardownTarget()` stores `materialization.identity(notifyContext)` for a context, or a copy of the assignment intent.
   - That projection is also what the first send receives. `dispatch.stop` applies `identity()` again, which is idempotent, so the wire body is unchanged.
   - The new bridge test asserts that the target has no `authoredInputs`.
   - The existing canary check in `GuidedServiceTransportFaultIT` (progress must not contain the secret canary) stays meaningful.
2. **If `identity()` throws:** the row is set `PENDING` with no request and nothing is sent. Before this change, `dispatch.stop` would have thrown inside `identity()` anyway. Catching the exception keeps a validation failure from rolling back the terminal transition. **[I]** It should not happen, because `context()` has already validated `v3/runner-context`.
3. **Re-sends trigger on any sender `UNKNOWN_OUTCOME`, not only on timeouts.**
   - **[V]** `GuidedRunnerClient` maps a timeout and a non-200 reply to the same `GuidedSessionException("UNKNOWN_OUTCOME", 409)`, so the two cannot be told apart without changing the client.
   - So a fast 409 or 503 is also re-sent twice, back to back.
   - Consequence: `actualStopOwnershipRecordsRealSenderRefusalWithoutConfirmation` (relay 503) now expects 3 sends. `SourceStopOwner` gained a permitted-send count; its latches count down once per send, and `rejectGuard` drains them.
4. **Confirmation now requires `PENDING`,** as the ruling says. Before, it only required a terminal state. No path writes any other `teardownStatus` before confirmation.
5. **`redriveTeardowns` takes `(window, batch)` as parameters.** `GuidedSessionService` is not a Spring component, so the `@Value` keys live on `GuidedSessionReaper`. Its constructor rejects a window ≤ 0 or a batch < 1. The method returns early when no stop sender is installed.
6. **The in-flight guard is static (per JVM), as ruled.**
   - The sweep checks it before reading or submitting, so queue slots are not wasted. The executor task checks it again.
   - Package-private test seam: `teardownInFlight(id)`.
   - With several backend replicas, two JVMs can send at the same time. That is harmless: the key and the body are the same, so the runner joins the one stop.
7. **The short read is a non-locking `SELECT progress->'teardownRequest' … AND state IN (terminal) AND teardownStatus='PENDING'`.** A row that was confirmed in the meantime reads as null and is skipped.
8. **Executor bounds are literals** (2 threads and queue 64, as in the ruling's example). They are not in `StudioExecutionProperties`, so `StudioBoundedResourcesTest`'s roll call does not list them.
9. **Flag, not changed:** the past-window `WARN` fires on every sweep (every 10 s) for as long as at least one such row exists, which is until retention prunes it (30 days by default). The ruling asks for this; operations may find it noisy.
10. **Order of JSON keys:**
    - A re-driven target is parsed back from jsonb, so its key order differs from the in-memory first send.
    - **[V]** Java `GuidedContracts.hash` and the runner digest (`transport.ts` `guidedDispatchIdentity` → `hash(canonical(...))`) are both canonical, so the key and the runner's replay digest are the same.

## Tests (H8.5)

- **`GuidedDispatchStopKeyTest`** (new unit test, `bridge` package):
  - an assignment stop sent twice uses the key `teardown-` + hash(body) both times, and the key is 73 characters;
  - context stops: the same reason gives the same key, a different reason gives a different key.
- **`GuidedServiceTransportFaultIT`** (stubbed `installStopSender`; 30 s sessions with only a prepared assignment; `OffsetClock`):
  - **`expiredTeardownConfirmsOnImmediateResendAfterAckTimeout`**: 2 calls, identical target and reason, `CONFIRMED` from `afterCompletion` alone, request removed, `EXPIRED`. The invariant rows are byte-identical to a snapshot taken at the first send (session state, document and progress without the teardown keys; actions, evidence, recordings, assignments, materializations, secret audit, commands).
  - **`expiredTeardownConfirmsOnSweepAfterResendsExhausted`**: after `expire()` the row is `PENDING` and the request is the assignment intent with `EXPIRED`. After `redriveTeardowns` it is `CONFIRMED`. 4 identical calls; invariants unchanged.
  - **`teardownWithoutAckNeverConfirmsAndStopsAfterWindow`**: 3 calls, then 3 more within the window. With the clock past the window, two sweeps make no further call, the row stays `PENDING`, and exactly 2 `WARN`s are logged. Each has one `Integer` argument ≥ 1 and contains no session id, assignment id or worker id.
  - **`concurrentAfterCompletionAndSweepSendOneStopAtATime`**: the first send is blocked while a sweep runs. There is 1 call, at most 1 active, then `CONFIRMED`, and a later sweep sends nothing.
  - **`legacyPendingWithoutRequestIsNotRedriven`**: a definite refusal gets 1 call and no re-send. After the request is stripped, the sweep sends nothing.
  - **Changed:** `actualStopControl(SENDER_REFUSAL)` now expects 3 sends. `assertUnconfirmedClosedMaterialization` also asserts that `teardownRequest.reason == CANCELLED` survives.
  - The stubs refuse every other session's stop without sending. The sweep is global over the class's shared database, so it never acts on rows from other test cases.
- **`GuidedBridgeIntegrationTest`** (real worker; the class is in the `…guided.session` package):
  - `cancellationBeforeConsumptionRevokesAndMissingStopAckNeverConfirmsTeardown` is unchanged.
  - New **`stopRetryAfterCloseCompletesConfirmsWithSameKey`**:
    - A wrapper sender makes the real `dispatch.stop`, so the worker really closes, but it reports the acknowledgement as lost (`UNKNOWN_OUTCOME`) for the first 3 sends. The row is then `PENDING` with a request that has no `authoredInputs`.
    - `redriveTeardowns` makes the 4th send, which confirms.
    - The 4 stop bodies the runner saw (through `observeRequestBytes`, via reflection) share one canonical digest, so they carry one key.
  - **Deviation:** a real close longer than 15 s cannot be reproduced in this lane. The ruling measured 23 s only after 600 s of idle recording. So the test injects "lost ack after a real send" in place of "timeout".
  - **[I]** "The runner replay map gains only one entry" is shown indirectly: identical (sessionId, `stop`, key) gives one `replayKey` in `transport.ts`. Looking inside the map directly would need a runner seam, which is out of scope.
- **Not included:**
  - the runner `test/guided/ownership.test.ts` cases from H8.5, because `studio-runner/` is a hashed path and this mission is backend only (they need no runner source change);
  - the joined-lane rerun, which needs Gradle.

## What I ran

| Check | Result |
|---|---|
| `javac` 21.0.10 (`~/.gradle/jdks`), `--release 21`: the 4 patched main files, classpath = `backend/build/classes/java/main` + Gradle-cache jars. Output went to the session scratchpad. | exit 0 |
| `javac` 21: the 3 patched or new test files, classpath = scratch main + `backend/build/classes/java/{main,test}` + Gradle-cache jars | exit 0 |
| `GuidedDispatchStopKeyTest` run through the JUnit Platform launcher outside Gradle (Mockito 5.11 inline) | 2/2 passed |
| google-java-format 1.22.0 (Gradle cache) over the changed line ranges of every file (the whole new file for `GuidedDispatchStopKeyTest`) | 0 in-range differences |
| `git apply --check -p0 h8.patch` (live tree) | pass |
| Applying the patch to `work/base` gives `work/new` | identical |

**Not run:**
- Gradle;
- spotless, checkstyle and spotbugs;
- every IT (they need Docker/Testcontainers, and the bridge test needs the runner worker snapshot);
- `npm run lint` / `typecheck` (they do not apply; this is Java only).

**Caveats:**
- The compile classpath was every jar in the Gradle cache, not Gradle's resolved test classpath.
- **[V]** The base files already differ from GJF 1.22 outside the hunks I touched (for example `GuidedSessionService` around lines 341 and 620, and SQL string reflow in both ITs). I left those alone, and a whole-file `spotlessCheck` would flag them regardless of this patch.

## ReplayIT note for Dex-MERGE (not patched)

- ReplayIT boots the full `ChecksApplication`, so the scheduled `GuidedSessionReaper` (every 10 s, no override found) now also runs `redriveTeardowns`. The `confirm-expire` variant calls `GuidedSessionService.expire()` directly (around line 13632), so its stop goes out from `afterCompletion` with 2 immediate re-sends. The reaper re-drives it afterwards.
- **Risk [I], from H8.5:**
  - The close takes ≥ 23 s after T, measured locally.
  - `verifyPreviousWorkerGenerationClosed` (around line 684) polls for only 20 s and requires `teardownStatus CONFIRMED` for every assigned session.
  - So `CONFIRMED` can land after that window closes.
- **Suggested lawful test-side change (needs Quinn's acknowledgement; do not relax the guard):**
  - In the `confirm-expire` branch, after the 409 `clarify` call, wait (bounded) for `teardownStatus CONFIRMED` before returning.
  - For example, reuse the `p3AwaitTeardown` pattern (around line 23585) with a 120 s deadline instead of 20 s.
  - This changes no label, no order and no guard.

## Self-critique

**Covered:**
- Every H8.4 item and every H8.5 backend test is covered, or a deviation is stated above.
- Nothing changes the terminal state, actions, ledger or evidence. The tests check this byte for byte.

**Residual risks:**
- These all come from the ruling's H8.6: a `browser.close()` with no deadline, idle-tail encoding, and the cost of the sweep query.
- WARN noise (item 9).
- Re-sends of fast refusals (item 3).
