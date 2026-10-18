# STUDIO-OBS-009 G9 step C10: mutation reproduction plan (NOT EXECUTED)

- **Authored by:** Quinn (@qa), 2026-10-18, during the G9 hold window. **Nothing here has been run.** The companion `c10.sh` was syntax-checked (`bash -n`, `ast.parse` of its embedded driver) and its mutation strings were checked for uniqueness against the live tree with a read-only computation. No Gradle, vitest, docker or Playwright was started.
- **When it may run:** after `local-gate-20261018/status.txt` contains `G9-DONE`. The script refuses to start before that.
- **Not a gate decision.** Results feed the D2 record (`local-validation-record.skeleton.*`, step C10).
- **Legend:** [V] verified today by reading the named file or running the read-only plan mode. [I] inference, with its basis.

## 1. Selection: one key assertion per credited lane, plus the two security-critical ones

S-W3 is a run-only lane (no source change), so its "key assertion" is a production behaviour that the credited full classes assert. The B-W3 lane credits two joined proofs (R1 d and ADJ-1 c). F credits twelve co-run cases and has two lane-authored negative controls.

| Mutation | Lane credited | Key assertion that must turn red | Production change (scratch only) | Tier |
|---|---|---|---|---|
| **S3** | S-W3 (AC-6 b/c, R7 non-vacuity) | `ObservedScheduleAuthorityIT.anObservedScheduleIsAcceptedUnderBackgroundAuthorityForTheSchedulePrincipal`; `StudioScheduleApiIT.editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision` (the acceptance-first ordering case that makes R7 non-vacuous) | `StudioAcceptanceService`: `observedGrant = observed.prepareScheduled(...)` replaced by `observedGrant = null` | core |
| **S4** | S-W3 (AC-6 d tripwire) | `GuidedPublicationReplayIT.editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness` (expects `BACKGROUND_AUTHORIZATION_DENIED`, `:18525`); `ObservedScheduleAuthorityIT.theRefusalNoLongerExistsAndAWithdrawnGrantStillFailsClosed` | `ConfiguredBackgroundAuthorization.require`: the grant condition replaced by `if (false)` | core |
| **B1** | B-W3 / R1 d | `GuidedEvidencePendingAppendJoinedIT` (both cases) and `GuidedEvidencePendingAppendIT.recordingAtThePreviousRevisionIsAcceptedWhileAnAppendIsPending` | `GuidedSessionEvidenceService`: the shared derivation replaced by `context.contextRevision() == request...` (the pre-R1 term) | core |
| **B2** | B-W3 / ADJ-1 c | `PreReadyRevocationJoinedIT.aPreReadyRevocationOfARealHeldRunIsSettledAsAuthorizationRevoked`; `PreReadyRevocationProbeIT.aPreReadyRevocationIsSettledAsAuthorizationRevoked` | `StudioDispatchLedgerStatements.applyFinal`: revoked disjunct `... AND false` | core |
| **B3** | ADJ-1 narrowness (my co-sign depends on it) | `PreReadyRevocationProbeIT.aRevokedRowsOtherPreReadyFinalIsStillRefusedAndTheReaperSettlesIt` red, and **only** that one (`exact`) | same statement: outcome binding made `(CAST(? AS boolean) OR true)` | core |
| **F1** | F (AC-11 ACK-loss leg) | `ObservedCoRunIT.aLostAcknowledgmentIsNeverAResend` | `StudioDispatcher`: a second `runnerClient.send(job)` on an `AMBIGUOUS` answer (identical to F's lane M1) | core |
| S1 | S-W3 (G-3 at the dispatch recheck) | `ObservedScheduleAuthorityIT.g3HoldsAgainAtDispatchRecheck...` | `StudioScheduledDispatchAuthorization`: the secret refusal replaced by `if (false && ...)` | extended |
| LR | BL / LR c (T0 C10 minimum) | `GuidedLifecycleReasonIT.anExpiredReportAcceptedBeforeTheBackendExpiryEndsExpired` | `GuidedSessionService`: the reason mapping collapsed to `"FAILED"` | extended |
| F2 | F (AC-11 public-cancel leg) | `ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot` | `GuidedSessionService.installStopSender`: the stop swallowed (identical to F's lane M2) | extended |

Why these and not others:

- **B1, B2, B3, F1, F2 reproduce lane-authored mutations** (B-W3 R1-JM and A-JM; B-W2 A-M; F M1 and M2) on the final G9 tree. The lanes ran them on earlier bytes and under their own harness, so the C10 purpose is independent reproduction at the frozen digest [V receipts `b/w3/receipt.md` §4, `b/receipt.md` §5, `f/receipt.md` §7].
- **S3 and S4 are new.** S's own mutations (M1-M4) are in `s/mutations.json`. S3 is S's M3-class change (a refused grant) done at the acceptance call, chosen because the story demands that `editedWriterRace...` stop being vacuous (AC-6 c): a mutation that stops scheduled acceptance must turn the acceptance-first ordering case red. S's M3 turned `editedWriterQueuedBehindAnAcceptance...` red among 17 [V `s/mutations.json`], so S3 is expected to do the same, but that is [I] until run. S4 hits the interim tripwire at `GuidedPublicationReplayIT:18525`, which AC-6 d names, with a single-method run so the 61-minute class is not repeated.
- **Not selected, with reasons:**
  - S's M4 ("lose the `ui_tests` row locks") is **not caught** by any test (0 failures; `s/mutations.json`, `s/receipt.md` lines 76-78). I do not turn that into a C10 item. I record it for the D2 record as a disclosed limit: the ordering test proves "an edit serializes behind an in-flight acceptance", not "through the `ui_tests` row lock specifically". Whether AC-6 c needs more is a question for @po and @architect, not for the mutation batch.
  - D5 (R2 M1-M5): the assertions live in the runner fixtures tier with a real frozen Chromium and in runner unit tests. Reproducing them needs vitest and a real browser in the scratch copy. This script is Gradle-only. R2's lane logs (`r2/mutations/`) stay lane-reported, not QA-reproduced, unless root asks for a vitest extension.
  - The F-R2-1 oracle mutations (M5, MF3-MF5): same reason; see `f-r2-1-oracle-cosign.md`.

## 2. How the scratch copy is built (and why not git)

`capture-manifest.py` needs `git ls-files`. The worktree's `.git` is a file and the scratch copy has no repository, so C10 does not use the tool. It re-implements the check:

1. **Copy.** `rsync -a` from the live tree into `.../scratchpad/c10repo`, excluding `.git`, `.claude`, `.aiox`, `.cursor`, every `node_modules`, `frontend`, `backend/build`, `backend/.gradle`, `buildSrc/build`, `studio-runner/coverage`, and the large evidence directories (`STUDIO-OBS-007`, `-008`, `-005`, `STUDIO-OBSERVED-NEXT`, `STUDIO-OBS-015/execution-20261015`, and everything under `STUDIO-OBS-009/execution-20261018/` except `de/`, which a test reads). Backend tests open `../docs/specs/...` (59 references) and two files under `docs/qa/evidence/STUDIO-OBS-015/final-design/` [V grep of `backend/src/test`], so `docs/` is copied except the excluded evidence directories. `de/` is kept only because one test comment names a file there; no test opens it. `studio-runner/dist` is copied (it is the D_F build) and `rsync -a` keeps its mtime, so `verifyRunnerDist` (dist not older than `src`) behaves as in the live tree.
2. **Hardlink `studio-runner/node_modules`.** `rsync --link-dest` against the live directory. Both paths are on `/System/Volumes/Data` [V `df`], so they are real hardlinks and cost no space. The copy has no `.git` and no write path into the live tree.
3. **Frozen-digest check.** Before anything is mutated, every file under `backend/`, `studio-runner/`, `tools/`, `docs/specs/`, `.github/` named in `local-gate-20261018/capture-after.json` (else `capture-before.json`) must have the recorded sha256 in the scratch copy, and so must every `studio-runner/dist` file. Any mismatch aborts. This is the "recheck its digest equals the frozen one" requirement of the T0 C10 spec, minus the helm scope, which Gradle tests do not read.
4. **Baseline.** The union of all selected test selections runs once, **unmutated**, in the scratch copy. It must be green, or the batch stops before any mutation (the scratch copy would not be faithful).
5. **Each mutation.** Replace one exact string (asserted to occur exactly once), run only that mutation's tests, require a non-zero Gradle exit **and** each named test present among the failed testcases in the XML (a compile error produces no XML, so it cannot pass as "red"), then restore the file's original bytes and assert the sha256 equals the live file's. `exact` mutations (B3) also fail if any other test is red.
6. **Final.** The union runs again, unmutated, and must be green (the "revert turns it green" requirement).

## 3. Preconditions and cost

- `G9-DONE` in `status.txt`; no Gradle process running; docker reachable (Testcontainers); `JAVA_HOME` JDK 21; Node 24.20.0 on `PATH` (the script sets both).
- **The script takes the shared Gradle lock (`with-gradle-lock.py`) once and holds it for the whole batch.** I used the live lock file on purpose, because `with-gradle-lock.py` derives the lock path from its own location and a copy in the scratch tree would lock nothing. Other lanes' Gradle waits until C10 ends.
- Estimated time [I, from lane logs]: baseline about 8 to 10 minutes (cold compile plus about 90 tests; the joined ITs spawn the runner), then per mutation about 2 to 5 minutes, B1 about 4 minutes because its cases wait 90 s each when red. Core tier about 50 to 70 minutes in total, extended about 10 more. Memory is tight during Testcontainers runs, so the script runs strictly one Gradle at a time.
- It sends no signal to any process it did not start. The only kill is a `SIGTERM` to the process group of a Gradle run it started, and only on its own 45-minute timeout.
- Outputs: `.../qa/c10-run/` holds `c10-results.json`, `c10-results.txt`, one log and XML directory per run, and the preflight listings (`lsof`, Gradle processes, `checks-guided`, postgres).

## 4. How to read the result

| Outcome | Meaning | Action |
|---|---|---|
| Baseline not green | The scratch copy is not faithful (or the live tree is flaky). No mutation applied. | Not a C10 failure. Diagnose the baseline; do not credit or discredit any mutation. |
| `RED_AS_EXPECTED` for every mutation, `restoredShaMatchesLive` true, final green | C10 met for the selected tier. | Record the table in the D2 record, step C10. |
| `NOT_RED_AS_EXPECTED` (a named test stayed green) | The assertion does not catch that mutation: a real finding about test strength. | Report to root with the mutation id; the D2 trigger for that row becomes NOT_MET until @dev strengthens the test or @architect rules the mutation out of scope. |
| Collateral red beyond the named tests | Informational, except for `exact` (B3), where it fails the narrowness pin. | Record by name. |
| Restore sha mismatch | Scratch file differs from live after revert. | Treat the whole batch as invalid; delete the scratch copy and rerun. |

## 5. Known risks I could not remove without running

- S3 expecting `StudioScheduleApiIT.editedWriterQueuedBehindAnAcceptance...` to be red is [I]: it is the S M3 evidence by analogy. If it stays green under S3, that is exactly the R7 vacuity concern and must be reported, not argued away.
- S4's single `GuidedPublicationReplayIT` method may need setup that other methods share (the class is large and runner-spawning). If it fails in the **baseline**, the plan degrades to ObservedScheduleAuthorityIT only for S4 and the ReplayIT tripwire is reported as not reproduced.
- `ObservedCoRunIT` binds a fixed TLS port. If a listener holds it, the baseline fails and the preflight `lsof` listing names the holder.
- The B1 joined cases take about 190 s when red. That is expected, not a hang.
- Hardlinked `node_modules` is shared storage. Nothing in the tests writes there, but if a tool did, it would write the live copy. [I] I saw nothing in the runner `dist` start path that writes under `node_modules`.

## 6. Commands

```
# read-only: confirms every mutation string occurs exactly once in the live tree
docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/pre-g9-review/c10.sh plan

# after G9-DONE: core tier (6 mutations) or everything (9)
docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/pre-g9-review/c10.sh run
C10_TIER=all docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/pre-g9-review/c10.sh run
```

Signed: Quinn (@qa), 2026-10-18.
