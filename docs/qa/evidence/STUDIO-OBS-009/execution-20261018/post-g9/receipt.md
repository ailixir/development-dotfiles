# 009 post-G9 batch (G9b input): receipt

Author: Dex (@dev), YOLO, 2026-10-18. No git commit/stash/push. `dispatch-governance.js` untouched. No docker build, no dist rebuild, no process signalled.
Marks: **[V]** I ran it or read it. **[I]** inference.

## Result in one line

All five patches applied cleanly, F1 and F2 test edits are in, runner type-check/lint/narrow units and the deployment tier are green except **3 `pins.test.ts` cases that fail only because `studio-runner/dist` is now stale**. **A dist rebuild IS needed** (root, `run-runner-build.py`). Backend narrow classes that do not read dist are green (145/145). `GuidedPlanningIntegrationTest`, `ObservedArtifactLowererTest` and the `GuidedPublicationReplayIT` budget-evidence methods were **not run**: they need the new dist.

## 1. Order applied

1. **F2** `GuidedServiceTransportFaultIT`: `runGuidedControllerCut` now polls on stage-file content (`readStageOrEmpty` helper beside it) instead of `Files.exists`, with the consumer diff of `g9-failures/diagnosis.md` section 2. Exactly the proposed diff, plus an `as(...)` message with `childAlive` only (value-free).
2. **F1** `GuidedPublicationReplayIT.awaitJoinedVideo`: the `video.status` assertion now carries `.as("video evidence for %s: video=%s, recording log lines=%s", ...)` and a new `recordingLogLines(JsonNode)` helper (lines starting `recording failed` or containing `recording was not stored`). Test only; no runner code. `video` is `{status,error,expiresAt,partial}`, value-free [V, `ExecutionSnapshotMapper`].
3. **Residue patches**, `git apply --check` then `git apply`, all exit 0 (`apply-check.txt`, `apply.txt`): `model-sizing.patch`, `catalog-entry.patch`, `consensus-plan-8.3.patch`. No re-cut was needed. The base hashes of every helm and deployment-test file matched the chart receipt's table [V].
4. **Chart**: `chart.patch` then `tests.patch` (both `--check` 0, apply 0), then Quinn's four AC-9a changes folded into `chart.test.ts`:
   - **(1) all value sets, ON and OFF.** Shared `policyNamed(names)` and `expectOnlyPolicyFile(names,label)` helpers (same regex as the old test). The ON `it.each(EACH)` asserts `['STUDIO_RUNNER_OBSERVED_POLICY_FILE']` exactly, in all four value sets; the OFF `it.each` asserts `[]` in dev, prod, default and UAT-with-flags-off. The UAT companion kept as the readable statement, now via the helper.
   - **(2) falsification.** New `it.each` over `STUDIO_RUNNER_OBSERVED_POLICY_ORIGINS` and `STUDIO_RUNNER_APPROVED_ORIGINS`: a real template mutation (`mutatedChart` on `studio-runner-deployment.yaml`, one extra env entry), renders UAT, the same read returns two names, `expectOnlyPolicyFile` throws, and the unmutated chart passes the same assertion. +2 cases.
   - **(3) old test: comment only.** Dated note added to the comment in `AC-9a — ADR-002 O-6`. Regex, `toBe(false)` and the title are unchanged, so no rename to reconcile.
   - **(4) canary.** `studio-runner/test/run/canary.test.ts` sha256 before and after both `3e5b08bf30445416d805d7fafae63acfbdbc969067c580c3f0e1b78c203a7e48` (byte-unchanged) [V]. The deployment test is not the O-6 proof on its own; the canary is.

## 2. Files: sha256 (first 16 hex) before and after

Full hashes: `sha-before.txt`, `sha-after2.txt`. Before = the tree after G9 and before my first edit.

| file | before | after | |
|---|---|---|---|
| `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedContracts.java` | a40f444255ec8ccc | 350a3f22f4cd9a5b | changed |
| `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionProperties.java` | 3732d860c1388108 | cc792aefee5fe3af | changed |
| `backend/src/main/resources/application.yml` | 8c7427ef9e53f341 | 271fac527d075f99 | changed |
| `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java` | 2ca7dc918c99ec81 | b8b10df42b739d07 | changed |
| `backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java` | 8cbc02074b7a2eb4 | 97162010003856cd | changed |
| `backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedDefaultModelReservationIT.java` | 22f144a5fc26f234 | be70c59ce219191c | changed |
| `backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningIntegrationTest.java` | 6407c66b746ffa03 | e4bb59c270a23cf7 | changed |
| `docs/specs/studio-observed-authoring/consensus-plan.md` | 8533a334271403ac | 50d3ec86728f97ef | changed |
| `docs/specs/studio-observed-authoring/contracts/v3/limits.schema.json` | f6e4bba01ee38ee2 | 736791305cf68723 | changed |
| `docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json` | 861619da6c311836 | c573e50bb3fb6cbf | changed |
| `helm-chart/put-checks/templates/_helpers.tpl` | ecf26fc7d6302a5c | 976cc0e8cd9a9724 | changed |
| `helm-chart/put-checks/templates/configmap.yaml` | 313cc206956c20af | 6ea290fb3b98d582 | changed |
| `helm-chart/put-checks/templates/deployment.yaml` | 48e4b93212714a35 | 9f7fda6a66f57587 | changed |
| `helm-chart/put-checks/templates/studio-runner-deployment.yaml` | bbd9b293f2fd2726 | aa4a96d5922f6a01 | changed |
| `helm-chart/put-checks/values-uat.yaml` | 6e3f91478666e446 | 7cb2ef4aaa5a61f3 | changed |
| `helm-chart/put-checks/values.yaml` | 74c76c7ddca34972 | 51c680d4ff1863c4 | changed |
| `studio-runner/Dockerfile` | ff83628eac5d619c | 70881264ddda3a7f | changed |
| `studio-runner/evaluation/README.md` | 53daf1babe06fd18 | fcf738f8899d5925 | changed |
| `studio-runner/evaluation/cli.mjs` | a9fe8a775f90f85a | ec074937ae648792 | changed |
| `studio-runner/evaluation/observed-authoring/evaluate.d.mts` | 1dfd56c5deff2e7f | e202c36be92007fd | changed |
| `studio-runner/evaluation/observed-authoring/evaluate.mjs` | 29c47788cd1bf615 | 2eb26bc99542c2e4 | changed |
| `studio-runner/scripts/print-observed-catalog.d.mts` | (absent) | cf3eeeba4d9b7454 | new file |
| `studio-runner/scripts/print-observed-catalog.mjs` | (absent) | cc954c63ae34d7c2 | new file |
| `studio-runner/src/guided/schemas.json` | 8d21a51550084780 | 11aa8b5001f3aa60 | changed |
| `studio-runner/src/validator/observedSchemas.json` | 357f6c428f6b85c4 | 42a804fc6216aaaa | changed |
| `studio-runner/test/deployment/backend-env.test.ts` | 7c396f8bba48aac7 | 925e0bfd589ada54 | changed |
| `studio-runner/test/deployment/chart.test.ts` | e6b666c81b20c6c4 | df34bc91f2e4b863 | changed |
| `studio-runner/test/deployment/envfrom-keys.test.ts` | bf6cd992771152e0 | 87b82dbb8186fbf0 | changed |
| `studio-runner/test/deployment/helm.ts` | c3fa17d92f0f27ab | 0a3a32b68b4276bc | changed |
| `studio-runner/test/evaluation/budgetAdmission.test.ts` | 737ad64889b762a0 | 0217f2b5230ad5a8 | changed |
| `studio-runner/test/print-observed-catalog.test.ts` | (absent) | bc22c3278634c072 | new file |
| `studio-runner/test/run/canary.test.ts` | 3e5b08bf30445416 | 3e5b08bf30445416 | unchanged |

`print-observed-catalog.test.ts`: sha after the patch and before my lint fix was `bf1adae83e636d06`.

## 3. Regeneration and pins [V]

| command | exit | result |
|---|---|---|
| `node tools/build-studio-observed-schemas.cjs --check` (N24) | 0 | `Verified v3: 25 guided schemas, 32 replay schemas; four byte-identical outputs.` No regeneration was needed; the patch's bundles are generator output. |
| `node dex-prep/epoch-probe.cjs docs/specs/.../contracts/v3` | 0 | `session` = `dace2f2b…476b` = the constant in `GuidedContracts` (line 118). `replay-validation` `21d620f3…`, `ledger` `b1a71bd5…`, `observation` `9be57abe…` equal the unchanged Java constants (grep). |
| `node tools/check-studio-observed-contracts.cjs` | 0 | all PASS lines, including codegen, snapshot correction, retained Execute. |
| `node tools/check-studio-current-catalog.cjs` | 0 | `PASS_CURRENT_PACKAGED_CATALOG`; `canonicalSchemaBundleHash` `3dbdfdfb…`. |
| `node studio-runner/scripts/check-pins.mjs` | 1 | `Observed packaged schema bundle is stale.` **dist** `runtime-versions.json` still has `observedSchemaBundleHash` `efaf885e…`; src is now `3dbdfdfb…`. |
| `find studio-runner/src -newer studio-runner/dist/main.js` | | `src/validator/observedSchemas.json`, `src/guided/schemas.json`, so `verifyRunnerDist` would also fail. |

## 4. Commands, exit codes, counts

| # | command | exit | counts |
|---|---|---|---|
| 1 | runner `pnpm --config.package-manager-strict=false exec tsc -p tsconfig.json --noEmit` | 0 | 0 diagnostics (run twice, last after the lint fix; `typecheck.log`, `typecheck2.log`) |
| 2 | runner `... exec eslint .` (first) | 1 | 4 `no-confusing-void-expression` errors, all in the new `test/print-observed-catalog.test.ts` (the apply notes had flagged eslint as unrun) (`lint.log`) |
| 3 | `eslint --fix test/print-observed-catalog.test.ts`, then `eslint .` x2 | 0 | clean (`lint2.log`, `lint3.log`). Fix = braces around four arrow shorthands, no behaviour change. |
| 4 | runner vitest, 12 files: print-observed-catalog, generated-contracts, observedV3TupleValidation, observedReplayValidation, observedIncrementalValidation, schemaSemantics, runtime-versions, pins, no-dynamic-evaluation, test/evaluation, contract-integrity, deployment-tier-wiring (`--coverage.enabled=false --maxWorkers=2`) | 1 | **557 passed, 3 failed** of 560 (`runner-unit-narrow.log`). The 3 failures are all `test/pins.test.ts`: "passes: every copy agrees", "exits zero", "emits a machine-readable report with --json". Cause: the stale-dist pin above, reproduced by running `check-pins.mjs` directly. [I] They return to green after the rebuild; not re-run. |
| 5 | catalog script coverage (`print-observed-catalog.test.ts`, coverage on, scratch report dir) | 1 (global thresholds on a 1-file run) | 34/34 pass; `print-observed-catalog.mjs` 100% stmts/lines/funcs, 98.96% branches (`catalog-coverage.log`) |
| 6 | deployment tier, `STUDIO_RUNNER_IMAGE=put-checks-studio-runner:obs009-g9-local`, `run-runner.py obs009-post-1 ... vitest run --config vitest.deployment.config.ts --maxWorkers=1`; helm v4.2.0 | 0 | **642 passed, 0 failed** (61 test suites). G9's `deploy02` was 581. +61 = 59 chart cases + my 2 falsifications. sourceStable true, distStable true, dist digest `4add1307…` (`execution/obs009-post-1-results.json`) |
| 7 | backend `./gradlew --no-daemon spotlessCheck checkstyleMain checkstyleTest --continue` under the lock (`gradle-checks-obs009-post-3.log`) | 0 | BUILD SUCCESSFUL in 26 s. `spotlessApply` was not needed: gjf 1.22 CLI (`--skip-reflowing-long-strings`) shows 0 diff lines on all six edited Java files, and repo-wide `spotlessCheck` passes (the ReplayIT is gjf-clean now). Main and test compile. |
| 8 | collector `obs009-post-2`, 9 selectors, no dist-bound class | 0 | **140/140 pass, 0 skipped**: GuidedServiceTransportFaultIT 2 (the two cut tests), GuidedWireContractTest 18, GuidedSessionIT 44, GuidedCsiBudgetIT 5, GuidedPublicationMigrationTest 12, ObservedProfileDriftTest 4, GuidedReplayingPrefixMigrationIT 55 |
| 9 | collector `obs009-post-4`, `...guided.session.GuidedDefaultModelReservationIT` | 0 | **5/5 pass** (4 old + the new B7 13-proposal test) |

Lock waits: 652.6 s behind QA's C10 for run 8, none for run 9. Gradle always `--no-daemon` through `with-gradle-lock.py`. Scripts: `gradle-hold-1.sh`, `gradle-hold-2.sh`.

## 5. What failed or did not run

- **FAILED (stale dist, expected):** 3 cases in `studio-runner/test/pins.test.ts` (row 4). Not a defect in the patches.
- **Mistake of mine, corrected:** in run 8 I used `guided.translation.GuidedDefaultModelReservationIT` as the selector. The file sits in `translation/` but its `package` line is `guided.session`, so Gradle matched nothing and the collector said 140, not 145. Row 9 reran it with the right name.
- **NOT RUN, needs the rebuilt dist** (hard rule: I did not rebuild):
  - `GuidedPlanningIntegrationTest` (in `runnerSpawningTestClasses`, so `verifyRunnerDist` would fail first; it compiles, since `compileTestJava` ran in rows 7-9) with its `outputCeiling` change;
  - `ObservedArtifactLowererTest` (reads `dist/runtime-versions.json` and the dist validator);
  - the dist-bound `GuidedPublicationReplayIT` budget-evidence methods (`derivedProductionCeiling`), and the F1 diagnostic has never fired (it only prints on a failure);
  - runner `test/guided` and the fixtures tier, per the apply notes;
  - the 3 `pins` cases above.
- **NOT RUN, not asked:** the F2 scratch-copy mutation proof from the diagnosis (`Thread.sleep(300)` between `createFile` and `writeString`). Row 8 shows the two cut tests green after the fix; a green rerun alone does not prove the race (diagnosis section 4A). [I] The fix is the same shape as the race-free sibling `ObservedResolverProcessCrashIT.awaitStage`.
- **NOT DONE (not in this batch):** the two `admission-record` ledger appends (apply notes section 4), docs pointers (@po), rollout (@devops), image build and the real `print-observed-catalog` run inside an image.
- **Not verified:** Helm version CI uses (local v4.2.0); the new chart cases were green on first run, no assertion surprises.

## 6. For root

1. **Dist rebuild: YES.** `src/guided/schemas.json` and `src/validator/observedSchemas.json` changed (limits 262144/32000 -> 1572864/786432 max and 786432/98304 default). Run `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-runner-build.py` once. After it, rerun in this order: `pins.test.ts`, runner `test/guided`, the fixtures tier, then under the lock `GuidedPlanningIntegrationTest`, `ObservedArtifactLowererTest` and the ReplayIT lane.
2. **Dockerfile changed** (one `COPY` of `scripts/print-observed-catalog.mjs`), so every runner image digest moves. The deployment tier above used the existing `obs009-g9-local` image, which does not contain that file; no test of this batch needs it in the image. Image build and catalog generation are yours or @devops'.
3. The new catalog entry's `build.schemaBundleHash` must be generated from the **rebuilt** dist.
4. The helm contents moved (`chart.patch`), so the 010 live-surface list needs its chart categories re-measured, and the source digest moved for any "reuse the G9 run" claim (Quinn's note section 5).
5. The F2 fix also removes the same latent race from the sibling `...BeforeResolution...` test (same marker protocol); it passed in row 8.
