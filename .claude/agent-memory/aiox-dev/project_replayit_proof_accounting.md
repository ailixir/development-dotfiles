---
name: project-replayit-proof-accounting
description: GuidedPublicationReplayIT after the AFTER_LEARN proof - settle vs cancel helpers, recording rules, harness startChild fix, lane runtimes and scratch-run recipe
metadata:
  type: project
---

2026-10-25 (proof backend lane, QA F1/F2/F3). Every publication in the joined ReplayIT now leaves one queued AFTER_LEARN execution, so any later `dispatchOnce()==1` sees 2.

- `acceptedProof` asserts the link row + the single AFTER_LEARN execution on the published revision; `settleProof(session, receipt)` dispatches it (asserts only it is pending), awaits PASSED + video AVAILABLE, checks the result's `proof.executionId` and `evidence.video` null. Use it where the flow counts effects (test 1, 4, 5, 7, 9 secret-login as run 0 of 3, incrementalJoinedCase base+merged, schedulerAndNewHead, itrFreshPublishedFixture). Each proof adds one navigation/receipt/fresh value, one REPLAY_INVOCATIONS quartet, and (secret flows) one Vault read + audit rows.
- `cancelQueuedProof(cookie, session, receipt)` for flows that prove their own ordinary replays or are guided-scope only (p3Publish/b2Publish with p3Cookie, incremental parents/merged with COOKIE). Running the proof inside p3 guided flows gave LOGIN_REQUIRED/INTERNAL_ERROR (fixture state), cancel is the accounted alternative. `dispatchOnce()` then returns 0 and closes the row DONE, which `verifyPreviousWorkerGenerationClosed` needs.
- Learn recording: only a learn that does NOT publish keeps one. Published sessions: `assertGuidedLearnRecordingDiscarded` (result video null, no row, no object, route 404 VIDEO_UNAVAILABLE, call p3AwaitTeardown first). The AVAILABLE/fault coverage lives in `guidedRecorderFault...` (healthy learn cancelled -> assertGuidedLearnRunRecorded; fault learn cancelled). Generation-closed check: published => 0 recording rows, else 1.
- F2 root cause: the recorded-child.mjs the harness generates called `startChild(proc,{observedBuild})` but runner `startChild(processLike, allowedDomains, observed)` (allowed-domains session) -> child had no observedBuild -> PROFILE_MISMATCH. Not a hash/pin issue (dist schema hash == runtime-versions == catalog).
- Registry: renaming a joined test means Java SINGLETON_METHODS/INCREMENTAL_METHODS and build.gradle.kts lists; a new @Test needs the same, so fold coverage into existing tests when possible.
- Runtimes in a scratch tree: default lane 40 tests ~20 min; `guidedIncrementalTest` 49 tests ~39 min (forkEvery=1 per class, so a first-method fixture failure cascades). Restrict one label by patching ValueSource + includePatterns in the scratch copy only.

**How to apply:** see [[tooling-shared-build-dir-clobber]] for the scratch tree; [[project-learn-proof-backend-lane]] for the backend side.
