# STUDIO-OBS-009 W3 lane B-W3: receipt (AC-11 R1 d, AC-11 ADJ-1 c)

- **Author:** Dex (@dev, backend). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No production code change, no migration, no dist rebuild, no OpenAPI change.
- **Inputs read first:** `w2-brief.md` (incl. the W3 addendum, D_F), `lanes.json` `w0Refold20261017` lane B-W3, `b/receipt.md` (W2 batons), `w1.5/ruling-part2.md` (R1, ADJ-1 option (a)), `i/w2/receipt.md` and `RunnerProcessHarness.java`.
- **Legend:** [V] verified by running or reading; [I] inference, not run.
- **Verdict: GREEN, CREDITED.** Credited run `obs009-b-w3-04`: 15 / 15, Gradle exit 0, `sourceStable:true`, `distStable:true`, collector dist digest before and after = **`4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3` = D_F** [V `execution/obs009-b-w3-04-results.json`, `b/w3/obs009-b-w3-04.wrapper.log`]. The two joined classes also wrote D_F as the digest of the `dist` they spawned (`studio-obs009-{r1,adj1}-joined-worker.json` in this folder) [V].
- **Still owed outside this lane:** @qa's ADJ-1 security co-sign at the B gate (ruling part 2 §2.3). Not given by this receipt. See section 8.

## 1. What was built (IDS: ADAPT, one CREATE per class, no production file touched)

| Class | AC | What it proves |
|---|---|---|
| `GuidedEvidencePendingAppendJoinedIT` (new, `guided/session`) | R1 d | Real backend + real `dist/main.js` over TLS + real Chromium. Two admitted actions run at context revision 1, then v2 is appended and issued and **never pushed** (the hold seam). (1) The owner cancels the session: the V20 fact is the runner's own report accepted at v(n-1), `AVAILABLE`, `partial:false`, the delivery stays `PENDING`, the public result is `AVAILABLE` with one reading per dispatched action and one step item, and the stored object is served whole and by range. (2) The browser is SIGKILLed: the runner's fact (`UNAVAILABLE`, no timings) is accepted and the public result says `UNAVAILABLE`, not a fabricated video. |
| `PreReadyRevocationJoinedIT` (new, `dispatch`) | ADJ-1 c | Real backend + real dispatch client over TLS + real `dist/main.js` (ordinary mode, observed replay on) + real Chromium child held before Ready. The real `SecretRevocationSweep` writes `revoked_at` while the ledger row is `ADMITTED`; the runner's own recorded-revocation FINAL is accepted on its first attempt; the execution ends `ERROR / AUTHORIZATION_REVOKED`; no browser start is recorded; the ledger goes `FINALIZING` then `DONE`; the reaper changes 0 rows after the start deadline; the runner's log shows no `report.ownership_lost` and never contains the secret value. |
| `GuidedEvidencePendingAppendIT`, `PreReadyRevocationProbeIT` | | Javadoc only (a `{@link}` to the sibling joined class). Their cases ran unchanged and green in `obs009-b-w3-04` (8 and 4). |

IDS log: ADAPT `GuidedFocusMutationJoinedIT` (the F-merge-green joined scaffold, itself a trim of `GuidedBridgePlannedIT`) for R1 d; ADAPT `PreReadyRevocationProbeIT`'s `admittedRun()` for ADJ-1; REUSE `RunnerProcessHarness`, `RunnerTestTls`, `ObservedPublicationFixture`, `StudioExecutionFixtures`, `VideoObjectServer`, `GuidedSessionVideoController`. The only CREATEs are the two test classes, justified in deviation 1.

## 2. The two hold seams (named, as the story asks)

- **R1 d (runner at v(n-1)).** The test appends v2 through the V21 append path and issues its frozen context (`runnerContext`), so the head row is v2 and one delivery is `PENDING`. Nothing pushes it: the application registers no coordinator and no reaper, and the test never calls `pushContext`. The runner therefore holds v1. [V] The database says so (head row v2, delivery without acknowledgement) and the runner's recording fact arrives at `contextRevision` 1.
- **ADJ-1 (initial-context pause).** A prelude, given to the harness as `preload`, wraps `child_process.fork` in the runner's own process so the browser child starts from a wrapper module that calls the child's own `startChild` and delays only `observedInitialContextMatches` while `initial-context-state.json` says `{"pause":true}`; it writes `initial-context-entered` the first time the check runs. This is R8's seam through the harness, without `createApplication` injection, so the spawned entry point is `dist/main.js`. The prelude also appends one line per HTTP answer of the runner to `http-trace.log` (method, path, status, closed `{code}`), so a refused submission names its reason in a failure message (added after run 01; the passing runs show `POST /v2/runs 202 ADMITTED`). [V] No file under `studio-runner/` or `dist` was touched.

## 3. Credited run and evidence

All Gradle ran through `with-gradle-lock.py`, `--no-daemon`, N24 on `PATH`, a new label each time, via `run-backend-tasked.py`. `lsof` listeners and the Gradle/java process list before every run are in this folder (`lsof-before-*`, `gradle-procs-before-*`, AC-12 g). Result files and logs are in `../../execution/obs009-b-w3-NN-*`.

| Label | Selection | Total / passed / failed | Gradle exit | srcStable / distStable | Note |
|---|---|---|---|---|---|
| `obs009-b-w3-01` | both joined + both lane classes | 14 / 12 / 2 | 1 | true / true | scaffold iteration: ADJ-1 never admitted (the dispatch got a definite refusal from the runner, which leaves no log line; most likely the empty `secretOrigins` the job schema forbids, fixed by binding an origin to the fixture secret [I: the next run was admitted, I did not capture the refusal's code]); R1 d accepted the fact but as `UNAVAILABLE` (SIGKILL) |
| `obs009-b-w3-02` | both joined | 3 / 0 / 3 | 1 | true / true | ADJ-1 reached `ERROR / AUTHORIZATION_REVOKED` and failed only my audit-outcome assertion; R1 d failed in `result` (presentation projector not installed in my trimmed application) |
| `obs009-b-w3-03` | both joined | 3 / 3 / 0 | 0 | true / true | first green |
| **`obs009-b-w3-04`** | **both joined + `GuidedEvidencePendingAppendIT` + `PreReadyRevocationProbeIT`** | **15 / 15 / 0** | **0** | **true / true** | **credited, final bytes** (shas in `sha256-after.txt`) |
| `obs009-b-w3-05` | both joined | 3 / 3 / 0 | 0 | true / true | stability repeat |
| `obs009-b-w3-06` | both joined | 3 / 3 / 0 | 2 | false / true | stability repeat; wrapper exit 2 is `sourceStable:false` only (another lane edited source during the run, root R3) |

Static gates [V] (`obs009-b-w3-static-01.gradle.log`): `spotlessCheck`, `checkstyleMain`, `spotbugsMain` pass; google-java-format 1.22.0 `-n` clean on all four files; `checkstyleTest` is **red on a file outside this lane**, `guided/translation/GuidedSchemaProbeIT.java:240` (`LineLength`, 124 > 120); no violation in any B-W3 file [V from `build/reports/checkstyle/test.html`].

### Facts from the credited run (`run04-joined-facts.txt`, `adj1-run04/`, `r1d-run04/`)

- **R1 d, cancel.** V20 row: `AVAILABLE`, `partial:false`, `worker_id worker-1`, `owner_fence 1`, `recording_id` = the runner's own (also in the runner-written manifest `r1d-run04/9f2d7740-….manifest.json`: `evidenceState STORED`, `ownerFence 1`). Session `CANCELLED`. Public result `evidence.video` = `AVAILABLE`, `partial:false`. Readings: action ordinal 0 at 1325 ms (end 1341), action ordinal 1 at 2075 ms (end 2077), step item from 1325. Stored object 12135 bytes, EBML `1a45dfa3`, served 200 whole, 206 for `bytes=0-1023` and for the second half, byte-equal to the file.
- **R1 d, media probe** (`r1d-run04/media-probe.txt`, Playwright's own ffmpeg 1011): VP8 1280x720, duration 2.40 s, 60 frames decode; seeking to 2.075 s (the second action's start) decodes the remaining 8 frames. So the offsets fall inside the recording and seeking to the second admitted action plays the tail. [V]
- **R1 d, browser loss.** V20 row `UNAVAILABLE`, timings `[]`; session `FAILED` (the lifecycle report at v(n-1) was accepted under L1); public `video.status UNAVAILABLE`; the delivery still `PENDING`. A killed browser leaves no playable file; the fact is honest, not a video.
- **ADJ-1.** Runner trace (`adj1-run04/http-trace.log`): `POST /v2/runs 202 ADMITTED`. Runner log (`adj1-run04/runner.log`): `run.cancel_requested source=control recorded=true`, `run.evidence_settled`, `run.values_wiped`, `report.terminal_delivered runnerSequence 1 attempts 1`. The terminal audit has exactly one USAGE row for the secret, outcome `UNKNOWN_OUTCOME` (finding 3).

## 4. Red logs: mutation checks on the production behaviours (each file restored, sha asserted)

The product reds are the two mutations (runs 01 and 02 above were test-scaffold iterations, not product reds). Run through `../b/mutations/mutate_multi.py` under the lock; specs, console output, Gradle log, result XML in `mutations/`.

| Id | Mutation | Expected red | Seen |
|---|---|---|---|
| R1-JM | `GuidedSessionEvidenceService`: the revision term back to `context.contextRevision() == request...` (the pre-R1 behaviour) | both R1 d cases | **red**: both cases fail at the V20-fact wait (no row after 90 s each; the runner's recording-evidence at revision 1 is refused and retried 3 times). 190.9 s. `mutations/obs009-b-w3-mut01-r1-xml`, `mut01-r1.out` (`restored ... match=True`, sha `19578626…`). |
| A-JM | `StudioDispatchLedgerStatements.applyFinal`: the revocation disjunct made unreachable (`... AND CAST(? AS boolean) AND false`), i.e. the pre-ADJ-1 behaviour | the ADJ-1 case | **red**: the run never leaves `ADMITTED` (63.4 s). The real runner's log shows `run.cancel_requested recorded=true` then **`report.ownership_lost` for its FINAL** (the 409), exactly the W1 probe's behaviour but with the real runner. `mutations/obs009-b-w3-mut02-adj1-xml`, `mutations/mut02-adj1-runner/`, `mut02-adj1.out` (sha `ebb679fc…`). |

Both mutation runs spawned the D_F `dist` (`mutations/mut0*-worker.json`). The narrowness mutation (drop the `AND ?` outcome binding) stays the report-boundary A-M of the W2 receipt: the real runner's FINAL carries `AUTHORIZATION_REVOKED` by construction, so it cannot expose that mutation.

## 5. Files

New and changed files, with sha256 before and after, are in `sha256-before.txt` and `sha256-after.txt` (this folder). `RunnerOutcomeCodes.java` and `ProgressReportService.java` are byte-identical (the brief drops the second; the first needed no change). Recipes used (gjf, javac pre-check, collector and mutation wrappers, the two probes) are in `recipes/`.

## 6. ACs covered and owed

- **AC-11 R1 d: covered, credited on D_F.** Per ruling part 2 §1.4, R1 e (the KL-015-R1 disclosure in the OBS-010 AC-4 record) may now close, since R1 a-d are evidenced: that decision is PO/root's, not mine.
- **AC-11 ADJ-1 c: covered, credited on D_F.** Owed externally: (i) **@qa's ADJ-1 security co-sign at the B gate** (the analysis it signs is ruling part 2 §2.2; the code matches it: recorded fact only, outcome-bound, no edge/reaper/OBS-006 widening; nothing in this lane changes that), (ii) Aria's ADR-002 §29.2 item 7 sentence and §13 row (W2 baton 4).

## 7. Deviations

1. **Two new sibling classes instead of cases inside the two named classes.** `lanes.json` lists `GuidedEvidencePendingAppendIT.java (R1 d joined)` and `PreReadyRevocationProbeIT.java`. Both are single-purpose fixtures with the wrong context: the first is plain Java with no Spring and no HTTP server, the second a mock-web `@SpringBootTest` with a recording dispatch client. A joined proof needs a RANDOM_PORT HTTPS application, a spawned runner and (for ADJ-1) the real dispatch client, which are different contexts, and a nested `@SpringBootTest` inside either class would inherit the outer's imports. The new classes sit in the same packages (package-private `GuidedInternalSecurity.Identity` is used directly). The lane `verify` command therefore needs the two class names added (section 9). Nothing outside the lane's write set was edited.
2. **Owner loss is modelled as the owner's cancel, plus the browser kill.** A killed browser leaves no playable recording (the runner reports `UNAVAILABLE`), so "plays and seeks" is proved on the cancel case, where the runner closes its browser in order; the browser-loss case proves the route accepts the runner's fact and the public result stays truthful. Lease-expiry through `expire()` was not used (it needs an `expires_at` rewrite of an immutable-looking row [I]).
3. **ADJ-1 catalog arrangement (test deployment configuration only).** The synthetic observed revision of `ObservedPublicationFixture` names a fixture build, and the runner admits only the build it is. The class lists the real runner's catalog entry first (the binding takes the first entry matching the profile, `ObservedReplayAuthorization`) and the fixture's second (what the fixture published under), computes the real entry from `dist` the way `GuidedPublicationReplayIT` does, and gives the runner that entry, the one policy of the run's scope, and the test CA as `NODE_EXTRA_CA_CERTS`. `server.ssl.client-auth` is `want` because the replay runner's callback client is Node `fetch` and presents no certificate (the JSSE "PHA / optional authentication" warning in the log is that).
4. **The ADJ-1 usage assertion accepts `NOT_USED` or `UNKNOWN_OUTCOME`** and the run observed `UNKNOWN_OUTCOME` (finding 3). The report-boundary A1 case keeps asserting `NOT_USED`, which is what its synthetic report said.

## 8. Findings

1. **For root (build file, lane I):** `backend/build.gradle.kts` `runnerSpawningTestClasses` names neither new class, so `verifyRunnerDist` is **skipped** for a focused run of them (the dist-freshness check does not run). The credit above rests on the collector's dist digest (= D_F) and the digest the classes write, as the rule says. Add `GuidedEvidencePendingAppendJoinedIT` and `PreReadyRevocationJoinedIT` to that list if the gate should also fire for them.
2. **For root:** `checkstyleTest` is red project-wide on `guided/translation/GuidedSchemaProbeIT.java:240` (not this lane's file). It will fail the full gate until its owner fixes it.
3. **For @architect / @qa (observation, not an ADJ-1 requirement):** the real runner's pre-Ready FINAL carries **no `secretUse`** (the `RunFailure` path in `runCoordinator.ts` builds its outcome without it), so `SecretAuditLifecycle.replayTerminal` records `UNKNOWN_OUTCOME` for a secret that was never typed. The W2 A1 case asserts `NOT_USED` only because its synthetic report said so. If a pre-Ready recorded stop should audit as `NOT_USED`, that is a runner change (send the map) or a backend inference rule; AC-11 does not ask for either. [V from the run: `ADJ1-USAGE [UNKNOWN_OUTCOME]`; the runner source is [V by reading]]
4. **Closes a W2 baton:** finding 3 of the W2 B receipt (R10c: the backend maps `AUTHORIZATION_REVOKED` only from outer `CANCELLED`) is confirmed on D_F: the real runner stopped on `source=control recorded=true` and its FINAL was accepted at the first attempt (`report.terminal_delivered attempts 1`), so the runner lane's `recorded` upgrade over revocation facts is landed in D_F for the pre-Ready path. [V from `adj1-run04/runner.log`] The post-Ready path is not exercised here.
5. **Honest limit of the R1 d proof:** the media probe is a manual one-off with Playwright's ffmpeg on the credited run's file (`media-probe.txt`), not a test assertion; the test asserts the EBML magic, whole and ranged serving, and the readings, not a decode.
6. **Temp data:** the test classes leave no process behind (the harness teardown asserts no survivor and a clean exit in `@AfterEach`; [V] it held in all six runs). Their temp directories (`guided-evidence-pending-append-*`, `pre-ready-revocation-joined-*` under the system temp) hold the test CA and a fixture JWT; I removed mine after copying the value-free artifacts above.

## 9. Batons and the commands to rerun

Nothing to land atomically (no production change). For root:

```
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-b-w3-<n> --test-tasks test -- test \
  --tests 'com.citi.put.checks.studio.guided.session.GuidedEvidencePendingAppendJoinedIT' \
  --tests 'com.citi.put.checks.studio.dispatch.PreReadyRevocationJoinedIT' \
  --tests 'com.citi.put.checks.studio.guided.session.GuidedEvidencePendingAppendIT' \
  --tests 'com.citi.put.checks.studio.dispatch.PreReadyRevocationProbeIT' --no-daemon
```

Expect 15 / 15 in about 45 s once the lock is free. Credit it only when the collector's `distDigest` is `4add1307…`.
