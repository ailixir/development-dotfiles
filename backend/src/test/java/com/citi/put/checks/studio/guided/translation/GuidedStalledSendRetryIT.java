package com.citi.put.checks.studio.guided.session;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
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
import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.translation.CredentialPatternScreen;
import com.citi.put.checks.studio.guided.translation.GenAiGuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedCallBudget;
import com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore;
import com.citi.put.checks.studio.guided.translation.GuidedDependencyPlanner;
import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedModelRequest;
import com.citi.put.checks.studio.guided.translation.GuidedModelResponse;
import com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler;
import com.citi.put.checks.studio.guided.translation.GuidedProposalValidator;
import com.citi.put.checks.studio.guided.translation.GuidedResponseParser;
import com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier;
import com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationService;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.ResponseDefinitionBuilder;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.github.tomakehurst.wiremock.stubbing.Scenario;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Round 067, Candidate B (architect ruling): a provider send that receives no response headers
 * within the per-send cap, while the cap is the binding limit, ends as REJECTED/TRANSPORT_STALL and
 * the coordinator makes a new, fully charged attempt in the shared three-proposal pool. Real
 * PostgreSQL, real session service, store and coordinator. Stalls are produced by the real adapter
 * and transport against WireMock; successful answers are scripted (they depend on the request id).
 * A SOURCE_PLAN {@code UNSUPPORTED} answer ends {@code plan()} before any runner bootstrap.
 */
class GuidedStalledSendRetryIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");
  private static final GuidedContracts C = new GuidedContracts();
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final long BASE_MILLIS = 250;

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
  private int callSeconds = 10;
  private int sendTimeoutSeconds = 2;

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
    gateway.budgets.clear();
    sleeps.clear();
    duringBackoff = null;
    String database = "stalled_send_" + UUID.randomUUID().toString().replace("-", "");
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
        .target("29")
        .load()
        .migrate();
    jdbc = new JdbcTemplate(source);
    var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    repository = new GuidedSessionRepository(jdbc, tx, C);
    store = new GuidedTranslationStore(jdbc, C);
    translationProperties =
        new GuidedTranslationProperties(
            true,
            65536,
            4096,
            callSeconds,
            "worker-1",
            false,
            (int) BASE_MILLIS,
            sendTimeoutSeconds);
    var prompts =
        new GuidedPromptAssembler(C, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    seedSource();
    var access = new PersistedSourceAccess();
    service =
        new GuidedSessionService(
            repository,
            C,
            access,
            new GuidedSessionProperties(true, limits),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            clock);
    var materialization =
        new GuidedMaterializationService(
            jdbc, C, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
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
    com.citi.put.checks.studio.support.ObservedPublicationFixture.installCsiBudget(service, jdbc);
    ObjectNode start =
        C.object()
            .put("schemaVersion", 3)
            .put("testId", testId.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", "fixture");
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
            new GuidedSourceInputResolver(
                C, com.citi.put.checks.studio.support.TestDomains.FIXTURES),
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

  /** Scripted steps; a wire step (see {@link #wire}) runs the real adapter instead. */
  @SafeVarargs
  private void script(Function<GuidedModelRequest, GuidedModelResponse>... steps) {
    for (var step : steps) {
      gateway.script.add((request, budget) -> step.apply(request));
    }
  }

  private void script(Step... steps) {
    gateway.script.addAll(Arrays.asList(steps));
  }

  private interface Step {
    GuidedModelResponse apply(GuidedModelRequest request, GuidedCallBudget budget);
  }

  private static Step scripted(Function<GuidedModelRequest, GuidedModelResponse> step) {
    return (request, budget) -> step.apply(request);
  }

  // ── wire stalls (real adapter and transport against WireMock) ──────────────────────────────

  private WireMockServer wire;
  private GenAiGatewayTransport transport;
  private GenAiGuidedLlmGatewayClient adapter;

  @AfterEach
  void stopWire() {
    if (transport != null) {
      transport.close();
      transport = null;
    }
    if (wire != null) {
      wire.stop();
      wire = null;
    }
  }

  /** Real clock: the cap is a wall-clock limit enforced by OkHttp. */
  private void realClock() {
    clock.real = true;
  }

  private void startWire(ResponseDefinitionBuilder... responses) {
    wire = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    wire.start();
    var props =
        new StudioGatewayProperties(
            wire.baseUrl(),
            "synthetic-project",
            "global",
            "synthetic-model",
            new StudioGatewayProperties.Credentials("none", null),
            Duration.ofSeconds(150),
            1,
            65536,
            65536,
            StudioGatewayProperties.DEFAULT_MAX_OUTPUT_TOKENS,
            StudioGatewayProperties.ThinkingLevel.LOW,
            StudioGatewayProperties.ProviderFeatures.ALL);
    try {
      transport = new GenAiGatewayTransport(props);
    } catch (java.io.IOException failure) {
      throw new IllegalStateException(failure);
    }
    adapter = new GenAiGuidedLlmGatewayClient(transport, new GuidedResponseParser(C));
    warmUp();
    String state = Scenario.STARTED;
    for (int i = 0; i < responses.length; i++) {
      String next = "after-" + i;
      wire.stubFor(
          post(urlPathMatching(".*"))
              .inScenario("sequence")
              .whenScenarioStateIs(state)
              .willReturn(responses[i])
              .willSetStateTo(next));
      state = next;
    }
  }

  private static void nothingRegistered() {
    // The warm-up budget never cancels, so nothing needs removing.
  }

  /**
   * One throwaway error exchange so SDK, OkHttp and JSON classes are loaded before a timed send: a
   * cold JVM can spend more than the 2 s test cap handling even an instant response.
   */
  private void warmUp() {
    wire.stubFor(post(urlPathMatching(".*")).willReturn(status(429)));
    GenAiGatewayTransport.Budget open =
        new GenAiGatewayTransport.Budget() {
          @Override
          public Duration remaining() {
            return Duration.ofSeconds(30);
          }

          @Override
          public AutoCloseable onCancel(Runnable action) {
            return GuidedStalledSendRetryIT::nothingRegistered;
          }
        };
    try (var lease = transport.tryAcquire(open)) {
      lease.authenticate();
      lease.generate(
          "warm-up",
          com.google.genai.types.GenerateContentConfig.builder()
              .httpOptions(
                  com.google.genai.types.HttpOptions.builder()
                      .timeout(30000)
                      .retryOptions(
                          com.google.genai.types.HttpRetryOptions.builder().attempts(1).build())
                      .build())
              .build(),
          true);
    } catch (Exception expected429) {
      // The warm-up exchange is meant to fail with an HTTP 429.
    }
    wire.resetAll();
  }

  /** A send that outlives the 2 s cap with no response at all. */
  private static ResponseDefinitionBuilder silent() {
    return okJson("{}").withFixedDelay(5000);
  }

  private static ResponseDefinitionBuilder status(int code) {
    return aResponse().withStatus(code).withBody("{}");
  }

  private Step wire() {
    return (request, budget) -> adapter.propose(request, budget);
  }

  private int httpRequests() {
    return wire.getAllServeEvents().size();
  }

  private int ceiling() {
    return gateway.requests.getFirst().maxOutputTokens();
  }

  // ── test 1 ─────────────────────────────────────────────────────────────────────────────────

  @Test
  void aStalledSendIsCutByTheCapAndRetriedAsASecondChargedAttempt() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(silent());
    script(wire(), scripted(unsupported(12, 7)));
    long started = System.nanoTime();
    var result = plan();
    long millis = Duration.ofNanos(System.nanoTime() - started).toMillis();
    assertThat(result.path("state").asText()).isEqualTo("FAILED");
    assertThat(errorCode()).isEqualTo("MISSING_SOURCE");
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_STALL", "2:APPLIED:-");
    assertThat(sleeps).containsExactly(BASE_MILLIS);
    assertThat(httpRequests()).isEqualTo(1);
    // The cap, not the 5 s provider delay or the 10 s call budget, ended the stalled send.
    assertThat(millis).isBetween(1900L, 4900L);
    // Attempt 1 keeps its full ceiling (unknown usage, never refunded); attempt 2 reserved its own.
    var counters = document().path("counters");
    assertThat(counters.path("modelProposals").asInt()).isEqualTo(2);
    assertThat(counters.path("modelOutputTokens").asInt()).isEqualTo(2 * ceiling());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(DISTINCT reservation_key) FROM studio_guided_model_attempts WHERE"
                    + " session_id=?",
                Integer.class,
                sessionId))
        .isEqualTo(2);
    assertThat(
            jdbc.queryForList(
                "SELECT input_tokens FROM studio_guided_model_attempts WHERE session_id=? AND"
                    + " attempt_number=1",
                Integer.class,
                sessionId))
        .containsExactly((Integer) null);
    assertThat(gateway.requests.get(0).requestId()).isEqualTo(gateway.requests.get(1).requestId());
    assertThat(gateway.requests.get(1).attempt()).isEqualTo(2);
  }

  // ── test 2 ─────────────────────────────────────────────────────────────────────────────────

  @Test
  void threeStalledSendsEndTerminalWithExactlyThreeHttpRequestsAndTwoBackoffs() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(silent(), silent(), silent(), silent());
    script(wire(), wire(), wire(), wire());
    var refused = refusal();
    assertThat(refused.getMessage()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(refused.status()).isEqualTo(503);
    assertThat(errorCode()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(document().path("state").asText()).isEqualTo("FAILED");
    assertThat(rows())
        .containsExactly(
            "1:REJECTED:TRANSPORT_STALL",
            "2:REJECTED:TRANSPORT_STALL",
            "3:REJECTED:TRANSPORT_STALL");
    assertThat(httpRequests()).isEqualTo(3);
    assertThat(gateway.requests).hasSize(3);
    assertThat(sleeps).containsExactly(BASE_MILLIS, BASE_MILLIS * 2);
    // Three stalled ceilings stay charged; nothing is refunded.
    assertThat(document().path("counters").path("modelOutputTokens").asInt())
        .isEqualTo(3 * ceiling());
  }

  // ── test 3 ─────────────────────────────────────────────────────────────────────────────────

  @Test
  void aStallSharesThePoolWithA429InEitherOrder() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(status(429), silent());
    script(wire(), wire(), scripted(unsupported(null, null)));
    plan();
    assertThat(rows())
        .containsExactly(
            "1:REJECTED:TRANSPORT_HTTP_429", "2:REJECTED:TRANSPORT_STALL", "3:APPLIED:-");
    assertThat(sleeps).containsExactly(BASE_MILLIS, BASE_MILLIS * 2);
    stopWire();

    fixture(Map.of());
    startWire(silent(), status(429));
    script(wire(), wire(), scripted(unsupported(null, null)));
    plan();
    assertThat(rows())
        .containsExactly(
            "1:REJECTED:TRANSPORT_STALL", "2:REJECTED:TRANSPORT_HTTP_429", "3:APPLIED:-");
    assertThat(httpRequests()).isEqualTo(2);
  }

  @Test
  void aStallThenA429ThenAStallIsTerminalWithNoFourthSend() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(silent(), status(429), silent(), silent());
    script(wire(), wire(), wire(), wire());
    assertThat(refusal().getMessage()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(rows())
        .containsExactly(
            "1:REJECTED:TRANSPORT_STALL",
            "2:REJECTED:TRANSPORT_HTTP_429",
            "3:REJECTED:TRANSPORT_STALL");
    assertThat(httpRequests()).isEqualTo(3);
  }

  @Test
  void aRepairThenTwoStallsIsTerminalWithNoFourthSend() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(silent(), silent(), silent());
    script(scripted(applyRefusal()), wire(), wire(), wire());
    assertThat(refusal().getMessage()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(rows())
        .containsExactly(
            "1:REJECTED:INVALID_CONTRACT",
            "2:REJECTED:TRANSPORT_STALL",
            "3:REJECTED:TRANSPORT_STALL");
    assertThat(gateway.requests).hasSize(3);
    assertThat(httpRequests()).isEqualTo(2);
    assertThat(sleeps).containsExactly(BASE_MILLIS * 2);
  }

  // ── test 4 ─────────────────────────────────────────────────────────────────────────────────

  /**
   * The call budget (2 s) is shorter than the cap (50 s), so the cap is not the binding limit: the
   * overrun is an honest REJECTED/TIMEOUT on a still-current attempt, never SUPERSEDED, and is not
   * repeated. This also pins the lease-after-deadline margin.
   */
  @Test
  void anOverrunWhereTheCapIsNotBindingIsRejectedTimeoutNotSupersededAndNotRetried()
      throws Exception {
    realClock();
    callSeconds = 2;
    sendTimeoutSeconds = 50;
    fixture(Map.of());
    startWire(silent(), silent());
    script(wire(), wire());
    assertThat(refusal().getMessage()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(rows()).containsExactly("1:REJECTED:TIMEOUT");
    assertThat(httpRequests()).isEqualTo(1);
    assertThat(sleeps).isEmpty();
    assertThat(document().path("state").asText()).isEqualTo("FAILED");
  }

  // ── test 5 ─────────────────────────────────────────────────────────────────────────────────

  @Test
  void aBodyThatStallsAfterTheHeadersIsATimeoutAndIsNotRetried() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(
        okJson("{\"candidates\":[],\"pad\":\"" + "x".repeat(200) + "\"}")
            .withChunkedDribbleDelay(10, 5000),
        silent());
    script(wire(), wire());
    assertThat(refusal().getMessage()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(rows()).containsExactly("1:REJECTED:TIMEOUT");
    assertThat(httpRequests()).isEqualTo(1);
    assertThat(sleeps).isEmpty();
  }

  @Test
  void aGatewayTimeoutResponseHasHeadersSoItIsATimeoutAndIsNotRetried() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(status(504), silent());
    script(wire(), wire());
    assertThat(refusal().getMessage()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(rows()).containsExactly("1:REJECTED:TIMEOUT");
    assertThat(httpRequests()).isEqualTo(1);
  }

  /**
   * With every permit held, a call waits for one for its own budget (2 s here) and only then ends
   * BUSY: one rejected attempt, no send on the wire, and MODEL_UNAVAILABLE, not a contract defect.
   */
  @Test
  void aSaturatedGatewayWaitsOutTheCallBudgetThenEndsModelUnavailableWithoutASend()
      throws Exception {
    realClock();
    callSeconds = 2;
    fixture(Map.of());
    startWire(status(500));
    script(wire());
    GenAiGatewayTransport.Budget open =
        new GenAiGatewayTransport.Budget() {
          @Override
          public Duration remaining() {
            return Duration.ofSeconds(30);
          }

          @Override
          public AutoCloseable onCancel(Runnable action) {
            return GuidedStalledSendRetryIT::nothingRegistered;
          }
        };
    GuidedSessionException refused;
    long started = System.nanoTime();
    try (var held = transport.tryAcquire(open)) {
      assertThat(held).isNotNull();
      refused = refusal();
    }
    long millis = Duration.ofNanos(System.nanoTime() - started).toMillis();
    assertThat(refused.getMessage()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(refused.status()).isEqualTo(503);
    assertThat(rows()).containsExactly("1:REJECTED:BUSY");
    assertThat(httpRequests()).isZero();
    assertThat(sleeps).isEmpty();
    assertThat(millis).isBetween(1500L, 6000L);
    assertThat(errorCode()).isEqualTo("MODEL_UNAVAILABLE");
  }

  /** The provider's own HTTP 403 reaches the session as MODEL_REFUSED, once, with no retry. */
  @Test
  void aProvider403IsRefusedNotAContractDefectAndNotRetried() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(status(403), silent());
    script(wire(), wire());
    var refused = refusal();
    assertThat(refused.getMessage()).isEqualTo("MODEL_REFUSED");
    assertThat(refused.status()).isEqualTo(422);
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_HTTP_401_403");
    assertThat(httpRequests()).isEqualTo(1);
    assertThat(sleeps).isEmpty();
    assertThat(errorCode()).isEqualTo("MODEL_REFUSED");
  }

  // ── test 6 ─────────────────────────────────────────────────────────────────────────────────

  /** Documents the accepted policy: by wire behaviour, an answer slower than the cap is a stall. */
  @Test
  void anAnswerSlowerThanTheCapButInsideTheBudgetIsTreatedAsAStallAndRetried() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(okJson("{}").withFixedDelay(3000));
    script(wire(), scripted(unsupported(null, null)));
    plan();
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_STALL", "2:APPLIED:-");
    assertThat(sleeps).containsExactly(BASE_MILLIS);
  }

  // ── test 3 (clause d) ──────────────────────────────────────────────────────────────────────

  /**
   * A call cancelled before the send reaches the network is a TIMEOUT even though the cap was the
   * binding limit and no response arrived. The budget is cancelled from its own clock on the fourth
   * {@code remaining()} (propose, authenticate, left-time read, then {@code Lease.generate}), so
   * the cancellation lands inside the generating stage with no wire exchange.
   */
  @Test
  void aCallCancelledBeforeTheSendReachesTheWireIsATimeoutNotAStall() throws Exception {
    realClock();
    fixture(Map.of());
    startWire(silent());
    script(
        (request, budget) -> {
          var clockWithCancel = new CancellingClock(4);
          var own =
              new GuidedCallBudget(
                  Instant.now().plusSeconds(10), clockWithCancel, Duration.ofSeconds(2));
          clockWithCancel.budget = own;
          return adapter.propose(request, own);
        });
    assertThat(refusal().getMessage()).isEqualTo("MODEL_UNAVAILABLE");
    assertThat(rows()).containsExactly("1:REJECTED:TIMEOUT");
    assertThat(httpRequests()).isZero();
    assertThat(sleeps).isEmpty();
  }

  // ── test 7 ─────────────────────────────────────────────────────────────────────────────────

  @Test
  void theLeaseEndsTwoSecondsAfterTheSendDeadline() throws Exception {
    callSeconds = 60;
    sendTimeoutSeconds = 50;
    fixture(Map.of());
    Instant now = clock.instant();
    script(scripted(unsupported(null, null)));
    plan();
    Duration remaining = gateway.budgets.getFirst();
    assertThat(remaining).isEqualTo(Duration.ofSeconds(60));
    assertThat(Duration.between(now.plus(remaining), leaseUntil(1)))
        .isEqualTo(Duration.ofSeconds(2));
  }

  @Test
  void theDeadlineAndTheLeaseAreClampedToTheSessionExpiry() throws Exception {
    callSeconds = 60;
    sendTimeoutSeconds = 50;
    fixture(Map.of("maxSessionSeconds", 40));
    Instant now = clock.instant();
    Instant expiry = Instant.parse(document().path("expiresAt").asText());
    assertThat(Duration.between(now, expiry)).isEqualTo(Duration.ofSeconds(40));
    script(scripted(unsupported(null, null)));
    plan();
    // deadline = hard - 2 s, lease_until = hard.
    assertThat(gateway.budgets.getFirst()).isEqualTo(Duration.ofSeconds(38));
    assertThat(leaseUntil(1)).isEqualTo(expiry);
  }

  private Instant leaseUntil(int attemptNumber) {
    return jdbc.queryForObject(
            "SELECT lease_until FROM studio_guided_model_attempts WHERE session_id=? AND"
                + " attempt_number=?",
            java.sql.Timestamp.class,
            sessionId,
            attemptNumber)
        .toInstant();
  }

  // ── test 8 ─────────────────────────────────────────────────────────────────────────────────

  @Test
  void aSessionCancelledDuringTheStalledSendGetsNoFurtherSend() throws Exception {
    fixture(Map.of());
    script(
        scripted(
            request -> {
              service.cancel(
                  user,
                  sessionId,
                  "cancel-during-send",
                  C.object().put("schemaVersion", 3).put("reason", "userRequested"));
              return fail(GuidedModelResponse.Reason.TRANSPORT_STALL).apply(request);
            }),
        scripted(unsupported(null, null)));
    assertThatThrownBy(this::plan).isInstanceOf(GuidedSessionException.class);
    assertThat(gateway.requests).hasSize(1);
    assertThat(document().path("state").asText()).isEqualTo("CANCELLED");
  }

  @Test
  void aSessionThatExpiresDuringTheStalledSendGetsNoFurtherSend() throws Exception {
    fixture(Map.of());
    script(
        scripted(
            request -> {
              clock.advance(Duration.ofHours(2));
              return fail(GuidedModelResponse.Reason.TRANSPORT_STALL).apply(request);
            }),
        scripted(unsupported(null, null)));
    assertThatThrownBy(this::plan).isInstanceOf(GuidedSessionException.class);
    assertThat(gateway.requests).hasSize(1);
  }

  @Test
  void aSessionCancelledOrExpiredDuringTheBackoffAfterAStallGetsNoFurtherSend() throws Exception {
    fixture(Map.of());
    duringBackoff =
        () ->
            service.cancel(
                user,
                sessionId,
                "cancel-during-backoff",
                C.object().put("schemaVersion", 3).put("reason", "userRequested"));
    script(fail(GuidedModelResponse.Reason.TRANSPORT_STALL), unsupported(null, null));
    assertThatThrownBy(this::plan).isInstanceOf(GuidedSessionException.class);
    assertThat(gateway.requests).hasSize(1);
    assertThat(sleeps).containsExactly(BASE_MILLIS);
    assertThat(document().path("state").asText()).isEqualTo("CANCELLED");
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_STALL");

    fixture(Map.of());
    duringBackoff = () -> clock.advance(Duration.ofHours(2));
    script(fail(GuidedModelResponse.Reason.TRANSPORT_STALL), unsupported(null, null));
    assertThatThrownBy(this::plan).isInstanceOf(GuidedSessionException.class);
    assertThat(gateway.requests).hasSize(1);
    assertThat(rows()).containsExactly("1:REJECTED:TRANSPORT_STALL");
  }

  // ── support ────────────────────────────────────────────────────────────────────────────────

  private final class ScriptedGateway implements GuidedLlmGatewayClient {
    final Deque<Step> script = new ArrayDeque<>();
    final List<GuidedModelRequest> requests = new ArrayList<>();
    final List<Duration> budgets = new ArrayList<>();

    @Override
    public GuidedModelResponse propose(GuidedModelRequest request, GuidedCallBudget budget) {
      budgets.add(budget.remaining());
      assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
      requests.add(request);
      var step = script.poll();
      if (step == null) {
        throw new AssertionError("no scripted answer for gateway call " + requests.size());
      }
      return step.apply(request, budget);
    }
  }

  /** Real time; cancels the budget it serves on its Nth reading. */
  private static final class CancellingClock extends Clock {
    private final java.util.concurrent.atomic.AtomicInteger reads =
        new java.util.concurrent.atomic.AtomicInteger();
    private final int cancelOn;
    volatile GuidedCallBudget budget;

    CancellingClock(int cancelOn) {
      this.cancelOn = cancelOn;
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
      if (reads.incrementAndGet() == cancelOn && budget != null) {
        budget.cancel();
      }
      return Instant.now();
    }
  }

  private static final class MutableClock extends Clock {
    private Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
    private Duration offset = Duration.ZERO;
    volatile boolean real;

    synchronized void advance(Duration by) {
      now = now.plus(by);
      offset = offset.plus(by);
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
    public synchronized Instant instant() {
      return real ? Instant.now().plus(offset) : now;
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
        new GuidedSourceClassifier(
            C,
            new CredentialPatternScreen(),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES);

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
              .put("sourceRevision", current.path("sourceRevision").asText())
              .put("configurationRevision", current.path("configurationRevision").asText())
              .put("modelDataPolicyId", "INPUT-POLICY-01-A")
              .putNull("valueTransferPolicyId");
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
