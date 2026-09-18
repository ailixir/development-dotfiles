---
name: epic10-parallel-half-merge
description: Merging two parallel halves of one Epic 10 story — why "hunk by hunk against an ownership rule" is the only safe resolution, and what a wholesale take reverts
metadata:
  type: project
---

When one Epic 10 story is split and both halves are built in parallel (10.11a/10.11b was the
first), the second merge **cannot** be resolved by "theirs is newer" or by taking either side
wholesale. Each half's branch deliberately *retains* code the other half retired, and each half's
own suite is green on its own branch.

**Why:** the halves are cut by criterion, not by file. The later half branches from the shared
base, so its copy of a shared file still contains everything the earlier half removed. Taking it
wholesale silently reverts the earlier half's ACs **and** its suite still passes, because the
guards that would catch the revert live in the *other* half's test files. 10.11b's page retained
the `validation.isValid` run gate, the legacy IR builder, the Python generator and its own
`executeTest` call site — a wholesale take would have shipped two dispatch paths with one ungated
and restored a `timeoutSeconds: 30000` product defect.

**How to apply:**
- Find the ownership rule before touching anything. @qa states it in the `MERGE-*` finding of the
  later half's QA Results section in the story file (for 10.11: *"10.11a owns the enablement
  predicate, 10.11b owns the body and lifecycle"*).
- Extract all three stages (`git show :1:` / `:2:` / `:3:`) and diff base→ours and base→theirs
  separately. The conflict markers show far fewer hunks than the semantic diff does — the page
  had 3 marked hunks and ~12 semantic ones.
- Build the result from the half that owns the *structure*, then re-apply the other half's hunks
  onto it. Do not hand-merge inside the marker regions.
- Expect one or two edits neither author wrote: a merged surface can render the same data twice
  and break a singular `findByText` in a test that is otherwise correct. Record those explicitly
  as merger-made.
- Re-run **both** halves' suites on the merged tree. Neither half's own green is evidence.

Related: [[epic10-merge-delta-arithmetic]], [[epic10-falsification-standard]],
[[frontend-baseline-environment]]
