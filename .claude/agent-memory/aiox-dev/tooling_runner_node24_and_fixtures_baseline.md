---
name: tooling-runner-node24-and-fixtures-baseline
description: studio-runner npm run build under default node 23 writes node=v23 into dist/runtime-versions.json (check:pins red); fnm node 24 path; fixtures secret-login/mixed-mode-prefix are red in this worktree independent of guided stop work; baseline-copy recipe
metadata:
  type: reference
---

- Default shell node is v23.10.0 (/opt/homebrew). `npm run build` under it records `"node": "v23.10.0"` and `check:pins` fails against engines >=24.11. Use `PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH` (not ~/.nvm) for build, fixtures tier and check:pins.
- Verified 2026-10-25: with the contracts lane's schemas.json in place, a rebuild changes only `observedSchemaBundleHash` (1e24f3fa -> 9929bd0b). `observedBrowserLauncherSha256` hashes dist/run/browser.js and `observedReferenceBundleHash` the reference fixtures; edits to guided/{evidence,runtime,transport,ownership}.ts move neither.
- At that date `test/fixtures-tier/secret-login.test.ts` (22 red) and `mixed-mode-prefix.test.ts` (1 red) fail in this worktree with or without the PUBLISHED-stop change (PASSWORD_TARGET_ABSENT, /login redirects, 403). Proven by a scratch baseline: rsync studio-runner (no node_modules/dist), symlink node_modules, copy docs/specs, revert own edits by python substitution, `tsc -p tsconfig.build.json` into the copy's own dist, run with a config lacking globalSetup, compare per-test statuses from `--reporter=json`. Copy-only extra reds are ENOENT on docs/qa evidence dirs.
- The fixtures run again wrote new untracked `docs/qa/evidence/STUDIO-OBS-015/native-fixtures/r1/*/manifest.json`; diff `git status --short --untracked-files=all docs` before/after and delete the new ones.
