# STUDIO-OBS-015 final source-frozen gates — runbook (W6, adapted)

- **Author:** Gage (@devops), read-only preparation. **Date:** 2026-10-16.
- **Source plan:** `docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/claude-resume-plan-015.md` §4 W6 and §2 invariants.
- **Companion:** `commands.sh` in this folder. It is a reference script. It was syntax-checked (`bash -n`) and never executed.
- **This runbook grants no gate credit.** Every number below that has not been executed is labelled *expected* or *inferred*.

## 0. What I verified while preparing (read-only, nothing in the repo changed)

| Fact | Result | How |
|---|---|---|
| Live run | `run-backend-tasked.py w5-w01-full-test01 --test-tasks test -- --no-daemon --continue test --tests …ReplayIT --tests …AuthorityIT` was running (PID 27841, about 4 min in at 13:16Z) | `ps` |
| Collector flags | `--test-tasks` (subset of `test,guidedIncrementalTest,crossReplicaTest`), `--require-exec-tasks` (subset of test-tasks), `--allowed-skips-file` (exact `[{task,class,name}]` list; **default = zero skips allowed**), then `--` and the Gradle args. It refuses to reuse a label. It must run from the repo root. | read `run-backend-tasked.py` |
| Base wrapper | `run-backend.py` runs `caffeinate -i ./gradlew <args>` in `backend/` with `JAVA_HOME=/opt/homebrew/opt/openjdk@21/...`. It captures a whole-repo manifest before and after. | read |
| Runner build wrapper | `run-runner-build.py` hard-codes **`npm run build`**. That conflicts with the pnpm rule, so the build step below is captured by hand with the same `capture-manifest.py`. | read |
| Runner test wrapper | `run-runner.py` backs up and restores the STUDIO-OBS-007/013 fixture media **only when the argv contains the literal tokens `--config` and `vitest.fixtures.config.ts`**. It adds JSON reporters only when `argv[0]` contains `vitest`. A `pnpm … run test:fixtures` argv triggers neither, so `commands.sh` does both by hand. | read |
| pnpm `--` forwarding | pnpm 10.33.0 forwards a literal `--`. Through `run a -- --require-image`, `node p.mjs` received `["--","--require-image"]`. `scripts/check-pins.mjs` throws `Unknown argument "--"`. **Pass script args without `--`.** That is also why the earlier `-- --reporter=json` was ignored. | scratch package in the session scratchpad |
| Network | `registry.npmjs.org/playwright/1.63.0` → HTTP 200 (0.21 s). `mcr.microsoft.com/v2/` → 200. `registry-1.docker.io/v2/` → 401 (reachable). Docker Desktop proxy is `http.docker.internal:3128`. | `curl --max-time 10` |
| Docker | Server 27.4.0, 11 CPUs, 8.2 GB VM. Base `mcr.microsoft.com/playwright:v1.63.0-noble` is cached. Build cache holds `npm ci` layers (881 MB). `studio-runner/package.json` and `package-lock.json` are unchanged vs HEAD. | `docker version/images/system df/buildx du`, `git status` |
| Image Node | The previous runner image (`put-checks-studio-runner:obs012a-final-local`) records `node v24.20.0`, `chromiumBuild 1243` and `image null`. `.nvmrc` = `22`. | `docker run --rm --entrypoint cat … /app/dist/runtime-versions.json` (one throwaway container) |
| Helm / ffmpeg / Chromium | `helm v4.2.0`, `ffmpeg` present. `~/Library/Caches/ms-playwright/chromium-1243` present. | `which`, `ls` |
| Frontend | **0 of 274** `frontend/` files differ from the 015 baseline (`baseline-inputs.json`, captured 2026-10-15T03:48Z). The story says 015 "does not edit `frontend/src`". | hash comparison |
| JOIN inventory | ReplayIT has 74 test methods, and all 74 are in the Gradle lane lists. Expected identities: `test` = **46**, `guidedIncrementalTest` = 2 + 5 + 20 + 35 labels = **62**. | regex cross-check of the source and `build.gradle.kts` |
| Checkstyle sizing | See §2.3. I measured it with the cached google-java-format 1.22.0 and checkstyle 10.18.1 jars, on **scratchpad copies** of `backend/src`, under `nice -n 19`. The `pre main` count (177) equals the 04:19 Gradle `main.html` report exactly, which validates the method. | standalone jars |

**Disclosure.** The checkstyle sizing ran while the live JOIN run was active. It used about 5 s of wall time and about 35 s of CPU (niced; `-XX:ActiveProcessorCount=1` did not stop GC/JIT threads). If `w5-w01-full-test01` shows a timing-sensitive failure near 13:17–13:20Z, include this in its triage.

## 1. Global rules for this window

1. **One Gradle invocation at a time, and no runner build or fixtures run during any backend run.** Nothing else heavy runs alongside the backend check, including docker build/deployment, vitest or lint. Testcontainers and the deployment tier share the same 8 GB Docker VM.
2. **No source writer** from the end of step 1 (source freeze `S_F`) until the last receipt. **No `studio-runner/dist` writer** after step 4c (dist freeze `D_F`).
3. Use a fresh label per invocation. If anything fails, rerun under a new label (`…attempt02`). Never edit a receipt.
4. Run every wrapper and `capture-manifest.py` call from the repo root `/Users/brunobuger/orca/workspaces/put-checks/ui-studio`.
5. Runner scripts use `pnpm --config.package-manager-strict=false run <script> [args]`, **with no `--`**. Never install and never write a lockfile. (`pnpm --version` fails inside `studio-runner/` because of `packageManager: npm`; the flag above is what works.)
6. Never signal the inherited PIDs (22246 and the other inherited roots). Use `--no-daemon` everywhere.
7. Wrapper receipts go to `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/` (fixed by the wrappers). Hand-captured receipts go to `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates01/` (`$FG`, created at step 0).

## 2. Step 1 — formatting window (exclusive, before anything is frozen)

**Precondition.** `w5-w01-full-test01` is terminal and its capture and cleanup are done. Every owner (Dex-JOIN, Dex-AUTH, Dara, backend Dex, Dex-snapshot, runner) has acknowledged HOLD. Root issues **one** cross-owner, format-only lease to one writer (Dex-FMT). File owners review their own diffs afterwards.

### 2.1 Commands (`commands.sh s01_*`)

| # | Command (in `backend/`, `JAVA_HOME` = homebrew openjdk 21) | Expected | Receipt |
|---|---|---|---|
| 1a | capture manifest; `./gradlew --no-daemon compileJava compileTestJava`; tar `build/classes/java` | exit 0 | `$FG/fmt01-before.json`, `fmt01-classes-before.tgz`, `fmt01-compile-before.log` |
| 1b | `./gradlew --no-daemon spotlessApply` | exit 0. **About 97 files rewritten** (inferred from a `gjf --dry-run` with the same options). | `fmt01-spotlessApply.log`, `fmt01-after-apply.json`, `fmt01-spotless-changed.json` |
| 1c | `./gradlew --no-daemon spotlessCheck` | exit 0 | `fmt01-spotlessCheck.log` |
| 1d | `./gradlew --no-daemon --continue checkstyleMain checkstyleTest` | **exit 1, about 873 violations** (§2.3) | `fmt01-checkstyle-r1.log` + copies of `build/reports/checkstyle/{main,test}.html` |
| 1e | manual fixes (§2.4), then repeat 1b → 1c → 1d (`-r2`, `-r3`, …) | final round exit 0, `0` violations in both reports | one log set per round |
| 1f | `./gradlew --no-daemon spotbugsMain` (HIGH confidence, main only; `spotbugsTest` is disabled) | **unknown**: never run in 015 | `fmt01-spotbugs.log` + `build/reports/spotbugs/**` |
| 1g | compile again; `javap -c -p` before/after diff with constant-pool indices stripped | brace and literal-split edits are bytecode-identical (inferred: compile-time constant folding). Listed diffs only where code was restructured (§2.4) | `fmt01-neutrality.json` |
| 1h | owner diff review + Quinn review of `fmt01-neutrality.json`; then capture `final-source-frozen.json` | digest = **`S_F`** | `$FG/final-source-frozen.json` |

`spotlessApply` changes ReplayIT, AuthorityIT and others. Every hash anchor so far (JOIN f279…, AuthorityIT e622…) becomes historical. That is the reason the neutrality receipt exists.

### 2.2 Checkstyle config facts (`backend/config/checkstyle/checkstyle.xml`, checkstyle 10.18.1, `maxWarnings 0`, severity error)

- `LineLength` max **120**. The ignore pattern only covers `package`, `import` and URLs.
- `Indentation` (basic 2, line-wrap 4, case 2), `NeedBraces`, `LeftCurly`/`RightCurly`, `WhitespaceAround` (empty ctors/types/methods allowed; **empty lambdas not allowed**), `WhitespaceAfter`, `GenericWhitespace`.
- Imports: `AvoidStarImport`, `UnusedImports`, `RedundantImport`, `IllegalImport`.
- `ModifierOrder`, `RedundantModifier`, `EmptyCatchBlock` (variable must be `expected|ignore`).
- Naming: `MemberName`, `MethodName`, `ParameterName`, `LocalVariableName`, `LocalFinalVariableName`, `StaticVariableName`, `ConstantName`, `TypeName`, `PackageName`, type-parameter names (checkstyle defaults, `^[a-z][a-zA-Z0-9]*$` and similar).
- `SuppressionFilter` points to `${config_loc}/suppressions.xml` (`optional=true`). **That file does not exist.** Adding one would weaken a gate, so it needs explicit user approval. It is not part of this runbook.

### 2.3 Measured size (scratch copies, gjf 1.22.0 `--skip-sorting-imports --skip-reflowing-long-strings` = spotless defaults)

| Set | Before format | After format (residual that spotless cannot fix) |
|---|---|---|
| main | 177 in 26 files | **39 in 12 files**: 25 NeedBraces, 12 LineLength, 2 WhitespaceAround |
| test | 11,553 in 35 files | **834 in 27 files**: 530 NeedBraces, 235 LineLength, 57 Indentation, 12 WhitespaceAround |
| ReplayIT | 1,055 | **276**: 200 NeedBraces, 60 LineLength, 10 Indentation, 6 WhitespaceAround |
| AuthorityIT | 84 | **33**: 19 NeedBraces, 14 LineLength |

No naming, import, modifier or empty-catch violations remain after formatting.

Largest residual files (test):

| File | Residual | Owner |
|---|---|---|
| `GuidedPublicationReplayIT` | 276 | Dex-JOIN |
| `GuidedPublicationMigrationTest` | 120 | Dara |
| `GuidedReplayingPrefixMigrationIT` | 106 | Dara |
| `support/GuidedPublicationEvidenceFixture` | 58 | Dara |
| `GuidedWireContractTest` | 58 | backend |
| `support/LegacyV20ConfirmedBaseFixture` | 41 | Dara |
| `GuidedPublicationAuthorityIT` | 33 | Dex-AUTH |
| `IncrementalPublicationConformanceTest` | 27 | backend |
| `SnapshotBasisParityTest` | 26 | Dex-snapshot |
| `IncrementalBoundaryFixture` | 21 | backend |
| `SnapshotBasisValidationTest` | 18 | Dex-snapshot |
| 16 more files | 1 to 11 each | various |

Main residual is concentrated in `GuidedBasisValidator` 9, `GuidedTranslationStore` 7, `GuidedIncrementalStore` 6, `ObservedArtifactLowerer` 4 and `GuidedEffectiveGraph` 4.

### 2.4 How to fix what spotless does not fix

| Rule | Count | Fix that survives the next `spotlessApply` | Bytecode |
|---|---|---|---|
| NeedBraces | 555 | Add `{ }` to single-statement `if`/`else`/`for`/`while` bodies. gjf then lays them out. Purely mechanical. | identical (inferred) |
| LineLength | 247 | gjf already wrapped all code. What remains is long **string literals** (split into `"…" + "…"`), long `//` comments (rewrap), and long annotation arrays (for example ReplayIT `@ValueSource(strings = {…})` at line 3811: one element per line). | identical for literal concatenation (constant folding, inferred) |
| Indentation | 57 | A **gjf/checkstyle conflict**: gjf indents switch-expression `case` bodies and nested `{}` blocks in a way checkstyle's `Indentation` rejects. Formatting cannot satisfy both. Restructure: extract the switch into a helper method, or use `if`/`else`. | changes; listed in `fmt01-neutrality.json` |
| WhitespaceAround | 14 | Also a **conflict**: gjf forces `() -> {}` / `x -> {}`, and checkstyle forbids empty lambdas. Replace with a named no-op (for example a private static `ignore(...)` method reference). Example: `GuidedSourceSnapshotRepository.java:28 lockCurrent(testId, csi -> {})`. | changes (lambda → method ref); listed |

**Effort estimate (inferred).** About 873 sites in 39 files. NeedBraces takes about 1.5–2.5 h of agent time, LineLength about 1–1.5 h, Indentation/Whitespace about 0.5–1 h, and 2–3 Gradle rounds plus the neutrality compile about 0.5–1 h. Total **3–6 h**, plus owner and Quinn review. Each Gradle round (`spotlessApply` + `checkstyle`, no daemon) takes about 2–4 min. For faster iteration, `commands.sh fmt_fast_check <files…>` runs the same gjf and checkstyle jars straight from the Gradle cache on **scratch copies** in seconds. The authoritative result is still the Gradle task.

SpotBugs (step 1f) cannot be sized without running it. Run it right after the first `spotlessApply` round, so its findings join the same window.

## 3. Step 2 — backend preflight at `S_F` (serial, about 10 min)

| # | Command | Expected | Receipt |
|---|---|---|---|
| 2a | **Skip discovery** via the *base* wrapper, which has no skip policy: `python3 …/run-backend.py final-skipdisc01 --no-daemon --continue test --tests <6 skip-bearing classes>` | exit 0. SKIP rows for the externally gated and disabled cases (§3.1) | `execution/final-skipdisc01-results.json` (+ `-xml/`), then `$FG/skip-candidates-final01.json` (extracted) |
| 2b | **Quinn** reviews the candidates against ADR/ED deferrals and writes `$FG/approved-historical-skips.json` (exact `[{task:"test",class,name}]`) | an independent decision, not Gage's | the file (hash it) |
| 2c | **SQL55**: `python3 …/run-backend-tasked.py final-sql55-attempt01 --test-tasks test --require-exec-tasks test -- --no-daemon test --tests com.citi.put.checks.studio.guided.GuidedReplayingPrefixMigrationIT` | exit 0, **55/55**, 0 skips, `sourceStable` and `distStable` true. Attempt05 took 15 s of Gradle time; with no daemon, about 2–3 min. | `execution/final-sql55-attempt01-results.json` + `-task-outputs/` |

### 3.1 Why 2a exists

With no skip file, the collector fails `EXACT_SKIP_POLICY_MISMATCH` on **any** skipped case. The final `check` runs the whole default `test` lane, which has historical skips. OBS-012A run5b recorded 25 across these classes:

- `SharedSchedulingIT` (2)
- `ExecutionVideoExternallyGatedCriteriaTest` (2)
- `GuidedProviderEvaluationTest` (1 in run5b; the file now has 2 `assumeTrue` and is modified)
- `ExecutionReadinessTest` (1)
- `StudioScheduleApiIT` (16)
- `secrets.ExternallyGatedCriteriaTest` (3)

Four of these six files are modified in the working tree, so the 012A list cannot be reused blind. Without 2a, a skip mismatch would only show up after about 90 minutes of `check`.

## 4. Step 3 — runner read-only gates at `S_F` (about 3–5 min; may run in parallel with each other, never with a Gradle run)

| # | Command (via `run-runner.py`, cwd `studio-runner/`) | Expected | Receipt |
|---|---|---|---|
| 3a | `pnpm --config.package-manager-strict=false run type-check` | exit 0 | `execution/runner-final-typecheck01-results.json` + log |
| 3b | `… run lint` | exit 0, 0 problems (lint-cleanup01 round 2) | `runner-final-lint01-*` |
| 3c | `… run test --reporter=default --reporter=json --outputFile=<OUT>/runner-final-unit01-vitest.json` | exit 0, **2223 passed / 0 failed / 29 skipped** (104 files passed, 1 skipped). All V8 thresholds pass (global 85/85/80/80 plus 6 globs). | `runner-final-unit01-results.json` (with a `vitest` block), `$FG/runner-final-unit01-coverage-summary.json` (copied by hand) |
| 3d | repo root: `node tools/check-studio-observed-contracts.cjs` and `node tools/build-studio-observed-schemas.cjs --check`, with a manifest captured before and after | both exit 0; manifests identical (no write) | `$FG/contracts-final01.{log,json}`, `$FG/codegen-check-final01.log` |
| 3e | Frontend: **N/A for 015** (0 changed files vs the 015 baseline; the story says 015 does not edit `frontend/src`). Optional regression only: `cd frontend && pnpm … run type-check`, `run lint`, `run test --run` (the script is watch-mode `vitest`). | — | none required |

## 5. Step 4 — runner dist-writing gates (strictly serial; freezes `D_F`)

| # | Command | Expected | Receipt |
|---|---|---|---|
| 4a | **build**: capture → `pnpm … run build` (in `studio-runner/`) → capture → hand receipt | exit 0, source stable. Dist digest expected **`060d9a53239cf1bd…`** if runner src is unchanged since lint-cleanup01 round 2. The current dist is already that digest (w5 collector log). If it differs, record the digest; that is not a failure by itself. | `$FG/runner-final-build01-{before,after}.json`, `.log`, `-receipt.json` |
| 4b | `run-runner.py runner-final-pins01 pnpm … run check:pins` | exit 0. `chromiumBuild` and `image` are NOT ASSERTED on the host (expected) | `execution/runner-final-pins01-*` |
| 4c | protect 007/013 media (by hand, mirroring the wrapper) → `run-runner.py runner-final-fixtures01 pnpm … run test:fixtures --reporter=default --reporter=json --outputFile=<OUT>/runner-final-fixtures01-vitest.json` → restore and index | exit 0. **`distStable` true** (globalSetup re-emits the same bytes as 4a). Real Chromium. Deferral skips as named (012A: 9 in `deadline-cleanup`, `seek-measurement`, `upload-evidence`); new 015 fixture files add cases. | `runner-final-fixtures01-results.json`, `-vitest.json`, `$FG/runner-final-fixtures01-artifact-index.json`; new `docs/qa/evidence/STUDIO-OBS-015/native-fixtures/**` manifests retained |
| 4d | capture `$FG/final-dist-frozen.json` | dist digest = **`D_F`** = the post-4a digest | that file |

The "native/Chromium tier" **is** `test:fixtures`. The 015 native attempts were `vitest.fixtures.config.ts` subsets. The full tier supersedes them. The equivalent `pnpm exec vitest run --config vitest.fixtures.config.ts` form would let `run-runner.py` protect the media itself. `commands.sh` keeps your `run test:fixtures` rule and does the protection by hand.

## 6. Step 5 — image and deployment tier (before the backend check, to surface network/O-2a early; no tree writes)

| # | Command | Expected | Receipt |
|---|---|---|---|
| 5a | `docker build --progress=plain --target build --build-arg IMAGE_TAG=$TAG -t $BTAG studio-runner/`, then the same without `--target` and with `-t $TAG` | exit 0. `npm ci` layers expected cached (lock unchanged). `COPY src/scripts/fixtures` and `RUN npm run build` rebuild. About 2–5 min. **Network:** BuildKit resolves `# syntax=docker/dockerfile:1` from Docker Hub (reachable now). A cache miss on `npm ci` needs registry.npmjs.org (reachable now, 407 lockfile entries). | `$FG/image-final01-build{stage,}.log`, `$FG/image-final01-inspect.json` |
| 5b | dist parity: sha of `/app/dist` file list in `$BTAG` vs `$TAG` | equal | `$FG/image-final01-dist-parity.json` |
| 5c | **in-image pins**: `docker run --rm --entrypoint node $BTAG scripts/check-pins.mjs --require-image --json` | **Expected RED (exit 1), known open item O-2a.** The public base image ships Node **v24.20.0** against `.nvmrc 22`, and `ci/stages.md` §6a says "Expect this stage to fail against the public base image until ED-05". `image` is asserted because `IMAGE_TAG` is passed. Record the verdict as `NOT_GREEN_EXTERNAL (ED-05)`. Do not edit `.nvmrc`. | `$FG/image-final01-check-pins.{json,exit}`, `$FG/image-final01-runtime-versions.json` |
| 5d | `STUDIO_RUNNER_IMAGE=$TAG run-runner.py runner-final-deployment01 pnpm … run test:deployment` | exit 0. 012A had 8 files / 313 tests in about 55 s. Fails closed if helm, docker or the image is missing. | `execution/runner-final-deployment01-*` |

Why the build stage: the runtime stage holds only `dist/` and `browser-provenance.mjs`, with no `check-pins.mjs`, `Dockerfile`, `.nvmrc` or `src/validator`. The `ci/stages.md` §6a host form, which copies the image's `runtime-versions.json` into the host `dist/`, would **mutate the frozen dist**. It would also fail the new "observed Chromium provenance" check, because on darwin that check reads the host's mac Chromium (`envBrowserRoot`). The build stage contains everything `check-pins.mjs --require-image` reads, plus the image's own `PLAYWRIGHT_BROWSERS_PATH`. Its `dist` is the one copied into the runtime image (verified in 5b).

## 7. Step 6 — backend final `check` at `S_F` + `D_F` (about 75–110 min, inferred; run in the background)

1. **6a — archive prior outputs** (invariant 4): `tar czf $FG/prior-backend-build-outputs-final01.tgz -C backend build/reports build/test-results build/jacoco build/guided-cohorts build/guard-tally` and the `/tmp/studio-obs005-*.json` Planning metrics, plus `sha256`.
2. **6b — the collector:**
   ```
   python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/run-backend-tasked.py backend-final-check-attempt01 \
     --test-tasks test,guidedIncrementalTest,crossReplicaTest \
     --require-exec-tasks test,guidedIncrementalTest \
     --allowed-skips-file docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates01/approved-historical-skips.json \
     -- --no-daemon --continue check --rerun-tasks
   ```
   - `--continue` is added to the plan's W6 form. One long run then yields the full failure inventory. The exit code is still authoritative.
   - `crossReplicaTest` is collected but not exec-required: it is not in the JaCoCo verification data.
3. **6c — post-run:** archive `build/reports/jacoco/test/**` (the XML is not archived by the collector), `build/reports/{checkstyle,spotbugs}/**` and the `build/reports/rds-parity*` files if present. Compute the JaCoCo ratios from the XML. Run a read-only process audit (no owned JOIN Node roots alive) and `docker ps -a` for Testcontainers containers. Clean up only owned processes with proved identity.
4. **6d — restore prior outputs** (invariant 4). This is root's decision for the final run: the fresh outputs are already archived by the collector.

**What `check` runs.**
- **Static:** `spotlessCheck`, `checkstyleMain`, `checkstyleTest`, `spotbugsMain`, `rdsParityLint`, `antiRegressionCheck`, `testcontainersAlignmentCheck`.
- **Tests:**
  - `test` lane: everything except `SseCrossReplicaIT` and the 62 low identities. Includes SQL55 and the 46 default JOIN cases (profile `original4000`).
  - `guidedIncrementalTest` lane: 62 identities, profile `incremental2048`, `forkEvery 1`, about 40 min (w4-full-incr02: 2414 s).
  - `crossReplicaTest`.
- **Then:** `retainOriginal/IncrementalGuidedCohort`, `requireFreshGuidedPartitions` (exact 46 / 62 identities, all `passed` and `afterEachComplete`, and audit/privacy/producer/model/budget/response evidence complete), `jacocoTestReport`, `jacocoTestCoverageVerification`.

**JaCoCo thresholds** (merged `test.exec` + `guidedIncrementalTest.exec`, excluding `ChecksApplication`, `dto`, `entity`, `generated`):

| Scope | LINE COVEREDRATIO minimum |
|---|---|
| Bundle | ≥ 0.70 |
| `studio.dispatch` | ≥ 0.75 |
| `studio.internal` | ≥ 0.75 |
| `studio.recovery` | ≥ 0.75 |
| `studio.sse` | ≥ 0.75 |
| `studio.compile` | 0.80 |
| `studio.compile.gateway` | 0.80 |

The `studio.compile` and `studio.compile.gateway` packages **no longer exist** (compile path removed), so those two rules match nothing and pass vacuously. Disclose this in the QA receipt.

**Collector exit 0 requires:**
- Gradle exit 0;
- `sourceStable` and `distStable` true;
- fresh non-empty XML and HTML for all 3 tasks;
- fresh non-empty `test.exec` and `guidedIncrementalTest.exec`;
- exactly one fresh complete cohort per JOIN lane;
- no case duplicated across tasks;
- the skip multiset exactly equal to the approved file;
- passed > 0, with zero failures and zero errors.

## 8. Step 7 — final binding (about 2 min)

Assert that every receipt from steps 2–6 records source digest `S_F`, and every receipt from 4d onward records dist `D_F`. Write `$FG/final-gates-index.json` with the path and sha256 of each receipt, the image IDs, and the verdict per gate (GREEN / RED / NOT_GREEN_EXTERNAL). Hand this to Quinn (W7). The Dev Agent Record, O-1 counts and M12 stay with Dex (W7).

## 9. Serialization, freezes and durations

| Order | Step | Freezes / reads | Duration (inferred unless noted) |
|---|---|---|---|
| 0 | preflight (`s00`) | — | 2 min |
| 1 | formatting window | ends with **`S_F`** | 3–6 h (checkstyle manual work dominates) + review |
| 2 | skip discovery → Quinn approval → SQL55 | reads `S_F` | 5–8 min + approval |
| 3 | runner type-check / lint / unit / contracts | reads `S_F` | 3–5 min (unit measured 11 s of vitest time) |
| 4 | build → pins → fixtures | ends with **`D_F`** | 6–12 min (012A full fixtures: 218 s; 015 added files) |
| 5 | image ×2 → parity → in-image pins → deployment | image ID frozen | 4–8 min (cached `npm ci`); +3–5 min if `npm ci` reruns |
| 6 | backend `check --rerun-tasks` | reads `S_F` + `D_F` | 75–110 min (the low lane alone is about 40 min, measured; the default JOIN classes are about 19 min, measured w3 1154 s; rest of the suite and static analysis inferred) |
| 7 | binding index | — | 2 min |

**Total ETA:** about 2.3–3 h of serialized gate time after the formatting window. End to end that is about **5.5–9 h**, mostly checkstyle remediation and review. Any source change after `S_F` restarts from step 2 under new labels.

## 10. Risks

1. **Checkstyle effort (highest).** About 873 post-spotless violations, 71 of which are gjf/checkstyle conflicts that need small code restructures. Restructured sites change bytecode and need owner and Quinn acceptance. The alternative, a `suppressions.xml`, weakens a gate and needs user approval.
2. **In-image `check:pins --require-image` is expected RED** (Node 24 vs `.nvmrc` 22, O-2a / ED-05). This cannot go green locally. The verdict for that gate is NOT_GREEN_EXTERNAL unless the user rules otherwise.
3. **SpotBugs** has never run on 015 main code. Its size is unknown.
4. **Network.** Everything needed is reachable now. If Docker Hub or npm become unreachable, 5a fails: the `syntax` frontend always resolves, and `npm ci` needs the registry on a cache miss. Then record image, pins and deployment as NOT_ASSERTED and escalate (plan §6).
5. **Skips.** An unapproved or changed skip set makes the final collector RED. Step 2 mitigates this.
6. **Coverage.** The JaCoCo bundle (70%) and 4 package floors have not been evaluated in 015. The two compile rules are vacuous.
7. **CPU / VM contention** can cause JOIN flakes and Testcontainers OOM (8 GB VM). Strict serialization is the mitigation: no other session work during step 6.
8. **Fixture media.** `pnpm run test:fixtures` bypasses the wrapper's 007/013 backup. `commands.sh s04c_*` must run its protect and restore around it.
