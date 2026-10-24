---
name: runner-dist-pin-binding
description: How the real-stack71 visual cases bind studio-runner/dist (160 pins in A, parent-409 origin), and the pnpm/Node 24 build gotchas for studio-runner
metadata:
  type: project
---

The visual case runner is launched as `node dist/main.js` (cwd `studio-runner`), bound only by pins: `config-pins.private.json` (A) `externalFiles` holds 160 `studio-runner/dist` pins (78 .js, 78 .d.ts, 4 .json; no src, node_modules, package.json, .map). They originate from the immutable parent-409 pins copied by the ECDC binder (`bind43x-source-and-code-resources.py`, which asserts live bytes == parent pin) and are re-checked by the sealer and by `setup_go()` on every `launch.py` call.

**Why:** a rebuilt runner file (guided-login fix, case431 -> 432, observationCollector.js) breaks the binder/sealer/launch unless the pin is superseded; the parent cannot be edited, so case432 uses an explicit `RUNNER_FIX_OVERRIDE` hunk in the binder plus `runnerFixOverrides` in `fresh432-context.json` (plan: `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-049/devops-case432-plan/PLAN.md`).

**How to apply:** before any new case, compare live dist hashes to the last A's external pins (`preflight432.py`-style); rebuild only under Node v24.20.0 (fnm path) because `dist/runtime-versions.json` records `node` and is pinned. `studio-runner/package.json` says `packageManager: npm@11.3.0`, so plain `pnpm --dir studio-runner build` fails ("configured to use npm"); use `pnpm --config.package-manager-strict=false` (verified for `exec`, `run build` inferred). Scratch compile with `node node_modules/typescript/bin/tsc -p tsconfig.build.json --outDir <tmp>` reproduces dist byte-for-byte (exclude `.js.map`).
