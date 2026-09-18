---
name: structural-guard-mutation
description: For any test named "enumerates", "is the only", "carries no" or "exactly one", mutate the production symbol the name refers to — not the behaviour beside it
metadata:
  type: feedback
---

For any test whose name contains **"enumerates"**, **"is the only"**, **"carries no"** or **"exactly
one"**, the falsification must mutate the **production symbol the name refers to**, not the
behaviour beside it.

**Why:** @qa caught this on story 10.17 (QA-1). I shipped a test named *"enumerates the producers …
and finds one call site, which is the guard"* whose body asserted over a test-local stand-in, with
the structural claim living only in a prose comment. The criterion's own falsification — route a
producer around the redactor — left the suite fully green. My recorded mutation broke the guard from
the *inside*, where sibling tests watch, so the mutation record looked healthy while the named
property was untested. A second instance shipped in the same story: a tripwire claiming *"the
envelope's accepted key set carries no policy field"* that iterated a hand-built job fixture.

This is the shape's defining property: **it survives ordinary mutation testing because a sibling
mechanism reddens it.**

**How to apply:** two rules.
1. When a test name makes a structural claim, import and assert over the production symbol
   (`ACCEPTED_JOB_KEYS`, not `validJob()`); and mutate *that* symbol to falsify.
2. Prefer making the property hold **by construction** over watching it. If a bypass exists, close
   it — split the interface, keep the mutable half in the closure — so the mutation becomes a
   compile error plus a runtime throw rather than a test that has to notice. A test cannot watch a
   door that is open.

Related: [[epic10-falsification-standard]], [[process-table-observation]]
