---
name: proof-cancel-recheck-20261025
description: QA 2026-10-25 re-check of why GuidedPublicationReplayIT cancels the AFTER_LEARN proof in ~9 helpers; answer (a) legitimate, no product defect; method and harness recipe
metadata:
  type: project
---

Verdict (a): cancelling the queued proof hides no product defect. Evidence: scratch copy where `cancelQueuedProof` was replaced by "dispatch proof, await terminal, then manual `/execute` of the same test as control". 60+ proof/control pairs across every cancel site reached: all PASSED with video AVAILABLE, except `b2Publish` in `incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck`, where proof AND manual control both fail LOGIN_REQUIRED.

**Why that one is fixture-only:** test seeds Vault with the rotated value (line ~9724) while the p3 site still expects the old one until `p3ExpectedPassword = rotated` (~9957, "the site follows the Vault before the ordinary replay"). Counterfactual (move that assignment before `b2Publish` in the copy) makes proof and control both PASS.

**Code facts:** `prepareForPublication` == `prepareScheduled` == `prepareWithoutCore` (same `ObservedReplayBindingBuilder`, checkBeforePins=true; manual uses false = only error ordering). `acceptCore` does the same reference preflight/quota/bind for all triggers. Nothing in main reads trigger_source at dispatch except the snapshot mapper.

**Real reason for the cancels elsewhere:** count-sensitivity (RECEIPTS hasSize, COUNTED_VAULT reads, P3_RECEIPTS). With proof+control run, 3 prefixSync/b1 tests fail on `RECEIPTS hasSize(effects)` (+2), A fails on vault-read count. Several (b2b, b1a, b1 recovery, FaultOracle, ControlWindowLoss, HasValue, plain canaries) still PASS with the proof run, so the cancel there is conservative. The dev's "INTERNAL_ERROR" was never reproduced.

**Harness recipe (reusable):** `scratchpad/qa-be/ri.sh <label> <test|guidedIncrementalTest> <method...>`; incremental methods are excluded from `test` (use guidedIncrementalTest, forkEvery=1); in the shared-JVM `test` lane one failing method makes later ones fail "prior failed-test teardown not confirmed", so run failing candidates one per invocation.

**Why:** answers "does cancel hide a bug" question for proof=replay lane; see [[project_proof_replay_backend_qa_20261025]].
**How to apply:** if asked again, do not re-derive; if the p3 fixtures change, re-run the proof+control probe.
