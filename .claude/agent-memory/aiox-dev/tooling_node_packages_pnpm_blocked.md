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
