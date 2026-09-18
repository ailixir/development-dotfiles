---
name: runner-scratch-must-not-be-a-mount-point
description: STUDIO_RUNNER_SCRATCH_DIR must be a plain directory inside a writable mount, never the mount point — clearAll() rmdirs it and a read-only root denies that
metadata:
  type: project
---

Mounting the runner's scratch volume **at** `STUDIO_RUNNER_SCRATCH_DIR` kills the container before
the server listens:

```
[Error: EROFS: read-only file system, rmdir '/scratch/studio-runner'] { errno: -30, code: 'EROFS', syscall: 'rmdir' }
```

**Why:** `createFsScratchStore.clearAll()` (`studio-runner/src/server/scratch.ts`) does
`rm(rootPath, { recursive: true, force: true })` then `mkdir(rootPath)` on start-up. Removing a
**mount point** requires writing to its *parent*, and `readOnlyRootFilesystem: true` denies exactly
that. Correct on a developer machine, fatal under the hardened pod spec.

**How to apply:** mount the `emptyDir`/tmpfs at the **parent** and let the scratch directory be a
plain directory inside it (`--tmpfs /scratch` with `STUDIO_RUNNER_SCRATCH_DIR=/scratch/studio-runner`).
This is a deployment-side fix and needs no change to merged runner code. Two more things the runner
needs in a read-only container, both of which it does for itself in production and which a manual
`docker run` must reproduce:

- a writable `TMPDIR` under the scratch (`src/run/launcher.ts` sets it), or Chromium dies on the
  read-only `/tmp`;
- `--user-data-dir` under the scratch — `launchPersistentContext` supplies it; a raw binary launched
  by hand falls back to `$HOME/.config` and crashes with a trace/breakpoint trap.

If you are testing a read-only-root control, check the legitimate browser still starts before
believing the control works: a pod that never starts satisfies every "the attack could not write"
assertion for free.

Related: [[vacuous-guard-shapes]], [[epic10-falsification-standard]].
