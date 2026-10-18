---
name: model-sizing-ruling-draft
description: OBS-009 MODEL-SIZING draft 2026-10-18 — A-ii raise session totals (out 98304/max 131072, in 786432/max 1572864), keep 4096 per call; awaiting @pm ack
metadata:
  type: project
---

2026-10-18 draft ruling (docs/qa/evidence/STUDIO-OBS-009/execution-20261018/model-sizing/ruling-draft.md): B7 showed a 10-step base learn needs 13 proposals vs the 7-proposal floor (32000/4096). Ruled option A-ii: raise session output total to 98,304 and input total to 786,432, with schema maximum > default so later tuning is config-only; per-call 4096 kept (thoughts count as output, non-STOP → repair); lowering per-call, chunking, model tier and refunds rejected. CSI daily defaults are kept (156 calls/CSI/day). The harness admission caps are computed from planned proposals, not sessions × totals.

**Why:** at current defaults the AC-7 gate is arithmetically unreachable (6 incremental-base runs fail → 51 < 52 of 57). The input total becomes the next wall (~15 proposals) if output alone is raised.

**How to apply:** status is DRAFT until the @pm ack block is signed. It needs the session schema re-epoch, runner bundle regeneration, and the dist rebuild bundled with AE-01/FM-01. B8 (R, price) and U7 stay with the user / ED-01 owner. Re-rule if T4 p95 is above 20 proposals or any class-P run ends BUDGET_EXCEEDED. Related: [[obs009-t0-rulings]], [[ar2-ar3-obs014-rulings]].
