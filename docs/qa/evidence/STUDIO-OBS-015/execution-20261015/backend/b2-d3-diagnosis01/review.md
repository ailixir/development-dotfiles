# b2-d3-diagnosis01: B2A-02 and B2B-01 root causes from run h8h6-w01-full01

Dex-D3 (@dev, diagnosis). 2026-10-16. I was read-only on backend/, frontend/, studio-runner/, tools/, docs/specs/
and .github/. I did not run Gradle or JUnit, and I made no commit. This grants no QA credit and changes no
lifecycle. Hashes are in `manifest.json`.

Labels: [V] means I read the code or artifact, or ran the check myself. [I] means inferred.

## 0. Base and inputs
- **Patch base:** live ReplayIT `03ec45ef…` (= `h8h6-window01/sha-final.txt`, which is the file the run used). I
  re-checked the hash after writing. The patch touches nothing else.
- **Run artifacts:** `execution/h8h6-w01-full01-task-outputs/{test,guidedIncrementalTest}/xml`.
- **Retained TEMP dirs (host only, not copied):**
  - default lane `…/T/obs007-joined-8755010582785012494`: failed-state, cleanup and runner native events;
  - low lane `…/T/obs007-joined-4661598856371475638`: failed-state, 55 cleanup records, `finalize-exception-*.json`
    stack dumps, and archived worker generations.
- **Production and runner code read:** `GuidedTranslationStore.acquire`, `GuidedTranslationService` (acquisition,
  `learnSuffix`, `finishSuffixMaterialization`, `advancePrefix`), `GuidedBindingStore.attachConsumer`,
  `GuidedMaterializationService`, `GuidedSessionService.stop/teardownAttempt`, `GuidedRunnerClient`, runner
  `guided/{runtime,ownership,transport,contracts}.ts` and `run/observationCollector.ts`.
- **Dist:** `studio-runner/dist/guided/runtime.js` (built 04:24, before the run) contains the appended-input
  `withhold` [V].

## 1. B2A-02 `incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck`: fixture/design flaw, not a production defect

### What the session polled for and what the page showed
- **Mixed session** (ordinal 55): `FAILED BUDGET_EXCEEDED`, `extraPolls 32`, `stepIndex 2` (THREE).
  - Actions: navigate, both TWO fills, and THREE/0 `click Sign in`, which SUCCEEDED (gen 4).
  - Model: SOURCE_PLAN plus one NEXT_ACTION. The 32 polls ran from 05:30:15.2 to 05:30:27.7 [V].
- **The next obligation is THREE/1 `click "Reports"`** (`b2SourcePlan`:8932).
  - `acquisitionAvailable` needs an observed node whose name or role hint equals `"Reports"`
    (`GuidedTranslationService`:2292-2312). It never found one, so passive polling ran to the cap [V].
- **The page was `/p3/home`, so the sign-in was accepted.**
  - The last observation had `passwordControls 0`, which rules out the login document. In the earlier run it was
    `passwordControls 1`.
  - So the password-timing fix worked. It removed the first cause and exposed this second one. The earlier
    diagnosis was incomplete, not wrong.

### Root cause
- **The runner hides every node whose text contains an authored nonsecret input value.**
  - At the v2 append, `runtime.update` calls
    `observations.withhold(new non-secret authored input values)` (runtime.ts:201). At start it does the same for
    all inputs (:163).
  - The collector stores these as strict private values. It then filters out any node whose name or hints contain
    one, and counts it as a withheld region (observationCollector.ts:498-505) [V].
- **The suffix appended the authored title literal `"Reports"`.** This comes from "Check page title is
  Reports.", a `sourceSpan`/`nonsecretText` reference (`b2SourcePlan`:8936-8955).
  - From then on, the Home page's `Reports` link was scrubbed from every observation. So was the `Reports`
    heading that THREE/2 asserts.
- **The counts match exactly [V/I].**
  - Relevant tags are main, h1 and a. A `main` with no name is withheld.
  - Home page with the scrub: `main` withheld + `a Reports` scrubbed = **2**. The mixed session recorded
    `withheldRegions 2` and `passwordControls 0`.
  - The base session's last page (Reports, no `"Reports"` input) gives `main` = **1**. It recorded 1.
- **This behavior is specified, not a bug.**
  - account-provider-readiness-design.md:50: the runtime "withholds input values".
  - `incrementalRuntime.test.ts:88` pins "appends only after withhold".
  - The collision comes from the test design (b2ab §4.2 literal).

### Classification and fix
- **Classification:** test fixture/design flaw. It is not a production defect against any spec.
- **Product note P-A (raise with Aria; not blocking; no change here):**
  - An authored literal equal to a target's accessible name makes that target invisible to guided inference.
  - So "Click Reports … Check page title is Reports." can never be learned, even by a full learn.
  - This is a usability design question about echo-scrubbing authored nonsecret literals that the model already
    receives.
- **Fix (`fix.patch`, ReplayIT only):**
  - The title literal becomes `B2A_TITLE = "Reports overview"`. Title asserts use exact equality
    (observationCollector.ts:627), and no target name contains this literal.
  - It is used in `b2TitleHead`, the `b2SourcePlan` sentence and its span length, and both `b2Edit` texts (B2A-02
    and B2B-02 share the knob).
  - Every oracle is unchanged: A45-1..3, the sign-in pin, `getLast()==rotated`, and the v2 append. The appended
    input is still a new nonsecret literal, so contextRevision 2 is still real.
- **Disclosure:** like drift-first, this is a fixture-byte correction to the b2ab §4.2 literal, keyed to these 2
  methods only.

## 2. B2B-01 `incrementalAppendRetryAndExpiredPreparationKeepExactHistoricalAuthority`: production defect

### Assertion failure: `b2bOwnerLoss`:8088 "v2 ACK pending"
- **Sibling 1** (the A46 parent) **passed** [V].
- **Sibling 2** (mixed `b3f70b8a`): the prefix of 4 actions finished at 05:36:12.19.
  - Then SOURCE_PLAN ran, `learnSuffix` set MATERIALIZE, and `finishSuffixMaterialization` ran: `materialize`
    (DB append) followed by `pushContext` (`GuidedTranslationService`:1004-1008).
- **The v2 push was refused [V, `finalize-exception-32..546`].**
  - **First push:** a **non-definite** refusal (`GuidedRunnerClient.contextRefusal`:307, `UNKNOWN_OUTCOME`).
  - **The next 513 retries** (05:36:12 to 05:37:40): definite `IDENTITY_MISMATCH` (:314, WARN-logged). Then
    `CANCELLED`.
  - The runner never entered the v2 update, so `/obs015-ack` was never hit and the assertion failed after 90 s.
- **Why the first push was refused [V code, I for the exact runner code].**
  - The ten-step prefix ends with a binding consumer: step 2, "Check Destination has that order reference".
    Sibling 1's A77-1 confirms there are 2 prefix consumers.
  - `GuidedSessionService.admit` → `GuidedBindingStore.attachConsumer`:240 bumps `materialization_revision` at that
    admission.
  - That happens **after** the `advancePrefix` same-version `pushContext` for that coordinate. No later prefix
    coordinate exists to push it again.
  - So the runtime is one revision behind. The v2 append is `DB+1`, and runtime.ts:180 requires
    `next.materializationRevision === this.context.materializationRevision + 1`. That gives `CONTEXT_REVISION`,
    which is non-definite.
  - **Sibling 1 passed only because the test itself** pushed the current same-version context
    (`runner.send("context", …)` at :7790) before the append.
- **Why the retries say `IDENTITY_MISMATCH` [V].**
  - The runner transport caches the rejected promise under `[sessionId,'context',deliveryId]`. It never evicts it
    (transport.ts:96,112).
  - A retry with the same delivery id first calls `ownership.getRuntime(identity(v2))`. That identity includes
    `contextRevision`, so it is refused (transport.ts:111, ownership.ts:123).
  - Every retry is therefore refused, and the refusal masks the real code.
- **Classification: production defect.** The test and its assertion are correct, and I do not weaken them.
  - **P-B1:** the suffix append is not preceded by a same-version context sync when the last prefix admission
    bumped the materialization revision.
    - Proposed fix (production; Dex-W2 and Aria): in `finishSuffixMaterialization`, call
      `dispatch.pushContext` before `sessions.materialize`. This mirrors the rule `advancePrefix` already
      follows: "apply current metadata before…".
    - Alternatively, a runner change could accept `>= +1`. That needs Aria.
  - **P-B2:** two compounding issues.
    - A failed `context` delivery replays as `IDENTITY_MISMATCH` forever, hiding the original code.
    - `finishSuffixMaterialization` has no definite-refusal handling, unlike `bootstrap`:316 and
      `advancePrefix`:400. So the session spins until cancel or lease expiry instead of ending `FAILED
      RUNTIME_INCOMPATIBLE`.
  - **Likely same cause [I]:** the 35-label `incremental joined append-input` uses the same scenario and edit.
    It has never passed in 11 recorded runs; recent runs were blocked earlier by the generation guard.

### Cleanup failure and `cleanupUnconfirmed`: production defect, not the H8 ~23 s close
- **`b3f70b8a` stayed `teardownStatus PENDING` from 05:37:47 to 05:57:02 [V].** That covers all 55 failure-cleanup
  records, each waiting 20 s. A 120 s wait would not have helped.
- **P-B3 [V code, I runtime].**
  - `GuidedSessionService.stop`:2502-2536 builds the teardown target from `materialization.context()`. That
    returns the **PENDING v2 delivery** identity (`contextRevision 2`), which the runner never applied.
  - The runner bridge `stop` requires `sameIdentity(currentIdentity, message)` (ownership.ts:162). The runtime
    is still at `contextRevision 1`, so it refuses.
  - The client and reaper treat a stop non-200 as `UNKNOWN_OUTCOME` (re-send and re-drive), so `CONFIRMED` is
    never reached.
  - Bootstrap already has the analogous case handled: `unacknowledgedBootstrap` addresses the stop to the
    assignment (:2510-2517). An unacknowledged **append** delivery is not handled.
  - Proposed fix (production): also address the assignment when a PENDING materialization delivery exists.
- **Consequence:** `cleanupUnconfirmed` correctly blocked 54 low-lane tests. The guard is right; do not relax it.
  - Note: because `@BeforeEach` asserts before `testOwnedSessions.clear()`, each blocked test re-waited 20 s on
    the same session, about 18 min in total. This is efficiency only; I propose no change.

## 3. General risk: ≤20 s teardown waits vs the ~23 s close
- **Measured in this run [V]:** no ≤20 s wait lost to a finite slow close.
  - B2A-02's cleanup confirmed both sessions.
  - The only unconfirmed teardown is P-B3, which is permanent.
  - The ~23 s close was measured only after 600 s of idle recording (h8-source01/notes.md:74,105).
  - confirm-expire did not execute, so there is still no expiry→CONFIRMED measurement.
- **20 s call sites:**
  - `p3AwaitTeardown` (:23766) at :4861, 4982, 5104, 6232, 6663, 7192, 7283, 7483, 7540, 7630, 7704, 8104, 8714,
    9088, 9142, 9770, 11021, 11732, 11835, 12613, 12699, 13150, 19152, 20749, 21589, 22484, 23050, 23577;
  - the `@AfterEach` cleanup at :2878-2890;
  - `verifyPreviousWorkerGenerationClosed` at :686.
- **Sessions with long idle before terminal [I, static]:** none of these idles ≥300 s.
  - :11021: waiting-answer natural lease lapse, about lease + 3 s.
  - The natural-lease-expiry parent at :10244.
  - B2B sibling 1 at :7630, :7704, :8104: about 30 s natural preparation expiry.
  - confirm-long-wait: guarded only by :686.
  - confirm-expire: already uses the 120 s helper.
- **Proposed single rule R-TD (for Quinn's ACK):**
  1. All three 20 s waits stay unchanged. `p3AwaitTeardown`, `@AfterEach` and :686 are never lengthened.
  2. A test's **own** teardown wait may switch to the R2 pattern only when both hold:
     - its own session was idle ≥ 300 s with a recording, or ended through EXPIRED or a natural lease lapse;
     - a run shows that site timing out at 20 s while the row later reaches `CONFIRMED`, i.e. a finite slow close.
  3. The R2 pattern means:
     - one shared generalization of `incrementalAwaitExpiredTeardownConfirmed`;
     - a read-only poll of that session only, with no lock across sleeps;
     - ≤120 s, with credentials refreshed every 10 s;
     - production paths only;
     - on timeout, fail and name H8;
     - write value-free elapsed evidence.
  4. A `PENDING` that never confirms (like P-B3) is a product finding. It never gets a longer wait.
- **Today, no call site qualifies,** so the patch contains no wait change.

## 4. Patch (`fix.patch`)
- **Scope:** 1 file, 6 hunks, B2 fixture only (`b2aTitleSuffix` knob users).
- **Apply:** from the repo root, `git apply -p0 fix.patch`.
- **Result hash:** `2e78558c…`.
- **Verification actually run:**
  - `git apply --check -p0` against the live tree: OK.
  - javac 21.0.10 `-proc:none` on the base and patched file, with an approximate classpath (`build/classes` plus
    the newest `~/.gradle` jars) and scratch output only: **0 errors each**.
  - google-java-format 1.22 over the patched file: no difference inside the changed hunks.
  - No added line exceeds 100 columns.
- **Not run:** Gradle, Spotless, JUnit, PG, Chromium, CodeRabbit (WSL-only) and the runner. The fix is
  **unexecuted**. B2A-02 assertions after `awaitFinalizing(id)` have never run.
- **No B2B-01 test hunk.** A test-side context push would mask P-B1. B2B-01 stays red until P-B1 and P-B3 are
  fixed in production.
- **Re-run:** `test` `--tests …ReplayIT.incrementalSecretVersionOneUsageSurvivesSuffixVersionTwoAck`, plus
  `guidedIncrementalTest` B2B-02, which uses the same knob. Use `--no-daemon`.

## 5. Self-critique
- **Weakest link:** the exact runner code of the first v2 refusal was not captured, because non-definite codes
  are not logged.
  - `CONTEXT_REVISION` is inferred from the code path plus the sibling-1 contrast. BUSY is less likely [I]: the last prefix
    dispatch clears `prepared` (runtime.ts:352), and the plan call follows that dispatch.
  - Confirming it needs one runner-side diagnostic, or a DB read of `materialization_revision` versus the last
    pushed context.
- **P-B3's runtime refusal is inferred from code.** The observed fact is 19 min of `PENDING`.
- **P-A is a design question,** not a defect claim.
