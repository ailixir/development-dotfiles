---
name: devsh-stub-harness
description: How to exercise dev.sh start/cleanup without real servers, Gradle daemons or the user's 8080/5173 ports
metadata:
  type: project
---

`dev.sh` (repo root, not `tools/`) can be driven end to end against a **stub tree** in the scratchpad:
copy `dev.sh` there next to a fake `backend/gradlew` (bootRun forks a `perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV'`
node server whose command line contains `<root>/backend/build`, i.e. a daemon-child stand-in), a
`frontend/node_modules/.bin/vite` stub that spawns a grandchild, and a `studio-runner` with
`package.json` build=`true` plus `dist/main.js`. Run with `--skip-checks` and `DEV_*_PORT` set to
alternates (18080/15173/18090 were free on 2026-09-18).

**Why:** the real script runs Gradle and binds ports the user's own servers hold; the stub proves the
process-tree behaviour without either. Used for the Studio v1 gaps cleanup fix.

**How to apply:** launch it from Python with `preexec_fn` restoring `SIGINT` to `SIG_DFL` and
`os.setpgrp()` — a job started with `&` from the Bash tool has SIGINT ignored, and bash cannot trap
a signal ignored at entry, so a SIGINT test from a plain `&` is vacuous. Count survivors by command
line *and* by listeners on the three ports (the runner's `node dist/main.js` has no root path in it).
Related: [[project_local_studio_e2e_path]].
