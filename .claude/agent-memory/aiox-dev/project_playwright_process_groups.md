---
name: playwright-process-groups
description: Playwright starts Chromium and ffmpeg in their own process groups, so one group signal to the forked child never reaches the browser
metadata:
  type: project
---

Killing a Playwright browser tree by spawning the child `detached` and sending one
`process.kill(-childPid)` **does not work**. Observed on the branch with `playwright@1.63.0` on
macOS/arm64 (`ps -A -o pid=,ppid=,pgid=`):

```text
fork pid 16341  pgid 16341        node dist/run/child.js
  desc 16343    pgid 16343        chrome-headless-shell   <- its own group
  desc 16367    pgid 16367        ffmpeg-mac              <- its own group
  desc 16364/5/6 pgid 16343       chrome-headless-shell   (renderers, in Chromium's group)
```

Playwright launches the browser and the video encoder detached itself, precisely so *it* can
group-kill them. So the fork's group contains only the fork.

**Why:** this matters because the obvious mechanism is also the one that looks correct in review
and in most tests — Chromium normally exits on its own when its parent's pipe closes, so a
kill-the-child implementation passes until the browser is wedged and cannot notice.

**How to apply:** to end the tree, enumerate descendants **first** (a dead root has no descendants
— orphans re-parent to init and disappear from any walk starting at it), then signal each member
together with the group it leads, deepest-first, root last. That is what `studio-runner`'s
`src/run/tree.ts` does. To test it, suspend the browser (`SIGSTOP`) before the kill so it cannot
exit by itself, and recheck each previously observed pid individually rather than re-walking.

See [[epic10-falsification-standard]] for the no-op control that exposed this.
