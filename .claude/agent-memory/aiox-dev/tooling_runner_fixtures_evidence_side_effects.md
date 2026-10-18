---
name: tooling-runner-fixtures-evidence-side-effects
description: Running studio-runner fixtures tier (even single files) writes evidence under docs/qa/evidence; how to undo it; protect_media.py needs FG inside the repo; fixtures mutation checks
metadata:
  type: reference
---

The studio-runner fixtures tier is not read-only (verified 2026-10-17, W10):
- `browser-profile-safety.test.ts` creates a new `docs/qa/evidence/STUDIO-OBSERVED-NEXT/.../profile-safety-fixture/native-runs/redirect-XXXXXX/` on EVERY run, including single-file runs and each mutation-check run. Remove the ones you created (compare `ls` before/after).
- The full tier rewrites 22 existing files (STUDIO-OBS-007, OBS-013/r13) and creates ~63 new random-suffix files (`native-fixtures/r1/*`, `padding-correction/native-runs/*`). `final-gates05/protect_media.py before|after <label> <repo> <fgdir>` backs up/restores the 22, but its `after` crashes in `a.relative_to(root)` when `<fgdir>` is outside the repo (scratchpad): patch to `relative_to(fg)` and re-run `after` (it restores nothing before it crashes). It does not remove NEW files: find them by `st_birthtime >= run start` under `docs/` and delete them, then `rmdir` emptied dirs.
- After a fixtures run, `dist/` is re-emitted (also from a mutated source): run `node scripts/write-runtime-versions.mjs` then `check:pins` before the unit tier, or `pins.test.ts` is red.
- Mutation script pattern that worked: backup + single `str.replace` (assert count 1) + `vitest run [--config vitest.fixtures.config.ts] <files> --coverage.enabled=false --reporter=json --outputFile=...` + restore in `finally` with sha assert. macOS `sed -i` needs `-i ''`.
- Real-process fixtures trick: mock `chromium.launchPersistentContext` to a pending promise and spawn `node -e 'setTimeout(()=>{},60000)' -- --user-data-dir=<scratch>/browser-profile` as a stand-in Chrome; `vi.spyOn(process,'kill')` swallowing SIGKILL (not signal 0) for that pid makes a survivor.
