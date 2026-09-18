---
name: epic10-split-half-merge-hazard
description: When an Epic 10 story is split into halves that share a file, run git merge-tree at the gate — 10.11a/10.11b silently undo each other's criteria
metadata:
  type: project
---

When gating one half of a split Epic 10 story, **run `git merge-tree $(git merge-base <otherHalf>
<thisHalf>) <thisHalf> <otherHalf>` and grep for conflict markers**, then check whether either half
deliberately *retains* something the other deliberately *removes*.

**Why:** at 10.11b's gate (2026-09-15) the two frontend halves produced **7 conflict markers** across
`docs/stories/10.11.story.md`, `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` and
`frontend/src/services/mocks/studio/studioContract.test.ts`. `story/10.11a` keeps the 700 ms
`setInterval` poller on purpose, with a comment saying removing it is *"explicitly not this story's"*
— and 10.11b's whole AC-8 is its removal. Both halves are correct in isolation and each half's suite
is green on its own branch. A conflict resolution that takes 10.11a's `handleRunTest` wholesale
reinstates the poller and defeats AC-8, **and AC-8's guard lives in the other half's file**, so
nothing reports it until the merged tree is re-run. Neither half's gate can see this; only a
cross-branch check can.

**The mirror half of the same hazard, measured at 10.11a's gate (2026-09-15).** The asymmetry runs
both ways and the other direction is worse. `story/10.11b`'s `ChecksStudioPage.tsx` **retains every
path 10.11a retires**: `validation.isValid` as the run gate *and* as the button's `disabled`,
`buildDefaultTestIR` + `toTestRequest` on all three save paths, `generatePythonFromIR` with the
auto-sync effect, and **its own `studioApi.executeTest` call**. So a resolution favouring 10.11b's
page reverts AC-1, AC-2 and AC-3(a) at once, and silently restores a latent defect the retirement
fixed (`timeoutSeconds: 30000` into a field the contract caps at 120). Keeping both `executeTest`
call sites ships **two dispatch paths, one ungated**. Worse: the only guard that would notice is
10.11a's `pageRunGate.test.tsx` — its `runGate.test.tsx` exercises the control directly and stays
green if the page stops using it — and that page test is the most load-flaky file in the suite.
**Rule: when one half retires an authority and the other half was branched before the retirement,
grep the other half for the retired symbols by name; conflict markers alone understate it.**

**The same hazard between a story branch and an *uncommitted* sibling tree — where `merge-tree`
cannot help (10.32 gate, 2026-09-17).** `helm-chart/put-checks/templates/_helpers.tpl` keeps the
runner's accepted env keys on **one whitespace-separated line**, with a prose sentence above it
stating the loader's key count. Any two stories adding a key rewrite that single line, so the merge
is a guaranteed textual conflict *and* the count sentence is a second, silent conflict neither side's
suite can fail on: measured that day, base 27 chart entries / 31 loader keys; `story/10.32` 28 / 32
("thirty-two", correct on its branch); the uncommitted inference tree 31 / 35 with the comment still
reading "thirty-one" (already stale there). The merged file needs 32 entries and "thirty-six".
**Rule: count `KEY_SPECS` rows in the *merged* `config.ts` and write that number; never copy the
count from either branch, and re-run `npm run test:deployment` after the merge.** Because the
sibling is uncommitted, the check is `git status` + `grep` in the other worktree, read-only — a
`git merge-tree` has nothing to merge.

**How to apply:** at any split-story gate, (a) list files "changed in both", (b) for each, name which
half owns which region and put that rule in the gate file, (c) require the merged tree to re-run
*both* halves' suites before either is considered landed. The @po *Split hint* table's "five things
that must never be cut apart" is about criteria, not files — it does not catch this.

Related: [[epic10-vacuous-guard-shapes]], [[epic10-gate-policy]].
