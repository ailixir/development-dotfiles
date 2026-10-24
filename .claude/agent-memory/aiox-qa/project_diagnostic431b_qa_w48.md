---
name: diagnostic431b-qa-w48
description: W48 (2026-10-22) CONCERNS on collect431b.py - action operation read from wrong column (ledger document vs proposal); everything else passes
metadata:
  type: project
---

Verdict CONCERNS at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-048/qa-diagnostic431b/verdict.json` (collect431b 7148c1fa, pinned dependency collect431 6384b199). One required change R1: `studio_guided_actions.document` is the ledger (ledger.schema additionalProperties:false, no operation); the operation is in the `proposal` column. As delivered operationKind/fillValueKind are always ABSENT. One-line fix: `c._path(row.get('proposal'), 'operation')`; dev's test fixtures encode the wrong shape.

**Why it matters:** dev derived "document has operation" from V14 CHECKs without checking the writer (GuidedActionLedger) and schema. Throwaway-PG emulation with schema-faithful rows (set session_replication_role=replica to skip FK/trigger, drop csi CHECK on ui_tests, give attempts a valid identity jsonb) caught it.

**How to apply:** after dev's fix, re-review only the diff (one-line change + fixtures + README); rerun probes in qa-diagnostic431b/probes (probe_b.py takes a dir containing round-048/diagnostic431b).
