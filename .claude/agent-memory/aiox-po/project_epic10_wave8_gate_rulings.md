---
name: epic10-wave8-gate-rulings
description: PO rulings from Epic 10 wave-8 gate routing (10.32/10.30) — IPC return paths belong to the AC, closed instruments stay closed post-QA, backlog items must land where 10.19's register reads, merged counts are recounted
metadata:
  type: project
---

Rulings made 2026-09-17 on the 10.32 (CONCERNS) and 10.30 (CONCERNS) gates, commit `acf1ffe3f`
on `story/10.32`.

**An AC that asserts a value is readable at one end of an IPC boundary owns the whole return path
and must enumerate it.** 10.32's AC-4 traced the outbound chain (config → launcher → launch message
→ child) file-by-file and then asserted the parent could read the applied value back — but nothing
carried it back, so @dev had to invent a `ready` echo touching five files. Ratified, not refused:
the echo is the argument the function received (divergence mutations all redden), @qa *measured*
that nothing leaves the process, and no contract surface moved, so no ADR-002 §12 amendment.

**Why:** the failure was a drafting gap, not a dev overreach; refusing would have cost rework for a
mechanism that is provably sound and leak-free.
**How to apply:** when validating any AC of the form "X is readable on the parent/caller", demand the
return path be enumerated with the same file:line discipline the outbound path got.

**A closed instrument is not re-opened after QA for prose.** 10.32's AC-8.4 enumerated the only
lines the story could touch; @qa's evidence was `git diff -U0` showing exactly five hunks. A stale
sentence outside those ranges (DOC-1) stays stale — widening post-implementation voids the evidence
and re-opens a file that another test parses as *text*. Routed to the conformance pass the original
finding's own remedy already named.
**Why:** same family as the wave-5 ruling that closed bodies cannot be conformed halfway.

**Backlogging into this manifest only counts if the item lands in a block 10.19's AC-10 register
reads** — `integration_defects`, `external_dependencies`, `file_ownership_conflicts`. A new
top-level block is invisible to the epic's final open-items register. DELETE-RACE-1 therefore went
in as `DEF-03` even though it was found by probe rather than by reading, and the block's header
comment was amended to say so.

**Merged count comments are recounted from the merged file, never copied from either branch**
(FOC-07 `merged_key_count`): base 27 chart entries / 31 loader keys, this branch 28/32, the other
tree 31/35 with an already-stale comment; merged must be 32 entries and "thirty-six". A wrong list
is loud (96 of 104 deployment tests redden); a wrong comment is silent. Same discipline as the
SHA-256 pin: re-read, never transcribe.

**"Before the credentialed pilot?" is answered on harm-shape, not severity label.** DELETE-RACE-1 is
NO: the loss is confined to a draft that is concurrently being deleted and is invisible afterwards,
no authorization property weakens, and the fix needs a red-first interleaving proof (a story's
work), which is a bad trade inside a merge window. The ruling carries two conditions — a pilot
operating note so an observation is reported against the id rather than as a new defect, and
fix-before-GA.

See [[epic10-wave8-routing]], [[epic10-wave9-validation]], [[epic10-concurrency-proof]],
[[epic10-wave5-rulings]], [[epic10-adr002-amendment-authority]].
