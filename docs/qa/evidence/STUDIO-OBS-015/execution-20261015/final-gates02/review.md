# STUDIO-OBS-015 final source-frozen gates, attempt02 (final-gates02), Gage (@devops)

2026-10-16, 22:00Z to 23:35Z. HEAD `734ad704f`, uncommitted tree. I made no commits, did no push and edited no source. The machine-readable receipt is `receipt.json`. [V] means I ran it and read the output. [I] means inferred.

## Freeze binding

| | Source | Dist |
|---|---|---|
| attempt01 `S_F` / `D_F` | `1cd2c7817818720b711be15381709c84c02cc430290d6180a1e04834caf58d92` | `80d1ba1d43b3f571d9a882459676484bd165ab850143d2ac06b3bd781462467e` |
| `capture-before.json` (22:00Z) = `S_F2` | `18767a1542edf73fad91fe387ff2bbd4c28715dfb50282519fb60e1a2d083164` | `80d1ba1d…` (= D_F) |
| `capture-after.json` (23:34Z) | identical file list and hashes | identical |

[V] Against `S_F`, exactly 5 files changed, with 0 added and 0 removed (`capture-before-vs-SF.json`): `backend/build.gradle.kts`, `GuidedProposalValidator.java`, `GuidedPublicationReplayIT.java`, `studio-runner/test/observedIncrementalValidation.test.ts` (sha256 `17a779b9…`) and `studio-runner/test/observedReplayValidation.test.ts`. No runner `src` or `dist` changed. Every wrapper before/after manifest in this attempt carries `S_F2` and `D_F`. There are 1647 files in scope.

## Gates

| Gate | Verdict | Exit | Counts / result | Duration |
|---|---|---|---|---|
| Gradle `spotlessCheck checkstyleMain checkstyleTest spotbugsMain` | PASS | 0 | Spotless and Checkstyle were UP-TO-DATE (their inputs match w7's passing run). Only spotbugsMain executed | 16 s |
| Same tasks with `--rerun-tasks` (forced execution) | PASS | 0 | checkstyleMain 466 files / 0 violations. checkstyleTest 332 files / 0 violations, **no OOM** (2g). Spotless and SpotBugs passed | 36 s |
| runner type-check (`runner-final-typecheck03`) | PASS | 0 | — | 6.4 s |
| runner lint (`runner-final-lint03`) | PASS | 0 | — | 9.8 s |
| runner unit (`runner-final-unit03`) | PASS | 0 | **2229 / 0 / 29**, 104 files passed + 1 skipped. Coverage: lines 97.25, branches 89.11, functions 97.12 | 13.1 s |
| contracts (+ `build-studio-observed-schemas.cjs --check`) | PASS | 0 (+0) | 7 PASS sections. No write (before = after) | ~2 s |
| runner build, host check:pins, test:fixtures, image build, test:deployment, frontend | CARRIED FORWARD, inputs identical | — | attempt01 results: build PASS, pins PASS, fixtures 252/0/9, image PASS, deployment 322/0/0, frontend 701/701 + type-check + lint 0 errors | — |
| in-image `check-pins --require-image` | CARRIED FORWARD: FAIL, NOT_GREEN_EXTERNAL (ED-05 / O-2a) | — | Node v24.20.0 vs `.nvmrc` 22. The image's inputs are unchanged | — |
| **backend `check --rerun-tasks` via collector** (`backend-final-check-attempt02`) | **FAIL** | 1 (Gradle 1) | `test` **2412 / 2367 / 20 fail / 25 skip**. `guidedIncrementalTest` **62 / 62**. `crossReplicaTest` **2 / 2**. The skip multiset equals the approved 25. Collection complete; source, dist and test inputs stable | 5366 s (1 h 29 min) |
| SQL55 `GuidedReplayingPrefixMigrationIT` | PASS (inside `check`) | — | **55 / 55**, 0 skipped | — |
| JaCoCo report/verification, `requireFreshGuidedPartitions` | **NOT RUN** | — | No such task appears in the log. Gradle did not schedule them after `:test FAILED`. Coverage floors were not evaluated | — |

**How the carry-forward was verified [V].** `carry-forward-inputs.json` compares each attempt01 gate's own before-manifest with `capture-before.json`. It uses the input subset for each gate plus the dist digest. All 6 input sets are identical:
- build and pins: 177 files
- fixtures: 228
- image: 101
- deployment: 188
- frontend: 274

The two changed runner files are top-level `test/*.test.ts`, which only the unit tier picks up. `vitest.fixtures.config.ts` includes only `test/fixtures-tier/**`, and `vitest.deployment.config.ts` includes only `test/deployment/**`. No file imports either changed test. The Dockerfile copies no `test/`. The image IDs are unchanged: `e3a2d8bd…` runtime and `3ef3f968…` build stage.

The static tasks inside `check` were spotlessCheck, checkstyleMain, checkstyleTest (no OOM), spotbugsMain, rdsParityLint, antiRegressionCheck and testcontainersAlignmentCheck. All of them executed without failure.

## Failures (verbatim)

**F1. `test` lane: 20 failures in two classes.** There are two primary failures and 18 cascade failures.

The first primary failure is `GuidedPublicationReplayIT.actualPoolDefiniteRefusalThenFreshSecretAttemptResolvesRotatedValue()`, which ran 68.3 s and was test 28 of 46 in the class:
```
org.opentest4j.AssertionFailedError: [actual P3 ordinary terminal status]
expected: "PASSED"
 but was: "ERROR"
	at ...GuidedPublicationReplayIT.p3AwaitExecution(GuidedPublicationReplayIT.java:27128)
	at ...GuidedPublicationReplayIT.p7FaultAndRetry(GuidedPublicationReplayIT.java:22086)
```

The second primary failure is `ObservationPolicyIT.originsOutsideTheTrustedPolicyAreInvalidAtWriteAndIncompatibleAtStart()` (ObservationPolicyIT.java:209):
```
org.springframework.dao.DuplicateKeyException: PreparedStatementCallback; SQL [INSERT INTO studio_guided_policies(policy_id,csi_id,application_id,environment_id,created_by) VALUES (?,?,?,?,?)]; ERROR: duplicate key value violates unique constraint "studio_guided_policies_csi_id_application_id_environment_id_key"
  Detail: Key (csi_id, application_id, environment_id)=(61139, studio-fixture, Production) already exists.
```

The cascade is 18 later `GuidedPublicationReplayIT` methods, each taking 0.21–0.25 s and each failing at `beginOwnedSessionTracking(GuidedPublicationReplayIT.java:3730)`:
```
org.opentest4j.AssertionFailedError: [prior failed-test actual worker teardown was not confirmed; inspect cleanup evidence]
Expecting value to be false but was true
```
`receipt.json` lists all 20 by name.

- [V] Both primary tests **passed** in attempt01. They are new failures, not carry-overs.
- [V] Of attempt01's 7 failures, 6 now pass:
  - the zero- and two-password validator tests
  - the 4 `guidedIncrementalTest` prefix pins
- [V] The seventh, `incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent`, is in the cascade, so this run did not evaluate it.
- [V] The `test` log also contains a scheduled-task `PSQLException: An I/O error occurred while sending to the backend` (EOF) from `GuidedTranslationCoordinator.continueRuns`. I did not determine whether it is related.
- [I] The ReplayIT primary looks like a runtime or timing failure of a single P3/P7 execution (terminal `ERROR`). It does not look like a line pin. The w7 diff does touch this class, and I did not rule out a link.
- [I] The ObservationPolicyIT failure looks like fixture-key collision or leftover state between ITs that share a database. I did not trace either one.
- Per instruction I did not rerun or fix anything.

## Disclosures

- **Static UP-TO-DATE.** The command as specified executed only spotbugsMain, because Gradle judged the inputs identical to the w7 run. I added a `--rerun-tasks` run so all four tasks actually executed in this window. Both runs exit 0.
- **Labels.** I used fresh labels: `runner-final-typecheck03`, `runner-final-lint03`, `runner-final-unit03` and `backend-final-check-attempt02`. My first type-check/lint invocation piped the wrapper stdout into a JSON parser that failed on the wrapper's multi-line output. The wrapper runs themselves completed (exit 0, results files written), so I read the results files instead. No label was reused.
- **Unit coverage summary.** The wrapper does not copy it when the command starts with `pnpm`. I copied `studio-runner/coverage/coverage-summary.json` (written 18:02:56 local, by this run) to `runner-final-unit03-coverage-summary.json`.
- **Skips file.** It is the same `final-gates01/approved-historical-skips.json` (sha256 `5a0755a4…a81`) with the same caveat as attempt01: nothing independently ratifies it.
- **JDK.** As in attempt01, `/opt/homebrew/opt/openjdk@21` resolves to openjdk 23.0.2. Gradle runs on `org.gradle.java.home` = jdk-21.0.10.
- **Post-run audit.**
  - The set of Docker containers is the same before and after the run: 8 unrelated Supabase containers, none removed.
  - No Testcontainers containers remain.
  - The only remaining process is the pre-existing PID 44737 (`guidedMain.js`, started 2026-10-10), which I did not signal.
  - I never touched PIDs 22246, 13577 or 13581.
- **Prior outputs.** I did not archive or restore prior backend build outputs this time. The collector archived the fresh outputs under `execution/backend-final-check-attempt02-task-outputs/`.
