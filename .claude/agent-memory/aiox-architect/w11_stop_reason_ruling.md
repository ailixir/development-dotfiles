---
name: w11-stop-reason-ruling
description: OBS-015 W11 ruling 2026-10-17 — lease==expiry tie = EXPIRED at arm time; C-1 margin-bound final renewal abort defers to expiry; backend context lifecycle ignores reason (F-1)
metadata:
  type: project
---

W11 hard-expiry stop-reason race (runner ownership.ts/runtime.ts). Ruled ACCEPT (1) arm-time reason, tie=EXPIRED; ACCEPT (2) zero-budget renewal skip only with C-1: when lease==E and the claim budget is margin-bound (`E-now-100 < cap`), a local abort must not stop LEASE_LOST — expiry timer ends it EXPIRED. Without C-1, non-secret sessions (remaining/3 schedule) still land a renewal in band (100,100+L] with p≈ln(1+L/100)/ln(1.5).

**Why:** backend context `/lifecycle` (GuidedSessionService.lifecycle) IGNORES reason → FAILED if accepted before backend E (owner/active fence), else refused and reaper (10 s) sets EXPIRED. assignmentLifecycle (pre-context, unfenced) maps EXPIRED→EXPIRED, else FAILED. So early LEASE_LOST stops misattribute hard expiry as FAILED (later refusals then say PUBLICATION_CONFLICT).

**How to apply:** F-1 follow-up (backend lifecycle should honour EXPIRED reason) is open via @po, not gate-blocking. Ruling file: docs/qa/evidence/STUDIO-OBS-015/execution-20261015/aria-w11-stop-reason-ruling01/ruling.md. Related [[r8-preready-selfstop-ruling]], [[r9-r10-clock-controlwindow-ruling]].
