# STUDIO-OBS-015 final gates, attempt06 (final-gates07), Gage (@devops)

2026-10-17 12:59 to 14:43 EDT. HEAD `734ad704f`, uncommitted tree (W11 applied). No commit, no push, no source edit. Machine-readable record: `receipt.json`. [V] means I ran it and read the output. [I] means inferred.

Every runner step, the image steps and the backend launch ran with Node v24.20.0 first on PATH (`env.txt`, `backend-node.txt`).

**Overall: GREEN.** All steps passed on the first run, with no reruns. This includes the full fixtures tier and the full backend check (attempt06).

## Freeze

| | Source | Dist |
|---|---|---|
| capture-before (16:59Z) | `9d18f5550ac830bd2164bf4b4261f6d10ec8fd43b837e4bf9e9c990dc7cb5884`, 1651 files | `897182d58bbbe5755604d283cddd2af782c1d068dd66e365d3145615f839df9c` |
| capture-after (18:43Z) | identical, file by file | identical |

[V] Versus final-gates06 (`7d696ae8…` / `379c0ded…`): 4 files changed, 1 added, 0 removed, all in `studio-runner/`: `src/guided/ownership.ts`, `src/guided/runtime.ts`, `test/fixtures-tier/browser-profile-safety.test.ts`, `test/fixtures-tier/guided-secret-ownership.test.ts`, plus new `test/guided/stopReason.test.ts`. That is exactly the W11 scope you described. `diff-vs-final-gates06.json`.

The dist on disk was already current: the full build rewrote it with identical bytes.

## Steps

| Step | Verdict | Result |
|---|---|---|
| 1 capture-before | DONE | digests above |
| 2 type-check | GREEN | exit 0, 6.5 s |
| 2 lint | GREEN | exit 0, 9.0 s |
| 2 unit with coverage | GREEN | **2306 passed / 0 failed / 29 skipped** (2335; 106 files passed, 1 skipped). Coverage lines 97.33, branches 89.30, functions 97.37. Thresholds passed (exit 0). New `stopReason.test.ts` 26/26, `ownership.test.ts` 20/20 |
| 2 full dist build | GREEN | exit 0, dist unchanged (`897182d5…`) |
| 2 host `check:pins` | GREEN | exit 0 |
| 3 fixtures (full tier) | **GREEN** | **260 passed / 0 failed / 9 skipped** (269; 22 files passed, 3 skipped), 258.5 s |
| 4 image build | GREEN | both builds exit 0. Runtime `…obs015-final07-local` = `sha256:cf25f03887d67e811b1c5e1c18bea0fe8bcc7bf9679b6bbadd9363335f912d80`; build stage = `sha256:2215af22f2368e164885528d9c660f6ac184441afb2cdd12b2db17fe155878ee` |
| 4 dist parity | GREEN | `/app/dist` list hash equal in both images (`fd9d0ffc…`). Image to image, not against the host dist |
| 4 in-image `check-pins --require-image` | **GREEN, exit 0** | `ok: true`, no failures, nothing NOT ASSERTED. node v24.20.0, nodeMajorPin "24", nvmrc "24", engines `>=24.11.0 <25.0.0`, chromiumBuild "1243", Playwright 1.63.0, linux/arm64 revision 1243, image tag recorded |
| 5 deployment | GREEN | 8 files, **322 passed / 0 failed / 0 skipped**, 47.4 s |
| 6 contracts + schema `--check` | GREEN (re-run) | both exit 0, no write. Re-run because `studio-runner/src` changed |
| 6 frontend | CARRIED_FORWARD | `frontend/` 274 files, digest `5988e697…`, equal to final-gates04, 05, 06 |
| 6 standalone backend static | CARRIED_FORWARD | `backend/` 872 files, digest `b6fbde38…`, equal. Also re-executed inside the check below |
| 7 backend check **attempt06** | **GREEN** | see below |
| 8 capture-after | GREEN | equals capture-before |

[V] The carry-forward digest method (sha256 of the compact JSON of the sorted path/hash entries per prefix) reproduces the final-gates06 digests exactly, so the carry-forward is comparing like with like.

## W11 targets in the fixtures tier

[V] `guided-secret-ownership.test.ts`: 4/4. revoked 2117 ms, slow-grant 3962 ms, lost-body-late-grant 3558 ms, **hard-expiry 5062 ms** (the mode that failed with `LEASE_LOST` in final-gates06). `browser-profile-safety.test.ts`: 10/10.

[I] One pass does not prove the race closed; this was a single run. The sweep evidence for that is in `w11-hard-expiry01/`, and the 26 `stopReason.test.ts` unit tests passed here.

## Backend attempt06

[V] Label `final-gate-attempt06-20261017T1307`. Same command, collector (`b81dbb25…`) and approved-skips file (`5a0755a4…`) as attempt04 and attempt05. nohup, `--no-daemon`, PID 91102, launched 17:06:44Z (13:06:44 EDT). Gradle: `BUILD SUCCESSFUL in 1h 36m 7s`, 25 of 25 tasks executed. Collector exit 0, 5768.47 s (attempt05: 5511.54 s; attempt04: 6073 s).

| Task | total / passed / failed / errors / skipped |
|---|---|
| test | 2412 / 2387 / 0 / 0 / 25 (skips equal the approved 25) |
| guidedIncrementalTest | 62 / 62 / 0 / 0 / 0 |
| crossReplicaTest | 2 / 2 / 0 / 0 / 0 |
| all | 2476 / 2451 / 0 / 0 / 25 |

- Identical to attempt05's counts. `sourceStable`, `distStable`, `testInputStable` true; task collection complete with no errors.
- **Partitions:** `requireFreshGuidedPartitions` executed and passed, after `retainOriginalGuidedCohort`, `guidedIncrementalTest` and `retainIncrementalGuidedCohort`. One fresh JOIN cohort per lane (test `e0815961…`, guidedIncrementalTest `f875fe2c…`).
- **JaCoCo:** `jacocoTestReport` and `jacocoTestCoverageVerification` executed and passed. Bundle line 0.9086 (min 0.70); dispatch 0.8620, internal 0.9093, recovery 0.8889, sse 0.9180 (min 0.75 each). `studio.compile` and `studio.compile.gateway` rules are vacuous (no such packages). Ratios are mine from the XML; the Gradle task is authoritative. sse is down from 0.9258 in attempt05 but well above its minimum.

## GUIDED_START_FAILED and CONTEXT_LOST

Full list and per-line classification: `guided-start-failed-lines.json`. **No real REL-001 recurrence signal. No line has a TIMEOUT cause or an elapsedMs of 15000 or more (max 64), so Aria's 15 s UNKNOWN_OUTCOME rule never applied.**

- **Runner logs.** Fixtures: 13 `GUIDED_START_FAILED` lines, all CONTEXT_LOST (the line at log 189 also has IDENTITY_MISMATCH), max elapsedMs 19. All injected by tests (attribution by adjacent log context, [I] for most; the IDENTITY_MISMATCH one is the stale-grant test, [V] by the test line printed right after). Final-gates06 had 11 and final-gates05 had 13. The extra pair at log 111-112 is a 4th process-tree session. All three logs contain the same four `cdpSession.send ... closed` errors, so this looks like run-to-run variation in whether the 4th session got refused, not a new source [I]. Unit, deployment, build, image and contracts logs: 0. Unit log has 2 `Error: CONTEXT_LOST` text lines from a passing test.
- **Backend Gradle stdout and test XML.** 0 `GUIDED_START_FAILED`. 2 backend WARN lines `Guided runner refused the context … CONTEXT_LOST`:
  - 13:48:05 `GuidedBridgePlannedIT.lateRenewalResponseAfterStopCannotReviveContextOrOwnership` (XML window 17:47:52 to 17:48:07Z). Same test I verified by source in final-gates06. Injected.
  - 14:02:52 `GuidedPublicationReplayIT.incrementalDriftAuthorityRejectsEveryExactJoin` (XML window 18:01:42 to 18:02:54Z). [V] This closes an open inference from final-gates06: the test javadoc says it covers "a cancelled session and a naturally expired owner lease refuse the authentic body", and the line sits inside the test's XML window. Injected.
  - Other `refused the context` WARN lines with codes SCHEMA, BUSY and IDENTITY_MISMATCH come from the refusal unit tests and other ITs. They are not CONTEXT_LOST and were not counted in final-gates06 either; listed in the json for completeness.
- **Runner-side lines for the backend run.** The ITs write worker stderr to temp files that Gradle does not capture. They were still on disk, so I scanned everything modified after the pre-launch marker and found 5 lines in 4 files (`backend-runner-side-lines/guided-start-failed-worker-logs.tsv`), max elapsedMs 64, no TIMEOUT. Same shape as final-gates06. The pair at 13:48:05 matches the PlannedIT refusal to the second, and the 14:02:54 line matches the ReplayIT refusal. The other two (13:46:07, 13:46:10) fall in `GuidedBridgeIntegrationTest` cancel-then-assign and invalid-claim tests by XML timing; injected by inference. Limit: worker logs already deleted by a teardown cannot be checked, so "none found" covers only what survived.

## Host and process notes

- Swap is dynamic on this host. Total went 3072M to 8192M, used 2524M to 6803M (about 4.3G growth); mid-run at 13:26 it read total 6144M, used 4923M. Free memory stayed 46% to 60%. The run completed with no memory-related failure. Final-gates06 grew about 150M, so this is a larger swap increase than last time, cause not investigated.
- 3238 fixture-media files were backed up. 22 changed during the run and the originals were restored.
- No container started, stopped or removed by me; `docker ps -a` lists the same containers and statuses before and after (only the relative age text differs), none running. Testcontainers cleaned up its own. I built only the two images. `supabase_*_outvo` stayed stopped.
- PIDs 22246, 44737, 13577 and 13581 were never signalled. 22246 was already gone at preflight. 44737, 13577 and 13581 are alive. No Gradle or worker process of mine remains.
- Scratch drivers (`g7.sh`, `write07.py`) are in the session scratchpad. I did not use `/tmp` this time.
