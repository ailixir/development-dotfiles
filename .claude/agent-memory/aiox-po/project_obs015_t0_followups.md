---
name: obs015-t0-followups
description: 2026-10-13 OBS-015 T0 architect rulings applied by @po — v1 authoring deleted in 015, AC-2 refusal = 409 REVISION_CONFLICT+messageCode, V21 by @data-engineer, FE v2-writes obligation in OBS-008
metadata:
  type: project
---

OBS-015 0.1.4 / OBS-008 0.3.3 (2026-10-13), record `docs/qa/evidence/STUDIO-OBS-015/po-t0-followups.json`, rulings `t0-architect-rulings.json`. v1 authoring = second generation, deleted in 015 (no new code: 400 INVALID_AUTHORING / UNSUPPORTED_FIELD). AC-2/AC-6 reworded: narrowed firstLearnStepId = "positioned after k" → 409 REVISION_CONFLICT messageCode FIRST_LEARN_STEP_NARROWED. AC-1 origins enter k only via environment. REPLAYING_PREFIX needs V21 (@data-engineer, T3 prereq); V12–V20 frozen. 014→015 serial. FE v2-writes-with-stable-IDs is an OBS-008 inherited obligation a–f, closes before OBS-010. R-2 single frozen governed policy; F02 trigger (b) did not fire.

**Why:** the production FE authors only v1 drafts, so without OBS-008's item no FE test can be learned.

**How to apply:** "T0 rulings record" block references the rulings file (file is authoritative); T0 parent stays open until 013/014 Done. See [[studio-observed-wave-po-conventions]].
