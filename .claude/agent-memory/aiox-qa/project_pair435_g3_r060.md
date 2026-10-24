---
name: pair435-g3-r060
description: Round 060 QA gate G3 case435 pair check ACCEPT 36/36 2026-10-23; what QA had to author to run the invoker
metadata:
  type: project
---

ACCEPT_FINAL_PAIR_FOR_ONE_BOUNDED_UNIT, receipt `round-060/qa-pair/receipt.json` sha 264e7414.... A=25af2ac2, runId b41d6689. One invocation, exit 0, 36/36.

**Why/how:** invoker (unedited, outputs to its own Q=round-060/qa-pair, so no collision/copy pattern needed this time) needs QA to author in order: final context = context.draft.json with sourceOnly false + rootExplicitFinalPairSelectionGo true at round-060/final435-pair-context.json; qa-pair/source-stage-receipt.json; round-060/root-pair-admission.json (copy format from round-055). Retarget manifest 45/45 targets and 5 G2b post-R2 shas all matched.
