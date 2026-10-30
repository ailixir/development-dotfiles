---
name: reference-integrated-gate-scratch-recipe
description: How to run the full backend `check` plus runner/frontend/helm tiers for ui-studio in a scratch copy without touching the live tree (what to copy, timings, gotchas)
metadata:
  type: reference
---

Recipe used for the final integrated gate on 2026-10-26 (verified working, backend `check` BUILD SUCCESSFUL).

- Scratch copy: `rsync -a` the repo into the scratchpad, excluding `.git`, `docs/qa`, `node_modules`, `backend/build`, `backend/.gradle`, `.aiox`, `fullcur`. Then copy back root `node_modules` (the `tools/check-studio-*.cjs` need `ajv`), `frontend/node_modules`, and keep `studio-runner/node_modules` (real copy, not a symlink). Add `docs/qa` with media and files over 3 MB excluded; backend tests read some `docs/qa/evidence/...` fixtures. Remove the scratch afterwards (it is about 13 GB because of 190k small files in docs/qa).
- In a full scratch copy no Gradle init-script or `--project-cache-dir` is needed: the scratch has its own `backend/build`, so the hard-coded `file("build/guard-tally/...")` in `build.gradle.kts` stays consistent. Run `./gradlew check --offline --continue --console=plain`.
- Rebuild the dist first in the scratch (`rm -rf dist; npx tsc -p tsconfig.build.json && node scripts/write-runtime-versions.mjs && node scripts/check-pins.mjs`, Node 24.20) so `verifyRunnerDist` passes, then `diff -r` against live `studio-runner/dist`.
- Backend `check` took 1h53m on this machine (test lane about 80 min, guidedIncrementalTest about 30 min). Do not run other heavy work concurrently. The log's "FAILED" grep hits test display names ("AC-7 — FAILED answers 404"); read the XML counts instead.
- Runner deployment tier needs a built image: `docker build -t put-checks-studio-runner:<tag> studio-runner/` (cached, seconds) and `STUDIO_RUNNER_IMAGE=<tag>`; without it 6 tests fail by design. Remove the tag afterwards.
- `values-uat.yaml` does not render alone (needs observed catalog + guided token overlays + controller pin); copy the overlays from `studio-runner/test/deployment/helm.ts`. `studioNavigation.allowedDomains` is a list (`--set 'x={a.com,b.com}'`), wildcards rejected.
- To prove a red is pre-existing, `git archive HEAD studio-runner docs/specs/...` into a separate scratch dir, add `node_modules` (runner + root) and run the single test. On macOS `sed -i ''` is required.

Related: [[reference-isolated-gradle-recipe]] (user memory, for the shared live worktree).
