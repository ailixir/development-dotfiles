---
name: project-proof-is-replay
description: 2026-10-25 user requirement — Studio video proof must always come from a replay of the published revision; learn recording (OBS-013) proposed for deletion
metadata:
  type: project
---

User requirement 2026-10-25 (verbatim): "The video proof should be always consistent and run from the final compiled/validated script." Trigger: a re-learn showed a ~3 min learn-session recording (model think time) while replays give ~2 s videos.

FINAL user decisions 2026-10-25 (proof-plan/CONSENSUS-PLAN.md): proof accepted INSIDE the publication commit (fail-closed, IT H-1, refusal code in link table studio_learn_proofs, no race catch); READY on failed proof; learn recording KEPT only for learns that did not publish (labelled 'learning attempt'), discarded on publish via new stop reason PUBLISHED (runner discards before upload; backend callback refusal + read-side hiding keyed on publication existence, not state). Architect approved recording-delta with R1-R5.

**Why:** consistency of proof regardless of learn vs replay; single-path rule ([[single-path-decision]]).

**How to apply:** treat the learn recording (ADR-SC-005 OBS-013 row) as superseded once the user confirms; check the outcome of OD-1..OD-6 before designing anything touching guided evidence or execution trigger sources.
