---
name: project-obs008-projector-synthetic-sessions
description: 008 P2/P3 projector facts that bit L1-P - synthetic test sessions break required public fields; ready6 lives in guidedIncrementalTest not test; package-vs-folder FQCNs
metadata:
  type: project
---

STUDIO-OBS-008 L1-P (2026-10-17): the v3 `result`/`session-view` schemas now require `progress`/`explanation`, so every guided read must validate them.

- Hand-built `GuidedSessionService` instances (7 test classes) and seeded sessions (GuidedSessionIT, GuidedSessionVideoIT seed) use step ids like `step-1` and scope revisions `source-1`/`config-1`. The public contract wants UUID step ids and decimal revisions, so the projector returns an empty, claim-free explanation for them instead of failing. A projector that fabricates steps for those sessions turns 8 tests red.
- `GuidedPublicationReplayIT` under the `test` task is 46 tests; the parameterized "incremental joined" variants (including `ready6`, the learn-again citation) run only in `guidedIncrementalTest`.
- Four R3 classes declare package `guided.session` while living under other folders; `ExecutionVideoContractTest` is `studio.evidence`. A `--tests` pattern with the wrong package silently matches nothing.
- Result `detail` is copied as `progress.path("detail")` when errorCode is LOGIN_REQUIRED: a seeded progress without `detail` makes canonicalization throw INVALID_CONTRACT (a test-seed bug, not a projector bug).

**Why:** cost an hour of red runs. **How to apply:** seed UUID step ids and decimal revisions in new guided ITs; check FQCNs from the file's `package` line. Related: [[tooling-008-collector-writes-to-015-dir]].
