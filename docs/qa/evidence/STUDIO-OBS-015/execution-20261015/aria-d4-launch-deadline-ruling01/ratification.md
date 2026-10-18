# Ratification: REL-001 D4 implementation (STUDIO-OBS-015)

Aria (@architect), 2026-10-17. Read-only. I ran no tests or builds, because a gate run is live. [V] means I read the code. [I] means inference.

Scope read: `studio-runner/src/run/{guidedBrowser,tree,browser,guidedMain}.ts`, `src/guided/{runtime,ownership}.ts`, `test/guided/runtime.test.ts` (D4 block), and the story's W9 D4 Dev Agent Record entry.

**Verdict: RATIFIED WITH ONE FOLLOW-UP.** I accept all three deviations. One conformance gap affects diagnostics only (F1). It does not touch the wire, the slot or the kill, and it does not block the live gate.

## Deviations

| # | Ruling | Reason |
|---|---|---|
| 1 | **ACCEPT** | A rejecting `stop()` is how the runtime already reports a close it cannot confirm (`runtime.test.ts:272`: `browser.close` fails, so `stop` rejects and `active` stays true). If `stop()` resolved while the slot is held, `GuidedOwnership.close()`, and through it `installGuidedShutdown` exit code 0, would report a clean drain. Rejecting is the honest form of "fail closed". The ruling's §4 wording "stop() resolves" is amended to "stop() settles within the reserve: it rejects `CONTEXT_LOST` while the slot is held, and resolves once an honouring launcher has closed". |
| 2 | **ACCEPT** | The slot is held by `runtime.active` (`!browserClosed`) through `occupied()`, not by the `stopEntry` promise [V `ownership.ts:39`], so swallowing the rejection there loses no safety. It keeps the `GuidedStartFailure` chain and the single `GUIDED_START_FAILED` line. The rejected `entry.stopping` stays cached, so a later `close()` still reports the failure. |
| 3 | **ACCEPT** | The real launcher throws its `GuidedLaunchFailure` synchronously in its catch and starts `hardTeardown` in the background (`browser.ts:658-663`) [V], so a few microtask turns are enough for an honouring launcher. The reserve is still spent once, in `closeResources` (`endedWithin(launching, 3000)`, `runtime.ts:563`), which `context()` awaits before it replies. Spending it twice would push even an honouring launcher past 15 s. Residue: the 16-turn budget is brittle if anyone adds an `await` before that `throw`. The fixtures case does not pin this, because it calls the launcher without a runtime. A future edit there should keep the throw synchronous. |

## Conformance to the rest of the ruling

| Item | Result |
|---|---|
| 12 000 ms constant | Conforms [V]. `GUIDED_START_TRANSPORT_CEILING_MS 15_000 − GUIDED_START_RESERVE_MS 3_000`. The comment cites `transportDeadline` and `delayed-state-design.md:108`. The pin test is at `runtime.test.ts:36-39`. There is no knob. |
| Anchor, lease and expiry clamp | Conforms [V]. `began = Date.now()` is taken at `start()` entry. Each step's deadline is `min(began + 12 000, this.deadline())`, and the launcher gets that value once at LAUNCH. Every awaited step from JOURNAL to BOOTSTRAP_CALLBACK is bounded, and VALIDATE is synchronous. An abandoned `recorder.open` still settles. |
| Playwright backstop | Conforms [V]. `timeout = deadline − now + 3 000` fires strictly after the runner deadline. If the lease clamps the deadline, the backstop fires before t0 + 15 s, which is acceptable. |
| No new vocabulary | Conforms [V]. `PROFILE` was already in patch A (`fix-a-cause-preservation.patch:337`). `loss` is null. The cause is the plain `Error('TIMEOUT'/'CANCELLED')`, not `kind TIMEOUT`. **One gap, F1, below.** |
| Wire unchanged | Conforms [V]. `start()` maps a bare `TIMEOUT`/`CANCELLED` to `CONTEXT_LOST` and keeps the cause. The answer is `GuidedStartFailure` → transport `409 {"code":"CONTEXT_LOST"}`. There is no openapi, schema, backend or §13 edit. |
| Kill selection | Conforms [V]. `selectLaunchRoots` requires `ppid === process.pid` and a path-bounded marker match (`commandLineNames`: the marker is preceded by start, whitespace, `=` or a quote, and followed by end, whitespace, a quote or `/`). Markers must be absolute with at least two segments, and `parentPid <= 1` is refused. `launchMarkers` adds the written and the `realpath` forms, which covers `/private/var` on macOS. Selected roots go to the existing `signalProcessTree` with SIGKILL. There is a second listing for a late spawn, a 1 s bounded close of a late context, and `survivorsOf` with at most 500 ms. Argv is used in memory only. |
| Slot held on survivors | Conforms [V]. When there are survivors, `hardTeardown` throws, so `failedLaunchClose` rejects. `closeResources` then throws before `browserClosed = true`. A hung launcher (`hung`) takes the same path. `releaseWhenLaunchSettles` releases the slot only after the late `close()` resolves. |
| `guidedMain` guard | Conforms [V]. `insist(canEnumerateProcessTree(), 'CONFIGURATION_DENIED')`. See R2. |

## F1 (follow-up, LOW, diagnostics only): a budget deadline can be logged as `CANCELLED`

Ruling §2 makes a deadline report as `code TIMEOUT` and a stop report as `code CANCELLED`, so that the two can be told apart in one read. In the composed path they cannot always be told apart:

- The runtime's `bounded(() => launching)` and the launcher's own `bounded(() => starting)` arm timers for the same `deadlineEpochMs`.
- If the runtime's timer fires first, it calls `startAbort.abort()`. The launcher's in-flight `boundedStartup` then rejects `CANCELLED`, and the launcher wraps that as `GuidedLaunchFailure(…, Error('CANCELLED'), 'PROCESS')`. That launch failure replaces the runtime's own `TIMEOUT` as the verdict (`runtime.ts:212-222`).
- [I] Which timer fires first is not deterministic. The two expiries are equal to within the 1 ms loop-time cache.
- [V] The lease-clamp test already accepts either cause (`runtime.test.ts:79`: `expect(['TIMEOUT','CANCELLED']).toContain(...)`). The 12 s tests do not show the problem because their fake launchers inject `TIMEOUT` themselves.

Fix (runner-only, no wire change):

- Abort with a reason. On the deadline call `startAbort.abort(error)` with the runtime's `TIMEOUT` error. In `stop()` call `abort(new Error('CANCELLED'))`.
- In `launchGuidedBrowser`'s deadline/abort catch, report `signal.reason` when the caught error is a `CANCELLED` from that signal.
- The first abort reason wins, so the result is deterministic. Do not change the shared `boundedStartup`.
- Tighten the lease test to name which cause it expects. Add one composed test where the runtime timer wins and a launcher modelled on the real one (it rejects `CANCELLED` on abort) still yields an innermost `TIMEOUT` for a budget deadline.

Timing: this does not block the live gate. Land it in the next writer window, before QA cites `GUIDED_START_FAILED … code TIMEOUT` as proof of a D4 deadline.

## R2 (residue, LOW): the guard does not exercise the argv listing

- `canEnumerateProcessTree` probes `ps -A -o pid=,ppid=`, but the kill reads `ps -A -ww -o pid=,ppid=,args=`.
- If a `ps` accepts the first form and rejects `-ww`/`args=` (busybox, for example), every kill lists nothing. `survivorsOf([])` then reports clean, and the slot is released over a frozen Chrome. That fails open.
- [I] The pinned procps-based image supports both forms today, so this is not a current defect.
- Recommended hardening: the guard also requires `readProcessTableWithArgs()` to contain `process.pid`. Same placement as F1.

## Security

- Kills reach only direct children of the worker whose argv names this launch's own `mkdtemp` or recording path, in written or resolved form. Init and the worker itself are excluded.
- Argv is never logged.
- The slot is never released over a process that could not be confirmed dead, except in the R2 case, which needs a `ps` that differs from today's image.
- No new wire surface.
