# STUDIO-OBS-009 D2: @qa local-validation record (G9 + G9b + planning fix, 2026-10-18)

**This record is not a verdict and not a gate decision.** `isVerdict: false`. `storyStatusChange: none`. `doneClaimed: false`. No PASS, CONCERNS, FAIL or WAIVED is used as a QA outcome here; the one waiver it cites is the user's. The 009 QA Results section is untouched.

- **Author:** Quinn (@qa), 2026-10-18. Supersedes the G9 draft (trigger NOT_MET pending G9b), preserved unchanged as `qa-local-validation-record.g9-notmet.{md,json}` in this folder. Machine form: `qa-local-validation-record.json`.
- **Inputs:** G9 (`obs009-g9-check01`, source `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b`) plus C4b and C10; the post-G9 writer batch (`X/post-g9/receipt.md`); G9b (`local-gate-20261018b/`, source `fd793c9561bfa86d3046abd9791c6da231546f309e7e920a569792deb5afcb67`, `status.txt` G9B-DONE); the user's C8 decision (`X/w0/decisions.md`, last section); the planning fix (`X/post-g9/planfix-receipt.md`, collector `obs009-g9b-planfix01`); and a fresh capture I took at the bound digest.
- **Paths:** `G` = `docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/`, `Gb` = `.../local-gate-20261018b/`, `X` = `.../execution-20261018/`.
- **Legend:** every number was read from the named file, or computed from it by me today. **[V]** = I read or computed it today. **[I]** = inference. Where a fact comes only from @dev's receipt and I could not read a log for it, the text says so.

## 1. Trigger

```
trigger: MET   (under the user's C8 waiver of 2026-10-18; bound to source digest 061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617)
```

| Bound to | Value |
|---|---|
| Source digest (1808 files) | `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617` |
| `studio-runner/dist` digest (238 files) | `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210` |
| Helm digest (`helm-chart/`, `shasum` of the sorted per-file list) | `4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8` |
| `git rev-parse HEAD` | `734ad704f6ae508dbb10d9b5127a315bb0df5f81` (tree is dirty; the digest is the identity) |
| Captured | 2026-10-18T23:26:58Z by `.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py`, output kept outside the repo (read-only for the tree) |

**Targets:** the OBS-011 T0 start and the OBS-010 T2 start. This is a start trigger, not a quality verdict. It does not say 009 can be Done: 009 still needs T4 (U17/U18/U7, ED-01), the deployed stack (DEPLOY-OBSERVED-01, U24) and U3.

### 1.1 The waiver, quoted

`X/w0/decisions.md`, section "G9b C8: targeted backend run instead of the full check (user decision, 2026-10-18 ~18:05)": the user chose **"Targeted backend run"**. **Waived here, by the user:** the full backend regression and the JaCoCo coverage gate at the G9b digest. **Owed:** a full fresh `check`, at the 011 T0 fresh baseline, before any 011 lane claims credit. The user was told beforehand that this cannot make 009 or 010 Done today.

In the record's own rule (G9 draft, section 1), the value was MET only if every required row is VALIDATED, C0 to C10 meet their criteria and the freeze held. The same draft said that a decision file from the user would let me record C8 as `OWED_BY_DECISION`. That is what I do. I do not read the waiver as making C8 pass. C8 is **OWED_BY_DECISION**, and it stays on the list in section 9.

[AUTO-DECISION] Bind the trigger to `061fc41f...`, not to the G9b digest `fd793c95...` (reason: the run the user waived around had 12 red cases, so the G9b digest cannot carry a clean targeted result; the planning fix that cleared them landed in two backend test files and moved the digest; the waiver's wording "at the G9b digest" is read as covering that one-step successor, because the delta is exactly those two files, section 2.1). If the user means the waiver to stop at `fd793c95...`, the trigger reverts to NOT_MET on the 12 reds.

### 1.2 Why MET: what I checked and what cleared

1. **The 12 G9b reds are all one class and are fixed.** All 12 are `GuidedPlanningIntegrationTest` cases [V, `obs009-g9b-c8t01-results.json`]. Parsing the class XML [V]: 11 carry `CSI_DAILY_TOKENS_EXHAUSTED` (the shared CSI-123 day ran out) and 1 (`reportedThoughtOutputOverage...`) shows the session still `PROPOSING`; @dev's receipt explains that one as a stub hard-coded to 40,000 thought tokens under a ceiling that is now 98,304 (I read the diff, not a re-run of the unfixed code). `planfix01` re-ran the class at the bound digest: **Planning 57/57, CsiBudgetIT 5/5, DefaultModelReservationIT 5/5, total 67/67**, exit 0, `sourceStable`, `distStable`, `testInputStable` true, `taskCollectionComplete`, `verifyRunnerDist` executed [V]. All 12 failed names pass, and the 57-name set equals the 57 of c8t01 [V].
2. **The fix is test-only and does not weaken a daily-budget assertion.** I diffed both files against the saved pre-edit copies (their sha256 match the receipt's pre-edit hashes `e4bb59c2...` and `b11b75c5...`) [V]. `ObservedPublicationFixture.installGovernance` gained one overload with explicit `GuidedCsiBudgetProperties`; the two existing signatures delegate with the old literals (1000, 5242880, 640000), so the other callers are unchanged. The Planning test sizes its shared CSI day at 10,000 whole session ceilings, derived from `GuidedSessionProperties`, and turns the stub's thought tokens into `outputCeiling(id) + 8_100`. The class asserts nothing about the daily budget (its one `429` is an expected HTTP status on the `proposals` call at line 1496, not a budget assertion [I]); `GuidedCsiBudgetIT` owns that at production defaults and is 5/5 at the bound digest.
3. **The F1 and F2 classes are green in the targeted run.** `GuidedPublicationReplayIT` **46/46** in `test` plus **62/62** in `guidedIncrementalTest`; `GuidedServiceTransportFaultIT` **39/39** [V, by class from the results JSON]. These are the classes that failed at G9. This is a pass on one run; it does not explain F1 and does not prove the F2 race (R1 and R2 in section 1.3).
4. **Nothing else in the targeted run failed.** `test`: 267 cases, 255 passed, 12 failed, 0 skipped; `guidedIncrementalTest`: 62/62; `spotlessCheck`, `checkstyleMain`, `checkstyleTest`, `spotbugsMain` ran and did not fail; the only `Execution failed` line is `:test` [V, `obs009-g9b-c8t01.log`].
5. **Drift from the targeted run to the bound digest is exactly two files** (section 2.1), both under `backend/src/test`. Runner, frontend, contracts, tools, helm and dist inputs are byte-identical, so C1 to C7 and the image carry file-by-file.
6. **Under the waiver, C10 is carried, not re-run** (section 6): the seven production files the nine mutations edit are byte-identical to G9 [V], and all named test classes are identical except the single-method `GuidedPublicationReplayIT` selection, whose file changed (sizing literals, the F1 diagnostic). Baseline-green at the bound digest is not shown. I accept this under the waiver because the 011 T0 fresh check re-runs every class anyway; I list C10 as owed (section 9).

### 1.3 What did not block, and what I name as disclosed residue

R1 to R5 are the user's list, which I confirm; R6 to R9 are what I found.

| # | Residue | State |
|---|---|---|
| R1 | **F1 cause unproven, diagnostic armed.** The video-FAILED-on-PASSED-run cause branch (B1 to B4 in Dex's diagnosis) was never determined. The diagnostic in `awaitJoinedVideo` (`.as(...)` with `video.error` and the `recording failed` log lines) prints only when the assertion fails; it did not fire in G9b because the test passed. ReplayIT 46/46 is one more pass in what Dex counted as a roughly 1-in-1,600 event (1 of 1,624 retained result manifests). | disclosed, carried (G9-F1) |
| R2 | **F2 race proof not run.** The fix is read-checked against the race-free sibling `awaitStage` [V: `readStageOrEmpty` and a content-equality loop, `GuidedServiceTransportFaultIT.java:2628-2634`, `:2743-2754`]. The scratch-copy mutation that makes the unfixed code fail and the fixed code pass was not run. | disclosed, owed (section 9) |
| R3 | **D2 step 6 owed.** One real guided assign on Linux was never scripted. | owed, never passed |
| R4 | **Coverage owed at 011 T0.** `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions` did not run at G9 (`:test` failed) or at G9b (C8 aborted, then targeted). The only reading is G9's offline JaCoCo core analysis (bundle 91.66% line; `compile` and `compile.gateway` rules vacuous because the packages are absent). That is informational, not the gate. | waived by the user, owed |
| R5 | **C10 not re-run at the G9b digest** (or the bound digest). Carried by file identity (section 6). | disclosed, owed |
| R6 | **(mine) D2 container smoke not re-run on the residue image.** The user's U22 decision sequences build, C4, then smoke; `g9b.sh` ran the first two. | disclosed (AC-1), owed |
| R7 | **(mine) About 2,440 of G9's 2,773 cases were last run at G9.** The waiver covers this. Classes that call the same `installGovernance` helper and were not re-run (my grep: GuidedBridgePlannedIT, GuidedBridgeIntegrationTest, GuidedFocusMutationJoinedIT, GuidedLifecycleReasonIT, GuidedEvidencePendingAppendIT and JoinedIT) carry the 429 risk @dev flagged for the bridge ITs (`SHARED-CSI-DAY`). I found no stale `32000` or `262144` session literal in the unrun classes: the hits are body-size limits, a request-wrapper size, `session-it-documents.json` (128000/32000, which `GuidedSessionIT` reads and passed with), and `GuidedModelRequest`/`GuidedTranslationProperties` 32000 upper bounds on per-call output [V by grep]. | waiver; watch at the 011 T0 full check |
| R8 | **(mine) G9b C0 took no listener or orphan listing.** `g9b.sh` writes only the Gradle-daemon file (empty) and vm_stat. | disclosed (AC-12 f-j) |
| R9 | **(mine) Two planfix facts are @dev-reported only:** the mutation spot-check (RED) and `spotlessCheck checkstyleTest` at the bound digest. The scratchpad console file shows `1 test completed, 1 failed`; there is no archived log under `docs/`. `planfix01.log` shows `compileTestJava UP-TO-DATE`, so the test sources compile at the bound digest, and it shows no spotless or checkstyle task. | disclosed (`PLANFIX-ARCHIVE`) |

### 1.4 What would void or reopen this

- Any edit to the 1808-file source set, the 238 dist files, or `helm-chart/` after `061fc41f...` voids the binding (section 11).
- A red in the 011 T0 fresh full check at the same bytes reopens the case it names; the waiver defers that evidence, it does not replace it.
- A user statement that the waiver stops at `fd793c95...` reverts the value to NOT_MET on the 12 reds.

## 2. Freeze and identity

### 2.1 G9b capture stability, and the move to the bound digest

| Item | G9b before (`Gb/capture-before.json`) | G9b after (`Gb/capture-after.json`) | Bound (my capture today) |
|---|---|---|---|
| Source digest | `fd793c9561bfa86d3046abd9791c6da231546f309e7e920a569792deb5afcb67` | same | `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617` |
| Files | 1808 | 1808, identical by path and sha256 [V] | 1808 |
| Dist digest | `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210` (238) | same, 238 of 238 equal [V] | same |
| Helm digest | `4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8` | same | same (recomputed today) |
| `git rev-parse HEAD` | `734ad704...` | same | same |

- **Stability across G9b** [V]: `capture-before`, `c8t-before`, `capture-after` and `pre-rebuild` (source part) are equal file by file; `helm-before` equals `helm-after`. The only dist change in the whole window is R0's, below.
- **R0, single dist rebuild:** `pre-rebuild` dist `4add1307...` (the G9 dist), `R0-clean` exit 0 (dist removed), `run-runner-build.py obs009-g9b-build01` exit 0 (2.25 s, source stable, dist `698a9365...`), `verifyRunnerDist` exit 0. One rebuild, then dist unchanged.
- **Bound vs G9b after** [V, file-list compare of the two capture JSONs]: 0 files added, 0 removed, **2 changed**, both under `backend/src/test`:
  - `guided/translation/GuidedPlanningIntegrationTest.java`: `e4bb59c2...` to `9c68ac5b...`
  - `support/ObservedPublicationFixture.java`: `b11b75c5...` to `9264ae0e...`
  - These two hashes equal the final hashes in `planfix-receipt.md`. Dist digest equal; helm digest equal.

### 2.2 G9 to the bound digest (what moved since the G9 record)

G9 source `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b` (1805 files) to bound `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617` (1808): **3 files added, 23 changed, 0 removed** [V]. Helm `8dbe073c...` to `46070907...`. Dist differs in 3 of 238 files: `guided/schemas.json`, `validator/observedSchemas.json`, `runtime-versions.json`; every `.js`, `.d.ts` and `.map` file is byte-identical [V].

| Group | Files | What they are (source: Dex's receipts) | Re-evidenced at |
|---|---|---|---|
| Backend main | 3: `GuidedContracts`, `GuidedSessionProperties`, `application.yml` | MODEL-SIZING (ruling A-ii): session epoch constant, token-limit defaults 32000/262144 to 98304/786432; yml is comments only [V from the patch] | targeted run: Session, Wire, Reservation, Planning, Replay, Lowerer, Migration, CsiBudget classes |
| Backend test | 5: ReplayIT, TransportFaultIT, DefaultModelReservationIT, GuidedPlanningIntegrationTest, ObservedPublicationFixture | F1 diagnostic, F2 fix, sizing literals, B7 13-proposal test, planning fix | targeted run, planfix01 |
| Contracts / specs | 3: `limits.schema.json`, `publication-fixtures.json`, `consensus-plan.md` | limits v3 change | C5 (contracts 3 PASS lines, codegen) fresh |
| Studio runner | 15: Dockerfile, 4 evaluation files, 2 `src/**/*.json` schemas, 5 changed tests, 1 new test, 2 new scripts (`print-observed-catalog.{mjs,d.mts}`) | schema limits, catalog entry producer, chart tests | C1 C2 C3 C4 C5 fresh |
| Helm | 6 files (not in the capture scope; helm digest moved) | observed chart block, values-uat | C4 deployment tier 642/642 fresh |

## 3. C4 and the residue image

### 3.1 G9b

- `docker build --target build` (`obs009-residue-buildstage-local`) exit 0; `docker build` final exit 0, tag `put-checks-studio-runner:obs009-residue-local`, id `sha256:f8bcb56378b9277f5947a915b25bfdd483e3898ea6dd31681c3ad39d3b616cdf`, `--pull=false`. Final step list is the G9 list plus `runtime 7/7 COPY --from=build /app/scripts/print-observed-catalog.mjs`.
- C4 deployment tier, `STUDIO_RUNNER_IMAGE=put-checks-studio-runner:obs009-residue-local`, `obs009-g9b-runner-deploy01`: **642 passed, 0 failed, 0 pending, 61 suites**, exit 0, 79 s; `sourceStable` and `distStable` true [V]. G9's `deploy02` was 581; per @dev's receipt the +61 are 59 chart cases and 2 falsification cases from the post-G9 batch.
- Image config compare, `Gb/c4-image-inspect.json` vs `G/image/image-inspect.json` [V]: Entrypoint, Cmd, User, WorkingDir, ExposedPorts, Env, Labels, Volumes, StopSignal, Healthcheck all equal; 13 layers against 12; the first 10 equal.
- The docker build used the cached base `mcr.microsoft.com/playwright:v1.63.0-noble`; no pull. The user authorized this under U22/OI-1.

### 3.2 What is not shown

- The 14-assertion D2 smoke ran on the G9 image `sha256:af96bee8ebf2...` only. R6.
- The image's own `npm run build` output was not compared with the host dist. Both come from the same source digest, and the image dist is rebuilt inside the image. [I] equal.
- `print-observed-catalog.mjs` is covered by the runner unit tier (`test/print-observed-catalog.test.ts` 34/34 passed inside C2 [V, vitest JSON]; @dev's own coverage run: 100% lines) but has not been run inside the image.

## 4. Steps C0 to C10

| Step | State | At digest | What was observed | Evidence |
|---|---|---|---|---|
| C0 | MET (gap: R8) | `fd793c95` | capture-before taken; helm digest recorded (`46070907...`); Gradle-daemon file empty; vm_stat taken. **No listener or orphan listing at G9b** (G9's `c0-listeners.txt` and `c0-checks-guided.txt` are the only ones) | Gb/capture-before.json, c0-*.txt, helm-before.txt |
| C1 | MET | `fd793c95` | runner type-check and lint exit 0 | Gb/c1.log |
| C2 | MET | `fd793c95` | runner unit tier: 2672 total, 2643 passed, 0 failed, 29 pending, 417 suites, exit 0 (G9: 2635 / 2606 / 29; +37 passed; 34 of them are the new `print-observed-catalog` test [V], the other 3 are not attributed). Vitest coverage thresholds enforced by the config, exit 0 | X/execution/obs009-g9b-runner-unit01-* |
| C3 | MET | `fd793c95` | runner fixtures, real Chromium: 305 total, 296 passed, 0 failed, 9 pending, exit 0 (equals G9's counts) | X/execution/obs009-g9b-runner-fixtures01-* |
| C4 | MET | `fd793c95` | build stage and final image exit 0; deployment tier 642/642 on `obs009-residue-local`. Section 3 | Gb/c4-*, X/execution/obs009-g9b-runner-deploy01-* |
| C5 | MET | `fd793c95` | pins, contracts, codegen exit 0 x3 (contracts: 44 schemas, 481 checks, 53 planning fixtures, 164 replay/publication checks; codegen: 25 guided plus 32 replay schemas, four byte-identical outputs). NOT ASSERTED, never counted as pass: `dist/runtime-versions.json` `chromiumBuild` and `image` are null because the dist was not built in the pinned Playwright image (ED-05) | Gb/c5-*.log |
| C6 | MET | `fd793c95` | frontend type-check, lint (308 warnings, 0 errors), vitest 70 files / 1386 tests passed, build exit 0 | Gb/c6-frontend.log |
| C7 | MET | `fd793c95`; two greps at the bound tree | P2 0; DEFERRED 0; guidedMain 0; start:guided 0; studio-guided-worker templates 0; sameIdentity bodies 1; SSLContext.getDefault 0. I repeated two greps the G9 record had and `g9b.sh` did not: `@Disabled` annotations in `backend/src/test` = 6, `studio.updateTest(` = 0 [V, today] | Gb/c7-greps.txt |
| C8 | **OWED_BY_DECISION** | `fd793c95` (targeted); planfix at `061fc41f` | full C8 aborted by root on the user's decision; targeted run instead. Section 4.1 | Gb/g9b-c8t.sh, X/execution/obs009-g9b-c8t01-*, X/execution/obs009-g9b-planfix01-* |
| C9 | MET | `fd793c95` | capture-after equals capture-before file by file (1808 source, 238 dist); helm equal; the bound digest is one step on (section 2.1) | Gb/capture-after.json |
| C10 | **CARRIED_NOT_RERUN** | `6fcc12ee` | 9 of 9 red at G9, baseline and final 33/33. Not re-run at any G9b digest. Section 6 | X/qa/c10-run/ |

### 4.1 C8: the user's decision, the targeted run and the planning fix

**Targeted run `obs009-g9b-c8t01`** (`Gb/g9b-c8t.sh`): the 9 classes the post-G9 batch touched or that failed at G9, each in full (`GuidedPublicationReplayIT`, `GuidedServiceTransportFaultIT`, `GuidedPlanningIntegrationTest`, `GuidedDefaultModelReservationIT`, `GuidedWireContractTest`, `GuidedSessionIT`, `GuidedCsiBudgetIT`, `ObservedArtifactLowererTest`, `GuidedPublicationMigrationTest`), plus `guidedIncrementalTest` and the four static tasks, `--rerun-tasks`, 4177 s (1h 09m 36s), exit 1, `validationSucceeded` false.

| Task | Class | Cases | Result |
|---|---|---|---|
| test | GuidedPublicationReplayIT | 46 | 46 pass |
| test | GuidedServiceTransportFaultIT | 39 | 39 pass |
| test | GuidedPlanningIntegrationTest | 57 | 45 pass, **12 fail** |
| test | GuidedSessionIT | 44 | 44 pass |
| test | ObservedArtifactLowererTest | 41 | 41 pass |
| test | GuidedWireContractTest | 18 | 18 pass |
| test | GuidedPublicationMigrationTest | 12 | 12 pass |
| test | GuidedCsiBudgetIT | 5 | 5 pass |
| test | GuidedDefaultModelReservationIT | 5 | 5 pass |
| guidedIncrementalTest | GuidedPublicationReplayIT | 62 | 62 pass |
| **total** | | **329** | **317 pass, 12 fail, 0 skipped** (`test` 255/267, `guidedIncrementalTest` 62/62) |

**The 12 reds** (all `GuidedPlanningIntegrationTest`): `reportedThoughtOutputOverageStopsBeforeMaterializationDespiteSmallVisibleOutput`, `underCeilingLateDeltaSurvivesRefusedNextReservation` [2] capacity=output and [3] capacity=proposals, `futureNonzeroSourceQuestionCannotBeRedefinedByChangingItsOperation`, `actualScannerRecoversEveryCommittedBootstrapWindow` [1] to [6], `anAbsentDestructiveTargetFailsUngroundedBeforeDestructivePrecedence`, `lateKnownOverageStopsActiveSessionBeforeAnotherProviderSend`. Causes and fix: section 1.2 items 1 and 2.

**Planning fix `obs009-g9b-planfix01`**, source `061fc41f...` before and after: exit 0, 67/67 (Planning 57, CsiBudgetIT 5, DefaultModelReservationIT 5), 440 s, no skips. @dev reports a mutation spot-check (the overage test's `outputCeiling(id) + 8_100` reverted to `40_100`) that went RED with the original symptom, then restored; the final sha256 equals the bound hashes [V]. The RED itself is not archived (R9).

**Skip multiset:** zero skipped at G9b in both runs. G9's approved-skips multiset (9 entries) was not exercised because the skipped classes (VaultPolicyIT, GuidedSchemaProbeIT external half, the other approved entries) are outside the targeted selection. Not a regression; a coverage gap that the 011 T0 full check closes.

**Static checks at the targeted run:** `spotlessCheck`, `checkstyleMain`, `checkstyleTest`, `spotbugsMain` executed and did not fail [V]. At the bound digest only @dev reports `spotlessCheck checkstyleTest` exit 0 (R9).

**Not run, by the waiver:** `requireFreshGuidedPartitions`, `jacocoTestCoverageVerification`, `crossReplicaTest`, and every class outside the nine.

### 4.2 Count reconciliation

Baseline: STUDIO-OBS-008 final check (`STUDIO-OBS-008/execution-20261017/execution/obs008-final-check01-task-outputs`, source digest `50692d55...`): **2531 total / 2506 passed / 25 skipped** (`test` 2467, `guidedIncrementalTest` 62, `crossReplicaTest` 2). After (G9): **2773 total / 2762 passed / 2 failed / 9 skipped**.

Name-level multiset diff (task, class, name), computed by @qa: **4 removed, 246 added**; 2531 - 4 + 246 = 2773.

- **Removed (4):** `StudioScheduleApiIT.rawReadinessChangeRefusesWithLearnRequiredAndNoExecution`, `SharedSchedulingIT.sameCoordinatorRunsHttpTcpSplunkAndReachesTheStudioPipeline`, `SharedSchedulingIT.studioOnlyReplicaRunsWhenCatalogFlagIsOffAndDeduplicatesOccurrences` (three of the four interim 012A ports, deleted by name in `s/receipt.md`), and `RunnerReportProjectionTest.theRunnersChromiumBuildKeyProjectsOntoRuntimeChromium` (removed by lane B because it pinned the artifact-1 key that P2 b stops reading, `b/receipt.md`).
- **Ported (1):** `StudioScheduleApiIT.sourceMutationBlocksTheScheduleWithLearnRequired`, re-pointed in place.
- **Skipped to run (18):** `StudioScheduleApiIT` 16 and `SharedSchedulingIT` 2. Skipped fell from 25 to 9: 25 - 18 + 2 new approved skips (the `VaultPolicyIT` rehearsal and the `GuidedSchemaProbeIT` external half).
- **Added (246):** largest classes `StudioRunnerPropertiesProfileTest` +44, `GuidedScheduledBeansProfileTest` +34 (with nested classes), `RunnerProcessHarnessTest` +34, `GuidedConnectorScopeTest` +23, `StudioRunnerTlsTest` +19, `RunnerTlsClientCertIT` +16 (with nested classes), `ObservedCoRunIT` +12, `GuidedSchemaProbeIT` +10, `GuidedEvidencePendingAppendIT` +8, `ObservedScheduleAuthorityIT` +8, `RunnerReportProjectionTest` +7; the rest are 6 or fewer per class (full list in the JSON). I did not tie each addition to an AC in this draft.

**G9b delta to the count:** the targeted run is 329 cases (267 + 62); it is a subset, not a new baseline. No reconciliation against 2773 is claimed for G9b.

## 5. Coverage

- **Gate:** not run at G9 (`:test` failed) and not run at G9b (C8 aborted, then targeted). Waived by the user at the G9b digest; owed at 011 T0.
- **`G/c8-jacoco/` is a stale copy** (sessions from 2026-10-17 21:43 to 23:24). Do not cite it. G9b wrote no jacoco copy.
- **Informational reading, G9 `.exec` files, offline JaCoCo 0.8.12 core against classes compiled from the G9 frozen source, same excludes as `build.gradle.kts`:**

```
classesAnalyzed=576 execSessions=28
BUNDLE line covered=23341 missed=2125 ratio=0.9166
com/citi/put/checks/studio/compile/gateway ABSENT (rule vacuous)
com/citi/put/checks/studio/dispatch covered=1151 missed=135 ratio=0.8950
com/citi/put/checks/studio/internal covered=747 missed=74 ratio=0.9099
com/citi/put/checks/studio/recovery covered=232 missed=29 ratio=0.8889
com/citi/put/checks/studio/sse covered=237 missed=19 ratio=0.9258
com/citi/put/checks/studio/compile ABSENT (rule vacuous)
```

It is G9 bytes, not the bound digest, and `test.exec` came from a run with two failed cases. It is a reading, not a gate result, and I do not count C8 as met because of it.

## 6. C10: mutation reproductions in a scratch copy

- **Attempt 01** (`qa/c10-run/attempt01/`) aborted at its baseline: 27 selected tests, 2 failed. The v1 S4 selection named `GuidedPublicationReplayIT.editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness`, an `@Order(3)` method that reads `publishedTestId`, which only the `@Order(1)` method sets. Alone it fails at `:18379` ("expected not null") and the class `AfterAll` scan then fails ("the OBS-007 case registered its canaries"). That is the TEST-001 order-dependence class, not a faithfulness problem of the scratch copy.
- **My v1 plan had the S4 target wrong.** The `BACKGROUND_AUTHORIZATION_DENIED` tripwire is asserted in `schedulerAndNewHead(...)`, which the `@Order(1)` method `actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues` calls, not in the `@Order(3)` method.
- **v2 (`qa/c10-run/c10.v2.sh`)** changes: S4 selects the `@Order(1)` method plus the `@Order(9)` OBS-007 canary method (so the class scan finds its canaries) and drops `@Order(3)`; the mutation files are checked against the **frozen** `capture-after` sha256 instead of the live tree, which @dev edits; S4 requires the red message to contain `BACKGROUND_AUTHORIZATION_DENIED`; every red test's first failure line is recorded; the extended tier (S1, LR, F2) is included. LR is the T0 C10 minimum.
- **Scratch copy** re-verified against `capture-after.json` before the run (`qa/c10-run/frozen-reverify.txt`): 1721 files plus 238 dist files, 0 mismatches. The driver repeated the check at run start, and I ran it again after the final run (`c10.v2.sh frozen`: FROZEN_OK, 0 mismatches), so the batch left the scratch copy equal to the frozen digest. Digest `6fcc12eef193338ca3bc79adaa50660d93c245a4462a5f850a7256588d9fc91b`.
- **Credit note:** the C10 selections include single-method `GuidedPublicationReplayIT` runs. They reproduce mutations only; they are never regression credit (AC-12 clarification: a single-test ReplayIT rerun is never credited). The baseline and final greens prove the selection, not AC-12.

Baseline (unmutated, scratch): **GREEN**, {"total": 33, "failed": 0, "errors": 0, "skipped": 0}, 123 s.

| Mut | Lane | Verdict | Red tests | Restored to frozen sha | Seconds |
|---|---|---|---|---|---|
| S3 | S-W3 (AC-6 b/c, R7 non-vacuity) | RED_AS_EXPECTED | ObservedScheduleAuthorityIT.g3DoesNotRefuseASecretFreeObservedScheduleOnAProductionBackgroundSource; ObservedScheduleAuthorityIT.g3AcceptsTheSameSecretReferencingRunUnderTheLocalFixturePolicy; ObservedScheduleAuthorityIT.anObservedScheduleIsAcceptedUnderBackgroundAuthorityForTheSchedulePrincipal; ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARunThatWasAcceptedUnderTheFixturePolicy; StudioScheduleApiIT.editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision | yes | 32 |
| S4 | S-W3 (AC-6 d tripwire, grant check) | RED_AS_EXPECTED | GuidedPublicationReplayIT.actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues; GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel; ObservedScheduleAuthorityIT.theRefusalNoLongerExistsAndAWithdrawnGrantStillFailsClosed | yes | 124 |
| B1 | B-W3 / R1 d (and R1 a-c) | RED_AS_EXPECTED | GuidedEvidencePendingAppendIT.aSecondRecordingAtTheOtherAcceptedRevisionIsStillAConflict; GuidedEvidencePendingAppendIT.recordingAtThePreviousRevisionIsAcceptedWhileAnAppendIsPending; GuidedEvidencePendingAppendJoinedIT.aSessionEndedWhileAnAppendIsPendingKeepsARecordingThatSettlesPlaysAndSeeks; GuidedEvidencePendingAppendJoinedIT.aSessionLosingItsBrowserWhileAnAppendIsPendingStillRecordsTheRunnersOwnFact | yes | 213 |
| B2 | ADJ-1 c (joined) | RED_AS_EXPECTED | PreReadyRevocationJoinedIT.aPreReadyRevocationOfARealHeldRunIsSettledAsAuthorizationRevoked; PreReadyRevocationProbeIT.aPreReadyRevocationIsSettledAsAuthorizationRevoked | yes | 89 |
| B3 | ADJ-1 narrowness (security co-sign dependency) | RED_AS_EXPECTED | PreReadyRevocationProbeIT.aRevokedRowsOtherPreReadyFinalIsStillRefusedAndTheReaperSettlesIt | yes | 22 |
| F1 | F (AC-11 ACK-loss leg) | RED_AS_EXPECTED | ObservedCoRunIT.aLostAcknowledgmentIsNeverAResend | yes | 26 |
| S1 | S-W3 (G-3 at dispatch recheck) | RED_AS_EXPECTED | ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARunThatWasAcceptedUnderTheFixturePolicy | yes | 24 |
| LR | BL / LR c (T0 C10 minimum) | RED_AS_EXPECTED | GuidedLifecycleReasonIT.anExpiredReportAcceptedBeforeTheBackendExpiryEndsExpired | yes | 16 |
| F2 | F (AC-11 public-cancel leg) | RED_AS_EXPECTED | ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot | yes | 34 |

Final (all selections, unmutated, after the reverts): **GREEN**, {"total": 33, "failed": 0, "errors": 0, "skipped": 0}, 125 s.

`allAsExpected`: **True**. C10 was **MET at the G9 digest** (see 6.1 for the bound digest).

Notes on the reds (first failure lines are in `c10-results.json`, `redMessages`):

- **S3** (scheduled acceptance no longer mints the background grant binding): 5 red. Collateral red beyond the named tests: ObservedScheduleAuthorityIT.g3DoesNotRefuseASecretFreeObservedScheduleOnAProductionBackgroundSource; ObservedScheduleAuthorityIT.g3AcceptsTheSameSecretReferencingRunUnderTheLocalFixturePolicy; ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARunThatWasAcceptedUnderTheFixturePolicy. First failure: `org.springframework.dao.DataIntegrityViolationException: PreparedStatementCallback; SQL [UPDATE studio_schedule_occurrences SET decision=?,code=?,retry_at=NULL,retry_attempts=0,updated_at=now() WHERE id=? AND decision='DEFERRED'];`
- **S4** (the background-grant check is removed (the ReplayIT tripwire expects BACKGROUND_AUTHORIZATION_DENIED)): 3 red. Collateral red beyond the named tests: GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel. First failure: `org.opentest4j.AssertionFailedError: expected: "BACKGROUND_AUTHORIZATION_DENIED" but was: "ACCEPTED" org.opentest4j.AssertionFailedError: expected: "BACKGROUND_AUTHORIZATION_DENIED" but was: "ACCEPTED" at java.base@21.0.10/jdk.int`
- **B1** (evidence acceptance back to the head revision only (the pre-R1 behaviour)): 4 red. Collateral red beyond the named tests: GuidedEvidencePendingAppendIT.aSecondRecordingAtTheOtherAcceptedRevisionIsStillAConflict. First failure: `org.opentest4j.AssertionFailedError: expected: null but was: com.citi.put.checks.studio.guided.session.GuidedSessionException: STALE_FENCE at com.citi.put.checks.studio.guided.session.GuidedSessionException.require(GuidedSessionEx`
- **B2** (the revoked-ADMITTED disjunct is unreachable (the pre-ADJ-1 behaviour)): 2 red. First failure: `org.opentest4j.AssertionFailedError: Expecting value to be true but was false org.opentest4j.AssertionFailedError: Expecting value to be true but was false at java.base@21.0.10/jdk.internal.reflect.DirectConstructorHandleAccessor.`
- **B3** (the outcome binding is dropped: any pre-Ready FINAL on a revoked row is accepted): 1 red. First failure: `org.opentest4j.AssertionFailedError: expected: "409 TRANSITION_REJECTED" but was: null org.opentest4j.AssertionFailedError: expected: "409 TRANSITION_REJECTED" but was: null at java.base@21.0.10/jdk.internal.reflect.DirectConstruc`
- **F1** (the dispatcher resends on an AMBIGUOUS answer): 1 red. First failure: `org.opentest4j.AssertionFailedError: [dispatcher sends for ackLoss: [send:ACCEPTED, acknowledgment-lost, send:DEFINITE_REFUSAL]] expected: 1 but was: 2 org.opentest4j.AssertionFailedError: [dispatcher sends for ackLoss: [send:ACCE`
- **S1** (the G-3 secret refusal at the dispatch recheck is skipped): 1 red. First failure: `java.lang.AssertionError: Expecting code to raise a throwable. java.lang.AssertionError: Expecting code to raise a throwable. at com.citi.put.checks.studio.scheduling.ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheckForARu`
- **LR** (the lifecycle route ignores the reported reason again (EXPIRED ends FAILED)): 1 red. First failure: `org.opentest4j.AssertionFailedError: expected: "EXPIRED" but was: "FAILED" org.opentest4j.AssertionFailedError: expected: "EXPIRED" but was: "FAILED" at java.base@21.0.10/jdk.internal.reflect.DirectConstructorHandleAccessor.newIns`
- **F2** (the guided stop sender is swallowed, so the runner is never told to stop): 1 red. First failure: `java.lang.AssertionError: [the runner was told to stop] Expecting actual: 0 to be greater than: 0 java.lang.AssertionError: [the runner was told to stop] Expecting actual: 0 to be greater than: 0 at com.citi.put.checks.corun.Obser`

### 6.1 C10 at the bound digest: carried, not re-run

- **Not run:** `c10.v2.sh plan` and `run` were not executed at either G9b digest. The scratch copy `qa/c10-run/` still equals the G9 `capture-after`.
- **File-identity argument [V, G9 capture-after vs bound capture]:** the production files the nine mutations edit are unchanged: `dispatch/StudioAcceptanceService`, `scheduling/ConfiguredBackgroundAuthorization`, `scheduling/StudioScheduledDispatchAuthorization`, `guided/evidence/GuidedSessionEvidenceService`, `dispatch/StudioDispatchLedgerStatements`, `dispatch/StudioDispatcher`, `guided/session/GuidedSessionService`. The test classes the reds come from are unchanged except `GuidedPublicationReplayIT` (S4 selects two of its methods).
- **What the argument does not give:** a green baseline at the bound digest, and nothing about interactions through the three backend main files that did change (session epoch and token defaults) [I: unrelated to the mutated guards].
- **S4 and ReplayIT.** The two methods S4 uses were in the G9b ReplayIT full-class pass (46/46); the S4 mutation was not re-applied.

## 7. Required rows (the OBS-011 start list), at the bound digest

Each row ends `VALIDATED`, `NOT_VALIDATED` or `VALIDATED_WITH_DISCLOSURE`. Every row is now `VALIDATED_WITH_DISCLOSURE`, because each rests on class evidence from G9 that the waiver left unrerun, or on a smoke that is older than the image, or both. A row is not downgraded for a file that did not change in its subject (list in section 2.2). The trigger is MET because no row is NOT_VALIDATED, not because every row is clean.

| Row | State | Evidence | Disclosure | Owed externally |
|---|---|---|---|---|
| AC-1 | VALIDATED_WITH_DISCLOSURE | G9b, fresh, inputs equal the bound digest outside two backend test files: C1, C2 (2643 passed), C3 (296 passed), C5 exit 0 x3, C7 on target; C4 deployment tier 642/642 against image `obs009-residue-local` (sha256:f8bcb56378b9...), exit 0. G9 history: D2 smoke 14 assertions on `obs009-g9-local` (single process under --init, pid 7; no-`--init` launch refused exit 78; NODE_OPTIONS refused exit 78; stop drained inside the grace). | The D2 container smoke was NOT re-run on the residue image. Image config (entrypoint, cmd, user, workdir, env, labels, ports) equals the G9 image; the final build gained one `COPY ... print-observed-catalog.mjs` step (runtime 7/7); the dist differs from G9 in 3 files only (`guided/schemas.json`, `validator/observedSchemas.json`, `runtime-versions.json`), all JavaScript is byte-identical [V, @qa compare]. That is an argument, not a smoke result. Smoke step 6 (one real guided assign on Linux) is OWED, not passed. DEPLOY-OBSERVED-01 is a carried residue against AC-1. | deployed Deployment; PID-1 a-c on the stack; smoke step 6; smoke re-run on the residue image (recommended, cheap) |
| AC-2 | VALIDATED_WITH_DISCLOSURE | C4 642/642 fresh (G9: 581; the +61 are chart cases per @dev); C8 StudioRunnerPropertiesProfileTest 44/44 and GuidedScheduledBeansProfileTest 32/32 at the G9 digest | CARRIED: the two backend classes were last run at G9 (6fcc12ee), not at either G9b digest, by the user's waiver. Backend main files changed since G9: GuidedContracts (epoch constant), GuidedSessionProperties (token-limit defaults), application.yml (comments only). None is the subject of these classes [I]. | G-1 in a shared environment |
| AC-3 | VALIDATED_WITH_DISCLOSURE | C7 SSLContext.getDefault = 0 (G9b, fresh); C8 RunnerTlsClientCertIT 12/12 at the G9 digest | CARRIED: RunnerTlsClientCertIT not re-run at a G9b digest (waiver). No file of its subject changed since G9 [I, from the change groups in section 2.2]. | G-2 in 010 |
| AC-4 | VALIDATED_WITH_DISCLOSURE | C2 and C4 fresh (Q4 tmp/TMPDIR/NODE_OPTIONS assertions green in the 642); C8 DatabaseCanaryScanIT 2/2 at the G9 digest | CARRIED: DatabaseCanaryScanIT not re-run at a G9b digest. VaultPolicyIT is skipped by name and is REHEARSAL_ONLY_NON_CREDITING (approved-skips entry 8); it is not a pass. F1 is not an AC-4 case [I]. | Vault policy test (U5, ED-02); TF-5 a, c, e |
| AC-5 | VALIDATED_WITH_DISCLOSURE | C8 GuidedScheduledBeansProfileTest 32/32 at the G9 digest | CARRIED: not re-run at a G9b digest (waiver). | SIEM sink |
| AC-6 | VALIDATED_WITH_DISCLOSURE | C7 at the bound tree (P2 0, DEFERRED 0, @Disabled 6 counted, studio.updateTest( 0); C8 StudioScheduleApiIT 22/22, SharedSchedulingIT 4/4, ObservedScheduleAuthorityIT 8/8 at the G9 digest; C10 S3 and S4 red as named at the G9 digest | CARRIED: the three classes and C10 were not re-run at a G9b digest. The files S3 and S4 mutate (`StudioAcceptanceService`, `ConfiguredBackgroundAuthorization`) are byte-identical to G9 [V]. Earlier disclosure stands: S M4 (dropping the ui_tests row locks) is caught by no test; S3 turns red through a database check constraint, not through a grant-binding assertion [I: why the constraint rejects it was not traced]. Question for @po and @architect, not a QA fail. | none |
| AC-11 | VALIDATED_WITH_DISCLOSURE | C3 fresh (296 passed, 0 failed, 9 pending; same counts as G9, names not re-checked at G9b); C8 ObservedCoRunIT 12/12, PreReadyRevocationProbeIT 4/4, PreReadyRevocationJoinedIT 1/1, GuidedEvidencePendingAppendIT 8/8, GuidedEvidencePendingAppendJoinedIT 2/2, GuidedLifecycleReasonIT 5/5, GuidedFocusMutationJoinedIT 2/2 at the G9 digest; C10 B1 B2 B3 F1 LR F2 red as named at the G9 digest | CARRIED: the backend classes and C10 were not re-run at a G9b digest. Wording rules from G9 stand: (1) runner-kill leg credited for 'zero repeats, settled STALE', not 'no survivor'; (2) ADJ-1 c credited on the observed UNKNOWN_OUTCOME with the AUTHORIZATION_REVOKED label, never NOT_USED, and the joined IT's either-value assertion is weak; (3) failed-launch survivor property is proved on doubles plus a source pin; (4) S-W3's replay collector run exited 2 on sourceStable:false only. B2 and B3 rulings and the N-RS1 sentence are owed to @po and @architect. | live revocation; worker-profile dispatch on pods; R8.2 e; RUN-ORPHAN-01 in-pod check |
| AC-12 f-j | VALIDATED_WITH_DISCLOSURE | G9b: c8t01 and planfix01 `sourceStable`, `distStable`, `testInputStable` all true; `verifyRunnerDist` executed in both Gradle logs; capture-before equals capture-after file by file (1808 source, 238 dist) | G9b C0 took no listener or orphan listing (`g9b.sh` writes only the Gradle-daemon file, empty, and vm_stat), and there is no per-run lsof file for c8t01. The only listener evidence is G9's `c0-listeners.txt` (14:40) and the C10 run's `lsof-before.txt`. | none |

**Rulings on file for AC-11 (cite with sha256 in the final record):** `w1.5/ruling-part1.md`, `w1.5/ruling-part2.md`, `w3/pre-g9-rulings.md`, `f-merge/pre-rulings.md`, `prep-20261016/t0-rulings/ruling.md`. **QA co-signs on file:** `qa/pre-g9-review/adj1-security-cosign.md` (SIGN-WITH-NOTES), `qa/pre-g9-review/f-r2-1-oracle-cosign.md` (SIGN-WITH-NOTES).

### 7.1 Informational rows (state only, never blocking)

| Row | State |
|---|---|
| AC-1 PID-1 a-c | smoke steps 2, 3, 4, 5, 7 passed (14 assertions) in a local container **on the G9 image**; step 6 and the deployed Deployment are OWED; residue-image smoke not run |
| AC-4 Vault rehearsal (A18) | skipped by name, REHEARSAL_ONLY_NON_CREDITING (approved-skips entry 8); not exercised in G9b |
| AC-11 REL-001 pointer | NOT_COMPUTED. Classification rule: rel001-pointer-ruling.md. Must be stated as recurrences by classification, never as "0 lines" |
| AC-12 D4 15 s edge | NOT_COMPUTED (no elapsedMs >= 15000 scan of the G9 or G9b logs was run) |
| AC-12 a-d IPC observation | NOT_COMPUTED |
| AC-9 TF-3 | not examined |
| AC-7 AUTHORED-ECHO-01 | not landed at G9; not re-checked: no o-ae, c9-ae or fe9 receipt folder under `X` today. Gates the first real call, not this trigger |
| AC-7 FOCUS-MUTATION-01 | GuidedFocusMutationJoinedIT 2/2 at G9; not re-run |

**Never covered by this record:** AC-7 (benchmark), AC-8 (live probe), AC-10, the live halves of AC-4/5/11/12, deployed-stack proofs, TF-5 a/c/e.

## 8. What happened to the G9b plan

The G9 draft's section 8 asked for a full C0-C10 gate at a new digest. Result:

| Planned | Done |
|---|---|
| @dev lands F2 fix, F1 diagnostic, residue patches | yes (`X/post-g9/receipt.md`); five patches applied, chart patch and tests folded in |
| One dist rebuild, image rebuild, C4b | yes (R0, C4 on `obs009-residue-local`) |
| C1-C3, C5, C6 rerun | yes, all exit 0 |
| C8 full `check --rerun-tasks` | **no** - aborted on the user's decision; targeted run instead (section 4.1) |
| C10 rerun on a fresh scratch copy | **no** (section 6.1) |
| D2 smoke on the new image | **no** (R6) |

## 9. Owed, with owner (never blocking this trigger, never passed)

| Item | Owner |
|---|---|
| Full fresh `check --rerun-tasks` (full regression + JaCoCo gate), at the 011 T0 fresh baseline, before any 011 lane claims credit (USER WAIVER 2026-10-18, w0/decisions.md) | root / @devops, then @qa |
| C10 mutation reproductions at the bound digest (`c10.v2.sh plan` then `run`, fresh scratch copy, `C10_TIER=all`) | @qa |
| D2 container smoke on the residue image `obs009-residue-local` | root / @devops |
| D2 smoke step 6 (real guided assign on Linux) | @dev/@devops with a signed token |
| F2 race proof: scratch-copy mutation (`Thread.sleep(300)` between createFile and writeString in `Child.pause`), RED on unfixed code, GREEN on fixed | @qa or @dev, scratch copy only |
| F1: decide at the next recurrence (diagnostic armed in `awaitJoinedVideo`; it prints only on a failure) | @dev |
| `print-observed-catalog.mjs` run inside the pushed image and the `build.schemaBundleHash` from the rebuilt dist (CI step) | @devops |
| Gateway price list, thoughts-token billing | ED-01 gateway owner (TBD) |
| Headroom R under the USD 500 wave authorization | user (U17/U18) |
| B2, B3 rulings; N-RS1 case or disclosure sentence | @po, @architect |
| Staging application, SSO case, dev Vault secret (D2, E1) | user, app owner, Platform/SRE |
| AE-01 landing, U13 acknowledgement | @dev, user |
| RUN-ORPHAN-01 in-pod check | @devops |
| C-17 masked-video human reviewer | user |

## 10. Carried items

| Id | What | Owner |
|---|---|---|
| G9B-C8-WAIVER | G9b C8 was replaced by a targeted run by user decision; the full regression and the JaCoCo gate are unrun at both G9b digests. About 2,440 of G9's 2,773 cases (2,773 minus the 329 targeted cases; an approximation, new cases since G9 are not netted) were last run at the G9 digest. | user decision; owed at 011 T0 |
| G9-F1 | ReplayIT video FAILED on a PASSED run at G9; cause branch unproven (Dex: about 50% load-sensitive `ps` read in `quiesce()`, rest unobserved); the diagnostic is armed but has never fired; ReplayIT 46/46 in the G9b targeted run is consistent with a rare transient and cannot exclude recurrence. Small product-robustness smell (one failed `ps` sample discards a good recording) stays. | @dev; runner change would reopen the runner and image gates |
| G9-F2 | TransportFaultIT stage-marker read raced the child's write. Fixed (consumer polls on content, like `ObservedResolverProcessCrashIT.awaitStage`); 39/39 green. The race itself was never reproduced on unfixed code, so the fix is code-read, not mutation-proved. | @dev; mutation proof owed |
| PLANFIX-ARCHIVE | The planfix mutation spot-check (RED) and the `spotlessCheck checkstyleTest` run at the bound digest are reported by @dev in `post-g9/planfix-receipt.md`. The only trace I could read is a scratchpad console file (`1 test completed, 1 failed`); neither is archived under `docs/`. | @dev: copy the two logs into post-g9/ |
| SHARED-CSI-DAY | Test classes that share one CSI on the production-default day (about 6 full-ceiling reservations) can hit 429 CSI_DAILY_TOKENS_EXHAUSTED. Dex's open [I] names the bridge ITs; my grep of `installGovernance` callers adds GuidedFocusMutationJoinedIT, GuidedLifecycleReasonIT and GuidedEvidencePendingAppendIT/JoinedIT. None was run after the sizing change. GuidedSessionIT and TransportFaultIT passed under it. | watch at the 011 T0 full check |
| TEST-001 | GuidedPublicationReplayIT is order-dependent (a lone Order(3) method fails on the null publishedTestId). Placed in OBS-011 AC-5 cleanup. | @dev/@qa |
| C8-JACOCO-STALE-COPY | `local-gate-20261018/c8-jacoco/` is a copy of `build/reports/jacoco` from 2026-10-17, not G9. G9b wrote no jacoco copy (C8 aborted). | note only |
| DEPLOY-OBSERVED-01 | The chart cannot run observed work; blocks every deployed-stack leg. The story states it does not block G9 or the OBS-011 start. | per story AC-1 residue |
| RUN-ORPHAN-01 | replay child outlives a runner SIGKILL up to the step timeout | @dev runner; in-pod check @devops |
| SEC-AUDIT-PREREADY-01 | see prior records | - |
| RUNNER-LOG-REFUSAL-01 | see prior records | - |
| LEDGER-REVOKED-WRITE-ONCE | optional: no database trigger on studio_dispatch_ledger.revoked_at | - |
| EP-F1 | dead compile-era files in evaluation/ | - |

## 11. Validity

Bound to source digest `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617`, dist `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210` and helm `4607090747e4fef31713ff90db5545eb243bdcff67c3b9acfd5fff2e8e01ada8`. A later edit to any file in that source set, to `studio-runner/dist` or to `helm-chart/` voids the binding; a later edit to a file owned by a row voids that row. OBS-011's own edits, once 011 T0 has started on this digest, do not void a trigger already given. The trigger is MET under the user's waiver of 2026-10-18 and lapses with it: the full fresh `check` at the 011 T0 baseline is owed before any 011 lane claims credit. Before any 009 Done review this addendum must be current, and C10, the residue-image smoke and the full regression must have been run at the digest being reviewed.

Signed: Quinn (@qa), 2026-10-18.
