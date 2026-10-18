# STUDIO-OBS-015 final source-frozen gates, attempt04 (final-gates04), Gage (@devops)

2026-10-16 22:50 EDT to 2026-10-17 00:33 EDT (02:50Z to 04:33Z). HEAD is `734ad704f` with an uncommitted tree. I made no commits, did no push and edited no source. The machine-readable record is `receipt.json`. [V] means I ran it and read the output. [I] means inferred.

**Overall: GREEN.** The backend `check` passed with the expected counts. JaCoCo verification and `requireFreshGuidedPartitions` ran and passed. Every other gate is CARRIED_FORWARD by digest equality. The in-image pins check stays NOT_GREEN_EXTERNAL (ED-05).

## Freeze binding

| | Source | Dist |
|---|---|---|
| `capture-before.json` (02:50:31Z) | `f071984a46af15a039140e11135c0223092b338fd79d3a985757421ab323cabe`, 1647 files | `80d1ba1d43b3f571d9a882459676484bd165ab850143d2ac06b3bd781462467e` |
| collector manifest before (02:50:41Z) | identical | identical |
| collector manifest after (04:31:55Z) | identical | identical |
| `capture-after.json` (04:32:44Z) | identical | identical |

[V] The file lists and hashes are identical before and after, for both source and dist. They are also identical to attempt03's `capture-before.json`, with 0 changed, 0 added and 0 removed. The precheck matched the expected digests, so I ran.

## Gates

| Gate | Verdict | Result |
|---|---|---|
| **Backend `check --rerun-tasks` via collector** (`final-gate-attempt04-20261016T2252`) | **PASS** | Collector exit 0, Gradle exit 0, `BUILD SUCCESSFUL in 1h 41m 12s`, 25 actionable tasks: 25 executed. 6073.27 s |
| `test` lane | PASS | **2412 / 2387 / 0 fail / 0 error / 25 skip**. The skips equal the approved 25 (multiset compared by me and by the collector) |
| `guidedIncrementalTest` | PASS | **62 / 62** |
| `crossReplicaTest` | PASS | **2 / 2** |
| Total | PASS | 2476 / 2451 / 0 / 0 / 25 |
| `retainOriginalGuidedCohort`, `retainIncrementalGuidedCohort`, `requireFreshGuidedPartitions` | PASS | All three executed in that order after the lanes, with no failure. The collector found exactly 1 fresh JOIN cohort per JOIN lane |
| `jacocoTestReport`, `jacocoTestCoverageVerification` | PASS | Both executed. Ratios below |
| Static inside `check` | PASS | `spotlessCheck`, `checkstyleMain`, `checkstyleTest`, `spotbugsMain`, `rdsParityLint`, `antiRegressionCheck`, `testcontainersAlignmentCheck` ran without failure. `spotbugsTest` is SKIPPED by design |
| Runner build, host pins, test:fixtures, image build, test:deployment, frontend, runner type-check/lint/unit, contracts, standalone static | CARRIED_FORWARD (PASS) | By digest equality, no re-execution. Details below |
| In-image `check-pins --require-image` | **NOT_GREEN_EXTERNAL (ED-05 / O-2a)** | EXTERNAL, not a regression. Node v24.20.0 in the public base image vs `.nvmrc` 22. Carried forward, not re-run. The image inputs and IDs are unchanged |

The collector's own exit-0 conditions all held: `sourceStable`, `distStable` and `testInputStable` true, `taskCollectionComplete` true with no errors, fresh non-empty XML, HTML and exec files for the required tasks, and no duplicated case across tasks.

### The two attempt03 root failures

- [V] `GuidedPublicationReplayIT.actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues()` PASSED. This is the first guided context push. **`CONTEXT_LOST` did not recur**: the log has 0 occurrences.
- [V] `GuidedPublicationAuthorityIT` `stored private returned history header-count` PASSED, with no Flyway `08001` or EOF. The log has 0 `EOFException` lines.
- [V] ReplayIT `queuedAndPreReadyRefusals()` and `editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness()` PASSED, as expected once test 1 publishes.

The log has 76 ERROR-level lines and none is a test failure. The 2 `An I/O error occurred while sending to the backend` lines are at 23:17:08 EDT. They come from a cached Spring context's scheduler and async user-provisioning, hitting an embedded Postgres that had just logged `received fast shutdown request` (SQLState 57P01). [I] This is context-cache teardown noise, the same family as in attempts 01 to 03.

## JaCoCo (LINE covered ratio)

Report XML: `reports/jacoco/test/jacocoTestReport.xml`. Ratios in `jacoco-line-summary.json`. I computed them from the XML. [V] The Gradle verification task passing is the authoritative result.

| Scope | Minimum | Actual | Covered / missed |
|---|---|---|---|
| Bundle | 0.70 | **0.9088** | 22468 / 2256 |
| `studio.dispatch` | 0.75 | 0.8620 | 962 / 154 |
| `studio.internal` | 0.75 | 0.9093 | 672 / 67 |
| `studio.recovery` | 0.75 | 0.8889 | 232 / 29 |
| `studio.sse` | 0.75 | 0.9258 | 237 / 19 |
| `studio.compile` | 0.80 | none | Vacuous: the package no longer exists (compile path removed) |
| `studio.compile.gateway` | 0.80 | none | Vacuous, same reason |

## Carry-forward (digest equality, no re-execution) [V]

`carry-forward-inputs.json` compares this attempt's `capture-before.json` with attempt03's, file by file. Both have 1647 files and identical hashes, and the dist files are identical. Attempt03's own `carry-forward-inputs.json` had already proven each gate's input-subset digest equal to the original gate manifest. Equal full trees therefore imply equal subsets. I did not recompute the subset digests.

| Gate | Carried verdict | Input files / subset digest |
|---|---|---|
| Runner build | PASS (dist unchanged) | 177 / `de1d5f84…` |
| Host `check:pins` | PASS | 177 / `de1d5f84…` |
| `test:fixtures` | PASS 252/0/9 | 228 / `b088ef53…` |
| Image build | PASS | 101 / `3d371c83…` |
| `test:deployment` | PASS 322/0/0 | 188 / `f024bc02…` |
| Frontend | PASS 701/701, type-check 0, lint 0 errors | 274 / `5988e697…` |
| Runner type-check, lint, unit | PASS, unit 2229/0/29 | 351 / `b01c94bd…` |
| Contracts + schema `--check` | PASS (7 sections, no write) | 248 / `a5f54fef…` |
| Standalone static (`static03`) | PASS, checkstyleMain 466 files / 0, checkstyleTest 332 / 0 | n/a. These tasks also re-ran and passed inside this `check` |

The image IDs were re-read with `docker image inspect` and are unchanged: runtime `sha256:e3a2d8bd…`, build stage `sha256:3ef3f968…`.

## Host state (`sysctl vm.swapusage`, `memory_pressure -Q`)

| | Before (22:50 EDT) | After (00:32 EDT) |
|---|---|---|
| `vm.swapusage` | total 5120M, used 4064M, free 1056M | total 7168M, used 5640M, free 1528M |
| Free memory | 46% | 71% |

The files are `host-before.txt` and `host-after.txt`. Free memory was 46% at launch, not the 50% in the brief. The swap file grew by 2 GB during the run, and used swap rose by about 1.6 GB. No infra failure occurred.

## Disclosures

- **Label.** `final-gate-attempt04-20261016T2252` did not exist before. It was launched with nohup (PID 80588), one Gradle run, `--no-daemon`, and polled to completion. No reruns.
- **Same inputs as attempts 02 and 03.** The command, flags and skips file are unchanged. The skips file is `final-gates01/approved-historical-skips.json` (sha256 `5a0755a4…a81`). The caveat stands: nothing independently ratifies it. The collector `run-backend-tasked.py` (sha256 `b81dbb25…`) is unchanged.
- **JDK.** As before, `/opt/homebrew/opt/openjdk@21` resolves to openjdk 23.0.2. Gradle runs on `org.gradle.java.home` = jdk-21.0.10.
- **Containers.** The 8 `supabase_*_outvo` containers were already stopped before launch and stayed stopped. The container set is identical before and after (compared by ID, image and name), and I started, stopped and removed none. The six exited `postgres:15-alpine` containers pre-date the run.
- **Processes.** The only remaining related process is the pre-existing PID 44737 (`guidedMain.js`), which I did not signal. I never touched PIDs 22246, 13577 or 13581.
- **Not archived.** The ReplayIT TEMP logs under `/var/folders/…/obs007-joined-*` are outside the repo, and I did not copy them. The run passed, so there is no failure to diagnose.
- **Files written.** Only under `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates04/` and the collector's own output in `execution/`. A scratch script is in the session scratchpad. Nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/`, root package files or `AGENTS.md` was edited. The pre-existing uncommitted changes in those paths are the frozen tree itself.
- **Reports.** I copied `backend/build/reports/jacoco` and `checkstyle` to `final-gates04/reports/`. The Gradle build had no `spotbugs` report directory, so none was copied.
