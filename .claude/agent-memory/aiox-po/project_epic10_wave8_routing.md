---
name: epic10-wave8-routing
description: Epic 10 ADR-002 §24–§28 routing (2026-09-16) — decade-block story ids against an uncommitted parallel program; drafting gate is for unowned work only, owned prerequisites are depends_on
metadata:
  type: project
---

On 2026-09-16 @po routed ADR-002 §24–§28 into three new stories: **10.30** (O-18, CSI write authorization plus §27 prose), **10.31** (§24/§25 refusal surface and 401 envelope) and **10.32** (O-20 runner calibration plus F-4). All three are in wave 8. 10.19 moved to wave 9 and depends on all three. The commit is `82322e084` on `po/route-rulings`.

**Numbering against an uncommitted parallel program: claim a decade block, not the next integer.** The studio-inference program holds 10.20–10.26 in *uncommitted* files in `wt/epic`. Those files are not on any branch, so taking 10.27 would collide the first time that program drafts one more story. Epic-10 follow-ups therefore start at 10.30, and 10.27–10.29 are left to that program as headroom. Say plainly that this still does not make a collision impossible, and flag it to @pm.

**Why:** a committed manifest cannot bind a drafter who never reads it.

**How to apply:** before numbering, list the story files in every worktree, not just your own. Grep both trees for the candidate ids, and check branch names too (`story/10.19` existed before its story file did).

---

**A drafting gate is for UNOWNED prerequisites. An owned prerequisite is `depends_on`.** ED-02 was a drafting gate because it had no owner. O-18 got an owner (10.30) and a ruled target behaviour, so it does not gate drafting 10.19. It does block 10.19's implementation, because 10.19 is the credentialed pilot. A gate asking for a *ruling* is lifted once the ruling exists. The *measured* before/after it also asked for moves to the owning story's criteria rather than being waived.

**Split choice:** @architect offered one PR or two. @po chose two stories on the split test, and the deciding reason was that a HIGH security fix must not wait for a frontend mock change. The pin is serialized through FOC-07, which is not a closed correspondence, so the cut is allowed.

Related: [[epic10-wave6-rulings]], [[adr002-amendment-authority]], [[epic10-calibration-ruling]]
