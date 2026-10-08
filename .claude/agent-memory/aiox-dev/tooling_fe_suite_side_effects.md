---
name: tooling-fe-suite-side-effects
description: Full frontend vitest run rewrites docs/qa/accessibility/axe-results.json and flakes under concurrent Gradle load; apiClient GET retries leak across tests
metadata:
  type: project
---

A full `npx vitest run` in `frontend/` rewrites `docs/qa/accessibility/axe-results.json` (the a11y audit test writes it). Restore it with `git checkout --` after the run so it does not enter a story diff.

**Why:** observed 2026-10-07 on story 10.48; the file showed up modified after each full run.
**How to apply:** after any full FE run, check `git status docs/qa` before reporting the File List. Run the full FE suite when no Gradle test run is active (load ~18 caused unrelated StudioRunsPage/runGate failures that passed in isolation). `apiClient` retries 5xx GETs with backoff, so request-count assertions should filter by a test-unique id. Related: [[tooling-node-packages-pnpm-blocked]], [[tooling-gradle-check-duration]].
