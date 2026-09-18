---
name: mutation-table-is-tree-specific
description: "A mutation's sibling count is evidence about the tree it was run on — re-run the whole falsification table after the last test file lands, or the table describes a tree that never shipped"
metadata:
  type: feedback
---

Re-run every mutation in the falsification table **after the last test file lands**, and take the
suite totals then too. A sibling count measured mid-story is evidence about a tree that did not ship.

**Why:** story 10.11c recorded frontend 457/455, `M-F3` siblings 127 and `M-B1` siblings 12. @qa
measured 458/456, 128 and 13. Every one was off by exactly one, and every one was **stale rather
than wrong arithmetic**: each mutation had been run before a later commit added one more test
(`b730ac59a` added the hook-level AC-29 guard; `StudioContractTest` gained AC-30's inventory). The
coordinator's standing note is that a mutation table is *evidence*, and this epic has already had
one where the recorded hashes corresponded to no shipped file.

Note the direction: stale-low counts are **safe** — measured totals exceed the recorded ones, so
none can be mistaken for a hang (a run short of its baseline count is a hang, never a pass). They
are still wrong.

**How to apply:** treat the table as the *last* thing you do, not something you accumulate as you
go. Keep the mutation commands in a scratch file while you work, then replay them in one pass at the
end and record those numbers. Also: `git checkout -- <file>` restores to the **last commit**, which
silently discards uncommitted work on that file — back up to the scratchpad or make a WIP commit
before mutating, and verify the restore with `shasum -a 256 -c`.

Related: [[vacuous-guard-shapes]], [[falsify-from-the-unfavourable-side]]
