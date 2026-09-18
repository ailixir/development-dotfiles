---
name: epic10-10-31-po-rulings
description: Epic 10 story 10.31 post-QA rulings — AC text that mispredicts a red is a broken instrument; ratification standard for guards added beyond an AC; unreached vs false
metadata:
  type: project
---

Rulings made on the 10.31 gate (2026-09-17), reusable as precedent for the rest of Epic 10.

**An AC that predicts a red which cannot happen is broken the same way a test that cannot fail is
broken.** Corrected rather than deleted, because an implementer who cannot reproduce a predicted
failure has no way to distinguish a wrong prediction from a missing guard.
**Why:** 10.31's AC-2(a)/(b) predicted a pinned-list red that is structurally impossible — the pin is
over operationIds and a repointed `$ref` moves no key.
**How to apply:** when @qa routes a "the AC mis-describes the code" item, correct the AC text and
state explicitly that it is a correction to the record, not rework, so the story does not re-open.

**"Unreached" and "false" are different and must not be collapsed.** An assertion that *would* redden
but is pre-empted by an earlier one is a true statement about the guard; keep it, labelled.
**Why:** AC-2(b) and AC-6's third falsification both hit this — AssertJ aborts early in one, and a
pre-existing code-differs assertion pre-empts a schema check in the other.
**How to apply:** check assertion ORDER in the source before accepting "assertion X catches Y".
A catch under a misdirecting message is a diagnosis defect for the next owner of the file, not rework.

**Ratification standard for a guard added beyond an AC's bullets:** ratify when the falsification
*adds* the offending shape rather than *retagging/mutating an existing* one. A retag that the counts
would also catch proves ordering, not non-redundancy.
**Why:** @dev's M4 retagged an operation; @qa's Q9 added one and was the only proof that settled it.
**How to apply:** also add the add-case as a new falsification to the AC, so the ratified guard is
falsifiable from the AC rather than surviving on a reviewer's note. Authority: test coverage of an
already-authorized declaration is not an `openapi.yaml` edit — ADR-002 §12 Class A/B/C does not engage.

**"Found and judged harmless" and "never found" are different claims.** Strike a non-hit from a
ruling's scope; do not reclassify it.
**Why:** the draft listed `studio-execution.md:213` as a harmless hit; re-running the search showed it
cannot match at all. Related: [[epic10-wave8-gate-rulings]].

**Closed findings get recorded, with the asymmetry stated.** PHANTOM-1 is LOW *because it turned out
false* and would have been HIGH if true. Record that reasoning or the low severity reads as "never
worth chasing" and someone re-investigates.

Backlog convention in `docs/epics/EPIC-10-EXECUTION.yaml`: real production defects go in
`integration_defects` as `DEF-nn`; per-gate finding clusters go in
`stories[<id>].story_context.po_backlog_*`; both must be named in
`stories["10.19"].story_context.register_additions_*` or 10.19's AC-10 register will not read them.
Parse checks use `ruby -ryaml` — python has no yaml module on this machine.
