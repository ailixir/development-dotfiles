---
name: process-table-observation
description: Observing "no process was started" in studio-runner needs a stable two-read snapshot, a real scratch store and a driven scheduler, or the negative is green for the wrong reason
metadata:
  type: project
---

Asserting "no browser process exists" in `studio-runner` has three traps, and all three make the
negative pass while proving nothing. Found on story 10.17 AC-3, each only after a mutation turned
nothing red.

1. `descendantsOf(process.pid)` shells out to read the process table, so the reader is briefly its
   own descendant. Two consecutive reads are never equal. Use the intersection of two reads ~120 ms
   apart.
2. `createHarness()`'s default scratch store is a fake whose path does not exist, so the **real**
   child launcher cannot fork at all. A negative measured against it would hold on a machine where
   no browser could ever start. Pass `createFsScratchStore(mkdtempSync(...))`.
3. The harness schedules admitted work rather than launching it inline. Without `harness.advance(1)`
   and a settle delay, an admitted job has not forked yet when the snapshot is taken.

**Why:** with any of the three wrong, deleting the guard under test leaves the process-table
assertion green and only a status assertion fires — so the strongest clause in the criterion is
never reached by its own falsification.

**How to apply:** whenever a criterion says "no process/browser exists", pair it with a positive
control on the *same instrument* (launch a real browser through the same launcher and see it
appear), and assert the process table **before** the status, so the mutation reaches it.

Related: [[epic10-falsification-standard]], [[playwright-process-groups]]
