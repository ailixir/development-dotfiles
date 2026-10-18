---
name: obs009-w15-d5-d10-rulings
description: 2026-10-18 OBS-009 W1.5 part 1 — D5 two-stage close (3 s grace after STARTED, always hardTeardown, start failures terminate at once), reply only after settle, /ready untouched; D1.0 accepted with changes (journal emptyDir, Recreate, one pin, Q1-Q10)
metadata:
  type: project
---

Ruling file: docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w1.5/ruling-part1.md.

- **The probe's 30 s is Playwright's own bound.** `closeOrKill` with `DEFAULT_PLAYWRIGHT_TIMEOUT` (coreBundle.js:39831-39848) then a process-group SIGKILL. It collides with the runner's socket `timeout` 30 s (transport.ts:127), so no reply is sent.
- **D5-1, the close:** `GUIDED_CLOSE_GRACE_MS = 3_000`, a constant in guidedBrowser.ts.
  - The graceful stage runs only after `STARTED`. Then `terminate()` (D4 `hardTeardown`) always runs.
  - A failed start (ii) and a launch-catch failure (iii) go straight to terminate.
  - (iv) is unchanged; its about 60 ms overshoot is ACCEPTED: the backend teardown re-send joins the runner's stop via the same idempotency key.
- **D5-2, the reply:** the reply goes out only after the close settles. A stop's 200 means "confirmed dead", because only a validated 200 lets the backend mark `teardownStatus CONFIRMED` (GuidedSessionService.java:2744-2773).
- **D5-3, the slot:** released only on confirmed close. A held slot never affects `/ready` or `/health` and never exits the process.
- **Probe file:** `guidedCloseProbe.test.ts` is deleted by R2 once `guidedCloseBound.test.ts` is green.
- **D1.0 review:**
  - All [P] names ratified; 57 keys.
  - Q2: exit 78 with `CONFIGURATION_DENIED <DEBUG_ENV|LAUNCH_TREE>`, plus a `RUNNER_START_FAILED` line with exit 1.
  - Q4: `/tmp` emptyDir with no TMPDIR variable.
  - Q5: the guided and replay drain halves run concurrently; no `closeGraceSeconds` key.
  - Q6: the callback token comes from an external issuer; root registers it as U21.
  - Q7: one server-level timeout set.
  - Q8: listener and guided keys get subset loaders.
  - Journal: emptyDir, because the backend fence plus one assignment per session are the authority. Rollout `Recreate`. One dual-role backend cert keeps one pin.

**Why:** the slot release must stay fail-closed. The backend's 15 s ceiling and the D4 backstop are fixed by D5 b.

**How to apply:** at the R2 or D1 gates, check case H. If the healthy close max is over 1 500 ms, it returns to me. KL-015-D5 stays open until F-merge. Related: [[rel001-d4-launch-deadline-ruling]], [[obs009-t0-rulings]], [[obs009-w15-part2-rulings]].
