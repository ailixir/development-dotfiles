---
name: tooling-scratch-vitest-probe-outside-repo
description: Run a throwaway real-Chromium probe against studio-runner TS sources without touching the repo - vitest config and test in the scratchpad, symlinked node_modules, absolute imports
metadata:
  type: reference
---

To probe WI-2 modules (perceive, locatorSynth, playwrightEngine) at plan time without editing the repo or building dist:

1. In `$S/.../probe/`: `ln -sfn <repo>/studio-runner/node_modules node_modules`.
2. Config file there WITHOUT importing `vitest/config` (it cannot resolve from the scratchpad): `export default ({ root: '<repo>/studio-runner', server: { fs: { strict: false } }, test: { environment: 'node', include: ['<absolute probe dir>/p*.test.ts'], testTimeout: 60000, coverage: { enabled: false } } })`.
3. Tests import `/abs/path/to/studio-runner/src/run/perceive.ts` directly; `playwright` and `vitest` resolve through the symlink.
4. Run `./node_modules/.bin/vitest run --config <probe config> [filter]` from studio-runner with Node 24 first on PATH; grep stdout for `PROBE`.
Plain `node` probes of Playwright itself work with `createRequire('<repo>/studio-runner/package.json')('playwright')`. zsh does not word-split `$VAR`, so never put `env PATH=... node` in one variable.

**Why:** the default tier and fixtures tier have side effects (evidence rewrites, dist re-emit, `observationCollector.instrumented.meta.json` mtime); a probe outside the repo has none.

**How to apply:** any read-only measurement of runner modules; see [[tooling-scratch-copy-mutations-and-fixtures]] for the mutation variant.
