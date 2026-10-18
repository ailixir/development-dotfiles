---
name: project-replayit-s2-single-use
description: GuidedPublicationReplayIT's worker-side S2 observer is single-use per worker process — a second C5Capture.beginS2 secret-bearing case breaks the secret-login teardown and cascades the class
metadata:
  type: project
---

In GuidedPublicationReplayIT, the worker-side S2 operation observer (p4GuidedRevocationObservers JS) works for only one S2 case per guided-worker lifetime. Its drain requires `s2States.size===1`, and `s2Restore` restores the wrapped RevRuntime.prototype methods. So a second test that calls `C5Capture.beginS2` and sets `secretLoginScenario`/`S2TraceBinding` makes whichever S2 case runs second fail `awaitS2Completion` ("actual selected guided operation/callback completion"). That sets `cleanupUnconfirmed`, and the fail-stop then fails about 30 later tests. This happened in STUDIO-OBS-013 TEST-001 on 2026-10-14: a recorder-fault sibling copied the secret-login setup and turned the class 31/40 red.

**Why:** test bodies all pass and only the teardown fails, so the failure looks like a timing or runner regression.

**How to apply:** host new joined ReplayIT cases on the plain fixture (`createSource(TEXT)`, default model) unless they truly need a secret. Also, Gradle may mark `test` UP-TO-DATE on an identical rerun; pass `test --rerun` for "two consecutive greens". Related: [[tooling-replayit-diagnostics]], [[project-replayit-worker-preload-state]].
