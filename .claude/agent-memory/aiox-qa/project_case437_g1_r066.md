---
name: case437-g1-r066
description: Round 066 QA gate G1 case437 (runner delta approval + tool set) ACCEPT 2026-10-23; approval sha, QA tool shas, how verified
metadata:
  type: project
---

ACCEPT at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-066/qa-g1/`. Approval `round-066/qa-runner-delta/approval.json` sha 1c27eff8... (APPROVE_RUNNER_DELTA437). QA tools: selector c1c253e6, invoker bb6f57fb, draft 3abd5bb9 (== DevOps expected). round-066/qa-pair left empty so Root's R6 O_EXCL generation is not blocked; reviewed copies in qa-g1/qa-pair-reviewed.

**How:** own walk of live vs build dist (9 changed + 1 added map), print-observed-catalog on build dist == code434 catalog, selector check names via `ast` (23 dict keys + 11 `checks.update` kwargs + role loop + guard = 37 == invoker CHECK_NAMES). make-qa-pair-tools437 needs --manifest; DevOps scratch manifest lives under the shared scratchpad `devops-r065/sc2/R/...`.

**Why it matters:** only non-blocking nit: collect437m.py line 75 comment spec line 436 turned into 437. Not run by QA: preflight437/retarget437/install-dist (need R2 outputs); A433 pinned status of the 4 new dist files unknowable without reading private pins.
