---
name: f3-reproduces-under-suite-not-load
description: F-3's prescribed "20 runs under CPU load" recipe passes 20/20; the httpClient timeout race only fires under the full runner suite, and every time under a narrow squeeze
metadata:
  type: project
---

`studio-runner/test/reporting/httpClient.test.ts` → *"reports a timeout as ambiguous, not as a
failure to send"* asserts `responder.hits` has length 1 against a **25 ms** client deadline. That is
F-3, and the epic's prescribed re-check protocol does not reproduce it.

Measured 2026-09-17 on the reverted base file (`7357082e3`, digest `444a785d…`):

| Protocol | Result |
|---|---|
| The file alone, 20 runs, 8 CPU spinners (load 11.8 → 14.4) | **20 / 20 green**, 6 tests each |
| The **full default tier** (50 files, 1013 tests) | red **once in five runs** |
| Narrow squeeze: 100 ms recording pause on **that test's own responder only** | **1 failed / 5 passed**, every time |

**Why:** AC-19(c) of story 10.19 prescribes the 20-run recipe, inherited from the carry-forward
investigation. Anyone re-checking F-3 with it alone concludes the race is fixed. It is not — what
starves the request is the suite's own fifty-file parallelism, not synthetic CPU load.

**How to apply:** to prove F-3 present or absent, run the squeeze, not the 20 runs. Apply it to the
one responder under test — delaying `hits.push` for every responder reddens 5 of 6 tests and is too
broad to be evidence. Do the squeeze on a scratch copy: three writers have now touched that file and
[[epic10-falsification-standard]]'s tree already treats it as contested. Related:
[[test-container-and-context-isolation]], [[empty-run-is-not-a-result]].
