---
name: case431-human-pack-qa-w45
description: W45 (2026-10-22) CONCERNS verdict on dev's case431 human-pack assembler/adapter/sheet; findings F1-F9, scratch mutation harness location
metadata:
  type: project
---

Verdict CONCERNS at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-045/qa-assembler/verdict.json` for H=round-044/human-pack-prep (adapter d03b9bc7, assemble_pack f37fc96e, template 330b4fa6). Adapter retarget itself is clean (one pin swap, all 28 pins match disk, root-run-go 07ae18f2 still current).

**Why it matters:** sheet text contradicts the driver: clarification question happens only in full-learn (07), not 11/13 (private-driver.ts:324); only ONE seek offset (step 5, the edited Click Open) exists per recording, not steps 1/3/5-6. Assembler preflight lacks adapter._identity (dir mode 0700) so guard can burn after 6 PASS (probe-confirmed). Test gaps: "creates nothing" assertions check a path main never uses (mutant survives); no CASE_PINS assertion.

**How to apply:** if dev re-issues the template/assembler, re-run `probes/mutate.py` and `probes/mutate_adapter.py` (scratch, in round-045/qa-assembler/probes, run from probes/ with base/ copy refreshed) and re-check F1-F4 first. Running run_selftests from a relocated copy always fails test_case_block (OWN path assertion) - expected artifact, not a defect.

**Update (re-review, same day):** dev fixed F1-F9 (assemble_pack a4df9016, template f3fcdd98, test_assemble 5361e74f, test_adapter 7ed2eac0); re-review verdict PASS in `verdict-rereview.json`. Previously surviving mutants M04/M08/A2/A3 killed; M09/M15/M16 remain as accepted-benign equivalents. F10 is a Root carry-forward.
