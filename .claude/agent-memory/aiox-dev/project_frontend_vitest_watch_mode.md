---
name: frontend-vitest-watch-mode
description: `frontend/` `npm test` is bare `vitest` (watch) and never exits; use `npx vitest run`. The runner's `npm test` does exit.
metadata:
  type: project
---

`frontend/package.json` has `"test": "vitest"` — **watch mode**. Running `npm test` as stories'
Testing sections write it hangs until killed (processes show `VITEST_MODE=WATCH`). Use
`npx vitest run` or `npm test -- --run`.

`studio-runner/`'s `npm test` runs once and exits normally; only the frontend has this.

**Why:** cost a 600s timeout on story 10.31 before it was spotted.
**How to apply:** always `--run` in `frontend/`, and say in the report that you substituted the
command rather than presenting it as if the story's literal command produced the number. Frontend
baseline on Epic 10 branches: `541 passed / 2 failed (543)`, the 2 being story 10.11c's deliberate
`confirmedRevisionEscalation.test.ts` reds, plus a file-level `ChecksLayout.a11y.test.tsx` failure
from ENV-1 that contributes no counted test. See [[frontend-baseline-environment]].
