---
name: shared-scratch-and-gradle-lock
description: STUDIO-OBS-012A parallel dev lanes share one scratchpad dir and one backend build dir; use a per-lane scratch subdir and copy JUnit XML out via init script
metadata:
  type: project
---

In the STUDIO-OBSERVED orchestration (2026-10), several Dex lanes run at once against one backend checkout. They share the session scratchpad dir and `backend/build/test-results`, and every Gradle call is serialized by `.aiox/sdc/STUDIO-OBSERVED-ORCH/gradle-locked.sh` (it can wait many minutes for another lane's run).

**Why:** in the r6r7 lane, generic scratch names (`copyxml.init.gradle.kts`, `run1.*`) could overwrite another lane's files. Also, the next lane's run can wipe test XML from the shared build dir.

**How to apply:**
- Put all scratch files under `scratchpad/<lane>/`.
- Copy JUnit XML out with an init script that registers Copy tasks inside `gradle.projectsEvaluated` and uses `finalizedBy`. Registering inside `tasks.withType<Test>().configureEach` fails at configuration time. Also pass `t.reports.junitXml.outputLocation.get().asFile` to `from(...)`, not the provider itself ("outputLocation ... does not have a task associated with it"). A working template is `scratchpad/copyxml.init.gradle.kts`.
- `UP-TO-DATE` on a gate can mean another lane ran it. To count it as your own run, force it with `<task> --rerun` (for spotless, rerun `spotlessJava`, not `spotlessJavaCheck`).
- Run long Gradle calls in the background with a status file, then poll it.
- The lock is an unfair mkdir lock that is polled every 5 s. A lane that re-acquires back-to-back can starve a waiter: on 2026-10-13 a waiter sat about 45 min behind three dex-c6 runs. Queue early, and do analysis while waiting.
- A whole-tree `spotlessCheck` can fail on another lane's in-progress file. Report which file failed rather than fixing it.
- Untracked files under `backend/.claude/` can disappear mid-session (seen 2026-10-13); keep memory writes small and re-check the index.
- The scratchpad holds hundreds of entries from earlier lanes, including generic names like `orig/`, `new/`, `base/`, `applied/`. On 2026-10-16 (REL-001) I ran `rm -rf scratchpad/new` assuming it was empty and deleted another lane's directory. Before the first write, `ls` the target; work only in `scratchpad/<task-id>/`; never `rm -rf` or `cp -R` over a path you did not create in this turn.
