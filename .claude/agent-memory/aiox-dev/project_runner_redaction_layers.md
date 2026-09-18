---
name: runner-redaction-layers
description: In studio-runner the relay's redactor is the load-bearing control, not logging.ts's serialize-then-redact — removing the latter reddens nothing
metadata:
  type: project
---

`studio-runner` redacts in three places and they are not equally load-bearing. Measured on story
10.17 by mutation, against the full canary harness:

| Mutation | Result |
|---|---|
| remove `sink.write(redactor.redact(line))` in `src/server/logging.ts` | **0 red** in `canary.test.ts`; **exactly 1 red** over the full suite — `surface.test.ts > logging > serializes first and redacts second` |
| remove `active.redact(raw)` in `src/run/outputRelay.ts` | 8 red, 5 green |

**Why:** the relay redacts the child's output before the sink ever sees it, and `reportClient`
redacts its own bodies. `logging.ts`'s serialize-then-redact is defence in depth — genuinely
valuable, because it catches a field nobody enumerated, but not what the canary tests are
exercising.

**Scope matters and I got it wrong once:** it is *not* unfalsifiable by construction — it has a falsification, just not in the canary harness. Measure over the full suite before saying "reddens nothing".

**How to apply:** do not claim a canary test falsifies the log sink's redaction; it does not. If a
change needs to prove that layer, it needs a producer that reaches the sink without going through
the relay or the report client. And when writing a per-shape falsification, prefer a surgical
mutation (drop one variant, skip short variants) over removing a whole redactor — the latter
reddens most of the suite and proves nothing about the specific shape.

Related: [[epic10-falsification-standard]], [[process-table-observation]]
