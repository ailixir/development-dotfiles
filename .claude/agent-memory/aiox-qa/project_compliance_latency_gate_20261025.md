---
name: compliance-latency-gate-20261025
description: QA gate of the compliance-model latency hardening (coordinator virtual threads, MODEL_UNAVAILABLE/REFUSED, permit wait, metrics); verdict, run recipe, findings
metadata:
  type: project
---

Gate 2026-10-25 on the uncommitted tree (shared with STUDIO-FLEX-001 hunks): PASS with non-blocking findings. Verified: combined backend set (48 classes, 656 tests, 0 fail, 3 live-provider skips) in 9m33s using an isolated build dir (`-I build-dir.init.gradle.kts --project-cache-dir`); spotlessCheck/checkstyleMain/checkstyleTest/spotbugsMain green (39 s); contract tool PASS; FE vitest guided+mocks 19 files/788 tests, tsc clean; `guidedIncrementalTest --tests '*GuidedPublicationReplayIT.incrementalPrefixRecoveryUsesNextUnconsumedCoordinate'` PASSED (needs `-x verifyRunnerDist`; the `retainIncrementalGuidedCohort` finalizer then fails with "Missing/ambiguous JOIN lifecycle export" because a single-method run produces no cohort export: harness artifact, not a product failure).

Findings (all non-blocking): `store.runnable(8)` applies LIMIT before the in-flight skip, so >8 concurrent in-flight sessions starve later ones (latent: global cap is 1 today, FLEX raises to 8); `drain()` test seam hides RuntimeException from continuations (only logged) and a second `continueRuns()` after drain is a silent no-op; IOException incl. HttpTimeoutException swallowed with no log; frontend `modelRefused` note claims safety/policy blocks map to MODEL_REFUSED (they stay INVALID_CONTRACT) and the remedy "review the step text" blames the author for 400/401/403/404 (our request or deployment config); DISABLED and TRANSPORT_CREDENTIAL map to retryable MODEL_UNAVAILABLE but are persistent config faults; application.yml comment at send-timeout-seconds still says "call budget at or below the cap makes every overrun a terminal TIMEOUT" without the new +10 startup rule; Timer not recorded if propose() throws (no try/finally); metric outcome "refused" lumps 400 with 401/403.

**Why:** user asked for a gate on three streams (coordinator timing, failure codes/gateway/metrics, frontend) before the compliance model arrives.
**How to apply:** if re-gating, re-run the same set; derived timeout formula 3x(call+2s SETTLE_MARGIN)+3x backoff (+x2 verifySteps)+30 s = 222 s was verified equal to the server path (backoff 2s+4s = 3x base exactly); lease is try-with-resources so permits release on every path.
