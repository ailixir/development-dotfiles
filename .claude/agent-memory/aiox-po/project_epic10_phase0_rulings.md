---
name: epic10-phase0-rulings
description: Epic 10 closure Phase 0 — the Done bar that overrides the framework default, and the retract-don't-delete pattern that keeps a literal-pinning guard green
metadata:
  type: project
---

Two rulings from Epic 10's Phase 0 record truing (2026-09-17, commits `1517553c1`, `83293d89c` on `chore/p0-record`).

**1. Epic 10's Done bar overrides the framework default.**
`.claude/rules/story-lifecycle.md` says *"PASS, CONCERNS, and WAIVED move the story to Done"*. Epic 10
is stricter, per story 10.19's own *Definition of done*: *"The story is Done only when every criterion
is either executed and passed, or superseded by a named follow-up story (10.34+) that carries it. A
Blocked criterion is never ticked, and the story is never closed around it."*

**Why:** a merged CONCERNS gate says the code is safe to merge; it says nothing about criteria that
were never executed because an external gate never opened. Twelve of Epic 10's gates are still open.

**How to apply:** when ruling a status in this epic, check the story's own deferral table, not the
checkbox column — checkbox hygiene is unreliable (six merged stories carry 100% unchecked ACs, and
10.4 used a third marker, `[~]`). A criterion that says *"owned by this story"* blocks Done; one that
names a successor does not. That test found 10.12 (AC-12c) as a third member of the 10.16/10.19
category nobody had recorded. See [[epic10-34-open-question]].

**2. Retract, don't delete, when a guard pins the literal you are correcting.**
`studio-runner/test/disclosure.test.ts` pinned the phrase `TBD — not assigned in sources` inside two
Helm value files that asserted it as current fact. Deleting the phrase reddens the guard; keeping the
phrase keeps the lie. The resolution is to keep the literal *quoted as the wording being retracted* —
the file becomes true and every needle still matches.

**Why:** DISCLOSURE-PIN-1 — a guard that fails a document for becoming correct. The runbook already
set this precedent (`studio-runner.md:451`, *"This item used to read…"*).

**How to apply:** before correcting any prose in this repo, grep the runner test tree for the literal
you are about to remove. Check which *branch* holds the re-scope: a fix on a sibling branch does not
protect yours.
