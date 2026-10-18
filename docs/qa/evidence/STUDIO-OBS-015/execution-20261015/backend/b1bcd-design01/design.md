# B1b / B1c / B1d — implementation-ready JOIN test designs (STUDIO-OBS-015)

Author: Aria (@architect), read-only design. Written 2026-10-15. Status: **HOLD — design only**.
No source, dist, story, ledger, lifecycle or prior evidence was changed. No Gradle, pnpm, Node,
JVM, database, Docker, browser or process command ran. Only `shasum`, `jq`, `grep`/`sed` reads ran.
The only writes are this file and `manifest.json` beside it.

Inputs (sha256 in `manifest.json`): resume plan §§2–4, `current-gap-plan01/{review.md,next-batches.json,requirement-map.json}`,
`validation-ledger.json` (`acceptanceCases[20,26,27,48,54,55,56,80,81,82]`), the story, `b1a-callback-seam01/`,
`prefix-sync-test-seam01/review.md`, `architecture-correction-03/test-delta.json`, ReplayIT at
`f279684c…abea24`, `build.gradle.kts` at `1cc4cee0…dbdef8`, and the production/runner/schema sources listed in the manifest.

Everything below labelled **static trace** was read in source, not executed. Nothing here is a test result.

**Anchoring rule (coordinator addendum).** ReplayIT changed during this read: `f279684c…` became `9f54372c…` with
Dex's narrow secretId fix, and more edits may land. Every `ReplayIT:NNN` or `build.gradle.kts` line number below is
a **reading aid only**. Apply each edit by the identifier named next to it:
- `PREFIX_SYNC_CUTS` declaration
- `RuntimeHooks.observedOriginalSessionRepository` → anonymous `TransactionTemplate.execute`, first statement in its `try`
- `RuntimeHooks.observedReportCapture` → filter lambda, first statements
- the `APP.createContext("/flow", …)` handler, after its `incrementalDomVariant` block
- `incrementalTenModel` → the `SOURCE_PLAN` branch, the `bindingConsumers` loop, the `INCREMENTAL_STEPS.get(1)` branch, the final `else`, and the NEXT_ACTION `op` chain
- `incrementalNativeFaultObserver` → the `RevRuntime.prototype.start` and `.update` wrappers and `.formatted(...)`
- `SINGLETON_METHODS`, `INCREMENTAL_METHODS`
- Gradle: `joinedPrefixSyncMethods`, the `guidedIncrementalTest` `setIncludePatterns`, the `tasks.test` exclude loop, and the `requireFreshGuidedPartitions` `expected`

All of these identifiers were re-verified present in `9f54372c…` after the change. Production line citations (D1,
F2, F3) refer to the hashed production files in the manifest.

---

## 0. Summary

| ID | New ReplayIT method (all `@Test` singletons) | Lane | Ledger (index0) | Blocked by D1? |
|---|---|---|---|---|
| B1B-01 | `incrementalPrefixRecoveryUsesNextUnconsumedCoordinate` | low / `guidedIncrementalTest` (2048) | 20 (resume), OPEN matrix rows SUCCEEDED-restart / ADMITTED / DISPATCHING | no |
| B1B-02 | `incrementalConcurrentAuthenticatedDriftCommitsOneSwitch` | low | 20 (concurrent duplicate transition) | **yes** |
| B1B-03 | `incrementalDriftAuthorityRejectsEveryExactJoin` | low | 48; 54 callback-tier joins | positive rows **yes** |
| B1B-04 | `incrementalExcludedAttemptCannotHideOtherUnsettledActions` | low | 54 publication-tier joins, non-omission, no invented PRE action | **yes** |
| B1B-05 | `incrementalPrefixContinuationMatrixDoneAndRefreshRows` | low | OPEN matrix rows DONE-BOUNDARY / DONE-NOT-PENDING / REFRESH | no |
| B1C-01 | `incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned` | low | 26 | no |
| B1C-02 | `incrementalPrefixPolicyRefusalsNeverBecomeDrift` | low | 27 | no (may expose a classification defect, §1 F3) |
| B1C-03 | `incrementalFreshPostConsentGuardsDenyDangerousProposals` | low | 80; 82 (fresh post-answer guard clause) | no |
| B1C-04 | `incrementalWaitingAnswerRejectsChangedContextGenerationAndNaturalLeaseExpiry` | low | 81; 82 (direct-admit regate) | no |
| B1D-01 | `incrementalEmptyPrefixProgramPairSurvivesEveryContextDelivery` | low | 55 | no |
| B1D-02 | `incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary` | low | 56 | no |

B1b has **five** methods, not four: the explicit OPEN "exact ADMITTED/done/refresh/recovery matrix" gets its own
B1B-05 for the DONE and REFRESH rows. The recovery rows (ADMITTED, DISPATCHING, restart) live in B1B-01. Net new
identities: **11**. Projected JOIN inventory = 43 default + (37 + 5 PFXSYNC + 1 B1a + 11) low = **97** (the resume
plan's figure of 20 new tests becomes 21).

Every method is low-lane. Each uses the incremental ten-step joined parent, whose fresh page values are audit
canaries only under `INCREMENTAL_2048`, and none needs the 4000 profile.

**Production seam needed: one fix, D1 (§2). It is not a test seam; it is an established defect.** Every other
instrument is test-only inside ReplayIT (§3). Natural owner-lease expiry needs **no** production seam. It uses a
real worker stall (SIGSTOP/SIGCONT of the fixture-owned guided worker PID), observed against DB and Java clocks.
No clock, lease, policy, timeout or renewal-cadence value is changed.

---

## 1. Findings established by source reading (static trace; not executed)

**D1 — every authentic `prefixDrift` callback is refused (production defect, blocks 9 original variants and B1b positives).**
`GuidedSessionService.prefixDrift` (GuidedSessionService.java:2260) calls `materialization.verify(session.document(), receipt)`.
`GuidedMaterializationService.verify` (285–292) compares every field of `identity(context)`, and that set includes
`versions` (265–283; `v3/bridge#/definitions/identity` requires it). `DriftReceipt` (`PreAdmissionDrift`/`AdmittedDrift`,
bridge.schema.json, `additionalProperties:false`) has no `versions` field, and the runner's `makeDrift` (runtime.ts:294–297)
never adds one. So `envelope.path("versions")` is `MissingNode`, the check fails, and the result is **409 STALE_FENCE**
for every authentic receipt. The runner then stops with `UNKNOWN_OUTCOME` (runtime.ts:288–289, 449–451).
Consequences:
- The original variants `drift2, admitted-drift2, admitted-literal2, pre-literal2, same-pair-literal, drift-first, drift-auth, drift-auth-pre, drift-plan-fail` cannot pass at the current source.
- The existing `assertActualDriftCallbackAuthorityThenRelease` forged-field probe (ReplayIT:4576–4587, `isIn(403,409,422)`) is **vacuous**: every forgery gets STALE_FENCE before its intended guard.
- No receipt has ever been committed in any recorded run. `backend-join85-frozen-attempt07` failed all 87 cases earlier, in base learning (`FINALIZING` expected, `FAILED` observed), so the run did not reveal D1.

**F2 — the prefix confirmation REFRESH row always returns through `STALE_GENERATION` (low severity; needs a ruling).**
In `advancePrefix`, the refresh branch (TranslationService:338–347, 379–382) calls `dispatch.observe`. The callback
(`observeV2`→`observe`) commits the refresh and keeps state `REPLAYING_PREFIX` (SessionService:1181). Then
`committedObservationRefresh` → `committedRefresh` requires `state == PROPOSING` (2025–2032) and throws
**STALE_GENERATION** after the refresh is already durable. The next continuation skips the refresh because the
evidence changed, and progress converges. No duplicate effect happens, but every prefix confirmation ends one
`/plans` with a 409. B1B-05 pins this exactly (one occurrence, from the `committedRefresh` frame) instead of treating it as correct.
Ruling options: accept and document, or allow `REPLAYING_PREFIX` in `committedRefresh` while `incremental.pending`.
The second option is a production change.

**F3 — risk that ledger 27 sub-cases are classified as drift (open until run).** For the redirect sub-case,
`navigateBlank` (browser.ts:592–601) and the guided `observedNavigateBlank` (browser.ts:224–235) call
`beginInvocation` before the transition. The context route aborts unapproved origins (browser.ts:572–576). If Chromium
commits an error page, the next prefix `prepareObservedAction` demands `observation.origin === guard.origin` and
otherwise returns `TARGET_DRIFT` (observedReplayAdapter.ts:23). If that happens, a policy-blocked redirect would become
a PRE_ADMISSION drift receipt and a switch. That is exactly the mislabel that ledger 27 forbids. If the transition never
commits, the result is navigate `UNKNOWN_OUTCOME` with **outcomeCode `TARGET_CHANGED`** (runtime.ts:438–443).
B1C-02 asserts the strict reading: no receipt, no switch, and no ledger `TARGET_CHANGED` code. A red result there is a
production classification finding. It does not license weakening the assertion.

**F4 — guard reachability inside a prefix (drives the B1C-03 scope).** Prefix proposals are runner-prepared from the
verified base program, and the locator role and name must match the observed node exactly (observedReplayAdapter.ts:42).
So the guard's label (`GuidedActionGuard.evaluate`, 163–166) and grounding inputs are the same as at base time.
Inside a prefix, grounding and Enter classification are policy-independent and cannot change. Only a **governed policy
delta** (vocabulary or stance), frozen at mixed start, can make a post-consent guard refuse. A single-word vocabulary
term can never refuse a grounded single-word label, because grounding needs the word in the authored text and the
destructive check needs it absent (166–182). Multi-word phrases are required (§5 B1C-03).

---

## 2. Required production change (separate approval) — D1

Options:

| | Change | Trade-off | Security |
|---|---|---|---|
| **A (recommended)** | Add `GuidedMaterializationService.verifyReceipt(session, receipt)`: `requireAcknowledged` plus the identity fields the receipt carries (`schemaVersion, sessionId, workerId, ownerFence, scopeHash, contextId, contextRevision, sourceRevision, configurationRevision`). That is `identity()` minus `versions`. Call it from `prefixDrift`. | ~10 lines in two files. No contract, runner or vector change. | No weakening. `versions` was never receipt authority. The V21 trigger `studio_015_no_invocation_guard` (V21:438–471) binds the receipt to the issued `prefix_requests` document, which `issue()` built from the same versioned context. The owner, fence and lease are still checked first. |
| B | Set `receipt.versions` from the session before calling `verify` | One line | Tautological. It hides intent and verifies nothing. Rejected. |
| C | Add `versions` to `DriftReceipt` (v3 contract) | Contract regeneration, runner change, receipt-hash vector churn, digest re-anchor | Unnecessary churn under the frozen-contract rule. Rejected. |

Owner: Dex (backend) after root approval, with an independent Quinn production review. Apply before R3. Otherwise
B1B-02, the B1B-03 positive rows, B1B-04 and the 9 original drift variants stay red. Pinned regression: B1B-03 rows
`positive-pre`/`positive-admitted` and the existing variants.

---

## 3. Shared test-only instruments (ReplayIT only; one writer, Dex-JOIN)

All of these are inactive unless one owned case arms them. They never change bytes, results, exceptions, commits,
clocks, leases or policy. New owned files use the prefix `obs015-prefix-sync-b1-`, so the existing sink inventory
(ReplayIT:18873) and generation archive (ReplayIT:679) collect them with their existing 0600 check. No inventory edit
is needed.

### T1 — `B1Cut`: request-entry and outermost-commit holds

Add these new statics and the class next to `PREFIX_SYNC_CUTS` (≈ReplayIT:892):

```java
  // STUDIO-OBS-015 b1bcd-design01: test-only holds. Inactive unless one owned case arms them; a
  // selected real request/commit is held outside SQL and continues byte-identically on release.
  private static final List<B1Cut> B1_CUTS = new CopyOnWriteArrayList<>();
  private static final ThreadLocal<String> B1_REQUEST_KEY = new ThreadLocal<>();
  private static final AtomicInteger B1_REDIRECTS = new AtomicInteger();
  private static volatile boolean b1GuardsPage;
  private static volatile Process b1StalledWorker;

  private static final class B1Cut {
    enum Kind { PLANS_ENTRY, ADMIT_COMMIT, CONSUME_COMMIT, PLAN_CONTINUATION_COMMIT }
    final Kind kind; final String sessionId, requestKey; final JsonNode coordinate; final int plansOrdinal;
    final java.util.concurrent.CountDownLatch entered = new java.util.concurrent.CountDownLatch(1);
    final java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
    final AtomicInteger selections = new AtomicInteger(), plansSeen = new AtomicInteger();
    volatile String admissionId, ledgerState; volatile long enteredAtNanos; volatile Throwable failure;

    private B1Cut(Kind kind, String sessionId, JsonNode coordinate, String requestKey, int plansOrdinal) {
      this.kind = kind; this.sessionId = sessionId; this.coordinate = coordinate;
      this.requestKey = requestKey; this.plansOrdinal = plansOrdinal;
    }
    static B1Cut arm(Kind kind, String sessionId, JsonNode coordinate, String requestKey, int plansOrdinal) {
      assertThat(c5Capture).as("B1 cuts never overlap C5 sampling").isNull();
      assertThat(B1_CUTS.size()).isLessThan(2);
      var cut = new B1Cut(kind, sessionId, coordinate, requestKey, plansOrdinal);
      B1_CUTS.add(cut);
      return cut;
    }
    boolean plansRequest(jakarta.servlet.http.HttpServletRequest http) {
      return "POST".equals(http.getMethod())
          && http.getRequestURI().equals("/internal/v2/studio/guided-sessions/" + sessionId + "/plans");
    }
    void onPlansRequest() {
      if (kind == Kind.PLANS_ENTRY && plansSeen.incrementAndGet() >= plansOrdinal
          && selections.getAndIncrement() == 0) hold("PLANS_ENTRY");
    }
    void afterOutermostCommit(Object result) {
      boolean selected;
      try {
        selected = switch (kind) {
          case ADMIT_COMMIT -> result instanceof ObjectNode action
              && sessionId.equals(action.path("sessionId").asText())
              && "ADMITTED".equals(action.path("state").asText())
              && coordinate.equals(action.path("coordinate"))
              && b1OnStack("com.citi.put.checks.studio.guided.session.GuidedSessionService", "admitChecked");
          case CONSUME_COMMIT -> result instanceof com.citi.put.checks.studio.guided.session.GuidedSessionService.WonConsumption won
              && sessionId.equals(won.ledger().path("sessionId").asText())
              && coordinate.equals(won.ledger().path("coordinate"));
          case PLAN_CONTINUATION_COMMIT -> result == null && requestKey.equals(B1_REQUEST_KEY.get())
              && b1DirectPlanContinuation();
          case PLANS_ENTRY -> false;
        };
        if (!selected || selections.getAndIncrement() != 0) return;
        if (result instanceof ObjectNode action) {
          admissionId = action.path("admission").path("admissionId").asText(); ledgerState = action.path("state").asText();
        } else if (result instanceof com.citi.put.checks.studio.guided.session.GuidedSessionService.WonConsumption won) {
          // Observe the typed ledger only; the capability is never saved, cloned, serialized or resent.
          admissionId = won.ledger().path("admission").path("admissionId").asText(); ledgerState = won.ledger().path("state").asText();
        }
      } catch (RuntimeException | AssertionError observerFailure) { failure = observerFailure; return; }
      hold(kind.name());
    }
    private void hold(String phase) {
      enteredAtNanos = System.nanoTime(); entered.countDown();
      try { if (!release.await(30, java.util.concurrent.TimeUnit.SECONDS)) failure = new IllegalStateException("B1 cut deadline " + phase); }
      catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); failure = interrupted; }
    }
  }

  private static boolean b1OnStack(String cls, String method) {
    return StackWalker.getInstance().walk(frames -> frames.anyMatch(
        f -> f.getClassName().startsWith(cls) && f.getMethodName().equals(method)));
  }

  /** The plan() continuation transaction (TranslationService:160-169), never bootstrap/advancePrefix/helpers. */
  private static boolean b1DirectPlanContinuation() {
    return StackWalker.getInstance().walk(stream -> {
      var frames = stream.map(f -> f.getClassName() + "#" + f.getMethodName()).toList();
      for (int at = 0; at < frames.size(); at++) {
        if (!frames.get(at).startsWith("com.citi.put.checks.studio.guided.session.GuidedSessionService")
            || !frames.get(at).endsWith("#translationTransaction")) continue;
        for (int next = at + 1; next < frames.size(); next++) {
          if (frames.get(next).startsWith("com.citi.put.checks.studio.guided.session.GuidedSessionService")) continue; // proxy
          return frames.get(next).equals("com.citi.put.checks.studio.guided.translation.GuidedTranslationService#plan");
        }
      }
      return false;
    });
  }
```

**RuntimeHooks patch** (ReplayIT:1686). Put this as the first statement inside the existing `try`, before
`C5Capture capture = c5Capture;`:

```java
                if (!B1_CUTS.isEmpty() && !org.springframework.transaction.support
                    .TransactionSynchronizationManager.isActualTransactionActive()) {
                  T result = super.execute(callback); // the original outermost transaction commits here
                  if (!org.springframework.transaction.support.TransactionSynchronizationManager
                      .isActualTransactionActive()) for (B1Cut cut : B1_CUTS) cut.afterOutermostCommit(result);
                  return result;
                }
```

A rollback throws out of `super.execute` and is never held. Nested (REQUIRED) executions are skipped. The hold runs
after commit with no transaction active.

**Filter patch** (`observedReportCapture`, ReplayIT:1963). Put this as the first statements of the lambda:

```java
            var b1Http = (jakarta.servlet.http.HttpServletRequest) request;
            if (B1_CUTS.stream().anyMatch(cut -> cut.plansRequest(b1Http))) {
              B1_REQUEST_KEY.set(b1Http.getHeader("Idempotency-Key"));
              try {
                for (B1Cut cut : B1_CUTS) if (cut.plansRequest(b1Http)) cut.onPlansRequest();
                chain.doFilter(request, response);
              } finally { B1_REQUEST_KEY.remove(); }
              return;
            }
```

### T2 — `B1Spec` / `B1Parent` (generalized lawful base → publish → teardown → mixed start)

This mirrors `prefixSyncParent` (ReplayIT:3567). It adds per-case text overrides, base and mixed DOM variants, a
governed policy delta and an optional READY explicit first step. The original 35 flow is untouched.

```java
  private static List<String> b1BaseTexts() {
    var texts = new ArrayList<String>();
    texts.add("Open " + URL + " and read the Order reference.");
    texts.add("Enter that order reference in Destination (an authored alternative is literal-control).");
    texts.add("Check Destination has that order reference.");
    texts.add("Check Destination is visible.");
    texts.add("Click Submit and check Confirmation appears.");
    for (int i = 5; i < 10; i++) texts.add("Check Confirmation is visible at checkpoint " + (i + 1) + ".");
    return texts;
  }

  /** Closed lawful recipe: authored text, governed policy, fixture page and fault-observer mode only. */
  private static final class B1Spec {
    final List<String> texts = b1BaseTexts();
    Integer editIndex, readyFirst; String editText, stance, mixedDom, nativeMode = "{}";
    List<String> vocabulary; boolean guardsPage, armPairLog, holdEmptyStart;
    int nativeStep = 1, nativeOrdinal = 0;
    B1Spec text(int index, String value) { texts.set(index, value); return this; }
    B1Spec edit(int index, String value) { editIndex = index; editText = value; return this; }
    B1Spec ready(int firstIndex) { readyFirst = firstIndex; return this; }
    B1Spec policy(String stance, List<String> vocabulary) { this.stance = stance; this.vocabulary = vocabulary; return this; }
    B1Spec mixedDom(String variant) { mixedDom = variant; return this; }
    B1Spec guards() { guardsPage = true; return this; }
    B1Spec pairLog(boolean holdEmptyStart) { armPairLog = true; this.holdEmptyStart = holdEmptyStart; return this; }
    B1Spec nativeMode(String mode, int stepIndex, int ordinal) { nativeMode = mode; nativeStep = stepIndex; nativeOrdinal = ordinal; return this; }
  }

  private final class B1Parent implements AutoCloseable {
    final UUID test; final String base, id, baseRevision; final JsonNode edited; final B1Spec spec;
    final int navigationsBefore, effectsBefore, modelBefore, legacyBefore;
    B1Parent(UUID test, String base, String id, String baseRevision, JsonNode edited, B1Spec spec,
        int navigationsBefore, int effectsBefore, int modelBefore, int legacyBefore) {
      this.test = test; this.base = base; this.id = id; this.baseRevision = baseRevision; this.edited = edited; this.spec = spec;
      this.navigationsBefore = navigationsBefore; this.effectsBefore = effectsBefore; this.modelBefore = modelBefore; this.legacyBefore = legacyBefore;
    }
    long fence() { return sessions.transaction(() -> sessions.lock(id).document().path("owner").path("fence").asLong()); }
    String state() { return sessions.transaction(() -> sessions.lock(id).document().path("state").asText()); }
    void cancel() throws Exception {
      if (!List.of("SUCCEEDED", "FAILED", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED", "PUBLICATION_CONFLICT").contains(state()))
        publicCall("/api/v1/studio/guided-sessions/" + id + "/cancel",
            C.object().put("schemaVersion", 3).put("reason", "userRequested"), 202, UUID.randomUUID().toString());
    }
    @Override public void close() throws Exception {
      var failures = new ArrayList<Throwable>();
      try { b1ResumeWorker(); } catch (Exception | AssertionError failure) { failures.add(failure); }
      for (B1Cut cut : B1_CUTS) cut.release.countDown();
      B1_CUTS.clear();
      var held = INCREMENTAL_ACK_RELEASE.remove(id); if (held != null) held.countDown();
      INCREMENTAL_DRIFT_CAPTURE.remove(id); INCREMENTAL_ACK_ENTERED.remove(id);
      coreRole = "owner"; forgetCachedCoreIdentity();
      try { refreshFixtureCredentials(); cancel(); } catch (Exception | AssertionError failure) { failures.add(failure); }
      try { p3AwaitTeardown(id); } catch (Exception | AssertionError failure) { failures.add(failure); }
      try { Files.writeString(TEMP.resolve("obs015-native-mode.json"), "{}"); b1WritePairControl(C.object()); }
      catch (Exception | AssertionError failure) { failures.add(failure); }
      finally {
        incrementalTenScenario = false; incrementalDomVariant = null; b1GuardsPage = false;
        primaryCsi = "CSI-123"; forgetCachedCoreIdentity();
      }
      throwTeardownFailures(failures);
    }
  }

  private B1Parent b1Parent(B1Spec spec) throws Exception {
    assertThat(B1_CUTS).isEmpty(); assertThat(PREFIX_SYNC_CUTS).isEmpty();
    primaryCsi = "CSI-B1-" + (++p3CsiOrdinal); // per-case CSI: never enlarge the real daily cap
    forgetCachedCoreIdentity();
    jdbc.update("INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment)"
        + " VALUES (?,'Orders','Ops','HIGH','fixture@example.invalid','Production')", primaryCsi);
    startWorkers(); seedGovernedPolicies(primaryCsi);
    incrementalTenScenario = true; INCREMENTAL_MODEL_CONTEXTS.clear();
    b1GuardsPage = spec.guardsPage; incrementalDomVariant = null;
    b1WritePairControl(spec.armPairLog ? C.object().put("armed", true).put("holdEmptyStartMs", spec.holdEmptyStart ? 16000 : 0) : C.object());
    Files.writeString(TEMP.resolve("obs015-prefix-sync-b1-pair-events.jsonl"), "");
    b1Restrict(TEMP.resolve("obs015-prefix-sync-b1-pair-events.jsonl"));
    AUDIT_CANARIES.addAll(spec.texts);
    AUDIT_CANARIES.addAll(List.of("Operations", "Order reference", "Destination", "Submit", "Confirmation", "literal-control"));
    var steps = new ArrayList<AuthoringStep>();
    for (int i = 0; i < 10; i++) steps.add(new AuthoringStep(UUID.fromString(INCREMENTAL_STEPS.get(i)), spec.texts.get(i), null));
    var authoring = new AuthoringV2Request(2, null, steps);
    UUID test = UUID.randomUUID();
    jdbc.update("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,authoring,authoring_revision_inputs,created_by,created_at,updated_at)"
        + " VALUES (?,'B1 incremental',?,'fixture','chromium',?::jsonb,'[]'::jsonb,?::jsonb,?::jsonb,'fixture@example.invalid',now(),now())",
        test, primaryCsi, JSON.writeValueAsString(spec.texts), JSON.writeValueAsString(authoring),
        JSON.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())));
    String original = startLearning(test); awaitFinalizing(original);
    JsonNode base = publicCall("/api/v1/studio/guided-sessions/" + original + "/finalize",
        C.object().put("schemaVersion", 3).put("expectedSourceRevision", "1").put("expectedConfigurationRevision", "1"),
        200, UUID.randomUUID().toString());
    p3AwaitTeardown(original);
    JsonNode edited = publicCall("/api/v1/studio/tests/" + test, null, 200, null);
    assertThat(edited.path("readiness").asText()).isEqualTo("READY");
    if (spec.editIndex != null) {
      edited = b1Edit(test, spec.editIndex, spec.editText);
      assertThat(edited.path("firstChangedStepId").asText()).isEqualTo(INCREMENTAL_STEPS.get(spec.editIndex));
    }
    if (spec.stance != null) b1Policy(primaryCsi, spec.stance, spec.vocabulary);
    Files.writeString(TEMP.resolve("obs015-native-mode.json"), C.object().put("mode", spec.nativeMode)
        .put("stepId", INCREMENTAL_STEPS.get(spec.nativeStep)).put("ordinal", spec.nativeOrdinal).toString());
    Files.writeString(TEMP.resolve("obs015-native-events.jsonl"), "");
    ObjectNode start = C.object().put("schemaVersion", 3).put("testId", test.toString())
        .put("sourceRevision", edited.path("sourceRevision").asText())
        .put("configurationRevision", edited.path("configurationRevision").asText())
        .put("environmentId", "fixture").put("applicationId", "orders").put("baseRevisionId", base.path("revisionId").asText());
    if (spec.readyFirst != null) start.put("firstLearnStepId", INCREMENTAL_STEPS.get(spec.readyFirst));
    start.set("versions", versions());
    incrementalDomVariant = spec.mixedDom;
    int navigations = NAVIGATIONS.get(), effects = RECEIPTS.size(), model = MODEL_WIRE.size(), legacy = LEGACY_MODEL_CALLS.get();
    String id = publicCall("/api/v1/studio/guided-sessions", start, 202, UUID.randomUUID().toString())
        .path("session").path("sessionId").asText();
    return new B1Parent(test, original, id, base.path("revisionId").asText(), edited, spec, navigations, effects, model, legacy);
  }

  private JsonNode b1Edit(UUID test, int index, String text) throws Exception {
    JsonNode draft = publicCall("/api/v1/studio/tests/" + test, null, 200, null);
    ObjectNode edit = C.object();
    for (String field : List.of("authoringSchemaVersion", "globalContext", "steps", "name", "description", "csiId",
        "environment", "variables", "configuration", "sourceRevision", "configurationRevision"))
      edit.set(field, draft.path(field).deepCopy());
    ((ObjectNode) edit.path("steps").get(index)).put("text", text);
    AUDIT_CANARIES.add(text);
    var request = HttpRequest.newBuilder(URI.create("https://localhost:" + port + "/api/v1/studio/tests/" + test))
        .header("Cookie", "put_session=" + COOKIE).header("Content-Type", "application/json")
        .header("Idempotency-Key", UUID.randomUUID().toString()).PUT(HttpRequest.BodyPublishers.ofString(edit.toString())).build();
    var response = HttpClient.newBuilder().sslContext(TLS).build().send(request, HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    return C.parse(response.body());
  }

  /** A new approved governed version through the production repository; mirrors ObservedPublicationFixture.ensurePolicy. */
  private void b1Policy(String csi, String stance, List<String> vocabulary) {
    var repository = new com.citi.put.checks.studio.guided.policy.ObservationPolicyRepository(jdbc, C);
    ObjectNode submitted = C.object().put("schemaVersion", 3).put("sideEffectStance", stance);
    var origins = submitted.putArray("allowedOrigins"); POLICY.path("allowedOrigins").forEach(origins::add);
    submitted.set("applicationPolicy", POLICY.path("applicationPolicy").deepCopy());
    if (vocabulary != null) { var words = submitted.putArray("destructiveVocabulary"); vocabulary.forEach(words::add); }
    ObjectNode document = com.citi.put.checks.studio.guided.policy.ObservationPolicyDocuments.materialize(
        C, submitted, com.citi.put.checks.studio.support.ObservedPublicationFixture.DEFAULT_DESTRUCTIVE_VOCABULARY);
    String documentHash = com.citi.put.checks.studio.guided.policy.ObservationPolicyDocuments.documentHash(document);
    String observationHash = com.citi.put.checks.studio.guided.policy.ObservationPolicyDocuments.observationPolicyHash(document);
    sessions.transaction(() -> {
      var state = repository.state(csi, "orders", "fixture").orElseThrow();
      repository.lock(state.policyId());
      int next = repository.latestVersion(state.policyId()) + 1;
      repository.insertVersion(state.policyId(), next, document, documentHash, observationHash,
          com.citi.put.checks.studio.support.ObservedPublicationFixture.POLICY_AUTHOR);
      repository.insertApproval(state.policyId(), next,
          com.citi.put.checks.studio.support.ObservedPublicationFixture.POLICY_APPROVER, "b1-approval-" + next);
      return null;
    });
  }

  private static void b1Restrict(Path file) throws Exception {
    Files.setPosixFilePermissions(file, java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
  }
```

### T3 — fixture page variants (`/flow` handler, ReplayIT:1306)

Add these immediately after the existing `incrementalDomVariant` block (≈1366). Base-time variants use
`b1GuardsPage`. Mixed-only variants use `incrementalDomVariant`, which is set only after base publication.

```java
            if ("b1c-assert2".equals(incrementalDomVariant)) { // same real focus mutation as assert-fail
              html = html.replace("</body>", "<script>document.getElementById('destination').addEventListener('focus',()=>{"
                  + "document.querySelector('output[aria-label=\"Order reference\"]').textContent='changed-after-read';});</script></body>");
            } else if ("b1c-navigate-away".equals(incrementalDomVariant)) {
              html = html.replace("document.getElementById('done').hidden=false;", "location.assign('https://unapproved.invalid/b1c');");
            }
            if (b1GuardsPage) {
              html = html.replace("<button id='submit'>", "<button id='saveall'>Save all</button><button id='deleteall'>Delete all</button>"
                  + "<label for='notes'>Archive all notes</label><textarea id='notes'></textarea><button id='submit'>");
            }
            if ("b1c-redirect".equals(incrementalDomVariant)) { // real server redirect; Chromium's route guard decides
              B1_REDIRECTS.incrementAndGet();
              exchange.getResponseHeaders().set("Location", "https://unapproved.invalid/b1c");
              exchange.sendResponseHeaders(302, -1); exchange.close(); return;
            }
```

### T4 — controlled model fixture (`incrementalTenModel`, ReplayIT:20425)

1. Planning failure. Replace line 20427–20428 with:
```java
      if (("drift-plan-fail".equals(incrementalDomVariant) && context.has("learningWindow"))
          || List.of("b1d-boundary-plan-fail", "b1d-empty-plan-fail").contains(incrementalDomVariant))
        return result.put("status", "UNSUPPORTED").put("reasonCode", "INSUFFICIENT_EVIDENCE");
```
   (`incrementalDomVariant` is set only after base publication, so only the mixed SOURCE_PLAN fails.)
2. Step-2 assertion consumer. In the `bindingConsumers` loop (20440–20444), add:
```java
        if (!literalReplacement && stepId.equals(INCREMENTAL_STEPS.get(1))
            && source.get(at).path("text").asText().contains("check Order reference contains"))
          bindingConsumers.add(C.object().put("stepId", stepId).put("argumentSlot", "assert.expected"));
```
3. Step-2 assertion obligation. In the `INCREMENTAL_STEPS.get(1)` non-literal branch (20475), after the fill:
```java
            if (source.get(at).path("text").asText().contains("check Order reference contains"))
              obligations.add(obligation(stepId, 1, "assert", "Order reference", null, "order").put("predicate", "containsText"));
```
4. Guard steps. Add this before the final `else` (20490):
```java
        } else if (source.get(at).path("text").asText().startsWith("Click all, then ")) {
          obligations.add(obligation(stepId, 0, "click", source.get(at).path("text").asText().endsWith("Save") ? "Save all" : "Delete all", null, null));
        } else if (source.get(at).path("text").asText().startsWith("Press Enter in ")) {
          obligations.add(obligation(stepId, 0, "press", source.get(at).path("text").asText().contains("all notes") ? "Archive all notes" : "Destination", null, null));
```
5. NEXT_ACTION press key. Add this before the final `else if (op.equals("assert"))` (20549):
   `} else if (op.equals("press")) { operation.put("key", "Enter");`

### T5 — runner observer additions (`incrementalNativeFaultObserver`, ReplayIT:15561)

These record value-free context-pair facts and support an optional real-start response withhold (the rebootstrap
cause). Add after `const i15CapturePath=...` and before `RevRuntime.prototype.start` is wrapped:

```js
const b1PairControl=%s,b1PairEvents=%s,b1Held=new Set();
function b1PairArmed(){try{const c=JSON.parse(fs.readFileSync(b1PairControl,'utf8'));return c&&c.armed===true?c:null;}catch{return null;}}
function b1PairEvent(phase,ctx){const c=b1PairArmed();if(!c)return;try{
 const has=k=>Object.prototype.hasOwnProperty.call(ctx,k);
 const row={phase,sessionHash:i15Hash(ctx.sessionId),contextRevision:ctx.contextRevision,materializationRevision:ctx.materializationRevision,
  hasProgram:has('prefixProgram'),hasHash:has('prefixProgramHash'),programActions:ctx.prefixProgram?.actions?.length??null,
  programSteps:ctx.prefixProgram?.sourceStepIds?.length??null,
  programHashValid:has('prefixProgram')&&i15Hash(ctx.prefixProgram)===ctx.prefixProgramHash,prefixProgramHash:ctx.prefixProgramHash??null};
 const line=Buffer.from(JSON.stringify(row)+'\\n','utf8');const size=fs.existsSync(b1PairEvents)?fs.statSync(b1PairEvents).size:0;
 if(size+line.length>65536)throw new Error('B1_PAIR_BOUND');fs.appendFileSync(b1PairEvents,line,{mode:0o600});
}catch{try{fs.appendFileSync(b1PairEvents,'{"phase":"ERROR"}\\n',{mode:0o600});}catch{}}}
```

Replace the `start` wrapper's first line with:
```js
RevRuntime.prototype.start=async function(...args){b1PairEvent('START',this.context);const result=await Reflect.apply(i15Start,this,args);
  const b1=b1PairArmed();
  if(b1&&b1.holdEmptyStartMs>0&&this.context.prefixProgram&&this.context.prefixProgram.actions.length===0&&!b1Held.has(this.context.sessionId)){
    b1Held.add(this.context.sessionId);b1PairEvent('START_HELD',this.context); // real start already completed
    await new Promise(r=>setTimeout(r,b1.holdEmptyStartMs));b1PairEvent('START_RELEASED',this.context);}
```

In the `update` wrapper, put `b1PairEvent('UPDATE_ENTER',args[0]);` first. Put
`b1PairEvent('UPDATE_ACCEPTED',args[0]);` immediately after `const result=await Reflect.apply(i15Update,this,args);`.
Append these two `.formatted` arguments in placeholder order:
`JSON.writeValueAsString(TEMP.resolve("obs015-prefix-sync-b1-pair-control.json").toString()), JSON.writeValueAsString(TEMP.resolve("obs015-prefix-sync-b1-pair-events.jsonl").toString())`.

```java
  private static void b1WritePairControl(JsonNode value) throws Exception {
    Path file = TEMP.resolve("obs015-prefix-sync-b1-pair-control.json");
    byte[] bytes = GuidedContracts.canonical(value).getBytes(StandardCharsets.UTF_8);
    assertThat(bytes.length).isLessThanOrEqualTo(4096);
    if (!Files.exists(file)) Files.createFile(file, java.nio.file.attribute.PosixFilePermissions.asFileAttribute(
        java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")));
    assertThat(Files.isSymbolicLink(file)).isFalse();
    Files.write(file, bytes);
  }

  private List<JsonNode> b1PairEvents(String sessionId) throws Exception {
    Path file = TEMP.resolve("obs015-prefix-sync-b1-pair-events.jsonl");
    assertThat(Files.size(file)).isLessThanOrEqualTo(65536);
    String hash = GuidedContracts.hash(JSON.getNodeFactory().textNode(sessionId));
    var rows = Files.readAllLines(file, StandardCharsets.UTF_8).stream().filter(l -> !l.isBlank()).map(C::parse).toList();
    assertThat(rows.stream().noneMatch(r -> r.path("phase").asText().equals("ERROR"))).isTrue();
    return rows.stream().filter(r -> r.path("sessionHash").asText().equals(hash)).toList();
  }
```

### T6 — natural lease expiry by a real worker stall (no production seam)

```java
  /** SIGSTOP/SIGCONT of the fixture-owned guided worker only. No clock, lease, policy or cadence change. */
  private void b1StallWorker() throws Exception {
    Process worker = guidedWorker;
    assertThat(worker).isNotNull(); assertThat(worker.isAlive()).isTrue();
    assertThat(OWNED_FIXTURE_PROCESSES.stream().anyMatch(p -> p.process == worker && p.role.equals("guided")
        && p.generation == ownedGeneration)).as("only the current owned guided worker may be stalled").isTrue();
    assertThat(worker.pid()).isNotEqualTo(ProcessHandle.current().pid());
    b1Signal(worker, "-STOP"); b1StalledWorker = worker;
  }
  private void b1ResumeWorker() throws Exception {
    Process worker = b1StalledWorker; if (worker == null) return;
    b1StalledWorker = null; if (worker.isAlive()) b1Signal(worker, "-CONT");
  }
  private static void b1Signal(Process worker, String signal) throws Exception {
    var kill = new ProcessBuilder("kill", signal, Long.toString(worker.pid())).redirectErrorStream(true).start();
    assertThat(kill.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
    assertThat(kill.exitValue()).isZero();
  }

  /** Waits for the original owner lease to lapse on both the DB clock and the Java service clock. */
  private Instant b1AwaitNaturalLeaseExpiry(String id) throws Exception {
    Thread.sleep(1000); // a renewal already on the wire when the worker stopped may still commit
    JsonNode owner = sessions.transaction(() -> sessions.lock(id).document().path("owner").deepCopy());
    Instant lease = Instant.parse(owner.path("leaseExpiresAt").asText());
    long end = System.nanoTime() + Duration.ofSeconds(45).toNanos();
    while (true) {
      JsonNode now = sessions.transaction(() -> sessions.lock(id).document().path("owner").deepCopy());
      assertThat(now).as("a stalled owner never renews, re-fences or changes worker").isEqualTo(owner);
      Boolean dbExpired = jdbc.queryForObject("SELECT (document->'owner'->>'leaseExpiresAt')::timestamptz < clock_timestamp()"
          + " FROM studio_guided_sessions WHERE session_id=?", Boolean.class, id);
      if (Boolean.TRUE.equals(dbExpired) && Instant.now().isAfter(lease)) return lease;
      assertThat(System.nanoTime()).as("original 30s lease must lapse naturally").isLessThan(end);
      Thread.sleep(100);
    }
  }
```

Trade-off. A test-filter hold of renewal `/claim` requests was rejected: the runner's 10 s claim timeout
(ownership.ts:79) triggers `stopEntry(LEASE_LOST)` (ownership.ts:120), which is the *graceful* LEASE_LOST subject that
already exists. A production observation hook was also rejected, because observation alone cannot make a healthy,
renewing owner's lease lapse. A worker stall (a VM/GC freeze) is the realistic natural cause.

### T7 — probes

```java
  private static String b1Token(ObjectNode claims, String alg, boolean sign) throws Exception {
    var encoder = Base64.getUrlEncoder().withoutPadding();
    String unsigned = encoder.encodeToString(C.object().put("alg", alg).put("typ", "JWT").toString().getBytes(StandardCharsets.UTF_8))
        + "." + encoder.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
    if (!sign) return unsigned + "." + encoder.encodeToString(new byte[] {1});
    Signature signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(ISSUER.getPrivate()); signature.update(unsigned.getBytes(StandardCharsets.UTF_8));
    return unsigned + "." + encoder.encodeToString(signature.sign());
  }
  /** RS256→HS256 confusion: HMAC keyed with the deployed public key's encoded bytes (what a naive verifier would use). */
  private static String b1HmacConfusionToken(ObjectNode claims) throws Exception {
    var encoder = Base64.getUrlEncoder().withoutPadding();
    String unsigned = encoder.encodeToString(C.object().put("alg", "HS256").put("typ", "JWT").toString().getBytes(StandardCharsets.UTF_8))
        + "." + encoder.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
    var mac = javax.crypto.Mac.getInstance("HmacSHA256");
    mac.init(new javax.crypto.spec.SecretKeySpec(ISSUER.getPublic().getEncoded(), "HmacSHA256"));
    return unsigned + "." + encoder.encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
  }
  private static ObjectNode b1Claims(String role, String subject) {
    long now = Instant.now().getEpochSecond();
    return C.object().put("iss", "fixture-issuer").put("sub", subject).put("aud", "studio-guided-controller")
        .put("role", role).put("exp", now + 299).put("iat", now - 1);
  }
  private static ObjectNode b1Rehash(ObjectNode callback) {
    ObjectNode receipt = (ObjectNode) callback.path("receipt"); receipt.remove("receiptHash");
    receipt.put("receiptHash", GuidedContracts.hash(receipt)); return callback;
  }
  private SSLContext b1NoClientCertificate() throws Exception {
    var trustStore = KeyStore.getInstance("PKCS12");
    try (var input = Files.newInputStream(TEMP.resolve("trust.p12"))) { trustStore.load(input, "fixture".toCharArray()); }
    var trusts = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); trusts.init(trustStore);
    var context = SSLContext.getInstance("TLS"); context.init(null, trusts.getTrustManagers(), null); return context;
  }
  private HttpResponse<String> b1RawOutcome(String path, long fence, String body, String bearer, SSLContext tls) throws Exception {
    var builder = HttpRequest.newBuilder(URI.create("https://localhost:" + port + path)).timeout(Duration.ofSeconds(10))
        .header("X-Owner-Fence", Long.toString(fence)).header("Idempotency-Key", UUID.randomUUID().toString())
        .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
    if (bearer != null) builder.header("Authorization", "Bearer " + bearer);
    return HttpClient.newBuilder().sslContext(tls).build().send(builder.build(), HttpResponse.BodyHandlers.ofString());
  }
  /** Controller-authenticated direct runner context probe (negative only; refusal must leave the runtime unchanged). */
  private HttpResponse<String> b1RunnerContextProbe(String id, long fence, JsonNode context) throws Exception {
    refreshFixtureCredentials();
    var request = HttpRequest.newBuilder(URI.create("https://localhost:" + GUIDED_PORT + "/internal/v2/studio/guided-sessions/" + id + "/context"))
        .timeout(Duration.ofSeconds(10)).header("Authorization", "Bearer " + Files.readString(TEMP.resolve("controller.jwt")).strip())
        .header("X-Owner-Fence", Long.toString(fence)).header("Idempotency-Key", UUID.randomUUID().toString())
        .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(context.toString())).build();
    return HttpClient.newBuilder().sslContext(TLS).build().send(request, HttpResponse.BodyHandlers.ofString());
  }
  private void b1ReplacementContinue() throws Exception {
    refreshFixtureCredentials();
    new com.citi.put.checks.studio.guided.translation.GuidedTranslationCoordinator(
        plans, sessions, C, URI.create("https://localhost:" + port), TEMP.resolve("coordinator.jwt")).continueRuns();
  }
  private List<JsonNode> b1Native(String id) throws Exception {
    return Files.readAllLines(TEMP.resolve("obs015-native-events.jsonl")).stream().filter(l -> !l.isBlank()).map(C::parse)
        .filter(e -> e.path("sessionId").asText().equals(id)).toList();
  }
  private long b1NativeCount(String id, String admission, String phase) throws Exception {
    return b1Native(id).stream().filter(e -> e.path("admissionId").asText().equals(admission) && e.path("phase").asText().equals(phase)).count();
  }
  private String b1ActionsAt(String id, int stepIndex, int ordinal) {
    return jdbc.queryForObject("SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY attempt_ordinal),'[]'::jsonb)::text FROM studio_guided_actions a"
        + " WHERE session_id=? AND step_id=? AND ordinal=?", String.class, id, INCREMENTAL_STEPS.get(stepIndex), ordinal);
  }
  private void b1AssertNeverDrift(String id) {
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=?", Integer.class, id)).isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", Integer.class, id)).isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=? AND status='DRIFT'", Integer.class, id)).isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND (attempt_ordinal<>0"
        + " OR document->>'outcomeCode'='TARGET_CHANGED')", Integer.class, id)).isZero();
  }
  private JsonNode b1AwaitTerminal(String id, Duration limit) throws Exception {
    long end = System.nanoTime() + limit.toNanos(); String state;
    do { state = sessions.transaction(() -> sessions.lock(id).document().path("state").asText());
      if (List.of("FAILED", "UNKNOWN_OUTCOME", "CANCELLED", "EXPIRED").contains(state)) break; Thread.sleep(25);
    } while (System.nanoTime() < end);
    return publicCall("/api/v1/studio/guided-sessions/" + id + "/result", null, 200, null);
  }
  private void b1AwaitRow(String sql, String id, Duration limit) throws Exception {
    long end = System.nanoTime() + limit.toNanos();
    while (jdbc.queryForObject(sql, Integer.class, id) == 0) { assertThat(System.nanoTime()).as(sql).isLessThan(end); Thread.sleep(20); }
  }
  private JsonNode b1AwaitQuestion(String id) throws Exception {
    long end = System.nanoTime() + Duration.ofSeconds(45).toNanos();
    while (!sessions.transaction(() -> sessions.lock(id).document().path("state").asText()).equals("AWAITING_CLARIFICATION")) {
      assertThat(System.nanoTime()).isLessThan(end); Thread.sleep(25);
    }
    return publicCall("/api/v1/studio/guided-sessions/" + id + "/clarification", null, 200, null);
  }
  private static ObjectNode b1Answer(JsonNode question) {
    return C.object().put("schemaVersion", 3).put("clarificationId", question.path("clarificationId").asText())
        .put("generation", question.path("generation").asInt()).put("choiceId", question.path("choices").get(0).path("choiceId").asText());
  }
  private long b1AuditRefusals(String id, String reason) {
    return AUDIT_EVENTS.list.stream().filter(e -> "GUIDED_ACTION_REFUSED".equals(e.getMessage()))
        .map(e -> java.util.Arrays.toString(e.getArgumentArray())).filter(a -> a.contains(id) && a.contains(reason)).count();
  }
```

---

## 4. Lawfulness of each instrument (invariant check)

| Invariant | How these designs comply |
|---|---|
| No fabricated timing ties | No timing stamp is read, written, rounded or compared for equality. Row 85 is untouched. |
| No duplicate native effects | Each recovery row asserts exactly one `NATIVE_COMPLETED` per admission and `v2-consume` rows == 1. A held `WonConsumption` sender is released only once, after the runtime is confirmed stopped. |
| No coarsened clocks | Lease expiry waits on the real DB `clock_timestamp()` and Java `Instant.now()`. There is no SQL timestamp rewrite and no tolerance. |
| No retry of original04 UNKNOWN admissions | Nothing reads, resends or reuses earlier receipts or admissions. The DISPATCHING row proves that recovery marks UNKNOWN without resending. |
| No silent lower authority | Pure-tier companions (builder over substituted copies in B1B-04) are labelled as substitutions. They do not replace the HTTP/PG rows. Unreachable clauses are listed in §6, not replaced. |
| Authentic credentials only for negatives | Forged-body probes use the fixture-issued worker/controller credentials and expect refusal. The only accepted callbacks are the runner's own, or exact byte duplicates of it (B1B-02 concurrency subject). |

---

## 5. Method designs

Abbreviations: `S(i)` = `INCREMENTAL_STEPS.get(i)`; "zero writes" = `incrementalPendingSnapshot(id)` and
`incrementalImmutableSnapshot(id)` unchanged; model0 = `MODEL_WIRE`, `LEGACY_MODEL_CALLS` and
`studio_guided_model_attempts` all unchanged.

### B1B-01 `incrementalPrefixRecoveryUsesNextUnconsumedCoordinate` (low)

Ledger 20 `IncrementalSessionIT.restartAndConcurrentDriftTransitionAreIdempotent` / tier `Java + Postgres` / assertion
"Resume next unconsumed coordinate; …". Also the OPEN matrix rows SUCCEEDED-restart, ADMITTED and DISPATCHING.
Production path: `GuidedTranslationCoordinator.continueRuns` → `/plans` → `GuidedTranslationService.plan` →
`advancePrefix` (`nextAction`, `existing` ADMITTED → `dispatch.dispatch`, existing DISPATCHING →
`sessions.lostAcknowledgment`) → `GuidedSessionService.consume` → runner dispatch. It uses three fresh edit4 parents.

| Assertion | Ledger clause / row |
|---|---|
| R1: while the 3rd scheduled `/plans` is held at entry, a replacement coordinator advances exactly the first program coordinate without a SUCCEEDED attempt0. Earlier action rows are byte-identical, there is exactly one new ISSUED→PREPARED request and one new SUCCEEDED dispatchCount1 action, and model0. | "Resume next unconsumed coordinate" |
| R1: after release, the held continuation advances the following coordinate. At the end every program coordinate has exactly one attempt0 SUCCEEDED action with dispatchCount1, one native completion and one contextId. | idempotent restart |
| R2: with A held after the real admit commit of `S(1)#0` (ADMITTED, dispatchCount0, no native), the recovery continuation re-dispatches that exact admission once. It ends SUCCEEDED dispatchCount1 with one `NATIVE_COMPLETED`. Releasing A hits the consume duplicate: still one native completion and one `v2-consume` row. | OPEN row ADMITTED |
| R3: with A held after the real consume commit (DISPATCHING), recovery marks the session `UNKNOWN_OUTCOME` and the action `UNKNOWN_OUTCOME/ACK_LOST`. Once teardown is confirmed and A's single capability is released, there are zero `NATIVE_*` events, no attempt1 and one `v2-consume` row. | OPEN row DISPATCHING; "no repeated dispatch" |

```java
  @Test
  void incrementalPrefixRecoveryUsesNextUnconsumedCoordinate() throws Exception {
    // R1 restart between continuations.
    try (var parent = b1Parent(new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible."))) {
      var cut = B1Cut.arm(B1Cut.Kind.PLANS_ENTRY, parent.id, null, null, 3);
      assertThat(cut.entered.await(45, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      assertThat(cut.failure).isNull();
      JsonNode program = sessions.transaction(() -> sessions.incremental().program(parent.id));
      JsonNode expected = sessions.transaction(() -> sessions.incremental().nextAction(parent.id));
      assertThat(expected).as("the held continuation is the only one; the next coordinate is unambiguous").isNotNull();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND document->>'state'='SUCCEEDED'",
          Integer.class, parent.id)).as("a non-trivial restart point").isPositive();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND document->>'state' IN ('ADMITTED','DISPATCHING')",
          Integer.class, parent.id)).isZero();
      String before = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY step_id,ordinal,attempt_ordinal)::text FROM studio_guided_actions a WHERE session_id=?", String.class, parent.id);
      int requests = jdbc.queryForObject("SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=?", Integer.class, parent.id);
      int model = MODEL_WIRE.size(), legacy = LEGACY_MODEL_CALLS.get();
      b1ReplacementContinue();
      var rows = sessions.transaction(() -> sessions.actions(parent.id));
      var added = rows.stream().filter(a -> !before.contains(a.path("admission").path("admissionId").asText())).toList();
      assertThat(added).hasSize(1);
      assertThat(added.getFirst().path("coordinate")).isEqualTo(expected.path("coordinate"));
      assertThat(added.getFirst().path("state").asText()).isEqualTo("SUCCEEDED");
      assertThat(added.getFirst().path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(added.getFirst().path("attemptOrdinal").asInt()).isZero();
      assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY step_id,ordinal,attempt_ordinal)::text FROM studio_guided_actions a"
          + " WHERE session_id=? AND admission_id<>?", String.class, parent.id, added.getFirst().path("admission").path("admissionId").asText()))
          .as("earlier coordinates are never re-dispatched or rewritten").isEqualTo(before);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=?", Integer.class, parent.id)).isEqualTo(requests + 1);
      assertThat(MODEL_WIRE).hasSize(model); assertThat(LEGACY_MODEL_CALLS.get()).isEqualTo(legacy);
      cut.release.countDown();
      b1AwaitRow("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", parent.id, Duration.ofSeconds(60));
      for (JsonNode action : program.path("actions")) {
        var same = sessions.transaction(() -> sessions.actions(parent.id)).stream()
            .filter(a -> a.path("coordinate").equals(action.path("coordinate"))).toList();
        assertThat(same).hasSize(1);
        assertThat(same.getFirst().path("state").asText()).isEqualTo("SUCCEEDED");
        assertThat(same.getFirst().path("dispatchCount").asInt()).isEqualTo(1);
        assertThat(same.getFirst().path("operationHash")).isEqualTo(action.path("operationHash"));
      }
      assertThat(sessions.transaction(() -> sessions.actions(parent.id)).stream()
          .map(a -> a.path("executionEvidence").path("contextId").asText()).distinct().toList()).hasSize(1);
      assertThat(cut.failure).isNull();
    }
    // R2 existing ADMITTED: real admit committed, consume not yet entered.
    try (var parent = b1Parent(new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible.").nativeMode("b1b-recover", 1, 0))) {
      var cut = B1Cut.arm(B1Cut.Kind.ADMIT_COMMIT, parent.id, C.object().put("stepId", S(1)).put("ordinal", 0), null, 0);
      assertThat(cut.entered.await(45, java.util.concurrent.TimeUnit.SECONDS)).isTrue(); assertThat(cut.failure).isNull();
      String admission = cut.admissionId;
      JsonNode admitted = sessions.transaction(() -> sessions.actions(parent.id)).stream()
          .filter(a -> a.path("admission").path("admissionId").asText().equals(admission)).findFirst().orElseThrow();
      assertThat(admitted.path("state").asText()).isEqualTo("ADMITTED");
      assertThat(admitted.path("dispatchCount").asInt()).isZero();
      assertThat(b1Native(parent.id).stream().filter(e -> e.path("admissionId").asText().equals(admission)).toList()).isEmpty();
      int effects = RECEIPTS.size();
      b1ReplacementContinue(); // recovery: advancePrefix existing ADMITTED -> dispatch.dispatch
      JsonNode recovered = sessions.transaction(() -> sessions.actions(parent.id)).stream()
          .filter(a -> a.path("admission").path("admissionId").asText().equals(admission)).findFirst().orElseThrow();
      assertThat(recovered.path("state").asText()).isEqualTo("SUCCEEDED");
      assertThat(recovered.path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(b1NativeCount(parent.id, admission, "NATIVE_COMPLETED")).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='v2-consume'"
          + " AND idempotency_key=?", Integer.class, parent.id, "prefix-dispatch-" + recovered.path("idempotencyKey").asText())).isEqualTo(1);
      cut.release.countDown(); // original sender: same key/digest -> AlreadyConsumed, no runner send
      long end = System.nanoTime() + Duration.ofSeconds(20).toNanos();
      while (jdbc.queryForObject("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", Integer.class, parent.id) == 0
          && System.nanoTime() < end) Thread.sleep(20);
      assertThat(b1NativeCount(parent.id, admission, "NATIVE_COMPLETED")).isEqualTo(1);
      assertThat(b1NativeCount(parent.id, admission, "DISPATCH_ENTER")).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='v2-consume'"
          + " AND idempotency_key=?", Integer.class, parent.id, "prefix-dispatch-" + recovered.path("idempotencyKey").asText())).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND attempt_ordinal=1", Integer.class, parent.id)).isZero();
      assertThat(RECEIPTS.size()).isEqualTo(effects); // a fill is not a submit
    }
    // R3 existing DISPATCHING: real consume committed, transport send not yet started.
    try (var parent = b1Parent(new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible.").nativeMode("b1b-recover", 1, 0))) {
      var cut = B1Cut.arm(B1Cut.Kind.CONSUME_COMMIT, parent.id, C.object().put("stepId", S(1)).put("ordinal", 0), null, 0);
      assertThat(cut.entered.await(45, java.util.concurrent.TimeUnit.SECONDS)).isTrue(); assertThat(cut.failure).isNull();
      String admission = cut.admissionId;
      assertThat(cut.ledgerState).isEqualTo("DISPATCHING");
      b1ReplacementContinue(); // recovery: advancePrefix existing DISPATCHING -> lostAcknowledgment
      assertThat(parent.state()).isEqualTo("UNKNOWN_OUTCOME");
      p3AwaitTeardown(parent.id); // the runtime is stopped before the single held capability is released
      cut.release.countDown();
      Thread.sleep(2000); // bounded wait for the original sender to reach its refused transport
      JsonNode action = sessions.transaction(() -> sessions.actions(parent.id)).stream()
          .filter(a -> a.path("admission").path("admissionId").asText().equals(admission)).findFirst().orElseThrow();
      assertThat(action.path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
      assertThat(action.path("outcomeCode").asText()).isEqualTo("ACK_LOST");
      assertThat(action.path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(b1Native(parent.id).stream().filter(e -> e.path("admissionId").asText().equals(admission)
          && e.path("phase").asText().startsWith("NATIVE_")).toList()).as("no native effect, no resend").isEmpty();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='v2-consume'", Integer.class, parent.id))
          .isEqualTo(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND (document->>'dispatchCount')::int=1", Integer.class, parent.id));
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND attempt_ordinal=1", Integer.class, parent.id)).isZero();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=?", Integer.class, parent.id)).isZero();
    }
  }
```

(`S(i)` stands for `INCREMENTAL_STEPS.get(i)`. Add `private static String S(int i) { return INCREMENTAL_STEPS.get(i); }`
or inline it. Native mode `"b1b-recover"` is not in the inject list, so the observer only records events.)

### B1B-02 `incrementalConcurrentAuthenticatedDriftCommitsOneSwitch` (low; red until D1 is fixed)

Ledger 20 / "concurrent duplicate transition has one effective j, one source plan reservation, no repeated dispatch".
Production path: the runner's PRE_ADMISSION receipt (DOM `drift-auth-pre`: textarea becomes input) → `/outcomes` →
`outcomeV2` → `prefixDrift` → `incremental.receipt` + `switchToLearning("DRIFT")` under the session row lock.

The authentic callback is held at the existing `/obs015-drift` hook (runner awaiting). Four exact byte duplicates are
posted concurrently with the authentic worker JWT, mTLS and distinct idempotency keys. Then the runner's own callback
is released.

| Assertion | Ledger clause |
|---|---|
| All five deliveries return 202. Exactly one receipt row and exactly one switch row (`DRIFT`, `effective_step_index=1`, `next_ordinal=0`, `drift_receipt_hash` = authentic hash). | "one effective j" |
| Exactly one SOURCE_PLAN model attempt row, one distinct SOURCE_PLAN request_id, and no attempt before the switch | "one source plan reservation" |
| Prefix `S(0)` actions are unchanged (2 rows, dispatchCount1). `S(1)#0` has exactly one attempt0 action after the switch with one `NATIVE_COMPLETED`, and no attempt1. | "no repeated dispatch" |
| `result.relearnedFrom == {stepId:S(1), driftSwitchStepId:S(1)}` | entered j |

```java
  @Test
  void incrementalConcurrentAuthenticatedDriftCommitsOneSwitch() throws Exception {
    try (var parent = b1Parent(new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible.")
        .mixedDom("drift-auth-pre").nativeMode("drift-auth-pre", 1, 0))) {
      long until = System.nanoTime() + Duration.ofSeconds(30).toNanos();
      while (!INCREMENTAL_DRIFT_CAPTURE.containsKey(parent.id)) { assertThat(System.nanoTime()).isLessThan(until); Thread.sleep(10); }
      ObjectNode authentic = INCREMENTAL_DRIFT_CAPTURE.get(parent.id);
      assertThat(authentic.path("receipt").path("phase").asText()).isEqualTo("PRE_ADMISSION");
      String prefixBefore = b1ActionsAt(parent.id, 0, 0) + b1ActionsAt(parent.id, 0, 1);
      long fence = authentic.path("receipt").path("ownerFence").asLong();
      String worker = token("owning-worker", "worker-1", "studio-guided-controller");
      var go = new java.util.concurrent.CountDownLatch(1);
      try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
        var replies = new ArrayList<java.util.concurrent.Future<HttpResponse<String>>>();
        for (int i = 0; i < 4; i++) replies.add(pool.submit(() -> { go.await(); return incrementalDriftProbe(parent.id, fence, authentic, worker, TLS); }));
        go.countDown();
        for (var reply : replies) assertThat(reply.get(20, java.util.concurrent.TimeUnit.SECONDS).statusCode()).isEqualTo(202);
      }
      INCREMENTAL_ACK_RELEASE.get(parent.id).countDown(); // the runner's own callback is the fifth delivery
      awaitFinalizing(parent.id);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=?", Integer.class, parent.id)).isEqualTo(1);
      var switched = jdbc.queryForMap("SELECT reason,effective_step_index,next_ordinal,drift_receipt_hash FROM studio_guided_relearn_switches WHERE session_id=?", parent.id);
      assertThat(switched.get("reason")).isEqualTo("DRIFT");
      assertThat(((Number) switched.get("effective_step_index")).intValue()).isEqualTo(1);
      assertThat(((Number) switched.get("next_ordinal")).intValue()).isZero();
      assertThat(switched.get("drift_receipt_hash")).isEqualTo(authentic.path("receipt").path("receiptHash").asText());
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND kind='SOURCE_PLAN'", Integer.class, parent.id)).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(DISTINCT request_id) FROM studio_guided_model_attempts WHERE session_id=? AND kind='SOURCE_PLAN'", Integer.class, parent.id)).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts m JOIN studio_guided_relearn_switches s USING(session_id)"
          + " WHERE m.session_id=? AND m.created_at<s.created_at", Integer.class, parent.id)).isZero();
      assertThat(b1ActionsAt(parent.id, 0, 0) + b1ActionsAt(parent.id, 0, 1)).isEqualTo(prefixBefore);
      var fill = sessions.transaction(() -> sessions.actions(parent.id)).stream()
          .filter(a -> a.path("coordinate").path("stepId").asText().equals(S(1)) && a.path("coordinate").path("ordinal").asInt() == 0).toList();
      assertThat(fill).hasSize(1);
      assertThat(fill.getFirst().path("attemptOrdinal").asInt()).isZero();
      assertThat(fill.getFirst().path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(b1NativeCount(parent.id, fill.getFirst().path("admission").path("admissionId").asText(), "NATIVE_COMPLETED")).isEqualTo(1);
      JsonNode result = publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/result", null, 200, null);
      assertThat(result.path("relearnedFrom")).isEqualTo(C.object().put("stepId", S(1)).put("driftSwitchStepId", S(1)));
    }
  }
```

### B1B-03 `incrementalDriftAuthorityRejectsEveryExactJoin` (low; positive rows red until D1)

Ledger 48 `IncrementalDriftIT.preAdmissionAndAdmittedReceiptsUseAuthenticatedAuthority` / tier
"HTTP+Postgres+real runner fault seam". Also ledger 54 callback-tier joins ("mismatched
worker/fence/context/version/request/operation/preparation/admission/evidence refuse").

The exact codes below come from a static trace of `IdentityFilter` → `GuidedInternalController.currentContract` →
`prefixDrift` (schema → role → path → owner/fence → duplicate → active → lease → `verify` → state/pending →
ADMITTED ledger checks → receiptHash → V21 `studio_015_no_invocation_guard`, whose DataAccessException maps to 409
`UNKNOWN_OUTCOME` via `GuidedInternalController.unexpected`). Assert the **exact** status and code. A first-run
mismatch is a finding to review, not a reason to widen to a set.

Parents:
- **A**: ADMITTED. Native mode `drift-auth`, so the observer injects `matches=false` at dispatch of `S(1)#0`.
  Forged matrix (must finish within 12 s, below the unchanged 15 s dispatch deadline) → release the runner callback →
  positive commit → late rows.
- **B**: PRE_ADMISSION. Mode `drift-auth-pre`, PRE-specific forgeries → positive.
- **C**: late terminal. PRE held → public cancel → authentic body → 409 CANCELLED.
- **D**: natural ownership change. PRE held → worker stall → natural lease expiry → authentic body → 409 STALE_FENCE.

Probe table (`f` = forge one field then `b1Rehash`; `nr` = forge without rehash):

| Row | Mutation | Expected | Clause |
|---|---|---|---|
| no-mtls | worker JWT, no client cert | 401 UNAUTHENTICATED | "mTLS required" |
| no-auth | no `Authorization` | 401 | "owning-worker required" |
| alg-hs256 | header `HS256`, RS256 signature | 401 | algorithm substitution |
| alg-hs256-hmac | header `HS256`, **re-signed HMAC-SHA256 keyed with the deployed public key's encoded bytes** (classic RS→HS confusion), exact original body | 401 | algorithm substitution (B3 route 10) |
| no-auth-no-cert | no `Authorization`, no client cert, exact original body with its valid `receiptHash` | 401 | hash is not transport authentication (B3 route 9) |
| wrong-assignment-path | exact original body posted to another existing session's route (`base`) | 422 INVALID_CONTRACT | wrong assignment (B3 route 14) |
| wrong-assignment-receipt | receipt `sessionId` → `base` (rehashed), posted to this session's route | 422 INVALID_CONTRACT | wrong assignment (B3 route 14) |
| alg-none-sig | header `none`, junk signature | 401 | algorithm substitution |
| expired | `exp=iat=now-400` (signed) | 401 | token authority |
| aud | `aud=studio-runner` | 401 | token authority |
| role-controller | valid backend-controller JWT | 403 FORBIDDEN_SCOPE | "callback owning-worker" |
| other-worker | owning-worker sub `other-worker` | 403 FORBIDDEN_SCOPE | worker |
| fence+1 | header fence+1 | 403 FORBIDDEN_SCOPE | fence |
| cross-session | authentic body to the base session path | 422 INVALID_CONTRACT | assignment/session |
| schemaVersion | receipt.schemaVersion=2 | 409 RUNTIME_INCOMPATIBLE | contract generation |
| model-claims | callback `modelClaims:{}` | 422 INVALID_CONTRACT | "model claims reject" |
| native-started | f `nativeInvocationStarted=true` | 422 | "no-native fence" |
| attempt1 | f `attemptOrdinal=1` | 422 | no-native fence |
| hash | nr `receiptHash=0…` | 409 EVIDENCE_MISMATCH | "forged hash" |
| worker-field | f `workerId=foreign-worker` | 409 STALE_FENCE | worker join |
| fence-field | f `ownerFence+1` | 409 STALE_FENCE | fence join |
| scope | f `scopeHash=0…` | 409 STALE_FENCE | identity |
| context | f `contextId=foreign` | 409 STALE_FENCE | context join |
| version | f `contextRevision+1` | 409 STALE_FENCE | version join |
| source/config | f `sourceRevision=999` / `configurationRevision=999` | 409 STALE_FENCE ×2 | source/config |
| request | f `requestDigest=0…` | 409 UNKNOWN_OUTCOME (V21 guard) | request join |
| operation | f `operationHash=0…` | 409 UNKNOWN_OUTCOME | operation join |
| evidence | f `evidenceHash=0…` | 409 UNKNOWN_OUTCOME | evidence join |
| inputs/program | f `authoredInputsHash`, `prefixProgramHash` = 0… | 409 UNKNOWN_OUTCOME ×2 | version/program |
| A: crossed-prep | f `preparationId`= the S(0)#1 read preparation | 409 EVIDENCE_MISMATCH | "exact spent prep" |
| A: crossed-adm | f `admissionId`= S(0)#1 admission | 409 IDEMPOTENCY_CONFLICT (`verifyReportBody`) | admission join |
| A: ledger-state | ledger state SUCCEEDED/OK | 409 EVIDENCE_MISMATCH | ADMITTED exact |
| A: null-ledger | ledger null | 422 | ADMITTED requires ledger |
| B: pre-with-ledger | PRE plus a ledger object | 422 | "PRE_ADMISSION … callback" |
| B: pre-admission-id | f PRE `admissionId=x` | 422 | no invented PRE action |
| positive | release the runner callback | one receipt and one switch committed | authority accepted only via callback |
| late-identical | authentic body again, new key | 202, zero new rows | late duplicate inert |
| late-different | f `reason=LOCATOR_AMBIGUOUS` | 409 IDEMPOTENCY_CONFLICT | "late callbacks reject" |
| C: after-cancel | authentic body after public cancel | 409 CANCELLED | late terminal |
| D: after-natural-expiry | authentic body, stalled owner past its lease | 409 STALE_FENCE | natural ownership change |

After every negative row: zero writes, 0 receipt rows, 0 switch rows, model0. Ordering proof for "PRE_ADMISSION
direct response alone insufficient" (parent B): while the authentic callback is held, the request stays `ISSUED`, the
session stays `REPLAYING_PREFIX`, and there is no receipt or switch, even across the coordinator's re-issued prepare of
the same digest. The receipt and switch exist only after the callback commits. The literal negative is in §6.

```java
  @Test
  void incrementalDriftAuthorityRejectsEveryExactJoin() throws Exception {
    for (String phase : List.of("ADMITTED", "PRE")) {
      boolean admitted = phase.equals("ADMITTED");
      var spec = new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible.");
      if (admitted) spec.nativeMode("drift-auth", 1, 0); else spec.mixedDom("drift-auth-pre").nativeMode("drift-auth-pre", 1, 0);
      try (var parent = b1Parent(spec)) {
        ObjectNode authentic = b1AwaitDriftCapture(parent.id);
        long started = System.nanoTime();
        assertThat(authentic.path("receipt").path("phase").asText()).isEqualTo(admitted ? "ADMITTED_PRE_INVOCATION" : "PRE_ADMISSION");
        long fence = authentic.path("receipt").path("ownerFence").asLong();
        String path = "/internal/v2/studio/guided-sessions/" + parent.id + "/outcomes";
        String worker = token("owning-worker", "worker-1", "studio-guided-controller");
        String pending = incrementalPendingSnapshot(parent.id), immutable = incrementalImmutableSnapshot(parent.id);
        int model = MODEL_WIRE.size();
        var rows = new java.util.LinkedHashMap<String, Object[]>(); // label -> {body, bearer, tls, fence, path, status, code}
        rows.put("no-mtls", new Object[] {authentic, worker, b1NoClientCertificate(), fence, path, 401, "UNAUTHENTICATED"});
        rows.put("no-auth", new Object[] {authentic, null, TLS, fence, path, 401, "UNAUTHENTICATED"});
        rows.put("alg-hs256", new Object[] {authentic, b1Token(b1Claims("owning-worker", "worker-1"), "HS256", true), TLS, fence, path, 401, "UNAUTHENTICATED"});
        rows.put("alg-none-sig", new Object[] {authentic, b1Token(b1Claims("owning-worker", "worker-1"), "none", false), TLS, fence, path, 401, "UNAUTHENTICATED"});
        long now = Instant.now().getEpochSecond();
        rows.put("expired", new Object[] {authentic, b1Token(b1Claims("owning-worker", "worker-1").put("iat", now - 400).put("exp", now - 200), "RS256", true), TLS, fence, path, 401, "UNAUTHENTICATED"});
        rows.put("aud", new Object[] {authentic, b1Token(b1Claims("owning-worker", "worker-1").put("aud", "studio-runner"), "RS256", true), TLS, fence, path, 401, "UNAUTHENTICATED"});
        rows.put("role-controller", new Object[] {authentic, token("backend-controller", "controller-1", "studio-guided-controller"), TLS, fence, path, 403, "FORBIDDEN_SCOPE"});
        rows.put("other-worker", new Object[] {authentic, token("owning-worker", "other-worker", "studio-guided-controller"), TLS, fence, path, 403, "FORBIDDEN_SCOPE"});
        rows.put("fence+1", new Object[] {authentic, worker, TLS, fence + 1, path, 403, "FORBIDDEN_SCOPE"});
        rows.put("cross-session", new Object[] {authentic, worker, TLS, fence, "/internal/v2/studio/guided-sessions/" + parent.base + "/outcomes", 422, "INVALID_CONTRACT"});
        // B3 routes 9/10/14 (assigned to B1): exact original body, transport/assignment varied only.
        rows.put("alg-hs256-hmac", new Object[] {authentic, b1HmacConfusionToken(b1Claims("owning-worker", "worker-1")), TLS, fence, path, 401, "UNAUTHENTICATED"});
        rows.put("no-auth-no-cert", new Object[] {authentic, null, b1NoClientCertificate(), fence, path, 401, "UNAUTHENTICATED"});
        rows.put("wrong-assignment-path", rows.get("cross-session").clone());
        ObjectNode otherAssignment = authentic.deepCopy(); ((ObjectNode) otherAssignment.path("receipt")).put("sessionId", parent.base);
        rows.put("wrong-assignment-receipt", new Object[] {b1Rehash(otherAssignment), worker, TLS, fence, path, 422, "INVALID_CONTRACT"});
        java.util.function.BiFunction<String, JsonNode, ObjectNode> f = (field, value) -> {
          ObjectNode copy = authentic.deepCopy(); ((ObjectNode) copy.path("receipt")).set(field, value); return b1Rehash(copy); };
        var text = JSON.getNodeFactory();
        ObjectNode schema = authentic.deepCopy(); ((ObjectNode) schema.path("receipt")).put("schemaVersion", 2);
        rows.put("schemaVersion", new Object[] {schema, worker, TLS, fence, path, 409, "RUNTIME_INCOMPATIBLE"});
        rows.put("model-claims", new Object[] {authentic.deepCopy().set("modelClaims", C.object()), worker, TLS, fence, path, 422, "INVALID_CONTRACT"});
        rows.put("native-started", new Object[] {f.apply("nativeInvocationStarted", text.booleanNode(true)), worker, TLS, fence, path, 422, "INVALID_CONTRACT"});
        rows.put("attempt1", new Object[] {f.apply("attemptOrdinal", text.numberNode(1)), worker, TLS, fence, path, 422, "INVALID_CONTRACT"});
        ObjectNode hash = authentic.deepCopy(); ((ObjectNode) hash.path("receipt")).put("receiptHash", "0".repeat(64));
        rows.put("hash", new Object[] {hash, worker, TLS, fence, path, 409, "EVIDENCE_MISMATCH"});
        rows.put("worker-field", new Object[] {f.apply("workerId", text.textNode("foreign-worker")), worker, TLS, fence, path, 409, "STALE_FENCE"});
        rows.put("fence-field", new Object[] {f.apply("ownerFence", text.numberNode(fence + 1)), worker, TLS, fence, path, 409, "STALE_FENCE"});
        rows.put("scope", new Object[] {f.apply("scopeHash", text.textNode("0".repeat(64))), worker, TLS, fence, path, 409, "STALE_FENCE"});
        rows.put("context", new Object[] {f.apply("contextId", text.textNode("foreign-context")), worker, TLS, fence, path, 409, "STALE_FENCE"});
        rows.put("version", new Object[] {f.apply("contextRevision", text.numberNode(authentic.path("receipt").path("contextRevision").asInt() + 1)), worker, TLS, fence, path, 409, "STALE_FENCE"});
        rows.put("source", new Object[] {f.apply("sourceRevision", text.textNode("999")), worker, TLS, fence, path, 409, "STALE_FENCE"});
        rows.put("config", new Object[] {f.apply("configurationRevision", text.textNode("999")), worker, TLS, fence, path, 409, "STALE_FENCE"});
        for (String field : List.of("requestDigest", "operationHash", "evidenceHash", "authoredInputsHash", "prefixProgramHash"))
          rows.put(field, new Object[] {f.apply(field, text.textNode("0".repeat(64))), worker, TLS, fence, path, 409, "UNKNOWN_OUTCOME"});
        String readAdmission = jdbc.queryForObject("SELECT admission_id FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=1", String.class, parent.id, S(0));
        String readPreparation = jdbc.queryForObject("SELECT document->>'preparationId' FROM studio_guided_actions WHERE session_id=? AND admission_id=?", String.class, parent.id, readAdmission);
        if (admitted) {
          rows.put("crossed-prep", new Object[] {f.apply("preparationId", text.textNode(readPreparation)), worker, TLS, fence, path, 409, "EVIDENCE_MISMATCH"});
          rows.put("crossed-adm", new Object[] {f.apply("admissionId", text.textNode(readAdmission)), worker, TLS, fence, path, 409, "IDEMPOTENCY_CONFLICT"});
          ObjectNode succeeded = authentic.deepCopy(); ((ObjectNode) succeeded.path("ledger")).put("state", "SUCCEEDED").put("outcomeCode", "OK");
          rows.put("ledger-state", new Object[] {succeeded, worker, TLS, fence, path, 409, "EVIDENCE_MISMATCH"});
          ObjectNode nullLedger = authentic.deepCopy(); nullLedger.putNull("ledger");
          rows.put("null-ledger", new Object[] {nullLedger, worker, TLS, fence, path, 422, "INVALID_CONTRACT"});
        } else {
          rows.put("pre-with-ledger", new Object[] {authentic.deepCopy().set("ledger", C.object().put("state", "FAILED")), worker, TLS, fence, path, 422, "INVALID_CONTRACT"});
          rows.put("pre-admission-id", new Object[] {f.apply("admissionId", text.textNode(readAdmission)), worker, TLS, fence, path, 422, "INVALID_CONTRACT"});
        }
        for (var row : rows.entrySet()) {
          Object[] r = row.getValue();
          var reply = b1RawOutcome((String) r[4], (Long) r[3], r[0].toString(), (String) r[1], (SSLContext) r[2]);
          assertThat(reply.statusCode()).as(row.getKey()).isEqualTo((Integer) r[5]);
          assertThat(C.parse(reply.body()).path("code").asText()).as(row.getKey()).isEqualTo((String) r[6]);
          assertThat(incrementalPendingSnapshot(parent.id)).as(row.getKey()).isEqualTo(pending);
          assertThat(incrementalImmutableSnapshot(parent.id)).as(row.getKey()).isEqualTo(immutable);
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=?", Integer.class, parent.id)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM studio_guided_prefix_requests WHERE session_id=? AND request_digest=?", String.class,
            parent.id, authentic.path("receipt").path("requestDigest").asText())).isEqualTo(admitted ? "PREPARED" : "ISSUED");
        assertThat(parent.state()).isEqualTo("REPLAYING_PREFIX");
        assertThat(MODEL_WIRE).hasSize(model);
        assertThat(System.nanoTime() - started).as("released inside the unchanged 15s transport deadline").isLessThan(Duration.ofSeconds(12).toNanos());
        INCREMENTAL_ACK_RELEASE.get(parent.id).countDown(); // positive: the runner's own authenticated callback
        b1AwaitRow("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", parent.id, Duration.ofSeconds(20));
        assertThat(jdbc.queryForObject("SELECT receipt_hash FROM studio_guided_no_invocation_receipts WHERE session_id=?", String.class, parent.id))
            .isEqualTo(authentic.path("receipt").path("receiptHash").asText());
        String committed = incrementalImmutableSnapshot(parent.id) + b1ActionsAt(parent.id, 1, 0);
        int receipts = 1, switches = 1;
        var identical = b1RawOutcome(path, fence, authentic.toString(), worker, TLS);
        assertThat(identical.statusCode()).isEqualTo(202);
        var different = b1RawOutcome(path, fence, f.apply("reason", text.textNode("LOCATOR_AMBIGUOUS")).toString(), worker, TLS);
        assertThat(different.statusCode()).isEqualTo(409); assertThat(C.parse(different.body()).path("code").asText()).isEqualTo("IDEMPOTENCY_CONFLICT");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=?", Integer.class, parent.id)).isEqualTo(receipts);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", Integer.class, parent.id)).isEqualTo(switches);
        if (admitted) {
          JsonNode spent = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0 AND attempt_ordinal=0", String.class, parent.id, S(1)));
          assertThat(spent.path("state").asText()).isEqualTo("FAILED"); assertThat(spent.path("outcomeCode").asText()).isEqualTo("TARGET_CHANGED");
          assertThat(spent.path("dispatchCount").asInt()).isEqualTo(1);
          assertThat(spent.path("preparationId")).isEqualTo(authentic.path("receipt").path("preparationId"));
          assertThat(b1NativeCount(parent.id, spent.path("admission").path("admissionId").asText(), "NATIVE_ENTER")).isZero();
        }
        assertThat(committed).isNotBlank();
      }
    }
    for (String late : List.of("CANCEL", "EXPIRY")) {
      try (var parent = b1Parent(new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible.")
          .mixedDom("drift-auth-pre").nativeMode("drift-auth-pre", 1, 0))) {
        ObjectNode authentic = b1AwaitDriftCapture(parent.id);
        long fence = authentic.path("receipt").path("ownerFence").asLong();
        String path = "/internal/v2/studio/guided-sessions/" + parent.id + "/outcomes";
        String expected;
        if (late.equals("CANCEL")) {
          parent.cancel(); expected = "CANCELLED";
        } else {
          b1StallWorker(); b1AwaitNaturalLeaseExpiry(parent.id); expected = "STALE_FENCE";
        }
        refreshFixtureCredentials();
        var reply = b1RawOutcome(path, fence, authentic.toString(), token("owning-worker", "worker-1", "studio-guided-controller"), TLS);
        assertThat(reply.statusCode()).as(late).isEqualTo(409);
        assertThat(C.parse(reply.body()).path("code").asText()).as(late).isEqualTo(expected);
        b1ResumeWorker();
        INCREMENTAL_ACK_RELEASE.get(parent.id).countDown();
        Thread.sleep(1500);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_no_invocation_receipts WHERE session_id=?", Integer.class, parent.id)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", Integer.class, parent.id)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=?", Integer.class, parent.id)).isZero();
      }
    }
  }

  private ObjectNode b1AwaitDriftCapture(String id) throws Exception {
    long until = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (!INCREMENTAL_DRIFT_CAPTURE.containsKey(id)) { assertThat(System.nanoTime()).isLessThan(until); Thread.sleep(10); }
    return INCREMENTAL_DRIFT_CAPTURE.get(id);
  }
```

### B1B-04 `incrementalExcludedAttemptCannotHideOtherUnsettledActions` (low; red until D1)

Ledger 54 `IncrementalPublicationIT.excludedAttemptRequiresEveryExactAuthenticatedJoin` / tier
"HTTP+Postgres+pure runner". One ADMITTED drift parent (mode `drift-auth`, no probes) runs to `FINALIZING`. The real
`GuidedPlanBuilder.basis` then runs over the real `GuidedPublicationBaseRepository.find` / `lockCurrent` /
`GuidedPublicationEvidenceRepository.read` rows, first positive and then on **disclosed substituted copies** (pure-tier
companions; the stored rows are never touched). Public finalize follows.

| Assertion | Clause |
|---|---|
| Stored spent attempt0: FAILED, TARGET_CHANGED, dispatchCount1, its preparation equals the receipt's, `obligation_admissions` association and proposalHash joined, no native event | "excluded action FAILED TARGET_CHANGED dispatch1 attempt0 exact original preparation/obligation association and receipt identity" |
| Positive builder: `incrementalEvidence.excludedAttempts` size 1; its ledger, preparation and obligationAssociation equal the stored rows; `driftReceipt` equals the stored receipt; replacement attempt1 SUCCEEDED | same |
| Substituted receipt (+ consistent `switch.driftReceiptHash`) with one field changed among worker/fence/context/version/request/operation/preparation/admission/evidence → `EVIDENCE_MISMATCH` (9 rows) | "mismatched … refuse" |
| Receipt rewritten to PRE_ADMISSION form while the spent FAILED row remains → `EVIDENCE_MISMATCH` | "no invented spent PRE_ADMISSION action" |
| An added FAILED, UNKNOWN_OUTCOME or DISPATCHING ledger row (copies of a successful action) → `EVIDENCE_MISMATCH` ×3 | "no other omitted failed/unknown/dispatching row" |
| Public finalize 200, merged `reusedFrom` size 1, model and native counters unchanged across finalize | publication accepts only the exact join |

```java
  @Test
  void incrementalExcludedAttemptCannotHideOtherUnsettledActions() throws Exception {
    try (var parent = b1Parent(new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible.").nativeMode("drift-auth", 1, 0))) {
      b1AwaitDriftCapture(parent.id);
      INCREMENTAL_ACK_RELEASE.get(parent.id).countDown();
      awaitFinalizing(parent.id);
      JsonNode receipt = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_no_invocation_receipts WHERE session_id=?", String.class, parent.id));
      assertThat(receipt.path("phase").asText()).isEqualTo("ADMITTED_PRE_INVOCATION");
      JsonNode spent = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0 AND attempt_ordinal=0", String.class, parent.id, S(1)));
      assertThat(spent.path("state").asText()).isEqualTo("FAILED"); assertThat(spent.path("outcomeCode").asText()).isEqualTo("TARGET_CHANGED");
      assertThat(spent.path("dispatchCount").asInt()).isEqualTo(1); assertThat(spent.path("attemptOrdinal").asInt()).isZero();
      assertThat(spent.path("admission").path("admissionId")).isEqualTo(receipt.path("admissionId"));
      assertThat(spent.path("preparationId")).isEqualTo(receipt.path("preparationId"));
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_obligation_admissions WHERE session_id=? AND admission_id=? AND attempt_ordinal=0",
          Integer.class, parent.id, receipt.path("admissionId").asText())).isEqualTo(1);
      assertThat(b1NativeCount(parent.id, receipt.path("admissionId").asText(), "NATIVE_ENTER")).isZero();
      var bases = ownedApplicationContext.getBean(GuidedPublicationBaseRepository.class);
      var evidence = ownedApplicationContext.getBean(GuidedPublicationEvidenceRepository.class);
      var builder = new GuidedPlanBuilder(C);
      sessions.transaction(() -> {
        var base = bases.find(parent.id).orElseThrow();
        var current = bases.lockCurrent(parent.test);
        var raw = evidence.read(parent.id);
        JsonNode session = sessions.lock(parent.id).document();
        JsonNode provenance = builder.learningProvenance(raw.document().path("sourceManifest"));
        ObjectNode basis = builder.basis(base, current, raw, session, provenance);
        JsonNode excluded = basis.path("incrementalEvidence").path("excludedAttempts");
        assertThat(excluded).hasSize(1);
        assertThat(excluded.get(0).path("action").path("ledger")).isEqualTo(spent);
        assertThat(excluded.get(0).path("preparation").path("preparationId")).isEqualTo(receipt.path("preparationId"));
        assertThat(excluded.get(0).path("obligationAssociation").path("admissionId")).isEqualTo(receipt.path("admissionId"));
        assertThat(basis.path("incrementalEvidence").path("driftReceipt")).isEqualTo(receipt);
        // Disclosed substitution boundary: only the returned read copy is changed; stored rows stay immutable.
        java.util.function.Consumer<java.util.function.Consumer<ObjectNode>> refuses = mutation -> {
          ObjectNode copy = raw.document().deepCopy(); mutation.accept(copy);
          assertThatThrownBy(() -> builder.basis(base, current, new PublicationContracts.Evidence(copy), session, provenance))
              .isInstanceOf(GuidedSessionException.class).hasMessage("EVIDENCE_MISMATCH");
        };
        for (var entry : java.util.Map.<String, JsonNode>of("workerId", JSON.getNodeFactory().textNode("foreign-worker"),
            "ownerFence", JSON.getNodeFactory().numberNode(receipt.path("ownerFence").asInt() + 1),
            "contextId", JSON.getNodeFactory().textNode("foreign-context"),
            "contextRevision", JSON.getNodeFactory().numberNode(receipt.path("contextRevision").asInt() + 1),
            "requestDigest", JSON.getNodeFactory().textNode("0".repeat(64)), "operationHash", JSON.getNodeFactory().textNode("0".repeat(64)),
            "preparationId", JSON.getNodeFactory().textNode("foreign-preparation"), "admissionId", JSON.getNodeFactory().textNode("foreign-admission"),
            "evidenceHash", JSON.getNodeFactory().textNode("0".repeat(64))).entrySet()) {
          refuses.accept(copy -> b1SubstituteReceipt(copy, r -> r.set(entry.getKey(), entry.getValue())));
        }
        refuses.accept(copy -> b1SubstituteReceipt(copy, r -> r.put("phase", "PRE_ADMISSION").putNull("admissionId").putNull("preparationId")));
        JsonNode successful = raw.document().path("actions").get(0);
        for (String state : List.of("FAILED", "UNKNOWN_OUTCOME", "DISPATCHING")) {
          refuses.accept(copy -> {
            ObjectNode extra = successful.deepCopy().put("state", state)
                .put("outcomeCode", state.equals("DISPATCHING") ? "PENDING" : state.equals("FAILED") ? "TIMEOUT" : "ACK_LOST");
            extra.putNull("assertionPassed");
            ((com.fasterxml.jackson.databind.node.ArrayNode) copy.path("actions")).add(extra);
          });
        }
        return null;
      });
      int model = MODEL_WIRE.size(), effects = RECEIPTS.size(), navigations = NAVIGATIONS.get();
      JsonNode merged = publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/finalize",
          C.object().put("schemaVersion", 3).put("expectedSourceRevision", parent.edited.path("sourceRevision").asText())
              .put("expectedConfigurationRevision", parent.edited.path("configurationRevision").asText()), 200, UUID.randomUUID().toString());
      assertThat(MODEL_WIRE).hasSize(model); assertThat(RECEIPTS).hasSize(effects); assertThat(NAVIGATIONS.get()).isEqualTo(navigations);
      JsonNode artifact = C.parse(jdbc.queryForObject("SELECT artifact::text FROM ui_test_revisions WHERE id=?", String.class, UUID.fromString(merged.path("revisionId").asText())));
      assertThat(artifact.path("learnedPlan").path("reusedFrom")).hasSize(1);
    }
  }

  private static void b1SubstituteReceipt(ObjectNode raw, java.util.function.Consumer<ObjectNode> change) {
    ObjectNode incremental = (ObjectNode) raw.path("incrementalEvidence");
    ObjectNode receipt = (ObjectNode) incremental.path("driftReceipt");
    change.accept(receipt); receipt.remove("receiptHash"); receipt.put("receiptHash", GuidedContracts.hash(receipt));
    ((ObjectNode) incremental.path("switch")).put("driftReceiptHash", receipt.path("receiptHash").asText());
  }
```

(If `GuidedPublicationBaseRepository` is not a Spring bean here, use `new GuidedPublicationBaseRepository(jdbc, C)`,
which matches `GuidedPublicationConfiguration.publicationBases`. Raw field names (`actions`,
`incrementalEvidence.driftReceipt/switch`) are those that `GuidedPlanBuilder` 179–215/481–519 reads.)

### B1B-05 `incrementalPrefixContinuationMatrixDoneAndRefreshRows` (low)

These are the OPEN matrix rows that `advancePrefix` reaches outside recovery. Parent A: edit4. Parent B: CLARIFY_FIRST
confirm at `S(4)`, READY first = 5.

| Assertion | Row |
|---|---|
| A: the switch is `BOUNDARY`, effective = initial = 3, `next_ordinal` 0, `completed_admissions` = the attempt0 SUCCEEDED admissions in program order; `relearnedFrom == {stepId:S(3)}` | DONE-BOUNDARY (`next == null`) |
| A: continuation B committed its plan() continuation while pending and was held. After the BOUNDARY switch, releasing B gives HTTP 202 and adds no prefix request, no prefix action and no second switch. | DONE-NOT-PENDING (`!pending` at advancePrefix entry, a race-only guard) |
| B: after the answer, exactly one `observation-refresh` command with key `prefix-confirmation-<clarificationId>` and exactly one `observation-refresh-result`. Then exactly one new prefix request for `S(4)#0` at the new evidence. The Submit admission evidence ≠ the question request evidence, one native effect (RECEIPTS +1), and exactly one `STALE_GENERATION` diagnostic whose frames include `GuidedSessionService#committedRefresh` (F2) | REFRESH |

```java
  @Test
  void incrementalPrefixContinuationMatrixDoneAndRefreshRows() throws Exception {
    try (var parent = b1Parent(new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible."))) {
      var pause = B1Cut.arm(B1Cut.Kind.ADMIT_COMMIT, parent.id, C.object().put("stepId", S(2)).put("ordinal", 0), null, 0);
      assertThat(pause.entered.await(45, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      String key = "b1b-done-race-" + UUID.randomUUID();
      var held = B1Cut.arm(B1Cut.Kind.PLAN_CONTINUATION_COMMIT, parent.id, null, key, 0);
      long planRevision = plans.state(parent.id).path("planRevision").asLong();
      var command = C.object().put("schemaVersion", 3).put("sessionId", parent.id)
          .put("expectedSourceRevision", parent.edited.path("sourceRevision").asText())
          .put("expectedConfigurationRevision", parent.edited.path("configurationRevision").asText())
          .put("expectedPlanRevision", planRevision);
      try (var pool = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
        var reply = pool.submit(() -> {
          var request = HttpRequest.newBuilder(URI.create("https://localhost:" + port + "/internal/v2/studio/guided-sessions/" + parent.id + "/plans"))
              .timeout(Duration.ofSeconds(60)).header("Authorization", "Bearer " + token("backend-controller", "controller-1", "studio-guided-controller"))
              .header("X-Owner-Fence", Long.toString(parent.fence())).header("Idempotency-Key", key)
              .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(command.toString())).build();
          return HttpClient.newBuilder().sslContext(TLS).build().send(request, HttpResponse.BodyHandlers.ofString());
        });
        assertThat(held.entered.await(20, java.util.concurrent.TimeUnit.SECONDS)).as("B committed its continuation while pending").isTrue();
        assertThat(sessions.transaction(() -> sessions.incremental().pending(parent.id))).isTrue();
        pause.release.countDown();
        b1AwaitRow("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", parent.id, Duration.ofSeconds(30));
        var switched = jdbc.queryForMap("SELECT reason,effective_step_index,next_ordinal,completed_admissions::text AS done FROM studio_guided_relearn_switches WHERE session_id=?", parent.id);
        assertThat(switched.get("reason")).isEqualTo("BOUNDARY");
        assertThat(((Number) switched.get("effective_step_index")).intValue()).isEqualTo(3);
        assertThat(((Number) switched.get("next_ordinal")).intValue()).isZero();
        var expected = C.object().putArray("items");
        for (JsonNode action : sessions.transaction(() -> sessions.incremental().program(parent.id)).path("actions"))
          expected.add(jdbc.queryForObject("SELECT admission_id FROM studio_guided_actions WHERE session_id=? AND document->'coordinate'=?::jsonb AND attempt_ordinal=0",
              String.class, parent.id, action.path("coordinate").toString()));
        assertThat(C.parse((String) switched.get("done"))).isEqualTo(expected);
        int requests = jdbc.queryForObject("SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=?", Integer.class, parent.id);
        String prefixRows = jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY step_id,ordinal)::text FROM studio_guided_actions a WHERE session_id=? AND step_id IN (?,?,?)",
            String.class, parent.id, S(0), S(1), S(2));
        held.release.countDown();
        assertThat(reply.get(30, java.util.concurrent.TimeUnit.SECONDS).statusCode()).isEqualTo(202);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_prefix_requests WHERE session_id=?", Integer.class, parent.id)).isEqualTo(requests);
        assertThat(jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(a) ORDER BY step_id,ordinal)::text FROM studio_guided_actions a WHERE session_id=? AND step_id IN (?,?,?)",
            String.class, parent.id, S(0), S(1), S(2))).isEqualTo(prefixRows);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", Integer.class, parent.id)).isEqualTo(1);
        assertThat(publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/result", null, 200, null).path("relearnedFrom"))
            .isEqualTo(C.object().put("stepId", S(3)));
        assertThat(pause.failure).isNull(); assertThat(held.failure).isNull();
      }
    }
    try (var parent = b1Parent(new B1Spec().ready(5).policy("CLARIFY_FIRST", com.citi.put.checks.studio.support.ObservedPublicationFixture.DEFAULT_DESTRUCTIVE_VOCABULARY)
        .nativeMode("b1b-refresh", 4, 0))) {
      JsonNode question = b1AwaitQuestion(parent.id);
      JsonNode marker = sessions.transaction(() -> sessions.lock(parent.id).progress().path("sideEffectConfirmation").deepCopy());
      JsonNode asked = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_prefix_requests WHERE session_id=? AND request_digest=?",
          String.class, parent.id, marker.path("prefixRequestDigest").asText()));
      int diagnostics = FINALIZE_DIAGNOSTICS.get(), effects = RECEIPTS.size();
      publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/clarify", b1Answer(question), 202, UUID.randomUUID().toString());
      b1AwaitRow("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id='" + S(4) + "' AND ordinal=0 AND document->>'state'='SUCCEEDED'", parent.id, Duration.ofSeconds(45));
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='observation-refresh'", Integer.class, parent.id)).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT idempotency_key FROM studio_guided_commands WHERE namespace=? AND route='observation-refresh'", String.class, parent.id))
          .isEqualTo("prefix-confirmation-" + question.path("clarificationId").asText());
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='observation-refresh-result'", Integer.class, parent.id)).isEqualTo(1);
      var submitRequests = jdbc.queryForList("SELECT document::text FROM studio_guided_prefix_requests WHERE session_id=? AND step_id=? AND ordinal=0", String.class, parent.id, S(4));
      assertThat(submitRequests).hasSize(2);
      JsonNode submit = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0", String.class, parent.id, S(4)));
      assertThat(submit.path("evidenceHash")).isNotEqualTo(asked.path("evidenceHash"));
      assertThat(submit.path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(RECEIPTS).hasSize(effects + 1);
      long stale = java.util.stream.IntStream.rangeClosed(diagnostics + 1, FINALIZE_DIAGNOSTICS.get()).mapToObj(n -> TEMP.resolve("finalize-exception-" + n + ".json"))
          .filter(Files::isRegularFile).map(p -> { try { return C.parse(Files.readString(p)); } catch (IOException e) { throw new java.io.UncheckedIOException(e); } })
          .filter(row -> row.path("exceptionCode").asText().equals("STALE_GENERATION"))
          .filter(row -> java.util.stream.StreamSupport.stream(row.path("stackFrames").spliterator(), false)
              .anyMatch(fr -> fr.path("class").asText().endsWith("GuidedSessionService") && fr.path("method").asText().equals("committedRefresh"))).count();
      assertThat(stale).as("F2: the durable refresh returns through committedRefresh STALE_GENERATION exactly once").isEqualTo(1);
      b1AwaitRow("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", parent.id, Duration.ofSeconds(45));
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts m JOIN studio_guided_relearn_switches s USING(session_id)"
          + " WHERE m.session_id=? AND m.created_at<s.created_at", Integer.class, parent.id)).isZero();
    }
  }
```

### B1C-01 `incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned` (low)

Ledger 26 / tier "REAL JOINED assertion fixture" / "Step2 assertion FAIL stops session, both gateways zero, no suffix
and no revision published; original failing assertion retained". The literal step 2 (index 1) authors a fill at
ordinal 0 and a binding `containsText` assertion at ordinal 1 (T4 #2/#3). The base passes. In the mixed run, the
existing real focus mutation (`b1c-assert2`, T3) changes the value after the fill. The boundary is the edit at step 4,
so the prefix includes step 2.

| Assertion | Clause |
|---|---|
| State FAILED; `relearnedFrom` null; `learnedFromThisRun` false; publication REFUSED | "stops session" |
| MODEL_WIRE, LEGACY and model_attempts unchanged/zero for the mixed session | "both gateways zero" |
| No switch, no suffix acceptance, no receipt; `ui_test_revisions` count 1; confirmed revision = base | "no suffix and no revision published" |
| Exactly one action at `S(1)#1`: FAILED, ASSERTION_FAILED, `assertionPassed=false`, dispatchCount1, attempt0, and `operationHash` = the prefix program action's operationHash. One `NATIVE_COMPLETED`. No action at index ≥ 2. | "original failing assertion retained" (not reinterpreted) |

```java
  @Test
  void incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned() throws Exception {
    try (var parent = b1Parent(new B1Spec()
        .text(1, "Enter that order reference in Destination and check Order reference contains that order reference.")
        .edit(3, b1BaseTexts().get(3) + " Verify it remains visible.").mixedDom("b1c-assert2").nativeMode("b1c-assert2", 1, 1))) {
      JsonNode result = b1AwaitTerminal(parent.id, Duration.ofSeconds(45));
      assertThat(parent.state()).isEqualTo("FAILED");
      assertThat(result.path("relearnedFrom").isNull()).isTrue();
      assertThat(result.path("learnedFromThisRun").asBoolean()).isFalse();
      assertThat(result.path("publication").path("status").asText()).isEqualTo("REFUSED");
      assertThat(MODEL_WIRE).hasSize(parent.modelBefore); assertThat(LEGACY_MODEL_CALLS.get()).isEqualTo(parent.legacyBefore);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=?", Integer.class, parent.id)).isZero();
      b1AssertNeverDrift(parent.id);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_suffix_acceptances WHERE session_id=?", Integer.class, parent.id)).isZero();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, parent.test)).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT confirmed_revision_id::text FROM ui_tests WHERE id=?", String.class, parent.test)).isEqualTo(parent.baseRevision);
      var failed = sessions.transaction(() -> sessions.actions(parent.id)).stream().filter(a -> !a.path("state").asText().equals("SUCCEEDED")).toList();
      assertThat(failed).hasSize(1);
      JsonNode assertion = failed.getFirst();
      assertThat(assertion.path("coordinate")).isEqualTo(C.object().put("stepId", S(1)).put("ordinal", 1));
      assertThat(assertion.path("state").asText()).isEqualTo("FAILED");
      assertThat(assertion.path("outcomeCode").asText()).isEqualTo("ASSERTION_FAILED");
      assertThat(assertion.path("assertionPassed").isBoolean() && !assertion.path("assertionPassed").asBoolean()).isTrue();
      assertThat(assertion.path("dispatchCount").asInt()).isEqualTo(1); assertThat(assertion.path("attemptOrdinal").asInt()).isZero();
      JsonNode programAction = null;
      for (JsonNode action : sessions.transaction(() -> sessions.incremental().program(parent.id)).path("actions"))
        if (action.path("coordinate").equals(assertion.path("coordinate"))) programAction = action;
      assertThat(programAction).isNotNull();
      assertThat(assertion.path("operationHash")).isEqualTo(programAction.path("operationHash"));
      assertThat(b1NativeCount(parent.id, assertion.path("admission").path("admissionId").asText(), "NATIVE_COMPLETED")).isEqualTo(1);
      for (int index = 2; index < 10; index++)
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?", Integer.class, parent.id, S(index))).isZero();
    }
  }
```

### B1C-02 `incrementalPrefixPolicyRefusalsNeverBecomeDrift` (low)

Ledger 27 / tier "REAL JOINED redirect/policy fixture" / "Prefix origin/navigation/password-policy refusal stops, no
model call or publication; never mislabeled target drift". Three parents. Strict reading: no receipt, no switch, no
DRIFT request, no ledger `TARGET_CHANGED`, no attempt1 (`b1AssertNeverDrift`). "Stops" is asserted as a terminal
state. The ledger does not fix the terminal code. The stage witnesses below prove that each case reached its intended refusal.

| Sub-case | Fixture | Stage witness | Terminal |
|---|---|---|---|
| origin (redirect) | base `/flow`; mixed `/flow` 302 → `https://unapproved.invalid/b1c` | `B1_REDIRECTS == 1`, NAVIGATIONS +1, exactly one navigate action dispatched once | FAILED or UNKNOWN_OUTCOME; never a receipt, switch or TARGET_CHANGED |
| navigation (click away) | READY first 6 (ALLOW stance); mixed Submit handler `location.assign(unapproved)` | Submit admitted and dispatched exactly once | same |
| password-policy | P3 secret prefix: base learns the login with 1 password control; mixed page has 2 (`p4StartObserverPhase(2)`) | Vault reads Δ0, `P3_RECEIPTS` empty, no secret dispatch | **FAILED** (pre-effect policy refusal) |

All three: model0 for the mixed session, `ui_test_revisions` unchanged, `relearnedFrom` null, `learnedFromThisRun` false.

```java
  @Test
  void incrementalPrefixPolicyRefusalsNeverBecomeDrift() throws Exception {
    for (String variant : List.of("b1c-redirect", "b1c-navigate-away")) {
      var spec = new B1Spec().mixedDom(variant).nativeMode("b1c-policy", variant.equals("b1c-redirect") ? 0 : 4, 0);
      if (variant.equals("b1c-redirect")) spec.edit(3, b1BaseTexts().get(3) + " Verify it remains visible."); else spec.ready(6);
      B1_REDIRECTS.set(0);
      try (var parent = b1Parent(spec)) {
        JsonNode result = b1AwaitTerminal(parent.id, Duration.ofSeconds(60));
        assertThat(parent.state()).as(variant).isIn("FAILED", "UNKNOWN_OUTCOME");
        b1AssertNeverDrift(parent.id);
        assertThat(result.path("relearnedFrom").isNull()).isTrue();
        assertThat(result.path("learnedFromThisRun").asBoolean()).isFalse();
        assertThat(MODEL_WIRE).hasSize(parent.modelBefore); assertThat(LEGACY_MODEL_CALLS.get()).isEqualTo(parent.legacyBefore);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=?", Integer.class, parent.id)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, parent.test)).isEqualTo(1);
        if (variant.equals("b1c-redirect")) {
          assertThat(B1_REDIRECTS.get()).as("one real redirect, never a second navigation").isEqualTo(1);
          assertThat(NAVIGATIONS.get()).isEqualTo(parent.navigationsBefore + 1);
          assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0"
              + " AND (document->>'dispatchCount')::int=1", Integer.class, parent.id, S(0))).isEqualTo(1);
        } else {
          assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0"
              + " AND (document->>'dispatchCount')::int=1", Integer.class, parent.id, S(4))).isEqualTo(1);
          assertThat(RECEIPTS).as("the replaced handler never submits").hasSize(parent.effectsBefore);
        }
      }
    }
    // Password-policy: OBS-007 secret prefix with two live password controls at replay.
    p3Case(() -> {
      p3Mode = P3Mode.LOGIN;
      p3Grant(primaryCsi, "fixture");
      UUID test = p3CreateSource(primaryCsi, "fixture", true);
      VaultScope scope = VaultScope.of(primaryCsi, "fixture", test);
      p3Seed(scope, p3ExpectedPassword);
      String original = p3Start(test, "fixture"); awaitFinalizing(original);
      P3Publication base = p3Publish(original);
      // Reuse the existing two-control page phase verbatim (p4GuidedAdversarialPasswordCount 13688-13701 preamble
      // minus p4AdversarialPasswordSelection, which selects the model path, not the prefix path).
      p4AssertRepositoryGraph(); P4_WITNESS_FAILED.set(false);
      p4StartObserverPhase(2);
      int reads = COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS");
      int model = MODEL_WIRE.size(), legacy = LEGACY_MODEL_CALLS.get();
      P3_RECEIPTS.clear();
      ObjectNode start = p3StartCommand(test, "fixture").put("baseRevisionId", base.revision().toString()).put("firstLearnStepId", THREE);
      String mixed = p3Call(p3Cookie, "/api/v1/studio/guided-sessions", start, 202).path("session").path("sessionId").asText();
      JsonNode result = b1AwaitTerminal(mixed, Duration.ofSeconds(60));
      assertThat(sessions.transaction(() -> sessions.lock(mixed).document().path("state").asText())).isEqualTo("FAILED");
      b1AssertNeverDrift(mixed);
      assertThat(result.path("relearnedFrom").isNull()).isTrue();
      assertThat(COUNTED_VAULT.readCount(StudioVaultProvider.ReferenceKind.SECRET, scope, "PASS")).isEqualTo(reads);
      assertThat(P3_RECEIPTS).isEmpty();
      assertThat(MODEL_WIRE).hasSize(model); assertThat(LEGACY_MODEL_CALLS.get()).isEqualTo(legacy);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, test)).isEqualTo(1);
    });
  }
```

(If `p4StartObserverPhase` requires `p4PositiveNativeControl(test)` first, call it exactly as
`p4GuidedAdversarialPasswordCount` does. That is a deliberate reuse of the reviewed OBS-007 phase, not a new mechanism.)

### B1C-03 `incrementalFreshPostConsentGuardsDenyDangerousProposals` (low)

Ledger 80 `IncrementalPolicyIT.prefixGuardDeniesGroundingDestructionAndDenyEvenAfterConsent` / tier "Real
HTTP+PG+runner". Also ledger 82, clause "Fresh post-answer proposal reruns actual guards; no model/private-marker
injection".

The base learns under ALLOW with the default vocabulary, on a guards page (T3) with step 6 replaced. The mixed run
uses READY first = 6 under an approved **CLARIFY_FIRST** version whose vocabulary = default + `save all`,
`delete all`, `archive all`. That is a governed delta, frozen at start. The author confirms the Submit at `S(4)` (valid
current consent). The fresh step-6 proposal is then guarded under the confirmed stance.

| Parent (step 6 text) | Expected |
|---|---|
| `Click all, then Save` (button "Save all") | POLICY_DENIED / DESTRUCTIVE_VERB before effect |
| `Click all, then Delete` ("Delete all") | POLICY_DENIED / DESTRUCTIVE_VERB |
| `Press Enter in all notes to Archive` (textarea "Archive all notes", Enter) | POLICY_DENIED / DESTRUCTIVE_VERB (hostile form-Enter) |
| `Press Enter in Destination` | **allowed** after consent: one native press, no second question (valid authored Enter retained) |

Per hostile parent: Submit SUCCEEDED dispatchCount1 with evidence ≠ question request (fresh guard re-run, 82);
`errorCode=POLICY_DENIED`; exactly one audit `GUIDED_ACTION_REFUSED` carrying `DESTRUCTIVE_VERB` for the session;
no action and no native event at `S(5)`; model0; no receipt or switch (never drift); `relearnedFrom` null; no new
revision. The private marker has exactly 3 keys `{clarificationId, prefixRequestDigest, status=CONFIRMED}` and its
digest is absent from the public session/result bodies and from `MODEL_WIRE` (no private-marker injection).

```java
  @Test
  void incrementalFreshPostConsentGuardsDenyDangerousProposals() throws Exception {
    var vocabulary = new ArrayList<>(com.citi.put.checks.studio.support.ObservedPublicationFixture.DEFAULT_DESTRUCTIVE_VOCABULARY);
    vocabulary.addAll(List.of("save all", "delete all", "archive all"));
    for (String step6 : List.of("Click all, then Save", "Click all, then Delete", "Press Enter in all notes to Archive", "Press Enter in Destination")) {
      boolean allowed = step6.equals("Press Enter in Destination");
      try (var parent = b1Parent(new B1Spec().guards().text(5, step6).ready(6).policy("CLARIFY_FIRST", vocabulary).nativeMode("b1c-guards", 5, 0))) {
        JsonNode question = b1AwaitQuestion(parent.id);
        assertThat(question.path("reason").asText()).isEqualTo("SIDE_EFFECT_CONFIRMATION");
        assertThat(question.path("coordinate").path("stepId").asText()).isEqualTo(S(4));
        JsonNode marker = sessions.transaction(() -> sessions.lock(parent.id).progress().path("sideEffectConfirmation").deepCopy());
        JsonNode asked = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_prefix_requests WHERE session_id=? AND request_digest=?",
            String.class, parent.id, marker.path("prefixRequestDigest").asText()));
        publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/clarify", b1Answer(question), 202, UUID.randomUUID().toString());
        if (allowed) {
          b1AwaitRow("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", parent.id, Duration.ofSeconds(60));
          JsonNode press = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0", String.class, parent.id, S(5)));
          assertThat(press.path("state").asText()).isEqualTo("SUCCEEDED"); assertThat(press.path("dispatchCount").asInt()).isEqualTo(1);
          assertThat(b1NativeCount(parent.id, press.path("admission").path("admissionId").asText(), "NATIVE_COMPLETED")).isEqualTo(1);
          assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='clarify'", Integer.class, parent.id)).isEqualTo(1);
          continue;
        }
        JsonNode result = b1AwaitTerminal(parent.id, Duration.ofSeconds(60));
        assertThat(parent.state()).isEqualTo("FAILED");
        JsonNode submit = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_actions WHERE session_id=? AND step_id=? AND ordinal=0", String.class, parent.id, S(4)));
        assertThat(submit.path("state").asText()).isEqualTo("SUCCEEDED"); assertThat(submit.path("dispatchCount").asInt()).isEqualTo(1);
        assertThat(submit.path("evidenceHash")).as("fresh post-answer proposal, guards re-run").isNotEqualTo(asked.path("evidenceHash"));
        JsonNode progress = sessions.transaction(() -> sessions.lock(parent.id).progress().deepCopy());
        assertThat(progress.path("errorCode").asText()).isEqualTo("POLICY_DENIED");
        assertThat(b1AuditRefusals(parent.id, "DESTRUCTIVE_VERB")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?", Integer.class, parent.id, S(5))).isZero();
        assertThat(b1Native(parent.id).stream().filter(e -> e.path("stepId").asText().equals(S(5))).toList()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=?", Integer.class, parent.id)).isZero();
        assertThat(MODEL_WIRE).hasSize(parent.modelBefore);
        b1AssertNeverDrift(parent.id);
        assertThat(result.path("relearnedFrom").isNull()).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, parent.test)).isEqualTo(1);
        JsonNode confirmed = progress.path("sideEffectConfirmation");
        var keys = new java.util.HashSet<String>(); confirmed.fieldNames().forEachRemaining(keys::add);
        assertThat(keys).isEqualTo(java.util.Set.of("clarificationId", "prefixRequestDigest", "status"));
        assertThat(confirmed.path("status").asText()).isEqualTo("CONFIRMED");
        String digest = confirmed.path("prefixRequestDigest").asText();
        assertThat(publicCall("/api/v1/studio/guided-sessions/" + parent.id, null, 200, null).toString()).doesNotContain(digest);
        assertThat(result.toString()).doesNotContain(digest);
        assertThat(MODEL_WIRE.stream().noneMatch(wire -> wire.contains(digest))).isTrue();
      }
    }
  }
```

### B1C-04 `incrementalWaitingAnswerRejectsChangedContextGenerationAndNaturalLeaseExpiry` (low)

Ledger 81 `IncrementalPolicyIT.waitingRecoveryCancellationAndAnswerRacesRemainAtMostOnce` / tier "HTTP+PG
concurrency+runner". Also ledger 82, clause "Unconfirmed direct internal admit is stale/state refusal with no action;
normal coordinator asks instead of denying" (regated here). Both parents use CLARIFY_FIRST with READY first 5 and
wait on the `S(4)` question.

| Assertion | Clause |
|---|---|
| P1: the coordinator asks (`AWAITING_CLARIFICATION`, `SIDE_EFFECT_CONFIRMATION`) instead of POLICY_DENIED; model0 | 82 "normal coordinator asks" |
| P1: an unconfirmed direct `/admissions` with the authentic controller identity gets 409 STALE_GENERATION, zero writes | 82 "direct internal admit … no action" |
| P1: a real `GuidedDispatchService.observe` refresh while waiting gets STALE_GENERATION, zero writes, no `observation-refresh` command, generation/document unchanged | 81 "changed … generation" (refused change attempt) |
| P1: a real `GuidedDispatchService.pushContext` while waiting returns an identity with unchanged `contextRevision`/`materializationRevision`/`authoredInputsHash` and no new version row | 81 "changed … context" (no committed change) |
| P1: the answer is then accepted, with one Submit effect at fresh evidence | at-most-once positive |
| P2: during a real worker stall, the original lease lapses on the DB and Java clocks with owner/fence/lease unchanged (no renewal, no graceful stop committed) | 81 "lease" (natural, distinct from graceful LEASE_LOST) |
| P2: the correct answer gets 409 STALE_FENCE; a duplicate key gets 409; zero writes; no Submit action or native event | 81 "lease … fence reject" |
| P2: after SIGCONT and a 3 s bound, state is still AWAITING_CLARIFICATION (the runner's late LEASE_LOST lifecycle is refused); then public cancel gives CANCELLED and teardown is confirmed. NAVIGATIONS = before + 1 (no new browser), RECEIPTS unchanged (no late effect), model0, no UNKNOWN or attempt1 row | 81 "cancel/expiry wins, no late effect/new browser/clock/uncertain retry" |

```java
  @Test
  void incrementalWaitingAnswerRejectsChangedContextGenerationAndNaturalLeaseExpiry() throws Exception {
    var spec = new B1Spec().ready(5).policy("CLARIFY_FIRST", com.citi.put.checks.studio.support.ObservedPublicationFixture.DEFAULT_DESTRUCTIVE_VOCABULARY).nativeMode("b1c-wait", 4, 0);
    try (var parent = b1Parent(spec)) {
      JsonNode question = b1AwaitQuestion(parent.id);
      assertThat(question.path("reason").asText()).isEqualTo("SIDE_EFFECT_CONFIRMATION");
      assertThat(MODEL_WIRE).hasSize(parent.modelBefore);
      var controller = com.citi.put.checks.studio.guided.session.GuidedInternalIdentityFixture.controller();
      var service = ownedApplicationContext.getBean(com.citi.put.checks.studio.guided.session.GuidedSessionService.class);
      var bridge = ownedApplicationContext.getBean(com.citi.put.checks.studio.guided.bridge.GuidedDispatchService.class);
      long fence = parent.fence();
      JsonNode progress = sessions.transaction(() -> sessions.lock(parent.id).progress().deepCopy());
      String pending = incrementalPendingSnapshot(parent.id), immutable = incrementalImmutableSnapshot(parent.id);
      // 82: unconfirmed direct internal admit (same body construction as confirmIncrementalPrefix 4434-4448).
      JsonNode request = C.parse(jdbc.queryForObject("SELECT document::text FROM studio_guided_prefix_requests WHERE session_id=? AND request_digest=?",
          String.class, parent.id, progress.path("sideEffectConfirmation").path("prefixRequestDigest").asText()));
      JsonNode target = null;
      for (JsonNode node : progress.path("observation").path("nodes")) if (node.path("name").asText().equals("Submit")) target = node;
      JsonNode current = sessions.transaction(() -> sessions.lock(parent.id).document().deepCopy());
      ObjectNode direct = C.object().put("schemaVersion", 3).put("sessionId", parent.id).put("scopeHash", current.path("scopeHash").asText())
          .put("generation", progress.path("generation").asInt()).put("evidenceHash", progress.path("evidenceHash").asText());
      direct.set("coordinate", request.path("coordinate")); direct.set("executionEvidence", progress.path("executionEvidence"));
      direct.put("contextRevision", request.path("contextRevision").asInt()).put("authoredInputsHash", request.path("authoredInputsHash").asText());
      direct.putObject("target").put("nodeId", target.path("nodeId").asText()).put("documentId", progress.path("documentId").asText())
          .put("generation", progress.path("generation").asInt()).putObject("locator").put("kind", "role").put("role", target.path("role").asText()).put("name", "Submit").put("exact", true);
      direct.putObject("operation").put("kind", "click");
      assertThat(incrementalControllerProbe(parent.id, fence, direct, 409, "admissions").path("code").asText()).isEqualTo("STALE_GENERATION");
      // 81: a real generation change attempt while waiting.
      ObjectNode refresh = new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(jdbc, C).identity(service.runnerContext(controller, parent.id, fence));
      refresh.put("expectedGeneration", progress.path("generation").asInt());
      assertThatThrownBy(() -> bridge.observe(controller, parent.id, fence, "b1c-wait-refresh-" + UUID.randomUUID(), refresh))
          .isInstanceOf(GuidedSessionException.class).hasMessage("STALE_GENERATION");
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='observation-refresh'", Integer.class, parent.id)).isZero();
      // 81: a real context delivery while waiting changes nothing.
      int versionsBefore = jdbc.queryForObject("SELECT count(*) FROM studio_guided_materialization_versions WHERE session_id=?", Integer.class, parent.id);
      int revisionBefore = jdbc.queryForObject("SELECT materialization_revision FROM studio_guided_materializations WHERE session_id=?", Integer.class, parent.id);
      JsonNode identity = bridge.pushContext(controller, parent.id, fence);
      assertThat(identity.path("contextRevision")).isEqualTo(request.path("contextRevision"));
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_materialization_versions WHERE session_id=?", Integer.class, parent.id)).isEqualTo(versionsBefore);
      assertThat(jdbc.queryForObject("SELECT materialization_revision FROM studio_guided_materializations WHERE session_id=?", Integer.class, parent.id)).isEqualTo(revisionBefore);
      JsonNode after = sessions.transaction(() -> sessions.lock(parent.id).progress().deepCopy());
      for (String field : List.of("generation", "documentId", "evidenceHash", "observationHash")) assertThat(after.path(field)).isEqualTo(progress.path(field));
      assertThat(incrementalPendingSnapshot(parent.id)).isEqualTo(pending); assertThat(incrementalImmutableSnapshot(parent.id)).isEqualTo(immutable);
      int effects = RECEIPTS.size();
      publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/clarify", b1Answer(question), 202, UUID.randomUUID().toString());
      b1AwaitRow("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id='" + S(4) + "' AND ordinal=0 AND document->>'state'='SUCCEEDED'", parent.id, Duration.ofSeconds(45));
      assertThat(RECEIPTS).hasSize(effects + 1);
    }
    try (var parent = b1Parent(spec)) {
      JsonNode question = b1AwaitQuestion(parent.id);
      int navigations = NAVIGATIONS.get(), effects = RECEIPTS.size(), model = MODEL_WIRE.size();
      String pending = incrementalPendingSnapshot(parent.id);
      b1StallWorker();
      b1AwaitNaturalLeaseExpiry(parent.id);
      assertThat(parent.state()).as("no graceful LEASE_LOST lifecycle committed").isEqualTo("AWAITING_CLARIFICATION");
      String key = UUID.randomUUID().toString();
      for (int i = 0; i < 2; i++)
        assertThat(publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/clarify", b1Answer(question), 409, key).path("code").asText()).isEqualTo("STALE_FENCE");
      assertThat(incrementalPendingSnapshot(parent.id)).isEqualTo(pending);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?", Integer.class, parent.id, S(4))).isZero();
      b1ResumeWorker();
      Thread.sleep(3000);
      assertThat(parent.state()).as("the late runner lifecycle cannot act on an expired lease").isEqualTo("AWAITING_CLARIFICATION");
      parent.cancel();
      assertThat(parent.state()).isEqualTo("CANCELLED");
      p3AwaitTeardown(parent.id);
      assertThat(NAVIGATIONS.get()).as("no new browser").isEqualTo(navigations);
      assertThat(RECEIPTS).as("no late effect").hasSize(effects);
      assertThat(MODEL_WIRE).hasSize(model);
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND (attempt_ordinal<>0 OR document->>'state'='UNKNOWN_OUTCOME')",
          Integer.class, parent.id)).isZero();
      assertThat(b1Native(parent.id).stream().filter(e -> e.path("stepId").asText().equals(S(4))).toList()).isEmpty();
    }
  }
```

(`incrementalControllerProbe(..., "admissions")` already exists, ReplayIT:4849. `bridge.observe` and
`bridge.pushContext` are the real production entry points the coordinator uses.)

### B1D-01 `incrementalEmptyPrefixProgramPairSurvivesEveryContextDelivery` (low)

Ledger 55 `IncrementalMaterializationIT.emptyPrefixContextKeepsExactProgramPair` / tier "HTTP+Postgres+runner
context". READY with explicit first step `S(0)` produces EMPTY_PREFIX. Pair logging is armed **before base learning**,
so the base session is the "no-base ordinary" control. A real-start response withhold (T5, 16 s > the unchanged 15 s
client deadline) causes the real rebootstrap. Probes run at an idle commit cut.

| Assertion | Clause |
|---|---|
| `relearn_plans`: initial index 0; program `actions`=[] and `sourceStepIds`=[]; `prefix_program_hash == hash(program)`; switch EMPTY_PREFIX at index 0 | base-backed explicit first step EMPTY_PREFIX |
| Runner START for the mixed session: `hasProgram && hasHash`, 0 actions, 0 steps, `programHashValid`, hash = DB hash | "during initial context" |
| `START_HELD` then `START_RELEASED`; `translationBootstrap.deliveries` size 2; `metadataAcknowledgement.deliveryId` = second; every `UPDATE_ACCEPTED` row (rebootstrap plus later same-version deliveries, ≥ 2) carries the exact pair; every `studio_guided_materialization_deliveries.context_metadata` for the session carries the pair equal to the DB | "every delivery" (incl. rebootstrap) |
| Direct controller-authenticated runner probes at an idle ADMIT cut: half pair (no hash) gets 409 `SCHEMA`; changed pair (sourceStepIds [S(0)] + recomputed hash), reforged digest (0…), and omitted pair each get 409 `INPUT_IDENTITY`. The runtime is unchanged and the session still reaches FINALIZING. No `UPDATE_ACCEPTED` row comes from a probe. | "half pair/changed pair/reforged digest rejected" |
| Base (ordinary, no relearn row) START/UPDATE rows: `hasProgram=false && hasHash=false` | "no-base ordinary session omits pair" |

```java
  @Test
  void incrementalEmptyPrefixProgramPairSurvivesEveryContextDelivery() throws Exception {
    try (var parent = b1Parent(new B1Spec().ready(0).pairLog(true).nativeMode("b1d-empty", 0, 0))) {
      var plan = jdbc.queryForMap("SELECT initial_step_index,prefix_program::text AS program,prefix_program_hash FROM studio_guided_relearn_plans WHERE session_id=?", parent.id);
      JsonNode program = C.parse((String) plan.get("program"));
      String programHash = (String) plan.get("prefix_program_hash");
      assertThat(((Number) plan.get("initial_step_index")).intValue()).isZero();
      assertThat(program.path("actions")).isEmpty(); assertThat(program.path("sourceStepIds")).isEmpty();
      assertThat(GuidedContracts.hash(program)).isEqualTo(programHash);
      assertThat(jdbc.queryForObject("SELECT reason FROM studio_guided_relearn_switches WHERE session_id=?", String.class, parent.id)).isEqualTo("EMPTY_PREFIX");
      var cut = B1Cut.arm(B1Cut.Kind.ADMIT_COMMIT, parent.id, C.object().put("stepId", S(0)).put("ordinal", 0), null, 0);
      assertThat(cut.entered.await(90, java.util.concurrent.TimeUnit.SECONDS)).isTrue(); assertThat(cut.failure).isNull();
      var controller = com.citi.put.checks.studio.guided.session.GuidedInternalIdentityFixture.controller();
      long fence = parent.fence();
      ObjectNode authentic = ownedApplicationContext.getBean(com.citi.put.checks.studio.guided.session.GuidedSessionService.class)
          .runnerContext(controller, parent.id, fence);
      assertThat(authentic.path("prefixProgramHash").asText()).isEqualTo(programHash);
      int acceptedBefore = (int) b1PairEvents(parent.id).stream().filter(r -> r.path("phase").asText().equals("UPDATE_ACCEPTED")).count();
      var probes = new java.util.LinkedHashMap<String, ObjectNode>();
      ObjectNode half = authentic.deepCopy(); half.remove("prefixProgramHash"); probes.put("SCHEMA", half);
      ObjectNode changed = authentic.deepCopy(); ((ObjectNode) changed.path("prefixProgram")).putArray("sourceStepIds").add(S(0));
      changed.put("prefixProgramHash", GuidedContracts.hash(changed.path("prefixProgram"))); probes.put("INPUT_IDENTITY:changed", changed);
      probes.put("INPUT_IDENTITY:reforged", authentic.deepCopy().put("prefixProgramHash", "0".repeat(64)));
      ObjectNode omitted = authentic.deepCopy(); omitted.remove("prefixProgram"); omitted.remove("prefixProgramHash"); probes.put("INPUT_IDENTITY:omitted", omitted);
      for (var probe : probes.entrySet()) {
        var reply = b1RunnerContextProbe(parent.id, fence, probe.getValue());
        assertThat(reply.statusCode()).as(probe.getKey()).isEqualTo(409);
        assertThat(C.parse(reply.body()).path("code").asText()).as(probe.getKey()).isEqualTo(probe.getKey().split(":")[0]);
      }
      assertThat(b1PairEvents(parent.id).stream().filter(r -> r.path("phase").asText().equals("UPDATE_ACCEPTED")).count())
          .as("no probe was accepted").isEqualTo(acceptedBefore);
      cut.release.countDown();
      awaitFinalizing(parent.id);
      var mixed = b1PairEvents(parent.id);
      var phases = mixed.stream().map(r -> r.path("phase").asText()).toList();
      assertThat(phases.stream().filter("START"::equals).count()).isEqualTo(1);
      assertThat(phases).contains("START_HELD", "START_RELEASED");
      for (JsonNode row : mixed) {
        if (!List.of("START", "START_HELD", "START_RELEASED", "UPDATE_ACCEPTED").contains(row.path("phase").asText())) continue;
        assertThat(row.path("hasProgram").asBoolean() && row.path("hasHash").asBoolean()).as(row.toString()).isTrue();
        assertThat(row.path("programActions").asInt(-1)).isZero(); assertThat(row.path("programSteps").asInt(-1)).isZero();
        assertThat(row.path("programHashValid").asBoolean()).isTrue();
        assertThat(row.path("prefixProgramHash").asText()).isEqualTo(programHash);
      }
      assertThat(phases.stream().filter("UPDATE_ACCEPTED"::equals).count()).as("rebootstrap + later deliveries").isGreaterThanOrEqualTo(2);
      JsonNode bootstrap = sessions.transaction(() -> sessions.lock(parent.id).progress().path("translationBootstrap").deepCopy());
      assertThat(bootstrap.path("deliveries")).hasSize(2);
      assertThat(bootstrap.path("metadataAcknowledgement").path("deliveryId")).isEqualTo(bootstrap.path("deliveries").get(1).path("deliveryId"));
      for (String metadata : jdbc.queryForList("SELECT context_metadata::text FROM studio_guided_materialization_deliveries WHERE session_id=? AND context_metadata IS NOT NULL", String.class, parent.id)) {
        JsonNode issued = C.parse(metadata);
        assertThat(issued.path("prefixProgram")).isEqualTo(program);
        assertThat(issued.path("prefixProgramHash").asText()).isEqualTo(programHash);
      }
      var base = b1PairEvents(parent.base);
      assertThat(base).isNotEmpty();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_relearn_plans WHERE session_id=?", Integer.class, parent.base)).isZero();
      for (JsonNode row : base) assertThat(row.path("hasProgram").asBoolean() || row.path("hasHash").asBoolean()).as(row.toString()).isFalse();
    }
  }
```

### B1D-02 `incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary` (low)

Ledger 56 `IncrementalResultIT.receiptAndResultDistinguishBoundaryFromSuccess` / tier "HTTP+Postgres". Two parents.
BOUNDARY: edit4 with mixed `b1d-boundary-plan-fail`. EMPTY: READY first 0 with `b1d-empty-plan-fail`. Both use T4 #1.
The DRIFT row stays the existing `drift-plan-fail` variant, which is blocked by D1.

| Assertion | Clause |
|---|---|
| BOUNDARY, held at the ADMIT commit of `S(2)#0` (prefix, no switch): GET result has the `relearnedFrom` key present and JSON null, `learnedFromThisRun` false, publication PENDING | "Required relearnedFrom null before committed switch" |
| BOUNDARY after FAILED: `relearnedFrom == {stepId:S(3)}` exactly (no `driftSwitchStepId`), switch BOUNDARY | "boundary … reports entered boundary after switch even when later SOURCE_PLAN fails" |
| EMPTY right after start: `relearnedFrom == {stepId:S(0)}`; after FAILED the same | "empty prefix reports entered boundary …" |
| Both: outcome FAILED, `learnedFromThisRun` false, publication REFUSED, currentReadiness `ready=false`/`NOT_PUBLISHED`, no new revision, exactly one SOURCE_PLAN attempt | "learnedFromThisRun/publication success false on failure" |
| Both: the actual result validates; missing `relearnedFrom`, `learnedFromThisRun:true` while REFUSED, `currentReadiness.ready:true`, an extra `relearnedFrom` key and a missing `relearnedFrom.stepId` each get `INVALID_CONTRACT` | "missing field and contradictory result refuse" |

```java
  @Test
  void incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary() throws Exception {
    try (var parent = b1Parent(new B1Spec().edit(3, b1BaseTexts().get(3) + " Verify it remains visible.").mixedDom("b1d-boundary-plan-fail"))) {
      var cut = B1Cut.arm(B1Cut.Kind.ADMIT_COMMIT, parent.id, C.object().put("stepId", S(2)).put("ordinal", 0), null, 0);
      assertThat(cut.entered.await(45, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_relearn_switches WHERE session_id=?", Integer.class, parent.id)).isZero();
      JsonNode before = publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/result", null, 200, null);
      assertThat(before.has("relearnedFrom") && before.path("relearnedFrom").isNull()).isTrue();
      assertThat(before.path("learnedFromThisRun").asBoolean()).isFalse();
      assertThat(before.path("publication").path("status").asText()).isEqualTo("PENDING");
      cut.release.countDown();
      JsonNode failed = b1AwaitTerminal(parent.id, Duration.ofSeconds(60));
      assertThat(jdbc.queryForObject("SELECT reason FROM studio_guided_relearn_switches WHERE session_id=?", String.class, parent.id)).isEqualTo("BOUNDARY");
      assertThat(failed.path("relearnedFrom")).isEqualTo(C.object().put("stepId", S(3)));
      b1AssertFailedResult(parent, failed);
    }
    try (var parent = b1Parent(new B1Spec().ready(0).mixedDom("b1d-empty-plan-fail"))) {
      JsonNode entered = publicCall("/api/v1/studio/guided-sessions/" + parent.id + "/result", null, 200, null);
      assertThat(entered.path("relearnedFrom")).isEqualTo(C.object().put("stepId", S(0)));
      JsonNode failed = b1AwaitTerminal(parent.id, Duration.ofSeconds(60));
      assertThat(jdbc.queryForObject("SELECT reason FROM studio_guided_relearn_switches WHERE session_id=?", String.class, parent.id)).isEqualTo("EMPTY_PREFIX");
      assertThat(failed.path("relearnedFrom")).isEqualTo(C.object().put("stepId", S(0)));
      b1AssertFailedResult(parent, failed);
    }
  }

  private void b1AssertFailedResult(B1Parent parent, JsonNode result) {
    assertThat(parent.state()).isEqualTo("FAILED");
    assertThat(result.path("outcome").asText()).isEqualTo("FAILED");
    assertThat(result.path("learnedFromThisRun").asBoolean()).isFalse();
    assertThat(result.path("publication").path("status").asText()).isEqualTo("REFUSED");
    assertThat(result.path("currentReadiness").path("ready").asBoolean()).isFalse();
    assertThat(result.path("currentReadiness").path("code").asText()).isEqualTo("NOT_PUBLISHED");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, parent.test)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND kind='SOURCE_PLAN'", Integer.class, parent.id)).isEqualTo(1);
    C.validate("v3/result", result);
    var contradictions = new java.util.LinkedHashMap<String, ObjectNode>();
    ObjectNode missing = result.deepCopy(); missing.remove("relearnedFrom"); contradictions.put("missing", missing);
    contradictions.put("learned-while-refused", result.deepCopy().put("learnedFromThisRun", true));
    ObjectNode ready = result.deepCopy(); ((ObjectNode) ready.path("currentReadiness")).put("ready", true); contradictions.put("ready-unpublished", ready);
    ObjectNode extra = result.deepCopy(); ((ObjectNode) extra.path("relearnedFrom")).put("receiptHash", "0".repeat(64)); contradictions.put("extra", extra);
    ObjectNode blank = result.deepCopy(); ((ObjectNode) blank.path("relearnedFrom")).remove("stepId"); contradictions.put("no-step", blank);
    for (var bad : contradictions.entrySet())
      assertThatThrownBy(() -> C.validate("v3/result", bad.getValue())).as(bad.getKey())
          .isInstanceOf(GuidedSessionException.class).hasMessage("INVALID_CONTRACT");
  }
```

---

## 5b. Private routes handed from B3 (`b3abc-design01/design.md` route table rows 9, 10, 13, 14)

All four are asserted inside **B1B-03** against the real owning-worker `/outcomes` route. Each uses the **exact
original authentic body** that the runner captured at the existing `/obs015-drift` hook (`INCREMENTAL_DRIFT_CAPTURE`).
After every refusal the test asserts zero writes, no receipt, no switch and model0. No new method or registration is needed.

| B3 route | B1B-03 row(s) | Expected (static trace) | Production guard exercised |
|---|---|---|---|
| 9 `hash-is-not-transport-authentication` | `no-auth` (client cert present, header absent); `no-auth-no-cert` (both absent). The body carries a valid `receiptHash`. | 401 UNAUTHENTICATED | `GuidedInternalSecurity.IdentityFilter.authenticate` (cert, then `Authorization` presence) runs before any body parsing, so a correct receipt hash is never a credential. |
| 10 `forged-jwt-algorithm` | `alg-hs256` (header swapped, RS256 signature kept); `alg-hs256-hmac` (re-signed HMAC-SHA256 keyed with the deployed public key, the classic RS→HS confusion); `alg-none-sig`. All carry the real worker claims and the exact body. | 401 ×3 | the header check (`alg == RS256 && typ == JWT && size == 2`), then the `SHA256withRSA` verify on the pinned SPKI |
| 13 `stale-callback-owner` | Parent **D** (`late = "EXPIRY"`): a real worker stall (T6) lets the original lease lapse naturally on the DB and Java clocks, with owner, fence and lease unchanged. Then the exact authentic body arrives with a valid worker JWT and mTLS. | 409 STALE_FENCE | `prefixDrift`: owner/fence match, no duplicate, `active`, then `owner()` lease check |
| 14 `wrong-assignment` | `wrong-assignment-path` (exact body posted to another persisted session's route); `wrong-assignment-receipt` (receipt `sessionId` rebound and rehashed, own route); plus `other-worker` and `fence+1` (403) and `context` (409 STALE_FENCE) | 422 / 422 / 403 / 403 / 409 | `path(id, receipt)`, the `prefixDrift` owner(worker, fence) join, and `materialization.verify` context identity |

Limits stated, not weakened:
- **Route 13, "or transfer".** A fence-changing transfer to a different worker is unreachable in this fixture: one
  owned worker, `worker-1`. A same-worker reclaim after expiry with dispatched actions stops the session as
  `UNKNOWN_OUTCOME` without re-fencing (`claim` reclaim path), so it lands in the late-terminal row. Only natural
  expiry is proved. The runner's own late callback after SIGCONT is not asserted per se, because its delivery depends
  on timers. Only its absence of effect is asserted.
- **Route 14, "against the persisted assignment".** The service JWT carries no assignment claim: `IdentityFilter`
  allows only `iss/sub/aud/role/iat/exp/nbf`. The runner holds at most one occupied assignment per worker
  (`GuidedOwnership.assign`, `capacity ?? 1`), so a second live persisted assignment for the same worker cannot be
  created lawfully. The callback-side assignment binding is therefore exactly the triple asserted above: session path
  = receipt `sessionId`, persisted owner `workerId` + fence, and context identity. A signed callback naming a
  different *live* assignment is **not lawfully constructible** in-repo. It is listed in §6.
- B1B-03 positive rows remain red until D1 is fixed. Rows 9, 10 and 14 are refusals that occur **before**
  `materialization.verify`, so they are exact and non-vacuous even at the current source. The parent D (route 13)
  STALE_FENCE also precedes `verify`.

## 6. Clauses not lawfully provable in-repo (stated, not weakened)

| Ledger | Clause | Why | Lawful companion that IS asserted |
|---|---|---|---|
| 48 | "PRE_ADMISSION direct response alone insufficient" (literal negative) | The real runner returns `DRIFT` from `preparePrefix` only after its own callback succeeds (runtime.ts:288–291). A DRIFT response with no committed receipt needs a fabricated callback ACK to the runner, which is forbidden ("never supplies a receipt or outcome"). The guard `require(duplicateReceipt…)` (TranslationService:440–444) is unreachable end to end. | B1B-03 B ordering proof: no receipt/switch/settlement while the authentic callback is held, across re-issued prepares of the same digest. Authority exists only after the callback commits. |
| 80 | "unobserved-target" and grounding refusals inside a prefix | Prefix proposals come from the verified base program, against the acknowledged observation with exact locator match (F4). A direct internal admit is refused earlier (state/runner prefix mode). An unobserved nodeId can only arise from a fabricated proposal or an observation-generation race (a STALE_GENERATION subject). | The pure `GuidedActionGuard` tier stays a separate, labelled companion. Not counted for 80. |
| 80 | single-word "Save"/"Delete" after consent | Grounding needs the word in the authored text; the destructive check needs it absent (F4) | Multi-word governed phrases `save all`/`delete all`/`archive all` (B1C-03) |
| 80 | "Deny even after consent" with stance DENY | Under DENY no consent can exist, so the existing `policy-prefix` variant is the DENY control | DESTRUCTIVE_VERB after a valid CLARIFY_FIRST consent (B1C-03) |
| 81 | answer after an *actual committed* context/generation change while waiting | Production makes both immutable while `AWAITING_CLARIFICATION` (`beginObservationRefresh` state set; append blocked while pending) | Each real change mechanism is refused or has no effect (B1C-04 P1). Wrong-generation answers are already covered (`confirmIncrementalPrefix`). |
| B3 route 14 | signed callback naming a different *live* persisted assignment | No assignment claim exists in the service JWT, and the runner holds one occupied assignment per worker (§5b) | The path, owner/fence and context binding triple (B1B-03) |
| B3 route 13 | ownership *transfer* to another worker, then a late callback | Single owned worker; a same-worker reclaim stops the session without re-fencing | Natural lease expiry → 409 STALE_FENCE (B1B-03 parent D) |
| 56 | "contradictory result" = BOUNDARY/EMPTY result carrying `driftSwitchStepId` | The frozen `RelearnedFrom` schema allows the key for every reason. Refusing it needs a schema change, and none is allowed. | The exact positive projection (`{stepId}` only) is asserted from the real switch row |
| matrix | `!bootstrapReady` at `advancePrefix` entry; an existing FAILED/UNKNOWN action at the next coordinate while live | `bootstrap()` makes the session ready before `advancePrefix`. A FAILED/UNKNOWN action at the next coordinate stops the session (unreachable while live). | Not counted. Listed as unreachable rows of the OPEN matrix. |

---

## 7. `build.gradle.kts` registration (Dex-JOIN, same window as ReplayIT)

After `joinedPrefixSyncMethods` (line 139):

```kotlin
val joinedB1bcdMethods = setOf(
    "incrementalPrefixRecoveryUsesNextUnconsumedCoordinate",
    "incrementalConcurrentAuthenticatedDriftCommitsOneSwitch",
    "incrementalDriftAuthorityRejectsEveryExactJoin",
    "incrementalExcludedAttemptCannotHideOtherUnsettledActions",
    "incrementalPrefixContinuationMatrixDoneAndRefreshRows",
    "incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned",
    "incrementalPrefixPolicyRefusalsNeverBecomeDrift",
    "incrementalFreshPostConsentGuardsDenyDangerousProposals",
    "incrementalWaitingAnswerRejectsChangedContextGenerationAndNaturalLeaseExpiry",
    "incrementalEmptyPrefixProgramPairSurvivesEveryContextDelivery",
    "incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary"
)
```

Three exact edits. If B1a lands first with its own set (for example `joinedB1aMethods`), also union that set in the same three places:
- line 259: `filter { setIncludePatterns(*(joinedIncrementalMethods + joinedPrefixSyncMethods + joinedB1bcdMethods).map { "$joinedFixtureClass.$it" }.toTypedArray()) }`
- line 265: `(joinedIncrementalMethods + joinedPrefixSyncMethods + joinedB1bcdMethods).forEach { method -> filter.excludeTestsMatching("$joinedFixtureClass.$method") }`
- line 325: `setOf(joinedIncrementalMethods[0], joinedIncrementalMethods[2]) + joinedPrefixSyncMethods + joinedB1bcdMethods +`

ReplayIT in-class sets: add the 11 names to **both** `SINGLETON_METHODS` (line 137) and `INCREMENTAL_METHODS` (line 187).
Otherwise `beginFixtureInvocation` (231–236) fails closed.

---

## 8. Execution (R3; not run here)

Apply D1 (if approved) and T1–T7 + methods + registration in one source window, then freeze. Spotless runs in the
author's window only. Collector form:

```
J=com.citi.put.checks.studio.guided.publication
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/run-backend-tasked.py backend-b1bcd-attempt01 \
  --test-tasks guidedIncrementalTest --require-exec-tasks guidedIncrementalTest -- --continue guidedIncrementalTest \
  --tests $J.GuidedPublicationReplayIT.incrementalPrefixRecoveryUsesNextUnconsumedCoordinate \
  --tests $J.GuidedPublicationReplayIT.incrementalConcurrentAuthenticatedDriftCommitsOneSwitch \
  --tests $J.GuidedPublicationReplayIT.incrementalDriftAuthorityRejectsEveryExactJoin \
  --tests $J.GuidedPublicationReplayIT.incrementalExcludedAttemptCannotHideOtherUnsettledActions \
  --tests $J.GuidedPublicationReplayIT.incrementalPrefixContinuationMatrixDoneAndRefreshRows \
  --tests $J.GuidedPublicationReplayIT.incrementalStepTwoAssertionFailureIsFactualAndNeverRelearned \
  --tests $J.GuidedPublicationReplayIT.incrementalPrefixPolicyRefusalsNeverBecomeDrift \
  --tests $J.GuidedPublicationReplayIT.incrementalFreshPostConsentGuardsDenyDangerousProposals \
  --tests $J.GuidedPublicationReplayIT.incrementalWaitingAnswerRejectsChangedContextGenerationAndNaturalLeaseExpiry \
  --tests $J.GuidedPublicationReplayIT.incrementalEmptyPrefixProgramPairSurvivesEveryContextDelivery \
  --tests $J.GuidedPublicationReplayIT.incrementalBoundaryAndEmptyPrefixPlanningFailureKeepEnteredBoundary
```

Prerequisite: FIX-R1. attempt07 shows base learning failing for every case, and all eleven parents depend on base
learning. Expect about 26 fresh base learns (CSI-isolated), within the per-case budget witnesses. Without D1,
B1B-02/03 (positive rows)/04 are expected red. That is a production finding, not a test defect.

HOLD. No release, no formal QA, no lifecycle change. Row 85 remains OPEN, pending and unamended.
