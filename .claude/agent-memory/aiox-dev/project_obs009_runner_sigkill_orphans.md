---
name: project-obs009-runner-sigkill-orphans
description: Lane F finding (2026-10-18): SIGKILL of the runner leaves the replay child and browser tree alive until the step timeout; a guided browser dies in 0.3 s; owner @architect
metadata:
  type: project
---

Measured on dist 4add1307 (macOS host, folded runner, `ObservedCoRunIT`, 3 runs): after `kill -9` of `node dist/main.js` mid-run, the replay child and its whole Chromium tree left 30.1 s later with a 30 s step timeout, and 10.0 s later with a 10 s one. Nothing in `studio-runner/src/run/{child,childRuntime,launcher}.ts` handles parent death (no `disconnect` listener; the launcher only listens for the child's `exit`). A guided browser (Playwright pipe) leaves with the runner in about 0.3 s, and the session ends `UNKNOWN_OUTCOME` about 0.35 s after the kill with no second dispatch.

**Why it matters:** AC-11 k says "no orphaned browser tree" after a kill. It holds for cancel and for the guided path, not for a runner SIGKILL on a host. In a pod the killed container ends its own processes [I; @devops to check].

**How to apply:** if a story or review claims a runner kill leaves no browser, point at `docs/qa/evidence/studio-observed-authoring/fault-injection.json` (`observations`, leg `runnerKill`). The open question for @architect is whether the replay child should exit on IPC `disconnect`. Not a fix lane F could make (write set).
