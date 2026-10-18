---
name: obs015-append-rulings
description: STUDIO-OBS-015 B2B-01 append-path rulings 2026-10-16 — pre-append context sync, keyed delivery refusal terminal + bounded same-key resend, assignment teardown for pending append, authored-literal scrub deferred (AUTHORED-ECHO-01)
metadata:
  type: project
---

2026-10-16 rulings (full text: docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/b2-d3-diagnosis01/aria-append-ruling01/ruling.md):
- P1: same-version context sync before `sessions.materialize` in finishSuffixMaterialization. Admit, allocate and successfulRead all bump materialization_revision after the last push, and the runner requires runtime+1 for an append.
- P2: delivery id is immutable per context revision (V21) and the runner caches results per key. So any closed 409 to a keyed append delivery is terminal at once. Transport uncertainty gets a same-key resend, at most 3 sends and never at or after the frozen leaseExpiresAt (the V21 ACK deadline). A new delivery id per attempt was rejected.
- P3: while an append delivery is PENDING, stop() addresses the assignment (append analogue of unacknowledgedBootstrap).
- Q4: runner strict-withholds all nonsecret authored literals. That is a specified boundary, but the collision with target names is unspecified. Not fixed in 015; PO-placed AUTHORED-ECHO-01 must land before the OBS-009 benchmark.

**Why:** the at-most-once and no-fake-ACK invariants, plus the [[obs015-h8-h6-rulings]] precedent of durable re-drive with deterministic keys.
**How to apply:** for later append/context-delivery or withholding questions, check first whether Dex implemented these rulings, then build on them rather than re-deriving.
