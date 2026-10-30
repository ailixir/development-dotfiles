---
name: learn-replay-parity-review
description: 2026-10-29 learn-vs-replay review — artifact+executor already shared (Guard = proof.target, performOnTarget); gap is driver pacing + one-shot predicates; 1/912 resolver claim is HEAD-only
metadata:
  type: project
---

2026-10-29 review of "learn passes, replay fails" (user asked if the design is the best). Finding: in the WI-4 working tree, learn and replay already share the artifact (ObservedArtifactLowerer copies prepared proof.target verbatim) and the executor (observationFlow invoke → targetAction performOnTarget). The old custom resolver (observationCollector.ts, "not a general Playwright selector engine", 1/912 Wikipedia figure) is deleted in the working tree; it exists only at HEAD.

The remaining gap is structural in the *driver*: learn acts after settle + model latency with a prepared-node binding; replay element steps act immediately, poll only ABSENT, and treat count>=2 / identity / pre-fence timeout / one-shot asserts / page mutation (pageMatches revision) / render-state certificates as terminal. Recommended: one step driver for both, waited transients, retrying assertions, same pacing rule, replay-time guard audit (model-input privacy vs effect safety), "learned" only after proof replay passes (NEEDS_RELEARN on failure).

**Why:** user wants a consistent process; every recent replay fix (page stale retries, held-engine current page) patched one instance of this class.
**How to apply:** when replay-failure fixes come up, check whether they are another instance of "terminal transient at replay" before patching; report at /private/tmp scratch architect-learn-vs-replay.md is session-only. Related: [[project-proof-is-replay]], [[single-path-decision]].
