---
name: lean-refactor-plan-review-20261029
description: 2026-10-29 PO review of the UI Studio learn/replay lean refactor plan (R1–R4) — GO-WITH-CHANGES; gate must be the ADR-SC-007 release gate then D-C; user decisions U1–U8 pending
metadata:
  type: project
---

On 2026-10-29 I reviewed the lean refactor plan for C1, C2 and C3. It is the cut-down alternative to the 31–55-day Codex consensus. Verdict: **GO-WITH-CHANGES**. Work starts only after the user signs U1–U6.

Rulings:
- **Gates.** The plan's 5-flow gate is only a dev smoke. Its acceptance gate is the ADR-SC-007 Release gate: 14 positives, N1–N3, a zero-leak scan, two model-free replays, and ≤120 s per learning step. A "production-ready" claim also needs D-C, which is STUDIO-OBS-016 AC-8 (≥20×3, ≥90%).
- **ADR changes the plan understated:**
  - ADR-SC-007 D4 tier order changes if text fields prefer label/placeholder locators.
  - ADR-SC-005's 2026-10-25 proof-in-commit note and the readiness vocabulary need amending.
- **R3 scope the plan missed.** All of these key on `confirmed_revision_id` and need work: `ObservedReplayAuthorizer`, `IncrementalChangeService`, `ExecutionReadinessService`, a new migration after V32, the frontend readiness consumers, and a model-free "Verify again" action.
- **R2 additions.** Remove `replacedFocusedField` along with `focusedSuccessor`. Run a spike gate first, because Wikipedia only passes thanks to `focusedSuccessor`.
- **Sequencing.** The ADR-SC-007 Lean run (WI-4/5/6 in BUILD) owns the same files. Fold the refactors in as WIs there, or close that run first.

**Why:** the user wants a pragmatic first production release, and earlier PO practice holds recorded gates as binding.

**How to apply:** if this plan comes back for validation or story split, check that changes 1–13 in the review were applied and that U1–U8 have user answers. The work goes through Lean, per the SPK-07 decision, unless the user picks SDC. Related: [[epic10-closure-conventions]].
