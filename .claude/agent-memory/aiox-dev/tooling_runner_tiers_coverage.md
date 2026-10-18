---
name: tooling-runner-tiers-coverage
description: studio-runner Vitest tiers — coverage table vanishes when any file fails; CLI coverage.exclude replaces config; guidedMain run by no runner tier; fixtures rebuild shared dist; load-flake list
metadata:
  type: project
---

In `studio-runner/`, the default tier prints no coverage table and checks no threshold when any test file fails (Vitest `coverage.reportOnFailure` defaults to false). To measure coverage while someone else's file is red, run `./node_modules/.bin/vitest run --exclude <that file>` and say so.

**Why:** in STUDIO-OBS-012A (2026-10-12) Lane C's `test/contract.test.ts` was red, and the full run looked like it had no coverage problem. Excluding that file showed `src/run/**` at 77.77% against an 85% gate. The gate had only passed because the deleted `playwrightAdapter.ts` was well covered, and `src/run/browser.ts` (the only Playwright importer) cannot run in the unit tier.

**How to apply:**
- Before calling the runner default tier green, check that the log contains a coverage table.
- The fixtures tier (`--config vitest.fixtures.config.ts`, about 6 min) rewrites untracked files under `docs/qa/evidence/STUDIO-OBS-007/` on every run. Report that.
- Under full-tier load these two cases fail intermittently, while the code paths behind them are unchanged:
  - `observed-secret-control` lost-control-body (cutoff ≤2000 ms bound)
  - `observed-bootstrap-video` normal-failure
- Run each tier at least twice, and rerun failures in isolation, before attributing them.

Related: [[tooling-node-packages-pnpm-blocked]], [[tooling-deletions-and-baselines]].

Update 2026-10-13 (012A runner-gates lane):
- Measuring coverage "without the config exclusion": `vitest run --coverage.exclude='**/*.d.ts' --coverage.exclude='**/*.d.mts'` REPLACES the config array (the excluded files then show up in the table). Add `--coverage.reportsDirectory=<scratch>` so `coverage/` is not clobbered.
- `src/run/guidedMain.ts` is executed by NO runner tier. Only backend guided ITs (GuidedBridge/GuidedPlanning/GuidedPublicationReplayIT) spawn `dist/run/guidedMain.js`. The fixtures tier imports `startChild` via wrapper .mjs files, so child.ts's own entry block never runs.
- The fixtures globalSetup rebuilds `dist/`, while backend guided ITs in other sessions spawn from that same `dist/`. Check `ps` for `p3-guided-launch-counter`/guidedMain before running the fixtures tier.
- More load flakes (all passed 3/3 isolated): fixtures `browser-profile-safety` redirected-Default (EEXIST in the test's own symlink injection), `observed-bootstrap-process-tree` ready-received-stop (one dark pre-paint frame 0). Unit: `observationCollector{Invoke,Naming}`, `server/hung-child`. A failed red-frame test writes NEW files `STUDIO-OBS-007/runner-peer-repair-native-red-<phase>.*`.
- To find the pre-012A source of a runner file, match its sha256 from `baseline-runner/source-hashes.json` against `sources.zip` files under `docs/qa/evidence/STUDIO-OBS-007/`.

Update 2026-10-13 (runner-gates-final): to hold the Gradle lock across a whole runner session, use a background holder script that does gradle-locked.sh's mkdir+pid+owner, then polls for a STOP marker, with trap 'rm -rf' and a max lifetime. Run the gates from separate Bash calls and `touch STOP` to release. With the lock held and no backend IT running, every tier was green on the first try (fixtures 2/2, secret-control 10/10), so the earlier flakes look load- and concurrency-driven (inferred).
