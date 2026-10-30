---
name: tooling-v8-precise-coverage-in-vitest
description: Measuring block coverage of a committed CJS copy from inside a vitest test with node:inspector; why it silently returns function-level data and the fix
metadata:
  type: project
---

`Profiler.takePreciseCoverage` inside a vitest worker returns `isBlockCoverage:false` (one range, no uncovered blocks) for a script whose source V8 already compiled earlier in the process: the compilation cache hands back the same SharedFunctionInfo. Symptoms: removing vectors does not make the coverage assertion fail.

**How to apply (ADR-SC-007 WI-2, `test/run/goldenGateVectors.test.ts`):**
- compile the copy as a NEW script: `new Module(path)._compile(source + marker, path)` where the marker is a unique `module.exports.coverageRunMarker<N>x<time> = function coverageRunMarker<N>x<time>() {}`; `node:vm` is lint-banned, `Module._compile` is not.
- pick the script entry that contains the marker function name, NOT by URL: the extractor may have loaded the same file as an ES import (file: URL, a second entry), and with vitest coverage ON there are two entries.
- the first inspector session in a process works; start/stop of later sessions degrade the same way (use one session per test file).
- do not call `stopPreciseCoverage` (it would also stop vitest's own coverage); one `takePreciseCoverage` at the end.
- mutate-check it: delete synthetic vectors and see an uncovered range reported.

Related: [[tooling-fe-vitest-node22-vs-24]] is unrelated; the vitest gotchas for studio-runner are in [[tooling-node-packages-pnpm-blocked]].
