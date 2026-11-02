---
name: index-pick-gate-design
description: 2026-11-01 design for hackernews .nth()/.first() wrong-element defect; why FIX-26 regressed; recommended prepare-time peer-signature gate
metadata:
  type: project
---

Defect: `.first()/.nth()` turn a multi-match into one element, so strict mode never fires (hackernews steps 4,5 learned wrong element). Ruled (design only, 2026-11-01): runner until-fence gate in stepCodeBinding.ts, not a contract sentence.

**Why:** FIX-26 (c7) flipped N1 units n1-03/n1-04 (missing Priority option) from clarify to selectOption 5/5 each (0/10, n1-01/02 stayed 10/10); contract is ~9977/10240 bytes; target gain 2/5 to 3/5 is noise. Naive "count>=2 and no ordinal" is dead: both HN steps say "first"; 17 of 50 index-bearing codes in gate r5-r7 are nameless `getByRole('cell'|'link').nth/first`.

**How to apply:** gate = at consumption (read/effectful Locator call, untilFence only) judge each index base: count>=2 and ancestor-signature (3 levels, tag+first class, own class excluded) not uniform -> TARGET_DRIFT with matchCount via existing STEP_PRE_FENCE channel. Verified live: HN s5 2 sigs, s4 7 sigs flagged; kernel rows, cells, Sphinx Related navs uniform. Residual: `.first()` moved earlier onto rows (tr vs tr.athing same ancestors) escapes. Repair channel cannot regress N1 (contract untouched).
