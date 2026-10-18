---
name: replayit-c5-finalize-lease-and-s2-order
description: ReplayIT Order 9 finalize 409 = C5 TRACE makes ValidationBasis validation hold the session lock past the worker lease; S2_DESCRIPTOR = a later preload re-wrapping RevRuntime.prototype
metadata:
  type: project
---

Found 2026-10-16 (r1-diagnosis01 section 6):

1. **C5 TRACE vs finalize.** `finalize → PUBLICATION_CONFLICT` at `GuidedPublicationRepository.authority:527` with the session FAILED/OTHER and a `RUNTIME LEASE_LOST` lifecycle means the lease was lost during `/finalize`.
   - C5 `armTrace` (ROOT TRACE) makes networknt debug logging run through SecretMasker and the canary scanner.
   - 015's `ValidationBasis` validate in `GuidedPlanBuilder.basis` then holds the session row lock for about 80 s.
   - The renewal claim blocks on `SecretRevocationSweep.recheck` `FOR UPDATE`. The tell is a claim taking about 26 s in `c5-claim-server-diagnostic.jsonl`.
   - Counterfactual: networknt at INFO lets it pass. That would reduce C5 coverage, so it needs a design decision. It was OPEN at the time of writing.
2. **S2_DESCRIPTOR.** A preload block installed after `p4GuidedRevocationObservers()` that re-wraps `RevRuntime.prototype.start/dispatch` breaks S2 restore. The result is a receipt with `failed:true`, the line ~7003 latch, and a class cascade. Install such observers BEFORE p4 (fixed by reordering `incrementalNativeFaultObserver`).

**Why:** both look like publication or teardown flakes. jstack misses them because Tomcat handlers are virtual threads.

**How to apply:**
- Use `jcmd <pid> Thread.dump_to_file -format=json` every second (it includes virtual threads).
- To see swallowed preload JS errors, tag the catch blocks in a scratch IT copy. Use `\\n` in Java text blocks, not `\n`.

Related: [[tooling-replayit-diagnostics]], [[project-replayit-s2-single-use]], [[inherited-daemon-chrome-abort]].
