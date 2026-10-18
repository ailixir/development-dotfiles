# STUDIO-OBS-008 W1 lane U2 receipt: frontend npm to pnpm

- Agent: @dev (Dex), YOLO. Date: 2026-10-17. Head: 734ad704f (dirty 015 tree, as dispatched).
- Host: node v23.10.0 (host default), pnpm 10.33.0. `frontend/package.json` has no `packageManager` field, so plain `pnpm run` and `pnpm exec` were used.
- Exit status: **GREEN**, with one recorded deviation (a `frontend/.npmrc` with `node-linker=hoisted`, see D1) and one CLI variation (D2).
- Raw logs: `logs/` next to this file. The first isolated-layout attempt is kept under `logs/isolated-attempt/`.

## Result values

| Item | Value |
|---|---|
| `frontend/package.json` sha256 before | `c8485306473e0b494c3f73f0f8817592410d4a5f5912b4ade6b0b3dc7eddd07d` (matches the W0 manifest) |
| `frontend/package.json` sha256 after | `a80cd3e7b28811be0926e88d884d42fd180fd80a29743958ec6db85c72b51e0d` |
| `frontend/pnpm-lock.yaml` sha256 | `f37010c543094e467544d6761e2c8189603b6fc67dbe59affc86fb58da76e85b` (282098 bytes, lockfileVersion 9.0) |
| `frontend/.npmrc` sha256 | `a28c9d86a8981049d203ad164cff1e753ed61dc0460ee8765316cbb3d0007d00` (one line: `node-linker=hoisted`) |
| Removed `frontend/package-lock.json` sha256 (from W0 manifest) | `3387a2e3e7725029a160df01259713cda997809563683e5036bfb3128f0ae301` |
| package.json diff | one line added: `"@playwright/test": "1.63.0"` in devDependencies (exact, no caret) |
| `pnpm exec playwright --version` | `Version 1.63.0` |
| Playwright browser cache | `~/Library/Caches/ms-playwright/chromium-1243`, `chromium_headless_shell-1243`, `ffmpeg-1011` present; nothing downloaded |
| Vitest, this lane | **56 files, 701 tests, 701 passed, 0 failed** (210 suites), 152 s |
| Vitest baseline | 56 files, 701 tests, 0 failed: STUDIO-OBS-015 `execution-20261015/final-gates01/frontend-final01-vitest.log` (also `po-inventory-changes/decision.md`). Identical. |

The baseline "701/69" in `prep-20261016/obligations.json` (`V2-baseline`) disagrees on the second number. Every 015 run record I found says 56 files, and this run shows 56 test files. I read "69" as a typo. This is an inference.

## Steps executed

| # | Command (from `frontend/`) | Result | Log |
|---|---|---|---|
| 1 | `pnpm import` | exit 0. Wrote `pnpm-lock.yaml` (281260 bytes) from `package-lock.json`. 958 packages resolved. | `01-pnpm-import.log` |
| 2 | `rm package-lock.json` | removed | `02-rm-package-lock.log` |
| 3 | `pnpm add -D --save-exact @playwright/test@1.63.0` | exit 0. `@playwright/test`, `playwright`, `playwright-core` all at 1.63.0 in the lockfile. | `03-pnpm-add-playwright.log` |

## Verify rows

| # | Row | Result |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | exit 0 on the clean tree, both with the default linker (`05-...`) and with the hoisted linker (`10-...`). The lockfile sha256 was unchanged by both. |
| 2 | `pnpm exec playwright --version` | `Version 1.63.0` |
| 3a | `pnpm run type-check` | exit 0 (`tsc --noEmit`, no output) |
| 3b | `pnpm run lint` | exit 0: 0 errors, 302 warnings, all `no-explicit-any`. The 015 baseline log says the same, "302 problems (0 errors, 302 warnings)". |
| 3c | `pnpm run build` | exit 0 with `node-linker=hoisted`: "webpack 5.101.2 compiled with 1 warning" (asset size only). **Exit 1 without it**: 25 module-not-found errors (see D1). |
| 4 | `pnpm exec vitest run --maxWorkers=3` | the command exactly as written failed with a RangeError (see D2). With `--minWorkers=1 --maxWorkers=3`: exit 0, 56 files, 701 tests, all passed. |
| 5a | `pnpm run dev:standalone -- --open=false`, `curl 127.0.0.1:5173/` | 200 after 2 s. `/src/main.tsx` also 200. Stopped. |
| 5b | `pnpm run dev`, `curl 127.0.0.1:3002/` | 200 after 2 s. `/remoteEntry.js` also 200. Webpack log: "compiled successfully", 0 `ERROR in`. Stopped. |
| 6 | `test ! -e frontend/package-lock.json && test -f frontend/pnpm-lock.yaml` | OK |

Dev-server process handling: I started 4 PIDs (76158 and 76173 for Vite, 76795 and 76812 for webpack) and sent signals only to those 4. Afterwards ports 5173 and 3002 had no listener. I sent no signal to 22246, 44737, 13577 or 13581. At the end of the run, 13577, 13581 and 44737 were still alive, and 22246 was not in the process table. I did not look into why. The Vite log shows one `http proxy error: /api/v1/features ECONNREFUSED` (backend :8080 is not running). I did not request that path, so something else, possibly an open browser tab, did. It does not affect the 200.

## Findings and behaviour records

### D1. pnpm's default isolated layout breaks the webpack build; `.npmrc` `node-linker=hoisted` added (reason recorded)

- `pnpm add` did not refuse the npm-built `node_modules`. It printed 54 "installed by a different package manager" warnings and moved 54 packages to `node_modules/.ignored`. That left a mixed tree: about 650 leftover npm directories beside 34 pnpm symlinks. I deleted the gitignored `frontend/node_modules` and ran `pnpm install --frozen-lockfile` so that every verify row ran on a pure pnpm tree (`04-rm-node_modules.log`).
- On the clean isolated pnpm tree, type-check and lint passed, but `pnpm run build` failed with 25 errors (`isolated-attempt/09-build.log`). Examples:
  - `Can't resolve 'react-router'`, `'@remix-run/router'`, `'redux'`, `'immer'`, `'reselect'`, `'redux-thunk'` and `'@tanstack/query-core'` from `node_modules/<pkg>/dist`.
  - `Can't resolve '@mui/system/Unstable_Grid'`.
  - `Can't resolve 'use-sync-external-store/with-selector.js'`.
  - Module Federation: "resolving fallback for shared module @emotion/react", looking in `/Users/brunobuger/node_modules/@mui/styled-engine/esm`.
- Cause (verified by reading the file): `frontend/webpack.config.js:54` sets `resolve.symlinks: false`. Webpack therefore resolves from the lexical `node_modules/<pkg>/...` path and never reaches pnpm's sibling links under `.pnpm/<pkg>/node_modules`. This is not a missing declaration in the usual sense. The unresolved names are the transitive dependencies of declared packages.
- Fix taken: `frontend/.npmrc` containing `node-linker=hoisted` (pnpm creates an npm-style flat `node_modules`). This file is in the lane's `writes` ("only if required; reason recorded"). After it, `pnpm install --frozen-lockfile` was unchanged (lockfile sha256 identical), and build, dev:fed, type-check, lint and vitest all passed.
- Options I did not take, for root to decide:
  1. Edit `webpack.config.js:54` to `symlinks: true`. This would allow the default isolated layout. That file is outside this lane's writes. I did not test this. I infer, without running it, that it is the cleaner long-term fix, but it changes how Module Federation resolves shared modules, so it needs its own build and dev:fed check.
  2. Declare about 10 transitive packages as direct dependencies. I rejected this. The lexical-path lookup would find them, but it adds phantom dependencies to `package.json`, and the `@emotion/react` fallback error comes from a path outside the project that declaration would not fix. This is an inference; I did not test it.
- The story's rule that any hoisting or `.npmrc` setting must be recorded in the Dev Agent Record applies. Root consolidates it there.

### D2. `--maxWorkers=3` alone fails on this vitest

- `pnpm exec vitest run --maxWorkers=3` ended with `RangeError: options.minThreads and options.maxThreads must not conflict` (Tinypool, vitest 1.6.1) and reported "no tests" (`isolated-attempt/11a-vitest-maxWorkers3-RangeError.log`). I did not investigate beyond the message; I infer the default minimum worker count exceeds 3 on this 11-CPU host.
- I ran `--minWorkers=1 --maxWorkers=3` instead. The result is the full 56 files and 701 tests. Later lanes that copy the `--maxWorkers=N` recipe from `implementation-plan.md` will hit the same error for small N, and need `--minWorkers=1` too.
- Host load average was 12.7 at the start of the run, and no test was timing out.

### D3. How `file:../../put-core-components` resolves under pnpm (copy, not symlink)

- `package.json` keeps `"@put/core-components": "file:../../put-core-components"`. The lockfile records `specifier: file:../../put-core-components` and `resolution: {directory: ../../put-core-components, type: directory}`.
- Default isolated layout: `node_modules/@put/core-components` is a symlink into `node_modules/.pnpm/@put+core-components@file+..+..+put-core-components_.../node_modules/@put/core-components`, which is a copy. The copy holds only the package's published files (`README.md`, `dist/`, `package.json`).
- Hoisted layout (as committed): `node_modules/@put/core-components` is a real directory, also a copy of those files.
- In both layouts the files are hardlinked to the source (link count 2, same inode as `put-core-components/package.json`). It is a snapshot, not a live link. npm's old install made a symlink (`core-components -> ../../../../put-core-components`). I did not test whether a rebuild of `put-core-components/dist` shows up without a reinstall; I infer it may not, if the rebuild replaces files rather than rewriting them in place.
- `../../put-core-components` here is itself a symlink to `/Users/brunobuger/workspace/citi/put/put-core-components`. I kept the `file:` spec. Changing it to `link:` is a root call.

### D4. `msw:init` and `mockServiceWorker.js` do not exist

- `frontend/package.json` has no `msw:init` script (`grep -c "msw:init" package.json` returns 0). `frontend/public/` holds `config.js` and `index.html` only. `frontend/public/mockServiceWorker.js` does not exist.
- The command `npm run msw:init` is still quoted in `CLAUDE.md:51`, `frontend/README.md:18` and `README.md:29`. Those are stale; the docs lane (not this lane) owns them. I created neither the script nor the worker, as instructed.
- The story's "verify after the migration" text names `msw:init`. That row cannot be run, because the script does not exist.

### D5. Other observations

- pnpm 10 skipped dependency build scripts: `core-js-pure@3.45.0`, `esbuild@0.21.5`, `msw@2.15.0`. I did not run `pnpm approve-builds`. Vite, vitest, and the webpack build all worked without them. The msw postinstall is the part that copies a worker file when `msw.workerDirectory` is configured; `package.json` has no such configuration.
- No CI workflow exists: `.github/workflows` is absent (`ls` error). The story's U2 sub-item asks that this be recorded.
- A full Vitest run rewrote `docs/qa/accessibility/axe-results.json` (mtime 15:31). Its sha256 was `51c29bb491b25aafb91240a1b7f875bd4670b980adb43b13d344d8d8e014e961` before and after, so the content did not change. `git status` already showed it as modified before my run.
- `frontend/dist/` was overwritten by `pnpm run build`. It is gitignored.
- `pnpm-lock.yaml` `settings` does not record `node-linker`, so the lockfile is the same for both layouts.

## Writes

| Path | Action |
|---|---|
| `frontend/package.json` | one devDependency line added |
| `frontend/pnpm-lock.yaml` | new |
| `frontend/package-lock.json` | deleted with `rm` (not staged) |
| `frontend/.npmrc` | new, `node-linker=hoisted` (D1) |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md` | Status Ready to InProgress, Change Log row 0.3.15, Dev Agent Record start note. No AC, scope, title or checkbox change. |
| This receipt and `logs/` | new |

Gitignored `frontend/node_modules` was deleted and reinstalled (twice). No git commit, push or stash. `.aiox-core/core/permissions/dispatch-governance.js` was not touched.

## Deviations

1. `frontend/.npmrc` added (D1); the lane allowed it with a recorded reason.
2. `--minWorkers=1` added to the vitest command (D2).
3. `frontend/node_modules` deleted although pnpm did not refuse it (D1), to avoid verifying on a mixed tree.

## Handoff for later frontend lanes

Install with `cd frontend && pnpm install --frozen-lockfile` against lockfile sha256 `f37010c543094e467544d6761e2c8189603b6fc67dbe59affc86fb58da76e85b`. `frontend/node_modules` is currently a pure pnpm hoisted tree, so no further deletion is needed.
