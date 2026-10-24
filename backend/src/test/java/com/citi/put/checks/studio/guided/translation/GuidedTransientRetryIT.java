package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.translation.CredentialPatternScreen;
import com.citi.put.checks.studio.guided.translation.GuidedCallBudget;
import com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore;
import com.citi.put.checks.studio.guided.translation.GuidedDependencyPlanner;
import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedModelRequest;
import com.citi.put.checks.studio.guided.translation.GuidedModelResponse;
import com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler;
import com.citi.put.checks.studio.guided.translation.GuidedProposalValidator;
import com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier;
import com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationService;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Round 053 (b), obligations 4 to 9 and 12: the translation coordinator creates the next attempt
 * after a REJECTED attempt whose persisted closed reason is definite-transient, and only then. Real
 * PostgreSQL, real session service and store, the real coordinator; the provider is a scripted port
 * that answers with the closed result the adapter would produce (the adapter's own classification
 * is proven separately in GuidedGatewayPrivacyTest). A SOURCE_PLAN {@code UNSUPPORTED} answer is
 * the success that ends {@code plan()} before any runner bootstrap, so no runner or browser is
 * involved.
 */
class GuidedTransientRetryIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");
  private static final GuidedContracts C = new GuidedContracts();
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final long BASE_MILLIS = 250;
  private static final String CANARY = "provider-prose-secret-canary";

  private final Authentication user =
      new BffAuthenticationToken(
          new UserIdentity(
              "retry-user",
              "retry@example.invalid",
              "Retry",
              "Test",
              List.of(),
              List.of(new CsiOwnershipEntry("CSI-123", "owner"))));
  private final Authentication worker =
      new GuidedInternalSecurity.Identity("worker-1", "owning-worker");
  private final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");
  private final ScriptedGateway gateway = new ScriptedGateway();
  private final List<Long> sleeps = new ArrayList<>();
  private final MutableClock clock = new MutableClock();
  private JdbcTemplate jdbc;
  private GuidedSessionRepository repository;
  private GuidedSessionService service;
  private GuidedTranslationStore store;
  private GuidedTranslationService translation;
  private GuidedTranslationProperties translationProperties;
  private String sessionId;
  private UUID testId;
  private Runnable duringBackoff;

  @BeforeAll
  static void startDatabase() {
    POSTGRES.start();
  }

  @AfterAll
  static void stopDatabase() {
    POSTGRES.stop();
  }

  @AfterEach
  void clearInterrupt() {
    Thread.interrupted();
  }

  // ── fixture ────────────────────────────────────────────────────────────────────────────────

  /** A fresh database and a claimed, initialized session at fence 1. */
  private void fixture(Map<String, Integer> limits) throws Exception {
    gateway.requests.clear();
    gateway.script.clear();
    sleeps.clear();
    duringBackoff = null;
    String database = "transient_retry_" + UUID.randomUUID().toString().replace("-", "");
    new JdbcTemplate(
            new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()))
        .execute("CREATE DATABASE " + database);
    DataSource source =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl().replace(POSTGRES.getDatabaseName(), database),
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    Flyway.configure()
        .dataSource(source)
        .locations("classpath:db/migration")
        .target("23")
        .load()
        .migrate();
    jdbc = new JdbcTemplate(source);
    var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    repository = new GuidedSessionRepository(jdbc, tx, C);
    store = new GuidedTranslationStore(jdbc, C);
    translationProperties =
        new GuidedTranslationProperties(
            true,
            true,
            List.of("orders"),
            List.of("fixture"),
            65536,
            4096,
            60,
            "worker-1",
            false,
            (int) BASE_MILLIS);
    var prompts = new GuidedPromptAssembler(C);
    seedSource();
    var access = new PersistedSourceAccess();
    service =
        new GuidedSessionService(
            repository, C, access, new GuidedSessionProperties(true, limits), clock);
    var materialization = new GuidedMaterializationService(jdbc, C);
    service.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, C),
        new GuidedBindingStore(jdbc, C, materialization),
        new GuidedAssignmentStore(jdbc, C));
    var questions = new GuidedClarificationContextStore(jdbc, C);
    service.installTranslation(store, questions);
    service.installEvidence(
        new com.citi.put.checks.studio.guided.evidence.RecordedGuidedEvidenceProjection(
            new com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceRepository(jdbc),
            new com.citi.put.checks.studio.guided.evidence.GuidedRecordingProperties(null),
            false,
            C));
    service.installPresentation(new GuidedPublicPresentationProjector(jdbc, C));
    com.citi.put.checks.studio.support.ObservedPublicationFixture.installGovernance(
        service,
        jdbc,
        "CSI-123",
        "orders",
        "fixture",
        List.of("https://orders.example.test"),
        null);
    ObjectNode start =
        C.object()
            .put("schemaVersion", 3)
            .put("testId", testId.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", "fixture")
            .put("applicationId", "orders");
    start.set("versions", C.parse("{\"contract\":3}"));
    sessionId = service.start(user, "retry-start", start).path("sessionId").asText();
    repository.transaction(
        () -> {
          var session = repository.lock(sessionId);
          store.initialize(
              session.document(),
              access.classifier.classify(access.current(), session.document().path("scope")));
          return null;
        });
    service.prepareAssignment(controller, sessionId, "retry-assignment", "worker-1");
    ObjectNode claim =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", sessionId)
            .put("workerId", "worker-1")
            .put("expectedFence", 0);
    claim.set("versions", C.parse("{\"contract\":3}"));
    service.claim(worker, sessionId, "retry-claim", claim);
    translation =
        new GuidedTranslationService(
            service,
            repository,
            store,
            questions,
            new GuidedDispatchService(service, materialization, null),
            gateway,
            C,
            prompts,
            new GuidedSourceInputResolver(C),
            new GuidedProposalValidator(C),
            new GuidedDependencyPlanner(service),
            translationProperties,
            clock);
    translation.installDatabase(jdbc);
    translation.useBackoffSleeper(
        millis -> {
          assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
          sleeps.add(millis);
          if (duringBackoff != null) {
            duringBackoff.run();
          }
        });
  }

  private JsonNode plan() {
    return translation.plan(controller, sessionId, 1, "plan-key", command());
  }

  private ObjectNode command() {
    return repository.transaction(
        () ->
            C.object()
                .put("schemaVersion", 3)
                .put("sessionId", sessionId)
                .put("expectedSourceRevision", "1")
                .put("expectedConfigurationRevision", "1")
                .put("expectedPlanRevision", store.state(sessionId).path("planRevision").asInt()));
  }

  private List<String> rows() {
    return jdbc.queryForList(
        "SELECT attempt_number||':'||status||':'||COALESCE(rejection_reason,'-') FROM"
            + " studio_guided_model_attempts WHERE session_id=? ORDER BY attempt_number",
        String.class,
        sessionId);
  }

  private JsonNode document() {
    return repository.transaction(() -> repository.lock(sessionId).document().deepCopy());
  }

  private String errorCode() {
    return repository.transaction(
        () -> repository.lock(sessionId).progress().path("errorCode").asText());
  }

  private GuidedSessionException refusal() {
    var thrown = new GuidedSessionException[1];
    assertThatThrownBy(this::plan)
        .isInstanceOfSatisfying(GuidedSessionException.class, e -> thrown[0] = e);
    return thrown[0];
  }

  // ── scripted provider steps ────────────────────────────────────────────────────────────────

  private static Function<GuidedModelRequest, GuidedModelResponse> fail(
      GuidedModelResponse.Reason reason) {
    return request -> new GuidedModelResponse(reason.code(), null, null, null, "model", reason);
  }

  /** The OK answer that ends plan() before any runner bootstrap. */
  private static Function<GuidedModelRequest, GuidedModelResponse> unsupported(
      Integer input, Integer output) {
    return request ->
        new GuidedModelResponse(
            GuidedModelResponse.Code.OK,
            C.object().put("status", "UNSUPPORTED").put("reasonCode", "MISSING_SOURCE"),
            input,
            output,
            "model");
  }

  /** An OK answer the plan validator refuses, an apply-side INVALID_CONTRACT refusal. */
  private static Function<GuidedModelRequest, GuidedModelResponse> applyRefusal() {
    return request ->
        new GuidedModelResponse(
            GuidedModelResponse.Code.OK, C.object().put("status", "PLAN"), null, null, "model");
  }

  private static Function<GuidedModelRequest, GuidedModelResponse> adapterFault() {
    return request -> {
      throw new IllegalStateException(CANARY);
    };
  }

  @SafeVarargs
  private void script(Function<GuidedModelRequest, GuidedModelResponse>... steps) {
    gateway.script.addAll(Arrays.asList(steps));
  }

  // ── obligation 4 ───────────────────────────────────────────────────────────────────────────

  @Test
  void aTransientFailureThenSuccessCreatesTwoChargedAttemptsAndOneBackoff() throws Exception {
    fixture(Map.of());
    script(fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503), unsupported(null, null));
    var result = plan();
    assertThat(result.path("state").asText()).isEqualTo("FAILED");
    assertThat(errorCode()).isEqualTo("MISSING_SOURCE");
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_HTTP_503", "2:APPLIED:-");
    assertThat(gateway.requests).hasSize(2);
    assertThat(sleeps).containsExactly(BASE_MILLIS);
    int ceiling = gateway.requests.getFirst().maxOutputTokens();
    var counters = document().path("counters");
    assertThat(counters.path("modelProposals").asInt()).isEqualTo(2);
    // Attempt 1 settled with unknown usage keeps its full ceiling; attempt 2 reserved its own.
    assertThat(counters.path("modelOutputTokens").asInt()).isEqualTo(2 * ceiling);
    // The retried request is the same logical request: same id, next ordinal, no repair text.
    assertThat(gateway.requests.get(0).requestId()).isEqualTo(gateway.requests.get(1).requestId());
    assertThat(gateway.requests.get(0).attempt()).isEqualTo(1);
    assertThat(gateway.requests.get(1).attempt()).isEqualTo(2);
    for (var request : gateway.requests) {
      assertThat(request.projection().document().path("repairCodes")).isEmpty();
    }
    assertThat(
            jdbc.queryForObject(
                "SELECT count(DISTINCT reservation_key) FROM studio_guided_model_attempts WHERE"
                    + " session_id=?",
                Integer.class,
                sessionId))
        .isEqualTo(2);
  }

  // ── obligation 5 ───────────────────────────────────────────────────────────────────────────

  @Test
  void threeTransientFailuresEndInTheUnchangedTerminalCodeWithExactlyThreeCalls() throws Exception {
    fixture(Map.of());
    script(
        fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503),
        fail(GuidedModelResponse.Reason.TRANSPORT_CONNECT),
        fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_429));
    var refused = refusal();
    assertThat(refused.getMessage()).isEqualTo("INVALID_CONTRACT");
    assertThat(refused.status()).isEqualTo(422);
    assertThat(gateway.requests).hasSize(3);
    assertThat(gateway.script).isEmpty();
    assertThat(rows())
        .containsExactly(
            "1:REJECTED:TRANSPORT_HTTP_503",
            "2:REJECTED:TRANSPORT_CONNECT",
            "3:REJECTED:TRANSPORT_HTTP_429");
    // The delay before attempt n is base << (n - 2); there is no wait after the last attempt.
    assertThat(sleeps).containsExactly(BASE_MILLIS, BASE_MILLIS * 2);
    assertThat(document().path("state").asText()).isEqualTo("FAILED");
    assertThat(errorCode()).isEqualTo("INVALID_CONTRACT");
    assertThat(document().path("counters").path("modelProposals").asInt()).isEqualTo(3);
  }

  // ── obligation 6 ───────────────────────────────────────────────────────────────────────────

  @ParameterizedTest
  @EnumSource(
      value = GuidedModelResponse.Reason.class,
      names = {
        "TRANSPORT_HTTP_400",
        "TRANSPORT_HTTP_401_403",
        "TRANSPORT_HTTP_4XX",
        "TRANSPORT_HTTP_5XX",
        "TRANSPORT_CREDENTIAL",
        "TRANSPORT_USAGE",
        "TRANSPORT_OTHER",
        "TIMEOUT",
        "BUSY",
        "TOO_LARGE",
        "DISABLED"
      })
  void everyNonRetryableReasonMakesExactlyOneCallAndTheTodayTerminal(
      GuidedModelResponse.Reason reason) throws Exception {
    fixture(Map.of());
    assertThat(reason.definiteTransient()).isFalse();
    script(fail(reason));
    var refused = refusal();
    assertThat(refused.getMessage()).isEqualTo("INVALID_CONTRACT");
    assertThat(refused.status()).isEqualTo(422);
    assertThat(gateway.requests).hasSize(1);
    assertThat(sleeps).isEmpty();
    assertThat(rows()).containsExactly("1:REJECTED:" + reason.name());
    assertThat(errorCode()).isEqualTo("INVALID_CONTRACT");
  }

  @Test
  void anEscapingAdapterFaultIsOneCallWithAClosedTokenAndNoProseInPersistence() throws Exception {
    fixture(Map.of());
    script(adapterFault());
    assertThat(refusal().getMessage()).isEqualTo("INVALID_CONTRACT");
    assertThat(gateway.requests).hasSize(1);
    assertThat(sleeps).isEmpty();
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_ADAPTER_FAULT");
    assertThat(everythingPersisted()).doesNotContain(CANARY);
  }

  /** INVALID_RESPONSE keeps its existing schema-repair behaviour; it is never a transient retry. */
  @Test
  void anInvalidResponseIsRepairedAsBeforeAndNeverWaits() throws Exception {
    fixture(Map.of());
    script(fail(GuidedModelResponse.Reason.INVALID_RESPONSE), unsupported(null, null));
    plan();
    assertThat(rows()).containsExactly("1:REJECTED:INVALID_RESPONSE", "2:APPLIED:-");
    assertThat(sleeps).isEmpty();
    assertThat(gateway.requests.get(1).projection().document().path("repairCodes").toString())
        .contains("INVALID_RESPONSE");
  }

  // ── obligation 7 ───────────────────────────────────────────────────────────────────────────

  @Test
  void transientRetriesShareTheThreeAttemptPoolWithSchemaRepairs() throws Exception {
    fixture(Map.of());
    script(
        applyRefusal(),
        fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503),
        unsupported(null, null));
    plan();
    assertThat(rows())
        .containsExactly(
            "1:REJECTED:INVALID_CONTRACT", "2:REJECTED:TRANSPORT_HTTP_503", "3:APPLIED:-");
    assertThat(gateway.requests).hasSize(3);
    // The repair paragraph of attempt 2 is carried unchanged into the transient retry.
    assertThat(gateway.requests.get(1).projection().document().path("repairCodes").toString())
        .contains("INVALID_CONTRACT");
    assertThat(gateway.requests.get(2).projection().document().path("repairCodes"))
        .isEqualTo(gateway.requests.get(1).projection().document().path("repairCodes"));
    assertThat(sleeps).containsExactly(BASE_MILLIS * 2);
  }

  @Test
  void anExhaustedPoolLeavesNoTransientRetryAndNoFourthCall() throws Exception {
    fixture(Map.of());
    script(applyRefusal(), applyRefusal(), fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503));
    var refused = refusal();
    assertThat(refused.getMessage()).isEqualTo("INVALID_CONTRACT");
    assertThat(gateway.requests).hasSize(3);
    assertThat(sleeps).isEmpty();
    assertThat(rows())
        .containsExactly(
            "1:REJECTED:INVALID_CONTRACT",
            "2:REJECTED:INVALID_CONTRACT",
            "3:REJECTED:TRANSPORT_HTTP_503");
  }

  // ── obligation 8 ───────────────────────────────────────────────────────────────────────────

  @Test
  void anExhaustedSharedBudgetStopsTheRetryBeforeAnotherGatewayCall() throws Exception {
    fixture(Map.of("maxModelProposals", 1));
    script(fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503), unsupported(null, null));
    assertThat(refusal().getMessage()).isEqualTo("BUDGET_EXCEEDED");
    assertThat(gateway.requests).hasSize(1);
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_HTTP_503");
  }

  @Test
  void aSessionCancelledDuringTheBackoffGetsNoFurtherGatewayCall() throws Exception {
    fixture(Map.of());
    duringBackoff =
        () ->
            service.cancel(
                user,
                sessionId,
                "cancel-during-backoff",
                C.object().put("schemaVersion", 3).put("reason", "userRequested"));
    script(fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503), unsupported(null, null));
    assertThatThrownBy(this::plan).isInstanceOf(GuidedSessionException.class);
    assertThat(gateway.requests).hasSize(1);
    assertThat(sleeps).containsExactly(BASE_MILLIS);
    assertThat(document().path("state").asText()).isEqualTo("CANCELLED");
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_HTTP_503");
  }

  @Test
  void aSessionThatExpiresDuringTheBackoffGetsNoFurtherGatewayCall() throws Exception {
    fixture(Map.of());
    duringBackoff = () -> clock.advance(Duration.ofHours(2));
    script(fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503), unsupported(null, null));
    assertThatThrownBy(this::plan).isInstanceOf(GuidedSessionException.class);
    assertThat(gateway.requests).hasSize(1);
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_HTTP_503");
  }

  @Test
  void aLostFenceDuringTheBackoffGetsNoFurtherGatewayCall() throws Exception {
    fixture(Map.of());
    duringBackoff =
        () ->
            jdbc.update(
                "UPDATE studio_guided_sessions SET document=jsonb_set(document,"
                    + "'{owner,fence}','2'::jsonb) WHERE session_id=?",
                sessionId);
    script(fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503), unsupported(null, null));
    assertThatThrownBy(this::plan).isInstanceOf(GuidedSessionException.class);
    assertThat(gateway.requests).hasSize(1);
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_HTTP_503");
  }

  @Test
  void anInterruptedBackoffEndsInTheTerminalCodeWithNoFurtherCallAndKeepsTheInterruptFlag()
      throws Exception {
    fixture(Map.of());
    translation.useBackoffSleeper(
        millis -> {
          sleeps.add(millis);
          throw new InterruptedException("interrupted-canary");
        });
    script(fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503), unsupported(null, null));
    var refused = refusal();
    assertThat(refused.getMessage()).isEqualTo("INVALID_CONTRACT");
    assertThat(Thread.currentThread().isInterrupted()).isTrue();
    assertThat(gateway.requests).hasSize(1);
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_HTTP_503");
    assertThat(document().path("state").asText()).isEqualTo("FAILED");
  }

  // ── obligation 9 ───────────────────────────────────────────────────────────────────────────

  /** A replay with the same key behaves exactly as it does after a repair sequence. */
  @Test
  void replayingTheSameKeyAfterATransientSequenceMakesNoCallRowOrCharge() throws Exception {
    fixture(Map.of());
    script(fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503), unsupported(10, 20));
    plan();
    var replay = replayOutcome();
    fixture(Map.of());
    script(fail(GuidedModelResponse.Reason.INVALID_RESPONSE), unsupported(10, 20));
    plan();
    var repairReplay = replayOutcome();
    assertThat(replay).isEqualTo(repairReplay);
    assertThat(replay).startsWith("calls=2 ").contains("rows=2").doesNotContain("returned");
  }

  private String replayOutcome() {
    var callsBefore = gateway.requests.size();
    var rowsBefore = rows();
    var sleepsBefore = List.copyOf(sleeps);
    var countersBefore = document().path("counters");
    String outcome;
    try {
      outcome = "returned:" + plan().path("state").asText();
    } catch (GuidedSessionException e) {
      outcome = e.getMessage() + "/" + e.status();
    }
    assertThat(gateway.requests).hasSize(callsBefore);
    assertThat(rows()).isEqualTo(rowsBefore);
    assertThat(document().path("counters")).isEqualTo(countersBefore);
    assertThat(sleeps).isEqualTo(sleepsBefore);
    return "calls=" + callsBefore + " rows=" + rowsBefore.size() + " outcome=" + outcome;
  }

  // ── obligation 12 ──────────────────────────────────────────────────────────────────────────

  /**
   * The closed reason is an internal column only: the public view and the error body after three
   * transient failures have the same shape and codes as after a failure that is not retried, and
   * carry no reason token or provider prose.
   */
  @Test
  void theReasonNeverReachesThePublicViewOrTheErrorBody() throws Exception {
    fixture(Map.of());
    script(
        fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503),
        fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503),
        fail(GuidedModelResponse.Reason.TRANSPORT_HTTP_503));
    var retried = refusal();
    var retriedView = service.read(user, sessionId, "view");
    var retriedResult = service.read(user, sessionId, "result");

    fixture(Map.of());
    script(fail(GuidedModelResponse.Reason.TIMEOUT));
    var plain = refusal();
    var plainView = service.read(user, sessionId, "view");
    var plainResult = service.read(user, sessionId, "result");

    // Only the per-request id differs between two otherwise identical error bodies.
    assertThat(withoutRequestId(retried.response())).isEqualTo(withoutRequestId(plain.response()));
    assertThat(fieldNames(retriedView)).isEqualTo(fieldNames(plainView));
    assertThat(fieldNames(retriedResult)).isEqualTo(fieldNames(plainResult));
    for (String body :
        List.of(
            retried.response().toString(),
            String.valueOf(retriedView),
            String.valueOf(retriedResult))) {
      assertThat(body).doesNotContain("TRANSPORT_").doesNotContain("rejection");
    }
  }

  private static Map<String, Object> withoutRequestId(Map<String, Object> body) {
    var copy = new java.util.TreeMap<>(body);
    copy.remove("requestId");
    return copy;
  }

  private static List<String> fieldNames(JsonNode node) {
    List<String> names = new ArrayList<>();
    if (node != null) {
      node.fieldNames().forEachRemaining(names::add);
    }
    java.util.Collections.sort(names);
    return names;
  }

  private String everythingPersisted() {
    return String.join(
            "\n",
            jdbc.queryForList(
                "SELECT to_jsonb(a)::text FROM studio_guided_model_attempts a WHERE session_id=?",
                String.class,
                sessionId))
        + document()
        + repository.transaction(() -> repository.lock(sessionId).progress().toString());
  }

  // ── support ────────────────────────────────────────────────────────────────────────────────

  private static final class ScriptedGateway implements GuidedLlmGatewayClient {
    final Deque<Function<GuidedModelRequest, GuidedModelResponse>> script = new ArrayDeque<>();
    final List<GuidedModelRequest> requests = new ArrayList<>();

    @Override
    public GuidedModelResponse propose(GuidedModelRequest request, GuidedCallBudget budget) {
      budget.remaining();
      assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
      requests.add(request);
      var step = script.poll();
      if (step == null) {
        throw new AssertionError("no scripted answer for gateway call " + requests.size());
      }
      return step.apply(request);
    }
  }

  private static final class MutableClock extends Clock {
    private Instant now = Instant.now();

    void advance(Duration by) {
      now = now.plus(by);
    }

    @Override
    public java.time.ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(java.time.ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }

  private void seedSource() throws Exception {
    testId = UUID.randomUUID();
    var source =
        new AuthoringV2Request(
            2, null, List.of(new AuthoringStep(UUID.randomUUID(), "Open Orders", null)));
    jdbc.update(
        "INSERT INTO users(id,sso_id,name,email,created_at) VALUES "
            + "(?,'retry-user','Retry','retry@example.invalid',now())",
        UUID.randomUUID());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES"
            + " ('CSI-123','Orders','Ops','HIGH','retry@example.invalid','Production')");
    jdbc.update(
        ("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,"
                + "variables,authoring,authoring_revision_inputs,created_by,"
                + "created_at,updated_at)")
            + (" VALUES (?,'Transient retry','CSI-123','fixture','chromium',?::jsonb,'[]'::jsonb,"
                + "?::jsonb,?::jsonb,'retry@example.invalid',now(),now())"),
        testId,
        JSON.writeValueAsString(List.of("Open Orders")),
        JSON.writeValueAsString(source),
        JSON.writeValueAsString(AuthoringRevisionIdentity.create(source, Map.of())));
  }

  private final class PersistedSourceAccess implements GuidedSessionAccess {
    private final GuidedSourceClassifier classifier =
        new GuidedSourceClassifier(C, translationProperties, new CredentialPatternScreen());

    ObjectNode current() {
      var row =
          jdbc.queryForMap(
              "SELECT authoring::text AS authoring,authoring_revision_inputs::text AS inputs,"
                  + " source_revision,configuration_revision,csi_id,environment FROM ui_tests WHERE id=? FOR UPDATE",
              testId);
      try {
        assertThat(
                AuthoringRevisionIdentity.valid(
                    JSON.treeToValue(
                        C.parse(String.valueOf(row.get("authoring"))), AuthoringV2Request.class),
                    JSON.treeToValue(
                        C.parse(String.valueOf(row.get("inputs"))), AuthoringRevisionInputs.class)))
            .isTrue();
      } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
        throw new GuidedSessionException("INVALID_CONTRACT", 422);
      }
      return C.object()
          .put("testId", testId.toString())
          .put("csiId", String.valueOf(row.get("csi_id")))
          .put("environment", String.valueOf(row.get("environment")))
          .put("sourceRevision", String.valueOf(row.get("source_revision")))
          .put("configurationRevision", String.valueOf(row.get("configuration_revision")))
          .setAll(
              Map.of(
                  "authoring",
                  C.parse(String.valueOf(row.get("authoring"))),
                  "variables",
                  JSON.createArrayNode()));
    }

    @Override
    public Snapshot resolve(Authentication principal, JsonNode request) {
      var current = current();
      var scope =
          C.object()
              .put("principalId", "retry-user")
              .put("csiId", current.path("csiId").asText())
              .put("environmentId", current.path("environment").asText())
              .put("applicationId", "orders")
              .put("sourceRevision", current.path("sourceRevision").asText())
              .put("configurationRevision", current.path("configurationRevision").asText())
              .put("modelDataPolicyId", "INPUT-POLICY-01-A")
              .putNull("valueTransferPolicyId");
      scope.putArray("approvedOrigins").add("https://orders.example.test");
      scope.putArray("capabilities").add("observe");
      var approved = classifier.classify(current, scope);
      var steps = JSON.createArrayNode();
      for (JsonNode step : approved.path("sourceSteps")) {
        steps
            .addObject()
            .put("stepId", step.path("stepId").asText())
            .put("requiresAssertion", false);
      }
      return new Snapshot(scope, steps);
    }

    @Override
    public void checkCurrent(JsonNode session) {
      classifier.requireCurrentPolicy(session.path("scope"));
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {
      var actual = current();
      for (String key : List.of("sourceRevision", "configurationRevision", "csiId")) {
        assertThat(actual.path(key)).isEqualTo(session.path("scope").path(key));
      }
      assertThat(actual.path("environment")).isEqualTo(session.path("scope").path("environmentId"));
    }

    @Override
    public void checkUser(Authentication principal, JsonNode session) {
      assertThat(
              new CsiOwnershipEvaluator()
                  .canExecute(principal, session.path("scope").path("csiId").asText()))
          .isTrue();
    }
  }
}
