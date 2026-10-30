---
name: compliance-latency-analysis
description: 2026-10-25 static analysis for the planned compliance layer in front of every LLM call — 50 s stall cap, 600 s contract wall, fixed-delay scheduler coupling, capacity 1, ranked levers
metadata:
  type: project
---

2026-10-25: the user plans to route every Studio LLM call through a "compliance model" layer (overhead unknown). Architect static analysis (returned inline to the lead; QA ran a delay-proxy measurement in parallel).

Key conclusions:
- Any call > 50 s (send cap) is a TRANSPORT_STALL; 3 stalls ≈156 s then FAILED errorCode INVALID_CONTRACT. Constant overhead ≥ ~+45 s kills most learns on defaults; +60 s kills all.
- 600 s session wall is a contract max (limits.schema.json) and runner cap (ownership.ts:121), so config can't raise it. A 10-step test breaks at about +30 s per call even with retuned timeouts.
- spring.threads.virtual.enabled=true gives SimpleAsyncTaskScheduler, where all fixedDelay tasks share one thread. The GuidedTranslationCoordinator's blocking HTTP call (65 s timeout, hard-coded) stalls check scheduling, the Studio dispatcher (replays and proof), recovery and the reaper on the worker pod.
- Guided capacity = 1 system-wide; there are 24 attempts per session (98304/4096, no refunds); thinking LOW is already the floor on 3.8 Flash.
- Ranked: R1 decouple the coordinator from the scheduler thread; R2 retune the send cap, callSeconds, the coordinator timeout and the output total to 131072; R3 deterministic NEXT_ACTION with model fallback; R4 schema-encoded repair avoidance; R5 pre-plan SOURCE_PLAN; R6 event-driven continuation; R7 speculative suffix plan.

**Why:** the compliance rollout makes every call slower; the call chain is strictly sequential (1 + ~1.2·N calls).
**How to apply:** before approving the compliance rollout, require R1+R2. R3 conflicts with the GTS:2657 rule ("availability never an executable target selection"), so it needs an ADR-SC-005 amendment and an offline agreement study first. Related: [[candidate-b-send-cap-ruling]], [[model-sizing-ruling-draft]], [[single-path-decision]].
