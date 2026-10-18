---
name: obs015-backend-collector
description: How STUDIO-OBS-015 backend Gradle runs are collected as evidence (tasked collector script, labels, lane durations)
metadata:
  type: reference
---

OBS-015 backend test evidence is produced from the repo root with
`python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/run-backend-tasked.py <fresh-label> --test-tasks <task> [--require-exec-tasks <task>] -- --no-daemon [--continue] <task> --tests '<fqcn>' ...`.
Results land in `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/<label>-results.json` (refuses to overwrite a label).
It fails `sourceStable` if any tracked source changes mid-run, so never edit files while a lane runs.
Full `test` ReplayIT+AuthorityIT lane takes ~19 min; full `guidedIncrementalTest` takes ~41 min, so launch both with run_in_background.

Targeted ReplayIT subsets always show one synthetic `executionError` (class-level audit scan needs GUIDED_ACTION_ADMITTED + REPLAY_DISPATCHED from the whole class); judge by the per-method PASS rows. Targeted `test` lane ~1 min, `guidedIncrementalTest` 4 methods ~2 min. Gradle checkstyle needs `maxHeapSize 2g` (set in build.gradle.kts) for the 34k-line ReplayIT. Never pin ReplayIT assertions to production source lines; resolve them from the compiled line table (see `prefixSites()` in GuidedPublicationReplayIT).
