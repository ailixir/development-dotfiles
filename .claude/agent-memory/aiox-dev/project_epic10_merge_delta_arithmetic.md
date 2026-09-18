---
name: epic10-merge-delta-arithmetic
description: The merged vitest total must equal base + each half's additions — the arithmetic that proves no test was dropped in a conflict resolution
metadata:
  type: project
---

On a merge of two parallel story halves, the merged suite total is **not** the sum of the two
halves' totals — both include the shared baseline. Account for the delta this way:

    merged = base + (half_A_total - base) + (half_B_total - base)

Worked, 10.11a x 10.11b on `epic/EPIC-10` (2026-09-15): base at `78cc634b2` is **21 files / 276
tests**; 10.11a alone 26/383; 10.11b alone 25/306; merged **30 files / 413 tests**. 21+5+4 = 30 and
276+107+30 = 413 — exact.

**Why:** a conflict resolution that drops a `describe` block is invisible in a green run. The
arithmetic closing exactly is the cheapest proof that nothing was lost, and a shortfall names how
many tests went missing.

**How to apply:** get the baseline total from the QA Results section of the story (@qa measures it
in an independent detached worktree) rather than re-measuring. State the equation in the merge
commit. If it does not close, find the missing block before reporting anything as green.

Related: [[epic10-parallel-half-merge]], [[frontend-baseline-environment]]
