---
name: epic10-wave7-rulings
description: Epic 10 wave-7 PO rulings (story 10.16) — jsdom never loads media, "nothing renders X" must be grepped, split test ignores size, SIZE-1 clause (b) reads "artefact" not "frozen document"
metadata:
  type: project
---

Rulings from validating story 10.16 (GO 9/10, 2026-09-16).

**jsdom never loads media.** In `HTMLMediaElement`, `load()` and `play()` are `notImplemented`, and
`currentTime` is a plain stored property. The frontend runs Vitest under jsdom. So in that tier,
any guard that counts requests for `<video src>`, or checks that a response's status reaches the
UI, **cannot fail**. Replace it with DOM assertions: no element carries the URL. For error
handling, replace it with `MediaError`-code equivalence plus a positive-trigger test.
**How to apply:** for any frontend criterion that counts network traffic, ask whether jsdom would
issue that request at all.

**A draft's "nothing renders X today" must be grepped before it is accepted.** 10.16's draft
said so, but `ChecksStudioPage.tsx` still had a legacy `<video>` and a synthetic
`stepIndex * 10` seek. Architecture §6.4 forbids that seek by name, and no story owned removing
it. "Composition only" would have left two players on the page. **How to apply:** grep for the
legacy implementation (`<video`, `videoUrl`, `* 10`) before approving a story that adds a
feature "for the first time".

**The split test has no size term.** The test is: different trees, different reviewers, different
gates, and can each half assert its own criteria? "Too small to split" is not an answer to it.
10.16 was split into a/b even though half b is S.

**SIZE-1 clause (b) says "an artefact on which the amendment places a new standing obligation".**
Frozen `openapi.yaml` was only 10.15's instance. ADR-002 §18.3 (frontend vocabularies are asserted
against the document) and §17.4 (`partial` is never derived from the outcome, by either component)
are standing obligations on frontend artefacts. A scope assignment by @po through `story_context`
is **not** an ADR amendment, and SIZE-1 does not cover it. That gap was forwarded to @pm.

**Check the arithmetic of an assertion before inferring which one failed.** @po's wave-6 text said
"the median failed" because two outliers fell between 100 and 1500. But the median of five is
`errors[2]`, so two outliers cannot move it. The inference was corrected in the manifest.
**How to apply:** when a report names the failing bound, read how that bound is computed first.

**Fixes to a test helper need real data behind them.** A deterministic regression test must use
frames transcribed from a captured real failure, with provenance recorded. If nothing is observed,
the story records *not reproduced, no change*; it does not invent a fix.

Related: [[epic10-wave6-rulings]], [[epic10-wave5-rulings]], [[adr002-amendment-authority]]
