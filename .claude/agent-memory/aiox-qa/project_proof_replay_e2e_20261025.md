---
name: project-proof-replay-e2e-20261025
description: Real-stack E2E of "proof = replay of published revision" on practicetestautomation, all 8 items PASS; harness facts, timing/RSS numbers, what was not exercised
metadata:
  type: project
---

2026-10-25 round 8 on the practice login site: items 1-8 PASS (3 learns, 1 re-learn, 1 failed learn). Proof video 2.1-3.0 s; finalize to proof video AVAILABLE 5.2-6.2 s; peak RSS sum runner+Chromium ~1.07-1.13 GB (learn browser is gone ~0.6 s after finalize, proof browser starts ~2.2 s, no overlap at 170 ms sampling). Final test d9e3be44-a886-49c7-b437-8e8f48f85b4b (user-facing, left in place).

**Why:** user's complaint was a ~3 min "proof" that was the learn recording.

**How to apply:** harness lives in the session scratchpad `.../0117d3d7-.../scratchpad/e2e/scripts` (lib-proof.mjs, sampler.mjs, 06f-failed-learn.mjs added). Gotchas: stop the sampler only after the proof video is AVAILABLE; `ui_tests` delete is soft (deleted_at); a second DELETE returns 403 not 404; the Recent Runs card sentence changed to mention the proof replay. Not exercised: the "earlier version" line, proof-refused path (proof null), user Stop/CANCELLED learn. See [[project_proof_replay_qa_20261025]] for the earlier runner+FE review.
