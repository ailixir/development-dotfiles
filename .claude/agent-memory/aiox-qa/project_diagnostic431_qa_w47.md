---
name: diagnostic431-collector-qa-w47
description: W47 (2026-10-22) PASS on dev's collect431.py closed diagnostic of the case431 retained DB export; how export shape was verified without opening it
metadata:
  type: project
---

Verdict PASS, no required changes: `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-047/qa-diagnostic/verdict.json` (collect431 6384b199). Optional: drop the 32-row pin (O1), drop NOT_FULL_LEARN refusal (O2), README wrongly implies cleanup may have changed a terminal state (terminal states are immutable, V14 trigger).

**Why it matters:** export shape was verified empirically, not by guessing: applied all Flyway migrations to a throwaway PG14 cluster (needs `unix_socket_directories=''` because the scratchpad path is too long for a socket), ran cleanup.py's exact SQL, got 14 lines of `{"table" : ..., "rows" : [...]}` with nested jsonb and ISO-offset timestamps. Technique reusable for any future export/parse tool review.

**How to apply:** if collect431 is edited, re-run `qa-diagnostic/probes/{probe_hostile,probe_io,mutate}.py` (copy run/ first). Result.json blocks reruns until Root deletes it; a refusal still reports only shape integers.
