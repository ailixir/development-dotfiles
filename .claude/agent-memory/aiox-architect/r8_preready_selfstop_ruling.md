---
name: r8-preready-selfstop-ruling
description: 2026-10-13 OBS-012A R8 — runner control-window self-stop pre-Ready must report RUN_ERROR/'CANCELLED' (runner wrong, backend pre-Ready edge unchanged); outer CANCELLED = recorded cancel only; ADJ-1 revoked-ADMITTED and ADJ-2 LAUNCH_UNKNOWN strands open
metadata:
  type: project
---

Ruling file: docs/qa/evidence/STUDIO-OBS-012A/root/architect-ruling-r8-preready-selfstop.json.

- Outer runner `CANCELLED` means a stop that a backend record backs: the DELETE relay, or an ack/control body with cancelRequested or revoked true. A fail-closed control-window self-stop is not that. Before Ready it must send RUN_ERROR with errorMessage = launcher reason, all SKIPPED, which is the same shape as drain. Root cause: the secret-bearing window (working tree only, not at HEAD 734ad704f) overloaded `control.cancelled`.
- The backend pre-Ready predicate (OBS-006, security-reviewed, pinned by AdmissionCasIT) must never be broadened to accept unrecorded CANCELLED.
- A rejected 400 FINAL is neither retried nor settled-on-reject. The RunningReaper backstop for an ADMITTED row is manifest reconcile (ERROR, null code) or START_TIMEOUT, not STALE. GuidedPublicationReplayIT runs no reaper (dispatcher disabled, @Scheduled removed), so rows strand as PENDING there.
- A joined pre-Ready fault IT is feasible with existing seams: initial-context-state.json {pause:true} plus p6Signal -STOP/-CONT on the runner parent.
- Addendum (architect-ruling-r8-adj.json):
  - ADJ-2 is fixed in 012A in the R8 lane, in launcher.ts L477-485. LAUNCH_UNKNOWN is replaced: a wait timeout becomes TIMEOUT, and a child exit or IPC violation becomes INTERNAL_ERROR. The cause must be read from wait's boolean before stop(), because stop() makes exited true.
  - ADJ-1 (revoked while ADMITTED, so the FINAL gets a 409) is deferred to an OBS-009 AC-11 item, recorded by @po. It is a probe-first item and needs a security-reviewed ruling.

**Why:** OpenAPI and AC-13 say no invented cause and that CANCELLED is API-assigned only against a record. The fail-closed rule says do not relax a reviewed ledger edge.
**How to apply:** when a runner/backend terminal-shape mismatch appears, check the runner's fake backend first. Seam fakes that 200 any FINAL hide these mismatches. Related: [[obs012a-wave1b-rulings]], [[run-auto-accept-ruling]].
