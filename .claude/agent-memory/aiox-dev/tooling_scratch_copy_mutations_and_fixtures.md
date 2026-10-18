---
name: tooling-scratch-copy-mutations-and-fixtures
description: Runner mutation checks and fixtures-tier runs that write evidence go in an rsync scratch copy of studio-runner (symlinks for node_modules/dist/tools); env-var vitest root; OLD/BASELINE variants as python substitutions
metadata:
  type: project
---

For W2-style lanes (shared live tree, other lanes editing, no dist rebuild): copy `studio-runner/{src,test,*.ts,*.json}` to `scratchpad/<x>/r2-scratch/studio-runner`, symlink `node_modules`, `dist`, and put `tools` and a real `docs/specs` copy beside it. Mutations are small python `sub(old,new)` edits applied only in the copy, so the repo is never mutated and parallel lanes are unaffected.

- Fixtures config without `globalSetup` (no dist re-emit): `root: process.env.R2_RUNNER_ROOT`, so the same config file runs against the repo or the copy.
- Several fixtures tests write evidence into `../docs/qa/evidence/STUDIO-OBS-007/...` and fail with ENOENT in the copy until those dirs exist; make them from the ENOENT paths in the log. Running them in the copy keeps repo evidence untouched.
- A "BASELINE" variant (reverse your own edits) is the way to tell your regression from a pre-existing red: it showed 10/10 green for browser-profile-safety before the D5 change.
- No `timeout` binary on macOS; zsh errors on `--include=*.ts` globs in grep.
- The unit tier may not import `browser.ts` or Playwright (confinement AC-25), so extract pure logic (e.g. `guidedCloseStages`) into a module the unit tier can import.
