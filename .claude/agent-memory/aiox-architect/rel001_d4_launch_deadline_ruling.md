---
name: rel001-d4-launch-deadline-ruling
description: 2026-10-17 REL-001 D4 ruling — guided start budget 12 s (backend 15 s − 3 s reserve), boundedStartup reuse, code TIMEOUT, argv-matched tree kill, in 015 but not the attempt03 fix
metadata:
  type: project
---

D4 ruled 2026-10-17 (evidence: docs/qa/evidence/STUDIO-OBS-015/execution-20261015/aria-d4-launch-deadline-ruling01/ruling.md).

- Guided start budget = runner constant 12 000 ms = backend `GuidedRunnerClient.transportDeadline` 15 s (hard-coded) − 3 s reserve; armed once at `GuidedRuntime.start()`, clamped to runtime.deadline(); covers whole start(), not just launch. No config knob (BROWSER_LAUNCH_TIMEOUT_MS is replay-only, 60 s).
- Reuse `boundedStartup` (observedBootstrap.ts) + AbortSignal; launch gets optional `startup:{deadlineEpochMs,signal}`; Playwright `timeout` = backstop to t0+15 s.
- Vocab: no new values; phase = step in progress, loss null, inner cause `code TIMEOUT` (stop → `CANCELLED`), NOT `kind TIMEOUT` (reserved for Playwright action timeouts). Wire unchanged (409 CONTEXT_LOST → backend CONTEXT_CLOSED_REFUSAL).
- Teardown: no graceful close; kill direct worker children whose argv has this launch's scratch/recording dir via `signalProcessTree`; survivors → close rejects → slot held (fail closed); guidedMain must assert canEnumerateProcessTree.
- Started-session close bound deferred to D5.
- Ratified 2026-10-17 (ratification.md, same dir): Dex deviations all ACCEPTED — hung-launcher stop() REJECTS CONTEXT_LOST (not resolves), context() swallows stopEntry failure, start() waits microtasks not reserve. Follow-ups: F1 budget deadline can log CANCELLED (runtime vs launcher timer race; fix = abort(reason)); R2 enumeration guard doesn't probe `ps -ww args=` form.

- 15 s edge (ruling-15s-edge.md, 2026-10-17, post-W10): ACCEPT, no code. Ignoring-launcher (t0+15 000) and unspawned-launch F2 wait (to backstop t0+15 s + listing/callback) ALWAYS reply after backend deadline (backend anchor precedes runner t0) → plain transport UNKNOWN_OUTCOME. Backend treats it identically to RUNNER_CONTEXT_CLOSED_REFUSAL on all non-keyed sends (only definiteContextRefusal acts); bootstrap ≤3 deliveries → RUNTIME_INCOMPATIBLE. Rejected: reply-before-teardown (moves lifecycle callback), 11 s budget (4 % headroom). Early `stop` during unspawned launch may also hit 15 s → D5.

**Why:** closeResources awaited the hung `launching`, so the single slot was held up to 180 s/unbounded (3 repro hangs).
**How to apply:** D4 is a separate finding, never claimed as attempt03's CONTEXT_LOST fix. Related: [[r8-preready-selfstop-ruling]], [[obs015-claude-resume-constraints]].
