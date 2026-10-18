---
name: tooling-scratch-tree-staged-unit
description: Build a behaviour-changing sync unit (e.g. S3) in an rsync'd scratch copy, compile/test it under the shared gradle lock, ship it as a patch; plus test-count and gjf traps
metadata:
  type: project
---

When a unit must land atomically with another lane's contract change (STUDIO-OBS-014 S3: governed
policy + runner-context fields), editing the shared tree early turns other lanes' guided ITs red.
What worked (B14, 2026-10-13):

1. `rsync -a --exclude .git --exclude node_modules --exclude build --exclude .gradle --exclude
   frontend --exclude .aiox --exclude .claude backend docs studio-runner <scratch>/s3tree/` and copy
   `backend/src` to `<scratch>/s3base/src` as the diff base.
2. A copy of `gradle-locked.sh` that takes the SAME mkdir lock but `cd`s into the scratch backend:
   compile and run focused tests there (Testcontainers works).
3. Contract files the C lane will add can be simulated in the scratch `docs/` copy only (label any
   result as a pre-check, not proof). The patch excludes `docs/`.
4. `diff -ruN` base vs scratch under `pa/backend/src` / `pb/backend/src`, rewrite headers to
   `a/` `b/`, then `git apply --check` against the real tree. Ship the sha256 in the ledger.

Traps:
- `grep -c '@Test'` also counts `@TestConfiguration`/`@Testcontainers`; rulings quoting "29 → 30"
  may be raw grep counts. Count methods from the run XML, name-matched to source.
- In a single-quoted bash heredoc, Java `\"` must be written `\"` (not `\\"`).
- `assertThat(tx.execute(...))` on a `Boolean` is ambiguous with AssertJ's Predicate overloads;
  assign to a typed local first.
- Big insertions into ReplayIT: plain `diff -u` aligned the new block against similar existing
  lines and emitted a 602-line replace hunk (merge-hostile for parallel patches). Use
  `git diff --no-index --diff-algorithm=patience base work`, then rewrite the two headers to the
  repo path for `-p0`: one pure-insertion hunk (b2ab-source01, 2026-10-16).

**Why:** keeps the shared source set compile-green and behaviour-stable for other lanes (RK-12).

**How to apply:** any coupled multi-lane unit gated on a sync point. Related: [[tooling-gradle-focused-runs]], [[shared-scratch-and-gradle-lock]].
