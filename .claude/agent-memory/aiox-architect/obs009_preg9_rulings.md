---
name: obs009-preg9-rulings
description: 2026-10-18 OBS-009 pre-G9 — F-A replay orphan after runner SIGKILL carried (RUN-ORPHAN-01); pre-Ready secretUse UNKNOWN_OUTCOME accepted (SEC-AUDIT-PREREADY-01, runner sends NOT_USED later)
metadata:
  type: project
---

Issued at docs/qa/evidence/STUDIO-OBS-009/execution-20261018/w3/pre-g9-rulings.md.

- F-A: replay child (detached fork, no 'disconnect' handler) outlives runner SIGKILL until in-flight step ends (≤ clamped step timeout, max ≥120 s); dies at first IPC send [I]. Not required by AC-11 (zero repeats/STALE met) or AC-1. Carry RUN-ORPHAN-01 (@dev runner: process.once('disconnect') → stop + ≤2 s group SIGKILL, ppid poll fallback). @devops in-pod kill check rides PID-1 d; survivors → GA §4.G.
- secretUse: pre-Ready RunFailure FINAL has no secretUse → replayTerminal maps UNKNOWN_OUTCOME. Conservative, not wrong; secrets only reach the child in Execute3 (post-Ready). Carry: runner sends NOT_USED when Execute3 never sent; ADJ-1 joined IT then pins NOT_USED.

**Why:** "accept and carry" preferred unless 009 local ACs need correctness/security change; code would reopen F/I lanes.
**How to apply:** at G9/QA, credit runner-kill leg without "no survivor"; don't re-raise either as 009 blockers. Related [[obs009-t0-rulings]], [[r8-preready-selfstop-ruling]].
