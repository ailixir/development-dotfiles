---
name: tooling-deletions-and-baselines
description: Delete files with plain rm, not git rm (git rm stages; @dev must not stage); story backend baselines may come from a different --tests filter than the one prescribed
metadata:
  type: project
---

Use plain `rm` for story deletions. `git rm` stages the deletion, and in Epic 10 the lead handles all staging, so a staged path has to be undone with `git reset -q -- <paths>`. Both 10.51 lanes made this slip on 2026-10-07.

**Why:** the delegation rule is "do NOT git add"; an unexpected index entry confuses the lead's explicit-path staging.

**How to apply:** delete with `rm`, then confirm `git diff --cached --stat` is empty before reporting.

Backend baselines quoted in a story can come from a run with an extra filter. Example: 10.51 stated `studio.*` = 1233, but that number was 10.49's `--tests 'com.citi.put.checks.studio.*' --tests '*Migration*'`. `studio.*` alone measured 1232. Before calling a count a regression, find the command the baseline came from (grep the source story for the number). Related: [[tooling-gradle-check-duration]].
