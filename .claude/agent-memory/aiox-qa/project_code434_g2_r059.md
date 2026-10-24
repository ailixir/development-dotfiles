---
name: code434-g2-qa-r059
description: Round 059 QA gate G2 (code434 + case434 retarget + QA pair tools) ACCEPT 2026-10-23; generator left invoker stale, fixed by QA
metadata:
  type: project
---

ACCEPT at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-059/qa-g2/` (QA-G2.md, verdict.json). Final tools: selector f1e1a75b, context-from-interface bec2dbe2, invoke-admitted-pair 7bdaca7e (QA-fixed; delivered fe3939cc was bad).

**Why:** make-qa-pair-tools434.py renamed 3 check keys and 817->794 only in the selector; the invoker's CHECK_NAMES and two `==817` stayed, which would have refused the context/projection. Found by diffing the selector's emitted check names against the invoker's CHECK_NAMES.

**How to apply:** for any successor pair tools, diff selector-emitted check keys vs invoker CHECK_NAMES and grep both for old counts; .map files are NOT pinned (binder `selected_parent_code` suffix set has no .map); token-level diff of retarget.diff is a fast no-blanket-substitution proof.
