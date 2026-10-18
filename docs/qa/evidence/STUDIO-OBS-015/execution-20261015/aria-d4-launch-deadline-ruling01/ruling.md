# Ruling: REL-001 D4, a deadline for the guided start (STUDIO-OBS-015)

Aria (@architect), 2026-10-17. Read-only: no source edited, nothing run except `grep`/`sed` reads and one tally script over the committed repro `*.jsonl`. [V] = I read the code or data. [I] = inference.

Inputs: `runner/rel001-rootcause01/root-cause.md` §6 (D4), `repro/results/verdict.md` §3.6, `fix-a-cause-preservation.patch`. Patch A (and B's `versionProbe.ts`) are already in the working tree [V: `runtime.ts` has `startPhase`, `guidedBrowser.ts:56-60` takes `cause, phase`], so the line numbers below are the current tree's.

## 0. The two numbers, verified

| Value | Where | Notes |
|---|---|---|
| Backend: **15 s** per runner call | `backend/.../guided/bridge/GuidedRunnerClient.java:349-361` `transportDeadline()`: `Duration.ofSeconds(15)`, hard-coded (not a property). Applied at `:172` (`HttpRequest.timeout`) and on `exchange.get(remaining…)`. | Lowered only when a caller deadline is passed (the keyed append overload passes `leaseExpiresAt`, `GuidedDispatchService.java:103-107`). On expiry the call becomes plain `UNKNOWN_OUTCOME 409` (transport uncertainty, not a closed refusal). It is also documented as "a 15-second HTTP ceiling" in `docs/specs/studio-observed-authoring/delayed-state-design.md:108`. [V] |
| Playwright: **180 s** launch | `studio-runner/node_modules/playwright-core/lib/coreBundle.js:4595`: `DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT = 3 * 60 * 1e3` (1.63.0). Applies because `launchGuidedBrowser` (`src/run/browser.ts:540`) passes no `timeout`. | After the launch, `newPage`, `page.close`, `video.path/delete` and CDP `send` have no timeout at all. [V] |

There are two things that are not guided deadlines and should not be mistaken for one. `BROWSER_LAUNCH_TIMEOUT_MS` (`src/server/config.ts:334`, 60 s) is used only by the replay supervisor (`main.ts:66` → `launcher.ts:481`), and `guidedMain.ts` never reads it. `server.requestTimeout = 15_000` (`transport.ts:127`) bounds how long receiving the request may take, not how long the handler runs. [V]

Why it hangs and holds the slot [V]: `GuidedRuntime.closeResources` (`runtime.ts:504`) begins with `await this.launching`. So a hung launch also hangs `stop()`, and that is the "close hung" in the repro. `browserClosed` never becomes true, `active` stays true, `GuidedOwnership.occupied` stays true, and every later `assign` is refused `CAPACITY` (capacity 1, `ownership.ts:109`). A second push to the same session runs `await entry.contextStart` (`ownership.ts:135`) and hangs as well. The three repro hangs all have `recordingReadyMs: null` [V, jsonl]. That means they stopped before APP_PAGE finished, inside PROCESS, PROBE, STARTUP_PAGE or APP_PAGE. Which of those it was is not recorded, because the launch sub-phase is local to `browser.ts`.

## 1. Bound it? Yes. How

**Decision: one start budget, armed once, derived from the backend's 15 s ceiling. No new configuration knob.**

- `GUIDED_START_BUDGET_MS = 15_000 − 3_000 = 12_000`. It is a runner constant, not an env or mounted-config key. Its comment names `GuidedRunnerClient.transportDeadline` and delayed-state-design.md:108, and a unit test pins the derivation. The 3 s is the reserve for teardown, the lifecycle callback and the reply, so that the refusal normally reaches the backend inside its window.
- **Anchor:** the start of `GuidedRuntime.start()`, on one timer that nothing extends (the same rule as `run/deadline.ts`). The effective deadline is `min(t0 + 12_000, this.deadline())`, so it also never runs past the existing lease or expiry.
- **Scope:** the whole `start()`, VALIDATE through STARTED (journal, recorder open, launch, withhold, blank match, `bootstrap-evidence`). The reason is that the backend's 15 s covers the whole push, not only the Chrome launch.
- **Mechanism: REUSE `boundedStartup(work, deadline, signal)`** from `run/observedBootstrap.ts:21`, which is the replay path's existing pattern (`browser.ts:141-181`).
  - The runtime owns an `AbortController`. It wraps each awaited start step in `boundedStartup`, and it aborts the signal from `stop()` during start, so a lease loss or stop during launch no longer waits on the launch.
  - The `launch` option gains an optional 5th argument `startup: { deadlineEpochMs, signal }` (the replay `request.startup` shape). This is an internal TypeScript type, not wire. Existing fakes stay valid.
  - Inside `launchGuidedBrowser`, every await is wrapped in `boundedStartup`, including `launchPersistentContext`, `newPage`, `page.close`, `video.path/delete`, the probe, `route` and CDP `send`.
  - `launchPersistentContext` also gets `timeout` = the time remaining to the 15 s horizon (t0 + 15 s). This is only a backstop that ends Playwright's own progress. It fires strictly after the runner deadline, so the reported cause is always the runner's.
- **Close:** `closeResources` must not await `launching` without a bound. The real launcher always settles by the deadline plus its teardown (§3). As a defence, the runtime waits at most the 3 s reserve. If the launcher has still not settled, the runtime treats it like any close failure: `browserClosed` stays false and the slot stays held (fail closed). A late settlement runs that launcher's `close()` and only then releases the slot.
- **Evidence for 12 s** [V, tally over `matrix-variant-a-node24/*.jsonl` + `parity-node23.10.0`]: across 2302 completed starts the slowest whole start (`contextMs`) was 11.50 s, with p99 9.44 s, in throttle+cpu, the most starved mode. None was above 12 s. Normal starts take 0.6 to 2 s. Any start that would finish after about 14.5 s is wasted anyway, because the backend has already given up.
- **Not in scope:** bounding the close of a *started* session (`runtime.ts` close-failure swallow, D5). No hang there has been observed. It stays with D5.

Trade-off: a start that would have finished between 12 s and about 14.5 s is now refused (0 of 2302 measured, rule-of-three bound about 0.13%). In return, slot occupancy is bounded at about 15 s instead of 180 s or unbounded, and the backend gets a closed refusal instead of a timeout.

Rejected alternatives:

- Playwright `timeout` alone. It covers only PROCESS, and Playwright's own cleanup on timeout tries a graceful close for up to 30 s first (`coreBundle.js:39831-39871`).
- Reusing `BROWSER_LAUNCH_TIMEOUT_MS`. It is the replay knob, 60 s, which is more than 15 s.
- The lease as the bound. Renewals move it, up to the assignment's expiry.
- A new `GUIDED_START_TIMEOUT_MS` knob. It is avoidable, and it would invite drift above the backend's 15 s.
- Moving the guided browser into a forked, supervised child like replay. That is the right long-term shape, but it is a redesign and does not belong in 015.

## 2. Failure semantics under patch A's closed vocabulary

**No new vocabulary values.**

| Field | Value on deadline |
|---|---|
| `GuidedStartPhase` (`GuidedStartFailure.phase`) | the step in progress when the deadline fired, normally `LAUNCH`; it can also be `JOURNAL`, `RECORDER`, `WITHHOLD`, `BLANK_MATCH` or `BOOTSTRAP_CALLBACK` |
| `GuidedLaunchPhase` (`GuidedLaunchFailure.phase`) | the launch sub-step in progress: `PROCESS`, `PROBE`, `STARTUP_PAGE`, `APP_PAGE`, `ROUTING` or `BLANK_DOCUMENT` (this also answers where the repro hangs were) |
| `loss` | `null`. A deadline is not a browser loss; `GuidedLossReason` stays the four reasons a running browser can report |
| innermost cause | `boundedStartup`'s existing `new Error('TIMEOUT')`, which describes as `{name:'Error', code:'TIMEOUT'}`. A stop during start gives `code:'CANCELLED'`. This is deliberately **not** `kind:'TIMEOUT'`: that stays reserved for a Playwright action timeout (for example patch B's 5 s field wait), so the two remain distinguishable in one read |

Example line (`describeStartFailure`, unchanged):
`GUIDED_START_FAILED {"operation":"context",…,"elapsedMs":12…,"links":[{"name":"GuidedStartFailure","code":"CONTEXT_LOST","phase":"LAUNCH"},{"name":"Error","code":"CONTEXT_LOST"},{"name":"GuidedLaunchFailure","code":"CONTEXT_LOST","phase":"PROCESS"},{"name":"Error","code":"TIMEOUT"}]}`

**Wire: unchanged.**

- The runner answers `409 {"code":"CONTEXT_LOST"}` through the same path as every start failure: `GuidedStartFailure` in `ownership.ts:140`, then the `transport.ts` catch.
- The backend's `GuidedRunnerClient.contextRefusal` turns that into `UNKNOWN_OUTCOME 409` with `messageCode RUNNER_CONTEXT_CLOSED_REFUSAL` (`closedContextRefusal` = true, not retryable), the same as attempt03.
- If teardown or the lifecycle callback pushes the reply past 15 s, the backend sees today's plain transport `UNKNOWN_OUTCOME`. The next push to that session then gets a prompt `CONTEXT_LOST`, because the entry is stopped (`ownership.ts:127` `live`).
- No openapi, schema, ADR-002 §13 row, backend source or contract digest changes.

## 3. Teardown on timeout: kill the launched tree, no leak

On a start deadline (or abort), **skip the graceful close**. The browser is hung, and a graceful close is what hung in the repro. Then:

1. **Identify only this launch's processes.**
   - The browser is a direct child of the worker (`process.pid`) whose argv contains this launch's `mkdtemp` scratch path (Playwright puts `--user-data-dir=<scratch>/profile` there [V `coreBundle.js:43319`]).
   - The video encoder is a direct child whose argv contains this launch's `recording.dir` (ffmpeg's last argument is the output file [V `coreBundle.js:37095-37098`]).
   - REUSE `run/tree.ts`. ADAPT `readProcessTable` to `ps -A -ww -o pid=,ppid=,args=`, with matching done in memory only. Argv and paths are never logged, which keeps patch A's value-free logging.
   - Rejected: "children that appeared since launch start". That breaks if `capacity` is ever above 1, and it could kill another session's browser.
2. **REUSE `signalProcessTree(root, 'SIGKILL')`** on each root. It enumerates first and kills deepest-first, and it signals each member together with its group, which is where Chromium's renderers live (`tree.ts:189-244`).
3. Wait at most 1 s for the abandoned `launchPersistentContext` promise to settle. If it *resolved* (it raced the deadline), close that context with a bound. Then re-enumerate and kill again, which covers a Chrome that spawned after step 1.
4. Verify every enumerated pid with `isAlive` (bounded poll, at most 500 ms). Then `disposeScratch()` (`releaseBrowserProfile` + `rm`). The recorder's existing UNAVAILABLE settle owns `recording.dir`.
5. Any survivor makes `GuidedLaunchFailure.close()` reject. The existing `closeResources` behaviour then keeps the slot held (fail closed); it is never released over a live browser.
6. `guidedMain.ts` refuses to start unless `canEnumerateProcessTree()` passes, which is the same guard replay has at `main.ts:125`. Without `ps`, every kill would silently find nothing.

Total teardown is at most about 1.5 s plus kill latency, inside the 3 s reserve. The `close()` is idempotent and bounded.

## 4. Deterministic regression tests

Unit tier. Browser-free, as AC-25 requires; fake timers.

| Test | Proves | Red before because |
|---|---|---|
| `runtime.test.ts`: a launcher that never resolves and ignores its signal | `start()` rejects `CONTEXT_LOST` at exactly 12 000 ms; `startFailure` = `{phase:'LAUNCH', loss:null}`; the innermost cause is `code TIMEOUT`; `startup.signal` is aborted; `stop()` resolves (does not hang); the slot stays held | start never settles |
| same, with a launcher that honours its contract (rejects `GuidedLaunchFailure(closeSpy, Error('TIMEOUT'), 'PROCESS')` on abort) | `closeSpy` is called once, the slot is released, and the next `assign` is accepted | no deadline, no abort |
| `runtime.test.ts`: a lease that ends at 5 s | the deadline is clamped to `this.deadline()` and fires at 5 s | — |
| `runtime.test.ts`: `stop('LEASE_LOST')` during launch | the signal is aborted, the cause is `code CANCELLED`, and `stop()` resolves within the reserve | `closeResources` awaits `launching` |
| `runtime.test.ts`: a `bootstrap-evidence` callback that never resolves | the deadline fires with phase `BOOTSTRAP_CALLBACK` | unbounded |
| `ownership.test.ts`: never-resolving launcher → `context()` | `GuidedStartFailure` with the full chain; one `GUIDED_START_FAILED` line containing `code TIMEOUT` | hangs |
| `tree.test.ts`: pure selection over synthetic `ProcessRow`+args tables | only direct children of the worker whose argv contains *this* scratch or recording dir are chosen; another session's browser is not | new code |
| constant pin | `GUIDED_START_BUDGET_MS === 15_000 − 3_000`, with the backend reference in the comment | new code |

Fixtures tier. Real Chromium; this is the only tier that can prove the kill.

- Call `launchGuidedBrowser` with `startup.deadlineEpochMs = now + 3 000`. A watcher polls the process table every 10 ms and sends `SIGSTOP` to the browser's group as soon as the new child appears. That freezes Chrome regardless of timing, so the launch hangs deterministically.
- Assert:
  - the call rejects `GuidedLaunchFailure` with `cause.message 'TIMEOUT'` and some `GuidedLaunchPhase`, within deadline + 3 s;
  - after `close()`, every pid snapshotted while the browser was stopped reports `!isAlive` (SIGKILL works on a stopped process);
  - the scratch directory is gone;
  - `recording.dir` is empty after settle.
- Mutation check: drop the kill step, and the survivor assertion goes red.

Optional smoke: re-run `repro/harness-stress.mjs` in throttle+cpu. Each former hang should now end at about 12 s with `code TIMEOUT` and `close: ok`.

## 5. In 015 now? Yes, as a separate finding

- **Include it in 015**, in the same runner change set as patches A and B.
  - It is the same start path and the same files (`runtime.ts`, `browser.ts`, `ownership.ts`, `guidedBrowser.ts`), and it needs A's `GuidedLaunchFailure(cause, phase)`.
  - The runner source and dist digests are being replaced by A anyway, so it adds no extra gate cycle beyond the new unit and fixtures tests in the order already planned: unit → build → fixtures → image → deployment → backend `check`.
  - It is a proven defect: 3 observed hangs, each holding the only slot.
- **Record it as REL-001/D4. Do not record it as the attempt03 fix.** Attempt03 refused after 1.98 s; D4 does not explain it. The story must not claim that D4 closes the CONTEXT_LOST occurrence.
- **Not in this change:** D5 (other swallows, and bounding the close of a started session), D6 (launch retry), the ordering of the lifecycle callback before the reply, and making the backend's 15 s a named or shared constant. All of these stay as they are. No backend edit.
- **Security:** kills target only processes identified by runner-created unique paths, and only direct children of the worker. Argv is never logged. The slot is never released over a live browser (fail closed). The worker refuses to start without process enumeration.

[AUTO-DECISION] Reserve 3 s vs 1 s → 3 s (reason: the reply waits on teardown and the lifecycle callback in `ownership.ts:140`. 12 s still sits above every measured start).
[AUTO-DECISION] `code TIMEOUT` vs `kind TIMEOUT` → `code` (reason: it keeps the runner deadline distinguishable from a Playwright action timeout with no change to `diagnostics.ts`).
[AUTO-DECISION] Started-session close bound → deferred to D5 (reason: not evidenced; scope).
