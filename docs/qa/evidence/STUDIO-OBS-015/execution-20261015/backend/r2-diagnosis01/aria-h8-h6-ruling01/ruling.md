# STUDIO-OBS-015 R2 diagnosis 01: architect ruling on H8 (expiry teardown) and H6 (`containsText` whitespace)

Author: Aria (@architect). 2026-10-16 UTC. Read-only on source. No Gradle. No repo, dist or fixture byte changed.
Input: `../review.md` (sha256 `7232a8f0…`), sections H6 and H8. This ruling releases no QA credit and changes no lifecycle.
The two change specs below are for @dev (backend: H8; runner: H6). Quinn re-gates both.

Evidence labels used below:
- **[V]** verified: I read the code or ran the probe, and I cite it.
- **[I]** inferred: I did not measure it.

---

## H8: an expired session's teardown stays `PENDING` forever

### H8.1 Mechanism

Sequence at natural expiry T (`expiresAt`):

1. **[V] Two parallel stop paths start at T.**
   - Runner: `GuidedRuntime.schedule` and `GuidedOwnership.schedule` both arm a timer at `min(expiresAt, lease)`. They call `runtime.stop('EXPIRED')`, which sets `closing = closeResources(reason)`.
   - Backend: `GuidedSessionReaper.expire()` (every 10 s) runs `GuidedSessionService.expire()`, then `stop(session, "EXPIRED")`. That sets `teardownStatus PENDING`. After commit, `afterCompletion` makes one `CompletableFuture.runAsync` call to `stopSender` (`GuidedDispatchService.stop` → `runner.send("stop", …)`, random idempotency key).
2. **[V] The backend's stop joins the runner's in-flight close.** `transport.ts` → `GuidedOwnership.stop` → `stopEntry`. The runtime's `onStopping` only `invalidate`s the entry and leaves `entry.stopping` null. `stopEntry` then calls `runtime.stop(reason)`, which returns the same `closing` promise. The HTTP 200 is written only when `closing` resolves.
3. **[V] `closing` = `closeResources`**, in this order:
   - `observations.dispose()`, not awaited first;
   - `await browser.close()`: Playwright `BrowserContext.close()` with `recordVideo`, **with no deadline** (`run/browser.ts` `closeBrowser`);
   - `await disposal`;
   - `await callback('lifecycle', …)`, a single send with a 10 s bound (`guidedCallback`, `controllerRequest(…, 10_000)`).
4. **[V] The backend allows 15 s per attempt.** `GuidedRunnerClient.transportDeadline` caps each send at 15 s and maps timeout to `UNKNOWN_OUTCOME`. Separately, the runner server's `server.timeout = 30_000` kills any socket idle for 30 s. So no single attempt can wait for a close that takes longer than about 30 s.
5. **[V] Nothing ever retries the stop.** `GuidedSessionService.stop` `afterCompletion` catches every `RuntimeException` ("A lost acknowledgement never confirms teardown") and does not re-send. In main source, `teardownStatus` appears only in `GuidedSessionService.java`: it is checked at :2438 and written at :2463 (`PENDING`) and :2492 (`CONFIRMED`). The only write that sets `CONFIRMED` is that one acknowledgement path. No reaper, sweeper or startup path re-drives `PENDING`.
6. **[V] The runner's own `lifecycle` EXPIRED notice cannot confirm teardown.** `lifecycle()` → `internal()` → `owner()` requires `leaseExpiresAt > now` (else `STALE_FENCE 409`), and `active()` rejects terminal or expired sessions. At natural expiry the lease is ≤ `expiresAt` ≤ now, so the backend refuses that notice by construction. **[I]** Because of that, the refusal is fast, so the callback likely adds little to the close time here.

**What makes the close slow (step 3).** Measured **[V]** with a scratch probe: the same Playwright 1.63.0 as studio-runner, `launchPersistentContext`, `recordVideo` 1280×720 (the runner's `RECORDING_WIDTH/HEIGHT` defaults), a static page left idle, then `context.close()` timed. Results:

| Idle before close | `context.close()` |
|---|---|
| 5 s | 0.35 s |
| 60 s | 2.63 s |
| 600 s | **22.98 s** |

- The time grows roughly linearly with idle time, about 38–44 ms per idle second on an unloaded development Mac.
- **A 600 s static session cannot be acknowledged within the 15 s per-attempt deadline even with no other load [V].** On this machine the close alone took 22.98 s.
- Cause **[V, Playwright source]**: `FfmpegVideoRecorder._stop` emits the last frame stamped `lastFrame + (now − lastWrite)`, and ffmpeg runs with `-r 25`. So the entire idle tail since the last screencast frame (≈ idle seconds × 25 duplicated frames) is encoded during `close()`.
- `confirm-expire` waits on a static confirmation question for most of its 600 s, so most of the session is idle tail.
- This matches tap01's 15.0 s `UNKNOWN_OUTCOME`. **[I]** On the loaded CI host (Gradle, PostgreSQL and several Chromium processes) the close is probably longer than the 22.98 s measured here. I did not measure that host.

### H8.2 Classification

**This is a backend defect. The runner's stop behaves as the contract requires. The H8 fix is backend-only.**

- **Backend defect (necessary and sufficient):**
  - The contract makes `/stop` idempotent, and "lost stop acknowledgements mean teardown is pending/unknown, not proved complete" (bridge-design.md:71, :73).
  - So the backend has to keep re-driving the idempotent stop until it gets a real acknowledgement. Today it sends once, keeps nothing it could re-send, and never retries.
  - Any acknowledgement slower than 15 s therefore leaves `PENDING` forever. The causes include a slow video finalize, a GC pause, a network blip, or a backend restart between commit and send.
  - This is a real production defect. Every guided session that ends while idle for a long time (expiry, cancel after a long pause) is exposed, and the exposure grows with idle time.
- **Runner: not a defect.**
  - bridge-design.md:155 says "Stop200 is a STOPPED receipt only after cleanup".
  - Answering only after `browser.close()` is exactly that rule. It also protects the video: the webm is finalized only by an orderly close (`settleRecording(…, orderlyClose)`).
  - The slow close is a property of Playwright, not a contract breach.
  - The `lifecycle` send inside `closing` must keep its position. On runner-initiated stops it is what makes the session terminal *before* `recording-evidence` is sent, and recording evidence is accepted only after terminal (evidence.ts AR-1 R3 predicates 7-8). Moving it would put video settlement at risk.

### H8.3 Rulings on Dex's options

| Option | Ruling | Reason |
|---|---|---|
| (a) re-drive the stop | **ADOPTED**, made durable (below) | `/stop` is idempotent by contract. A later call joins the same `entry.stopping`/`closing` promise and returns 200 only after cleanup, so the acknowledgement is real and cannot be faked. |
| (b) runner answers an already-stopping entry immediately | **REJECTED** | It would return 200 before cleanup, which is a fake acknowledgement and violates bridge-design.md:155. |
| (c) treat the runner's `lifecycle` EXPIRED as the acknowledgement | **REJECTED** | The route authenticates the *current* owner with a live lease (bridge-design.md:71; `internal()`/`owner()`/`active()`), so it is always refused at expiry. Accepting it would weaken owner authentication on terminal sessions (a contract change). The send is also single-shot with no retry, so it can be lost. |

Raising the 15 s per-attempt cap instead is also **rejected**:
- The runner's 30 s socket idle timeout still applies, and the close time is unbounded.
- Chained idempotent attempts cover any close duration without holding long sockets open.

### H8.4 Change spec (backend; @dev; Java only; no migration; no contract or schema change)

1. **`GuidedDispatchService.stop(ObjectNode lastContext, String reason)`**
   - Send with a **deterministic** idempotency key: `runner.send("stop", stop, "teardown-" + GuidedContracts.hash(stop))` (73 chars).
   - Reason: random keys add one entry to the runner's replay map on every retry. That map is capped at 10,000 per process (`transport.ts` `CAPACITY`), so retrying with random keys would eventually lock *every* session out with `CAPACITY`.
   - With the same key and the same digest, the runner joins the original promise.
   - The body is unchanged.
2. **`GuidedSessionService.stop(session, state)`**, inside the existing transaction, wherever it sets `teardownStatus PENDING`:
   - Compute the wire reason once, with the same ternary that lives in `afterCompletion` today (`REVOKED` / `CANCELLED` / `EXPIRED` / `UNKNOWN_OUTCOME`).
   - Persist `progress.teardownRequest = {target: <notifyContext>, reason: <wireReason>}`.
   - Both values are value-free: the target is either a context identity from `materialization.identity` or the assignment intent. Neither contains authored inputs, bindings or secrets.
   - Effect: the request is committed atomically with the terminal state, so a backend restart cannot lose it.
3. **`afterCompletion`**
   - Replace the inline `stopSender.accept` and the confirm block with `teardownAttempt(sessionId, target, reason)`.
   - Run it on a bounded dedicated executor (for example 2 threads, queue 64, discard when full, because the sweeper retries) instead of the common ForkJoinPool. Blocking network I/O of up to 15 s must not run on the common pool.
4. **New `GuidedSessionService.teardownAttempt(String id, ObjectNode target, String reason)`**
   - Keep a per-JVM in-flight guard (`ConcurrentHashMap.newKeySet()`); if the session already has an attempt in flight, return.
   - Call `stopSender.accept(target, reason)` outside any transaction (`noTransaction()` is already enforced).
   - **Only if it returns normally**, run `repository.transaction`:
     - `lock(id)`;
     - if `terminal(s) && "PENDING".equals(progress.teardownStatus)`, set `teardownStatus CONFIRMED`, remove `teardownRequest`, and `save`.
   - On `UNKNOWN_OUTCOME` (a transport timeout, meaning the runner may still be closing): re-send at once, at most 2 more back-to-back attempts in the same call.
     - Each re-send joins the same runner `closing`, so `CONFIRMED` lands as soon as the close finishes (about 23 s after T, measured locally).
     - Without this, `CONFIRMED` would wait up to one extra sweep tick.
   - Any other `RuntimeException`, or running out of those attempts: swallow it and leave `PENDING`, as today. The sweep picks the session up again.
   - It must **never** call the private `stop(...)` again or touch state, actions, ledger, counters or evidence.
5. **New `GuidedSessionService.redriveTeardowns()`**, called by `GuidedSessionReaper` right after `expire()` on the same schedule:
   - Select the due rows with `repository.pendingTeardowns(Instant now, Duration window, int limit)`:

     ```sql
     SELECT session_id FROM studio_guided_sessions
     WHERE state IN ('SUCCEEDED','PUBLICATION_CONFLICT','FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED')
       AND progress->>'teardownStatus' = 'PENDING'
       AND progress->'teardownRequest' IS NOT NULL
       AND expires_at > ?
     ORDER BY expires_at LIMIT ?
     ```

     - The bind is `now − window`.
     - Do **not** use the jsonb `?` operator. pgjdbc treats it as a placeholder (the same trap as H10).
   - For each selected id, read `teardownRequest` in a short read transaction, then submit `teardownAttempt` to the executor. The reaper thread never blocks on the network.
   - Count the rows that are `PENDING`, have a `teardownRequest`, and are past the window. If the count is above 0, log one value-free `WARN` per sweep with the count only. These rows stay `PENDING`, which is the truthful state: the backend has no proof of teardown, for example because the runner process is gone.
   - Configuration, read with `@Value` the same way as `reaper-delay-ms`. Do not add these to `GuidedSessionProperties`, which is the snapshotted session-limits contract.
     - `studio.guided-authoring.teardown-redrive-window` (Duration, default `PT15M`);
     - `studio.guided-authoring.teardown-redrive-batch` (default `32`).
6. **Out of scope:** no change to the runner, the `lifecycle` route, the transport deadline, the V19 retain list, the publication or recording flows, or the ReplayIT guard.
   - `teardownRequest` is not on the retain list, so retention pruning drops it. A pruned row is no longer re-driven, which is correct.
   - Rows that are `PENDING` from before this change have no `teardownRequest` and are not re-driven. That matches today's behavior, and Studio is unreleased.

**Invariants preserved:**
- **At-most-once.** Stop is not an application effect. The runner's stop path only closes the browser and never dispatches. The target identity pins the exact session, context and fence, so a stop cannot reach another session, and the runner checks `sameIdentity` and the assignment digest.
- **No fake acknowledgement.** `CONFIRMED` is written only after a 200 that `GuidedRunnerClient` has validated (identity echo, or a `STOPPED` receipt). The runner sends 200 only after `closing` resolves. A failed `browser.close()` rejects `closing` permanently, so the stop is refused permanently and the row stays `PENDING`, which is truthful.
- **Terminal and video settlement.** Terminal state is written once, by the original `stop`. The redrive changes only `teardownStatus` and `teardownRequest`. The runner starts `settleRecording` in `closeResources`' `finally`, independently of any stop acknowledgement, and retries do not change that.

### H8.5 Tests (@dev; Quinn re-gates)

- **`GuidedServiceTransportFaultIT` (stub `installStopSender`):**
  - **`expiredTeardownConfirmsOnImmediateResendAfterAckTimeout`.** The first `stopSender` call throws `UNKNOWN_OUTCOME`; the second returns.
    - `CONFIRMED` comes from the `afterCompletion` path alone.
    - `stops == 2`, with an identical target and reason.
  - **`expiredTeardownConfirmsOnSweepAfterResendsExhausted`.** Three calls throw `UNKNOWN_OUTCOME`; the fourth returns.
    - After `expire()`: `teardownStatus PENDING` and `teardownRequest` present.
    - After `redriveTeardowns()`: `CONFIRMED`, `teardownRequest` absent.
    - `stops == 4`.
  - In both tests: state stays `EXPIRED`. Action and ledger rows are byte-identical before and after the redrive. Recording or evidence status is untouched.
  - **`teardownWithoutAckNeverConfirmsAndStopsAfterWindow`.** The stub always throws. Advance the clock past `window`.
    - The status stays `PENDING`.
    - No further `stopSender` calls are made after the window.
    - One `WARN` is logged per sweep, with the count only and no identifiers' values.
  - **`concurrentAfterCompletionAndSweepSendOneStopAtATime`.** A stub blocks the first send while `redriveTeardowns()` runs: at most one in-flight call per session.
  - **`legacyPendingWithoutRequestIsNotRedriven`.** Covers the pre-change rows.
- **`GuidedBridgeIntegrationTest` (real worker):**
  - Keep `cancellationBeforeConsumptionRevokesAndMissingStopAckNeverConfirmsTeardown` unchanged. The worker is destroyed, so every redrive fails and the row stays `PENDING`.
  - Add **`stopRetryAfterCloseCompletesConfirmsWithSameKey`**: cancel the session, let the first stop time out, then redrive. Expect `CONFIRMED`, and the runner replay map gains only one entry for the key.
- **Unit test on `GuidedDispatchService.stop`:** the key is `teardown-` + hash(body), the same across calls.
- **Runner `test/guided/ownership.test.ts`** (no source change; these pin the behavior H8 relies on):
  - While a self-initiated EXPIRED `closeResources` is pending, the stop promise stays unresolved until `browser.close` resolves.
  - A second stop, with a new key or the same key, resolves on the same completion.
  - A rejected close keeps the stop rejected.
- **Joined lane:** rerun `guidedIncrementalTest` (35 labels).
  - Expected: `confirm-expire` reaches `CONFIRMED` within about one close duration plus one sweep after T.
  - The 17 H8 labels then run their bodies; their own outcomes are unknown today.
  - **Risk [I], likely:**
    - The close is ≥ 23 s after T (measured locally). The variant ends at about T+9 (609 s). The ReplayIT guard polls for 20 s, so its window closes at about T+29.
    - So `CONFIRMED` can land after the window, and the *first* following label can still be refused.
    - Measure this in the rerun.
  - If it is still refused, the lawful test-side fix is for `confirm-expire` to wait (bounded, for example 120 s) for `teardownStatus CONFIRMED` before it returns. That changes no label, no order and no guard. It needs Quinn's acknowledgement. Do not relax the guard.

### H8.6 Residual risks (flagged, not fixed here)

- **Runner `browser.close()` has no deadline.** If it hangs, the runner's capacity-1 slot stays occupied (`occupied()` ⇒ `runtime.active`) and stop never acknowledges.
  - A bounded close with a kill fallback would lose the webm (`orderlyClose=false`, `UNAVAILABLE`). That is an evidence trade-off for PO and Quinn, not part of H8.
- **The idle-tail encode grows linearly with idle time.**
  - **[I]** It also delays `recordingSettled` for every long-paused session.
  - A runner-side mitigation would be a periodic frame write during pauses. That is out of scope and needs its own measurement.
- **Performance.** The sweep query filters on `progress->>'teardownStatus'` across terminal rows. Retention bounds that table. If the sweep shows up in profiles, @data-engineer can add a partial index later; no migration is needed now.

---

## H6: `containsText` fails because the read value keeps its padding spaces

### H6.1 Product semantics ruling

**`containsText(expected)` passes iff `N(innerText(target))` contains `N(expected)` as a substring.**

`N` is Playwright 1.63 `normalizeWhiteSpace`:
1. remove U+200B and U+00AD;
2. replace every maximal run of ECMAScript `\s` (which includes line terminators and NBSP) with one U+0020;
3. trim.

The match stays case-sensitive. Regex is not offered on the observed path.

Basis:
- **[V] The accepted precedent is the inference contract, decision F4** (`docs/architecture/studio-inference-contract-v1.md` §6): "accepted assertion behavior follows the pinned Playwright 1.63.0 semantics. String `toContainText` … normalize whitespace in actual/expected".
- **[V] Playwright's `ExpectedTextMatcher`** normalizes both sides for string substring matching (`coreBundle.js`).
- The observed path inherits F4, because it is the same authoring predicate and the compile path was retired in favor of the single observed path.
- **Captured values stay exact.** consensus-plan.md:118 says "Preserve accepted strings exactly". Read bytes, binding values and their hashes do not change. That rules out Dex's option (c), trimming at capture.
- **The actual text source stays the rendered `innerText`.**
  - It already is today. It is the visible text the user sees and that the video shows.
  - It never throws on non-business subtrees. Option (a), comparing on `businessText`, would refuse `containsText` on any target that contains inputs or hidden children, which is a capability loss.
  - This also matches the read policy, which is based on visibility.
- **`hasValue` stays exact.** It already is, and that matches Playwright `toHaveValue`.
- **Edge case pinned for parity:** an expected value that is only whitespace normalizes to `""`, which matches anything (Playwright does the same).
  - That case is reachable only from authored nonsecret literals; a read refuses blank captures.
  - Before this change it usually *failed* (`innerText.includes("  ")`).
  - Flag for Pax: whether planning should refuse a blank `assert.expected`. That is a separate decision and not needed for H6.
- **Known limitation, not in H6.** CSS `text-transform` changes `innerText` but not the raw text that read captures. So a read followed by `containsText` on an uppercase-styled element can still mismatch on case. No evidence of this has been seen; it is recorded for follow-up.

### H6.2 Change spec (runner; @dev)

- **`studio-runner/src/run/observationCollector.ts`**
  - In the `invoke` → `case 'assert'` branch (line 751 today), change:

    ```ts
    if (operation.predicate === 'containsText') return { assertionPassed: normalizeName((element as HTMLElement).innerText).includes(normalizeName(value())) };
    ```

  - `normalizeName` (line 52, same closure; it is the locator-name transformation) already matches Playwright `normalizeWhiteSpace` exactly. Collapsing first and then trimming gives the same result as trimming first, because `\s` and `trim` use the same character set.
  - Add a one-line comment that cites F4 and Playwright 1.63 `normalizeWhiteSpace` parity. Optionally add the alias `const normalizeWhiteSpace = normalizeName;`.
  - The comparison is in-page and returns only a boolean, so no value leaves the page. There is no change to redaction or withholding.
- **Do not change:**
  - `read`, `businessText`, `validateInvocation`, `hasValue`, `assertPage` (`url`/`title`);
  - the backend, contracts or schemas;
  - the ReplayIT fixture value (it is frozen).
- **Both guided learning and published observed replay are fixed by this one edit.** Both reach this `invoke`, and it is the only `containsText` implementation in `studio-runner/src` **[V]**.
- **Version decision (`[AUTO-DECISION]`):** `EXECUTOR_VERSION` stays `2.1.0`.
  - It is provenance only; no gate reads it **[V]**, and the backend only projects it.
  - The runner dist hash already identifies the build in every joined run.
  - Studio is unreleased (single path, no compatibility).
  - A bump would also ripple into `compat.test.ts`, `fixtures-tier/observed-replay.test.ts` and `helpers/harness.ts`, none of which relate to H6.
- **Dist rebuild is required.** The joined backend lanes execute `studio-runner/dist`.
  - Run the runner package's `build` script (`tsc -p tsconfig.build.json && node scripts/write-runtime-versions.mjs`).
  - Record the new `dist/run/observationCollector.js` hash and the dist manifest hash in the next run's collector receipt.
  - Expect "dist stable" to change exactly once.

### H6.3 Tests

- **Unit, `test/run/observationCollectorInvoke.test.ts`.** Keep the existing `'containsText checks the rendered text of the target'`. Add `'containsText compares whitespace-normalized rendered text with the whitespace-normalized expected value (F4)'` with these cases:

  | innerText | expected | result |
  |---|---|---|
  | `'fresh-1-x-é😀 '` | `'  fresh-1-x-é😀  '` (H6 regression) | true |
  | `'Order 42\nconfirmed'` | `'Order\t42  confirmed'` | true |
  | `'Order 42'` | `'Order 42'` | true |
  | `'Con­firmed'` | `'Confirmed'` | true |
  | `'Order 42 confirmed'` | `'cancelled'` | false |
  | `'Order 42 confirmed'` | `'order 42'` (case) | false |
  | `'Order42'` | `'Order 42'` (normalizing never joins words) | false |
  | any | `'   '` (pinned parity; Pax flag) | true |

  Add one read case: a read of a padded `businessText` returns the padded string byte-exact, which guards against trimming at capture.
- **Fixtures tier, real Chromium.** Add to `test/fixtures-tier/guided-dataflow.test.ts`, or a new `observed-contains-text-parity.test.ts`:
  - Use a table of visible-only markups, including the frozen ReplayIT shape `<dd>␠␠fresh-1-<uuid>-é😀␠␠</dd>`.
  - For each, compare the runner's `invoke` `containsText` result with `expect(locator).toContainText(expected)` from the pinned Playwright, used as the **oracle** (as F4 requires). Use the `.not` form for the expected-false rows.
  - Exclude hidden descendants and `text-transform` from the table. On those, Playwright's text source (`elementText`, which is like `textContent`) intentionally differs from `innerText`.
- **Joined lane:** rerun the `assert-fail` label against the rebuilt dist. Base learning must pass step 3. The variant's own deliberate assertion failure (`incrementalDomVariant`) must still fail as designed.

---

## Auto-decisions

- `[AUTO-DECISION]` H8 re-drive cadence → reuse the existing reaper tick (`reaper-delay-ms`, 10 s) with a 15 min window and a batch of 32. (Reason: no new scheduler; the window is far longer than any measured close.)
- `[AUTO-DECISION]` H8 storage → a `progress.teardownRequest` jsonb key, with no migration. (Reason: it commits atomically with the terminal transition, retention prunes it naturally, and progress has no schema validation **[V]** `GuidedSessionRepository.save`.)
- `[AUTO-DECISION]` H6 actual-text source → keep `innerText`, not Playwright's `textContent`-like `elementText`. (Reason: assertions stay visible-only and no capability is lost. F4 is applied to the whitespace dimension only.)
- `[AUTO-DECISION]` H6 whitespace-only expected → Playwright parity (passes), flagged to Pax. (Reason: Article IV, no invented refusal semantics.)
- `[AUTO-DECISION]` H6 → no `EXECUTOR_VERSION` bump (reason above).

## What I ran

- Read the code and specs listed in `manifest.json` `inputsRelied`. The verified/inferred labels are inline above.
- Ran the scratch probe `h8probe/probe.mjs` in the session scratchpad. It uses studio-runner's installed Playwright 1.63.0 and Chromium; no repo, dist or build output was touched. Runs and results:
  - idle 5 s: 346 ms;
  - idle 60 s: 2632 ms;
  - idle 600 s: 22979 ms.
  - The webm files and scratch profiles stay in the scratchpad only.
- Not run: Gradle, the runner test tiers, or any rebuild.
