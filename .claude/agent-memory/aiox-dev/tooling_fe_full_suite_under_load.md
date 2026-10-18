---
name: tooling-fe-full-suite-under-load
description: Full FE vitest at host load 20+ (parallel Gradle lanes) times out random tests; --maxWorkers=3 gives a clean run; evidence JSON must be path-redacted
metadata:
  type: project
---

When other lanes run Gradle (load average 20-28), a default-worker `pnpm exec vitest run` in `frontend/` timed out 13-26 tests, a different set each run (SecretInput, StudioRunsPage, page tests), including files the story never touched. `--maxWorkers=3 --minWorkers=1` passed 695/695 twice without changing any timeout.

**Why:** observed on STUDIO-OBS-012B, 2026-10-13. Timeouts are CPU contention, not regressions.
**How to apply:** check `uptime` first; under high load, use reduced workers and record it as a deviation. Root requires evidence files without private paths: strip the repo prefix from vitest JSON and replace other `/Users`, `/var/folders`, `/private/tmp` paths with `<redacted path>`. Related: [[tooling-fe-suite-side-effects]], [[tooling-node-packages-pnpm-blocked]].
