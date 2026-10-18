---
name: macos-zombie-processhandle
description: On macOS JDK 21, a zombie's ProcessHandle is isAlive()=true with startInstant present but commandLine/arguments empty; ReplayIT owned-process identity checks trip on it
metadata:
  type: reference
---

Verified 2026-10-16 with a fork-without-wait probe on JDK 21:
- macOS zombie: `isAlive()` is true and `info().startInstant()` is present, but `commandLine()`, `command()` and `arguments()` are empty.
- `ps -o ppid=,pgid=,stat=` prints `Z`.
- `ProcessHandle.parent()` re-queries the OS on every call, so `isPresent()` followed by a second `parent().orElseThrow()` races.

Effect in ReplayIT: the 015 owned-process signal authority (`ownedCommandHash` → `orElseThrow`) throws `NoSuchElementException` on Chromium children that are exiting after the browser is cut. This latched the cascade guard in R2 (see r2-default-diagnosis01).

**How to apply:**
- Treat `X`/`Z` as "needs no signal", following the existing `p6KillOwnedTree` rule.
- Read `parent()` and `commandLine()` once per decision and reuse the value.

Retained ReplayIT TEMP dirs (`$TMPDIR/obs007-joined-*`) keep `p4-first-guard-diagnostic-*.json` and `failed-test-cleanup-*.json`. Match a TEMP dir to a run by mtime. Related: [[replayit-diagnostics]]
