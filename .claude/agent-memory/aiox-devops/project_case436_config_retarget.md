---
name: case436-config-retarget
description: Round 062 case436 prep (retarget case435 + one config hunk call-seconds 140->45); where it lives and the non-obvious facts for the next retarget
metadata:
  type: project
---

Round 062 prepared (did not run) case436: `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-062/devops-case436/` (start with RUNBOOK436.md, evidence in dryrun-scratch/). Case435 consumed (runId b41d6689..., A 25af2ac2...): sends stalled the whole 140 s call budget, full learn hit the 600 s TTL. Only change: `studio.guided-authoring.translation.call-seconds` 140 -> 45 as named hunk CONFIG436_CALL_SECONDS on prepare-config.mjs. Ports 5196, 18791-18796.

**Why:** Root ruled code434, dist and catalog unchanged; the QA selector must accept exactly one CONFIG hunk and nothing else (37th check callSecondsIs45ConfigHunkOnly, closed extra-rule set).

**How to apply (facts easy to get wrong):**
- The 435 binder already carries the CATALOG435_BINDER_* hunks, so 436 re-applies none; QA selector now requires `extra == []` on binder/static/target.
- Tool generators (gen-tools436.py, gen-extras436.py, make-qa-pair-tools436.py) shift case tokens with a digit-bounded regex plus masked hex; placeholders for history regions must NOT contain 43x digits (they get shifted); `catalog-loader-proof435.py` keeps its name (derivation.json pins it by name).
- Scratch dry-run trick: symlink every entry of real-stack71 into a scratch P, sed the P literal in tool copies; preflight CAT_DIR must be the real path (lstat on a symlink fails P14).
- Collectors live in `devops-case436/diagnostic436/` so they need `parents[3]` (earlier rounds used `parents[2]` one level higher); UUID literals like 4353 must not be shifted.
- Sealed setup sources protect only 7 PIDs; 89836, 44737, 66267 (operator rule) are not in cleanup.py/common.py/startup-controller.py. Adding them is a second hunk needing a decision.
- Consumed cases: 430-435 (435: runId b41d6689-e60e-41dd-a030-5fe9860a89c6, A 25af2ac2f5e493a2e9589d6383d7095c5b791d8438f8b22bc6eed910bcb49105).
