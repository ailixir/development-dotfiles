---
name: f10-projection-route-qa-w46
description: W46 (2026-10-22) PASS on dev's make_projection_admission.py (case431 projection admission pair for the frozen 430 reader); optional hardening P1-P4
metadata:
  type: project
---

Verdict PASS at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-046/qa-projection/verdict.json` (generator 0fb85fd8, reader 664ae4d0 never executed). mirror_admit matches reader admit() line by line; no private/media path touched (instrumented). Low items: tests cannot separate O_EXCL vs pre-check vs umask (G01/G02/G04 survive), orphan context if 2nd write fails, uppercase runId accepted by generator but refused by assemble_pack, REPORT arg mapping omits adapter/pins-code/commitment args.

**Why it matters:** Root runs generator once after fresh431-root-run-go.json exists; the real assembler run needs `--root-admission-commitment` from an `assemble_pack --preflight-only` COMMITMENT line (added in W45 fixes).

**How to apply:** if dev edits the generator, re-run `qa-projection/probes/mutate.py` (copy base/ first) and the 21-drift probe in `probes/base/probe_qa.py`.
