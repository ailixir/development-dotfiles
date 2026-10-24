---
name: diagnostic433-qa-w56
description: W56 (2026-10-22) PASS on collect433.py/collect433b.py (full+incremental sessions of one test); verified on throwaway-PG realistic export
metadata:
  type: project
---

PASS at `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-056/qa-diagnostic433/verdict.json` (collect433 4efcc9e6, collect433b e5d782d5). No required changes. Realistic full+incremental export built through the repo's real tables (probes/build_real_shape433.py) gave VERIFIED for both; column names/allowlists match V10/V12/V13/V21.

**How to apply:** the throwaway-PG recipe (initdb + all migrations + `unix_socket_directories=''` + session_replication_role=replica + drop CHECKs on touched tables in scratch) is reusable; rerun probes in qa-diagnostic433/probes (probe_hostile433.py takes run-dir and tmp dir) if either script changes.
