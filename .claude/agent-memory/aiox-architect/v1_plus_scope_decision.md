---
name: v1-plus-scope-decision
description: 2026-10-07 delegated decision. Incremental compile (INC-001 B1/V19/B2/C, V21 editor mount, real writable ids, config REUSE) deferred behind trigger T-INC; only the minimal V1 request capture folds into the §35 fix
metadata:
  type: project
---

The user delegated the decision with the instruction "avoid over-engineering, early phase". It is recorded in docs/stories/STUDIO-INC-001-incremental-compile/spec/decisions.md (2026-10-07 section). The order is: S1 10.48 O-22 execute authz, then S2 §35 Run-confirm fix plus minimal V1 request row plus V19-safety IT. S3 is a narrowed SPK-01 R2D2 probe (anyOf, systemInstruction, thinkingConfig), with a fallback switch only if the probe fails.

**Why:** the benchmark findings (anyOf, LOW, locators) were already fixed by VAL-030/007/031/040/041. LOW made FULL compiles take about 3s, so incremental's latency and cost levers are mostly gone. The remaining risk is first-time FULL quality on real apps, and R2D2.

**How to apply:** do not re-propose B1 capture-for-all, V21 editor mount, or B2/C unless T-INC evidence exists (pilot data showing edit latency/cost pain, or prefix-step regressions after edits) and SPK-01 is done. See [[v19-hazard-v1-writer]].
