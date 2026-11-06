# Sync the Windows support into the backend repo

Run this inside the split **backend** repo.

On 2026-11-05 the monorepo gained Windows and Linux developer support (ADR-SC-009). For the backend that meant three changes:
- every test now runs on Zonky embedded Postgres, with no Docker; Testcontainers is removed;
- the test harness and diagnostics no longer depend on POSIX;
- `node scripts/dev.mjs` is the launcher on every OS, and `dev.sh` stays as a wrapper around it.

Bring in the `backend/` part of that work: **125 files in 5 commits**, listed at the end. Replay the commits as patches, then fix what doesn't apply. Bring in nothing else.

## Source

- **`MONO`** is your local clone of the put-checks monorepo:
  - Windows (Git Bash): `C:/Users/bb68376/workspace/EAMP/development-dotfiles`
  - Mac: `/Users/brunobuger/orca/workspaces/put-checks/ui-studio`

  If I haven't said which one to use, ask me.
- **The range:**
  - `BASE=d9ab5654b1071a326e2b6c979c828d3c8a4d0547`
  - `HEAD=2d544d2b55eea9fa1613b16cab7d1420c66406dc`

  Both are on branch `brunobuger/ui-studio`, which is pushed. If `git -C "$MONO" cat-file -e "${HEAD}^{commit}"` fails, stop and ask me to fetch.
- **Read-only.** Read the monorepo only through `git -C "$MONO" format-patch|show|rev-parse`. Never edit, check out or commit there.

## Rules

- **Branch.** Start from a clean working tree. Create `sync/windows-2026-11-05` from the tip of the default branch.
- **Commits.** Commit locally only. Don't push or open a PR. `git am` keeps the monorepo's commit messages.
- **Config follows this repo.** In the config files named below, keep this repo's values and add only the change described for that file. If a change would overwrite a setting this repo chose, flag it.
- **Flags.** Give each one 3 options and a recommendation.
- **Verified vs inferred.** Keep what you verified apart from what you inferred.

## Step 1: Check for drift

For each `M` and `D` file in the list, check whether this repo's committed file is the same as the monorepo's version at BASE:

```bash
[ "$(git rev-parse -q --verify "HEAD:$f")" = "$(git -C "$MONO" rev-parse "${BASE}:backend/$f")" ] && echo same
```

Report each file as **same**, **missing** or **different**. The patches can conflict only on the different files.

To tell whether a difference is only CRLF, run `git -C "$MONO" show "${BASE}:backend/$f" | diff -q - <(git show "HEAD:$f" | tr -d '\r')`. Step 2 fixes a CRLF-only difference. For a content difference, read this repo's `git log -- "$f"` to learn why.

## Step 2: Line endings first

```bash
PATCHES=$(mktemp -d)
git -C "$MONO" format-patch --relative=backend "$BASE..$HEAD" -o "$PATCHES" -- backend
ls "$PATCHES"                                  # expect 5 patches
git am -3 "$PATCHES"/0001-*.patch              # adds .gitattributes
git add --renormalize .
git diff --cached --ignore-cr-at-eol | grep -E '^[+-][^+-]'   # must print nothing
```

- **If this repo already has a `.gitattributes`,** the first patch fails. Merge the new rules into the existing file, run `git add .gitattributes`, then `git am --continue`.
- **If the first patch stops on another file,** resolve it as Step 3 describes.
- **If the renormalize step staged files,** commit them on their own as `chore(repo): renormalize line endings to LF`. Then refresh the checkout on the clean tree so files get LF: `git rm -r -q --cached . && git reset -q --hard`.
- **If the `grep` printed lines,** the renormalize changed real content. Stop and report.

## Step 3: Apply the rest

```bash
git am -3 --exclude=dev.sh "$PATCHES"/000[2-9]-*.patch
```

In the monorepo, one commit deletes `dev.sh` and the next brings it back as a wrapper. `--exclude=dev.sh` skips both and keeps this repo's copy; Step 3b then decides what goes in it.

When `git am` stops on a file:
1. Resolve the file using the rules below. The monorepo's version is at `git -C "$MONO" show "${HEAD}:backend/<path>"`.
2. Run `git add` on it, then `git am --continue`.

If `git am` can't build a 3-way ancestor, apply what it can and resolve the rest by hand:
- Run `git am --show-current-patch=diff | git apply --reject`.
- Resolve each `.rej` file by hand, then delete it.
- Run `git add` on the files, then `git am --continue`.

## Step 3b: Keep `dev.sh`

Developers start the stack with `./dev.sh` from Git Bash, so `dev.sh` stays. In the monorepo it is now this wrapper, the same in all three components (`git -C "$MONO" show "${HEAD}:backend/dev.sh"`):

```bash
#!/usr/bin/env bash
# Starts this component locally. A thin wrapper for Git Bash, macOS and Linux: `node scripts/dev.mjs`
# does the work on every OS and takes the same flags (`./dev.sh --help`). In cmd or PowerShell, run
# `node scripts/dev.mjs` directly.
set -euo pipefail
exec node "$(dirname "$0")/scripts/dev.mjs" "$@"
```

What to do depends on what Step 1 found for `dev.sh`:
- **Same:** it is the monorepo's old bash launcher. That one needs `lsof`, `ps` and process groups, which Git Bash doesn't provide for native Windows processes. Replace its content with the wrapper.
- **Missing:** add the wrapper.
- **Different:** this repo has its own launcher. Keep it unchanged, because dev start scripts follow this repo, and FLAG it with these options:
  - (a) keep it, with `scripts/dev.mjs` beside it (recommended);
  - (b) replace it with the wrapper, porting its extra steps into `scripts/dev.mjs`;
  - (c) keep its own steps and make it end by running `scripts/dev.mjs`.

Keep it executable with `git update-index --chmod=+x dev.sh`, then commit it as `fix(dev): keep dev.sh as a wrapper around scripts/dev.mjs`.

**Local start needs all three repos synced.** The runner's `scripts/dev.mjs` writes the shared `$PUT_CHECKS_LOCAL_DIR/backend.env`, which is now a dotenv file (it was a bash file). The backend's and frontend's `scripts/dev.mjs` read it.

## How to resolve each kind of file

**Studio code and tests** (`.../studio/`, `.../corun/`). These follow the monorepo, unless this repo changed the file after the split. Merge those changes and say so.

**Before removing Testcontainers,** search this repo's `src/` for `org.testcontainers`, `jdbc:tc:`, `@Testcontainers` and `PostgreSQLContainer`. Convert each class you find that is not in the list below, in the same way:
- use `support/TestPostgresDatabase` for a class that needs its own database;
- otherwise use the shared test datasource.

FLAG any class you can't convert. Don't leave Testcontainers half removed.

**Config.** Keep this repo's values and add only the change below.
- `gradle.properties` is deleted in the monorepo, because it held only `org.gradle.java.home=/Users/...`.
  - Here, remove only an `org.gradle.java.home` line that holds an absolute path, and keep every other line.
  - Delete the file only if it is left empty.
  - A developer who needs a JDK pin puts it in `~/.gradle/gradle.properties`.
- `build.gradle.kts`:
  - **Remove:** `testcontainersVersion` and `extra["testcontainers.version"]`, the two `org.testcontainers` `testImplementation` lines, and the `testcontainersAlignmentCheck` task together with its `check` dependency.
  - **Add:** `lineEndings = com.diffplug.spotless.LineEnding.UNIX` inside `spotless { }`.
  - **Comments:** take them as the patch has them.
  - **`verifyRunnerDist`:** if the task exists, its message changes `pnpm run build` to `npm run build`.
- `src/main/resources/application-test.yml`: the `datasource` block becomes
  ```yaml
  url: ${checks.test.shared-postgres.url}
  driver-class-name: org.postgresql.Driver
  username: postgres
  password: postgres
  ```
  Keep the rest of the file as this repo has it.
- `src/test/resources/META-INF/spring.factories` is new. If this repo already has one, append the `EnvironmentPostProcessor` entry to it.
- `src/main/resources/application-local.yml` and `src/test/resources/spring.properties`: the changes are comments only.
- `scripts/dev.mjs` is new and `scripts/local-core.mjs` changes. `dev.sh` is handled in Step 3b.

**Outside `backend/`, in the same commits.** Apply these only where this repo has the equivalent doc:
- **`CLAUDE.md`, `AGENTS.md`, `ARCH.md`:** "Testcontainers" becomes "Zonky embedded Postgres". For example: `./gradlew test   # JUnit 5 + Zonky embedded Postgres`.
- **Root `README.md` and `docs/runbooks/studio-integrations.md`:** the start commands are now `node scripts/dev.mjs`, with `./dev.sh` named for Git Bash, macOS and Linux. Add the backend part of the new Windows section.
- **Helm, only if the chart lives here:** two comments now say `studio-runner/scripts/dev.mjs` instead of `studio-runner/dev.sh`.

## Step 4: Verify

On Windows use `gradlew.bat` from a **non-elevated** shell; Zonky refuses an admin shell and needs the VC++ runtime. No Docker is needed. Run, in order:
1. `./gradlew spotlessCheck checkstyleMain checkstyleTest`
2. `./gradlew test --tests '*PlaywrightReferenceTest' --tests '*RunnerProcessHarnessTest' --tests '*TestDatabaseLifetimeIT'`
3. `./gradlew dependencies --configuration testRuntimeClasspath | grep -i testcontainers`, which must print nothing.
4. `./gradlew check`, the whole suite on embedded Postgres. 0 classes may be skipped for a missing Docker.
5. `node scripts/dev.mjs --help`, and `./dev.sh --help` from Git Bash, which must print the same

Line endings: `git ls-files --eol | grep i/crlf` must print nothing.

## Report

- The drift table from Step 1.
- For each patch: whether it applied cleanly, or which files you resolved and how.
- Any Testcontainers classes you converted.
- Flags, each with 3 options and a recommendation.
- The verify commands you ran and what each returned.
- The commits on `sync/windows-2026-11-05`.

## Files (125, relative to the repo root, by monorepo commit)

```
# b8a13dc04 chore(repo): enforce LF line endings and drop the tracked JDK path
A  .gitattributes
D  gradle.properties

# 51bab3d18 fix(backend): portable POSIX diagnostics, test harness and CRLF-safe reference
M  src/main/java/com/citi/put/checks/studio/guided/diagnostics/GuidedGuardProvenance.java
M  src/main/java/com/citi/put/checks/studio/guided/translation/GuidedRefusalDiagnostics.java
M  src/main/java/com/citi/put/checks/studio/guided/translation/PlaywrightReference.java
M  src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgeIntegrationTest.java
M  src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgePlannedIT.java
M  src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedDispatchContextRefusalTest.java
M  src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerContextRefusalTest.java
M  src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedSecretByteBodyTest.java
M  src/test/java/com/citi/put/checks/studio/guided/diagnostics/GuidedGuardProvenanceTest.java
M  src/test/java/com/citi/put/checks/studio/guided/publication/ObservedResolverProcessCrashIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedRefusalDiagnosticsTest.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/PlaywrightReferenceTest.java
A  src/test/java/com/citi/put/checks/studio/support/PosixTestFiles.java
M  src/test/java/com/citi/put/checks/studio/support/RunnerProcessHarness.java
M  src/test/java/com/citi/put/checks/studio/support/RunnerProcessHarnessTest.java
M  src/test/java/com/citi/put/checks/studio/support/RunnerTestTls.java

# 65d25d9e9 test(backend): run every test on Zonky embedded Postgres instead of Testcontainers
M  build.gradle.kts
M  config/rds-parity/README.md
M  src/main/resources/application-test.yml
M  src/test/java/com/citi/put/checks/config/TestDatabaseLifetimeIT.java
M  src/test/java/com/citi/put/checks/corun/ObservedCoRunIT.java
M  src/test/java/com/citi/put/checks/scheduling/SharedSchedulingIT.java
M  src/test/java/com/citi/put/checks/smoke/SchemaSmokeContainerIT.java
M  src/test/java/com/citi/put/checks/studio/AuthorMirrorIT.java
M  src/test/java/com/citi/put/checks/studio/CancelIT.java
M  src/test/java/com/citi/put/checks/studio/ErrorCodeConstraintMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/ExecutionReplayFailureMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/InferenceMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/InferenceMigrationLatestIT.java
M  src/test/java/com/citi/put/checks/studio/LastRunProjectionIT.java
M  src/test/java/com/citi/put/checks/studio/LegacyDataMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/ProofReportIT.java
M  src/test/java/com/citi/put/checks/studio/RevisionMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/SecondApplicationContext.java
M  src/test/java/com/citi/put/checks/studio/StudioApiIT.java
M  src/test/java/com/citi/put/checks/studio/StudioAuthorizationIT.java
M  src/test/java/com/citi/put/checks/studio/StudioContractTest.java
M  src/test/java/com/citi/put/checks/studio/StudioCsiScopingIT.java
M  src/test/java/com/citi/put/checks/studio/StudioIdempotencyIT.java
M  src/test/java/com/citi/put/checks/studio/StudioListQueryIT.java
M  src/test/java/com/citi/put/checks/studio/StudioMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/StudioOverloadIT.java
M  src/test/java/com/citi/put/checks/studio/StudioReadLockOrderIT.java
M  src/test/java/com/citi/put/checks/studio/StudioSaveInCallerTransactionIT.java
M  src/test/java/com/citi/put/checks/studio/StudioSeedIT.java
M  src/test/java/com/citi/put/checks/studio/authoring/StudioAuthoringMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/dispatch/AcceptanceIT.java
M  src/test/java/com/citi/put/checks/studio/dispatch/DispatcherIT.java
M  src/test/java/com/citi/put/checks/studio/dispatch/LedgerCancelTransitionsIT.java
M  src/test/java/com/citi/put/checks/studio/dispatch/LedgerStateMachineIT.java
M  src/test/java/com/citi/put/checks/studio/dispatch/LedgerStateMachineMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/dispatch/RevocationRotationIT.java
M  src/test/java/com/citi/put/checks/studio/dispatch/RunnerTlsClientCertIT.java
M  src/test/java/com/citi/put/checks/studio/dispatch/StudioDispatchMetricsIT.java
M  src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoAuthorizationIT.java
M  src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoContractTest.java
M  src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoEvidenceIT.java
M  src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoRangeIT.java
M  src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoRefusalEnvelopeIT.java
M  src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoStoreBindingIT.java
M  src/test/java/com/citi/put/checks/studio/guided/GuidedAllowedDomainsMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/GuidedGovernanceMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/GuidedLearnProofMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/GuidedRecordingMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/GuidedReplayingPrefixMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/GuidedScheduledBeansProfileTest.java
M  src/test/java/com/citi/put/checks/studio/guided/GuidedStepKindMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/bridge/support/GuidedBridgeFixture.java
M  src/test/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionEvidenceTest.java
M  src/test/java/com/citi/put/checks/studio/guided/examples/StepExampleStoreIT.java
M  src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationMigrationTest.java
M  src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationProofIT.java
M  src/test/java/com/citi/put/checks/studio/guided/publication/GuidedSecretLoginMigrationTest.java
M  src/test/java/com/citi/put/checks/studio/guided/publication/GuidedStepTamperIT.java
M  src/test/java/com/citi/put/checks/studio/guided/publication/ObservedGrantClockIT.java
M  src/test/java/com/citi/put/checks/studio/guided/publication/ObservedProfileDriftTest.java
M  src/test/java/com/citi/put/checks/studio/guided/publication/PublicationGrantClockIT.java
M  src/test/java/com/citi/put/checks/studio/guided/retention/GuidedObservationPrunerIT.java
M  src/test/java/com/citi/put/checks/studio/guided/secret/GuidedRuntimeRolePrivilegeIT.java
M  src/test/java/com/citi/put/checks/studio/guided/secret/SecretUseAuditIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedCsiBudgetIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedEvidencePendingAppendIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedEvidencePendingAppendJoinedIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedIncrementalQualifiedPlanIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedLatestAttemptIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedLifecycleReasonIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedPreparationJoinTest.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedPublicPresentationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java
M  src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GroundingItHarness.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedClarificationSupersessionIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedDefaultModelReservationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedFirstTurnObservationIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedGateAuditIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedLoginJourneyJoinedIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningIntegrationTest.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedStalledSendRetryIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTransientRetryIT.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationDefaultsTest.java
M  src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationMigrationTest.java
M  src/test/java/com/citi/put/checks/studio/internal/AdmissionCasIT.java
M  src/test/java/com/citi/put/checks/studio/internal/EvidencePartialCallbackIT.java
M  src/test/java/com/citi/put/checks/studio/internal/ProgressCallbackIT.java
M  src/test/java/com/citi/put/checks/studio/recovery/RecoveryIT.java
M  src/test/java/com/citi/put/checks/studio/secrets/DatabaseCanaryScanIT.java
M  src/test/java/com/citi/put/checks/studio/secrets/PlaintextSecretsDropMigrationIT.java
M  src/test/java/com/citi/put/checks/studio/secrets/StudioCapabilitiesIT.java
M  src/test/java/com/citi/put/checks/studio/secrets/StudioSecretsControllerIT.java
M  src/test/java/com/citi/put/checks/studio/sse/SseCrossReplicaIT.java
M  src/test/java/com/citi/put/checks/studio/sse/SseStreamingIT.java
A  src/test/java/com/citi/put/checks/support/SharedTestPostgres.java
A  src/test/java/com/citi/put/checks/support/SharedTestPostgresEnvironmentPostProcessor.java
A  src/test/java/com/citi/put/checks/support/TestPostgresDatabase.java
A  src/test/resources/META-INF/spring.factories
M  src/test/resources/spring.properties

# 5a91a39fd feat(dev): cross-platform Node launchers replace the bash dev.sh scripts
M  README.md
D  dev.sh   (excluded: dev.sh stays, see Step 3b)
A  scripts/dev.mjs
M  scripts/local-core.mjs
M  src/main/resources/application-local.yml
M  src/test/java/com/citi/put/checks/scheduling/partitioning/PartitionDefaultRowsIT.java
M  src/test/java/com/citi/put/checks/scheduling/partitioning/SeededStartPartitionHealthIT.java

# 2d544d2b5 fix(dev): keep dev.sh as a Git Bash wrapper around scripts/dev.mjs
M  README.md
A  dev.sh   (excluded: written in Step 3b)
```
