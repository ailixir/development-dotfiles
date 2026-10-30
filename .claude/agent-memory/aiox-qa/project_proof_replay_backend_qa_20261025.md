---
name: proof-replay-backend-qa-20261025
description: QA 2026-10-25 of the backend lane of proof = replay (AFTER_LEARN accepted in publication commit); verdict CONCERNS; joined ReplayIT facts, copy recipe, lock-order findings
metadata:
  type: project
---

Backend lane verdict CONCERNS (code PASS; joined IT not updated and not runnable green in this tree).

**Facts that save time next time**
- Scratch copy recipe that worked: `rsync -a --delete --exclude build --exclude .gradle backend/` plus `docs/specs/studio`, `docs/specs/studio-observed-authoring`, `docs/qa/evidence` into `scratchpad/qa-be/tree/`, symlink `studio-runner`; `./gradlew --offline test -x verifyRunnerDist --tests ...`. docs/qa/evidence makes rsync exceed 120 s: run it in background.
- `GuidedPublicationReplayIT` is a ~43k-line joined harness (real runner + Chromium, needs Node 24: put fnm `v24.20.0/installation/bin` first on PATH). Run one method with `--tests ...GuidedPublicationReplayIT.<method>`; about 40 s each.
- With the proof launcher enabled, `actualLearning...TwoOrdinaryRuns...` fails at `dispatchOnce()` expecting 1 but 2 (the AFTER_LEARN proof is a second PENDING row). With the launcher neutralised in the copy it passes that line and then ERRORs with runner `PROFILE_MISMATCH` (ordinary-ipc-child.jsonl in the `obs007-joined-*` temp dir). PROFILE_MISMATCH is not this lane: runner dist rebuilt vs backend pins during GOV-001.4.
- `LegacyV20ConfirmedBaseFixture.assertPreservedAtHead` still pins Flyway max version 26 (head is now 28: V27 proof, V28 allowed_domains, V24-V28 are uncommitted).
- Dev's two scratch failures (ObservedArtifactLowererTest, GuidedSessionIT deployment cap) do not reproduce on a fresh copy (40/40, 44/44, also 44/44 in isolation); both test files were bulk-edited at 17:00:35 by another session.
- Lock order is session row, then ui_tests row, then global advisory quota lock, then per-CSI lock, then ledger insert; Vault preflight runs before the advisory locks but under session + ui_tests rows and one DB connection. No cycle found against CronDispatcher/manual accept (inferred from code).

**Why:** shared worktree, many lanes; a failing joined IT is often another lane's pin drift.
**How to apply:** attribute with a control run (neutralise the lane in the scratch copy), not by mtime alone.
