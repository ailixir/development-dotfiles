# STUDIO-OBS-015 w3-window01: append-path fixes P1/P2/P3, B2A-02 fixture patch, full lanes

Dex-W3 (@dev). 2026-10-16. Nothing was committed. This window grants no QA credit; Quinn re-gates.
Hashes are in `manifest.json`; the full diff (from verified pre-images) is in `w3.diff`.
[V] = I ran it or read it. [I] = inferred, not executed.

## 1. Production changes (aria-append-ruling01), applied as specified
- **P1** `GuidedTranslationService.finishSuffixMaterialization`: when `contextDeliveryId == null`, a
  same-version `syncContext` push runs before `sessions.materialize`. A definite refusal of that push calls
  `failTranslation(RUNTIME_INCOMPATIBLE)` and rethrows (the same behaviour as `advancePrefix:397-404`).
  `advancePrefix` itself is unchanged; the ruling made that refactor optional.
- **P2** `GuidedRunnerClient`:
  - New constant `CONTEXT_CLOSED_REFUSAL` and new method `closedContextRefusal(...)`.
  - `contextRefusal` now logs the existing value-free WARN for **every** closed code (session id, context
    hash, code).
  - A closed code that is not definite now returns `UNKNOWN_OUTCOME` 409, not retryable, with
    `messageCode` set to `CONTEXT_CLOSED_REFUSAL`.
  - Replies that are not 409, cannot be parsed, or do not conform are unchanged.
- **P2** `GuidedDispatchService.pushContext`: the keyed (append) branch now sends with
  `Instant.parse(context.leaseExpiresAt)` as the caller deadline. The unkeyed branch is unchanged.
- **P2** `GuidedTranslationService.pushMaterializedContext` (new):
  - The send counter is `progress.suffixDelivery {deliveryId, sends}`, reset whenever the delivery id
    changes.
  - Each send increments the counter in one `translationTransaction`.
  - If `sends >= 3`, or the clock is not before the frozen lease, the session ends: `failTranslation`,
    then a terminal `RUNTIME_INCOMPATIBLE`/`CONTEXT_REFUSED`.
  - Any closed refusal of the send records `outcome=REFUSED`, calls `failTranslation` and throws the
    terminal exception.
  - Other failures are rethrown unchanged; the next continuation resends with the same id.
  - The delivery is marked ACK only from the existing validated runner ACK path.
- **P3** `GuidedSessionService.stop`: the condition now also includes `unacknowledgedAppend(session)`
  (`materialization.pendingDeliveryId != null`), so the stop is addressed to the assignment.
- Pre-images: I reconstructed all four production files by reversing my edits. Each reconstruction
  equals its recorded `sha256Before` [V].

## 2. Tests
- `GuidedRunnerContextRefusalTest.anyOtherContextReplyStaysAnUnknownOutcome` is extended as the ruling
  specifies:
  - The BUSY case is closed-not-definite, and produces exactly 1 WARN containing `BUSY`.
  - The extra-field, non-JSON, oversize, empty and 503 cases are not closed refusals.
  - The output still contains no `CANARY`.
- New `translation/GuidedSuffixMaterializationTest`: the 8 cases named in the ruling. It uses Mockito
  mocks and a fixed clock, and reaches the private method through reflection, so production visibility
  is unchanged.
- New `bridge/GuidedDispatchContextDeadlineTest` (2 cases): the keyed path passes the frozen
  `leaseExpiresAt`, and the unkeyed path passes no caller deadline. I searched first: no existing class
  covered this, so I created one.
- `GuidedServiceTransportFaultIT`: the fixture **could** seed a pending delivery. I added 2 cases:
  - `pendingAppendDeliveryTeardownTargetsTheAssignment`:
    - It uses the real V21 append path: continuation `MATERIALIZE` set through `GuidedTranslationStore`,
      then one appended input row, then the frozen context issued via `runnerContext`.
    - Disclosed limitation: the fixture's `Sources` resolve only `ref-PASS`, so the appended input is a
      copy of input 0 with a fresh `inputId`.
    - The test then calls `failTranslation` and checks four things:
      - the target equals the assignment: it has `assignmentId` and no `contextRevision`;
      - 3 immediate sends, then the sweep, gives 4 identical target|reason calls, ending `CONFIRMED`;
      - the delivery is still `PENDING`, with `ack IS NULL`;
      - the session state is `FAILED`.
  - `noPendingDeliveryKeepsIdentityTarget` (control): the stop target is the identity
    (`contextRevision` 1, no `assignmentId`). There are 0 delivery rows, and it ends `CONFIRMED`.
  - Both use a new helper, `translationTeardownService`. It is the H8 teardown service plus
    `installTranslation`, which `failTranslation` requires.
- **P3 mutation check** [V]: I temporarily disabled the P3 condition and the pending-append case
  **failed** (`p3-mutation-check.log`). I then restored the file and verified it equals its after-hash
  `d10ec5cb…`. All four collector runs below ran on the same source digest `af9530fd…`.

## 3. B2A-02 fixture patch (KL-015-Q4)
- `git apply -p0 fix.patch` applied cleanly and produced `2e78558c…`, matching D3's expected result [V].
- I then added one disclosure comment line: `// Disclosed fixture correction KL-015-Q4 (was "Reports");
  not a product fix (AUTHORED-ECHO-01).`
- Final hash: `702d1be9…`. Pre-image `03ec45ef…` re-verified [V].
- **Disclosure:** the title literal changed from "Reports" to "Reports overview". This is a fixture
  correction, not a product fix. The product item is AUTHORED-ECHO-01, which @po places.

## 4. Runs (collector `run-backend-tasked.py`, `--no-daemon`, dist `060d9a53…` stable in every run)
| Label | Selection | Total | Pass | Fail | Skip | Exit | Notes |
|---|---|---|---|---|---|---|---|
| `w3-w01-unit01` | SuffixMaterialization, RunnerContextRefusal, DispatchContextDeadline, DispatchContextRefusal, DispatchStopKey | 17 | 17 | 0 | 0 | 0 | 8 s |
| `w3-w01-tfit-class01` | whole TransportFaultIT + StopKeyTest | 30 | 30 | 0 | 0 | 0 | was 28/28; the +2 are the new P3 cases |
| `w3-w01-full-test01` | `test` lane: full ReplayIT + AuthorityIT | 73 | 73 | 0 | 0 | 0 | 46 ReplayIT + 27 AuthorityIT; 1154 s; no `executionError`; B2A-02 passes |
| `w3-w01-full-incr01` | full `guidedIncrementalTest` | 63 | 56 | 7 | 0 | 1 | 2443 s; collection complete |

Compared with `h8h6-w01-full01`, the same 63 case names ran in `guidedIncrementalTest` [V]:
- 56 entries failed before (including `executionError`); 7 fail now;
- **0 cases newly fail** and 49 newly pass.
- `append-input` **passes**. Per the ruling it had 0 passes in the 11 earlier runs.
- `append11` passes.
- The `test` lane had 2 failures before (`incrementalSecretVersionOneUsage…` and `executionError`) and has
  0 now.
- "refused the context" WARN lines for the B2B-01 sessions: **0**. The 4 WARN lines in the lane belong to
  other sessions: SCHEMA, IDENTITY_MISMATCH, CONTEXT_LOST and BUSY. The last two are newly visible
  because of the P2 logging.

### Remaining guidedIncrementalTest failures (all 7 also failed in h8h6-w01-full01)
1. `incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority` (B2B-01).
   - It fails at `b2bOwnerLoss:8110`: the state after loss is `OBSERVING`, not FAILED/UNKNOWN_OUTCOME.
   - The earlier assertion "v2 ACK pending" (`:8095`) **passed**, so sibling 2 reached `/obs015-ack`
     and **P1 is proven in the joined run** [V].
   - 153 "materialization append refused" SQL errors occur before the append. That is this case's
     unexpired-preparation retry by design; the pre-fix run had 343 [V].
   - **New finding.** At 07:03:53 the runner's lifecycle callback after the test's `LEASE_LOST` stop
     was refused 4 times with `REVISION_CONFLICT`. The path is
     `lifecycle:2385 → materialization.verify:286 → requireAcknowledged:116` [V, stack traces].
     The loss report cannot land while the v2 delivery is `PENDING`.
   - The ruling expected this loss to end the session. That path is outside P1, P2 and P3, so I made
     no change. **Needs an @architect ruling.**
   - [I] I cannot tell from the value-free logs what the released held ACK did afterwards. The
     session stayed OBSERVING for ≥ 30 s, and there was no closed-refusal WARN.
2. `incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned`, `:10603`: expected FAILED, got
   UNKNOWN_OUTCOME.
3. `incremental joined assert-fail`, `assertIncrementalTerminalRefusal:13532`: same symptom (prefix
   refusal).
4. `incremental joined unused-declaration`, `:13239`: expected DISABLED, got PAUSED.
5. `incrementalPlainAndContextCanariesRemainPrivateAcrossMergedPublication`, `:8287`: a released value
   is present in the sink `raw-evidence-outside-authoring`.
6. `incrementalOriginalBaseAndSourceAuthorityRejectEveryStoredSubstitution`, `p3AwaitTeardown:23785`:
   "Actual P3 owner teardown acknowledgement missing" (`b3AliasDeclarations…:5104`).
7. `executionError`: `stopOwnedApplicationJobs:30348`, with a negative remaining time. [I] This looks
   like a class-level cleanup cascade.

I have not diagnosed items 2-7. None of them touches the append-delivery code I changed [I, from stack
frames].

## 5. Not done / not run
- **Bridge-IT ruling (29 MISSING_SOURCE cases):** no follow-up arrived during this window, so nothing
  was applied.
- **Spotless:** not run. A gjf 1.22 check of my hunks shows wrap-only differences in the two new test
  files and one line in `GuidedRunnerClient`. The surrounding files already deviate from gjf. Every
  added line is ≤ 120 columns, the checkstyle LineLength limit. I did not reformat, so the source digest
  stayed fixed across the lanes.
- **Checkstyle and SpotBugs:** not run.
- **CodeRabbit:** not run (WSL-only).
- **Frontend and runner:** not touched. `npm run lint` and `typecheck` do not apply to these files.
- **PID 22246:** never signalled, and absent from the process table.
