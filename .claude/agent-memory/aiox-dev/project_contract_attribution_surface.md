---
name: contract-attribution-surface
description: openapi.yaml's x-implemented-by covers only Epic-10 routes — eight pre-Epic-10 operations carry none, so "every shipped operation carries one" is false
metadata:
  type: project
---

`docs/specs/studio/openapi.yaml` carries `x-implemented-by` on **ten** operations
(`compileTest`, `confirmCompile`, `streamExecution`, `getExecutionVideo`, `runnerValidateArtifact`,
`runnerAdmitRun`, `claimAdmission`, `reportProgress`, `runnerHealth`, `runnerReadiness`) and on
**no others**. Eight pre-Epic-10 prototype routes carry none: `listTests`, `createTest`, `getTest`,
`updateTest`, `deleteTest`, `executeTest`, `listExecutions`, `getExecution`.

**Why:** @po asked story 10.15 for a both-ways guard including *"no shipped operation carries
none"*. That universal is false on this document, and satisfying it would have meant attributing
eight routes the story had no basis to attribute. 10.15 shipped the backward half as **set equality
over the operations that do carry one** — a deliberate second copy pinned in the test file, compared
both ways, with the total read from the document — which catches the defect @po named (an
attribution silently dropped) and is true. The deviation is recorded in 10.15's Dev Agent Record as
a finding for @po to rule on.

**How to apply:** if you touch that guard (it lives in
`ExecutionVideoContractTest.theSetOfOperationsCarryingAnAttributionIsPinnedBothWays`), a story that
legitimately attributes another operation must edit the pinned list — that edit *is* the record.
Do not "fix" the guard by weakening it to a subset check, and do not restore the false universal
without first widening the document. Related: [[epic10-falsification-standard]],
[[vacuous-guard-shapes]] (shape 18).
