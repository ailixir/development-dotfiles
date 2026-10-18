---
name: v2check-rs1
description: 2026-10-13 — OBS-014 dead-matcher grep oracle narrowed to backend/src/main + one named negative test; architect RS-1 (non-scalar reads) measured in OBS-009 AC-7, backlog F03
metadata:
  type: project
---

Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-v2check-rs1.json`.

1. The OBS-014 dead `/api/v2/studio/**` oracle d now has four checks: 0 hits in `backend/src/main`; exactly one file in `backend/src` contains the string (`StudioExecuteIdempotencyFilterTest.java`); every hit is in that file's Javadoc or in `theRemovedV2PrefixIsNoLongerCovered`; and the old V2 test is gone. AR-3 c's own "zero hits" oracle line is superseded and was not edited.
2. RS-1: the D-C benchmark lives in **OBS-009 AC-7**, not in OBS-010, although the architect wrote OBS-010. It went in as AC-7 obligation a–d (`rs1NonScalarReadGaps` stays inside the gate denominators). README backlog item F03 is evidence-gated.

**Why:** a grep oracle must not contradict a negative test that an architect requires. Architects also mis-cite which story owns the benchmark.

**How to apply:** when writing a "zero hits" oracle, scope it to `src/main` and name the allowed test hits. When gating 014 or 009, check these placements. OBS-014 AC-1 e oracle (2) was corrected to TARGET_CHANGED at prepare (0.1.8). See [[obs014-mounted-rules]], [[studio-observed-wave-po-conventions]].
