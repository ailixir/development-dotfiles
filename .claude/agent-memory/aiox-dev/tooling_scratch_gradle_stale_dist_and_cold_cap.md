---
name: tooling-scratch-gradle-stale-dist-and-cold-cap
description: Scratch-backend Gradle runs (r067 Candidate B) - verifyRunnerDist stale refusal, wildcard selects it, cold-JVM trips a 1 s call cap, BSD sed -i
metadata:
  type: project
---

From round 067 (2026-10-23), running focused backend tests in an rsync scratch copy without the Gradle lock:

- `./gradlew --offline test` works in the scratch backend with JDK 21; it needs `studio-runner/` beside `backend/` only for `verifyRunnerDist`. The real tree's `studio-runner/dist/main.js` was OLDER than `src/guided/runtime.ts` (another lane edits src), so the check refuses. Use `-x verifyRunnerDist` and record that the stale dist was used. Any `*` in `--tests` selects the check; a FQCN does not.
- IT classes under `guided/translation/` can be in package `guided.session` (FQCN uses the package, not the dir).
- A real `callTimeout` of 1 s in a WireMock test fails an instant 429 on a cold JVM (4/5 solo runs): the cap also covers post-header class loading. Use a 2 s cap plus a throwaway warm-up exchange (then `wire.resetAll()`).
- Checkstyle `WhitespaceAround` rejects gjf's `() -> {}`; use a method reference to a private no-op method.
- macOS: `sed -i ''` needs the empty suffix; `ls --time-style` does not exist.
- Mutation recipe: a script that edits one anchored string, runs the one IT class, copies the saved file back, and diffs to prove restoration.

**How to apply:** any scratch-tree backend verification. Related: [[tooling-scratch-tree-staged-unit]], [[tooling-verify-runner-dist-wildcard]].
