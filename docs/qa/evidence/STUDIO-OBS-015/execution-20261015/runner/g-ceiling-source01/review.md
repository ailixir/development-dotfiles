# G ceiling source change, runner lane (STUDIO-OBS-015, aria-g-ruling01)

- **Author:** Dex-R (@dev, runner lane).
- **Date:** 2026-10-16 (America/New_York local, ~00:20-00:35).
- **Ruling applied:** `../../backend/r1-diagnosis01/aria-g-ruling01/ruling.md`, option (2), sections 4.1, 4.2, 4.3, 4.5 and 4.6.
- **Scope I kept to:** `studio-runner/` and `helm-chart/put-checks/values.yaml`. I did not touch `backend/`, I ran no Gradle, and I made no commit. I did not revert any other lane's dirty file. `package-lock.json` and every lockfile are unchanged.
- **QA credit:** none is claimed. The joined `guidedIncrementalTest` proof (ruling section 5.3) is still owed by the backend lane against the rebuilt dist.

## 1. Changes (sha256 before → after; full list in `sha256-before.txt` / `sha256-after.txt`)

| File | Change | sha256 before → after |
|---|---|---|
| `studio-runner/src/server/config.ts` | `MAX_STEP_TIMEOUT_MS` changed to `fallback: 120_000`, `min: 120_000`. Added the ruling's comment above the key. Rewrote the `maxStepTimeoutMs` field doc (it no longer says "30 s" or "clamped"; it now says refused, never clamped, and that the loader refuses a lower value). `stepTimeoutMs` (the 30 s default) is unchanged | `a5ce65a4…cfa8a` → `613f9bc2…f9745` |
| `helm-chart/put-checks/values.yaml` | Added `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS: "120000"` with the ruling's one-line comment, after `MAX_TOTAL_RUNTIME_MS`. No template change: the key is already on `acceptedEnvKeys` | `b1eabf55…a748` → `03d34de9…abb4` |
| `studio-runner/test/server/stepTimeoutCeiling.test.ts` | **New** file with 5 tests: (a) the default is 120 000; (b) ×2, the ceiling equals `timeoutSeconds.maximum × 1000` read from `src/validator/observedSchemas.json` at `replay-profile.Configuration` and at `revision.TestConfig`; (c) `119999` throws `ConfigurationError` with the problem `STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS must be >= 120000; got 119999.`; (d) `120000` is accepted | (new) → `ade0018d…0dc` |
| `studio-runner/test/server/observedReplayAdmission.test.ts` | `controlWindowJob(origin, build, timeoutSeconds = 10)` now drives both `configuration.timeoutSeconds` and `runtime.stepTimeoutMs`; existing callers are unchanged. Added `it.each([30, 31, 120])`: under the default config each case returns `503 ADMISSION_NOT_ACKNOWLEDGED`, with `sends === 1` and `launches === 0` | `3a355a52…275d` → `e13e70f9…bc1` |
| `studio-runner/test/deployment/chart.test.ts` | New describe block "STUDIO-OBS-015 G", modelled on 10.32 AC-5. All 4 value sets render `"120000"`. All 4 rendered envs pass `loadConfig` with `maxStepTimeoutMs === 120000`. Falsification: a `--set-string …=30000` override renders `"30000"` and `loadConfig` throws `ConfigurationError` | `b33ee122…7aaa` → `7667053c…6bc1` |
| `studio-runner/README.md` | Budgets table: added the ruling's **Step** row | `153c6d79…c26c5` → `d41ffac2…ff90` |

Unchanged, as the ruling requires: `runCoordinator.ts:999`, `deadline.ts`, `validator/observedReplay.ts`, every schema, backend, and `docs/stories/10.13.story.md`.

## 2. Other places that hardcode a 30 s maximum (grep sweep)

I searched the repo (excluding `node_modules`, `dist`, `docs/qa`, `.aiox`) for `MAX_STEP_TIMEOUT|maxStepTimeout`, and for step/per-step timeout mentions within reach of `30 s|30 seconds|30000|30_000|30 000|maximum|ceiling|cap`. Results:

| Location | What it says | Action |
|---|---|---|
| `docs/stories/10.13.story.md:206` | "`STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS` (30 s)" | **Not edited.** It is history, and ruling section 4.5 says to leave it |
| `docs/architecture/studio-execution.md` §5.2 | "Default step timeout is 30 seconds … configurable within server limits" | Not edited: this is the **default**, not the maximum, and it is still correct |
| `docs/specs/studio-observed-authoring/publication-contracts.md` C7 | "capped by existing ordinary per-step maximum (refuse …)" | Not edited: it names no number |
| `backend/…/StudioExecutionProperties.java:23`, `backend/src/main/resources/application.yml:291-292` | Quote the §5.2 default of 30 s | Not edited: it is the default, and backend is outside my lane |
| `docs/runbooks/studio-runner.md` | Never mentions the step ceiling (`:87` lets operators change enumerated keys in general) | Not edited (no number). Inferred: a later runbook note that this key cannot be set below 120000 would help operators. That is not in the ruling, so I left it |
| `.env*` / `*.example` / compose files | No step-timeout keys | None to change |

So the only places that hardcoded the 30 s ceiling were the runner `KEY_SPECS` (fixed) and the 10.13 history line (left on purpose).

## 3. Verification (what I ran, in order, and what it returned)

**Package manager.** Plain `pnpm run <script>` refuses to run in this package (`ERROR This project is configured to use npm`, from `packageManager: npm@11.3.0`). I therefore ran every script as `pnpm --config.package-manager-strict=false run <script>`. That prints only a warning. It installs nothing and writes no lockfile (`git status` on the lockfiles is clean).

1. **Red-before (no-credit evidence), `red-before.log`.** I set `config.ts` back to `fallback: 30_000, min: 1` for this run only, then restored it. Afterwards the sha matched the edited file, `613f9bc2…`. Result: `6 failed | 18 passed`.
   - 31 s and 120 s: `expected { status: 400, code: 'LIMIT_EXCEEDED' } to deeply equal { status: 503, … }`.
   - 30 s passed.
   - Ceiling tests (a), (b)×2 and (c) failed; (d) passed.
   - The tests discriminate.
2. **`type-check` (`type.log`).** Exit 0.
3. **`lint`, full `eslint .` (`lint-full.log`).** Exit 1, **112 errors, all in 12 files I did not touch**:
   - `src/executor/observedOperations.ts`, `src/guided/types.ts` (`no-empty-object-type`);
   - `test/fixtures-tier/{browser-profile-safety,guided-dataflow,guided-recording,observed-bootstrap-refusal,observed-secret-control}.test.ts`;
   - `test/observedV3TupleValidation.test.ts`;
   - `test/run/{childRuntimeTeardown,launcher,observedReplayProtocol}.test.ts`;
   - `test/runtime-versions.test.ts`.

   The first full run also flagged 1 `dot-notation` error in my new test. I fixed it, and the count went from 113 to 112. **Changed-file lint** (`lint-changed.log`), `./node_modules/.bin/eslint` over my 4 TS files: exit 0, no output.

   Inferred, not proven: the 112 errors predate this change. They sit in files whose mtimes are 2026-10-10..15, and none of them imports anything I changed beyond numeric config. I have no green full-lint baseline to compare against: earlier lane lint logs are empty files, so I cannot tell what scope they covered.
4. **Focused unit tests (`focused.log`, `--coverage.enabled=false`).** Files: `stepTimeoutCeiling`, `observedReplayAdmission`, `run/deadline`, `server/observedReplayRoutes`, `server/concurrency`, `run/production-seams`. Result: **6 files, 72 passed, 0 failed**.
   - All 8 new cases pass (5 ceiling and 3 admission).
   - Without `--coverage.enabled=false`, a filtered run exits 1 only on global coverage thresholds. That is expected for a subset.
5. **Chart tests (deployment config, helm-only, `-t` filtered; `chart-focused.log`).** Filter: `STUDIO-OBS-015 G | every rendered key | has helm | story 10.32 AC-5`. Result: **18 passed, 101 skipped by the filter, 0 failed**. This includes all 9 new G cases and the existing `ACCEPTED_KEYS` equality ("every rendered key is one the runner accepts"). Helm is at `/opt/homebrew/bin/helm`. I did not run the image-dependent cases.
6. **`backend-env.test.ts -t "own loader accepts the environment"` (`backend-env-loader.log`).** **4 passed, 0 failed.** The rendered env of all four value sets still loads with the new floor.
7. **Full default runner unit suite (`unit-full.log`, `unit-full-vitest.json`).** Command: `pnpm … run test` with the default config, no filters, coverage thresholds on. Exit 0.
   - Test files: **104 passed, 1 skipped**.
   - Tests: **2214 passed / 0 failed / 29 skipped (2243 total)**.
   - Against the 2206 / 0 / 29 baseline: +8 passing, exactly the 8 new unit cases. Skips are unchanged.
8. **`build` (`build.log`).** Exit 0. `dist/server/config.js:234-240` now reads `fallback: 120_000, min: 120_000`.
9. **`check:pins` (`pins.log`).** Exit 0.

## 4. Dist

- Method: `.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py`, run before the edits (`capture-before.json`) and after the build (`capture-after.json`). HEAD is `734ad704f` both times.
- **Dist digest, before → after:** `db6c8022b20113c73862b63a9f019b5026d37e0a4e3db1b15ac182f5c99e4775` → `972ccf7b6a8d880b1f31cd156e54f69bb54b8bac52250eefee77e99f79cae1cc`.
- **Dist files changed (3):** `server/config.js` (`3084e0e4…bedf` → `394e0f8c…3cd1`), `server/config.d.ts`, `server/config.js.map`. Nothing else in dist changed, so before this build the dist already matched every other lane's current source.
- **Source digest (capture-manifest scope):** `ff0d0600…df791` (1638 files) → `c131c0aa…9be6` (1639 files). The 5 runner paths in section 1 changed. Helm is outside that script's scope and is recorded in `sha256-*.txt`.
- The coordinator should treat this dist as the one the backend joined `guidedIncrementalTest` (ruling section 5.3) must boot. Any later runner/dist lane rebuild has to be serialized after it.

## 5. Open

- The ruling section 5.3 joined proof (config = 31 learns at k = 1 and its ordinary replay is admitted and PASSES) has not run. It belongs to the backend lane.
- The image-dependent deployment cases in `chart.test.ts`, and the rest of that file, were not run.
- The 112 full-lint errors in untouched files are outside this change. Some lane needs to own them before a full-lint gate can pass.
