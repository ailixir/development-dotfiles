---
name: ar1-c1-deviations
description: 2026-10-13 rulings on OBS-013 C1 deviations — action-timing.schema.json ratified, getExecutionVideo $ref switch required at S2 (C2a), checker joins lanes.C.files
metadata:
  type: project
---

Rulings in docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-1-c1-deviations.json (amends [[ar1-obs013-recording-ruling]]):
- D-1 ratified: actionTiming lives in v3/action-timing.schema.json; result#/definitions/actionTiming is a pure alias. Reason: the runner guided audit (contracts.ts:46) refuses format uuid, which result.schema.json uses.
- E-1: getExecutionVideo 404/410/416 must $ref the shared Video* components at S2 (C2a unit, which already re-pins BASE_SHA256). The S1 literals plus drift guard are interim only. Re-points: B13 (ContractDocument resolver, ExecutionVideoContractTest :223/:233/:878, EvidenceIT :347); F-012B (studioContract.test.ts :941-943). It must not ship past S4.
- D-2: tools/check-studio-observed-contracts.cjs is now C-lane owned. Its guided list was extended, not dropped.

**Why:** ADR-002 §24.3 forbids route-local copies. The switch does not change the wire.
**How to apply:** At S2 review, check the C2a ledger for the switch, the one-definition checker assertion and the four negative controls.
