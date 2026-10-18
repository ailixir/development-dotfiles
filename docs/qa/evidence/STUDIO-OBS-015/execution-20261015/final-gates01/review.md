# STUDIO-OBS-015 final source-frozen gates (final-gates01), Gage (@devops)

2026-10-16, 19:56Z to 21:45Z. HEAD `734ad704f`, uncommitted tree. I made no commits, did no push and edited no source. Runbook: `../final-gates-runbook01/`. Machine-readable receipt: `receipt.json`. [V] means I ran it and read the output. [I] means inferred.

## Freeze binding

| | Source `S_F` | Dist `D_F` |
|---|---|---|
| `freeze-start.json` (19:56Z) | `1cd2c7817818720b711be15381709c84c02cc430290d6180a1e04834caf58d92` | `80d1ba1d43b3f571d9a882459676484bd165ab850143d2ac06b3bd781462467e` |
| `freeze-end.json` (21:44Z) | identical | identical |

[V] All 25 before/after manifests in the receipt carry `S_F` and `D_F`, and so do the wrapper receipts. The runner build left dist byte-identical, so `D_F` equals the pre-build dist. 1647 files are in scope.

## Gates

| Gate | Verdict | Exit | Counts / result | Duration |
|---|---|---|---|---|
| Gradle `spotlessCheck checkstyleMain checkstyleTest spotbugsMain` (`--continue`) | **FAIL** | 1 | spotlessCheck pass. checkstyleMain 466 files / 0 violations. spotbugsMain pass. **checkstyleTest crashed** (see F1) | 50 s |
| checkstyle 10.18.1 CLI (authoritative count) | PASS | 0 / 0 | main 466 files / **0**, test 332 files / **0** | 12 s |
| Diagnostic only, not a gate: Gradle checkstyleTest with Checkstyle `maxHeapSize=2g` (out-of-tree init script) | info | 0 | 332 files / 0. The Gradle failure is heap only | 28 s |
| runner type-check (`runner-final-typecheck02`) | PASS | 0 | — | 7.4 s |
| runner lint (`runner-final-lint02`) | PASS | 0 | — | 11.1 s |
| runner unit attempt01 | **FAIL** | 1 | 2228 / **1 fail** / 29 skip (F2) | 14.0 s |
| runner unit attempt02 | PASS | 0 | **2229 / 0 / 29**. Coverage lines 97.25, branches 89.1, functions 97.12 | 12.9 s |
| `node tools/check-studio-observed-contracts.cjs` (+ `build-studio-observed-schemas.cjs --check`) | PASS | 0 (+0) | 5 PASS sections; no write | ~2 s |
| runner build (`pnpm … run build`) | PASS | 0 | dist digest unchanged (`80d1ba1d…`) | 2 s |
| runner check:pins, host (no `--`) | PASS | 0 | `chromiumBuild` and `image` NOT ASSERTED on the host (expected) | 0.4 s |
| runner test:fixtures, Chromium tier (007/013 media protected by hand) | PASS | 0 | **252 / 0 / 9**, 21 files passed + 3 skipped. 3238 media files backed up; 22 changed and restored (`runner-final-fixtures01-artifact-index.json`) | 254 s |
| docker build (build stage, then runtime) | PASS | 0 / 0 | runtime `sha256:e3a2d8bd…`, build stage `sha256:3ef3f968…`. `/app/dist` parity equal (`f9f5f456…`) | 8 s + <1 s |
| in-image `check-pins.mjs --require-image` | **FAIL** (NOT_GREEN_EXTERNAL, ED-05 / O-2a, as expected) | 1 | single failure: Node v24.20.0 vs `.nvmrc` 22 (F3) | — |
| runner test:deployment (`STUDIO_RUNNER_IMAGE=…obs015-final01-local`) | PASS | 0 | **322 / 0 / 0**, 8 files | 44 s |
| frontend vitest run | PASS | 0 | **701 / 701**, 56 files | 108 s |
| frontend type-check / lint | PASS | 0 / 0 | lint 0 errors, 302 warnings | 8 s / 3 s |
| **backend `check --rerun-tasks` via collector** (`backend-final-check-attempt01`) | **FAIL** | 1 (Gradle 1) | `test` **2412 / 2384 / 3 fail / 25 skip**. `guidedIncrementalTest` **62 / 58 / 4 fail**. `crossReplicaTest` 2/2. Skip multiset equals the approved 25. Collection complete, source and dist stable | 5650 s (1 h 34 min) |
| SQL55 `GuidedReplayingPrefixMigrationIT` | PASS (inside `check`) | — | **55 / 55** in the `test` lane; no separate run needed | — |
| JaCoCo report and verification, `requireFreshGuidedPartitions` | **NOT RUN** | — | skipped by Gradle because `test` and `guidedIncrementalTest` failed. Coverage floors not evaluated | — |

The static tasks inside `check` were spotlessCheck, checkstyleMain, spotbugsMain, rdsParityLint, antiRegressionCheck and testcontainersAlignmentCheck. All of them ran without failure. checkstyleTest failed again, with the same error as F1.

## Failures (verbatim first lines)

**F1. Gradle checkstyleTest (static run and inside `check`).**
```
Execution failed for task ':checkstyleTest'.
> A failure occurred while executing org.gradle.api.plugins.quality.internal.CheckstyleAction
   > An unexpected error occurred configuring and executing Checkstyle.
      > java.lang.Error: Error was thrown while processing .../backend/src/test/java/com/citi/put/checks/studio/support/GuidedPublicationEvidenceFixture.java
```
[V] I reran it with `--stacktrace`: `Caused by: java.lang.OutOfMemoryError: Java heap space` (this time during the HTML XSLT). The Checkstyle worker runs with Gradle's default heap, and the repo sets no `maxHeapSize`. [V] With 2g (out-of-tree init script, diagnostic only) the task passes with 0 violations, which matches the CLI. [I] This is probably also why w6 saw a truncated `checkstyleTest` XML. The fix needs a build-config change, and it is not mine to make.

**F2. Runner unit attempt01** (it passed on rerun):
```
FAIL  test/observedReplayValidation.test.ts > independent composed canonical UTF-8 ceilings > accepts the lawful fully joined semantic 6291456-byte parent and refuses one legal byte before hashing
Error: Test timed out in 5000ms.
```
In attempt02 the same test took 4274 ms against a 5000 ms timeout. It is timing-sensitive. Host load averaged 3–4, and briefly 11.7 during vitest.

**F3. In-image pins** (`image-final01-check-pins.json`):
```
the Node major inside the pinned Playwright image disagrees with .nvmrc:
      dist/runtime-versions.json node = v24.20.0 (major 24), recorded inside the image (chromiumBuild 1243)
      .nvmrc                          = 22
```

**F4. Backend tests (7 failures, all in `GuidedPublicationReplayIT`):**
```
test:                  actualGuidedZeroPasswordControlsRejectsScopedSecretProposalBeforeRead()  AssertionFailedError at :26417
test:                  actualGuidedTwoPasswordControlsRejectsScopedSecretProposalBeforeRead()   AssertionFailedError at :26417
test:                  incrementalSecretPrefixContextAckRevocationFailsAtWorkerCheckCurrent()   AssertionError at :10087
guidedIncrementalTest: prefixProducerContextPostAckRevalidationRejectsChangedAuthorityOrEvidence() AssertionError at :11163
guidedIncrementalTest: prefixProducerContextUncertainRepliesNeverAdmitOrRedispatch()             AssertionError at :11163
guidedIncrementalTest: prefixProducerContextConcurrentAdvancePreparesCoordinateOnce()            AssertionError at :11163
guidedIncrementalTest: incrementalSecretGrantRevocationAtFreshProducerAckCutFailsBeforePreparation() AssertionError at :10087
```
Probable cause:
- [V] ReplayIT:3038 credits `validatorCountPredicate` only when the `GuidedProposalValidator.action` stack frame is at **line 381**. In the live file, the `passwordControls == 1` / `POLICY_DENIED` `require(...)` is at lines 384–387, and line 381 is now an operand of the `REFERENCE_MISMATCH` check.
- [V] The validator's sha256 (`0a5f02e1…`) equals the w6-format01 `spotlessApply` output.
- [V] ReplayIT:10075 likewise pins `GuidedTranslationService.advancePrefix` at **line 405**. That file was changed by spotless and by w6-checkstyle-G2.
- [I] All 7 failures are hard-coded source-line anchors that the formatting window invalidated. The w6 bytecode-neutrality method stripped line tables, so it could not see this. I did not trace the `:11163` sites to a specific constant.
- These failures are not flakes, so I did not rerun them.

## Disclosures

- **Approved skips file.** `approved-historical-skips.json` (sha256 `5a0755a4…a81`) is a byte copy of `backend/fullsuite-fix01/historical-skips-from-test04.json`. I built it on root's instruction, and it is already in the collector's exact `[{task,class,name}]` format. [V] It equals the skip multisets of `final-w02-full-test04` and `fix01-full-test02` (25 = 25). Quinn's qa-review01 §13 confirms that equality and also notes that nothing independently ratifies the list. The runbook (s02b) had reserved that file for Quinn.
- **Labels.** `runner-final-typecheck01` and `runner-final-lint01` failed in my harness: zsh did not word-split the pnpm command, so the wrapper got a `FileNotFoundError` before any tool ran. Only `-before.json` and an empty `.log` exist for those labels. I reran them as `…02`. `runner-final-unit01` is a genuine run (F2).
- **JDK.** `/opt/homebrew/opt/openjdk@21` (the wrappers' `JAVA_HOME`) resolves to **openjdk 23.0.2**. Gradle itself runs on `org.gradle.java.home` = jdk-21.0.10 (`backend/gradle.properties`). I used jdk-21.0.10 for the checkstyle CLI.
- **Docker build.** The Dockerfile's own `RUN npm ci` / `npm run build` ran inside the image; that is how the image is defined. Every host-side runner command used pnpm.
- **Prior outputs.** I archived prior backend outputs to `prior-backend-build-outputs-final01.tgz` (61 MB) plus planning metrics (sha256 in `prior-outputs-final01.sha256`). I did **not** restore them (runbook 6d is root's call). The fresh outputs are archived by the collector under `execution/backend-final-check-attempt01-task-outputs/`.
- **Post-run audit.** No running Testcontainers containers remain, and I removed none. One pre-existing `node studio-runner/dist/run/guidedMain.js` (PID 44737, started 2026-10-10) is alive. It is not owned by this run, and I did not signal it. I never touched PID 22246.
- **Frontend side effect.** `docs/qa/accessibility/axe-results.json` has the same sha256 (`51c29bb4…`) before and after the frontend vitest run.
