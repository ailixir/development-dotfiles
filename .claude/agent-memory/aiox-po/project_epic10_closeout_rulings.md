---
name: epic10-closeout-rulings
description: PO close-out rulings for Epic 10 — status audits are refused when the defect is outside the story's defined referent; scoped DoD needs a transfer condition; count blocked criteria yourself
metadata:
  type: project
---

Four rulings from the Epic 10 PO close-out (2026-09-17, commit `4eb8c517e` on `chore/po-close`).

**1. A status claim is judged against its own defined referent, not against the mood of a new defect.**
10.19's "local half implemented" was challenged when `DEF-05` showed the dispatch path had never
worked. Ruled STANDS: 10.19's own *Definition of done* defines "local half" as **AC-8 to AC-19**, and
the dispatch path is AC-1's subject, recorded skipped-never-passed. **Why:** changing a status to look
responsive to a defect the story never claimed to cover is a false correction, and the O-17 standing
rule bars re-opening a merged, gated story to absorb a later finding. **How to apply:** before ruling a
status overstated, find where the story *defines* the phrase in question. If the defect falls outside
that referent, the honest answer is "stands" — but look for the one narrow consequence that *is* real
(here: the AC-10 open-items register became stale) and route it rather than absorbing it.

**2. A scoped definition of done requires a transfer condition, or it is a loophole.**
10.34's AC-24 (blocked on an unruled architecture amendment) was scoped out of the story's Done
condition — but only on condition that it is discharged by **naming a carrier**, never by being
forgotten, and with a default carrier named in advance so the transfer is executable the day the ruling
lands. **Why:** Epic 10's DoD already allows discharge by transfer ("*or superseded by a named
follow-up story that carries it*"); strict would have reproduced in 10.34 the exact frozen-story
pathology 10.34 was created to cure. "Whichever story is open when the ruling lands" is **not a name** —
that is the criterion's actual defect. **How to apply:** scoped is usually right; the condition is what
makes it honest.

**3. Never accept another story's own count of its blocked criteria — count them.**
10.18's Status row said "six criteria blocked"; @sm reported at least nine; **the real count is
fifteen** (every criterion carrying *Deferred* + *skipped, never passed*). The "six" was narrowly
accurate for the `ED-06`/`SPK-02` subset and was being used as the answer to "what holds this story
open". **How to apply:** grep the deferral marker, not the checkbox — in 10.18 even delivered criteria
carry `- [ ]`, so the checkbox is not the signal.

**4. Adding a missed criterion is mapping first, duplicating never.**
Of nine uncarried 10.18 criteria, seven became new criteria and three were *mapped* to criteria that
already closed them. Two carriers for one deferral (10.14 AC-18b) is the register-staleness shape the
epic keeps rediscovering. **How to apply:** for each candidate, state the **residue** against the
existing criterion; if there is none, write a mapping row.

Related: [[epic10-wave8-gate-rulings]], [[epic10-phase0-rulings]], [[epic10-def05-deferral]]
