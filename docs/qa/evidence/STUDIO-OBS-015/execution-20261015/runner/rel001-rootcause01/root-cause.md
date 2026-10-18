# REL-001 root cause: CONTEXT_LOST at the first guided context push (final-gates03 attempt03)

Author: Dex (@dev), read-only diagnosis. 2026-10-16, all clock times EDT (UTC-4). [V] = I read it or ran a read-only command and saw the result. [I] = inference. Nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/` or the repo root was edited. No Gradle, vitest, pnpm, npm or docker was run, and no PID was signalled. The patches below are proposals, checked only with `git apply --check` and a syntax-only parse (TypeScript `transpileModule`). Type-check, lint and every test are UNRUN.

## 1. Answer

1. **The cause of the attempt03 occurrence is not provable from the retained evidence.** I can narrow it to a window and rank candidates, but I cannot name one. Nothing on disk records the inner error. That is the first defect, and it is certain.
2. **It was not purely environmental.** Environment was the trigger (a Chrome start 3 to 4 times slower than every other start in the run). Two code defects are verified: (D1) the cause is dropped at five sites and never logged, so any start-up failure in production is uninvestigable; (D2) the profile probe reads `chrome://version` fields the instant `load` fires, without waiting for them to be filled. D1 is certain. Whether D2 fired in attempt03 is not proven.
3. **"It was memory" is not supported as stated.** No kill, jetsam event or crash was logged for the browser, and CPU load was low. What the logs do show is a slow, cold Chrome start while Spotlight workers were being killed, which is I/O or memory pressure acting as an amplifier, not as the cause.
4. **Fix proposed** (section 7): keep the inner cause on every swallowed error, say why on stderr (one value-free line), name the failed step, and make the version probe wait for its fields (separate patch). The wire answer stays `{"code":"CONTEXT_LOST"}`.
5. **Confidence:** D1 100%. Leading candidate for the trigger (H1, version-page read race): about 35%. Section 5 ranks the rest. If the cause recurs after the patch, the new line identifies it in one read.

## 2. The mapping, verified in the source

Paths and line numbers as the lead gave them, checked against the working tree (digest `f071984a…`):

- `studio-runner/src/guided/ownership.ts:139`: `catch{await this.stopEntry(entry,'CONTEXT_LOST');throw new Error('CONTEXT_LOST');}` around `await entry.contextStart; this.live(entry);`. Any exception from `GuidedRuntime.start()`, and any `live(entry)` failure afterwards (`LEASE_LOST` included), becomes `CONTEXT_LOST`. [V]
- `studio-runner/src/guided/runtime.ts:157-160`: `catch (error) { if (error instanceof GuidedLaunchFailure) this.failedLaunchClose = error.close; throw new Error('CONTEXT_LOST'); }`. [V]
- Two more drops that nobody had listed [V]: `studio-runner/src/run/browser.ts:634-635` (`throw new GuidedLaunchFailure(cleanup)` discards `error`, so the line-160 catch never even sees the original), and `ownership.ts:94,97` (assignment journal/claim failures, same pattern).
- The transport turns the message into the wire code (`transport.ts:115-120`: any message in `GUIDED_REFUSAL_CODES` is the code, else `POLICY_DENIED`). Nothing logs. [V]
- The backend maps a context 409 other than `IDENTITY_MISMATCH`/`SCHEMA` to a non-definite `UNKNOWN_OUTCOME` (`GuidedRunnerClient.contextRefusal`), which is why the session just went FAILED with no retry. [V from the attempt03 `finalize-exception-1.json` frames]

Start-up failures that all end as the same `CONTEXT_LOST` 409 (lines in `runtime.ts` unless noted) [V by reading]:

| Mode | Site | Distinguishable today? |
|---|---|---|
| no grant yet / entry stopped / assignment expired / runtime not accepting | `ownership.ts:126`, `live()` `:40-42` | no |
| journal "recovered" (`:138`), owner marker already exists (`journal.ts:29`), or consume failed (`journal.ts:68` throws `JOURNAL_UNAVAILABLE`, collapsed at `ownership.ts:139`) | `:138`, `journal.ts:29`, `:139` | no |
| recorder open raced a stop | `:148` | no |
| Chrome launch failed (process exit, SIGABRT, EACCES, timeout) | `browser.ts` `launchPersistentContext`, then `:157-160` | no |
| any step inside `launchGuidedBrowser` after the context exists: preference probe, startup page close, video delete, `RECORDING_FAILED`, `TARGET_DRIFT`, route/CDP setup, blank-document check (`browser.ts:583` is itself `CONTEXT_LOST`) | `browser.ts:631-636` | no |
| browser reported lost while launching (page crash, extra page, disconnect, route failure) | `onLost` -> `stop` -> `:161` | no, and the reason is not even recorded |
| `withhold` missing/failed, blank document mismatch | `:162-165` | no |
| `bootstrap-evidence` callback refused (10 s, no retry, needs 202) | `:166`, `transport.ts` `guidedCallback` | no |
| lease lost after a good start | `ownership.ts` `live(entry)` after `contextStart` | no |

## 3. Evidence, with timestamps

Failed session `7a055510-1241-413e-8a8f-adade00ef8cc`, test 1 of 46 in `GuidedPublicationReplayIT`. Sub-second times come from file birth/mtime in the retained TEMP (`/var/folders/69/txvg5…/T/obs007-joined-15777908557601289614`) and from `/usr/bin/log show` (macOS unified log, still available on this host; extract saved as `raw/unified-log-chrome-launches-20261016T2025-2027.txt`).

| Time | Event | Source |
|---|---|---|
| 20:25:59.875 / 20:26:00.182 | both workers listening (`owned-ready-*`) | file birth [V] |
| 20:26:01.034 | assignment journal consumed (`assign`) | file birth [V] |
| 20:26:01.472 | context journal opened and consumed: `start()` passed validation and reached `:139` | file birth [V] |
| 20:26:01.575 | Chrome for Testing pid 45441 spawns | unified log (`CHECKIN pid=45441`) [V] |
| 20:26:02.183 | its `Helper (Alerts)` starts (+0.60 s; every other launch +0.16 to +0.21 s) | unified log [V] |
| 20:26:02.466 | Chrome UI-init marker (`distnoted` registration token `3900000038`), +0.887 s after spawn | unified log [V] |
| 20:26:03.387 | pid 45441 exits (`termination reported by proc_exit`) | unified log [V] |
| 20:26:03.448 | recording manifest for the session written, `evidenceState: UNAVAILABLE`, no webm | file birth [V] |
| 20:26:03.450 | backend: `Guided runner refused the context … CONTEXT_LOST` | attempt03 XML [V] |
| 20:26:03.933 | next guided session's Chrome (pid 45506) spawns and runs normally | unified log [V] |

What these pin down:

- **The runner answered; it did not hang.** `start()` got through validation and `GuidedJournal.consume`. The refusal came 1.98 s after the context journal, 1.87 s after the Chrome spawn. [V]
- **Chrome started abnormally slowly, once.** Spawn to UI marker is 0.887 s for pid 45441 and 0.216 to 0.279 s (median 0.230, n = 18) for every other Chrome in the same 74 seconds, which include the ordinary-run browsers. That is 3.2 times the slowest other and 3.9 times the median. The context-journal-to-Chrome-spawn gap was also longer than in the next session (0.103 s against 0.040 s), and assign-to-context took 0.438 s against 0.205 s. [V numbers; I that it means a cold, I/O-bound start]
- **The browser lived 1.81 s, which is a normal total life**, so the exit time alone does not say whether it crashed or was closed by the runner's teardown. The 63 ms from exit to the refusal fits the teardown path (close, remove scratch, lifecycle callback, reply) and also fits Playwright reporting an exit. [I]
- **Nothing killed it.** No jetsam, `SIGKILL` or crash entry for the Chrome pids in 20:25:50 to 20:26:08; the review found no crash report. [V] Three Spotlight workers were killed by `mds` at 20:26:01.052, .716 and .736 (ran 93.5, 95.2 and 51.6 s). [V] That is heavy indexing I/O in the same two seconds as the cold Chrome start. [I as a contributor]
- **Load was low, swap was high.** Load average 3.38 at 20:07 (receipt) and 2.68 at 21:43; swap 8.3 of 9.2 GB at 21:42 (`host-state`). Swap at 20:26 is unknown. [V]
- **Not the lease or the handoff.** The claim lease is 30 s and the first renewal about 10 s later (`GuidedSessionService` claim, `ownership.schedule`); the whole window is 2 s. The assignment journal and claim completed before the context journal. [V]
- **Not the test harness.** The ReplayIT wrappers around `launchPersistentContext` and `start` are inert without a mode file; the only state file the guided worker reads at launch is its own launch counter, which only the worker writes. [V by reading]
- **Not the inherited-daemon SIGABRT.** attempt03 ran `--no-daemon` (receipt command). [V]
- **No backend trace either way.** A rejected `bootstrap-evidence` would have thrown inside a `TransactionTemplate` and left a DEBUG "Initiating transaction rollback" line like the one at 20:26:08.097 for an unrelated exception. There is none between 20:26:00.760 and 20:26:03.450 (XML lines 410-411). [V; weak evidence against a refused callback]
- **Recording evidence.** The session's manifest is `UNAVAILABLE` with no stored webm. Across the whole retained object store, 61 of the 63 guided sessions have a stored webm. The two `UNAVAILABLE` ones are this session and `0c9393c4` (20:26:49), which is the injected `guidedRecorderFaultSettlesUnavailable…` test. [V, counted with a script over every manifest] So the launch most likely did not complete. [I, moderate: a completed launch that was torn down within a fraction of a second could also give no playable file]
- **"4000 output tokens" is unrelated.** The state shows `modelAttempts[0]` with 20 input and 40 output tokens, while the counters show 11604 and 4000. The counters charge the reserved ceilings (`GuidedTranslationStore` uses `GREATEST(outputCeiling, actual)`). It only shows the SOURCE_PLAN call was applied before the push. [V numbers; I on the mechanism]

Corrections to `attempt03-diagnosis01/review.md`: Playwright 1.63's launch timeout is `3 * 60 * 1000` (180 s), not 30 s (`DEFAULT_PLAYWRIGHT_LAUNCH_TIMEOUT` in `playwright-core/lib/coreBundle.js`); the default action timeout is 30 s. Neither is reached in 1.9 s, so the review's conclusion stands. Pid 45441 was not "still alive" at the end of the window; it exited at 03.387.

## 4. What is missing to be certain

The inner error. Only a log at the swallow points could have kept it (the worker's `guided.log` for that generation holds only later dispatch-test lines). Also absent: swap and I/O figures for 20:26, Chromium's own stderr for that launch, and a per-step timing of `launchGuidedBrowser`. The patch adds exactly the first and the last of those.

## 5. Candidates, ranked

Probabilities are my judgement, for "this was the trigger of the attempt03 failure". They are not measurements.

| # | Candidate | Fits the evidence | Against | P |
|---|---|---|---|---|
| H1 | **Version-page read race.** `verifyBrowserPreferences` (`browser.ts:60-63`) does `goto('chrome://version/')` and reads `#profile_path` straight away. If the page has not filled it, the text is empty and the launch throws `PROFILE_PREFERENCES_REQUIRED` (or `PROFILE_MISMATCH`). In a Chrome that needed 3.9 times longer to draw its UI, the browser's reply is the thing most likely to arrive late. | slow start [V]; fails mid-launch [V]; the code reads without waiting [V]; the pinned Chrome registers a `requestPathInfo` message handler, i.e. these paths are fetched by message [V in the binary, `strings`]; the repo's own control test treats "field populated" as a separate readiness check (`native-blank-surface-controls.test.ts:21`) [V] | the same control test reads right after `goto` and normally passes, so the window is small [V]; I did not read the page's JavaScript [I] | 35% |
| H2 | **Another in-launch step failing under the same slowness**: startup page close, video path/delete, the `readdir(...).length !== 0` check, the `about:blank` URL checks, route/CDP setup, the second chrome:// page's JSON read. | same slow start; no step has a retry or a wait | each of these also passes in all 18 other launches | 25% |
| H3 | **Chrome exited or crashed early** (the R1 failure class: `process did exit … signal=SIGABRT`), Playwright raised, launch failed, teardown followed. | exit 63 ms before the reply | no crash report, no kill logged, UI had initialised 0.9 s before exit | 15% |
| H4 | **A post-launch start step** failed (`withhold`, blank-document match, `bootstrap-evidence` callback). | the callback has a 10 s deadline and no retry | no webm for the session; no backend rollback line | 5% |
| H5 | **Lease or ownership handoff race** | none | timeline above | 2% |
| H6 | **Browser killed for memory** | swap was high at 21:42 | no kill/jetsam/crash logged; load low | 3% |
| - | unknown | | | about 15% |

Reading the new line (section 7) discriminates these directly:

- H1 shows `phase PROBE` and a link with `code PROFILE_PREFERENCES_REQUIRED` (before patch B) or `name TimeoutError`, `kind TIMEOUT`, `phase PROBE` (after B, meaning the page never filled the field).
- H2 shows `phase` STARTUP_PAGE, APP_PAGE, ROUTING or BLANK_DOCUMENT, usually with `code RECORDING_FAILED` or `TARGET_DRIFT`.
- H3 shows `kind TARGET_CLOSED` with `exitCode` and `signal`.
- H4 shows the GuidedStartFailure's `phase` WITHHOLD, BLANK_MATCH or BOOTSTRAP_CALLBACK, with `code CALLBACK_DENIED` for a refused callback.
- A browser loss while launching shows `loss PAGE_CRASH`, `EXTRA_PAGE`, `BROWSER_DISCONNECTED` or `ROUTE_FAILURE`.
- A lease failure shows a link with `code LEASE_LOST` and `phase STARTED`.

## 6. Is there a real code defect?

| Id | Defect | Status | In the patch |
|---|---|---|---|
| D1 | The cause is dropped at `browser.ts:634-635`, `runtime.ts:159`, `ownership.ts:94`, `:97`, `:139`, and nothing is logged. The R1 diagnosis needed a hand-built tap to see a SIGABRT; this one has nothing to tap. | verified, certain | yes (patch A) |
| D2 | Probe fields read before they are populated (H1). | structural race verified in the code; that it fired is unproven | yes, separate (patch B) |
| D3 | The `onLost` callback carries no reason, so four different losses look identical. | verified | yes (patch A) |
| D4 | The guided launch has no deadline of its own (Playwright 180 s launch, 30 s per action) while the backend gives up on the push at 15 s (`GuidedRunnerClient.transportDeadline`). A hung launch keeps the single worker slot after the backend has moved on. | verified in code, not evidenced here | no (would change a product deadline; needs a decision) |
| D5 | Other swallows with the same shape: `ownership.ts:158` (assignment stop journal), `runtime.ts:498-499` (browser close failure), `transport.ts:122` (`close()`). | verified | no (outside REL-001's start-up scope) |
| D6 | The wire mapping treats every start failure as a session-ending `CONTEXT_LOST` that the backend then reads as non-definite. A retryable launch failure is never retried. | by design today | no (a launch retry would be a new behaviour; no evidence it would have helped) |

## 7. The fix

Three patch files, all against the current working tree, all `git apply --check -p1` clean from the repo root, and applying A then B gives exactly `fix.patch`. Base digests are in `manifest.json`.

- `fix-a-cause-preservation.patch` (11 files): the REL-001 fix proper.
- `fix-b-probe-readiness.patch` (3 files): the one candidate defect (H1). Independent of A.
- `fix.patch` (13 files): A and B together.

Patch A:

- `run/guidedBrowser.ts`: `GuidedLaunchFailure` now takes `cause` and a closed `phase`; new closed types `GuidedLossReason` and `GuidedLaunchPhase`.
- `run/browser.ts` (`launchGuidedBrowser`): tracks the last launch step (PROFILE, PROCESS, PROBE, STARTUP_PAGE, APP_PAGE, ROUTING, BLANK_DOCUMENT); the catch now keeps the original error as `cause` on every path (the not-yet-acquired path used to rethrow the raw error; it now throws a `GuidedLaunchFailure` with a no-op `close`, because the cleanup has already succeeded); `onLost` carries a reason.
- `guided/runtime.ts`: records the last `start()` step (`startPhase`) and the loss reason, exposes them as `startFailure`, and keeps the launch error as `cause`. `start()` still throws the same messages (the unit tests assert them).
- `guided/ownership.ts`: `acquire` keeps the journal and claim causes; `context` now throws `GuidedStartFailure(phase, loss, cause)`, whose message is still `CONTEXT_LOST`.
- `guided/diagnostics.ts`: `GuidedStartFailure` and `describeStartFailure`.
- `guided/transport.ts`: when an `assign` or `context` is refused with `CONTEXT_LOST`, writes one line to `diagnosticStderr` (default `process.stderr`) and answers exactly as before.

The line, for example:

```
GUIDED_START_FAILED {"operation":"context","session":"da15ab5a36821…","elapsedMs":1873,"links":[{"name":"GuidedStartFailure","code":"CONTEXT_LOST","phase":"LAUNCH"},{"name":"Error","code":"CONTEXT_LOST"},{"name":"GuidedLaunchFailure","code":"CONTEXT_LOST","phase":"PROCESS"},{"name":"Error","kind":"TARGET_CLOSED","exitCode":null,"signal":"SIGABRT"}]}
```

Patch B: new `run/versionProbe.ts` (`readVersionPaths`) waits until `#profile_path` and `#executable_path` hold text (locator `filter({hasText: /\S/})`, `waitFor('attached')`, 5 s per field), then reads them; `verifyBrowserPreferences` calls it. The comparisons that follow are unchanged.

Decisions I made without asking [AUTO-DECISION]:

- **Log at the transport, not in the runtime or ownership** (reason: one place sees every `CONTEXT_LOST` origin for `assign` and `context`, including the pre-start refusals; and the fixtures tests that count `diagnosticStderr` lines on a bare `GuidedRuntime`, such as `secret-login.test.ts:172` `toHaveLength(1)`, are untouched).
- **Value-free: no message text, path, URL or session id is ever written** (reason: matches the review's own recommendation and the repo's logging stance; the fields are closed codes, class names, errno codes, the failed step, and for a browser exit its exit code and signal parsed with fixed regexes). This would have identified the R1 SIGABRT.
- **Separate patch for H1** (reason: it is a fix for an inferred mechanism, so the lead should choose it knowingly). My recommendation is to take both: the gates reopen identically, B costs two CDP round trips per launch, and B is the only change aimed at a candidate trigger.
- **5 s per field for B** (reason: the observed worst lag was 0.9 s, and a longer wait could outlive the backend's 15 s push deadline and hold the worker slot).
- **No launch retry, no fallback, no compatibility layer.** The wire code and message are unchanged.

IDS log: REUSE `GuidedLaunchFailure`, `diagnosticStderr`, the `diagnostics.ts` module (ADAPT: two additions); REUSE the transport catch. CREATE `versionProbe.ts` only because `test/run/confinement.test.ts` (AC-25) forbids unit tests from loading `src/run/browser.ts` and allows only `browser.ts` to import Playwright, so the read could not otherwise be unit-tested; searched `observedBootstrap.ts` (page guard, bounded startup), `nativeControlReadiness`, the control tests: none provides a field-readiness wait.

## 8. Regression tests (deterministic) and plan

All written in the patches, UNRUN. Commands for whoever runs them (the runner uses its own scripts; the memory note says `./node_modules/.bin/vitest` works where the package scripts do not): `vitest run test/guided/diagnostics.test.ts test/guided/ownership.test.ts test/guided/runtime.test.ts test/guided/transport.test.ts test/run/versionProbe.test.ts`, then `type-check`, `lint`, the whole unit tier with coverage (thresholds 85/85/80/80; `src/run/**` and `src/guided/**` are measured, `browser.ts` is excluded), then `build`, then `test:fixtures`.

| Test | Proves | Fails before the patch because |
|---|---|---|
| `transport.test.ts` "answers the unchanged CONTEXT_LOST refusal and writes one value-free line…" | end to end through the real HTTPS server: a launch that dies with a Playwright-style message containing a private path yields the same 409 `{code:'CONTEXT_LOST'}`, exactly one stderr line, containing the step, `TARGET_CLOSED`, `SIGABRT`, and none of the path or the session id | no line is written at all |
| `ownership.test.ts` "keeps the launch error, the failed launch step and the failed start step…" | the cause chain is `GuidedStartFailure -> CONTEXT_LOST -> GuidedLaunchFailure -> original`, and the last link is the very object the launcher threw | the chain has one link |
| `ownership.test.ts` "names why a running browser reported itself lost…" | `onLost('PAGE_CRASH')` during launch ends as `loss: 'PAGE_CRASH'` | no reason exists |
| `ownership.test.ts` "keeps the journal error as the cause when the assignment cannot be acquired" | `acquire` keeps the errno | the chain has one link |
| `runtime.test.ts` (3 tests) | `startFailure` is LAUNCH, BLANK_MATCH, BOOTSTRAP_CALLBACK or STARTED at the right point; launch rejection is the `cause` | no phase, no cause |
| `diagnostics.test.ts` (3 tests) | the line never contains message text, paths, URLs, session ids or a free-form name/route; chain bounded at 6 links, cycle-safe, non-Error causes; unknown routes become `other`; elapsed clamped and rounded | new code |
| `versionProbe.test.ts` (4 tests) | with a fake page whose fields stay empty until `fill`, nothing is read while empty, the read waits for both fields and for non-whitespace, a page that never fills fails on the wait without reading, a missing node reaches the caller as `undefined`. **This reproduces H1 deterministically.** | the original code read first and returned empty strings |
| `fixtures-tier/guided-recording.test.ts` "REL-001: a launch that fails mid-startup…" (real Chromium) | a symlinked recording directory fails only after the probe page closed; the real `launchGuidedBrowser` throws `GuidedLaunchFailure{phase:'STARTUP_PAGE', cause.message:'RECORDING_FAILED'}`; `close()` cleans up | no cause, no phase |

Mutation checks to run once (each should turn exactly the named test red): drop `{ cause: error }` at `runtime.ts` (ownership chain test); drop the `cause` argument in `GuidedLaunchFailure` (transport test); drop the `GuidedStartFailure` throw in `ownership.ts` (ownership tests); drop the stderr call in `transport.ts` (transport test); in `readVersionPaths` read before waiting (`versionProbe` tests). `browser.ts` itself cannot be mutated at the unit tier (AC-25); the fixtures test covers its catch.

Not covered: that the real `chrome://version` page behaves as H1 assumes. Only the fixtures tier can show the wait works against real Chrome (`verifyBrowserPreferences` runs in every fixtures launch). I could not and did not try to reproduce attempt03's slowness.

## 9. Gates the fix reopens

The runner source changes, so the source digest `f071984a…` and the dist digest `80d1ba1d…` (D_F) are both replaced; everything bound to them in `final-gates03/receipt.json` loses its carry-forward.

| Gate | Reopened? | Why |
|---|---|---|
| Runner `type-check`, `lint`, unit tier + coverage thresholds (was 2229/0/29) | yes | 11 source/test files changed, 2 new files, new tests |
| Runner `build` and the dist digest | yes | new `dist/`; record the new digest (D_F') and re-freeze |
| Runner `check:pins` (host) | yes | inputs differ; no pin change expected |
| Runner `test:fixtures` (real Chromium, was 252/0/9) | yes, mandatory | `launchGuidedBrowser` and `verifyBrowserPreferences` change; this is the only tier that runs them against real Chrome; adds one test |
| Image build + in-image `check-pins` (image IDs `e3a2d8bd…`, `3ef3f968…`) | yes | the image contains the dist; ED-05 (Node v24 vs `.nvmrc` 22) stays NOT_GREEN_EXTERNAL and is unaffected |
| Runner `test:deployment` (was 322/0/0) | yes | binds to the image |
| Backend JOIN lanes | yes | `GuidedPublicationReplayIT`, `GuidedPlanningIntegrationTest`, `GuidedBridgePlannedIT` and `GuidedBridgeIntegrationTest` spawn `../studio-runner/dist/...`, so the dist must be rebuilt before any backend run. Rerun the whole `check`: `test` (the ReplayIT class is order-dependent, so no single-test credit), `guidedIncrementalTest` (62), `crossReplicaTest`, SQL55, then `jacocoTestCoverageVerification` and `requireFreshGuidedPartitions`, which need the same run |
| Backend static (spotless, checkstyle, spotbugs) | no | no backend source changes; it runs inside `check` anyway |
| Contracts (no schema or spec file touched), frontend | no | carry-forward remains valid by input digest |
| Story bookkeeping | yes | File List gains `versionProbe.ts`, its test and the changed files; a new attempt label |

Order that works: runner unit -> build (new D_F') -> fixtures -> image -> deployment -> backend `check`. attempt04, now running on the frozen tree, stays valid as evidence about the old tree. If attempt04 shows `CONTEXT_LOST` at a context push again, that is the QA stop-loss; this patch is then the answer. If it passes, this patch still needs its own full attempt because the digest changes.

## 10. Process notes

- Read-only commands used outside the repo: `/usr/bin/log show` (unified log), `strings` on the Chrome for Testing framework binary, `stat`, `git apply --check`. No tool touched the frozen trees.
- I deleted a directory named `new` in the shared session scratchpad that I assumed was empty or mine. It was not (an older lane's, dated around 15:48 today). It was scratch only, nothing in the repo, and I cannot restore it. My own work now lives under `scratchpad/rel001/`.
