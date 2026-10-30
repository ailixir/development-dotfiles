---
name: project_learn_replay_parity_qa_20261029
description: 2026-10-29 read-only QA of learn vs replay parity; no differential test exists, guided launch has no viewport vs replay 1920x1080, proof replay detects but does not gate
metadata:
  type: project
---

Report: scratchpad qa-learn-vs-replay.md (session 5292b60f). Verdict: parity not guaranteed.

- Shared executor (`invoke` + `performOnTarget`, profile 'learn' vs 'replay'), but target acquisition, settle, binding (`learn` branches in observationFlow.ts invoke), table-context certificate and environment differ.
- Guided launch (studio-runner/src/run/browser.ts ~420) passes no viewport; replay uses test config (default 1920x1080). INFERRED Playwright default 1280x720 for learn. Cheap check: log page.viewportSize() in both.
- Learn observes with settle=true (400 ms quiet); replay element steps do no settle. Replay absent-wait = about 8 s poll budget then rewritten to TARGET_DRIFT.
- AFTER_LEARN proof is an ordinary run accepted in the publication tx; publication/revision stays confirmed whatever it does (V27, StudioAcceptanceService.acceptPublished).
- Closest joint test scaffold: ST/fixtures-tier/mixed-mode-prefix.test.ts (real GuidedRuntime + executeObservedReplay).

**Why:** user sees many tests pass learning but fail replay. **How to apply:** when reviewing studio-runner parity fixes, ask whether the fix adds a case to a learn-then-replay differential, not another one-off fixture; re-verify these claims against the current tree (large uncommitted diff).
