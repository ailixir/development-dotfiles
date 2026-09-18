---
name: 10-32-text-read-constraint
description: When gating story 10.32, seek-measurement.test.ts edits must keep MEDIAN_TOLERANCE_MS at exactly two code mentions or webm.test.ts refuses to load (F-7 tightening, carry-forward gate 2026-09-17)
metadata:
  type: project
---

`fix/carry-forward` (gated PASS at `a95589763`, 2026-09-17) tightened `webm.test.ts`'s tolerance read
into `medianToleranceIn(source)`. With comments stripped, the source must contain exactly one column-0
`const MEDIAN_TOLERANCE_MS = <int>;`, exactly one `.toBeLessThan(MEDIAN_TOLERANCE_MS);`, and exactly
two mentions of the name.

**Why:** story 10.32 (AC-7 signed-lead message, AC-8 F-4 comments) edits exactly that file. Measured
(K1–K7): a helper appended to the message, comment rewrites and a trailing comment without the name all
stay green. The following all make webm.test.ts fail to load:
- interpolating the name into the message;
- a trailing comment naming it;
- a wrapped assertion;
- any new string containing `/*`.
None of them passes silently.

**Outcome (10.32 gated CONCERNS at `af8b12171`, gate commit `ab9b325b7`).** 10.32 took the
"rule 3 not changed" path and it holds: mentions 2, assertions 1, value 100, `/*` count 6/6 — the
same numbers as the base file. The constraint now applies to **any future edit** of that file.

**The general lesson, worth more than the rule:** a failure *message* is dead code in a green suite.
10.32's new signed-lead message had never executed in any run, dev's or mine. Forcing the bound
temporarily (`MEDIAN_TOLERANCE_MS = 100` → `1`, restored byte-identically — the declaration form
survives, so `medianToleranceIn` still parses) is what proved it renders instead of throwing. Do this
whenever a story's deliverable is text that only prints on failure.

**How to apply:** for any edit to `seek-measurement.test.ts`, check the diff respects the rule, or
that it changes rule 3 in the same commit while the F-7 planted-forms block still reddens S7, S8 and
S10. Cheapest check: extract `medianToleranceIn` out of `webm.test.ts` with a regex and run it over
the candidate file — it reports mentions/assertions/value without a suite run.

Related: [[epic10-vacuous-guard-shapes]]
