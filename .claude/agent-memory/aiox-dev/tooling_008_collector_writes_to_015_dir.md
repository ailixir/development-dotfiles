---
name: tooling-008-collector-writes-to-015-dir
description: execute-008 run-backend-tasked.py exits 2 on green runs because its legacy delegate writes to the 015 evidence dir; L1-A moved its files
metadata:
  type: project
---

On 2026-10-17 (STUDIO-OBS-008 L1-A) `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/run-backend-tasked.py` delegated to `execute-015-008/run-backend.py`, whose `out` path is hardcoded to `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/`. The tasked wrapper looks for `<label>-results.json` under `STUDIO-OBS-008/execution-20261017/execution/`, finds nothing and `raise SystemExit(2)`. So a green run (gradle exit 0, counts all passed) still exits 2, and its files land in the closed 015 dir.

**Why:** the wrapper was shipped before the delegate was parameterised. Lane L0 (`obs008-c-pins01`) hit the same thing.

**How to apply:** read the counts from the `-results.json` in the 015 dir (or the printed JSON line), not from the exit code. Move your own `obs008-<lane>-*` files into your lane folder afterwards and say so in the receipt. Do not edit `.aiox/` scripts; report to root. Related: [[tooling-gradle-focused-runs]].
