---
name: replayit-incremental-lane-cascades
description: GuidedPublicationReplayIT guidedIncrementalTest cascades - CSI daily budget, generation restart guard (open-generation diag), expiry teardown PENDING; scratch stopSender tap; don't edit sources mid-collector run
metadata:
  type: project
---

Learned in STUDIO-OBS-015 R2 fix window (Dex-FIX, 2026-10-16; evidence `execution-20261015/backend/r2-diagnosis01/`):

1. **Two cascade mechanisms hide most incremental labels.**
   - **Per-CSI daily token budget** (OBS-014 AC-8, 640000 output tokens/day). Symptom: `BUDGET_EXCEEDED` at ~0.9 s per case. `incrementalJoined` now isolates `CSI-INC-<n>` (like P3/PFXSYNC/B1A).
   - **Worker generation restart guard** (`verifyPreviousWorkerGenerationClosed`). Symptom: 20 s per case, "Prior generation ... no restart authorized". Read `TEMP/open-generation-<n>.json`, written by the value-free diagnostic added in that window, to see which session or execution stayed open.
2. **confirm-expire** waits the full 600 s session lifetime. The backend stop of the EXPIRED session then times out at 15 s (`GuidedRunnerClient.send:267`), so teardown stays PENDING forever and 17 later labels cascade. This was filed as production finding H8 for Aria; it is not fixable test-side.
3. **Scratch stopSender tap:** use an init script that swaps in a scratch ReplayIT copy. Read `GuidedSessionService.stopSender` reflectively via `AopTestUtils.getUltimateTargetObject`, wrap it, and call `installStopSender`. Shrink `@ValueSource` to the variants you need. Script: `scratchpad/dexfix015-r2/tap/`.
4. **Never edit any backend source while a collector run is in flight**, even after compileTestJava: the after-digest makes `sourceStable` false. I did it once and restored byte-exact before the end, with disclosure.
5. **pgjdbc treats the jsonb `?` operator as a bind placeholder** in a `JdbcTemplate` statement that has parameters. Escape it as `??`.

**Why:** these took a full window to separate. Each full join run is about 43 min (default lane ~16 min + incremental ~25 min).

**How to apply:** before diagnosing a block of identical fast failures, check the budget and guard cascades first. Related: [[tooling-replayit-diagnostics]], [[replayit-worker-preload-state]], [[frozen-fixture-values]].
