---
name: keyset-pin-vs-value-pin
description: A pinned list of operationIds does not catch a repointed $ref; only the value comparison does — verified by deleting the value assertions and watching the mutation pass
metadata:
  type: project
---

A "deliberate second copy" pin over a `Map<operationId, $ref>` catches **membership** changes only.
Repointing one operation's `$ref` leaves every key in place, so the pinned list, the both-ways
comparison and the count all stay green. The `allMatch(EXPECTED_REF::equals)` over `.values()` is the
only assertion that catches it.

**Why:** story 10.31's AC-2 predicted that repointing one of the twelve public `401`s (and
repointing `claimAdmission`) would redden "the public-side comparison **and the pinned list**".
Measured, it reddens only the comparison. Proven by re-running the same document mutation with the
three value comparisons deleted from the test: `0 failures of 17`. Conversely a *new* operation is
caught by the count and by the pinned list independently (each was shown to catch it with the other
removed), which is why AC-2 refuses to let either be dropped as redundant.

**How to apply:** when an AC's falsification note names which assertions a mutation reddens, run it
and check — the note is a prediction, not a measurement. When designing a pin over a map, state
explicitly which half (keys or values) each mutation shape exercises, and falsify from the side the
pin is least likely to catch. See [[falsify-from-the-unfavourable-side]] and
[[vacuous-guard-shapes]].
