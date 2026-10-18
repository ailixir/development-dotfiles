# STUDIO-OBS-015 final gates, attempt05 (final-gates06), Gage (@devops)

2026-10-17 05:35 to 07:17 EDT. HEAD `734ad704f`, uncommitted tree. No commit, no push, no source edit. Machine-readable record: `receipt.json`. [V] means I ran it and read the output. [I] means inferred.

Every runner step, the image steps and the backend launch ran with Node v24.20.0 first on PATH (`env.txt`, `backend-node.txt`).

**Overall: RED.** The runner fixtures tier had 1 failed test, which I classify as transient [I] and did not rerun, per the rules. Everything else is GREEN, including the full backend check (attempt05).

## Freeze

| | Source | Dist |
|---|---|---|
| capture-before (09:35Z) | `7d696ae8f1d482a12bc6d10cb44bf3615da8024e0c3d1a7038ddb094acba2ae6`, 1650 files | `379c0deddd255cf1bc64349132a9122a962d10ca8ce24acf4c93592c13a7c6e5` |
| capture-after (11:17Z) | identical, file by file | identical |

[V] Versus final-gates05 (`650e5294…` / `01df6c38…`): 13 files changed, 0 added, 0 removed, all in `studio-runner/` (5 src, 8 test). `frontend/`, `backend/`, `tools/`, `docs/specs/`, `.github/` and root package files are identical to final-gates05 and final-gates04.

## Steps

| Step | Verdict | Result |
|---|---|---|
| 1 capture-before | DONE | digests above |
| 2 type-check | GREEN | exit 0, 6.7 s |
| 2 lint | GREEN | exit 0, 10.3 s |
| 2 unit with coverage (s03c) | GREEN | **2280 passed / 0 failed / 29 skipped** (2309; 105 files passed, 1 skipped). Coverage lines 97.32, branches 89.25, functions 97.36. Thresholds passed (exit 0) |
| 2 full dist build | GREEN | exit 0, dist unchanged by the build (`379c0ded…`) |
| 2 host `check:pins` | GREEN | exit 0 |
| 3 fixtures (s04c) | **RED** | **259 passed / 1 failed / 9 skipped** (269; 21 files passed, 1 failed, 3 skipped), 254 s |
| 4 image build (s05a) | GREEN | both builds exit 0. Runtime `…obs015-final06-local` = `sha256:dc39cc053ad0c25ef02c25e583a8788a55c6801a0176cc51ba9844c5fd6eed67`; build stage = `sha256:2cd893b90f67f143276599a6ffa68757b56584210b9cc459f467650f13fa2839` |
| 4 dist parity (s05b) | GREEN | `/app/dist` list hash equal in both images (`f6eef2e5…`) |
| 4 in-image `check-pins --require-image` (s05c) | **GREEN, exit 0** | `ok: true`, no failures, nothing NOT ASSERTED. node v24.20.0, nodeMajorPin "24", nvmrc "24", engines `>=24.11.0 <25.0.0`, chromiumBuild "1243", Playwright 1.63.0, image tag recorded, linux/arm64 revision 1243 |
| 5 deployment (s05d) | GREEN | 8 files, **322 passed / 0 failed / 0 skipped**, 46 s |
| 6 contracts + schema `--check` | GREEN (re-run) | both exit 0, no write. Re-run because `studio-runner/src` changed |
| 6 frontend | CARRIED_FORWARD | `frontend/` 274 files, digest `5988e697…` equal to attempt04 and final-gates05 |
| 6 standalone backend static | CARRIED_FORWARD | `backend/` 872 files, digest `b6fbde38…` equal. Also re-executed inside the check below |
| 7 backend check **attempt05** | **GREEN** | see below |
| 8 capture-after | GREEN | equals capture-before |

## The fixtures failure

[V] `test/fixtures-tier/guided-secret-ownership.test.ts`, mode `hard-expiry`: `expected 'LEASE_LOST' to be 'EXPIRED'` at line 130. The other three modes in that file passed. The two final-gates05 failures in `browser-profile-safety.test.ts` are fixed (10/10), `guided-start-deadline.test.ts` passes 7/7 and `guided-recording.test.ts` 5/5.

[I] Transient, not proven:
- The same test passed in final-gates05 and in Dex's W10 full fixtures run on N24 (`w10-review-fixes01/gates/fixtures-full.*`: 260 passed, hard-expiry 5065 ms). The test file and `src/guided/ownership.ts` are not in the 13-file diff since final-gates05.
- The test sets `expiresAt` to now+5 s. In `ownership.ts` a renewal throws LEASE_LOST when the remaining lease minus 100 ms is not positive (line 80), while the expiry timer reports EXPIRED (line 54). A renewal landing in the last 100 ms of a 1000 ms period wins the race, so the result depends on renewal phase. I did not instrument this.
- The W10 edits to `runtime.ts` and `guidedMain.ts` are not excluded as a contributing factor, because I did not rerun.

Rule applied: transient, no rerun, reported. I continued with steps 4 to 8 because the failure is not deterministic by the evidence above. That makes the fixtures gate RED for this run; whether it needs a rerun is your call.

## Backend attempt05

[V] Label `final-gate-attempt05-20261017T0543`. Same command, collector (`b81dbb25…`) and approved-skips file (`5a0755a4…`) as attempt04. nohup, `--no-daemon`, PID 14338, launched 09:42:53Z. Gradle: `BUILD SUCCESSFUL in 1h 31m 50s`, 25 of 25 tasks executed. Collector exit 0, 5511.54 s.

| Task | total / passed / failed / errors / skipped |
|---|---|
| test | 2412 / 2387 / 0 / 0 / 25 (skips equal the approved 25) |
| guidedIncrementalTest | 62 / 62 / 0 / 0 / 0 |
| crossReplicaTest | 2 / 2 / 0 / 0 / 0 |
| all | 2476 / 2451 / 0 / 0 / 25 |

- Identical to attempt04's counts. One fresh JOIN cohort per lane. `sourceStable`, `distStable`, `testInputStable` true; task collection complete with no errors.
- **requireFreshGuidedPartitions:** executed and passed, after `retainOriginalGuidedCohort`, `guidedIncrementalTest` and `retainIncrementalGuidedCohort`.
- **JaCoCo:** `jacocoTestReport` and `jacocoTestCoverageVerification` executed and passed. Bundle line 0.9087 (min 0.70); dispatch 0.8620, internal 0.9093, recovery 0.8889, sse 0.9258 (min 0.75 each). The `studio.compile` and `studio.compile.gateway` rules are vacuous (no such packages). Ratios are mine from the XML; the Gradle task is authoritative.
- Elapsed was about 9 minutes shorter than attempt04 (6073 s).

## GUIDED_START_FAILED and CONTEXT_LOST

Full list: `guided-start-failed-lines.json`. **No real REL-001 recurrence signal. No line has a TIMEOUT cause or an elapsedMs of 15000 or more, so your 15 s UNKNOWN_OUTCOME rule never applied.**

- **Runner logs.** Fixtures: 11 `GUIDED_START_FAILED` lines, all CONTEXT_LOST (the line at log 188 also has IDENTITY_MISMATCH), max elapsedMs 22. All injected by tests [I for most: attributed by adjacent log context, not per test; the IDENTITY_MISMATCH one is the stale-grant test]. Unit, deployment, build, image and contracts logs: 0. Unit log has 2 `Error: CONTEXT_LOST` text lines from a passing test.
- **Backend Gradle stdout and test XML.** 0 `GUIDED_START_FAILED`. 2 backend WARN lines `Guided runner refused the context … CONTEXT_LOST`:
  - 06:20:47 `GuidedBridgePlannedIT.lateRenewalResponseAfterStopCannotReviveContextOrOwnership`. [V] The test cancels the session, then sends assign and context and asserts UNKNOWN_OUTCOME. Injected.
  - 06:35:44 `GuidedPublicationReplayIT` (guidedIncrementalTest lane). [I] By timing this is `incrementalDriftAuthorityRejectsEveryExactJoin`, which includes a naturally expired owner lease. I did not read that part of the test.
- **Runner-side lines for the backend run.** The ITs write worker stderr to temp files that Gradle does not capture. They were still on disk, so I scanned everything modified in the run window and found 5 lines in 4 files (`backend-runner-side-lines/guided-start-failed-worker-logs.tsv`), max elapsedMs 64, no TIMEOUT. One pair matches the 06:20:47 refusal to the second. The other three are in `GuidedBridgeIntegrationTest` and the ReplayIT joined worker, injected by inference. Limit: worker logs already deleted by a teardown cannot be checked, so "none found" covers only what survived.

## Host and process notes

- Swap used 3424M to 3571M; free memory 76% to 53%. No pressure.
- 3238 fixture-media files were backed up. 22 changed during the run and the originals were restored.
- No container started, stopped or removed by me; `docker ps -a` identical before and after, no container running. Testcontainers cleaned up its own. I built only the two images. `supabase_*_outvo` stayed stopped.
- PIDs 22246, 44737, 13577 and 13581 were never signalled. 44737, 13577 and 13581 are still alive. No Gradle or worker process of mine remains.
- I used `/tmp` for two zero-byte timestamp marker files while scanning for worker logs, and deleted them. Everything else is under the scratchpad or the evidence folder.
