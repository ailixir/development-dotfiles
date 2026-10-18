# STUDIO-OBS-015 final source-frozen gates, attempt03 (final-gates03), Gage (@devops)

2026-10-17, 00:07Z to 01:44Z. HEAD is `734ad704f` with an uncommitted tree. I made no commits, did no push and edited no source. The machine-readable record is `receipt.json`. [V] means I ran it and read the output. [I] means inferred.

**Overall: FAIL.** The backend `check` test lane had 4 failures, and JaCoCo verification and `requireFreshGuidedPartitions` were NOT RUN. Every other gate is PASS or CARRIED_FORWARD (verified by digest). The in-image pins check stays NOT_GREEN_EXTERNAL (ED-05).

## Freeze binding

| | Source | Dist |
|---|---|---|
| attempt02 `S_F2` / `D_F` | `18767a1542edf73fad91fe387ff2bbd4c28715dfb50282519fb60e1a2d083164` | `80d1ba1d43b3f571d9a882459676484bd165ab850143d2ac06b3bd781462467e` |
| `capture-before.json` (00:07Z) = `S_F3` | `f071984a46af15a039140e11135c0223092b338fd79d3a985757421ab323cabe` | `80d1ba1d…` (= D_F) |
| `capture-after.json` (01:44Z) | identical file list and hashes | identical |

[V] Compared with attempt02's capture, exactly 2 files changed; none were added or removed (`capture-before-vs-SF2.json`):
- `backend/src/test/java/…/guided/policy/ObservationPolicyIT.java` (`7efd8977…` → `65145633…`)
- `backend/src/test/java/…/guided/publication/GuidedPublicationReplayIT.java` (`713381a5…` → `533fbee2…`)

Both are the `backend/w8-flake-fix01` changes. Every before/after manifest in this attempt carries `S_F3` and `D_F`. The scope is 1647 files.

## Gates

| Gate | Verdict | Exit | Counts / result | Duration |
|---|---|---|---|---|
| Gradle `spotlessCheck checkstyleMain checkstyleTest spotbugsMain --rerun-tasks` | PASS | 0 | 14/14 tasks executed. checkstyleMain 466 files / 0 violations. checkstyleTest 332 / 0, no OOM. Spotless and SpotBugs passed | 38 s |
| Runner build, host check:pins, test:fixtures, image build, test:deployment, frontend | CARRIED FORWARD from attempt01 (inputs identical) | — | Build PASS. Pins PASS. Fixtures 252/0/9. Image PASS. Deployment 322/0/0. Frontend 701/701, type-check and lint 0 errors | — |
| Runner type-check, lint, unit; contracts | CARRIED FORWARD from attempt02 (inputs identical) | — | Unit 2229/0/29, lines 97.25 / branches 89.11 / functions 97.12. Contracts 7 PASS sections, no write | — |
| In-image `check-pins --require-image` | NOT_GREEN_EXTERNAL (ED-05 / O-2a) | — | Node v24.20.0 vs `.nvmrc` 22. The image's inputs and IDs are unchanged | — |
| **Backend `check --rerun-tasks` via collector** (`backend-final-check-attempt03`) | **FAIL** | 1 (Gradle 1) | `test` **2412 / 2383 / 4 fail / 25 skip** (expected 2412/2387/0/25). The skip multiset equals the approved 25. Collection complete. Source, dist and test inputs stayed stable | 5621 s (1 h 34 min) |
| `guidedIncrementalTest` | PASS | — | **62 / 62** | — |
| `crossReplicaTest` | PASS | — | **2 / 2** | — |
| SQL55 `GuidedReplayingPrefixMigrationIT` | PASS (inside `check`) | — | **55 / 55**, 0 skipped | — |
| JaCoCo report/verification, `requireFreshGuidedPartitions` | **NOT RUN** | — | The log has no lines for either task. Gradle did not schedule them after `:test FAILED`, the same as attempt02. Coverage floors were not evaluated | — |

**How the carry-forward was verified [V].** `carry-forward-inputs.json` reproduces attempt02's per-gate subset rules, and the subset digests match exactly:

| Gate | Input files | Subset digest |
|---|---|---|
| build / pins | 177 | `de1d5f84…` |
| fixtures (non-test runner + `test/fixtures-tier` + `test/helpers`) | 228 | `b088ef53…` |
| image | 101 | `3d371c83…` |
| deployment | 188 | `f024bc02…` |
| frontend | 274 | `5988e697…` |

Against attempt02's capture-before, the whole `studio-runner/` tree (351 files) is identical, as are the contracts inputs (248 files). Every file outside `backend/` (775 files) is identical too. The dist is D_F. The image IDs are unchanged: `e3a2d8bd…` (runtime) and `3ef3f968…` (build stage).

The static tasks inside `check` were spotlessCheck, checkstyleMain, checkstyleTest, spotbugsMain, rdsParityLint, antiRegressionCheck and testcontainersAlignmentCheck. All of them ran without failure.

## Failures (verbatim)

**P1. `GuidedPublicationReplayIT.actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues()`** was test 1 of 46 in the class and took 4.6 s.
```
org.opentest4j.AssertionFailedError: [{"state":"FAILED","errorCode":"","providerFailures":0,"submits":0,"navigations":0,"lastObservedNames":[],"counters":{"actions":0,"observations":0,"modelProposals":1,"modelInputTokens":11604,"modelOutputTokens":4000,"sanitizedEvidenceBytes":0},"modelKinds":["SOURCE_PLAN"]} logs=/var/folders/69/txvg5ksj635bk5xr530hcrx00000gn/T/obs007-joined-15777908557601289614]
expected: "FINALIZING"
 but was: "FAILED"
	at ...GuidedPublicationReplayIT.actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues(GuidedPublicationReplayIT.java:17729)
```
- [V] Teardown is `CONFIRMED`, per `failed-test-cleanup-test-1-…-singleton.json` in that TEMP dir.
- [I] Exactly 4000 output tokens after one SOURCE_PLAN proposal, with an empty `errorCode`, may point to an output-token cap or truncated model output. I did not trace it.

**P2. `GuidedPublicationAuthorityIT.storedPrivateHistoryCannotBeSubstitutedAtPublicationBoundary(String)`, case `stored private returned history header-count`**, took 0.9 s:
```
org.flywaydb.core.internal.exception.FlywaySqlException: Unable to obtain connection from database: The connection attempt failed.
SQL State  : 08001
	at ...GuidedPublicationMigrationTest$Database.<init>(GuidedPublicationMigrationTest.java:93)
	at ...GuidedPublicationAuthorityIT.storedPrivateHistoryCannotBeSubstitutedAtPublicationBoundary(GuidedPublicationAuthorityIT.java:938)
Caused by: org.postgresql.util.PSQLException: The connection attempt failed.
Caused by: java.io.EOFException
```
The other 26 AuthorityIT cases passed, including the sibling parameter cases.

**Cascade (2 tests).** ReplayIT tests 2 and 3 failed in about 0.01 s each because they need the revision that test 1 publishes:
- `queuedAndPreReadyRefusals()` at :17956: `[Requires the genuinely published revision from the preceding integration flow] Expecting actual not to be null`
- `editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness()` at :18365: `Expecting actual not to be null`

The remaining 43 ReplayIT tests passed. No cleanup-unconfirmed guard latched.

- [V] All 20 attempt02 failures now pass. That includes both P7 vault/pool tests and `ObservationPolicyIT`, which went 11/11.
- [V] All 4 attempt03 failures passed in attempt02, so none of them repeats.
- [V] The log contains 9 `EOFException` lines and 10 `An I/O error occurred while sending to the backend` lines. They include the scheduled `GuidedTranslationCoordinator.continueRuns` errors at 20:10 and 20:16 local, before both suites (AuthorityIT started 00:23:21Z and ReplayIT 00:25:58Z). Attempt02 showed the same pattern. [I] P2 looks like a transient database connection failure. I did not determine whether it is related to P1.
- Per instruction, I did not rerun or fix anything.

## Disclosures

- **Static.** I ran only the forced `--rerun-tasks` form, as specified. All 14 tasks executed.
- **Label.** `backend-final-check-attempt03` is a fresh label that did not exist before. It was launched with nohup (PID 8045) and polled to completion.
- **Same inputs as attempt02.** The command, flags and skips file are the same as attempt02. The skips file is `final-gates01/approved-historical-skips.json` (sha256 `5a0755a4…a81`), with the same caveat as before: nothing independently ratifies it. The collector `run-backend-tasked.py` (sha256 `b81dbb25…`) has not changed since 2026-10-15.
- **JDK.** As in prior attempts, `/opt/homebrew/opt/openjdk@21` resolves to openjdk 23.0.2. Gradle runs on `org.gradle.java.home` = jdk-21.0.10.
- **Post-run audit.**
  - The Docker container set is identical before and after the run, and no container was removed.
  - The 6 exited `postgres:15-alpine` containers already existed before the run.
  - The only remaining process is the pre-existing PID 44737 (`guidedMain.js`), which I did not signal.
  - I never touched PIDs 22246, 13577 or 13581.
- **Not archived.** The ReplayIT TEMP logs in `/var/folders/…/obs007-joined-15777908557601289614` are outside the repo, and I did not copy them.
