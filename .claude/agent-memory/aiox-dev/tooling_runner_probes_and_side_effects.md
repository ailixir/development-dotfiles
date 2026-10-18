---
name: tooling-runner-probes-and-side-effects
description: studio-runner timing probes outside test/** via `vitest run --root <scratch>`; observed-secret-control fixtures run overwrites OBS-007 oracle JSON
metadata:
  type: reference
---

- To run a throwaway timing probe against studio-runner `src/` without adding a file under `test/**` (other agents run the full suite), put `probe.test.ts` in the scratchpad and run `npx vitest run --root <scratchdir>` from `studio-runner/`. Import src by absolute path. A `--config` file in the scratchpad fails, because `vitest/config` can't be resolved from there.
- Every run of `test/fixtures-tier/observed-secret-control.test.ts` overwrites `docs/qa/evidence/STUDIO-OBS-007/runner-control-focus-candidate/oracle-<mode>.json` (pass or fail). Only the latest run's facts survive, so copy them per run if you need a series.
- The `lost-control-body` cutoff is `2000 - (revokedAt - nominal poll start) + deadline timer lateness`. Decompose it from `controls[last].started + timeoutMs` (= windowEnd).

Related: [[tooling-runner-tiers-coverage]]

Update 2026-10-13 (OBS-013 R13):
- A scratch-root probe file can `import '/abs/path/test/fixtures-tier/<file>.test.ts'` to run one fixtures-tier file in-process against real Chromium WITHOUT the fixtures config/globalSetup (no dist rebuild, no Gradle lock needed). Used as the SC-2 proof when the lead forbade the fixtures tier; report it as "probe", not "fixtures tier ran".
- While the C (contract) lane regenerates bundles, `src/guided/contracts.ts` throws `SCHEMA_CONFIGURATION` at module load (every guided test file fails at collect) and `pins.test.ts` reports "Observed packaged schema bundle is stale". Check `stat` mtimes of `src/guided/schemas.json` / `contracts/v3/*.json` and re-run a minute later before attributing.
