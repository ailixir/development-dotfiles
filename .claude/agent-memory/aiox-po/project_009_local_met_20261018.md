---
name: 009-local-met-20261018
description: 2026-10-18 009 D2 trigger MET under user C8 waiver (bound 061fc41f); 011 start conditions both satisfied; T-box "marks" are dated notes, not ticks
metadata:
  type: project
---

On 2026-10-18 the @qa record for the 009 D2 local validation (`local-gate-20261018/qa-local-validation-record.md`) read trigger MET. The trigger holds only under the user's C8 waiver and is bound to source 061fc41f. @po recorded this in 009 0.3.28, 011 0.2.16 and the README (receipt-6).

**Why:** the waiver owes the full `check` plus JaCoCo at the 011 T0 baseline (B1), and the trigger lapses with the waiver. 009 Done remains far off: T4 (U2/U17/U18/U7), DEPLOY-OBSERVED-01 with U24, U3, U13/AE-01/FM-01.

**How to apply:**
- The lead asked @po to "mark T-boxes". @po writes a dated line-end note ("local half complete", citing record rows) and does not tick `[x]`.
- The 009 Status field still reads Ready, even though dispatches call the story InProgress. @po does not move it.
- **Open @po item:** the B2/B3 rulings and the N-RS1 sentence (record §9), to do with @architect.
- **D5 check:** record §7 does not name 009 D5 (KL-015-D5) for the 011 start. Root confirms it at T0.

Related: [[009-w3-carries-20261018]], [[011-t0-ratification-20261018]].
