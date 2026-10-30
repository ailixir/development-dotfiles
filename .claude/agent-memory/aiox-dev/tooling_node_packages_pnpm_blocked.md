---
name: tooling-node-packages-pnpm-blocked
description: pnpm exec is refused in frontend/ and studio-runner/ (packageManager npm); how to run vitest there without npm
metadata:
  type: project
---

`pnpm exec vitest ...` fails in `studio-runner/` (and `frontend/`) with "This project is configured to use npm", because `package.json` pins `"packageManager": "npm@..."`. Plans written by @architect still prescribe `pnpm exec`.

**Why:** the user's global rule is "pnpm, never npm", but these packages carry npm lockfiles and a packageManager pin, so pnpm refuses to run at all.

**How to apply:** call the local binary directly, which is neither npm nor pnpm and writes no lockfile:
- `./node_modules/.bin/vitest run <files>` (frontend)
- `./node_modules/.bin/vitest run <files> --coverage.enabled=false` (studio-runner: its config enforces per-directory coverage thresholds, so a single-file run otherwise "fails" on coverage even when every test passes)
- deployment tier: `./node_modules/.bin/vitest run --config vitest.deployment.config.ts <files> --coverage.enabled=false` (needs `helm` on PATH)
Report the substitution as a deviation from the plan's command.

Update 2026-10-04: in the `ui-studio` worktree's `frontend/`, `pnpm exec vitest` and `pnpm exec tsc` ran fine. Try pnpm first; fall back to the local binary only if it refuses.

Full FE suite (~760 tests, ~80s) has load-sensitive page/dialog tests that pass alone in 1–2.5s but exceed the 5s default under full-suite load. Fix with `userEvent.setup({delay:null})` + paste, and bound multi-phase page flows at 15s. Run the full suite at least twice before calling it green.

Update 2026-10-17 (W9): in `studio-runner/`, `pnpm --config.package-manager-strict=false run <script> [vitest args, no leading --]` works (prints a harmless "configured to use npm" WARN). `pnpm --version` inside the dir still errors. A pin change (`.nvmrc`/`engines`) turns `test/pins.test.ts` red (3 cases) until `node scripts/write-runtime-versions.mjs` regenerates `dist/runtime-versions.json`; that script changes only that file in dist (tree sha diff), so it is safe without a full build. Mutation-check recipe: python script that backs up each src file, string-replaces once (assert count==1), runs `./node_modules/.bin/vitest run <files> --coverage.enabled=false --reporter=json`, restores in `finally` and asserts sha equality.

Update 2026-10-17 (W9 D4): the unit tier does NOT re-emit `dist/` (`no-dynamic-evaluation` only emits if `dist/index.js` is missing), so after a `src/` edit its async-IIFE/provenance cases judge a stale dist; the fixtures tier's globalSetup does re-emit (also from a mutated source, so re-run a fixtures file after any fixtures-tier mutation check), and `pins.test.ts` then needs `write-runtime-versions.mjs` again (it hashes `dist/run/browser.js`). The IIFE regex `\(\s*async\s*\(\s*\)\s*=>` also matches `bounded(async () => ...)`: name the function. On macOS Chrome's argv shows the profile as `/private/var/folders/.../checks-guided-XXXX/browser-profile` (realpath, dir is `browser-profile`), so match both the written and resolved scratch path. `vi.useFakeTimers` + real fs works if you await a launcher-entered promise before advancing the clock.

Update 2026-10-27 (ADR-SC-007 WI-2 plan): in `studio-runner/` with `--config.package-manager-strict=false`, `pnpm exec vitest` works on the default Node 23, but `pnpm run <script>` fails ERR_PNPM_UNSUPPORTED_ENGINE (engines >=24.11 <25); put `~/.local/share/fnm/node-versions/v24.20.0/installation/bin` first on PATH. Baselines were red before any WI-2 edit: type-check 3 errors in untracked `test/evaluation/grounding-q-harness.test.ts`, lint 152 errors in untracked `evaluation/grounding/**/*.mjs` (spike). `no-dynamic-evaluation.test.ts` greps the existing `dist/`, so it cannot see new `src/` files unless dist is rebuilt (forbidden in that item): cover new modules with a source-grep test. The official `test:fixtures` globalSetup re-emits dist; use a scratch vitest config without it.
