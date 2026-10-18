# STUDIO-OBS-009 G9 (`obs009-g9-check01`) - diagnosis of the two `test` failures

Author: Dex (@dev), read-only diagnosis, 2026-10-18. No source edited, no process signalled, nothing built or run.
Marks: **[V]** = verified by reading a file or log in this session. **[I]** = inference.
Paths are relative to `/Users/brunobuger/orca/workspaces/put-checks/ui-studio` unless absolute.

## 1. Verdicts

| # | Test | Class | Confidence |
|---|------|-------|-----------|
| 2 | `GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost` | **TEST DEFECT** - a check-then-read race on the stage marker file. Load only widens the window. | ~90% |
| 1 | `GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel` | **TRANSIENT, ENVIRONMENT-SUSPECTED, cause branch NOT proven**. Leading candidate is a load-sensitive `ps` read in the runner's `quiesce()`. Not a test defect. Possible small product robustness gap. | ~50% load-sensitive path, ~50% some other unobserved branch of the same code |

One correction to the resume state [V]: line 1214 of `CLAUDE-RESUME-STATE.md` calls both failures "bounded polls -> load (25 s poll)". That is wrong for both.
- #2 failed after **1.0 s**, so the 25 s stage poll did not time out. It exited early because the file existed.
- #1 passed `streamComplete == true` and `status == "PASSED"` first. The video state was already final (`FAILED`) when asserted. The 45 s poll did not expire.

Neither failure is a product defect that blocks the 009 behaviour under test. Source and dist are byte-identical to the passing runs [V, see section 5].

## 2. Failure 2 - controller cut marker is `""` (test race)

### What the test does [V]
`backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java`
- `:2734-2741` (`runGuidedControllerCut`): the parent polls every 10 ms while `child.isAlive() && !Files.exists(scratch/stage)`. It then asserts `exists`, then reads the file and asserts equality with `expectedStage` (`"READ_BEFORE_DECISION"` when `beforeResolve == false`).
- The failing assertion is `:2741`, which is the `readString`, **not** the `exists` assertion at `:2740`. So the file existed and was empty.

The child writes the marker in two steps [V], `backend/src/test/java/com/citi/put/checks/studio/guided/publication/ObservedResolverProcessCrashIT.java:308-322` (`Child.pause`):
```java
Files.createFile(stage, rw-------);          // file now exists, length 0
Files.writeString(stage, fixedLabel, UTF_8); // label arrives later
```
Both the `READ_BEFORE_DECISION` path (`FixtureProvider.read` -> `Child.pause`, `:355`) and the `GUIDED_CONSUMED_BEFORE_RESOLVE` path (`pauseGuidedBeforeResolution`, `:325`) use it.

`Files.exists()` becomes true between `createFile` and `writeString`. The parent polls on a 10 ms cadence, so it can read the empty file. That is exactly `expected "READ_BEFORE_DECISION" but was ""`.

### Why this is a defect and not a symptom [V/I]
- [V] The sibling harness `ObservedResolverProcessCrashIT.awaitStage` (`:227-236`) polls on content equality, `Files.exists(stage) && Files.readString(stage).equals(cut.name())`. It is race-free. The transport IT copied the poll but dropped the content check.
- [V] The failing test took 1.001 s, with `expected "..." but was ""` in the XML. The 25 s deadline plays no part.
- [V] No other failure, no `Child cut control failed`, no OOM or ENOMEM text in the class's system-out (247 lines, grep clean). The child's `child.log` was in `guided-controller-cut-*`, which is deleted in `finally`. The only leftover dir (Oct 16) is empty. So the child log cannot be checked [V]. That leaves one alternative, a child-side `IOException` in `writeString` (also leaves an empty file). [I] That is much less likely: 110 GiB free, no other fault.
- [I] The window is wider than two syscalls. In a cold child JVM, the first `Files.writeString` call loads classes between `createFile` and the write. Under memory pressure, page-faults add to that. This explains "passed twice earlier, failed now" without any product fault.
- [V] The earlier passes: `obs009-b-04` (1.164 s) and `obs009-f-reuse01` (1.052 s). The sibling `...BeforeResolutionReconciles...` passed in this same run (1.258 s). It uses the same marker protocol, so it carries the same latent risk.

### Proposed fix (NOT applied) - test only
Make the consumer wait for content, as `awaitStage` does. File: `.../guided/session/GuidedServiceTransportFaultIT.java`, `:2734-2741`.

```diff
-      long stageDeadline = System.nanoTime() + Duration.ofSeconds(25).toNanos();
-      while (System.nanoTime() < stageDeadline
-          && child.isAlive()
-          && !Files.exists(scratch.resolve("stage"))) {
-        Thread.sleep(10);
-      }
-      assertThat(Files.exists(scratch.resolve("stage"))).isTrue();
-      assertThat(Files.readString(scratch.resolve("stage"))).isEqualTo(expectedStage);
+      Path stageFile = scratch.resolve("stage");
+      long stageDeadline = System.nanoTime() + Duration.ofSeconds(25).toNanos();
+      // The child creates the marker and then writes its label, so existence is not readiness.
+      String stageContent = readStageOrEmpty(stageFile);
+      while (!stageContent.equals(expectedStage)
+          && System.nanoTime() < stageDeadline
+          && child.isAlive()) {
+        Thread.sleep(10);
+        stageContent = readStageOrEmpty(stageFile);
+      }
+      assertThat(stageContent)
+          .as("controller-cut stage marker (childAlive=%s)", child.isAlive())
+          .isEqualTo(expectedStage);
```
and one helper next to `runGuidedControllerCut`:
```java
  private static String readStageOrEmpty(Path stage) {
    try {
      return Files.exists(stage) ? Files.readString(stage) : "";
    } catch (IOException unreadableYet) {
      return "";
    }
  }
```
`IOException` is already imported (`:35`). The `childAlive` text is value-free; the child log is deliberately not embedded.

Alternative (producer side), if @architect prefers one fix for every reader: in `Child.pause` write `stage.pending`, then `Files.move(pending, stage, StandardCopyOption.ATOMIC_MOVE)`. That makes `exists()` imply complete content. It touches the other IT's harness, so it is the bigger change. I recommend the consumer fix.

## 3. Failure 1 - video `FAILED` on an otherwise PASSED run

### What was observed [V]
- Test: `GuidedPublicationReplayIT.java:19636` calls `awaitJoinedVideo`. The assertion that fails is `:29536`, `video.status == "AVAILABLE"`. Before it, `streamComplete == true` (assert `:29534`) and `status == "PASSED"` (assert `:29535`) passed. The 45 s poll finished normally.
- The test runs two ordinary runs (`for run in 0..1`). TEMP dir: `/var/folders/69/txvg5ksj635bk5xr530hcrx00000gn/T/obs007-joined-13240875577068753914/` (the host TEMP, not copied into docs). The enriched state file for this test lists both runs:
  - run 0: `625bb799-0c47-4ef5-916f-c8bfc1ccea4f`, PASSED, `STORED`, `.webm` present (17 251 B, ffmpeg decode log clean, 1.88 s, vp8 1280x720).
  - run 1: `6f93930b-9fdb-41a2-a650-2b528d9869f8`, **PASSED but `evidenceState: "FAILED"`**, `evidencePartial: false`. No `.webm` exists under `objects/studio/CSI-123/29d52193-.../6f93930b-.../`. Only `...result.json` was written.
- The real runner log, `owned-generations/generation-1/ordinary.log`, for run 1 [V]:
  `run.evidence_settled ... "evidenceState":"FAILED","evidencePartial":false,"uploadAttempts":0`
  The same log shows run 0 as `STORED, uploadAttempts:1`, 4 s earlier.
- Child IPC diagnostics for run 1 [V] (`ordinary-ipc-parent.jsonl` line 9, `failed-test-state-...-enriched.json`): 8 messages received, `resultOk`, `exitCode 0`, `killCount 0`, `loopDelayMaxMs 21`, `loopDelayP99Ms 13`. So the child ran and closed cleanly, and the browser/test steps were unaffected.
- Backend side: `FinalizationReconciler`/`ProgressReportService` pass the runner's `evidenceState` through (`STORED` -> `AVAILABLE`, `FAILED` -> `FAILED`). The backend did not invent the failure [V].

### Where `FAILED` can come from (runner) [V]
`studio-runner/src/server/runCoordinator.ts:753-766` takes `state` from the launcher's `result.recording`. `uploadRecording` (`src/run/evidenceUpload.ts:109-117`) does **not** try an upload unless the state is `PENDING`, which is why `uploadAttempts` is 0. So the FAILED state was fixed **before the upload step**, in `src/run/appVideoOwnership.ts:63-70` (`observeOwnedAppRecording`), called from `src/run/launcher.ts:507/532`. It returns `{state:'FAILED', error:'RECORDING_FAILED'}` on any of:

| Branch | Trigger | Load-sensitive? | Fit with the evidence |
|---|---|---|---|
| B1 | `quiescent == false`, from `quiesce()` (`launcher.ts:259-269`). Its last step returns `enumerated = canEnumerateProcessTree(table)`, and `table` is one `ps` listing read with `execFile(... timeout: min(100 ms, ...))` (`tree.ts:78-88`). A `ps` that times out at 100 ms, or fails to spawn, yields `[]`, so `enumerated` is false, and the recording is declared FAILED even though the child exited cleanly. | **Yes** (`ps` spawn/paging under swap) | Fits: fast, silent, `killCount 0`, upload skipped. Caveat: a 100 ms `ps` timeout should add ~100 ms. Run 1 took 1 524 ms vs 1 499 ms for run 0 (+25 ms), so a timeout is not visible in the timing. A spawn failure would be. [I] |
| B2 | `quiesce()` poll loop reaches `stopTimeoutMs` (5 s) because a remembered descendant is still "alive" | Yes | **Ruled out [V]**: the whole run (browserStartedAt -> endedAt) was 1.5 s. |
| B3 | Seal snapshot `invalid` (registry pin / receipt mismatch, `sealAppVideoOwner`) | No (deterministic) | Unlikely: would not pass 1 268 other runs. [I] |
| B4 | The file is "not playable": <512 B or no EBML header (`evidenceFor`), or the owner-pinned validation throws (`observeOwnedAppRecording` catch) | Possibly (Chromium/ffmpeg finalisation under starvation) | Cannot be excluded. [I] |

The exact branch **cannot be determined from retained data** [V]: the run's `logs` (which would contain `recording failed: RECORDING_FAILED` or `recording failed: The recording file is not playable (...)`, `runCoordinator.ts:760-766`) live in the ephemeral Testcontainers Postgres and in the public snapshot the test fetched. The test does not print them on failure, and the scratch dir (with the half-written video) is cleared by the runner.

### Why "transient, environment-suspected" and not "product defect" [V/I]
- [V] Product code is unchanged. `studio-runner/src` and the 238 `dist/` files hash identically in `obs009-sw3-replay01-before.json` (the run where this test passed, 12.3 s) and `obs009-g9-check01-before.json`. `GuidedPublicationReplayIT.java` and its runner harness are not in the 95-file diff between the two captures. Only `backend/build.gradle.kts` and six unrelated test files changed on the backend side.
- [V] Base rate. I scanned all 1 624 retained result manifests in every `obs007-joined-*` TEMP dir (Oct 14-18):
  `1 268 PASSED/STORED`, `227 ERROR/STORED`, `76 FAILED/STORED`, `24 ERROR/STORED+partial`, `1 ERROR/FAILED` (the deliberate crash test of Oct 16), and **`1 PASSED/FAILED` - this one**. It is a roughly 1-in-1 600 event, including through the Oct 15-16 stretches with 8-10 GB of swap in use.
- [V] The host is chronically under memory pressure, not only for this run. `hw.memsize` is 19.3 GB. Earlier captures show 3-6k free 16 KB pages and 2.5-8.3 GB swap in use. `local-gate-20261018/c0-vmstat.txt` (14:40, 43 minutes before the failing test) shows 5 360 free pages (~88 MB), 2.07 M pages in the compressor (~33 GB logical, 6.6 GB physical) and 168 M cumulative swapouts. So "load" is a standing condition. It does not single out this run. That is why B1 is a plausible rare-trigger and not a proof.
- [V] Nothing in the child or test harness misbehaved (see IPC diagnostics above). [V] The test's assertion is correct and the 45 s wait was not the limiter.
- [I] Only the stop/evidence path in the runner parent differs between a STORED run and this one.

So: environment-triggered flake (probably B1 or B4) on a path that has a single-sample `ps` with a 100 ms budget deciding whether a perfectly good recording is thrown away. I do **not** have a proof that it is B1. It has a small product-robustness smell attached: one failed `ps` sample is treated as a lost recording. I would not change runner code on this evidence (changing `studio-runner/src` or `dist` reopens the 009/015 runner and image gates).

### Proposed change (NOT applied) - test-side diagnostic only, so the next occurrence explains itself
File: `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java`, `awaitJoinedVideo` (`:29536`).
The snapshot already carries `video.error` and the redacted runner log lines (`ExecutionSnapshotMapper.java:90`, `ExecutionLogEntry(at, level, message, stepIndex)`).

```diff
-    assertThat(snapshot.path("video").path("status").asText()).isEqualTo("AVAILABLE");
+    assertThat(snapshot.path("video").path("status").asText())
+        .as("video evidence for %s: video=%s, recording log lines=%s",
+            execution, snapshot.path("video"), recordingLogLines(snapshot))
+        .isEqualTo("AVAILABLE");
     return snapshot;
   }
+
+  /** Runner-redacted codes only ("recording failed: ..."); no values. */
+  private static List<String> recordingLogLines(JsonNode snapshot) {
+    var lines = new java.util.ArrayList<String>();
+    for (JsonNode entry : snapshot.path("logs")) {
+      String message = entry.path("message").asText();
+      if (message.startsWith("recording failed") || message.contains("recording was not stored")) {
+        lines.add(message);
+      }
+    }
+    return lines;
+  }
```
If a later occurrence shows `RECORDING_FAILED` with no other line, B1/B3 (state-level); if it shows `not playable (N bytes, header ...)`, B4. A runner-side change (logging the failing sub-condition inside `observeOwnedAppRecording`/`quiesce`) would discriminate more precisely but it reopens the runner dist and the image gate. I recommend holding that until the diagnostic above has fired once, and only if it recurs.

If it recurs at a quiet host with the diagnostic armed and shows B1, the product fix is then a bounded retry of the second `readProcessTableAsync` in `quiesce()` (retry once within `end`), plus a test. Do not write it now.

## 4. Narrow reruns that discriminate

Run in the shared-lock form that G9 uses. These wait on the same flock, so start them only after the in-flight `guidedIncrementalTest` finishes (`status.txt` shows `G9-DONE`, or the collector log shows `[gradle-lock] released`).
Preamble (once):
```bash
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
LOCK=.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py
X9=.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009
```
Labels must be fresh (the collector refuses to overwrite). Quiet-host rule: ask other agents to pause helm/tsc/hashing for the duration.

**A. Failure 2, after the fix is applied (and, optionally, a pre-fix proof).**
```bash
python3 $LOCK python3 $X9/run-backend-tasked.py obs009-g9-tf-fix01 --test-tasks test --require-exec-tasks test -- test --tests "com.citi.put.checks.studio.guided.session.GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost" --tests "com.citi.put.checks.studio.guided.session.GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeResolutionReconcilesWithoutReadOrPost" --no-daemon
```
No `*` and neither class is in `runnerSpawningTestClasses`, so `verifyRunnerDist` is not selected [V, `build.gradle.kts:306-322`]. Cost ~1 min each.
- A green rerun alone does **not** prove the race (it is a low-rate event, passed 3 of 3 earlier). The proof is: (1) the code reading above, and (2) a scratch-copy mutation, the same technique as `qa/pre-g9-review/c10.sh`: insert `Thread.sleep(300)` between `createFile` and `writeString` in `Child.pause`, run the single method on **unfixed** code, and expect exactly `expected: "READ_BEFORE_DECISION" but was: ""`. Then the same mutation with the fix must go green. Do this in a scratch copy only, never in the live tree.

**B. Failure 1, unchanged code at a quiet host (single method, to see whether it recurs).**
```bash
python3 $LOCK python3 $X9/run-backend-tasked.py obs009-g9-login-diag01 --test-tasks test --require-exec-tasks test -- test --tests "com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.actualSecretLoginPublishesValueFreeAndTwoOrdinaryRunsResolveFreshWithoutModel" --no-daemon
```
- `GuidedPublicationReplayIT` is in `runnerSpawningTestClasses`, so `verifyRunnerDist` **is** selected even without `*`. That is fine: `dist/main.js` (14:41) is newer than every file under `studio-runner/src` (0 newer files) [V].
- Expect the collector to report `validationSucceeded: false` and a class-level `executionError` from the `@AfterAll` canary scan. A partial ReplayIT selection always does that (known, `project_obs015_backend_test_gotchas`). Judge only the test-level result of the named method. Run it 3 times (labels `-diag01/02/03`, ~1-2 min each). 3 passes are consistent with a rare transient; they cannot exclude it, given ~1-in-1 600.
- The credited form is the full lane (~18 min): `test --tests "com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT"` (label e.g. `obs009-g9-replay-lane02`). It is the only form that satisfies the cohort and canary checks. Its last green was `obs009-sw3-replay01`.
- To get an actual discrimination, apply the diagnostic diff in section 3 first. Then any recurrence prints `video.error` and the recording log line, which tells B1/B3 from B4.

**Not recommended:** a repeated `check`/full G9 re-run just to see whether these two recur. It costs ~50 min per lane and cannot tell a 1-in-1 600 flake from a fixed one.

## 5. Identity of what ran (for the record) [V]
- `obs009-sw3-replay01-before.json` vs `obs009-g9-check01-before.json`: 95 changed files. Under `backend/`: `build.gradle.kts` and six unrelated tests (`ObservedCoRunIT`, `PreReadyRevocationJoinedIT`, `PreReadyRevocationProbeIT`, `GuidedEvidencePendingAppendIT`, `GuidedEvidencePendingAppendJoinedIT`, `GuidedSchemaProbeIT`). Under `studio-runner/`: only `evaluation/**` and `test/**`, nothing under `src/` and zero differences in the 238 `dist` files. Two files under `tools/`.
- Neither failing test class, nor `ObservedResolverProcessCrashIT`, nor the runner launcher / appVideoOwnership / tree / evidenceUpload sources changed.
- Failing test times: ReplayIT class run 15:20:59 -> 15:39:33 (1 098 s), failing method at about 15:22:52-15:23:08 (16 s vs 12.3 s in the credited run). TransportFaultIT class run 15:54:11 -> 15:54:47 (33 s).

## 6. Recommended next step
1. Do **not** treat either as a 009 regression. Do not rerun the whole of G9.
2. Failure 2: have @dev apply the section 2 consumer diff in the next writer window. It is test-only, so it does not touch the `studio-runner/` dist/image gates. Run rerun A once.
3. Failure 1: apply the section 3 test-side diagnostic with the same change. Then run rerun B x3 on a quiet host, followed by the full ReplayIT lane as the credited evidence. Record the failure as "unexplained transient, 1 in about 1 600 retained runs, diagnostic armed". Escalate to a runner investigation only on a recurrence.
4. Quinn rules flake vs defect using the above. My view: #2 is a test defect (fix it); #1 is a flake-pending-recurrence (do not change the runner now).
