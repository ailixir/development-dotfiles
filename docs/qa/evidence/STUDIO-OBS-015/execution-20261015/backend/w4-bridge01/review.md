# STUDIO-OBS-015 w4-bridge01: bridge migration, L1 lifecycle fix, ReplayIT D5/D4/ack02, full incremental lane

Dex-W4 (@dev), 2026-10-16. Nothing was committed. This window grants no QA credit; Quinn re-gates.
Hashes are in `manifest.json`. [V] = I ran it or read it. [I] = inferred, not executed.

## 1. Bridge migration (bridge-migration01 / aria-bridge-ruling01)
- Base hashes verified before applying [V]. All 21 manifest inputs matched, including
  GuidedBridgeIntegrationTest `d48d4f0d…`, build.gradle.kts `6a2aba4b…` and GuidedSessionService `d10ec5cb…`.
  PlannedIT was absent.
- **Apply method (disclosed).** In the repo, `git apply --check -p0` failed. It reported "No such file" for the
  `/dev/null` new-file hunk, then "patch failed :1082". The same command passed in a scratch dir holding a copy
  of the live base. With `--exclude='*PlannedIT*'` it also passed in the repo. I applied with `patch -p0`.
  Both results equal the expected hashes: `a0ab8e7e…` (9 @Test) and `760e84d0…` (16 @Test) [V].
- `./gradlew --no-daemon compileTestJava`: exit 0 (`compile01.log`).
- Both classes are in package `com.citi.put.checks.studio.guided.session`. The source files sit in the `bridge/` folder.

| Label | Integration (9) | PlannedIT (16) | Exit | Notes |
|---|---|---|---|---|
| `w4-bridge01-run01` | 9/9 | 15/16 | 1 | #22 `actualDeferredCommitFailure…` failed: expected `TransactionException`, got `JpaSystemException: Unable to commit` |
| `w4-bridge01-run02` | **9/9** | **16/16** | 0 | 25/25, 0 skipped, 192 s, dist `060d9a53…` stable |

- **Test-side fix (#22, PlannedIT only).** Ruling N4 requires the repository to share the JPA transaction
  manager. That is also what production uses: `GuidedSessionConfiguration:23` takes `PlatformTransactionManager`.
  The base class used `DataSourceTransactionManager`, which reports a failed commit as a `TransactionException`.
  Under JPA the same failure surfaces as `JpaSystemException`.
  - The assertion now pins `JpaSystemException`, the message "Unable to commit", and a root cause containing
    "injected commit failure".
  - It is stricter than before: it now pins the type, the message and the cause.
  - All other assertions in the case are unchanged. Diff: `planned-it-fix.diff`. PlannedIT is now `f21c9266…`.
- **Post-bootstrap state (O-2).** `plannedSession` asserts `translationBootstrap.phase == READY` and
  `state == PROPOSING` [V].
  - All 16 cases passed that assertion in run02.
  - In run01 it also held 16/16: #22 failed at :1338, after `plannedSession` at :1326.
  - So the observed state is **PROPOSING**, and the §4.4 `!FAILED` fallback was not needed.
- **studio-runner/dist digest.** Collector `distDigest` is `060d9a53239c…`, stable before and after both runs.
  The worker snapshot hashes the test records are in `run01-planned-worker.json` and `run02-planned-worker.json`.
  For example, `run/guidedMain.js` is `d895976f…`.
- **O-1 (#16 "assignment" key).** #16 passed in both runs without a key swap. I did **not** apply the
  `translation-assignment` swap.
  - Disclosure: as a result, #16 probes a fresh-key assign after stop. It does not replay the planner's original
    key. Both are refused `UNKNOWN_OUTCOME`. Aria's call stays open.
- Static guards re-checked after my edit [V]: G1 = 0 lines, G2 = the only 202 `admissions` post is
  `admit(id, association)`, G3 = 0. G4 (`PROVIDER_KINDS` subset in `@AfterEach`) held in every run.
- Production defects found by the bridge runs: **none**.

## 2. L1 lifecycle fix (aria-lifecycle-ruling01), backend production change
- All 15 ruling inputs matched their hashes before I edited anything [V].
- `GuidedMaterializationService`: I added `verifyLifecycle` and the private static `sameIdentity` after `verify`,
  verbatim from the ruling §2.1. File hash `ad8742a8…` → `0247251e…`.
- `GuidedSessionService.lifecycle`: the call is now `materialization.verifyLifecycle(...)`, with the ruling's
  comment. File hash `d10ec5cb…` → `bda27005…`.
- Nothing else changed:
  - not `verify`, `verifyAndCapture`, `verifyPrefixReceipt` or `requireAcknowledged`;
  - not `stop()`/P3, `internal()`/`owner()`/`active()` or `assignmentLifecycle`.
- Pre-images were reconstructed by reversing my edits and equal the before-hashes [V]. Diff: `l1/l1.diff`.
- **Tests.** I added 5 cases to `GuidedServiceTransportFaultIT`, with helpers `workerLifecycle` and
  `pendingAppendFacts`. File hash `7d711a43…` → `beb28ec4…`. The cases are:
  - `lifecycleAtPendingAppendIdentityEndsSessionAndChangesNothing`;
  - `lifecycleAtLastAcknowledgedIdentityEndsSession`;
  - `lifecycleAtAnyOtherIdentityIsRefusedWhilePending`;
  - `consumingVerificationStaysRefusedWhilePending`;
  - `lifecycleWithoutPendingDeliveryIsExactlyVerify`.
- **Deviation from ruling §3.1 (disclosed).** The ruling expected `teardownRequest.target` to be readable after
  CONFIRMED, but CONFIRMED clears the durable request. That was run `w4-l1-tfit01`: the target was empty.
  - The assignment target is now proven from the stub's single recorded send: `startsWith(assignment + "|")`.
  - The late-ACK refusal is pinned to `PUBLICATION_CONFLICT`. That is the terminal-session refusal from
    `active()`, observed [V].
  - Allocations and producers are empty in this fixture, so their "unchanged" check is trivially true. The
    materialization revision and the delivery `status|ack|hash` are the meaningful parts.
- **Runs:**

| Label | Selection | Result | Notes |
|---|---|---|---|
| `w4-l1-tfit01` | TFIT + StopKeyTest | 32/35 | 2 were my target-read assertions (fixed as above). 1 was `actualConsumedGuidedControllerJvmCrashBeforeResolution…`: the stage file was read empty (`""`), a child-process timing race. The lifecycle path is not involved [I] |
| `w4-l1-tfit02` | TFIT + StopKeyTest | **35/35** | was 30/30; +5 L1 cases. The crash-cut case passed |
| `w4-l1-b2b01` | `guidedIncrementalTest` B2B-01 method only | **1/1** | 76 s. In its XML: 0 `requireAcknowledged` frames, 0 lifecycle `REVISION_CONFLICT`, 0 "refused the context" |

- **Mutation checks** (`l1/m1..m3*.log`). After each one I restored the file and verified the hashes with
  `shasum -c` [V].
  - M1 (revert 2.2 to `verify`): case 1 fails with `REVISION_CONFLICT` (case 2 too).
  - M2 (drop `previous`): case 2 fails with `STALE_FENCE`; case 1 passes.
  - M3 (drop `issued`): case 1 fails with `STALE_FENCE`; case 2 passes.

## 3. ReplayIT: D5 + D4 patches, then the w3-qa-ack02 delta (test-only)
- Base `702d1be9…` verified. Each patch alone reproduces its recorded result: D5 → `b691c832…`, D4 → `1690eaa7…`.
  Combined, they give `6315dee2…` in either order [V]. Applied with `patch -p0`.
- **ack02 delta, applied on `6315dee2…` → `bef430ba…`.** Diff: `replayit/ack02-delta.diff`.
  - **(3) B2B-02.** The shape-only loop is replaced by exact equality between `sourceManifest.authoringContext` and
    an array rebuilt from `current.authoring`.
    - The new helper `b2SafeContext` mirrors `GuidedSourceClassifier.safeContext`: global first, then each step;
      kind `text` with a non-empty value.
    - Positive controls: the rebuilt array is non-empty and contains `ctxText`.
    - The rest of the D4 hunk is unchanged.
  - **(5)+(4) Shared guard.** One predicate, `neverAssignedSettled(id)`, does a single SQL read. It is true only
    when the state is terminal, there are 0 assignments and 0 materializations, `teardownStatus` is empty and
    `teardownRequest` IS NULL.
    - `b3AwaitCancelSettled` asserts CANCELLED, then calls the predicate, and otherwise falls back to
      `p3AwaitTeardown`.
    - The failed-test cleanup calls the predicate after the cancel branch. If it is true, the cleanup records
      `teardownStatus=NOT_ASSIGNED, assigned=0, materialized=0` and `continue`s. The existing 20 s CONFIRMED wait
      is byte-unchanged.
    - **Disclosed shared-guard edit:** the old B3B-1 branch *asserted* that `materialized == 0` and
      `teardown == null` when `assigned == 0`. Any other combination now waits for CONFIRMED instead.
  - **(6) Process-metadata bound.** The limit is now 16,384 events / 8,388,608 bytes.
    - Still unchanged: the fail-closed throw, the UTF-8 byte count, 0600 creation, the 1 MiB summary bound and
      the value-free rows.
    - **Disclosure:** this supersedes the QA-reviewed 4096 / 2,096,000 in
      `checkpoint-owned-worker-generations01.json` (`privateMetadata.eventBound/eventByteBound`) and the
      `workerMetadataCapsUnchanged` claim in `prefix-sync-tests-source01/hook-privacy-bounds.json`.
    - Observed this run: **metadataEvents 4354, metadataBytes 3,054,967**, cleanupFailureCount 0, 212 roots,
      0 alive. The old bound (4096) would have been exceeded.
  - **D4 (c) observer race (coordinator-directed).** In the observer catch, a failure is skipped only when
    `p8TerminatedUnsignalled(candidate.handle)` is true (gone, or `X`/`Z*` state). That is the same rule as the
    earlier zombie fix. A live root whose identity cannot be verified is still recorded as a failure.
    - **Disclosure:** ack02 §7 did *not* rule on this ("needs its own patch and review"). It needs a QA
      delta-ack.
- **D5 fixture byte disclosure (ack02 item 1(b)).**
  - Two sites change: the `assert-fail` branch (now `:1730`) and `b1c-assert2` (now `:11603`).
  - At both, `document.getElementById('destination').addEventListener('focus',()=>{…textContent='changed-after-read'…})`
    becomes the same with `'change'`.
  - ReplayIT hash chain: `702d1be9` → `6315dee2` (D5+D4) → `bef430ba` (ack02).

## 4. Full `guidedIncrementalTest` lane
- `w4-full-incr01` was **aborted by me** about 10 min in, when ack02 arrived; source was about to change. I sent
  SIGTERM to my own collector/Gradle tree only, after checking it did not contain PID 22246.
  - Only `-before.json` and `.log` exist for that label; there is no results file.
  - The node runner and Chromium processes still in the process table predate this window (started Oct 10 and
    Oct 13), so I left them alone.
- **`w4-full-incr02`** ran on the final tree, source digest `66167ccf…`. Result: **60/62 passed, 2 failed, 0 skipped**.
  - 2414 s, `--no-daemon --continue`. Collection is complete; source and dist are stable.
  - The 62 cases compare with w3's 63: the class-level `executionError` entry is gone.
- **Compared with `w3-w01-full-incr01` (56/63):**
  - Newly passing (5):
    - B2B-01 `incrementalAppendRetryAndExpiredPreparation…`;
    - B1C-01 `incrementalStepTwoAssertionFailure…`;
    - `incremental joined assert-fail`;
    - `incremental joined unused-declaration`;
    - B2B-02 `incrementalPlainAndContextCanariesRemainPrivate…`.
  - `executionError` no longer occurs.
  - B1C-01 and joined assert-fail pass with their oracles unchanged (ASSERTION_FAILED, no relearn). That meets
    ack02 1(a) at the test level.
  - The shared guard fired once: the B3B CANCELLED session recorded `NOT_ASSIGNED`, and
    `allActualTeardownsConfirmed=true` with no cascade (`replayit/failed-test-cleanup-*.json`).
- **Remaining failures (not fixed; outside the two bridge classes; reported):**
  1. **NEW**: `incrementalFirstSuffixAcceptanceIsOnceAndLaterPairsCannotDisappear`. It passed in w3.
     - The failure is the precondition at `B3WriterProbe.refuseOffered:4524` via `b3EdgeMatrix:5687`:
       "edge-native0-excluded-admission changes the offered basis" is false, so the mutation produced an
       identical basis.
     - It is a fixture precondition, not a production refusal.
     - Cause not diagnosed. [I] It looks data- or run-dependent (what the native0 excluded attempt contains).
       Nothing in this window touched `b3EdgeMatrix`, and I cannot rule out L1 or ack02 side effects without a
       diagnosis.
  2. `incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution` (B3B). It now gets **past** the
     earlier teardown failure (`p3AwaitTeardown`) and fails later, at `b3AssertMultiVersionReturnedHistoryRefuses:4812`:
     `v1-private-value` full-version reconstruction expected `EVIDENCE_MISMATCH` but got `INVALID_CONTRACT`.
     This is a new, deeper finding. It needs diagnosis to decide whether the production refusal code or the oracle
     is wrong.
- No third patch (canary-leak) arrived in this window. B2B-02 passed without it.

## 5. Not done / not run
- The ruling-L1 `test`-lane regression (B2A-02, `append-input`) was not run; the coordinator scoped this window to
  TFIT + B2B-01 + the full incremental lane.
- Spotless, Checkstyle, SpotBugs and `./gradlew check` were not run. All added lines are ≤ 120 columns.
- CodeRabbit (WSL-only), npm lint/typecheck (no frontend change) and synapse diagnostics were not run.
- The QA acks needed before these changes count: the PlannedIT #22 assertion change, the L1 test deviation, the
  ack02 delta, and D4 (c).
- PID 22246 was never signalled; it is absent from the process table.
