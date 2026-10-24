---
name: case434-refreeze-prep
description: Round 058 case434 refreeze/retarget prep (clean-build code434 owner, runner dist allow-list, 434 tool set); where it lives and the non-obvious facts a later run needs
metadata:
  type: project
---

Round 058 prepared (did not run) the case434 refreeze: scripts, RUNBOOK and dry-run evidence are in `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-058/devops-prep434/` (start with RUNBOOK.md).

**Why:** the six patches (round-054 sealed-files + real-tree-edits, round-057 backend-main/backend-test/runner/docs-spec) change the backend binary, so the 769 live-build pins and MAIN376 cannot survive; the backend becomes a new owner `code434-setup` built by a clean offline Gradle build in a copy (QA-approved delta), and the runner dist is rebuilt under Node 24.20.0.

**How to apply (facts that are easy to get wrong):**
- B (973bae68...) is unchanged: it is sha256 of `profile430-harness/artifact-pins.json` and no patch touches those 19 files.
- The class-loader proof count is NOT 39 any more (sealed family gained `GuidedQualifiedLabel` and `GuidedTranslationService$BackoffSleeper`; dry run 41). Every consumer reads the count from `code434-preparation/construction-receipt.json`.
- Runner dist delta (dry run): 5 pinned files change (observedOperations.d.ts, observed-reference.json, runtime-versions.json, observedReplay.js, observedSchemas.json) and 2 are NEW (qualifiedLabel.js/.d.ts), so the binder allow-list needs "additions", not only overrides.
- `profile430-project.py` compares the LIVE `backend/src/main/resources/application.yml` and `application-local.yml` byte-for-byte with the classpath copy; `collect-guards.py` re-hashes 4 live sources. Freeze backend/src/main from B0 until guard collection ends.
- The case harness uses embedded Postgres as superuser `postgres`: no runtime-role grant is needed for `rejection_reason` (the grant only matters for a prepared non-owner baseline, see `GuidedRuntimeRolePrivilegeIT.PREPARED_COLUMN_GRANT`).
- The real private pin template has extra keys (`classpathEntries`, `currentProductionMainManifestSha256`, `currentProductionMainSourceHashes`, `successorSource`, ...) that construct-code434.py rewrites; its `shape` subcommand prints structure only.
- Gradle writes `backend/buildSrc/build` and `.gradle` too: exclude them from snapshot comparisons.
- Consumed cases: 430-433 (433: runId 7daa4a4b-ae79-47c2-921e-76f6f46bdf6f, A 7c433d56...). Case434 ports 5194, 18591-18596.
