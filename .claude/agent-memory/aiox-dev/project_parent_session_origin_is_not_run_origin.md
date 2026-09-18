---
name: parent-session-origin-is-not-run-origin
description: In studio-runner, `session.run.origin` on the parent is a SessionOrigin rebuilt from the child's `ready` message, not the child's RunOrigin; stories that say "read it from run.origin" miss this
metadata:
  type: project
---

The run origin is taken only in the child (`childRuntime.ts`, `takeRunOrigin`). The parent's `session.run.origin` (`launcher.ts`, type `SessionOrigin` in `src/server/adapters.ts`) holds only what the `ready` message carried: `browserStartedAt`, `startedAtMs`, and `clock: null`. Any new field on `RunOrigin` is invisible to the parent and to the fixtures harness (`realRunner.ts`) unless the child echoes it on `ready`.

**Why:** story 10.32's AC-4 was drafted and validated assuming `run.origin.calibrationOffsetMs` would exist on the parent. It could not. The fix needed an optional `ready` echo plus a `SessionOrigin` field outside the story's scope, and that went to @po as an escalation (2026-09-17).

**How to apply:** when a story asks a fixtures-tier or parent-side test to read something the child computes, check `ReadyMessage` and `SessionOrigin` first. Reading back the literal the harness passed does not observe the child. That is the "inferred, not asserted" shape; see [[project-vacuous-guard-shapes]].
