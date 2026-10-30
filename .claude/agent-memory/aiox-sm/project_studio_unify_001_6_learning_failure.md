---
name: studio-unify-001-6-learning-failure
description: STUDIO-UNIFY-001.6 (drafted 2026-10-24, N1-N6 of the .5 re-check): what the public guided API does and does not expose, and the defaults flagged
metadata:
  type: project
---

STUDIO-UNIFY-001.6 drafted 2026-10-24 from visual-recheck-001.5/REPORT.md (user: "Story .6 for N1-N6"; N7-N9 out). Size M, 8 ACs, 13 tasks (6.1-6.13), lanes A (guided copy), B (ChecksStudioPage, sequential), C RunControl, D UiTestRunsTab, E logTime/ExecutionProgressView.

**Why:** N1/N2 need server data that mostly does not exist, so ACs were written to what the contract exposes.

**How to apply (re-check before reuse):**
- Terminal result has no failed-step field; `progress.activeStep` is null when terminal. `explanation.steps[]` (completed, actions[].outcome, safeLabel) exists for any outcome, so the stopped step is an inference (first FAILED/UNKNOWN action, else first not-completed).
- No guided log stream; only `session.counters` (live) and explanation actions (after end). No list/last-attempt read per test (openapi routes are by session id only); sessionStorage pointer is cleared for UNLEARNED tests.
- N5 report claim (previous run's time) not reproduced by reading: beginRun clears snapshot; real defects are ExecutionTime counting from acceptedAt, PROCESSING narrative on non-terminal snapshot, double "not attempted".
- N6 is runner text (studio-runner reportingStepReporter.ts, 0-based, null closing time by ADR-002); frontend rewrites exact prefix and uses snapshot.endedAt.
- v0.2.0 (user decisions 2026-10-24): F-B1/F-B2/F-B4/F-B5 are backlog; N2 is server-backed. Failed learns ARE persisted (studio_guided_sessions, V14); only a read was missing, so the frontend-only rule is lifted for ONE endpoint: GET /api/v1/studio/guided-sessions/latest?testId=... (batch, 1-50, caller's own terminal sessions, omit instead of 403, closed schema latest-attempts.schema.json, explanation only for FAILED). No index on test_id (D12 flagged, not added). Contract checker pins 44 ops / 8 guided routes (must go 45 / 9) and MSW P2/P3 needs a handler. Tasks now 6.1-6.19 (6.12-6.15 backend lane G, 6.16 client, 6.17 detail+All Checks; gate 6.18, re-check 6.19); decisions D9-D15 added, D4 removed.
