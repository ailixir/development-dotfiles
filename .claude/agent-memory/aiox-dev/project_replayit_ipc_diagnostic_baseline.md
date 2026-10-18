---
name: replayit-ipc-diagnostic-baseline
description: Constant records in ReplayIT's ordinary-ipc jsonl and guided.log that are NOT R10-rev2-2 / REL-001 recurrences; where the class TEMP dirs and per-lane files live
metadata:
  type: project
---

2026-10-18 (S-W3 AC-12 observation). Full-class GuidedPublicationReplayIT runs have fixed diagnostic noise; compare against it before escalating.

- TEMP dirs are kept: `$TMPDIR/obs007-joined-<n>/`, one per Gradle test JVM (the `test` task and `guidedIncrementalTest` are separate JVMs). Identify yours by birth/mtime window. `test` lane = 29-34 parent records; incremental lane = 41.
- `ordinary-ipc-parent.jsonl` `ordinal` is per case, not global (two ordinal 9 lines exist). Key on (case, ordinal).
- Constant in all 28 `test`-lane dirs since 2026-10-16: (case 7, c6 2, ordinal 9) has kill `performStop-grace`, exit SIGKILL, `results` 0, `resultSchemaValid` null, and no child line (the 29-vs-28 asymmetry in the 012A ledger). The childCut stop case. Not a violation-catch.
- Constant: pre-Ready `TARGET_DRIFT` (case 0 ordinal 3) and the r8 control-window self-stop `CANCELLED` (case 0 ordinal 10, loop delay ~3030 ms).
- Incremental lane: exactly one `GUIDED_START_FAILED {"operation":"context","elapsedMs":1,"links":[{"name":"Error","code":"CONTEXT_LOST"}]}` in `owned-generations/generation-N/guided.log` per run (4 of 4 earlier runs from 2026-10-17). Plain Error, no phase/loss/kind: a refusal inside `incrementalDriftAuthorityRejectsEveryExactJoin`, not a browser start failure. Real runner lines are in `owned-generations/*/guided.log`, not the TEMP-root `guided.log`.

**Why:** the AC-12 c bullet 1 reads literally ("missing result after a launch was processed") and would flag the permanent case-7 record.

**How to apply:** report these as baseline with the comparison count; escalate only a new kind (violation-catch, schema-invalid `false`, child `INTERNAL_ERROR`, `GUIDED_START_FAILED` with operation assign/phase/loss/TIMEOUT or elapsedMs >= 15000). See [[tooling-replayit-diagnostics]], [[tooling-obs009-w2-backend-lane-recipes]].
