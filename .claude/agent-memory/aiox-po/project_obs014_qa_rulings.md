---
name: obs014-qa-rulings
description: 2026-10-14 PO rulings on OBS-014 QA draft gate — AC-4 corpus = four joined ITs (static fixtures hold no grounded click); 3 AC-1 items required before Done (B14); ~21 sessions/CSI/day accepted
metadata:
  type: project
---

Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-qa014-rulings.json`, story v0.1.9.

**AC-4 (REQ-002):** the B14 5-pair calibration corpus was rejected. It is hand-copied and missed ReplayIT:7094. The static OBS-005/006 fixtures (v3 planning-fixtures, observed-reference) contain no grounded click/press/check, so the "corpus" is the joined classes Planning/ReplayIT/SessionIT/Bridge. Required: root S4 counts guard decisions with no unplanted refusal, and B14 records a complete or name-excluded denominator.

**AC-1 (REQ-001):** three items, all required before Done, owner B14. (1) Assert the v2 materialized context (the runner side is already proven by policyHash.test.ts). (2) The bootstrap definite-refusal IT. (3) The timeout negative control. Items 2 and 3 are architect S3-exit tests, so only @architect can defer them.

**OPS-001:** ~21 sessions/CSI/day is at or above the ruled k=20, so it is accepted. Tuning goes only through OBS-009:230 (architect + pm).

**Why:** a hand-copied list cannot catch regressions in cases it omits, and architect-listed tests are not @po's to waive.

**How to apply:** when QA re-gates 014 after S4, check these deliverables by name. See [[studio-observed-wave-po-conventions]].
