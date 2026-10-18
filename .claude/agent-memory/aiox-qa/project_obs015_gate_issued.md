---
name: obs015-gate-issued
description: STUDIO-OBS-015 gate CONCERNS 2026-10-17 at 9d18f555/897182d5; story flipped InReview to Done same day (change-log 0.1.21); only push/PR handoff remains
metadata:
  type: project
---

STUDIO-OBS-015 gate issued **CONCERNS** on 2026-10-17 at source `9d18f555…`, dist `897182d5…` (1651 source files, 247 dist files), binding run final-gates07 / backend label `final-gate-attempt06-20261017T1307`. Files: `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/qa-formal-gate01/{gate.md,gate.yaml,map.json}` and `docs/qa/gates/STUDIO-OBS-015-incremental-re-learn-from-the-first-changed-step.yml`.

CONCERNS reasons: REL-001 (attempt03 CONTEXT_LOST root cause unproven), row 85 clause user waiver, ED-05 remainder external.

**Done flip applied 2026-10-17** after Dex set InReview (0.1.20) and root signed off T0: tree re-captured and unchanged, ticks spot-checked, Status set to Done, change-log row 0.1.21 added, QA Results "Status transition" rewritten. Final story sha256 after flip: `b1b6c171…bb6d`. Quality Gate 3 (push/PR via @devops) left open on purpose.

**Why:** the first pass halted because Status was `InProgress` (qa-gate pre-check expects `InReview`).

**How to apply:** nothing left for QA unless the digests move or the story is re-opened. For @devops: keep `.aiox-core/core/permissions/dispatch-governance.js` out of the 015 commit; do not demo the post-015 backend against a pre-OBS-008 frontend. Carried-forward open items: @po REL-001 pointer in 009, F4 note, six Node 22 doc rows.

Recipe that worked in the gate: recount the collector `*-results.json` against the prior attempt as a (task, class, name) multiset; check every Java evidence item in map.json by class and name. See [[gate-evidence-preservation]].
