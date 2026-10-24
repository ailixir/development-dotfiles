---
name: pair436-g3-r063
description: Round 063 QA gate G3 case436 pair check ACCEPT 37/37 2026-10-23; same flow as pair435, one invocation
metadata:
  type: project
---

ACCEPT_FINAL_PAIR_FOR_ONE_BOUNDED_UNIT, receipt `round-063/qa-pair/receipt.json` sha cb925597.... A=10bb9205, runId d15e7d5f. 37/37 including callSecondsIs45ConfigHunkOnly; invoker exit 0, one invocation.

**How:** same order as [[pair435-g3-r060]]: context-from-interface.py (cwd=REPO, relative INTERFACE path + sha) -> final436-pair-context.json at round-063/ (sourceOnly false, GO true) -> source-stage-receipt.json in qa-pair -> round-063/root-pair-admission.json (Root-authorized, 2h window) -> invoker. Retarget manifest 45/45 targets and 6 post-R2 shas matched. Receipt adds retargetDiffSHA256 and a configCallSeconds block.
