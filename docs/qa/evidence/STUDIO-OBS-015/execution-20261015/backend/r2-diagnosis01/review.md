# R2 incremental-lane diagnosis 01 — `backend-r2-join-b1a-b3a-attempt01` `guidedIncrementalTest`

Author: Dex-FIX (@dev, sole backend source writer and sole Gradle user in this window). 2026-10-16 UTC.
Releases no QA credit and changes no lifecycle. The production change in section 3.1 needs independent review.

Inputs: R2 `guidedIncrementalTest` XML (44 total / 16 pass / 28 fail), its system-out (value-free JSON
log events), and the retained R2 TEMP `$TMPDIR/obs007-joined-3101470902401849059`
(`failed-test-state-*-enriched.json`, `finalize-exception-*.json`). Source at R2: ReplayIT `4242ac27…`,
`GuidedPlanBuilder` `23f102d7…`, `GuidedPublicationEvidenceRepository` `8aa40c60…`.

## 1. Grouping: R2 28 failures → H1–H7; H8–H10 surfaced once those were fixed

| # | Labels | Root cause | Class | Status |
|---|---|---|---|---|
| H1 | confirm-long-wait … equal4 (20 labels after policy-prefix) | Per-CSI **daily model-token budget** (OBS-014 AC-8, `GuidedCsiBudget`, 640000 output tokens/UTC day) exhausted on CSI-123. Every incremental case learns twice on CSI-123; the P3/PFXSYNC/B1A subjects already isolate their CSI for exactly this reason. | test harness (missing CSI isolation) | FIXED, test-side |
| H2 | confirm-prefix (and every other `confirm-*` once H1 is gone; R1 g-config showed confirm-long-wait/cancel/expire with it) | `confirmIncrementalPrefix` reads `plans.state(id)` outside a transaction; `GuidedTranslationStore.transaction()` refuses with `RUNTIME_INCOMPATIBLE`. | test defect | FIXED, test-side |
| H3 | drift2, admitted-drift2 (and every drift label that reaches finalize) | `GuidedPublicationEvidenceRepository.read` filters the raw `observations` to those used by **successful** actions. A drifted prefix request's observation has no successful action, so `GuidedPlanBuilder.derive:489` (and `GuidedBasisValidator.validatePrefix`) cannot find it → 422 `EVIDENCE_MISMATCH`. | **production defect** (015) | FIXED, production |
| H4 | tail7 | Test asserted that the relearned last surviving step's snapshot hash **differs** from the base. By T0 the snapshot is `H(stepId, inputChain, learnedStepHash)`; tail deletion leaves all three unchanged, so equality is the only correct outcome. | test expectation defect | FIXED, re-pinned to exact equality |
| H5 | empty | Test pinned `422 INVALID_CONTRACT`. The existing (HEAD) refusal for an empty draft is `GuidedSourceClassifier.classify:62` → `409 RUNTIME_INCOMPATIBLE`, before any write. T0 says "existing rule"; acceptance-delta says "start409/422 existing". | test expectation defect (ruling-dependent) | FIXED, re-pinned; **needs Quinn/Aria acknowledgement** |
| H6 | assert-fail | The *base* learning fails at step 3 (`containsText` on "Order reference" with the read binding). The runner reads visible text as raw text nodes (`businessText`, keeps the fixture's leading/trailing spaces `"  fresh-…-é😀  "`), but `containsText` compares against `innerText` (rendered, whitespace-collapsed) → `ASSERTION_FAILED`. | **production finding, runner** (outside backend scope) | OPEN |
| H7 | policy-prefix | Body passed. `@AfterEach` AC-4 guard tally fails: the variant deliberately sets the governed application policy to DENY, producing one `SIDE_EFFECT_DENIED` refusal, but ReplayIT plants none (po-qa014-rulings a1). | tally/ruling gap | OPEN, needs PO/QA ruling |
| H8 (found after H1/H2) | confirm-source-change … equal4 (17 labels) | The confirm-expire session reaches its natural 600 s expiry. The backend's async stop to the runner then times out after the 15 s transport deadline (tap01: `UNKNOWN_OUTCOME` at `GuidedRunnerClient.send:267`, 15.0 s). `GuidedSessionService.stop` confirms teardown only on a successful stop acknowledgement and never retries, so the session stays `EXPIRED / teardownStatus PENDING`, and the ReplayIT generation guard refuses every later worker restart. | **production finding** (expiry teardown) | OPEN, needs Aria ruling |
| H9 (default lane, found after fix.patch) | `historicalIncompleteBase…`, `actualHttpExplicitFullLearn…` | The ReplayIT generation guard requires every admitted execution to have a settled video. The P6 owner-crash case ends `ERROR/STALE` through `RunningReaper.closeByReaper`, which never settles evidence, so `video_status` stays null forever. | test harness guard | FIXED test-side; **needs Quinn acknowledgement** |
| H10 (default lane, found after H9) | same two legacy V20 tests | `LegacyV20ConfirmedBaseFixture.assertPreservedAtHead` writes the jsonb `?` operator in a bound `JdbcTemplate` statement; pgjdbc reads it as a placeholder. | test fixture defect | FIXED (`??`), verified focused |
| — | `executionError` | Zonky `EmbeddedDatabaseTestExecutionListener.afterTestClass` reloads the Spring context after the class's own teardown marked it dirty and stopped the DB container ("Mapped port can only be obtained after the container is started"). Present in every ReplayIT run since incremental2048 attempt01, including all-green tasks. | harness lifecycle (signature varies, see 4.3) | OPEN, not in this window's scope |

## 2. Evidence

### H1 budget cascade
- `failed-test-state-…-confirm-cancel-58-enriched.json` and all 18 later cases: `state FAILED`, `errorCode BUDGET_EXCEEDED`, 0 model proposals, 0 actions, ~0.9 s each.
- `confirm-long-wait-57`: `BUDGET_EXCEEDED` mid-learning after 8192 output tokens.
- `finalize-exception-17..36`: `BUDGET_EXCEEDED` at `GuidedTranslationService.call:1348` (reservation refused).
- Per-case use: each base learning ≈ 26624 output tokens, each mixed learning ≈ 22528. 640000/≈49000 ≈ 13 variants (plus edit4 and start-ceiling) — exhausted around label 14, which matches.
- `primaryCsi` javadoc (ReplayIT:1216) already records that ~40 learnings on one CSI exceed the ruled daily budget and that this "is product behaviour, not something to relax here".

### H2 confirm-prefix
- Failure stack: `GuidedTranslationStore.transaction:30` ← `state:650` ← `ReplayIT.confirmIncrementalPrefix:5460`.

### H3 drift finalize
- R2 log events at 01:00:36 and 01:00:53 (local): `EVIDENCE_MISMATCH` at `GuidedPlanBuilder.derive:489` ← `basisMatching:86` ← `GuidedPlanPublisher.prepare:447` ← `finalizeForUser:100`.
- Line 489 is the "prefix request evidence matches neither a basis observation nor the initial evidence" check.
- Why it is a defect, by reading:
  - `GuidedIncrementalStore.evidence` matched the same request against the **full** `studio_guided_publication_observations` table and did not throw, so the observation exists.
  - `GuidedPublicationEvidenceRepository.read` then replaces `observations` with only the hashes needed by successful action associations (or question proofs).
  - The drift request (step 2 fill, DOM changed textarea→input) has no successful action, so its observation is dropped.
  - Both consumers require it: `derive` 471-490 adds prefix-request observations to the basis, and `GuidedBasisValidator.validatePrefix` marks them used, with the final `usedObservations.equals(observations.keySet())`.
- This path was unreachable before D1 (drift never reached finalize).

### H4 tail7
- Same hash on both sides in two independent runs (R2 `3031e6c2…`; R1 g-config `370bcbe9…`).
- `IncrementalAuthoringIdentity.snapshots`: `{domain, version, stepId, inputChain, learnedStepHash}`.
- tail1 passes the not-equal assertion only because, with no consumer left, step 1 is learned without its read, so its learned step differs.

### H5 empty
- R2 log event 01:00:20: `RUNTIME_INCOMPATIBLE` at `GuidedSourceClassifier.classify:62` ← `GuidedProductionSessionAccess.resolve:83` ← `GuidedSessionService.start:588`, inside the start transaction (rolled back).
- `git show HEAD:` the same `steps.isEmpty() → RUNTIME_INCOMPATIBLE 409` rule exists at HEAD.

### H6 assert-fail
- `failed-test-state-…-assert-fail-54-enriched.json`: base session `FAILED`, the step-3 `assert` action `FAILED/ASSERTION_FAILED` at generation 5, after a successful read and fill; `incrementalDomVariant` is still null during base learning (it is set only at ReplayIT:5080).
- Runner `observationCollector.ts`: read → `businessText` concatenates raw `nodeValue`s; `containsText` → `(element as HTMLElement).innerText.includes(value())`.
- The fixture value is padded by design (`"  fresh-" + run + "-" + uuid + "-é😀  "`, ReplayIT `/flow`) and is frozen.
- **Verified by a standalone probe** (scratch `innertext-probe.mjs`, studio-runner's Playwright Chromium, same markup, placeholder UUID; no repo or dist byte touched):
  - `innerText` = `"fresh-1-…-é😀 "`: the leading spaces are dropped and the trailing spaces collapse to one.
  - The raw node text = `"  fresh-1-…-é😀  "`.
  - `includes` is `false`.
- No lawful backend/test fix: the runner is outside this lane, and the frozen fixture value must not change.
- Options for Aria / runner owner: (a) `containsText` compares on the same text extraction as `read` (`businessText`); (b) both normalize whitespace identically; (c) contract ruling that bindings are trimmed at capture.

### H7 policy-prefix
- Body assertions passed (the XML failure is thrown from `cancelFailedTestOwnedSessions` → `GuardDecisionTally.record:119`).
- Guard tally: `{"SIDE_EFFECT_DENIED":1}` with planted set `[]`.
- Proposed fix (not applied): plant exactly this invocation (display name `incremental joined policy-prefix`) and assert its tally equals `{SIDE_EFFECT_DENIED:1}`. This changes an AC-4 ruling-backed assertion, so it needs Pax/Quinn.

## 3. Changes

### 3.1 Production (H3, proven defect)
`backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationEvidenceRepository.java`
`8aa40c60582007a59ba406d47832bf30d06627cf227fc0c3ce942ab7d58b07df` → `ffb8ffd4fd87bf903337fdd32f92a96ac4a534003cbc828b61a5fbc10804e60d`
- In `read`, before the used-observation filter: for each `incrementalEvidence.prefixRequests` entry, add the observation whose `observedDocument` execution evidence (`kind, sessionId, contextId, documentId, generation, origin, observationHash`) hashes to the request's `evidenceHash`.
  - This is the same correlation used by `GuidedIncrementalStore.evidence`, `GuidedPlanBuilder.derive` and `GuidedBasisValidator.validatePrefix`.
- Non-drift sessions are unchanged: there, every prefix request's observation is already used by its successful prefix action, and the set semantics make the addition a no-op.
- Formatting: the file was already 101 gjf diff lines; the hunk adds none (gjf 1.22 CLI, before/after diff count equal).

### 3.2 Tests
**ReplayIT chain.**
- `4242ac27…`
- → `25f12ca218ccb50b2a9f282f38192b91d1dc9b61f3abf158b913ac3e8055c33e`: the coordinator's default-lane `r2-default-diagnosis01/fix.patch` (sha256 `42d7e8ba…`), applied unchanged with `git apply -p0`.
- → `7ff7af1d…`: H1, H2, H4, H5.
- → `bb6b8b5c…`: H8 diagnostic.
- → final **`9d13eeb762f56dbe095b5540ff97d6e63169ec95c7a7dfa084036e7a1755c656`**: diagnostic columns and H9.
- Full diff against 4242ac27 (including fix.patch): `replayit-4242ac27-to-final.diff`. It is hand-formatted; no spotless hook was run on ReplayIT.

**This window's ReplayIT edits:**
1. **H1.** `incrementalJoined` now runs each case on a fresh `CSI-INC-<n>`, inserted like PFXSYNC/B1A, by wrapping the unchanged body (renamed `incrementalJoinedCase`).
   - On success it restores CSI-123 itself.
   - On failure it leaves the CSI in place and sets `incrementalCsiRestorePending`. `@AfterEach` cancels/tears down that case's sessions as their actual CSI owner, then restores CSI-123 in its `finally`.
   - The BeforeEach "prior case left its CSI unrestored" guard is unchanged.
2. **H2.** `confirmIncrementalPrefix` reads `expectedPlanRevision` via `sessions.transaction(() -> plans.state(id)…)`, the existing pattern.
3. **H4.** For `tail7` at `index == boundary`, the snapshot hash assertion is `isEqualTo(base)`. All other variants keep `isNotEqualTo`.
4. **H5.** `empty` expects `409` + `code RUNTIME_INCOMPATIBLE`. Its zero-write, zero-model, zero-navigation and zero-effect assertions are unchanged.
5. **H8 diagnostic (value-free, no assertion change).** When the generation guard refuses, `writeOpenGenerationDiagnostic` writes `TEMP/open-generation-<n>.json`. It records only:
   - per non-baseline session: ordinal, state, errorCode, teardownStatus, assigned, recording states;
   - per execution: status, errorCode, videoStatus, ledgerState, attempt/admission presence;
   - live descendant counts.
6. **H9.** In `verifyPreviousWorkerGenerationClosed`, an execution ending `ERROR` + `error_code STALE` + `video_status` null counts as closed. That is the `RunningReaper.closeByReaper` terminal: `findEvidenceUnsettled` selects only `FINALIZING` ledger rows, so a reaped row never gets a video status. Ledger `DONE` is still required, and the live-descendant check is unchanged.
   - Data: `tap01` `open-generation-1.json` shows the only unclosed item in the 50-session / 37-execution default generation 1 was the P6 crash execution (`ERROR/STALE`, attempt+admission present, video null).

**`backend/src/test/java/com/citi/put/checks/studio/support/LegacyV20ConfirmedBaseFixture.java` (H10)** `417e605d…` → `ae407fefa0a428d7f73ce2791ab04ad277f79706255e75a3f68a6c2e5b77aa92`
- `assertPreservedAtHead` used the jsonb `?` operator inside a `JdbcTemplate` statement with a bind parameter. pgjdbc counted it as a second placeholder ("No value specified for parameter 2").
- It is now `??`, pgjdbc's escape for a literal `?`. Same SQL semantics.
- The file was already not gjf-clean (1499 gjf diff lines before and after); the edit adds none.

No budget, clock, label (35), identity or fixture value changed. No `build.gradle.kts` change.
**Needs Quinn acknowledgement:** H4, H5 and H9 change expectations or guard predicates. Each is narrowed to one variant or one terminal; the reasons are above.

**Disclosure.** During `backend-r2fix-join-attempt03`, I edited the H10 fixture by mistake while the incremental lane was still running (about 1 minute, after `compileTestJava` had finished). I restored it byte-exact (`417e605d…`) before the run ended, so the collector reports `sourceStable:true` truthfully: the run compiled and ran the pre-H10 bytes. H10 was then re-applied and verified only in `backend-r2fix-legacyv20-attempt01`.

## 4. Runs (collector `run-backend-tasked.py`, `--no-daemon`, Gradle lock held, fresh labels)
| Label | Scope / source | Counts (total / pass / fail) | Notes |
|---|---|---|---|
| (compile only) | `compileJava compileTestJava` | — | exit 0 |
| `backend-r2fix-inc-attempt01` | `guidedIncrementalTest`; ReplayIT `7ff7af1d…` | **44 / 24 / 20** (R2 44 / 16 / 28) | 1487 s; source/dist stable; dist `972ccf7b…` |
| `backend-r2fix-join-attempt02` | `test --tests ReplayIT` + `guidedIncrementalTest`; ReplayIT `bb6b8b5c…` | `test` 44 / 41 / 3; `guidedIncrementalTest` 44 / 24 / 20 | 2557 s; source/dist stable |
| `tap01` (scratch, **no credit**) | Init script swaps in a scratch ReplayIT copy: variants `confirm-expire, insert4` only, plus a `stopSender` tap. `test --tests ReplayIT` + `guidedIncrementalTest --tests <incremental method>` | n/a | Build test outputs backed up and restored. No repo or dist byte changed. Scripts in session scratchpad `dexfix015-r2/tap/` |
| **`backend-r2fix-join-attempt03`** (window verification) | `test --tests AuthorityIT --tests ReplayIT` + `guidedIncrementalTest`; ReplayIT `9d13eeb7…`, repository `ffb8ffd4…`, pre-H10 fixture | **`test` 71 / 68 / 3** (AuthorityIT **27 / 27**, ReplayIT **44 / 41 / 3**); **`guidedIncrementalTest` 44 / 24 / 20**; total 115 / 92 / 23 | 2599 s; source/dist stable; `taskCollectionComplete:false` only for `DUPLICATE_ORIGINAL_CASE_ACROSS_TASKS` (`executionError` in both tasks) |
| `backend-r2fix-legacyv20-attempt01` | `test --tests` Order(1) + the two legacy V20 tests; fixture `ae407fef…` (H10) | 4 / 3 / 1 | both legacy tests **PASS**. `executionError` is the singleton-selection AfterAll audit ("the OBS-007 case registered its canaries"), as in R1 |

### 4.1 Label movement (R2 → attempt03)
- **`guidedIncrementalTest` 16 → 24 pass.** Newly passing:
  - tail7 (H4), confirm-prefix (H2), empty (H5);
  - drift2 and admitted-drift2 (H3: finalize 200, merged artifact checks and ordinary replay PASSED);
  - confirm-long-wait, confirm-cancel, confirm-expire (H1+H2).
- Still failing:
  - assert-fail (H6), policy-prefix (H7);
  - 17 labels confirm-source-change … equal4 (H8 cascade, 20 s each at `verifyPreviousWorkerGenerationClosed`);
  - `executionError`.
- **The 17 H8 labels have never executed their bodies in this window.** Their own outcome (drift-auth R3 pins, literal/consumer cases, confirm-race, before4at2, equal4) is unknown.
- **Default `test` lane (ReplayIT) 29 → 41 pass**, attributable to:
  - fix.patch: Orders 20, 21, 31 and the 11 Order-31 cascade cases;
  - H9: the two legacy V20 tests now pass the guard. They then failed on H10 in attempt03 and pass with H10 in the focused run.
- Remaining default failure: `executionError`.

### 4.2 H8 evidence chain
- attempt01: 17 guard refusals immediately after confirm-expire (609 s; the question's `expiresAt` equals the session `expiresAt`).
- attempt02 `open-generation-31.json`: the only open item is the confirm-expire mixed session (`EXPIRED`, `teardownStatus PENDING`, assigned, recording `AVAILABLE`, 0 live descendants).
- tap01 `stop-tap-2.json`:
  - The stop started at 06:53:00.009Z (the session's expiry instant), reason `EXPIRED`, kind `context`.
  - It ended `GuidedSessionException UNKNOWN_OUTCOME` at `GuidedRunnerClient.send:267` ← `GuidedDispatchService.stop:318` ← `GuidedSessionService` afterCompletion.
  - The file was written 15 s later, which equals the 15 s transport deadline.
  - The earlier `UNKNOWN_OUTCOME` stop (`stop-tap-1`) returned OK.
- Runner reading (`ownership.ts` `stopEntry`, `runtime.ts` `closeResources`):
  - The runner's own expiry timer stops the entry at `expiresAt`. A backend stop then awaits the same `closing` promise, which includes `browser.close()` and a `lifecycle` callback to the backend (10 s callback timeout).
  - **Inferred, not measured:** those together exceed 15 s here.
- `GuidedSessionService.stop` sets `teardownStatus CONFIRMED` only on a successful acknowledgement and never retries. Nothing else confirms an expired session's teardown.
- **Classification:** production finding (expiry teardown never confirmable once the stop acknowledgement times out). No lawful test-side fix: the guard is a safety gate, and the 35 labels and their order are frozen.
- **Options for Aria:**
  - (a) Bounded retry of the stop for EXPIRED (or CONFIRMED on a later successful idempotent stop).
  - (b) The runner answers a stop for an already-stopping entry without awaiting `closeResources`' callback.
  - (c) Accept the runner `lifecycle` EXPIRED callback as the teardown acknowledgement.

### 4.3 `executionError` (both lanes; not fixed)
- Its signature varies by run:
  - Zonky `afterTestClass` context reload after DB stop (R2 incremental, attempt03 incremental);
  - owned-observer `NoSuchElementException` at `ownedCommandHash:458` ← `verifyOwnedRoot:539` (attempt02 incremental, attempt03 default), with suppressed "Endpoints/PostgreSQL retained because actual owned dependencies remain unconfirmed".
- The second is the same zombie/no-command-line race fix.patch closed in the kill helper (B), reached through the observer's `verifyOwnedRoot`. The observer only records the failure while `process.isAlive() && !stopping`.
- Out of this window's scope; handed back.
