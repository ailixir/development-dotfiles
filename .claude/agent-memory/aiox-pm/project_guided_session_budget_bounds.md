---
name: project-guided-session-budget-bounds
description: Studio guided-session model budget bounds — 2026-10-18 PM ACK of MODEL-SIZING A-ii (98304 out / 786432 in, P=24); per-CSI daily kept; earlier 2026-10-13 input ACK 262144
metadata:
  type: project
---

**2026-10-18:** @pm signed the MODEL-SIZING A-ii ruling for STUDIO-OBS-009 T4 (`docs/qa/evidence/STUDIO-OBS-009/execution-20261018/model-sizing/ruling-draft.md` §9.1). Session defaults: output 98304 (schema max 131072), input 786432 (max 1572864). Per-call 4096 / 65536 and 100 proposals are unchanged. The ruling plans for P = 24 proposals per session. That number comes from fixture B7 (a 10-step learn = 13 proposals) and is a guess until T4.
- The per-CSI daily budget is KEPT at 640000 / 5242880 (about 156 calls, about 12 ten-step learns). Revisit in OBS-010 with T4 data.
- The benchmark is spread over CSI-days with no temporary raise. Plan about 6 CSI-days, because the input side binds too at 32 KB per call.
- The ~20-step first-learn limit is disclosed in OBS-010. maxSourceSteps is not changed.
- Re-rule trigger (amended): p95 > 20 proposals, or an envelope (not per-CSI) BUDGET_EXCEEDED. Also: p95 output > 3584, mean input > 32768, p95 wall > 480 s, first-learn limit < 15 steps. Check at the end of repetition 1 as well.
- The user still owes U17 (headroom R under USD 500), U18 (price list, via the ED-01 owner) and U7 (the admission signature).

**2026-10-13:** @pm acknowledged DECISION-1 (STUDIO-OBS-012A): input 128000 → 262144, which is a byte-as-token reservation and not measured capacity (`pm-ack-d1.json`, consensus §8.2).

**Why:** The bounds were provisional. B7 showed that the 7-proposal floor (32000 / 4096) fails AC-7 by construction.

**How to apply:**
- Any change to a bound, including running above the default within the A-ii maxima, needs an @architect ruling plus a dated @pm ack.
- A per-CSI daily refusal uses the same BUDGET_EXCEEDED code as an envelope overrun (GuidedSessionService ~:261-268). Never count it as a model failure.
- STUDIO-OBS-012A owns the per-session ceilings. OBS-014 AC-8 owns the per-CSI budgets.
- USD 500 is the wave's spend authorization, not a runtime bound.
