package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.ExecutionReadiness;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.StudioProofPromotionService;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.dispatch.StudioScheduledUiTestLauncher;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.readiness.ExecutionReadinessService;
import com.citi.put.checks.studio.secrets.VaultProviderUnavailableException;
import com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Proof = replay of the published revision. A successful finalize accepts, inside the publication
 * commit transaction, exactly one observed replay (trigger source {@code AFTER_LEARN}) of the
 * revision it just published, and links it in {@code studio_learn_proofs}.
 *
 * <p>The real publisher, acceptance service, readiness gate, Postgres triggers and result projector
 * run; the only double is the runner's validation verdict, computed from the request the publisher
 * sends (no browser, no model). Learning is the synthetic relational evidence the other publication
 * ITs use.
 *
 * <ul>
 *   <li>one execution on the published revision, one link row, matching binding hashes;
 *   <li>a retry and a concurrent finalize leave one row;
 *   <li>each closed refusal class keeps the publication, records its code and publishes {@code
 *       proof null};
 *   <li>H-1 (fail-closed): a failure inside proof acceptance rolls the publication back;
 *   <li>a scheduled slot while the proof is pending is skipped {@code RUN_IN_PROGRESS}.
 * </ul>
 */
@SpringBootTest(properties = "studio.execution.callback.service-token=learn-proof-test")
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
class GuidedPublicationProofIT {
  private static final String CSI = "60492";
  private static final String OWNER = "learn-proof-owner@citi.com";
  private static final GuidedContracts C = new GuidedContracts();

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  @Autowired private GuidedPlanPublisher publisher;
  @Autowired private GuidedPublicationResultProjector projector;
  @Autowired private GuidedSessionRepository sessions;
  @Autowired private GuidedPublicationBaseRepository bases;
  @Autowired private TransactionTemplate tx;
  @Autowired private StudioProofPromotionService promotion;
  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioScheduledUiTestLauncher scheduler;
  @SpyBean private LearnProofRepository learnProofs;
  @SpyBean private ObservedReplayAuthorization observed;
  @SpyBean private StudioReferenceResolver references;
  @SpyBean private ExecutionReadinessService readiness;
  @SpyBean private StudioExecutionProperties execution;

  private Object originalValidator;

  @BeforeEach
  void setup() throws Exception {
    var fixture = new StudioExecutionFixtures(jdbc);
    fixture.seedUser(OWNER);
    fixture.seedCsi(CSI, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI);
    var field = GuidedPlanPublisher.class.getDeclaredField("validator");
    field.setAccessible(true);
    originalValidator = field.get(publisher);
    var validator = Mockito.mock(HttpRunnerDispatchClient.class);
    Mockito.when(validator.validate(any(), any(), Mockito.anyInt(), Mockito.anyLong()))
        .thenAnswer(call -> verdict(call.getArgument(0)));
    field.set(publisher, validator);
  }

  @AfterEach
  void restore() throws Exception {
    var field = GuidedPlanPublisher.class.getDeclaredField("validator");
    field.setAccessible(true);
    field.set(publisher, originalValidator);
    Mockito.reset(learnProofs, observed, references, readiness, execution);
  }

  /** The runner validator's verdict over exactly the request the publisher sent. */
  private static JsonNode verdict(JsonNode request) {
    PublicationContracts.Candidate candidate =
        new ObservedArtifactLowerer(C)
            .lower((ObjectNode) request.path("validationBasis"), request.path("requiredProfile"));
    ObjectNode verdict =
        C.object()
            .put("schemaVersion", 3)
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", request.path("attemptId").asText())
            .put("claimId", request.path("claimId").asText())
            .put("snapshotHash", request.path("snapshotHash").asText())
            .put("basisHash", request.path("basisHash").asText());
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash")) {
      verdict.set(key, candidate.hashes().path(key));
    }
    verdict.set("profile", request.path("requiredProfile"));
    verdict.set("build", request.path("requiredBuild"));
    return verdict;
  }

  private record Learned(UUID testId, String sessionId) {}

  /** A draft with a finished learn, in FINALIZING, never published. */
  private Learned finalizing() {
    UUID testId = ObservedPublicationFixture.guidedDraft(jdbc, CSI, "Production", OWNER);
    // The draft's step lines are the authored text, as for a draft created through the API.
    jdbc.update(
        "UPDATE ui_tests SET steps=jsonb_build_array(?::text) WHERE id=?",
        "Open " + ObservedPublicationFixture.ORIGIN,
        testId);
    return new Learned(testId, finalizingSession(testId));
  }

  private String finalizingSession(UUID testId) {
    String id = new ObservedPublicationFixture(jdbc).learnWithoutPublishing(testId);
    tx.executeWithoutResult(
        status -> {
          var current = sessions.lock(id);
          current.document().put("state", "OBSERVING");
          current
              .document()
              .putObject("owner")
              .put("workerId", "fixture-worker")
              .put("fence", 1)
              .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
          sessions.save(current);
        });
    var base = bases.find(id).orElseThrow();
    GuidedPublicationEvidenceFixture.completeExistingSession(jdbc, tx, id, base);
    tx.executeWithoutResult(
        status -> {
          var current = sessions.lock(id);
          current.progress().put("stepIndex", current.document().path("sourceSteps").size());
          current.document().put("state", "FINALIZING");
          sessions.save(current);
          jdbc.update(
              "UPDATE studio_guided_translation_state SET continuation='FINALIZING' WHERE"
                  + " session_id=?",
              id);
        });
    return id;
  }

  /**
   * The same owner, but with a Core user id that is not the e-mail (the normal production shape).
   */
  private Authentication coreUser() {
    return new com.citi.put.checks.security.BffAuthenticationToken(
        new com.citi.put.checks.security.UserIdentity(
            "core-user-42",
            OWNER,
            "Owner",
            "Ops",
            List.of(),
            List.of(new com.citi.put.checks.security.CsiOwnershipEntry(CSI, "owner"))));
  }

  private Authentication user() {
    return StudioExecutionFixtures.identity(OWNER, CSI, "owner");
  }

  private ObjectNode body(String id) {
    var base = bases.find(id).orElseThrow().document();
    return C.object()
        .put("schemaVersion", 3)
        .put("expectedSourceRevision", base.path("sourceRevision").asText())
        .put("expectedConfigurationRevision", base.path("configurationRevision").asText());
  }

  private PublicationContracts.Receipt finalize(String id, String key) {
    return publisher.finalizeForUser(
        user(), ObservedPublicationFixture.request(user()), id, key, body(id));
  }

  private int count(String sql, Object... args) {
    Integer value = jdbc.queryForObject(sql, Integer.class, args);
    return value == null ? 0 : value;
  }

  private Map<String, Object> link(String sessionId) {
    return jdbc.queryForMap("SELECT * FROM studio_learn_proofs WHERE session_id=?", sessionId);
  }

  private JsonNode result(String id) {
    return projector
        .read(user(), ObservedPublicationFixture.request(user()), id, true)
        .orElseThrow();
  }

  // ---- the proof ----

  @Test
  void finalizeAcceptsExactlyOneAfterLearnReplayOfThePublishedRevision() {
    Learned learned = finalizing();

    var receipt = finalize(learned.sessionId(), "proof-key-1");

    UUID revisionId = UUID.fromString(receipt.document().path("revisionId").asText());
    // Finalize records the revision; only the proof confirms it (ADR-SC-008 D5).
    assertThat(pointer("candidate_revision_id", learned.testId())).isEqualTo(revisionId);
    assertThat(pointer("confirmed_revision_id", learned.testId())).isNull();
    var executions =
        jdbc.queryForList(
            "SELECT id,status,trigger_source,schedule_id,scheduled_at,principal,revision_id,"
                + "observed_revision_binding::text AS binding FROM ui_test_executions"
                + " WHERE ui_test_id=?",
            learned.testId());
    assertThat(executions).as("exactly one proof execution").hasSize(1);
    var execution = executions.getFirst();
    assertThat(execution.get("status")).isEqualTo("PENDING");
    assertThat(execution.get("trigger_source")).isEqualTo("AFTER_LEARN");
    assertThat(execution.get("schedule_id")).isNull();
    assertThat(execution.get("scheduled_at")).isNull();
    assertThat(execution.get("principal")).isEqualTo(OWNER);
    assertThat(execution.get("revision_id")).isEqualTo(revisionId);

    JsonNode binding = C.parse((String) execution.get("binding"));
    JsonNode publicationDocument = receipt.document();
    var revision =
        jdbc.queryForMap(
            "SELECT revision_digest,artifact_hash,learned_plan_hash FROM ui_test_revisions"
                + " WHERE id=?",
            revisionId);
    assertThat(binding.path("revisionId").asText()).isEqualTo(revisionId.toString());
    assertThat(binding.path("revisionDigest").asText()).isEqualTo(revision.get("revision_digest"));
    assertThat(binding.path("artifactHash").asText()).isEqualTo(revision.get("artifact_hash"));
    assertThat(binding.path("learnedPlanHash").asText())
        .isEqualTo(revision.get("learned_plan_hash"));
    assertThat(binding.path("publicationEvidenceHash"))
        .isEqualTo(publicationDocument.path("publicationEvidenceHash"));
    assertThat(binding.path("principalId").asText()).isEqualTo(OWNER);

    var ledger =
        jdbc.queryForMap(
            "SELECT principal,idempotency_key,request_digest FROM studio_dispatch_ledger"
                + " WHERE execution_id=?",
            execution.get("id"));
    assertThat(ledger.get("principal")).isEqualTo(OWNER);
    assertThat(ledger.get("idempotency_key"))
        .as("the ledger idempotency index is not used")
        .isNull();

    var link = link(learned.sessionId());
    assertThat(link.get("execution_id")).isEqualTo(execution.get("id"));
    assertThat(link.get("revision_id")).isEqualTo(revisionId);
    assertThat(link.get("refusal_code")).isNull();

    JsonNode published = result(learned.sessionId());
    assertThat(published.path("publication").path("status").asText()).isEqualTo("PUBLISHED");
    assertThat(published.path("proof").path("executionId").asText())
        .isEqualTo(execution.get("id").toString());
    assertThat(published.path("evidence").path("video").isNull())
        .as("a published learn's recording is discarded")
        .isTrue();
    assertThat(published.path("actionTimings")).isEmpty();
    assertThat(published.path("replayVerified").asBoolean()).isFalse();
  }

  @Test
  void aFinalizeRetryAddsNothing() {
    Learned learned = finalizing();
    var first = finalize(learned.sessionId(), "proof-retry");

    var again = finalize(learned.sessionId(), "proof-retry");

    assertThat(again.document()).isEqualTo(first.document());
    assertThat(
            count("SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?", learned.testId()))
        .isEqualTo(1);
    assertThat(
            count("SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?", learned.testId()))
        .isEqualTo(1);
    assertThat(
            count(
                "SELECT count(*) FROM studio_learn_proofs WHERE session_id=?", learned.sessionId()))
        .isEqualTo(1);
  }

  @Test
  void concurrentFinalizesLeaveOneProof() throws Exception {
    Learned learned = finalizing();
    CountDownLatch go = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Future<Object>> calls =
          List.of(
              pool.submit(attempt(go, learned.sessionId())),
              pool.submit(attempt(go, learned.sessionId())));
      go.countDown();
      int published = 0;
      for (Future<Object> call : calls) {
        if (call.get() instanceof PublicationContracts.Receipt) {
          published++;
        }
      }
      assertThat(published).as("at least one finalize published").isPositive();
    } finally {
      pool.shutdownNow();
    }
    assertThat(
            count(
                "SELECT count(*) FROM studio_learn_proofs WHERE session_id=?", learned.sessionId()))
        .isEqualTo(1);
    assertThat(
            count("SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?", learned.testId()))
        .isEqualTo(1);
    assertThat(
            count("SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?", learned.testId()))
        .isEqualTo(1);
  }

  private Callable<Object> attempt(CountDownLatch go, String id) {
    return () -> {
      go.await();
      try {
        return finalize(id, "proof-concurrent");
      } catch (GuidedSessionException refused) {
        // The loser of the session lock may find the session already published and refuse.
        return refused;
      }
    };
  }

  // ---- refusals keep the publication ----

  private void assertRefused(Learned learned, String code) {
    var receipt = finalize(learned.sessionId(), "proof-refused-" + code);

    UUID revisionId = UUID.fromString(receipt.document().path("revisionId").asText());
    assertThat(pointer("candidate_revision_id", learned.testId()))
        .as("the publication is kept, recorded and not confirmed: %s", code)
        .isEqualTo(revisionId);
    assertThat(pointer("confirmed_revision_id", learned.testId())).isNull();
    assertThat(
            count("SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?", learned.testId()))
        .as("no execution: %s", code)
        .isZero();
    assertThat(
            count("SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?", learned.testId()))
        .isZero();
    var link = link(learned.sessionId());
    assertThat(link.get("refusal_code")).as("the closed code is stored").isEqualTo(code);
    assertThat(link.get("execution_id")).isNull();
    JsonNode published = result(learned.sessionId());
    assertThat(published.path("publication").path("status").asText()).isEqualTo("PUBLISHED");
    assertThat(published.path("proof").isNull()).as("never a refusal code: %s", code).isTrue();
    assertThat(published.toString()).doesNotContain(code);
    assertThat(published.path("evidence").path("video").isNull()).isTrue();
  }

  @Test
  void theKillSwitchRefusesTheProofAndKeepsThePublication() {
    Learned learned = finalizing();
    doReturn(false).when(execution).enabledOrDefault();

    assertRefused(learned, "DISPATCH_DISABLED");
  }

  @Test
  void aFullPendingQuotaRefusesTheProofAndKeepsThePublication() {
    Learned learned = finalizing();
    doReturn(new StudioExecutionProperties.Quotas(0, 200, 200)).when(execution).quotasOrDefault();

    assertRefused(learned, "PENDING_QUOTA_EXCEEDED");
  }

  @Test
  void aStepLimitRefusesTheProofAndKeepsThePublication() {
    Learned learned = finalizing();
    doReturn(new StudioExecutionProperties.Quotas(20, 200, 0)).when(execution).quotasOrDefault();

    assertRefused(learned, "STEP_LIMIT_EXCEEDED");
  }

  @Test
  void anUnavailableVaultRefusesTheProofAndKeepsThePublication() {
    Learned learned = finalizing();
    doThrow(new VaultProviderUnavailableException("vault down", null))
        .when(references)
        .preflight(any(), any(), any(), anyString(), any());

    assertRefused(learned, "VAULT_UNAVAILABLE");
  }

  @Test
  void anUnknownReferenceRefusesTheProofAndKeepsThePublication() {
    Learned learned = finalizing();
    doThrow(new StudioReferenceResolver.UnknownReferenceException("missing"))
        .when(references)
        .preflight(any(), any(), any(), anyString(), any());

    assertRefused(learned, "REFERENCE_UNAVAILABLE");
  }

  @Test
  void aReadinessRefusalRefusesTheProofAndKeepsThePublication() {
    Learned learned = finalizing();
    doReturn(ExecutionReadiness.Verdict.learnRequired("not ready"))
        .when(readiness)
        .evaluate(any(UITest.class));

    assertRefused(learned, "NOT_READY");
  }

  @Test
  void anUnsupportedRuntimeRefusesTheProofAndKeepsThePublication() {
    Learned learned = finalizing();
    doThrow(new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409))
        .when(observed)
        .prepareForPublication(any(), any(), anyString());

    assertRefused(learned, "RUNTIME_INCOMPATIBLE");
  }

  // ---- fail-closed (H-1) ----

  @Test
  void aFailureInsideProofAcceptanceRollsBackThePublication() {
    Learned learned = finalizing();
    doThrow(new IllegalStateException("injected proof failure"))
        .when(learnProofs)
        .insert(anyString(), any(), any(), any());

    assertThatThrownBy(() -> finalize(learned.sessionId(), "proof-h1"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("injected proof failure");

    assertThat(
            count(
                "SELECT count(*) FROM studio_guided_publications WHERE session_id=?",
                learned.sessionId()))
        .as("no receipt")
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_revision_id FROM ui_tests WHERE id=?",
                UUID.class,
                learned.testId()))
        .as("the revision pointer did not move")
        .isNull();
    assertThat(pointer("candidate_revision_id", learned.testId()))
        .as("no candidate either")
        .isNull();
    assertThat(count("SELECT count(*) FROM ui_test_revisions WHERE test_id=?", learned.testId()))
        .as("no revision")
        .isZero();
    assertThat(
            count("SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?", learned.testId()))
        .isZero();
    assertThat(
            count("SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?", learned.testId()))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT document->>'state' FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                learned.sessionId()))
        .as("the session is not SUCCEEDED")
        .isEqualTo("FINALIZING");
    assertThat(
            jdbc.queryForObject(
                "SELECT progress->'teardownRequest'->>'reason' FROM studio_guided_sessions"
                    + " WHERE session_id=?",
                String.class,
                learned.sessionId()))
        .as("no PUBLISHED stop was requested")
        .isNull();

    // The fault gone, the same finalize publishes: nothing was left half done.
    Mockito.reset(learnProofs);
    var receipt = finalize(learned.sessionId(), "proof-h1");
    assertThat(receipt.document().path("revisionId").asText()).isNotBlank();
    assertThat(link(learned.sessionId()).get("execution_id")).isNotNull();
  }

  // ---- interplay ----

  @Test
  void aScheduledSlotWhileTheProofIsPendingIsSkippedAsRunInProgress() {
    Learned learned = finalizing();
    finalize(learned.sessionId(), "proof-schedule");

    var result = scheduler.launch(learned.testId(), UUID.randomUUID(), Instant.now());

    assertThat(result.outcome())
        .isEqualTo(com.citi.put.checks.scheduling.ScheduledUiTestLauncher.Outcome.SKIPPED);
    assertThat(result.code()).isEqualTo("RUN_IN_PROGRESS");
  }

  @Test
  void aSecondPublicationOfTheSameTestProvesItsOwnRevision() {
    Learned first = finalizing();
    var firstReceipt = finalize(first.sessionId(), "proof-first");
    // Finish the first proof so the test is idle, then edit and learn again.
    jdbc.update("UPDATE studio_dispatch_ledger SET state='DONE' WHERE test_id=?", first.testId());

    String second = relearn(first.testId());
    var secondReceipt = finalize(second, "proof-second");

    UUID firstRevision = UUID.fromString(firstReceipt.document().path("revisionId").asText());
    UUID secondRevision = UUID.fromString(secondReceipt.document().path("revisionId").asText());
    assertThat(secondRevision).isNotEqualTo(firstRevision);
    var proofs =
        jdbc.queryForList(
            "SELECT session_id,revision_id FROM studio_learn_proofs WHERE session_id IN (?,?)",
            first.sessionId(),
            second);
    assertThat(proofs).hasSize(2);
    var secondProof = link(second);
    assertThat(secondProof.get("revision_id")).isEqualTo(secondRevision);
    assertThat(
            jdbc.queryForObject(
                "SELECT revision_id FROM ui_test_executions WHERE id=?",
                UUID.class,
                secondProof.get("execution_id")))
        .as("the new proof replays the new revision")
        .isEqualTo(secondRevision);
    assertThat(pointer("candidate_revision_id", first.testId()))
        .as("the newest recording is the candidate")
        .isEqualTo(secondRevision);
    assertThat(pointer("confirmed_revision_id", first.testId())).isNull();
    assertThat(link(first.sessionId()).get("revision_id")).isEqualTo(firstRevision);
  }

  // ---- recorded, then confirmed by the proof (ADR-SC-008 D5) ----

  private UUID pointer(String column, UUID testId) {
    return jdbc.queryForObject(
        "SELECT " + column + " FROM ui_tests WHERE id=?", UUID.class, testId);
  }

  private UUID proofExecution(UUID testId) {
    return jdbc.queryForObject(
        "SELECT id FROM ui_test_executions WHERE ui_test_id=? AND trigger_source='AFTER_LEARN'"
            + " ORDER BY started_at DESC LIMIT 1",
        UUID.class,
        testId);
  }

  /** What the runner's FINAL report leaves in step_results: one receipt per planned step. */
  private ArrayNode stepResults(UUID revisionId, String status, boolean goodHash) {
    JsonNode steps =
        C.parse(
                jdbc.queryForObject(
                    "SELECT artifact::text FROM ui_test_revisions WHERE id=?",
                    String.class,
                    revisionId))
            .path("steps");
    ArrayNode out = C.object().putArray("items");
    for (int index = 0; index < steps.size(); index++) {
      ObjectNode step =
          out.addObject().put("stepIndex", index).put("originalText", "").put("status", status);
      ObjectNode receipt = step.putObject("receipt");
      if ("PASS".equals(status)) {
        receipt.putNull("closedCode");
      } else {
        receipt.put("closedCode", "TARGET_DRIFT");
      }
      receipt
          .put(
              "stepHash",
              goodHash
                  ? GuidedContracts.hash(
                      steps.get(index).path("operations").path(0).path("operation"))
                  : "f".repeat(64))
          .put("fenceCrossed", true)
          .put("offscreen", false)
          .putArray("effects");
    }
    return out;
  }

  /** Leaves the proof execution as a FINAL report would, then runs the promotion hook. */
  private boolean finishProof(
      UUID testId, UUID revisionId, String executionStatus, ArrayNode steps) {
    UUID execution = proofExecution(testId);
    jdbc.update(
        "UPDATE ui_test_executions SET status=?, step_results=?::jsonb WHERE id=?",
        executionStatus,
        steps.toString(),
        execution);
    return callback(execution);
  }

  /** The promotion hook as the report transaction runs it. */
  private boolean callback(UUID execution) {
    return Boolean.TRUE.equals(tx.execute(status -> promotion.onFinal(execution)));
  }

  private record Recorded(UUID testId, UUID revisionId) {}

  private Recorded recorded() {
    Learned learned = finalizing();
    var receipt = finalize(learned.sessionId(), "recorded-" + learned.sessionId());
    return new Recorded(
        learned.testId(), UUID.fromString(receipt.document().path("revisionId").asText()));
  }

  @Test
  void aFullPassOfTheCandidatePromotesItOnceAndWritesReceiptsBoundToIds() {
    Recorded recorded = recorded();

    assertThat(
            finishProof(
                recorded.testId(),
                recorded.revisionId(),
                "PASSED",
                stepResults(recorded.revisionId(), "PASS", true)))
        .isTrue();

    assertThat(pointer("confirmed_revision_id", recorded.testId()))
        .isEqualTo(recorded.revisionId());
    assertThat(pointer("candidate_revision_id", recorded.testId())).isNull();
    var receipts =
        jdbc.queryForList(
            "SELECT status, proof_execution_id, step_hash FROM studio_step_receipts WHERE revision_id=?",
            recorded.revisionId());
    assertThat(receipts).isNotEmpty();
    assertThat(receipts)
        .allSatisfy(
            row -> {
              assertThat(row.get("status")).isEqualTo("PASSED");
              assertThat(row.get("proof_execution_id"))
                  .isEqualTo(proofExecution(recorded.testId()));
              assertThat(row.get("step_hash")).isNotNull();
            });

    // The examples recorder ran after the report transaction committed (ADR-SC-008 D6).
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_step_examples WHERE revision_id=?",
                Integer.class,
                recorded.revisionId()))
        .isPositive();

    // A duplicate callback finds the candidate already cleared: it counts once.
    assertThat(callback(proofExecution(recorded.testId()))).isFalse();
    assertThat(pointer("confirmed_revision_id", recorded.testId()))
        .isEqualTo(recorded.revisionId());
  }

  @Test
  void aProofThatIsNotAFullPassNeverPromotes() {
    // FAILED step, SKIPPED (NOT_RUN) step with a passed execution, tampered hash, and an ERROR run.
    record Case(String name, String executionStatus, String stepStatus, boolean goodHash) {}
    for (Case c :
        List.of(
            new Case("failed", "FAILED", "FAIL", true),
            new Case("notRun", "PASSED", "SKIPPED", true),
            new Case("tampered", "PASSED", "PASS", false),
            new Case("error", "ERROR", "SKIPPED", true))) {
      Recorded recorded = recorded();
      assertThat(
              finishProof(
                  recorded.testId(),
                  recorded.revisionId(),
                  c.executionStatus(),
                  stepResults(recorded.revisionId(), c.stepStatus(), c.goodHash())))
          .as(c.name())
          .isFalse();
      assertThat(pointer("confirmed_revision_id", recorded.testId())).as(c.name()).isNull();
      assertThat(pointer("candidate_revision_id", recorded.testId()))
          .as(c.name())
          .isEqualTo(recorded.revisionId());
    }
  }

  @Test
  void aLatePassOfASupersededRevisionDoesNotConfirmTheNewerOne() {
    Recorded first = recorded();
    UUID firstProof = proofExecution(first.testId());
    jdbc.update("UPDATE studio_dispatch_ledger SET state='DONE' WHERE test_id=?", first.testId());
    var second = finalize(relearn(first.testId()), "late-second");
    UUID secondRevision = UUID.fromString(second.document().path("revisionId").asText());
    assertThat(pointer("candidate_revision_id", first.testId())).isEqualTo(secondRevision);

    jdbc.update(
        "UPDATE ui_test_executions SET status='PASSED', step_results=?::jsonb WHERE id=?",
        stepResults(first.revisionId(), "PASS", true).toString(),
        firstProof);

    assertThat(callback(firstProof)).isFalse();
    assertThat(pointer("confirmed_revision_id", first.testId())).isNull();
    assertThat(pointer("candidate_revision_id", first.testId())).isEqualTo(secondRevision);
  }

  @Test
  void twoConcurrentPromotionAttemptsForTheSameCandidatePromoteExactlyOnce() throws Exception {
    Recorded recorded = recorded();
    UUID execution = proofExecution(recorded.testId());
    jdbc.update(
        "UPDATE ui_test_executions SET status='PASSED', step_results=?::jsonb WHERE id=?",
        stepResults(recorded.revisionId(), "PASS", true).toString(),
        execution);
    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      Callable<Boolean> attempt =
          () -> {
            start.await();
            return callback(execution);
          };
      Future<Boolean> first = pool.submit(attempt), second = pool.submit(attempt);
      start.countDown();
      boolean a = first.get(30, java.util.concurrent.TimeUnit.SECONDS);
      boolean b = second.get(30, java.util.concurrent.TimeUnit.SECONDS);
      assertThat(a ^ b).as("exactly one attempt promoted, the other was a no-op").isTrue();
    } finally {
      pool.shutdownNow();
    }
    assertThat(pointer("confirmed_revision_id", recorded.testId()))
        .isEqualTo(recorded.revisionId());
    assertThat(pointer("candidate_revision_id", recorded.testId())).isNull();
    assertThat(
            count(
                "SELECT count(*) FROM studio_step_receipts WHERE revision_id=?",
                recorded.revisionId()))
        .as("one set of receipts")
        .isEqualTo(
            count(
                "SELECT count(DISTINCT step_ordinal) FROM studio_step_receipts WHERE revision_id=?",
                recorded.revisionId()));
  }

  @Test
  void theVerificationFollowsTheProof() {
    Recorded recorded = recorded();
    assertThat(readiness.readiness(recorded.testId()).name()).isEqualTo("RECORDED");
    assertThat(promotion.verification(recorded.testId(), recorded.revisionId()).state())
        .isEqualTo("PENDING");

    finishProof(
        recorded.testId(),
        recorded.revisionId(),
        "FAILED",
        stepResults(recorded.revisionId(), "FAIL", true));
    assertThat(promotion.verification(recorded.testId(), recorded.revisionId()).state())
        .isEqualTo("FAILED");

    // A passed execution whose receipts do not match is not promoted: INCOMPLETE, so Verify again
    // is offered.
    finishProof(
        recorded.testId(),
        recorded.revisionId(),
        "PASSED",
        stepResults(recorded.revisionId(), "PASS", false));
    var incomplete = promotion.verification(recorded.testId(), recorded.revisionId());
    assertThat(incomplete.state()).isEqualTo("INCOMPLETE");
    assertThat(incomplete.firstUnverifiedStepId()).isNotNull();

    finishProof(
        recorded.testId(),
        recorded.revisionId(),
        "ERROR",
        stepResults(recorded.revisionId(), "SKIPPED", true));
    assertThat(promotion.verification(recorded.testId(), recorded.revisionId()).state())
        .isEqualTo("INCOMPLETE");
  }

  @Test
  void promotionAndTheLastRunProjectionInOneReportTransactionKeepTheConfirmedPointer() {
    Recorded recorded = recorded();
    UUID execution = proofExecution(recorded.testId());
    jdbc.update(
        "UPDATE ui_test_executions SET status='PASSED', step_results=?::jsonb, started_at=started_at WHERE id=?",
        stepResults(recorded.revisionId(), "PASS", true).toString(),
        execution);

    tx.executeWithoutResult(
        status -> {
          promotion.onFinal(execution);
          studioService.applyLastRunProjection(execution);
        });

    assertThat(pointer("confirmed_revision_id", recorded.testId()))
        .as("the stale entity flush did not undo the promotion")
        .isEqualTo(recorded.revisionId());
    assertThat(pointer("candidate_revision_id", recorded.testId())).isNull();
  }

  /** Sets the one step's text in both places the draft keeps it. */
  private void setDraftText(UUID testId, String text) {
    jdbc.update(
        "UPDATE ui_tests SET steps=jsonb_build_array(?::text),"
            + " authoring=jsonb_set(authoring,'{steps,0,text}',to_jsonb(?::text)) WHERE id=?",
        text,
        text,
        testId);
  }

  /** A test whose first revision A is confirmed and whose second B is recorded (B's proof idle). */
  private record Confirmed(
      UUID testId, UUID confirmedRevision, UUID recordedRevision, String originalText) {}

  private static void noHook() {}

  private Confirmed confirmedAThenRecordedB(Runnable beforeSecondLearn) {
    Recorded a = recorded();
    assertThat(
            finishProof(
                a.testId(), a.revisionId(), "PASSED", stepResults(a.revisionId(), "PASS", true)))
        .isTrue();
    jdbc.update("UPDATE studio_dispatch_ledger SET state='DONE' WHERE test_id=?", a.testId());
    String original = "Open " + ObservedPublicationFixture.ORIGIN;
    beforeSecondLearn.run();
    setDraftText(a.testId(), original + " again");
    var second = finalize(relearn(a.testId()), "recorded-b-" + a.testId());
    jdbc.update("UPDATE studio_dispatch_ledger SET state='DONE' WHERE test_id=?", a.testId());
    return new Confirmed(
        a.testId(),
        a.revisionId(),
        UUID.fromString(second.document().path("revisionId").asText()),
        original);
  }

  @Test
  void aDraftRevertedToTheConfirmedRevisionRunsThatRevisionNotTheRecordedOne() {
    Confirmed c = confirmedAThenRecordedB(GuidedPublicationProofIT::noHook);
    assertThat(pointer("confirmed_revision_id", c.testId())).isEqualTo(c.confirmedRevision());
    assertThat(pointer("candidate_revision_id", c.testId())).isEqualTo(c.recordedRevision());

    // The draft follows B: the one resolver names B, and the label agrees.
    assertThat(readiness.runnableRevisionId(c.testId())).isEqualTo(c.recordedRevision());
    assertThat(readiness.readiness(c.testId()))
        .isEqualTo(com.citi.put.checks.studio.readiness.StudioReadiness.RECORDED);

    // Reverted to A's text it follows A: the same resolver names A, so Run is READY and not a
    // diagnostic.
    setDraftText(c.testId(), c.originalText());
    assertThat(readiness.runnableRevisionId(c.testId())).isEqualTo(c.confirmedRevision());
    assertThat(readiness.readiness(c.testId()))
        .isEqualTo(com.citi.put.checks.studio.readiness.StudioReadiness.READY);
  }

  @Test
  void
      aScheduledSlotRunsTheOldConfirmedRevisionUnderItsStoredConfigurationWhileACandidateIsRecorded() {
    Confirmed c = confirmedAThenRecordedB(GuidedPublicationProofIT::noHook);
    int storedTimeout = storedTimeoutOf(c.confirmedRevision());
    jdbc.update("UPDATE ui_tests SET timeout_seconds=timeout_seconds+7 WHERE id=?", c.testId());
    UUID schedule = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO schedules(id, ui_test_id, check_type, frequency, cron_expression, timezone,"
            + " enabled, next_execution_at) VALUES (?, ?, 'UI_TEST', 'custom', '0 0 0 1 1 *',"
            + " 'UTC', true, now() + interval '30 days')",
        schedule,
        c.testId());

    // The cron dispatcher calls the launcher inside the schedule's transaction.
    var result = tx.execute(status -> scheduler.launch(c.testId(), schedule, Instant.now()));

    assertThat(result.outcome())
        .isEqualTo(com.citi.put.checks.scheduling.ScheduledUiTestLauncher.Outcome.ACCEPTED);
    var run =
        jdbc.queryForMap(
            "SELECT revision_id, diagnostic, configuration_snapshot::text AS snapshot"
                + " FROM ui_test_executions WHERE ui_test_id=? AND trigger_source='SCHEDULED'",
            c.testId());
    assertThat(run.get("revision_id"))
        .as("the confirmed revision, not the candidate")
        .isEqualTo(c.confirmedRevision());
    assertThat(run.get("diagnostic")).isEqualTo(false);
    assertThat(C.parse((String) run.get("snapshot")).path("timeoutSeconds").asInt())
        .as("the revision's own stored configuration, not the draft's")
        .isEqualTo(storedTimeout)
        .isNotEqualTo(
            jdbc.queryForObject(
                "SELECT timeout_seconds FROM ui_tests WHERE id=?", Integer.class, c.testId()));
    assertThat(pointer("confirmed_revision_id", c.testId())).isEqualTo(c.confirmedRevision());

    // A draft whose environment moved on is not replayed under the old revision's environment.
    jdbc.update("UPDATE studio_dispatch_ledger SET state='DONE' WHERE test_id=?", c.testId());
    jdbc.update("UPDATE ui_tests SET environment='Staging' WHERE id=?", c.testId());
    var refused =
        tx.execute(status -> scheduler.launch(c.testId(), schedule, Instant.now().plusSeconds(60)));
    assertThat(refused.outcome())
        .isEqualTo(com.citi.put.checks.scheduling.ScheduledUiTestLauncher.Outcome.SKIPPED);
    assertThat(
            count(
                "SELECT count(*) FROM ui_test_executions WHERE ui_test_id=? AND"
                    + " trigger_source='SCHEDULED'",
                c.testId()))
        .isEqualTo(1);
  }

  // ---- POST /tests/{id}/verify ("Verify again", D-4) ----

  private String verifyCode(UUID testId, String key) {
    var thrown =
        org.assertj.core.api.Assertions.catchThrowableOfType(
            () ->
                studioService.verifyRecorded(
                    testId, coreUser(), key, ObservedPublicationFixture.request(coreUser())),
            com.citi.put.checks.studio.StudioConflictException.class);
    assertThat(thrown).as("a 409 was expected").isNotNull();
    return thrown.getCode();
  }

  @Test
  void verifyAgainIsAcceptedOnlyAfterAProofThatDidNotFinishAndAPassPromotes() {
    Recorded recorded = recorded();

    // The proof is still running: nothing to verify again.
    assertThat(verifyCode(recorded.testId(), "verify-pending")).isEqualTo("VERIFY_NOT_AVAILABLE");

    // A proof that ended in error (cancelled, timed out, refused) is INCOMPLETE: accepted and
    // queued.
    finishProof(
        recorded.testId(),
        recorded.revisionId(),
        "ERROR",
        stepResults(recorded.revisionId(), "SKIPPED", true));
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state='DONE' WHERE test_id=?", recorded.testId());
    var accepted =
        studioService.verifyRecorded(
            recorded.testId(),
            coreUser(),
            "verify-incomplete",
            ObservedPublicationFixture.request(coreUser()));
    assertThat(accepted.status()).isEqualTo("PENDING");
    assertThat(accepted.revisionId())
        .as("the same recorded revision")
        .isEqualTo(recorded.revisionId());
    assertThat(accepted.triggerSource()).isEqualTo("AFTER_LEARN");
    assertThat(accepted.diagnostic()).isFalse();
    assertThat(
            count(
                "SELECT count(*) FROM ui_test_executions WHERE ui_test_id=? AND trigger_source='AFTER_LEARN'",
                recorded.testId()))
        .isEqualTo(2);
    assertThat(pointer("candidate_revision_id", recorded.testId()))
        .isEqualTo(recorded.revisionId());
    // The same key returns the same execution.
    assertThat(
            studioService
                .verifyRecorded(
                    recorded.testId(),
                    coreUser(),
                    "verify-incomplete",
                    ObservedPublicationFixture.request(coreUser()))
                .executionId())
        .isEqualTo(accepted.executionId());

    // Its proof passing promotes the revision under the ordinary rule.
    assertThat(
            finishProof(
                recorded.testId(),
                recorded.revisionId(),
                "PASSED",
                stepResults(recorded.revisionId(), "PASS", true)))
        .isTrue();
    assertThat(pointer("confirmed_revision_id", recorded.testId()))
        .isEqualTo(recorded.revisionId());

    // Nothing is recorded any more.
    assertThat(verifyCode(recorded.testId(), "verify-confirmed")).isEqualTo("NOT_RECORDED");
  }

  @Test
  void verifyAgainIsRefusedAfterAFailedProof() {
    Recorded recorded = recorded();
    finishProof(
        recorded.testId(),
        recorded.revisionId(),
        "FAILED",
        stepResults(recorded.revisionId(), "FAIL", true));
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state='DONE' WHERE test_id=?", recorded.testId());

    assertThat(verifyCode(recorded.testId(), "verify-failed")).isEqualTo("VERIFY_NOT_AVAILABLE");
    assertThat(
            count(
                "SELECT count(*) FROM ui_test_executions WHERE ui_test_id=? AND trigger_source='AFTER_LEARN'",
                recorded.testId()))
        .as("a failure is evidence: nothing was queued")
        .isEqualTo(1);
  }

  @Test
  void reLearnFromAStepUsesTheRecordedCandidateAsItsBase() {
    Confirmed c = confirmedAThenRecordedB(GuidedPublicationProofIT::noHook);
    String stepId =
        jdbc.queryForObject(
            "SELECT authoring->'steps'->0->>'id' FROM ui_tests WHERE id=?",
            String.class,
            c.testId());
    var store = new com.citi.put.checks.studio.guided.session.GuidedIncrementalStore(jdbc, C);
    ObjectNode request =
        C.object().put("testId", c.testId().toString()).put("firstLearnStepId", stepId);

    var selection = store.select(request, com.citi.put.checks.studio.support.TestDomains.FIXTURES);

    assertThat(selection.change().baseRevisionId())
        .as("the base is the recorded candidate B, not the confirmed A")
        .isEqualTo(c.recordedRevision())
        .isNotEqualTo(c.confirmedRevision());
    assertThat(selection.program().path("baseRevisionId").asText())
        .isEqualTo(c.recordedRevision().toString());

    // A client that still names the confirmed revision as the base is refused, not silently
    // re-based.
    ObjectNode stale = request.deepCopy().put("baseRevisionId", c.confirmedRevision().toString());
    assertThatThrownBy(
            () -> store.select(stale, com.citi.put.checks.studio.support.TestDomains.FIXTURES))
        .isInstanceOf(GuidedSessionException.class);
  }

  private int storedTimeoutOf(UUID revisionId) {
    return C.parse(
            jdbc.queryForObject(
                "SELECT configuration::text FROM ui_test_revisions WHERE id=?",
                String.class,
                revisionId))
        .path("timeoutSeconds")
        .asInt();
  }

  /** A second finished learn of a published test. */
  private String relearn(UUID testId) {
    return finalizingSession(testId);
  }
}
