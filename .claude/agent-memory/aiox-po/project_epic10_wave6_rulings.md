---
name: epic10-wave6-rulings
description: Epic 10 wave-6 PO rulings — merged stories are never re-opened, closed correspondences force one PR, splits are mandated on a reviewer test, and the SIZE-1 rule gains a standing-obligation clause
metadata:
  type: project
---

Five rulings from Epic 10 wave-6 validation (stories 10.11, 10.15, 10.18 — all GO at 9/9/8) that
set reusable precedent.

**A merged, gated story is never re-opened to close a deferral a later ruling unblocked.** ADR-002
O-17 asked whether 10.10's AC-11(b)/AC-16(b) re-open, ride 10.11, or split; the answer is **ride the
story that owns the enabling change**, with the criterion left *skipped, never passed* in the merged
story plus a pointer. Same for 10.14's AC-26 under §20.

**Why:** re-opening means re-running a gate against a branch several merges downstream, against
which the story's recorded numbers describe nothing, and its Status and QA Results stop describing
what shipped. The epic had already done it this way three times without naming it (10.12 AC-6b,
10.13 AC-11b, 10.14 AC-18b/19b all travelled to 10.18).

**How to apply:** when a ruling unblocks a `b` half in a merged story, route it to whichever open
story lands the property/route/config that unblocks it. Refuse a follow-up story too, if every one
of its criteria would depend on something another open story is landing in the same wave — that is a
sequencing dependency dressed as a story.

---

**A closed correspondence forces one PR — the DEF-01 test, now applied to set equality.** `TestDto`
gaining two properties turns `StudioContractTest.assertSchemaMatchesRecord` red until `UITestDto`
gains them, and a producer-only PR is red the other way. **Verify the assertion's shape yourself**:
it collects both sides into `TreeSet`s and asserts `isEqualTo` at `StudioContractTest.java:416-426`.
So 10.11 widened to carry document + backend producer rather than splitting the producer out.

**Why:** two PRs of which neither can assert the correspondence, and **the assertion is the
criterion**. Identical to wave 5's DEF-01 reasoning over `additionalProperties: false` + `required`.

**How to apply:** before splitting work across stories, ask whether any *closed* correspondence
spans the cut — set equality, a closed key set, a `required` list. If so the cut is forbidden there.

---

**Splits are mandated on one test, and the test is stated so a mandate does not read as a mood:**
*different trees, different reviewers, different gates, and can each half assert its own criteria?*
10.18 → yes on all (Platform/SRE cluster/network/storage vs ingress owner + Security; SPK-03/04/05
vs SPK-02) → **mandated**. 10.11 → yes (backend+contract vs frontend) → **mandated three ways**,
preserving the drafter's own letters so downstream cross-references survive; the new half gets the
next letter and the landing order is stated separately (*letters are names, not an order*). 10.15 →
no (one reviewer, one seam, one ED pair, and the downstream story's wave forces both halves into the
same wave anyway) → **not mandated, hint stands**.

---

**SIZE-1's rule gains clause (b), and the seventh M→L is what found it.** The wave-5 rule keyed on
*an amendment assigns an O-n to a story*. 10.15 carried **no** open item and still moved M→L: the
cause was **§12's classes + §13's log + FOC-04's re-anchor — standing obligations on any story
touching the frozen document**, invisible to a rule keyed on assignment because they name no story.
Amended rule: a size re-check is required in the same PR for (a) every story the amendment assigns an
O-n to, **and (b) every story whose remaining scope touches an artefact the amendment places a new
standing obligation on**. Clause (b) also catches 10.18 — and §23.1 asking for a re-check *in prose*
is the evidence the rule should have required one. Sizes are @po's and amended directly; the rule is
@pm's and forwarded.

---

**The byte pin is the wrong instrument for "the contract is what I expect".** `confinement.test.ts`
carries a SHA-256 pin **and**, fourteen lines below it, a test positively asserting an amendment has
not happened. ADR-002 §20 reddens merged, blameless story 10.13 in **three** places. FOC-06's
standing rule, adopted epic-wide: **no story may assert `openapi.yaml` byte-unchanged; the honest
claim is *the file is absent from my diff***. Property assertions over the document do not have that
failure mode — every one this epic added went green on its amendment untouched. Applied at
validation by rewriting 10.18's AC-25, which **as drafted forbade the amendment the architect
ordered** — check for that contradiction whenever a ruling lands after a draft is cut.

**Also: when an ADR could not measure its own effect** (§23.3 — `node_modules` absent, every
before/after figure a prediction), **check that the owning stories' criteria actually carry the
replacement**, and require *a figure that does not reproduce is a finding, not a number to match*.
A prediction that happens to be right is indistinguishable from a measurement nobody took.

---

**Unowned work: name an escalation path plus a gate, never just a complaint.** @po cannot assign
work to an organisation no source names (ED-02's owner is `TBD`; BRD §4 names no identity owner). So:
name the path (@pm → engineering management via BRD §8, Security & Compliance accepting) **and
convert "a pilot cannot be scheduled against an unowned prerequisite" into a drafting gate** — story
10.19 may not be drafted while ED-02's owner reads TBD. Same shape for MED-2 (→ @devops, deadline
before 10.19 drafting, **plus** an epic-wide mitigation so it survives non-delivery: *a run short of
its baseline test count is a hang, never a pass*). Split multi-part findings by owner — ENV-1 became
three owners, because one owner is how two of them get lost.

Related: [[epic10-wave5-rulings]], [[epic10-wave4-rulings]], [[adr002-amendment-authority]]
