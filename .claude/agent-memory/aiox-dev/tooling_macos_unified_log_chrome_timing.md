---
name: macos-unified-log-chrome-timing
description: How to reconstruct a Chrome for Testing launch (spawn, UI-ready, exit) and kernel kills from the macOS unified log hours later, without rerunning anything; zsh `log` builtin gotcha
metadata:
  type: reference
---

For a guided/ordinary browser failure whose runner logged nothing, the macOS unified log still answers "did Chrome start slowly, die, or get killed?" for many hours after the run (REL-001, 2026-10-16: queried about 3 h later).

- Use `/usr/bin/log show`, not `log`: zsh has a `log` builtin that fails with "too many arguments". Start/end need whole seconds (`"2026-10-16 20:26:02"`), no fractions. EDT wall clock.
- Spawn: predicate `eventMessage CONTAINS "Chrome for Testing" AND eventMessage CONTAINS "Now tracking"` (runningboardd). Exit: `... "termination reported"` (`proc_exit`). The main process is `anon<Google Chrome for Testing>`; `Helper (Alerts)` is a short-lived child.
- A stable relative marker of browser start-up speed: the `distnoted` line `register name: __NSFakeMemoryPressureNotification ... token: 3900000038 pid: <pid>`. In a healthy run every launch reached it 0.22 to 0.28 s after spawn; a cold/I-O-bound one took 0.89 s. Compare against the other launches in the same minute rather than an absolute number.
- Kills: `launchd ... exited due to SIGKILL | sent by mds` (Spotlight workers), `memorystatus`/jetsam lines for the pid. None for Chrome means it was not killed for memory.
- File birth times with milliseconds (`os.stat(...).st_birthtime`) on the retained TEMP (journal files, manifests, `learning-status.json`) give the runner-side timeline; the `obs007-joined-*` TEMP survives for days.
- Save the extract into the evidence directory; the log rotates.

Related: [[host-port-and-chromium-flakes]], [[inherited-daemon-chrome-abort]].
