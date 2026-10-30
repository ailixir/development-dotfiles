---
name: perf-benchmark-20261025
description: Real-model UI Studio learn/replay latency benchmark on an isolated stack; setup traps (build dir moves, catalog hash, runner dist copy) and headline numbers
metadata:
  type: project
---

Benchmark of guided learn/replay with a Node proxy in front of Vertex (not the OBS-016 gate). Report: /private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/ae64f648-5f71-4252-a09f-ba8184d1e60f/scratchpad/perf/bench/REPORT.md (2026-10-25).

Headlines: learn = 1 SOURCE_PLAN + 1 NEXT_ACTION per step; model about 52 % of wall, non-model about 3.2 s per call; replay 0 model calls, 6.6 s; send cap 50 s TRANSPORT_STALL breaks at about +45 s per call; +60 s loops 2 attempts per request until the 600 s clock (INVALID_CONTRACT); coordinator continueRuns blocks the single scheduling-1 thread (replay waits about 28 s or errors); runner capacity 1 serializes learns; MEDIUM thinking 2.4x slower than LOW.

**Re-run after fixes (2026-10-25 evening, work dir .../scratchpad/perf/bench2):** scheduler starvation gone (replay wait 2-3 s vs 28 s, Cron ticks 10.1 s, scheduling-1 idle in 8/8 vcalls dumps, work on `guided-continuation-N` vthreads); +60 s ends FAILED/MODEL_UNAVAILABLE at 157 s with 1 request x 3 TRANSPORT_STALL attempts; +15 s search4 wall 99-100 s (was 109-120); 2 learns at once with capacity 2 both succeed 109-111 s. Timer `studio.guided.model.call` reconciles with proxy within 0.1 %. Vertex tail latency (20-45 s upstream) hit 3 of 14 calls at +30 s, so wall time at +30 is noisy.
Setup traps found in that re-run: (a) overlay `observed-replay.catalog-json` must be a JSON ARRAY `[entry]` (object gives finalize 409 RUNTIME_INCOMPATIBLE; found via `jcmd JFR.start settings=default jdk.JavaExceptionThrow#enabled=true`, `settings=none` records nothing); (b) runner now REQUIRES `STUDIO_RUNNER_GUIDED_CAPACITY` when guided is on; (c) fixture URLs must use `localhost` (domain whitelist rejects IP literals); (d) sed-retargeting scripts missed lines ending in the bare dir name, and the first start-stack run then started processes from the OLD work dir.

**Why:** architect needed measured numbers for a future per-call compliance-model delay.
**How to apply:** if repeating, (1) snapshot backend/build AND studio-runner/dist+scripts into the work dir because other agents rebuild them mid-run (a stale snapshot gave 422 INVALID_CONTRACT on session reads), (2) regenerate print-observed-catalog.mjs output into both runner catalog file and backend overlay after any dist change, (3) OBS-009 corpus assertions on headings or role=status text fail BUDGET_EXCEEDED on this build, use "Check that the page shows the text" on plain p nodes, (4) learn must POST finalize when state is FINALIZING, (5) virtual threads need jcmd Thread.dump_to_file, plain jstack hides them.
