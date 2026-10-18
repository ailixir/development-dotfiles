# Ruling: REL-001 D4, the two replies at the backend's 15 s deadline (after W10)

Aria (@architect), 2026-10-17. Read-only. I ran no tests or builds (gate `final-gates06` is live). [V] = I read the code at the cited line. [I] = inference.

Inputs: story W10 Dev Agent Record (Quinn F2, F4 rows) and change log 0.1.16; `w10-review-fixes01/`; `ratification.md` (this directory); Quinn `qa-source-review-w6-w9/findings.json` F2, F4.

## Verdict: ACCEPT AS IS. Do not stop `final-gates06`. No code change.

Option 1. Both edge cases end with the backend's own transport timeout, plain `UNKNOWN_OUTCOME 409`, not the runner's `CONTEXT_LOST`. On every backend path that can start a guided runtime, that outcome is handled exactly like `RUNNER_CONTEXT_CLOSED_REFUSAL`. The slot stays held, no second start is possible, and the session reaches the same final state.

## 1. The wire outcome is deterministic, not a race

- The backend sets its deadline when `send()` begins: `transportDeadline()` is computed at `GuidedRunnerClient.java:145`, before the connection, TLS and the request body [V].
- The runner sets `began` when `GuidedRuntime.start()` begins (`runtime.ts:147`, `:202`). That is after TLS, JWT check, body read, schema validation and the ownership checks (`transport.ts:80-101`, `ownership.ts:127-139`) [V].
- So the runner's t0 is always later than the backend's anchor. Any reply sent at or after t0 + 15 000 ms, plus network time, arrives after the backend's `exchange.get(remaining(deadline))` has failed. Real timers fire at or after the time they were set for.
  - (a) Quinn F4, a launcher that ignores the abort and never settles: start() rejects at t0 + 12 000. `closeResources` waits `endedWithin(launching, 3000)` (`runtime.ts:564`), then throws `hung`. The reply goes out at t0 + 15 000 or later. The backend has always timed out first.
  - (b) Quinn F2, no Chrome found at the first listing: `hardTeardown` waits until `backstopAt` = t0 + 15 000 (`browser.ts:543-556`, `:687`). It then lists again, runs `survivorsOf(…, 500)` and `disposeScratch` (`:694-696`). `closeResources` then awaits the lifecycle callback (`runtime.ts:584`). The reply goes out at t0 + 15 s plus that work. It is strictly late, not "about 15 s" (correction to the W10 wording).
- Result: in (a) and (b), the backend sees `UNKNOWN_OUTCOME` with `messageCode` `UNKNOWN_OUTCOME`. In every other D4 case it sees `UNKNOWN_OUTCOME` with `messageCode` `RUNNER_CONTEXT_CLOSED_REFUSAL`. Each case has one fixed outcome. [I] The only exception would be clock-rate skew between JVM and Node in the ppm range, which is irrelevant at this scale.

## 2. What the backend does with it (verified safe)

**The start is reached only through non-keyed context sends.**
- `runtime.start()` runs only when `entry.runtime` is null (`ownership.ts:135-139`). `entry.runtime` is never set back to null (only one assignment exists, at `:137`) [V].
- Every backend context send goes through `GuidedDispatchService`: `pushContext` (`:94-111`) and `prepareAndAdmit` (`:145`) [V].
- The first push is the bootstrap push, `GuidedTranslationService.java:326`. It uses `runner.send("context", context)`, with a random Idempotency-Key and no caller deadline [V].
- [I] Keyed append deliveries (`pushMaterializedContext`) run only after bootstrap is ready, so they never trigger a start. That is the only path where `closedContextRefusal` is treated differently (`:1244`).

**The two outcomes get the same handling.**
- On the bootstrap path (`:327-336`), `syncContext` (`:1185-1193`), the prefix path (`:450-457`) and `prepareAndAdmit` (`:146-153`), only `definiteContextRefusal` is acted on. That covers `IDENTITY_MISMATCH` and `SCHEMA`.
- `CONTEXT_LOST` is not definite. Both outcomes therefore reach the same `throw failure` [V].
- The public body is `409 {code: UNKNOWN_OUTCOME, retryable: false, messageCode}` (`GuidedSessionException.response()`). Only `messageCode` differs, and no frontend code branches on it (grep of `frontend/src`: no hits) [V].

**The session converges to the same final state.**
- A bootstrap delivery is recorded before each send (`beginBootstrapDelivery`, `:620-655`). The next continuation tries again with a new key.
- On the runner, the retry fails at `live(entry)` with `CONTEXT_LOST`: `stopEntry` set `entry.stopped` synchronously when the start failed, at t0 + 12 s, before the backend's first timeout (`ownership.ts:142`, `:146`, `:41`) [V]. A new Idempotency-Key means no replay hit (`transport.ts:96-114`) [V].
- After 3 deliveries the delivery is `exhausted`, and `failTranslation(RUNTIME_INCOMPATIBLE)` follows (`:640-642`) [V]. The sequence is the same whichever outcome came first.
- In (b), the runner's lifecycle callback reaches the backend after the backend's timeout, not before the 409. `GuidedSessionService.lifecycle` (`:2483-2503`) stops the session `FAILED` under the session lock [V]. That is the same state the normal D4 path reaches.
- [I] On the non-definite branch, the backend writes nothing after the failed send, so the late callback has no write to race with.
- In (a), no callback is ever sent (`hung` throws before `:584`). That is true in both outcomes.

**The slot stays held, and no runtime is started twice.**
- The runner never reacts to the backend cancelling the request: there is no `close` or `aborted` handler on the request (`transport.ts:77-125`) [V]. `server.requestTimeout` covers only receiving the request [I, Node semantics].
- The slot is `occupied()` while `runtime.active` is true (`ownership.ts:39`) [V]. `browserClosed` stays false until the teardown is confirmed (`runtime.ts:578-582`) [V].
- A new assignment on this worker is refused with `CAPACITY` (`ownership.ts:109`) [V]. A retried context cannot start a runtime (see above).
- Whether the backend timed out before the reply has no effect on any of this.

## 3. Why not the alternatives

| Option | Rejected because |
|---|---|
| Reply first, tear down after the reply (slot still held) | It moves the lifecycle callback after the 409. The D4 ruling (§"Not in this change") deliberately left that ordering alone. It also reverses accepted deviation 3, needs a runner rebuild and new runner tests, and stops the gate. The backend would gain nothing, because it handles both outcomes the same way (§2). |
| Reserve wait 3 s → 2 s in `closeResources` | Fixes only (a). (b) is bounded by Playwright's backstop (deadline + 3 s), not by this wait. |
| Budget 12 s → 11 s | It refuses real starts. W10 F10 measured only about 4 % headroom over the slowest start at 12 s. That trades a cosmetic `messageCode` difference for false `CONTEXT_LOST` results. |
| Backstop deadline + 3 s → + 2 s | It reopens the D4 rule that Playwright's timeout must fire after the runner's deadline, now with only 2 s for the kill. It also needs a fixtures re-run, for a diagnostic-only gain. |

## 4. Obligations (documentation and triage only, no gate stop)

1. **Ruling wording.** `ruling.md` §"Wire", the line "If teardown or the lifecycle callback pushes the reply past 15 s…", is amended to read: "Two cases always reply after the backend deadline, so the backend sees plain transport `UNKNOWN_OUTCOME`: (a) a launcher that ignores the abort and never settles, replying at t0 + 15 000 ms; (b) a launch with nothing spawned at the first listing, replying after t0 + 15 s plus the second listing, the survivor check, scratch removal and the lifecycle callback. The backend handles both like `RUNNER_CONTEXT_CLOSED_REFUSAL` (ruling-15s-edge.md §2)."
2. **Triage (QA, Gage).** In a gate, a bootstrap `UNKNOWN_OUTCOME` whose `messageCode` is `UNKNOWN_OUTCOME`, paired with a runner `GUIDED_START_FAILED` line whose `elapsedMs` is ≥ 15 000, is D4 case (a) or (b). It is not REL-001 recurring, and it is not a backend transport defect. Read the first such line. A retry produces a second `CONTEXT_LOST` diagnostic with a small `elapsedMs` [I: `describeStartFailure` runs for every `context` `CONTEXT_LOST`, `transport.ts:121-123`].
3. **No new tests are required.** W10 already pins the runner instants exactly: 12 000, 13 000 and 15 000 ms, from both sides. The backend mapping of a transport timeout and of a closed refusal is covered by `GuidedRunnerContextRefusalTest`. [I] I did not open that test to check that it has a timeout case. If @qa wants the equivalence proved, the test is: a bootstrap continuation that gets a transport timeout, then a runner `CONTEXT_LOST`, then gets exhausted, ends `RUNTIME_INCOMPATIBLE` after exactly 3 deliveries. That backend test belongs in a later writer window, not in this gate.
4. **Residual noted, not ruled here.** A runner `stop` that arrives early in a start whose Chrome has not spawned waits until `backstopAt` (W10 F2 residual). The backend's `stop` RPC can then also hit its 15 s timeout. I did not check how the backend handles an uncertain `stop`. This belongs with D5 (KL-015-D5, the bound on started-session close) for @po to place. It does not block 015.

## Security

There is no new surface. The slot is never released over an unconfirmed process (§2). No argv or body is logged.
