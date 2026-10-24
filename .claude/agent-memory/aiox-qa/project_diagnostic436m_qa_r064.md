---
name: diagnostic436m-qa-r064
description: Round 064 QA gate of collect436m (closed UI-metadata collector) PASS 2026-10-23; how verified and tooling quirks
metadata:
  type: project
---

PASS at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-064/qa-diagnostic436m/`. Approved collect436m 3c83e0f7, test 223f34b7, pins collect436t 2b95a8aa / collect436 9eb0b276.

**Why it matters:** single-shot create-exclusive result file means a refused run burns Root's run; so I checked real-input preconditions by `stat` only (dir 0700, file 0600, nlink 1, 255789 bytes) without opening.

**How to apply:** tests run as `python3 -I -B test_collect436m.py` (not `-m unittest`, -I drops cwd). Native rows override `kind` via spread (private-driver.ts:211/:467). Probe scripts: build hostile row sets and call `collect(bytes)`; use raw `1e999` bytes because json.dumps emits Infinity. Grep tool is unavailable in this agent session; use Bash grep.
