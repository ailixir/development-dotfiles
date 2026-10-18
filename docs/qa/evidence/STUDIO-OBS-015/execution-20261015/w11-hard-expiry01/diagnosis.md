# W11 hard-expiry01: why `guided-secret-ownership` `hard-expiry` stopped with LEASE_LOST

Dex (@dev), 2026-10-17. Node v24.20.0. No commit, no repo source edit. Every run below happened in copies under the session scratchpad (`.../scratchpad/dex-w11-hard-expiry/`); the repo `studio-runner/` was only read. `[V]` = I ran it and read the output. `[I]` = inferred.

## Verdict

**A product defect that predates W9 and W10. Not a regression, and not (only) a test race.**

When a session's lease and its hard expiry are the same instant, the stop reason is decided by re-reading `Date.now()` inside the timer callback and comparing it with the expiry. Node timers can fire a fraction of a millisecond before `Date.now()` reaches that instant, so the reason is EXPIRED or LEASE_LOST depending on the sub-millisecond phase of the timer. The two instants always coincide at the end of a session, because the lease is capped at the expiry (`checkGrant`: `lease <= intent.expiresAt`; the claim stub does the same). The decision sites are `studio-runner/src/guided/runtime.ts:122` and `studio-runner/src/guided/ownership.ts:54`.

A second, deterministic path to the same wrong label exists (renewal inside the last 100 ms). It is not what failed in final-gates06.

## 1. The timers, in order, with timestamps

Test line 34 sets `E = T_set + 5000` (ISO string, whole ms). From the final-gates06 failing oracle and my passing runs (perf-clock ms, relative to process start):

| Offset | Event |
|---|---|
| T_set | `E` fixed. `leaseExpiresAt` of every claim = `min(now+30 s, E)` = E |
| +31 ms | `assign` -> `acquire` -> initial claim (`timeoutMs` 4883 = E - now - 100). `ownership.schedule`: expiry timer due E, renewal timer |
| +43 ms | `context` -> `GuidedRuntime.start` -> `runtime.schedule`: runtime timer due E. `ownership.schedule`: secret session, so renewals on a 1000 ms grid from here |
| +1.0, +2.0, +3.0, +4.0 s | Renewals (claim ~5 ms). Each success: `runtime.applyAcknowledgedLease` -> `runtime.schedule()` re-arms the runtime timer (due E), **then** `ownership.schedule()` re-arms the expiry timer (due E). The runtime timer is armed first, so it fires first |
| E - 976 ms (gates06) | Last renewal (`timeoutMs` 876). The next grid point would be about E + 25 ms, after the expiry |
| E | The runtime timer fires: `stop(Date.now() >= min(E, started+600 s) ? 'EXPIRED' : 'LEASE_LOST')`. Its `stop` cancels the ownership timer (`onStopping` -> `invalidate`) |

[V] In final-gates06 (`logs/gates06-failing-run-timeline.json`): five claims, last one started at 13926.9 with remaining-to-expiry 976 ms. The stop was at 14902.63, which is -0.31 to +0.69 ms from E derived from the last claim. **No renewal fell near the expiry.** The suspicion in the review (renewal in the last ~100 ms wins) is not what happened in that run.

## 2. Proof that the reason is a coin flip at the tie

[V] 150 instrumented runs (`logs/probe-timer-callback.tsv`): the runtime timer was the first to fire in 150/150. `Date.now() - E` read inside that callback: `-1`: 2, `0`: 25, `1`: 58, `2`: 64, `3`: 1. The reason was LEASE_LOST in exactly the 2 runs that read -1, EXPIRED in the other 148. Earlier instrumented set (`logs/probe-first-stop.tsv`, 120 runs): 3 LEASE_LOST, all from `runtime.ts:122`.

[V] Forcing the phase (`W11_TIMER_EARLY_MS`, every product timer >= 500 ms fires 5 ms before its due time): **unfixed code 30/30 LEASE_LOST**, fixed code 0/30 product failures.

[V] Why a timer can fire early (`logs/timer-vs-wall-microbench.jsonl`, 1500 trials per mode, armed as `E - Date.now()`): `Date.now() < E` at fire in 0.00% (fresh tick), 0.47% (after 1 ms of sync work), 0.00% (3 ms), 0.13% (I/O callback). Median lateness is +2 ms. `Date.now()` floors, and libuv arms from the loop time cached at the start of the iteration, so a timer armed late in a busy iteration fires early by that staleness. The product arms these timers after claim I/O and schema validation, which is why its rate (about 2%) is higher than the bare benchmark [I]. The wall clock itself did not drift: `Date.now()` minus the monotonic clock moved 1.06 ms over 30 s (`logs/clock-drift.json`).

## 3. Did W9 or W10 change the ordering or timing? No.

- [V] A hash of the timer, deadline and renewal lines (selected by pattern, `schedule`, `setTimeout`, `applyAcknowledgedLease`, `renew`, `requestClaim` timeout) is identical in final-gates04, -05 and -06 for both `runtime.ts` and `ownership.ts`. HEAD differs (it predates the 1000 ms secret renewal grid; I did not diff the rest), but the decision expression `Date.now() >= Math.min(...) ? 'EXPIRED' : 'LEASE_LOST'` is byte-for-byte at HEAD (`git show HEAD:studio-runner/src/guided/runtime.ts`, line 50).
- [V] W10 `runtime.ts` changes (final-gates05 bytes versus now): 4 hunks (`launch` type signature and three `startAbort.abort(reason)`), none in a timer. `ownership.ts`: not in the W10 13-file diff; since final-gates04 it has 4 small hunks (import, `cause` chaining twice in `acquire`, the `context()` catch), none in `schedule`/`renew`/`requestClaim`. `guidedMain.ts` and `browser.ts` are not on this test's import path (it builds `createGuidedServer` itself). Contrary to the brief, the "start budget clamped to lease and expiry" (`boundedStartup`, `Math.min(began + GUIDED_START_BUDGET_MS, this.deadline())`) is already in the final-gates05 bytes, i.e. W9, not W10; it bounds only the launch. The lease timer calling `stop('LEASE_LOST')` is at HEAD.
- [V] The test file and `helpers/guided.ts` are unchanged since HEAD for this mode.

## 4. Failure rates per variant (`logs/rate/*`, `logs/variants-provenance.txt`)

Hard-expiry only (`-t hard-expiry`), real fixtures config, 60 runs each, three variants run concurrently (load 3 to 6):

| Variant | Failures | Detail |
|---|---|---|
| Current tree (= repo, byte-identical) | **1/60** | LEASE_LOST, stop 0.6 to 1.0 ms before E |
| W10 reverted (fg05 bytes for runtime/browser/guidedBrowser/tree) | **0/60** | min margin -0.4 ms (passed, rounded up) |
| W9+W10 reverted (fg04 bytes for 8 src files) | **1/60 LEASE_LOST** + 1 other | same signature (-0.98 ms). The other: one 45 s test timeout (pending fill never answered), EXPIRED reason, **not diagnosed**; no test longer than 20 s in the 832 hard-expiry runs on fg05-or-later trees |

Whole test file (all four modes), current tree, 50 runs (`logs/whole-file-per-mode.json`): hard-expiry **3/50** failed (all `expected 'LEASE_LOST' to be 'EXPIRED'`), revoked 0/50, slow-grant 0/50, lost-body-late-grant 0/50. Durations: hard-expiry 5059 to 5088 ms (passing runs about 5.07 s).

Instrumented, same source: 3/120 and 2/150. Pooled current tree: 6/330 = 1.8% (Wilson 95%: 0.8 to 3.9%) on the hard-expiry-only runs, 9/380 = 2.4% including the whole-file runs. The W10-reverted 0/60 has probability 0.33 under the pooled rate; the three variants are not distinguishable, and the stop-minus-E medians match (1.32, 1.34, 1.25 ms).

One uncertainty [I]: in the gates06 oracle the first and last claims disagree on E by 5.7 ms (perf delta 4012.7 ms vs 4007 ms from `Date.now()`); in my 500 runs the maximum was 3.1 ms (p99 1.5 ms). Something stalled or jittered on that host for a few ms. A stale loop clock is what makes timers early, so it fits, but I did not find its cause.

## 5. The second race: renewal inside the last 100 ms

`requestClaim` throws LEASE_LOST when `lease - now - 100 <= 0`, and aborts the claim at `lease - 100`. With lease == expiry, a renewal that starts in the last 100 ms (plus claim latency) stops the session with LEASE_LOST up to 100 ms before the expiry timer.

[V] Phase sweep on the current tree (`logs/phase-sweep.tsv`, `W11_DELAY` before `POST /context`, 2 reps): delays 880, 900, 920, 940, 955 ms put the last renewal 4 to 77 ms before E: **10/10 LEASE_LOST**, stop 4 to 76 ms early, via `ownership.ts` renew catch. Delays 0, 700, 850, 970, 1000: pass. 800: one pass, one LEASE_LOST from the first race. In the real test this needs a 0.85 to 0.96 s stall between line 34 and the context POST (normal: 43 ms), so it is rare there.

[V] It is **not rare in production for non-secret sessions**: renewals come at `remaining/3`, which always lands one attempt in the last 100 ms. The new unit test `renews until its hard expiry` fails on unfixed code with `expected 'LEASE_LOST' to be 'EXPIRED'` (fake timers, no skew). What the backend does with LEASE_LOST versus EXPIRED I did not check.

## 6. Fix (`fix.patch`, applies cleanly to the working tree: `git apply --check` OK)

Product (2 files, about 30 changed lines):
1. `runtime.ts`: new `endReason()`; `schedule()` fixes the reason when it arms the timer: EXPIRED when `min(expiresAt, started+maxSession) <= liveLease` (a tie is the expiry), otherwise LEASE_LOST. No clock read at fire.
2. `ownership.ts`: `schedule()` does the same (`expires <= lease`). Constant `CLAIM_MARGIN_MS = 100` replaces the literal.
3. `ownership.ts`: `renew()` returns without a claim when the lease is already at the expiry and the expiry is within the margin (`cannotExtend`). The expiry timer, already armed for that instant, ends the session as EXPIRED. A lease strictly before the expiry still goes through the unchanged paths.

Tests (2 files):
4. New `test/guided/stopReason.test.ts` (6 tests, fake timers; timers made to fire 1 ms early). 4 fail on unfixed code (assignment timer, runtime timer, secret-renewal-in-margin, non-secret to hard expiry); 2 controls (LEASE_LOST when the lease ends first) pass on both. Mutation check: reverting the runtime timer half fails 1 test, the ownership timer half 1, the margin skip 3, "always EXPIRED" in the runtime 2. Always-EXPIRED in `ownership.schedule` is not observable through public behaviour (a renewal always stops a short lease first), so that branch is guarded only by the tie tests.
5. `guided-secret-ownership.test.ts` (optional hunk, can be dropped): the assertion `expect(Date.now()).toBeGreaterThanOrEqual(expiresAt)` runs at the next 25 ms poll after the stop, so a stop up to a few ms before E fails it by poll phase (5/30 failures with the product already fixed and timers 5 ms early). It now asserts the stop instant (`authorityStoppedWallMs`) is `>= E - 10 ms`. This is stricter for premature stops (a stop 11 ms or more early now fails every time, where before it failed only if a poll landed before E) and looser only in the 0 to 10 ms band the timer cannot honour. The `EXPIRED` assertion is untouched. The 10 ms is a judgement: in the natural runs the earliest stop was 1.0 ms before E by the last-claim estimate (2.3 ms by the first-claim estimate in one run); at 8 ms forced skew the stops were up to 8.5 ms early and still passed. The 5/30 failures were all `expected <Date.now()> to be greater than or equal to <E>` with the clock 2 to 3 ms short.

## 7. Validation (scratch copy with the patch applied; `logs/validate/`)

- [V] Hard-expiry only, product fix with the unmodified test: **100/100** pass (2 x 50). With the final patch: **100/100** pass (2 x 50; stop minus E median +0.6 ms, min -0.9 ms).
- [V] Whole file, final patch, 2 x 25 = **50 runs, 0 failures in all four modes**.
- [V] Forced early timers, final patch: skew 5 ms 30/30, skew 8 ms 30/30. Unfixed code at skew 5 ms: 30/30 failures.
- [V] Unit tier: exit 0, **2286 passed / 0 failed / 29 skipped** (final-gates06: 2280 + the 6 new), coverage thresholds pass. `tsc --noEmit` exit 0. `eslint .` exit 0.
- [V] Full fixtures tier, patched scratch tree: run 1 **259 passed / 1 failed / 9 skipped**; the failure is `browser-profile-safety` "refuses a Default directory redirected after actual launch" (a file that does not import ownership or runtime), host load 9.8 at start; it passes 3/3 alone. Run 2: **260 passed / 0 failed / 9 skipped**, hard-expiry 5061 ms. I did not run the unpatched tier for comparison, so "unrelated" is [I] from the import graph and the isolated passes.
- [V] The repo was not touched: no file under `docs/` or `studio-runner/` changed between my first scratch file and the end of the runs, apart from this folder.

## 8. Not verified

- The gates06 failing run itself was never instrumented; its cause is inferred from its oracle plus the mechanism reproduced 6 times with instrumentation.
- The pre-W9 45 s timeout (1 in 60) is unexplained.
- `guidedMain.ts` at the fg05 bytes is not recoverable, so "W10 reverted" keeps W10's `guidedMain.ts`; it is not imported by this test.
- Rates were measured with two or three runs in parallel (load 3 to 6), which raises timer staleness; an idle host would probably show fewer failures, not more.
- Backend handling of the stop reason was not examined.

## Files

`fix.patch`, `logs/` (rate, probes, sweep, skew, validate, microbenchmarks, gates06 timeline, variant provenance), `scripts/` (loop drivers, analyzers, probe and hardening edits, the test file as validated).
