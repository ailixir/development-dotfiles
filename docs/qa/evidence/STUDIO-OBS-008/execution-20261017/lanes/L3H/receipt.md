# STUDIO-OBS-008 W2 lane L3H receipt: Playwright harness (P5) and U2 doc updates

- Agent: @dev (Dex), YOLO. Date: 2026-10-17. Head: 734ad704f (dirty tree, as dispatched; L2a edits `frontend/src` in parallel).
- Exit status: **GREEN**. Harness self-test 5/5 passed; no e2e file is collected by Vitest (checked by a method that can fail, see V2); `tsc -p e2e/tsconfig.json` clean; `realStudioStartup.test.ts` 2/2 passed. Deviations are listed at the end.
- Logs: `logs/` next to this file.

## Names L6 needs

| Item | Value |
|---|---|
| Env flag for the real-backend project | `CHECKS_E2E_REAL_BACKEND=1` (`true` also accepted) |
| Project names | `msw` (default) and `real-backend` |
| Backend URL (real-backend mode) | `CHECKS_E2E_BACKEND_URL`, default `http://127.0.0.1:8080` |
| Ports | app `127.0.0.1:4177` (`CHECKS_E2E_APP_PORT`), MSW proxy `127.0.0.1:4178` (`CHECKS_E2E_API_PORT`) |
| Real-backend invocation | `CHECKS_E2E_REAL_BACKEND=1 pnpm exec playwright test --project=real-backend e2e/<name>-real-backend.spec.ts` |
| Spec naming rule | A spec file ending `-real-backend.spec.ts` runs only in `real-backend`; every other `e2e/*.spec.ts` runs only in `msw`. |
| Proxy test controls | `GET /__test/health`; `GET`/`POST /__test/scenario` (`{"name":"default"}`; POST resets Studio mock state and clears the log; unknown name is 400); `GET /__test/requests[?method=][&path=<prefix>]`; `DELETE /__test/requests`. Entries: `{seq, scenario, method, path, query, handled, status, range, bodyBytes}`. Bodies are never stored. |
| Adding a scenario | Add an entry to the `scenarios` map in `e2e/mswProxy.ts` (handler list). Only `default` (= `studioHandlers`) exists. |
| Unhandled request | `502` with `{error:"E2E_UNHANDLED_REQUEST"}`, recorded with `handled:false`. This includes `GET /api/v1/features`, which the studio handlers do not serve; the app falls back to default flags on that failure (`featuresSlice` rejected case). |

When the flag is unset, `--project=real-backend` fails with `Project(s) "real-backend" not found. Available projects: "msw"` (verified). In real-backend mode `start-servers.mjs` starts only Vite, whose existing `/api/v1` proxy targets `CHECKS_E2E_BACKEND_URL`; I verified the routing against a throwaway local HTTP server on 4179 (not the real backend, which I did not run): `/api/v1/studio/tests` reached it, and nothing listened on 4178. That scratch spec and server are removed.

## Files written

| Path | Action | sha256 |
|---|---|---|
| `frontend/playwright.config.ts` | new | `fe89cfbb0095a6c369301c3089e59596d8abc19478332ff1ab25024b077320f5` |
| `frontend/e2e/start-servers.mjs` | new | `00519a46b54b03cb1690c4ef4fad021d9ce296b8252225a1b8d876090fb734a6` |
| `frontend/e2e/mswProxy.ts` | new | `f431446dcd153813caeabe7b2ee2c1ead000c3268e9e0be32618049dbccf9aa4` |
| `frontend/e2e/tsconfig.json` | new | `bc68c8a1252a2c9b5c50b7f4c1aca44e996128ca0edea9392a0115e7d469e2a5` |
| `frontend/e2e/harness.spec.ts` | new | `798b4dda290486f7651a7eaff205932314632e8632d3fc534985fadc833b3e5d` |
| `frontend/e2e/fixtures/studio-run.webm` | new, generated (2578 bytes) | `702ef33bf8a516547716e0786e7a7ea360c5e2a8f41a4818a1bb86ab0115f8c8` |

The WebM is the base64 literal `MOCK_VIDEO_BASE64` in `src/services/mocks/studio/fixtures.ts`, decoded to bytes by a one-off script (EBML header `1a45dfa3`). It is the same recording the existing mock video handler serves, so the harness asserts that the served bytes equal this file. It holds no secret.

| Path | Action | sha256 before | sha256 after |
|---|---|---|---|
| `frontend/vitest.config.ts` | `exclude: [...configDefaults.exclude, 'e2e/**']` | `85aa86a7c2a13f6d1c9b4bfa7f15fb5420ca74691a3112a3da167b22e93f1404` (HEAD; the file was clean) | `a069bc64049c73e52583ef778d3a3637d1dc631e7cfa8c82aeaf2c7342fbc0e8` |
| `CLAUDE.md` | frontend lines 30-31, 40-41, 49-67 | `0d862e693a16d430e607efda5a73ec04fbac6659ead44d31e88826295809f6e7` | `2c2bd08ad1b9ee4833b440a92d7479991069708870e90ab9e5a54a33258c23d1` |
| `AGENTS.md` | same lines | `4e31c5e152494cd5e15235c55130b0e9d467b359231c13343f3202c3e7ba5ab9` | `848e102c199e0497ce006528b25c71396c34ed7490f0b822569b000b9bf17d43` |
| `README.md` | Quick Start frontend block | `970703f8b9a5fa72fcddb4caf2d559fde54e46af251023687b76ad2f75bdbddc` | `a3dd47fd5f9d3865b0f4bcad92154ca9c84b4b9e8c074628f9315b98f32fda1d` |
| `frontend/README.md` | Quick Start, `npm` to `pnpm` in env-var examples | `a89f7a00874b3945a7d991f12961c598c613d0dacaddb051c2d4b61a594ad423` | `8fe7c5df748f855189d5feb065bd6f96e3c400f7595fe51eb3e15f7911faccb4` |
| `ARCH.md` | lines 46-47 | `ab3220e90c0c670d4994465f5023eddf70a6d8113f9dba1f46b3fcec6f1a4cae` | `79a053edfc4dd9167baeea01358fda2ecde85c1abb042e366e3d2576f30d5c44` |
| `.cursor/rules/development.mdc` | line 14 | `61164b80b94c3225dd5733d34137105cccf3559158a03133f646433d7870f6c3` | `8424bf17256b8c70e8847be193059f10630d095d600dfbe8204828a27c1fcc6d` |
| `dev.sh` | frontend lines (install, `dev`, `vite`) | `c7c9ba5d32fca56cc4f3f2ab2251007e80c9df1c771bb41f8fcfacd3fa528b56` | `5b8def98be89fd84c0ede13fa7ea8c967a428defed12f3d594f0b960d02d61fb` |
| `MFE_GUIDE.md`, `.github/copilot-instructions.md`, `.cursor/rules.md` | not edited (classified, below) | unchanged | unchanged (same sha) |

`CLAUDE.md` and `AGENTS.md` were already modified in the tree (the "Accessibility Scope" section). I diffed the "Accessibility Scope" section (from its heading to "Code Quality") before and after: identical in both files. Every other changed line is in the frontend block.

## Verify rows (all run from the repo root or `frontend/` as written)

| # | Row | Result |
|---|---|---|
| V1 | `pnpm exec playwright test e2e/harness.spec.ts` | exit 0, 5 passed (about 7 s). Tests: fixture is a WebM and an unknown scenario is 400; zero service workers (no registration, no controller, `context.serviceWorkers()` empty, no JS served at `/mockServiceWorker.js`); unhandled request is 502 directly and through the app origin, and logged `handled:false`; `/checks/studio/tests` reaches `/api/v1/studio/tests` through `apiClient`, the proxy answers 200 from the handlers, and the first mock test name is rendered; WebM `200` equals the fixture, `Range: bytes=0-9` gives `206` with `Content-Range: bytes 0-9/2578` and the right 10 bytes, an out-of-range start gives `416`, all directly and via the app origin, then a real `<video>` in Chromium loads it (duration 6 s). Log: `logs/01-playwright-harness.log` |
| V2 | `vitest list \| grep -c "/e2e/"` | **The row as written is vacuous on this Vitest.** Vitest 1.6.1 has no `list` subcommand; `vitest list` starts a watch-mode run with the filter "list" (it ran two test files and never exited; I killed my own PIDs 97460, 97461, 97463, 97474). Its output has no `e2e` string, which proves nothing. Replacement check that can fail: `createVitest('test').globTestFiles()` against the real config. Result: 55 files collected, 0 under `/e2e/`. Same config with the `exclude` line removed (temporary copy, deleted): 56 files, including `e2e/harness.spec.ts`. So the exclude is what removes it. Log: `logs/02-vitest-collected-files.log` |
| V3 | `pnpm exec tsc -p e2e/tsconfig.json --noEmit` | exit 0, no output. `--listFilesOnly` shows it covers `e2e/mswProxy.ts`, `e2e/harness.spec.ts`, `playwright.config.ts`, and the `src` files they import |
| V4 | `pnpm exec vitest run src/components/providers/realStudioStartup.test.ts` | 1 file, 2 tests passed, run after the `dev.sh` edits |
| V5 | literal `grep -n "npm run\|npm install\|npm ci" ...` | 52 lines, but the pattern matches inside `pnpm run`/`pnpm install`, so the literal row cannot reach 0 once docs say pnpm. `logs/05-npm-grep.log` holds it. The word-boundary form `(^|[^p])npm (run\|install\|ci)` gives 11 lines (`logs/05b-npm-grep-word-boundary.log`), classified below |
| V6 | CI | `.github/workflows` does not exist. `.github/` holds `agents/` and `copilot-instructions.md` only. `find` to depth 3 found no `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml` or `.circleci`. **Finding: no CI workflow exists in this tree**, so nothing there installs or runs the frontend with npm or pnpm. `logs/06-ci-ls.log` |
| extra | `pnpm exec eslint e2e playwright.config.ts --ext .ts,.mjs` | exit 0 (the repo's `lint` script covers `src` only) |
| extra | `pnpm run lint` / `pnpm run type-check` | lint: 0 errors, 301 warnings (all `no-explicit-any`; U2 saw 302, L2a is editing `src`). type-check: exit 0 |

## Grep classification (word-boundary form, 11 lines)

| File:line | Command | Class | Action |
|---|---|---|---|
| `MFE_GUIDE.md:46,55,61,64,180` (+186 `npm start`) | `npm install`, `npm run build`, `type-check`, `build:dev` | Out of scope: the file is the Platform Shell guide (`put-platform-shell`, `put-core-components`), not this `frontend/`. `build:dev` is not a script here | not edited |
| `.github/copilot-instructions.md:39-40`, `.cursor/rules.md:26-27` | `npm run lint`, `npm run typecheck` | Out of scope: AIOX-generated text, identical to `.claude/CLAUDE.md` "Testing Requirements", no directory given. No root `lint`/`typecheck` script exists (root `package.json` has only `test`), and `frontend` names it `type-check`. Open question for root | not edited |
| `dev.sh:205` | `cd ../put-core-components && npm run build` | Out of scope: another repository | not edited |
| `dev.sh:357,358,361` | `npm ci`, `npm run build` in `studio-runner` | Out of scope: runner | not edited |

Frontend hits after the edit: 0.

## Facts checked in code before writing the docs

- `msw:init` is not a script in `frontend/package.json`; `frontend/public/` holds `config.js` and `index.html`; `realStudioStartup.test.ts` asserts that `public/mockServiceWorker.js` and `src/services/mocks/studio/browser.ts` do not exist, and that `bootstrap.tsx`, `ChecksModule.tsx`, `vite.config.ts`, `webpack.config.js` and `.env.development` contain no mock gate or `VITE_ENABLE_MSW`.
- MSW runs in Node in two places: `src/services/mocks/studio/server.ts` (`setupServer`, used by Vitest) and the new `e2e/mswProxy.ts`.
- The only `mockServiceWorker.js` reference in `src` is `utils/retireLegacyStudioWorker.ts`, which unregisters an old worker. The harness test asserts none exists.

## Behaviour notes

- Teardown noise: when Playwright stops `webServer`, Vite logs `Pre-transform error: The service was stopped` / `Internal server error: The service was stopped` (the esbuild child is stopped with the group while Vite still transforms). It appears only after the last test; it did not fail a run. I did not try to silence it.
- Ports 4177/4178/4179 had no listener after every run. I started and stopped only my own processes (the fake backend PID and the Playwright-launched servers, plus the 4 vitest PIDs above). I sent no signal to 22246, 44737, 13577 or 13581. A Chrome (PIDs 5083 and 5095, profile `checks-guided-*`) belongs to a studio-runner session, not to me; untouched.
- `playwright.config.ts` writes reports and traces under `frontend/node_modules/.cache/playwright-e2e/` so nothing reaches `git status`. `start-servers.mjs` uses its own Vite cache dir `node_modules/.cache/e2e-vite` so it does not collide with other dev servers on the same tree.
- `workers: 1`, `fullyParallel: false`: the proxy's mock state is one process's.
- 55 files collected now against the 56 in U2's baseline: I did not look into the missing file. L2a is deleting legacy test files in `src` (`git status` shows many `D`), which is my inference.

## Deviations and decisions

1. D1. `vitest list` row replaced by the globTestFiles check (V2). The literal row passes trivially and hangs.
2. D2. The literal npm grep cannot reach 0 because "npm run" is a substring of "pnpm run"; I used the word-boundary form.
3. D3. Docs: beyond npm to pnpm I corrected three wrong frontend commands that would not run under pnpm either: `npm run dev:fed` (no such script) became `pnpm run dev`, and "Standalone ... `npm run dev`" became `pnpm run dev:standalone` (in `CLAUDE.md`, `AGENTS.md` lines 30-31 and 40-41). `npx vite` in `dev.sh` became `pnpm exec vite`.
4. D4. `dev.sh` also gets a `command -v pnpm` prerequisite check and `pnpm install --frozen-lockfile`, so a missing pnpm fails with a clear message instead of a command error.
5. D5. `.github/copilot-instructions.md` and `.cursor/rules.md` are in the lane's `writes` but have no frontend-specific npm lines (see the table). Not edited.
6. D6. `frontend/README.md` still documents `VITE_ALLOW_INSECURE_MSW_FALLBACK` (an "inline API mock fallback when Service Worker cannot run"). `grep` finds that name nowhere in `frontend/src` or the config files, so the bullet looks stale and contradicts the new "no browser worker" note. I changed only its `npm start` to `pnpm start` and did not remove the bullet. Likewise `CLAUDE.md` "Mock-First Development" and `ARCH.md` ("Browser-intercepted API layer") still describe a browser interception. These are prose, not command lines; left for root.
7. D7. `e2e/start-servers.mjs` imports `process` explicitly so ESLint's `no-undef` is clean.

Nothing was committed, pushed or stashed. `.aiox-core/core/permissions/dispatch-governance.js`, `package.json` and `pnpm-lock.yaml` were not touched. No `pnpm install/add/remove` was run.
