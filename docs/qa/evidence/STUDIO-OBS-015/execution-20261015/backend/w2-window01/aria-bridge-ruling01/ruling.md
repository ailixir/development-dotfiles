# STUDIO-OBS-015 w2-window01 — Architect ruling: the 29 `MISSING_SOURCE` cases in GuidedBridgeIntegrationTest

Aria (@architect). 2026-10-16. Ruling only: no source, test or build file was changed, nothing was run under Gradle,
nothing was committed. Input and output hashes are in `manifest.json`. The case-by-case machine form is `ruling.json`.
[V] = I read the code or artifact, or ran a read-only command. [I] = inference; the verification step that closes it is
named next to it.

## 0. Verdict

| Ruling | Count | Cases |
|---|---|---|
| **MIGRATE** (planner-issued obligation, new class `GuidedBridgePlannedIT`, same method names) | **16** | §3 rows marked M |
| **RETIRE** (an existing passing test covers the behaviour; covering test cited) | **12** | §3 rows marked R |
| **RETIRE-OBSOLETE** (the behaviour does not exist on the single path) | **1** | `supportedV2AnswerResumesTrustedQuestionFixtureThenRefreshPreservesHistoricalSelection` |
| Total | **29** | equals the `w2-w01-bridge-exp02` failure set [V: results.json, 29 FAIL] |

After the change: `GuidedBridgeIntegrationTest` goes from 38 to **9** methods (the 9 that pass in exp02, unchanged).
`GuidedBridgePlannedIT` gets **16** methods with the same names. **13** methods are retired by name. Retiring tests is a
**scope fact** and must be disclosed (§5). It is not silent cleanup.

Dex-W2's wiring change is **correct and stays** (§2). There is one required edit: the `createSession` comment overstates
equivalence with production.

## 1. Rules applied (the line between lawful fixture and faked authority)

- **R-1 Planner authority is never manufactured.** A test may not insert rows into `studio_guided_translation_plans`,
  `studio_guided_obligation_admissions`, `studio_guided_source_manifests` or `studio_guided_translation_state` for a
  session it then drives. It may not call `GuidedTranslationStore.acceptPlan/reserveObligation/attachAdmission`.
  The store is not the authority. The authority is the chain `GuidedProposalValidator.admitPlan` →
  `GuidedDependencyPlanner.validate/allocate` → `acceptPlan` (GuidedTranslationService:189-211), then per action
  `validator.materializeAction` → `validator.action` → `guardAction` → `reserveObligation` (:852-882) [V]. A
  store-level call skips every check in that chain. Store-level calls stay lawful only where the store contract itself
  is the subject (`GuidedTranslationConcurrencyTest`, `GuidedTranslationMigrationTest`).
- **R-2 The model is the untrusted boundary, so a controlled provider is lawful.** The model reply only *selects* an
  obligation and a `{target, operation}`. The server builds every bridge-authority field (validator :285-305 [V]; the
  same statement is in GuidedPlanningIntegrationTest:3446). Controlling the provider over real HTTP is the
  established pattern (GuidedPlanningIntegrationTest:166-217, GuidedPublicationReplayIT RuntimeHooks:2194-2219) [V].
- **R-3 Interrupting at a real crash window is lawful.** The reservation commits inside
  `sessions.translationTransaction` (GuidedTranslationService:1403-1404) before `admitAndDispatch` (:887-889) [V]. A
  Mockito spy on `GuidedDispatchService` that throws `AssertionError("process-stop")` from `prepareAndAdmit` therefore
  leaves a genuine, committed, unadmitted association. Production must tolerate that controller crash.
  Precedent: the same spy/throw on `pushContext` at GuidedPlanningIntegrationTest:1884-1895, and on `materialize` at
  :1597-1611 and :1676-1748 [V].
- **R-4 Hand-crafted proposals stay lawful as negative probes only.** A probe that asserts a refusal exercises the
  production gate the way a buggy or hostile controller would. A positive admission must use the planner's
  `(admissionKey, proposal)`.
- **R-5 Test-side session-state writes may only narrow, or restore the exact state the test narrowed from.**
  Examples: a forced pause, then back to `PROPOSING`; counters to the ceiling, then back. They never create plans,
  obligations, allocations or admissions.
- **R-6 Coverage standard for RETIRE.** The covering test must prove the same behaviour, on the side where the
  behaviour lives, at a real tier: runner fixtures-tier with real Chromium, or a backend IT on real PostgreSQL.
  Composition proofs are allowed only when each side is cited and the seam between them has no logic of its own. That
  is stated per case.

## 2. Dex-W2 wiring change (`w2.diff` lines 180-216) — ruling

1. **`installTranslation` in the bridge service bean: CORRECT.** Production installs translation unconditionally
   (GuidedSessionConfiguration:59) [V]. `GuidedTranslationStore` and `GuidedClarificationContextStore` are stateless
   wrappers around `(jdbc, contracts)`, so new instances are equivalent to the beans [V]. Keep it. Every case needs it,
   because `pushContext` → `contextDeliveryId` → `translationTransaction` requires `translation.exists(id)`
   (GuidedSessionService:2361-2362, :174) [V].
2. **Translation-state init in `createSession`: ACCEPTED AS A FIXTURE, NOT production-equivalent.** It fakes no planner
   authority: it writes no plan and no obligation, and the manifest is the output of the `GuidedSessionAccess` seam
   that `FixtureAccess` already replaces. It differs from production in three ways [V]:
   (a) production initializes inside the `start` transaction (GuidedSessionService:691-696); the fixture uses a
   separate transaction.
   (b) production stores the classifier's manifest (GuidedProductionSessionAccess:166-169); the fixture stores a
   hand-built 5-field manifest with no `schemaPins`, `configurationReferences` or classified source.
   (c) production uses `initialize(session, manifest, true)` and writes `progress.translationAcquisition`; the fixture
   uses the 2-argument form.
   Consequence: this is enough for the 9 retained cases, none of which plans or admits. It cannot run the real planner:
   `checkPins` needs `manifest.schemaPins` (GuidedTranslationService:734-738) [V]. That is why the MIGRATE cases move
   to production access.
   **Required edit (comment only):** `GuidedBridgeIntegrationTest.java:2759`. Replace
   `// Single path: every production start initializes translation state (GuidedProductionSessionAccess).` with
   `// Fixture stand-in for GuidedProductionSessionAccess.initialize: same rows, hand manifest, no acquisition marker; no case here plans or admits.`
3. Dex's "no narrow lawful fix" analysis is **agreed**: seeding rows violates R-1, and removing the gate is a
   production change with no production defect.

## 3. Per-case ruling

Line numbers refer to `GuidedBridgeIntegrationTest.java` at sha256 `d48d4f0d…` (Dex's `sha256After`) [V]. AC
anchors: OBS-004 AC-1…AC-7 (bridge), OBS-014 AC-1 (governed read grants), OBS-015 AC-4(3) (at-most-once stands),
OBS-012A AC-4 (port proof by name), and the 2026-10-16 H8 ruling (no fake teardown ACK). All 29 behaviours are still
required on the single path except #11. All are reachable through planner obligations except #11.

| # | Case (line) | Behaviour proved | AC | Ruling | Covering test / reason |
|---|---|---|---|---|---|
| 1 | uncapturedPasswordAndInputEchoesStayPrivateAcrossActualDocumentNavigation (2633) | Uncaptured password/input values echoed on a navigated page never reach the observation, command responses or the worker log | 004 AC-3/6 | **R** | runner `fixtures-tier/guided-targets.test.ts:153` (password and text, after removal and navigation, real Chromium) [V]; the worker-log canary check stays in `@AfterEach` of both classes (:884-885) [V]; compensating DB oracle added to migrated #27 (§4.6) |
| 2 | realWorkerRenewsBeyondInitialLeaseWhilePausedAndPreservesCapturedValue (1722) | A paused real worker renews past its first lease and keeps the captured value; the later fill uses it | 004 AC-3/5 | **M** | Only joined proof of a long pause with a retained private value. The forced pause is a round trip and allowed under R-5 |
| 3 | actualApplicationReplacementAfterPrepareNeverActsOnReplacement (1375) | A DOM replacement after prepare gives `FAILED TARGET_CHANGED` with no fill | 004 AC-2/7 | **M** | Named in OBS-004 AC-7 ("DOM replacement"); joined |
| 4 | cancelDuringRefreshRejectsLateCallbackWithoutBrowserMutation (2277) | Cancel during a held refresh callback: no generation commit, no mutation | 004 AC-5/7 | **M** | "Cancellation linearization" (AC-7); joined only |
| 5 | currentSourceLockWinsAgainstConcurrentConsumeAndCumulativeAllocationsCannotBeErased (1166) | A source edit lock wins over consume; a config revision refuses dispatch; allocations are cumulative and cannot be erased (API and DB trigger) | 004 AC-4/5 | **M** | Moves to the real source of truth (`ui_tests` row lock and revisions, §4.6) |
| 6 | freshObservationConnectsTwoAuthoredStepsWithoutReplayingProducer (2040) | A step-1 read feeds a step-2 fill after refresh; the producer is not replayed; refresh is idempotent | 004 AC-2/4 | **R** | GuidedPlanningIntegrationTest.configuredRegionReadGrantNeedsNoTestIdsOrPerControlRules[0,1] (:750-904: read in ONE → fill in TWO equals CAPTURE, NAVIGATIONS 1, actions 5, production `GuidedStepVerifier`) [V]; refresh idempotency in migrated #13/#18; stale replay `STALE_GENERATION` in GuidedSessionIT:409-418 [V]. Its `FixtureAccess.complete` two-step verifier (:638-667) is a non-production verifier (obsolete element) |
| 7 | belowFoldClickUsesNativeRevealAndOneReceipt (2009) | Native scroll-reveal click; a duplicate advance gives one receipt | 004 AC-2/7 | **R** | runner `guided-targets.test.ts:140,143,146` (reveal without reacquire; no needless scroll; replaced-on-scroll stays uncertain) [V]; duplicate-advance gives one dispatch, kept in migrated #27 (:915-917) |
| 8 | producerReceiptAndOutcomeRollbackTogetherAfterRealReadAndNoReplay (1413) | Producer insert failure rolls back the outcome: `UNKNOWN_OUTCOME`, no producer, no replay | 004 AC-3/5 | **M** | Joined only |
| 9 | httpSuccessWithoutCommittedCompletionCallbackIsUnknownAndNeverRetried (1665) | HTTP 200 without a committed callback is `UNKNOWN_OUTCOME` and is never retried | 004 AC-5 | **R** | GuidedServiceTransportFaultIT.actualServicesJoinOneConsumedSecretReadAndPostWithAuthenticatedRecovery[COMPLETE_200_NO_CALLBACK]: state `UNKNOWN_OUTCOME` (:616-620), same and new key refused (:651-660), dispatchCount 1, posts 1 (:661-663) [V] |
| 10 | concurrentPreparationsForSameAdmissionKeyUseOneImmutableAdmission (1048) | Concurrent `prepareAndAdmit` with the same key gives one immutable admission | 004 AC-1/5 | **M** | This is the production recover race (two coordinators, one association key); joined |
| 11 | supportedV2AnswerResumesTrustedQuestionFixtureThenRefreshPreservesHistoricalSelection (2364) | A *forged* question in progress is answered, resumes and refreshes; the historical proposal is refused | (pre-OBS-005 stand-in) | **R-OBS** | On the single path questions exist only through the planner (`translationQuestion` → `questions.create`). With translation installed, `clarify` → `questions.accept` requires a `studio_guided_clarification_contexts` row, else `MISSING_SOURCE` (GuidedSessionService:832-834; GuidedClarificationContextStore:200-223) [V]. The case's own comment says the semantics belong to OBS-005 (:2414). Genuine behaviour is covered by planning IT configuredRegion[0,1] (AMBIGUOUS_TARGET answer → new coordinator → re-observe → fill the chosen field) and GuidedSessionIT:468-489, :610-644 [V]. Rule: ADR-SC-005 D-A |
| 12 | configuredRegionReadGrantNeedsNoTestIdsOrPerControlRules (1582) | A region read grant works with no testIds or per-control rules; the mounted config has no `rules`/`applicationPolicy` | 014 AC-1 (qaOracle 3) | **R** | Same-named joined planner test GuidedPlanningIntegrationTest:748-904 [V]; mounted-rules refusal in runner `runtime.test.ts:320`, `transport.test.ts:101` [V]; the two mounted-file assertions (:1641-1643) move into migrated #27 |
| 13 | committedObservationRecoversLostHttpResponseWithoutAnotherCollection (2132) | A lost refresh RPC response is recovered from the committed result, with no second collection | 004 AC-2/5 | **M** | Joined only |
| 14 | lateOldAcknowledgementDoesNotDowngradeNewerConsumedAction (1680) | A per-admission lost-ack on an older action does not downgrade a newer `DISPATCHING` one | 004 AC-5 | **M** | No equivalent assertion elsewhere (ReplayIT:6966 checks "adds nothing", not a newer action) [V] |
| 15 | failedRenewalStopsWithoutUsingUnacknowledgedLeaseOrReclaiming (1855) | Renewal failure stops; no reclaim, no revive | 004 AC-5 | **R** | runner `ownership.test.ts:58` (network/fence/lease/terminal → close once, assign/context `CONTEXT_LOST`, no further claims) [V]; backend GuidedSessionIT:279-300 (expired lease `STALE_FENCE`, no reclaim) [V]; joined lifecycle → `FAILED` kept in retained invalidAcknowledgedClaim… (:1924-1927) [V] |
| 16 | lateRenewalResponseAfterStopCannotReviveContextOrOwnership (1873) | A held *renewal* response released after stop cannot revive | 004 AC-5 | **M** | Runner unit covers a late *initial* claim (:68) and a terminal renewal (:58), not a stale non-terminal renewal after stop [V] |
| 17 | preventedNativeToggleNeverCommitsSuccessOrRetries (2674) | A prevented checkbox gives `UNKNOWN_OUTCOME`, one attempt, no retry | 004 AC-5/7 | **R** | runner `guided-targets.test.ts:175` (prevented/reverted/replaced → `UNKNOWN_OUTCOME`, receipt 1) [V]; backend refuses re-dispatch of `UNKNOWN_OUTCOME`: TransportFaultIT:651-660, GuidedSessionIT:325-330 [V] |
| 18 | concurrentRefreshRetriesJoinOneCollectionAndOneCommittedGeneration (2259) | Racing same-key refreshes give one collection and one generation | 004 AC-2/5 | **M** | Joined only |
| 19 | nativeRadioUncheckIsRefusedBeforeAnyBrowserAttempt (2709) | A radio uncheck is refused at prepare, before any input | 004 AC-2 | **R** | runner `guided-targets.test.ts:180` (validateInvocation false, `TARGET_CHANGED`, no receipt, still checked) [V]; on the backend a prepare refusal throws before `storePreparation`/`admit` (GuidedDispatchService:146-152) [V], so no action can exist |
| 20 | concurrentSameAndNewKeysHaveOneRealDispatch (1063) | Three racing dispatches give one real navigation | 004 AC-5/7; 015 AC-4(3) | **M** | "Concurrent consume winners" with a real runner; joined only |
| 21 | restartedWorkerCannotReclaimExistingAssignmentOrReplayBrowserEffects (1937) | A restarted worker cannot reclaim or replay | 004 AC-5 | **R** | runner `ownership.test.ts:68` (restarted `GuidedOwnership` on the same journal directory refuses assign, claims stay 1, no launch) [V]; journal fsync `runtime.test.ts:115,122` [V titles]; real-process kill mid-run is placed in OBS-009 (ADR-SC-005:92) [V] |
| 22 | actualDeferredCommitFailureSendsNothingAndRollsBackConsumption (1115) | A deferred commit failure sends nothing and rolls back | 004 AC-5 | **M** | Joined only |
| 23 | authorizedConfigurationReferenceIsAllocatedTransportedAndConsumedExactly (1554) | A configuration value is transported and filled exactly, and never persisted in actions | 004 AC-3/4 | **M** | planning IT `aDeclaredConfigurationSource…` (:906-932) proves only the question, not transport and fill [V] |
| 24 | renewalWhileBrowserDispatchIsBusyDoesNotResetOrRepeatTheAction (1835) | Renewal during a busy browser effect: no reset, no repeat | 004 AC-5 | **R** | runner `ownership.test.ts:53` (renews while a consumed action is busy, navigate once, re-dispatch rejected) [V]; backend GuidedSessionIT:925-937 (live-owner renewal keeps ADMITTED/DISPATCHING, dispatchCount 1) [V] |
| 25 | refreshRefusesActiveAdmissionUnresolvedPauseStaleScopeBudgetAndCancellation (2188) | Refresh refusals: foreign context, pause, budget, active admission, cancel | 004 AC-2/5 | **M** | Needs a *genuine* admitted-not-dispatched action (the helper gives exactly that); joined |
| 26 | cancellationBeforeConsumptionRevokesAndMissingStopAckNeverConfirmsTeardown (1471) | Cancel before consume gives REVOKED/CANCELLED; a missing stop ACK never confirms | 004 AC-5; H8 ruling | **R** | GuidedSessionIT:341-351 (REVOKED, consume `CANCELLED`) [V]; TransportFaultIT.teardownWithoutAckNeverConfirmsAndStopsAfterWindow (:3833-3885, stays PENDING) and actualStopOwnershipRecordsRealSenderRefusalWithoutConfirmation (:3559-3562) [V] |
| 27 | realBlankReadConsumerHasIndependentReceiptsAndNoSecondDispatch (894) | initialBlank/null origin, the first navigation, idempotent advance, premature consumer refused, a real read with exact bytes, callback duplicate/changed/value-leak refusals, value-free producer, consumer edge, cancel → CONFIRMED | 004 AC-1…4/7 | **M** | The core joined dataflow proof |
| 28 | cancellationBeforeAndAfterConsumePreventsFutureWorkAndPreservesUncertainty (1146) | Consumed-but-unsent then cancel gives `UNKNOWN_OUTCOME`; later dispatch `CANCELLED` | 004 AC-5 | **R** | GuidedSessionIT:352-358 (dispatch then cancel → `UNKNOWN_OUTCOME`, late outcome `CANCELLED`) and :341-351 [V]; joined cancel → CONFIRMED kept in migrated #27 and retained stopRetryAfterClose… [V] |
| 29 | nestedRollbackAndLostWinnerNeverManufactureSendAuthority (1083) | Ambient-transaction refusal; only the `WonConsumption` winner sends; restart without a permit sends nothing; lost ack → `UNKNOWN_OUTCOME` | 004 AC-5 ("transaction-winner-only") | **M** | Joined only |

**Coverage caveat (stated, not hidden).** GuidedSessionIT and GuidedServiceTransportFaultIT never call
`installTranslation` [V: grep]. They admit hand-crafted proposals through the conditional at
GuidedSessionService:1375 (`if (translation != null && translation.exists(id))`). I cite them only for
**post-admission** behaviour: consume, dispatch, outcome, cancel and teardown. That path does not branch on
translation: TransportFaultIT passes 28/28 with none installed [V: tfit-class01]. [I] So the post-admission code is the
same as production. They prove nothing about admission authority. See F-1.

## 4. MIGRATE change spec (mechanically applicable)

### 4.1 Files
- **New:** `backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgePlannedIT.java`, with
  `package com.citi.put.checks.studio.guided.session;`. That is the same package-in-`bridge`-folder convention as the
  source class. It is picked up by `include("**/*Test.class", "**/*IT.class")` (build.gradle.kts:105) [V].
- **Edit:** `GuidedBridgeIntegrationTest.java`. Delete the 29 methods in §3 (16 move, 13 retire). Keep the 9 passing
  methods byte-identical. Apply the §2 comment edit. Leave the helpers in place: they are package-private, so they
  trigger no compiler or spotbugs dead-code finding, and OBS-011 owns cleanup.
- **No production file changes.** No Gradle change.

### 4.2 Build the new class (in order)
- **N1.** Copy `GuidedBridgeIntegrationTest.java` (bytes `d48d4f0d…`). Rename the class and
  `classes = GuidedBridgePlannedIT.Application.class`. Change the `TEMP` prefix to `"guided-bridge-planned-"` and the
  evidence file to `/tmp/studio-obs015-bridge-planned-worker.json`, so concurrent forks cannot clobber each other.
- **N2.** Delete every `@Test` method except the 16 M rows. Delete `class FixtureAccess` (:589-725). In `@BeforeEach`,
  delete the `bridge_fixture_sources` and `bridge_fixture_configuration` DDL and seed (:793-809). In `createSession`,
  delete Dex's manual translation init (:2759-2774); production access does it inside `start`. Delete
  `materializeSession`; the planner bootstrap materializes `plan.sourceReferences`.
- **N3. `@SpringBootTest` properties:** add `"spring.jpa.hibernate.ddl-auto=none"`.
- **N4. `Application`.** Use GuidedPlanningIntegrationTest's annotations (:301-311) with `@Import` limited to
  `{GuidedInternalController, GuidedInternalSecurity, GuidedWireBodyAdvice}`:
  `@EnableAutoConfiguration(exclude = FlywayAutoConfiguration.class)`, `@EntityScan("com.citi.put.checks")`,
  `@EnableJpaRepositories("com.citi.put.checks.studio")`. Beans:
  - `completionFault`, `dataSource` (DriverManagerDataSource, so the per-test URL switch keeps working), `contracts`,
    `runner`, `dispatch`: verbatim from the bridge (:412-478, :538-555).
  - `repository(JdbcTemplate, PlatformTransactionManager)`: planning IT :326-329 form. JDBC and JPA
    (`StudioRepository.findByIdForUpdate`) must share one transaction.
  - `translationStore`, `questions`, `properties`, `snapshots`, `classifier`, `inputs`, `verifier`, `fixturePins()`,
    `access` (GuidedProductionSessionAccess), `materialization`, `transport`, `gateway`, `translation`: verbatim from
    planning IT :331-409 and :469-521. `transport` points at this class's `PROVIDER`.
  - `sessions`: planning IT :411-448, with one change. Governance is the bridge's
    `ObservedPublicationFixture.installGovernance(service, jdbc, "CSI-123", "orders", "fixture", List.of(ORIGIN), governedPolicy())`
    (bridge :527-534), because migrated reads rely on the class's `business-read` grant.
  - Do **not** register `GuidedTranslationCoordinator` or `GuidedSessionReaper`. No scheduler may advance a reservation
    behind the test.
- **N5. Static additions.** Append to the static block, before `APPLICATION.start()`:
  ```java
  static final HttpServer PROVIDER;                         // assigned in the static block
  static final java.util.List<String> PROVIDER_KINDS = new java.util.concurrent.CopyOnWriteArrayList<>();
  static volatile ObjectNode PLAN;                          // per-session SOURCE_PLAN template
  record Selection(int occurrence, ObjectNode action) {}
  static volatile Selection NEXT;                           // per-reservation NEXT_ACTION selection
  static volatile boolean configuredInput;                  // set in @BeforeEach for #23 only
  static final UUID STEP = UUID.randomUUID();               // re-assigned per test in @BeforeEach (see N6)
  ```
  The `PROVIDER` handler is planning IT :169-217 verbatim (envelope parse, `candidates[0].content.parts[0].text`,
  `usageMetadata` 100/100), with `providerResponse(request)` replaced by:
  ```java
  static ObjectNode providerResponse(JsonNode request) {
    String kind = request.path("kind").asText();
    PROVIDER_KINDS.add(kind);
    ObjectNode response = CONTRACTS.object().put("schemaVersion", 3).put("kind", kind)
        .put("requestId", request.path("requestId").asText());
    if (kind.equals("SOURCE_PLAN")) {
      ObjectNode plan = PLAN.deepCopy();
      if (plan.path("useConfiguration").asBoolean()) {        // planning IT :1185-1195 logic, verbatim
        plan.remove("useConfiguration");
        ObjectNode saved = null;
        for (JsonNode r : request.path("context").path("configurationReferences"))
          if (r.path("intendedSlot").asText().equals("fill.value")) saved = r.deepCopy();
        if (saved == null) throw new IllegalStateException("CONFIGURATION_REFERENCE_MISSING");
        saved.put("referenceKind", "configuration").put("configurationRevision", "1");
        if (!saved.path("kind").asText().equals("secretRef")) saved.remove("referenceName");
        plan.withArray("sourceReferences").add(saved);
      }
      return (ObjectNode) response.setAll(plan);
    }
    if (!kind.equals("NEXT_ACTION")) throw new IllegalStateException("UNEXPECTED_" + kind);
    Selection next = NEXT;
    JsonNode chosen = null;
    for (JsonNode o : request.path("context").path("obligations"))
      if (o.path("occurrence").asInt() == next.occurrence()) chosen = o;
    if (chosen == null) throw new IllegalStateException("UNPLANNED_OCCURRENCE");
    response.put("status", "ACTION").put("obligationId", chosen.path("obligationId").asText())
        .putNull("question").set("action", next.action().deepCopy());
    return response;
  }
  ```
- **N6. `@BeforeEach` additions**, after `seedPolicy` (:812-813):
  - `configuredInput = testName.equals("authorizedConfigurationReferenceIsAllocatedTransportedAndConsumedExactly");`
  - Clear `PROVIDER_KINDS`, `PLAN` and `NEXT`.
  - Insert `users`, `csi_systems` and one `ui_tests` row exactly as planning IT :617-644, with `steps = [TEXT()]`. The
    `variables` are `[{"name":"config","kind":"plain","value":CONFIG_INPUT}]` when `configuredInput`, else `[]`. The
    authoring is `AuthoringV2Request(2, null, List.of(new AuthoringStep(STEP, TEXT(), null)))` with
    `AuthoringRevisionIdentity.create(...)`. Keep the row id in an instance field `testId`. Make `STEP` an instance
    field set to `UUID.randomUUID()` per test.
  - `static String TEXT() { return "Visit " + ORIGIN + "/start then copy the displayed order into Destination and type fixture-input." + (configuredInput ? " Use <var config>." : ""); }`
- **N7. Session and plan helpers.** These replace `prepareSession`, `materializeSession` and the manual
  `pushContext` (the planner bootstrap pushes the context; GuidedTranslationService:304-326 [V]):
  ```java
  String createSession() // bridge :2739-2758 unchanged, but .put("testId", testId.toString()), "sourceRevision" "1", "configurationRevision" "1"; no manual translation init
  ObjectNode command(String id) // planning IT :3079-3090 verbatim
  String plannedSession(ObjectNode plan) throws Exception {
    PLAN = plan;
    String id = createSession();
    translation.plan(controller, id, 0, "plan-" + id, command(id));
    assertThat(progress(id).path("translationBootstrap").path("phase").asText()).isEqualTo("READY");
    assertThat(session(id).path("state").asText()).isEqualTo("PROPOSING");
    return id;
  }
  static ObjectNode span(String kind, String slot, int start, int end) { /* referenceKind sourceSpan, sourceRevision "1", stepId STEP, startUtf16, endUtf16, kind, intendedSlot */ }
  ObjectNode R0() { return span("destination", "navigate.destination", 6, 6 + (ORIGIN + "/start").length()); }
  ObjectNode R1() { int s = TEXT().lastIndexOf("fixture-input"); return span("nonsecretText", "fill.value", s, s + "fixture-input".length()); }
  // obligation(step, occurrence, kind, targetIntent, referenceIndex, needId): planning IT :3468-3488 verbatim
  ObjectNode PLAN_NAV()      // refs [R0]; obligations [nav(0,"page",ref 0)]; needs []
  ObjectNode PLAN_NAV_LIT()  // refs [R0,R1]; [nav(0,"page",0), fill(1,"destination",ref 1)]
  ObjectNode PLAN_DATAFLOW() // refs [R0]; [nav(0,"page",0), read(1,"source",need "order"), fill(2,"destination",need "order")];
                             // needs [{needId "order", producerStepId STEP, consumers [{stepId STEP, argumentSlot "fill.value"}]}]
  ObjectNode PLAN_CONFIG()   // refs [R0] + useConfiguration:true (provider appends the classified ref as index 1); [nav(0,"page",0), fill(1,"destination",ref 1)]
  String stepId(String id)   { return session(id).path("sourceSteps").get(0).path("stepId").asText(); }
  String bindingId(String id, String needId)   // sessions.translationTransaction(controller,id,1, c -> plan.needs[needId].bindingId)
  JsonNode input(String id, int referenceIndex) // runnerContext().authoredInputs.inputs entry whose provenance equals plan.sourceReferences[referenceIndex] (validator :345-349 equality)
  String inputId(String id, int referenceIndex) { return input(id, referenceIndex).path("inputId").asText(); }
  ```
- **N8. The obligation helper (core).**
  ```java
  JsonNode reserve(String id, JsonNode hand) throws Exception {
    for (ObjectNode a : repository.transaction(() -> repository.actions(id)))
      assertThat(a.path("state").asText()).as("reserve only after prior actions settle").isEqualTo("SUCCEEDED");
    ObjectNode action = CONTRACTS.object();
    ObjectNode target = hand.path("target").deepCopy();
    target.remove(java.util.List.of("documentId", "generation"));
    action.set("target", target);
    action.set("operation", hand.path("operation").deepCopy());
    int occurrence = hand.path("coordinate").path("ordinal").asInt();
    NEXT = new Selection(occurrence, action);
    var stopped = org.mockito.Mockito.spy(dispatch);
    org.mockito.Mockito.doThrow(new AssertionError("process-stop")).when(stopped).prepareAndAdmit(
        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq(id),
        org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyString(),
        org.mockito.ArgumentMatchers.any());
    var reserving = new GuidedTranslationService(sessions, repository, store, questions, stopped, gateway,
        CONTRACTS, new GuidedPromptAssembler(CONTRACTS), inputs, new GuidedProposalValidator(CONTRACTS),
        new GuidedDependencyPlanner(sessions), properties, Clock.systemUTC());
    reserving.installDatabase(jdbc);
    boolean reached = false;
    for (int n = 0; n < 3 && !reached; n++) {            // acquisition may return WAIT before NEXT_ACTION
      try {
        reserving.advance(controller, id, 1, "reserve-" + UUID.randomUUID(), command(id));
      } catch (AssertionError stop) {
        assertThat(stop).hasMessage("process-stop");
        reached = true;
      }
    }
    assertThat(reached).as("planner reached prepareAndAdmit").isTrue();
    JsonNode association = sessions.translationTransaction(controller, id, 1, current -> {
      for (JsonNode o : store.state(id).path("plan").path("obligations"))
        if (o.path("occurrence").asInt() == occurrence) return store.obligation(id, o.path("obligationId").asText());
      return null;
    });
    assertThat(association).as("planner-issued association").isNotNull();
    assertThat(association.path("admissionId").isNull()).isTrue();
    assertThat(association.path("admissionKey").asText()).startsWith("obligation-");
    return association;
  }
  JsonNode admit(String id, JsonNode association) throws Exception {   // production internal route, planner key and bytes
    return post(id, "admissions", association.path("proposal"), association.path("admissionKey").asText(),
        token("backend-controller", "controller-1", "studio-guided-controller"), 202);
  }
  ```
  The post-assertions are what fail loudly in two cases [V: logic]. If `advance` stopped in `recover()` instead (an
  older admitted action), there is no unadmitted association for the occurrence. If the reservation rolled back, there
  is no association at all. In neither case can a stop be mistaken for planner authority.
- **N9. Mechanical substitutions inside the 16 bodies** (old → new):
  - `prepareSession();` and the following `dispatch.pushContext(controller, id, 1);` →
    `plannedSession(PLAN_X());`, with PLAN_X from §4.3.
  - Positive `admit(id, P)` → `admit(id, reserve(id, P))`. Negative probes stay hand-crafted (R-4).
  - `sessions.allocateBinding(controller, id, 1, k, need)` used only for its `bindingId` → delete it, together with its
    `need` construction, and replace `allocation.path("bindingId")` / `binding.path("bindingId")` (`.asText()`) with
    `bindingId(id, "order")`.
  - `…authoredInputs.inputs.get(0).inputId` (navigate) → `inputId(id, 0)`. `.get(1)` (fixture-input) →
    `inputId(id, 1)`. `.get(2)` (configuration) → `input(id, 1)` / `inputId(id, 1)` in PLAN_CONFIG.
  - In `proposal(...)` (:2848) and every literal need or consumer, replace `"step-1"` with `stepId(id)`.
  - In `navigation(id)` (:1312-1326), replace the `.get(0)` lookup with `inputId(id, 0)`.

### 4.3 Per-case application

| Case | Plan | Case-specific edits beyond N9 |
|---|---|---|
| #27 realBlankRead | DATAFLOW | Keep `context`/`CONNECTIONS==1`/`NAVIGATIONS==0` (createSession still GETs `/connect` once). `JsonNode navigateAssociation = reserve(id, navigate); JsonNode first = admit(id, navigateAssociation);`. In :1033-1038, `navigate` → `navigateAssociation.path("proposal")` (and `(ObjectNode) …deepCopy()` for `fake`). Premature probe :923-941 **unchanged** (negative; still refused 422 `MISSING_SOURCE` by GuidedBindingStore:299 before the obligation gate [V]). read/fill → `reserve`. **Append:** the two mounted-file assertions from :1639-1643, and `assertThat(jdbc.queryForObject("SELECT string_agg(response::text,'') FROM studio_guided_commands WHERE namespace=?", String.class, id)).doesNotContain(CAPTURE.strip());` (compensates for retiring #1) |
| #10 concurrentPreparations | NAV | `JsonNode association = reserve(id, navigation(id));`, then race `dispatch.prepareAndAdmit(controller, id, 1, association.path("admissionKey").asText(), association.path("proposal"))` ×2 |
| #20, #29, #22 | NAV | N9 only |
| #5 currentSourceLock | DATAFLOW | Lock `SELECT source_revision FROM ui_tests WHERE id=? FOR UPDATE` (testId). Edit `UPDATE ui_tests SET source_revision=source_revision+1 WHERE id=?`; restore `…=1`. Config: `configuration_revision=configuration_revision+1` → expect `REVISION_CONFLICT`; restore `…=1` (no trigger on these columns, V12 [V]). Allocation part: keep the three `allocateBinding` calls with `need = {needId "order", producerStepId stepId(id), consumers [{stepId stepId(id), argumentSlot "fill.value"}]}` (+ `assert.expected` for "append"). Assert `allocation.path("bindingId")` equals `bindingId(id,"order")`. A direct controller allocation call is the precedent at planning IT:2486 and ReplayIT:7915 [V]; it is not obligation authority |
| #3 replacement, #14 lateOldAck | NAV_LIT | N9 only |
| #25 refreshRefuses | NAV_LIT | Forced pause/counter round trips kept (R-5). **Add** before the "active-admission" check: `assertThat(progress(id).path("generation").asInt()).isEqualTo(request.path("expectedGeneration").asInt());`, so the refusal is attributable to the active admission and not to staleness |
| #2 realWorkerRenews | DATAFLOW | Forced pause round trip kept (R-5). At :1774, `"assignment"` → `"translation-assignment"` (the planner's assignment key, GuidedTranslationService:151-152 [V]), so the duplicate-assign assertion keeps its meaning |
| #16 lateRenewal, #13, #18, #4 | NAV | N9 only |
| #8 producerReceipt | DATAFLOW | N9 only (the planned fill is unused) |
| #23 config | CONFIG | `JsonNode input = input(id, 1);` replaces `.get(2)`. The provenance/value assertions are unchanged |

### 4.4 Open [I] points and their deterministic fallbacks (Dex verifies; no fallback may break R-1…R-5)
- [I] The classifier accepts the bridge sentence's `/start` URL and `fixture-input` spans. *Fallback:* use the planning
  IT sentence shape `"Open " + ORIGIN + "/start and copy … London…"`, adjust R0/R1 offsets, and keep the page fixture.
- Plans with obligations a case never reaches (#5, #8) are the normal mid-session state. Every learning session holds
  pending obligations until it completes, and these cases end by cancel or teardown. No fallback is needed. If any
  plan is refused at `plan()`, stop and escalate. Do not seed.
- [I] The post-bootstrap state is `PROPOSING`. *Fallback:* assert `!FAILED`, and record the observed state in the
  evidence.

### 4.5 Static guards (must hold after the change)
- `grep -nE 'studio_guided_(obligation_admissions|translation_plans|translation_state|source_manifests)|acceptPlan\(|reserveObligation\(|attachAdmission\(|GuidedTranslationStore\([^)]*\)\.initialize' GuidedBridgePlannedIT.java` → 0 lines.
- In `GuidedBridgePlannedIT`, every `post(…"admissions"…, 202)` takes its key from an association.
- In `GuidedBridgeIntegrationTest`, no `"admissions"` post expects 202.
- `PROVIDER_KINDS` ⊆ {SOURCE_PLAN, NEXT_ACTION} for every case. Assert it in `@AfterEach`.

### 4.6 Acceptance for Dex's next window (no QA credit implied)
- `./gradlew test --tests '*GuidedBridgeIntegrationTest' --tests '*GuidedBridgePlannedIT'` → **9/9** and **16/16**
  PASS, 0 skipped.
- Record the `studio-runner/dist` digest spawned. This class joins the OBS-009 AC-12 i list.

## 5. Disclosure (scope facts; must be recorded, never silent)
- **Retired by name (13):** uncapturedPasswordAndInputEchoesStayPrivateAcrossActualDocumentNavigation,
  freshObservationConnectsTwoAuthoredStepsWithoutReplayingProducer,
  belowFoldClickUsesNativeRevealAndOneReceipt, httpSuccessWithoutCommittedCompletionCallbackIsUnknownAndNeverRetried,
  supportedV2AnswerResumesTrustedQuestionFixtureThenRefreshPreservesHistoricalSelection (OBSOLETE),
  configuredRegionReadGrantNeedsNoTestIdsOrPerControlRules,
  failedRenewalStopsWithoutUsingUnacknowledgedLeaseOrReclaiming, preventedNativeToggleNeverCommitsSuccessOrRetries,
  nativeRadioUncheckIsRefusedBeforeAnyBrowserAttempt, restartedWorkerCannotReclaimExistingAssignmentOrReplayBrowserEffects,
  renewalWhileBrowserDispatchIsBusyDoesNotResetOrRepeatTheAction,
  cancellationBeforeConsumptionRevokesAndMissingStopAckNeverConfirmsTeardown,
  cancellationBeforeAndAfterConsumePreventsFutureWorkAndPreservesUncertainty. (12 R + 1 R-OBS; the exact list is in
  `ruling.json.disclosure.retired`.)
- **Count reconciliation:** OBS-012A's by-name port proof baseline was `GuidedBridgeIntegrationTest 37=37`; H8 added
  `stopRetryAfterClose…`, making 38. New state: 9 + 16 moved + 13 retired = 38. @po records this in the OBS-015 Dev
  Agent Record. ADR-SC-005 ("v1 guided ITs are ported, not dropped", :57) governed the v1→v3 port. This ruling is the
  documented architect exception for single-path unreachability and duplication, with per-case covering tests. It is
  not a reinterpretation of that sentence.
- **OBS-014 AC-4 named exclusions:** `GuidedBridgePlannedIT` constructs `GuidedTranslationService` but plans no
  click/press/check, so it adds 0 to the AC-4 denominator. Add it to the named-exclusions sentence (story :322) with
  that reason.
- **Residual from retirement:** no single joined test now combines "echo page after real navigation" with a backend
  DB canary scan for a *password* echo. Runner real-Chromium coverage plus the #27 commands-response scan is the
  accepted substitute.

## 6. Findings for the coordinator (not changed here)
- **F-1 (single-path hygiene; security LOW, evidence MEDIUM).** GuidedSessionService keeps branches that are live only
  when translation is absent: :353, :799, :832, :1375, :1923 [V]. Production never reaches them: translation is
  installed unconditionally, and `start` initializes state in the same transaction [V]. GuidedSessionIT (43) and
  TransportFaultIT (28) rely on them to admit hand-crafted proposals. Recommendation: make the admission gate
  unconditional (`require(translation != null && translation.exists(id), "RUNTIME_INCOMPATIBLE", 409)` before
  `attachAdmission`), after those classes adopt the §4 helper. Placement decision for @po/coordinator: an OBS-015
  follow-up, or OBS-011 class C. Until then, citations into those classes are valid for post-admission behaviour only.
- **F-2.** The retained bridge cases still hand-materialize through `FixtureAccess`. OBS-004 Dev Notes sanction
  controlled classified sources for the bridge mechanism (story:60) [V], and none of these cases admits. Acceptable.
- **F-3.** The new class duplicates the bridge static fixture (≈800 lines), as the planning IT `Environment` already
  does (:3490). This is code-health debt for OBS-011.

## 7. Trade-offs considered
- A. Seed plan/obligation rows: **rejected** (R-1; tests would pass for proposals that production refuses).
- B. Make the gate optional: **rejected** (a production change with no defect; it reintroduces a second path).
- C. Call `store.acceptPlan/reserveObligation` from the test: **rejected** (it skips the validator, dependency planner
  and guard).
- D. Put the migrated cases inside GuidedPlanningIntegrationTest: **rejected**. Its `@AfterEach` cancels and awaits
  CONFIRMED, which breaks deliberate PENDING/UNKNOWN cases. Its GuardDecisionTally would count them. Its
  `Environment` statics are stopped in its `@AfterAll`.
- E. Migrate all 29: **rejected** for the 13 that are covered or obsolete. Cost: about 35 s of sleep-polling in #16/#24,
  flake exposure noted by the ADR panel. No capability is lost (§3 citations).
- **Chosen:** the real planner with a controlled provider, a process-stop at the committed reservation window, and the
  controller's admission through the production internal route using the planner-issued key and proposal.

— Aria (@architect), 2026-10-16
