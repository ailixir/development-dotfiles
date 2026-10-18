# STUDIO-OBS-009 W3 lane S-W3 receipt: AC-6 a-e full-class runs and AC-12 a-d observation

Agent: Dex (@dev). Date: 2026-10-18. Mode: YOLO. Marks: [V] verified (ran it / read it), [I] inferred.

## Verdict

**GREEN on all four classes. Credited by the W3 rule (collector dist digest == D_F). The replay collector exits 2 only because `sourceStable:false` (other W3 lanes added files while it ran); see "Source drift".**

No product or test source was edited by this lane [V]. Nothing in the S write set needed a fix: both batons (acceptance grant, ReplayIT `BACKGROUND_AUTHORIZATION_DENIED`) are on the tree and pass.

## Counts

| Class / lane | Label | Result | Collector exit |
|---|---|---|---|
| `StudioScheduleApiIT` | `obs009-sw3-sched01` | 22/22 pass | 0 |
| `SharedSchedulingIT` | same | 4/4 pass | 0 |
| `ObservedScheduleAuthorityIT` | same | 8/8 pass | 0 |
| Subtotal (one Gradle run) | | **34/34, 0 fail, 0 error, 0 skipped**, 47 s | **0** (`sourceStable` true, `distStable` true) |
| `GuidedPublicationReplayIT`, `test` task | `obs009-sw3-replay01` | **46/46 pass**, 0 skipped | |
| `GuidedPublicationReplayIT`, `guidedIncrementalTest` task | same | **62/62 pass**, 0 skipped | |
| Subtotal (one Gradle run) | | **108/108**, `BUILD SUCCESSFUL in 1h 52s`, 3652.8 s | **2** (`sourceStable` false; `distStable` true; `taskCollectionComplete` true; `taskCollectionErrors` empty) |

Counts are from the archived JUnit XML through the collector (`execution/obs009-sw3-*-results.json`), per class and per task [V]. Zero skips, so no skip-policy file was needed.

Commands (both through `with-gradle-lock.py`, `--no-daemon`, new labels):

```
run-backend-tasked.py obs009-sw3-sched01 --test-tasks test -- test --tests com.citi.put.checks.studio.scheduling.StudioScheduleApiIT --tests com.citi.put.checks.scheduling.SharedSchedulingIT --tests com.citi.put.checks.studio.scheduling.ObservedScheduleAuthorityIT --no-daemon
run-backend-tasked.py obs009-sw3-replay01 --test-tasks test,guidedIncrementalTest -- test --tests com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT guidedIncrementalTest --no-daemon
```

Driver: scratchpad `s-w3/chain.sh` and `run.sh` (they record `lsof -nP -iTCP -sTCP:LISTEN` and the Gradle process list while the lock is held, then call the collector).

## Credit (dist == D_F)

- D_F = `4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3`.
- [V] `execution/obs009-sw3-sched01-before.json` and `-after.json`: `dist.digest` = D_F both. Same for `obs009-sw3-replay01-before.json` and `-after.json`. `distStable` true in both.
- [V] `verifyRunnerDist` ran and passed in the replay run (task list in `execution/obs009-sw3-replay01.log`). `OBS009_RUNNER_DIST` not set; `-x verifyRunnerDist` not passed. No dist rebuild.
- [V] lsof preflight and Gradle-process listing recorded for both runs: `s-w3/lsof-before-obs009-sw3-{sched01,replay01}.txt`, `s-w3/gradle-procs-before-*.txt` (the only line is the lock wrapper itself: no stale Gradle daemon).
- AC-6 e (QA grep) was cleared in W2: `@Disabled` count 6 (none in the S classes), `DEFERRED STUDIO-OBS-009` 0. Not re-run here; the full-class counts show 0 skipped in all four classes [V].

## Source drift (why the replay collector exits 2)

[V] `sourceDigest` moved from `1411b448…` (the F-merge source) to `cc3f40f2…` during the 61-minute replay run, and the manifest file count from 1729 to 1805. Diff of `obs009-sw3-replay01-before.json` vs `-after.json`:

- 81 added, 5 removed, 6 changed files, all from other W3 lanes: `studio-runner/evaluation/**` (70 added), `studio-runner/test/evaluation/**` (7), `tools/corun*`, and backend ITs `ObservedCoRunIT`, `PreReadyRevocationJoinedIT`, `GuidedEvidencePendingAppendJoinedIT`, `GuidedSchemaProbeIT` (added), `PreReadyRevocationProbeIT` and `GuidedEvidencePendingAppendIT` (changed or removed).
- [V] None of the 586 files under `backend/src/main` and `studio-runner/src` changed. `GuidedPublicationReplayIT.java` is byte-identical before and after (`2ca7dc91…`). The `compileJava`, `compileTestJava` and `testClasses` tasks were `UP-TO-DATE` at the start of the run.
- Brief rule (R3, W2 addendum): an exit 2 caused only by `sourceStable:false` while other lanes edit is expected. I did not re-run (about 1 hour). Root can ask for a re-run when the tree is quiet if a collector exit 0 is wanted.

## Tripwire and the schedule baton (AC-6 d)

- [V] `GuidedPublicationReplayIT.java:18525` now expects `BACKGROUND_AUTHORIZATION_DENIED` (test `editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness`, in the `test` lane). The 46/46 `test` lane includes it green. S's inference in the W2 receipt (the class sets no `studio.scheduling.local-grants`) is now confirmed by a real run.
- [V] `StudioAcceptanceService` calls `observed.prepareScheduled(...)` (grep: one hit at `:334`); no `OBSERVED_SCHEDULE_AUTH_REQUIRED` throw remains in it.

## AC-12 a-d: R10-rev2-2 observation (kept open)

Source: the class TEMP directories of the two Gradle JVMs, `ordinary-ipc-parent.jsonl` and `ordinary-ipc-child.jsonl` (joined by pid and execution id). Copies (value-free by design: kinds, codes, numbers) are in `s-w3/ac12/` with a summary `s-w3/ac12/ac12-ipc-summary.json`. No case failed, so there is no failed-test-state `ipcDiagnostics` to read [V].

- `test` lane TEMP `obs007-joined-11527654311643294634`: 32 parent records, 31 child records.
- `guidedIncrementalTest` lane TEMP `obs007-joined-12451713588777600040`: 41 parent records, 41 child records.
- **Denominator:** 1 full-lane run (both tasks, one Gradle invocation), 73 ordinary-child records. OBS-009 had 0 before this run (I receipt F5).

| Counter | `test` lane | `guidedIncrementalTest` lane |
|---|---|---|
| `INTERNAL_ERROR` results (any end) | **0** | **0** |
| `INTERNAL_ERROR` pre-Ready ends | **0** | **0** |
| `violation-catch` kills | **0** | **0** |
| `other` kills | 0 | 0 |
| Schema-invalid results (`resultSchemaValid == false`) | **0** | **0** |
| `performStop-grace` kills | 1 (see below) | 0 |
| Pre-Ready ends of any kind (no `ready` received) | 2 (both known, below) | 0 |

C6 cases in the `test` lane [V]:

- kind 1 (case 3): `OUTCOME_UNKNOWN`, schema-valid, 44 control reads, read max 23 ms, stall max 2 ms, loop delay max 18 ms, no kills.
- kind 2 (case 4): `CANCELLED`, schema-valid, 2 control reads, read max 15 ms, no kills.

Records that a literal reading of the c-bullets might flag, and why they are the known baseline [V by comparison across prior runs]:

1. **`performStop-grace` SIGKILL, no result, no child line** (case 7, c6 2, ordinal 9; `received` = ready, step-started, step-finished, step-started). This is the childCut stop case. The identical record (same case, c6, ordinal, label, `SIGKILL`, `results` 0) is in all 27 earlier `test`-lane-shaped TEMP directories on this host (28 to 34 parent records each; 2026-10-16 01:58 through 2026-10-18 03:35), so 28 of 28 including this run. The 012A credited runs had the same 29 parent / 28 child asymmetry. It is a stop-grace kill, not a `violation-catch`, and not an `INTERNAL_ERROR`. [I] It is by design of the cut case; the `resultSchemaValid` field is `null` (no result), not `false`.
2. **Pre-Ready ends** in `test`: case 0 ordinal 3 `TARGET_DRIFT` (loop delay 15 ms) and case 0 ordinal 10 `CANCELLED` (loop delay 3035 ms). The latter is the deliberate r8 pre-Ready control-window self-stop case (a 3 s block). Both appear in every prior `test`-lane run with the same numbers (ordinal 10 loop delay 3016 to 3048 ms).

**Classification (c):** no recurrence in this run. No parent `violation-catch` kill, no non-schema-valid result, no child-sent `INTERNAL_ERROR`, nothing the diagnostic cannot classify. Nothing to escalate to @architect and no test-wrapper defect to fix.

**Closure (d):** [I] one clean full-lane run is a small denominator and the ruling fixes no number. I report the item **still open** (CONCERNS on the 012A gate, owner @qa) and not closed by omission. Root/@qa decide whether the final-tree G9 run(s) close it.

## AC-12 REL-001 pointer (AC-11) and the D4 15 s edge

Sources: every `guided.log` under both TEMP directories (the `owned-generations/generation-*/guided.log` files hold the runner's lines), the archived XML system-out, and `studio-runner/src/guided/diagnostics.ts` for the line format [V].

- `test` lane: **0** `GUIDED_START_FAILED` lines.
- `guidedIncrementalTest` lane: **1** line, in `owned-generations/generation-9/guided.log` (copy: `s-w3/ac12/incremental-lane/guided-generation-9.log`):
  `GUIDED_START_FAILED {"operation":"context","session":"08f19fbcaddaa728","elapsedMs":1,"links":[{"name":"Error","code":"CONTEXT_LOST"}]}`
  - Every link recorded (there is one): `name` Error, `code` CONTEXT_LOST, no `phase`, no `loss`, no `kind`, no errno, no exit code or signal. `elapsedMs` 1. Session hash prefix `08f19fbcaddaa728`.
  - Context: backend log 12:21:36.969 (local) `STALE_FENCE` rollback in `prefixDrift`, then 12:21:36.991 `Guided runner refused the context ... CONTEXT_LOST`; time window matches `incrementalDriftAuthorityRejectsEveryExactJoin` (a test of adversarial authority rows).
  - **Classification, [I]:** this is a 1 ms refusal of an existing session's `context` call by a plain `Error`, not a browser start failure (`GuidedStartFailure`, with phase/loss and a cause chain). The same line shape (operation `context`, one `Error`/`CONTEXT_LOST` link, `elapsedMs` 1 or 2) is in the `guidedIncrementalTest` TEMP of all 4 earlier incremental full runs on this host (2026-10-17 07:14, 14:42, 19:44, 23:24), so 5 of 5 with this run; it is a constant of that test and not a new start failure. A literal reading of the AC-11 REL-001 pointer ("non-`TIMEOUT` innermost cause") would count it. I record it here with all link fields so @qa can rule; I did not open a root-cause item.
- **D4 15 s edge:** 0 occurrences [V]. The only `GUIDED_START_FAILED` line has `elapsedMs` 1, far below 15000; no bootstrap `UNKNOWN_OUTCOME` is paired with a start failure. The `UNKNOWN_OUTCOME` stack traces in the XML (1 in `test`, 2 in `guidedIncrementalTest`) are `GuidedSessionException: UNKNOWN_OUTCOME` rollbacks inside test cases that assert it (all those cases passed).
- **AC-12 j (Chromium startup hang):** [V] no `xpc_atfork_child` in the Gradle log or either XML; no case failed at browser startup. Preexisting orphan Chrome for Testing processes on the host (PIDs 5083, 5095, 13577, 13581) are the protected ones named in the brief; I did not touch them. Processes younger than my run belong to other lanes. I left nothing running of my own.

## Mutation and red-first

No behaviour change in this lane, so no red log or mutation was due. Mutations for S are in `s/mutations.json` (W2).

## Deviations

1. The driver script's `digest-at-lock` helper crashed on the manifest's multi-document output (my one-liner; `*.digest-at-lock` files contain a traceback). Not evidence: the dist digests come from the collector's own `-before.json` and `-after.json`. I also computed the digest with `capture-manifest.py` before queuing: `4add1307…` / source `1411b448…`.
2. Did not re-run the replay lane for a collector exit 0 (see Source drift).

## Findings for root

1. **Collector exit 2 on `obs009-sw3-replay01` is `sourceStable:false` only**, caused by other W3 lanes' files (evaluation harness, corun, renamed ITs). Attribution above; backend `src/main`, `studio-runner/src`, ReplayIT and dist are unchanged.
2. **AC-12 R10-rev2-2:** no recurrence, denominator 1 full-lane run / 73 ordinary children; keep open for @qa.
3. **AC-11 REL-001 pointer, for @qa to rule:** one `GUIDED_START_FAILED` (operation `context`, `elapsedMs` 1, single plain `Error`/`CONTEXT_LOST` link) in the incremental lane, identical in shape in 5 of 5 incremental full runs since 2026-10-17. [I] by-design refusal in `incrementalDriftAuthorityRejectsEveryExactJoin`; not proven by reading the test body.
4. **Pointer wording gap:** the AC-12 c bullet 1 ("missing result after a launch was processed") literally matches the permanent childCut `performStop-grace` record (case 7). The story should name that record as baseline so a future reader does not escalate it.

## Files

Written (all under this folder): `receipt.md`, `receipt.json`, `logs/`, `lsof-before-*`, `gradle-procs-before-*`, `ac12/**`. Collector outputs: `execution/obs009-sw3-sched01*`, `execution/obs009-sw3-replay01*` (sha256 of results: sched `6fb8ea08…`, replay `9bfb6fb1…`). No source file written, so no before/after hashes.
