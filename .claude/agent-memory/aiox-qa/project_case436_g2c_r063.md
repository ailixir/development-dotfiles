---
name: case436-g2c-r063
description: Round 063 QA gate G2'' (case436 = case435 + call-seconds 140->45, 37-check selector, collectors) ACCEPT 2026-10-23; how it was verified
metadata:
  type: project
---

ACCEPT at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-063/qa-g2c/`. QA tools in round-063/qa-pair: selector a01fc73f, invoker af0e2562, context-from-interface 6d059e47 (generated, unedited). Collectors collect436 9eb0b276, 436b b47a693d, 436t 2b95a8aa.

**Why:** case435 burned its 600 s TTL on 140 s provider stalls; single config hunk CONFIG436_CALL_SECONDS. Verified by own forward re-implementation of the retarget (43/43 files byte-equal to manifest), AST-extracted new check run on positive/mutant data, node eval of the cfg literal for the key path, selector-vs-invoker CHECK_NAMES set diff (37=37).

**How to apply:** retarget-manifest.json does not exist before R2, so pass `--manifest` built from `build()` records (+ports). Collector `HERE` is already `.parent`, so P = HERE.parents[3] from H/diagnostic436. Preflight can be run from a scratch copy (copy catalog-loader-proof435.py too).
