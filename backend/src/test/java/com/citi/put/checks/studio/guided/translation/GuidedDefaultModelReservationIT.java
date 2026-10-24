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
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.translation.CredentialPatternScreen;
import com.citi.put.checks.studio.guided.translation.GuidedCallBudget;
import com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore;
import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedModelRequest;
import com.citi.put.checks.studio.guided.translation.GuidedModelResponse;
import com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler;
import com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Real service/store accounting with a counted controlled gateway port, not SDK HTTP, Core or
 * browser proof. Distinct source-planning calls exercise the exposed budget protocol; they do not
 * assert the translation orchestrator's retry policy or manufacture successful plans/actions.
 */
class GuidedDefaultModelReservationIT {
  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine");
  private static final GuidedContracts C = new GuidedContracts();
  private static final ObjectMapper JSON = new ObjectMapper();
  private final Clock clock = Clock.systemUTC();
  private final Authentication user =
      new BffAuthenticationToken(
          new UserIdentity(
              "budget-user",
              "budget@example.invalid",
              "Budget",
              "Test",
              List.of(),
              List.of(new CsiOwnershipEntry("CSI-123", "owner"))));
  private final Authentication worker =
      new GuidedInternalSecurity.Identity("worker-1", "owning-worker");
  private final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");
  private AnnotationConfigApplicationContext context;
  private JdbcTemplate jdbc;
  private GuidedSessionRepository repository;
  private GuidedSessionService service;
  private GuidedTranslationStore store;
  private GuidedPromptAssembler prompts;
  private GuidedTranslationProperties translationProperties;
  private String sessionId;
  private UUID testId;
  private final List<ObjectNode> numericWitnesses = new ArrayList<>();
  private final List<ControlledLateUsage> pendingControlledUsage = new ArrayList<>();
  private int sends;

  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties({GuidedTranslationProperties.class, GuidedSessionProperties.class})
  static class DefaultBinding {}

  @BeforeAll
  static void startDatabase() {
    POSTGRES.start();
  }

  @AfterAll
  static void stopDatabase() {
    POSTGRES.stop();
  }

  @AfterEach
  void closeContext() {
    if (context != null) {
      context.close();
    }
  }

  @BeforeEach
  void genuineSourceAndOriginalOwnerWithBoundDefaults() throws Exception {
    String database = "model_budget_" + UUID.randomUUID().toString().replace("-", "");
    var admin =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    new JdbcTemplate(admin).execute("CREATE DATABASE " + database);
    DataSource source =
        new DriverManagerDataSource(
            POSTGRES.getJdbcUrl().replace(POSTGRES.getDatabaseName(), database),
            POSTGRES.getUsername(),
            POSTGRES.getPassword());
    Flyway.configure()
        .dataSource(source)
        .locations("classpath:db/migration")
        .target("23") // STUDIO-OBS-014 S3: governance tables (V19) at head
        .load()
        .migrate();
    context = new AnnotationConfigApplicationContext();
    context
        .getEnvironment()
        .getPropertySources()
        .addFirst(
            new MapPropertySource(
                "source-policy-only",
                Map.of(
                    "studio.guided-authoring.translation.applications",
                    "orders",
                    "studio.guided-authoring.translation.environments",
                    "fixture")));
    for (String key :
        List.of(
            "studio.guided-authoring.translation.max-output-tokens",
            "studio.guided-authoring.max-model-output-tokens-total",
            "studio.guided-authoring.max-model-input-tokens-total")) {
      assertThat(context.getEnvironment().getProperty(key)).isNull();
    }
    context.registerBean(DataSource.class, () -> source);
    context.register(DefaultBinding.class);
    context.refresh();
    translationProperties = context.getBean(GuidedTranslationProperties.class);
    var sessionProperties = context.getBean(GuidedSessionProperties.class);
    assertThat(translationProperties.maxOutputTokens()).isEqualTo(4096);
    // MODEL-SIZING (ruling 2026-10-18, option A-ii): 24 proposals x 4096 output, 24 x 32,768 input.
    assertThat(sessionProperties.maxModelOutputTokensTotal()).isEqualTo(98304);
    assertThat(sessionProperties.maxModelInputTokensTotal()).isEqualTo(786432);
    assertThat(sessionProperties.maxModelProposals()).isEqualTo(100);
    assertThat(translationProperties.maxInputBytes()).isEqualTo(65536);
    jdbc = new JdbcTemplate(context.getBean(DataSource.class));
    var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
    repository = new GuidedSessionRepository(jdbc, tx, C);
    store = new GuidedTranslationStore(jdbc, C);
    prompts = new GuidedPromptAssembler(C);
    seedSource();
    var access = new PersistedSourceAccess();
    service = new GuidedSessionService(repository, C, access, sessionProperties, clock);
    var materialization = new GuidedMaterializationService(jdbc, C);
    service.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, C),
        new GuidedBindingStore(jdbc, C, materialization),
        new GuidedAssignmentStore(jdbc, C));
    service.installTranslation(store, new GuidedClarificationContextStore(jdbc, C));
    // STUDIO-OBS-014 S3: every start needs an approved governed policy for its scope.
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
    start.set("versions", versions());
    sessionId = service.start(user, "original-start", start).path("sessionId").asText();
    repository.transaction(
        () -> {
          var session = repository.lock(sessionId);
          store.initialize(
              session.document(),
              access.classifier.classify(access.current(), session.document().path("scope")));
          return null;
        });
    service.prepareAssignment(controller, sessionId, "original-assignment", "worker-1");
    ObjectNode claim =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", sessionId)
            .put("workerId", "worker-1")
            .put("expectedFence", 0);
    claim.set("versions", versions());
    var claimed = service.claim(worker, sessionId, "original-claim", claim);
    assertThat(claimed.path("owner").path("fence").asInt()).isEqualTo(1);
    assertThat(claimed.path("owner").path("workerId").asText()).isEqualTo("worker-1");
    assertThat(claimed.path("state").asText()).isEqualTo("PREPARING");
  }

  @Test
  void realDefaultsTwentyFourKnownUsageReservationsRefuseTwentyFifthBeforeProvider() {
    twentyFourAndRefuseTwentyFifth(false);
  }

  @Test
  void realDefaultsUnknownUsageKeepsCeilingsAndRefusesTwentyFifth() {
    twentyFourAndRefuseTwentyFifth(true);
  }

  /**
   * B7 (STUDIO-OBS-009 MODEL-SIZING): an ideal 10-step base learn needed 13 proposals, which the
   * old 32,000 output total refused at the eighth. Under the production defaults all 13 fit, so the
   * session is still live afterwards.
   */
  @Test
  void realDefaultsB7ThirteenProposalBaseLearnFitsWithoutBudgetStop() {
    for (int ordinal = 1; ordinal <= 13; ordinal++) {
      var reserved = reserve("b7-call-" + ordinal, translationProperties.maxOutputTokens());
      assertThat(reserved).isNotNull();
      sendAndSettle(reserved, false);
      assertFrozenIdentity(reserved);
    }
    var after = snapshot();
    var counters = after.path("document").path("counters");
    assertThat(counters.path("modelProposals").asInt()).isEqualTo(13);
    assertThat(counters.path("modelOutputTokens").asInt()).isEqualTo(13 * 4096);
    assertThat(counters.path("modelInputTokens").asLong()).isLessThanOrEqualTo(786432);
    assertThat(after.path("document").path("state").asText()).isNotEqualTo("FAILED");
    assertThat(after.path("progress").path("errorCode").asText()).isEmpty();
    assertThat(sends).isEqualTo(13);
    assertThat(attemptCount()).isEqualTo(13);
  }

  @Test
  void duplicateRequestIdentityCannotChargeOrSendTwiceAndChangedCeilingRefuses() {
    var first = reserve("same-frozen-request", 4096);
    assertThat(first.attempt().send()).isTrue();
    sendAndSettle(first, false);
    var before = snapshot();
    var duplicate = reserve("same-frozen-request", 4096);
    assertThat(duplicate.attempt().send()).isFalse();
    sendAndSettle(duplicate, false);
    assertThat(sends).isEqualTo(1);
    assertThat(snapshot().equals(before)).isTrue();
    assertThatThrownBy(() -> reserve("same-frozen-request", 4095))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("IDEMPOTENCY_CONFLICT");
    assertThat(snapshot().equals(before)).isTrue();
    assertThat(attemptCount()).isEqualTo(1);
    assertThat(sends).isEqualTo(1);
    assertFrozenIdentity(first);
  }

  @Test
  void rollbackAndLateUsageCannotLeavePartialReservationOrReviveBudgetStop() {
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      var reserved = reserve("rolled-back-before-send", 4096);
                      assertThat(reserved.attempt().send()).isTrue();
                      throw new IllegalStateException("deliberate-before-send-rollback");
                    }))
        .hasMessage("deliberate-before-send-rollback");
    assertThat(attemptCount()).isZero();
    assertThat(sends).isZero();
    var unchanged = snapshot();
    assertThat(unchanged.path("document").path("counters").path("modelProposals").asInt()).isZero();
    assertThat(unchanged.path("document").path("counters").path("modelOutputTokens").asInt())
        .isZero();
    assertThat(unchanged.path("document").path("counters").path("modelInputTokens").asInt())
        .isZero();
    assertThat(unchanged.path("progress").path("modelReservations").size()).isZero();
    twentyFourAndRefuseTwentyFifth(true);
    var terminal = snapshot();
    assertThat(pendingControlledUsage).hasSize(24);
    for (var usage : pendingControlledUsage) {
      repository.transaction(
          () -> {
            repository.lock(sessionId);
            store.recordLateUsage(sessionId, usage.attemptId(), usage.input(), usage.output());
            return null;
          });
    }
    assertThat(service.reconcileLateModelUsage(controller, sessionId, 1)).isFalse();
    var after = snapshot();
    assertThat(after.path("document").path("state").asText()).isEqualTo("FAILED");
    assertThat(after.path("document").path("owner").equals(terminal.path("document").path("owner")))
        .isTrue();
    assertThat(after.path("document").path("counters"))
        .isEqualTo(terminal.path("document").path("counters"));
    assertThat(after.path("progress").path("errorCode").asText()).isEqualTo("BUDGET_EXCEEDED");
    assertThat(sends).isEqualTo(24);
    assertThat(attemptCount()).isEqualTo(24);
    assertThatThrownBy(() -> reserve("cannot-revive-terminal", 4096))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("PUBLICATION_CONFLICT");
    assertThat(sends).isEqualTo(24);
  }

  private List<Reservation> twentyFourAndRefuseTwentyFifth(boolean unknownUsage) {
    List<Reservation> attempts = new ArrayList<>();
    for (int ordinal = 1; ordinal <= 24; ordinal++) {
      var reserved = reserve("planning-call-" + ordinal, translationProperties.maxOutputTokens());
      assertThat(reserved).isNotNull();
      sendAndSettle(reserved, unknownUsage);
      attempts.add(reserved);
      assertFrozenIdentity(reserved);
    }
    var before = snapshot();
    assertThat(before.path("document").path("counters").path("modelOutputTokens").asInt())
        .isEqualTo(98304);
    assertThat(before.path("document").path("counters").path("modelProposals").asInt())
        .isEqualTo(24);
    assertThat(before.path("document").path("counters").path("modelInputTokens").asLong())
        .isLessThanOrEqualTo(786432);
    assertThat(sends).isEqualTo(24);
    assertThat(attemptCount()).isEqualTo(24);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND status=?",
                Long.class,
                sessionId,
                unknownUsage ? "UNKNOWN_CALL" : "REJECTED"))
        .isEqualTo(24);
    assertThat(
            reserve("twenty-fifth-refused-before-insert", translationProperties.maxOutputTokens()))
        .isNull();
    var terminal = snapshot();
    assertThat(terminal.path("document").path("state").asText()).isEqualTo("FAILED");
    assertThat(terminal.path("progress").path("errorCode").asText()).isEqualTo("BUDGET_EXCEEDED");
    assertThat(terminal.path("document").path("counters"))
        .isEqualTo(before.path("document").path("counters"));
    assertThat(
            terminal.path("document").path("owner").equals(before.path("document").path("owner")))
        .isTrue();
    assertThat(attemptCount()).isEqualTo(24);
    assertThat(sends).isEqualTo(24);
    assertThat(terminal.path("progress").path("modelReservations").size()).isZero();
    numericWitnesses.forEach(GuidedDefaultModelReservationIT::requireNumericEvidence);
    return attempts;
  }

  private Reservation reserve(String requestId, int outputCeiling) {
    return service.translationTransaction(
        controller,
        sessionId,
        1,
        current -> {
          var state = store.state(sessionId);
          var empty = JSON.createArrayNode();
          var request =
              prompts.assemble(
                  requestId,
                  1,
                  GuidedModelRequest.Kind.SOURCE_PLAN,
                  current.document(),
                  current.progress(),
                  state,
                  empty,
                  empty,
                  empty,
                  List.of(),
                  outputCeiling);
          var payload =
              C.object()
                  .put("kind", request.kind().name())
                  .put("requestId", request.requestId())
                  .put("attempt", request.attempt());
          payload.set("context", request.projection().document());
          var complete =
              C.object()
                  .put("contents", payload.toString())
                  .put("systemInstruction", request.outputContract());
          complete.set("responseJsonSchema", request.responseSchema());
          int bytes = complete.toString().getBytes(StandardCharsets.UTF_8).length + 2048;
          assertThat(bytes).isLessThanOrEqualTo(translationProperties.maxInputBytes());
          // Keep input headroom so refusal is genuinely output4096 rather than cumulative input.
          assertThat(current.document().path("counters").path("modelInputTokens").asLong() + bytes)
              .isLessThanOrEqualTo(
                  current.document().path("limits").path("maxModelInputTokensTotal").asLong());
          boolean existing = store.hasAttempt(sessionId, requestId, request.attempt());
          if (!existing
              && !service.modelReservationFitsLocked(current, bytes, request.maxOutputTokens())) {
            return null;
          }
          String projectionHash =
              GuidedContracts.hash(
                  C.object()
                      .setAll(
                          Map.of(
                              "context",
                              request.projection().document(),
                              "schemaPins",
                              prompts.schemaProvenance())));
          Instant deadline = clock.instant().plusSeconds(translationProperties.callSeconds());
          var attempt =
              store.reserveAttempt(
                  current.document(),
                  requestId,
                  request.attempt(),
                  request.kind().name(),
                  projectionHash,
                  state.path("planRevision").asLong(),
                  bytes,
                  request.maxOutputTokens(),
                  "budget-translator",
                  deadline);
          if (attempt.send()) {
            service.reserveModel(
                controller,
                sessionId,
                1,
                attempt.reservationKey(),
                bytes,
                request.maxOutputTokens());
          }
          return new Reservation(request, attempt, bytes, deadline);
        });
  }

  private void sendAndSettle(Reservation reserved, boolean unknownUsage) {
    if (!reserved.attempt().send()) {
      return;
    }
    Boolean claimed =
        service.translationTransaction(
            controller,
            sessionId,
            1,
            current ->
                store.claimSend(
                    sessionId,
                    reserved.attempt().attemptId(),
                    "budget-translator",
                    clock.instant()));
    assertThat(claimed).isTrue();
    GuidedLlmGatewayClient counted =
        (request, budget) -> {
          budget.remaining();
          assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
          var committed = snapshot();
          var reservation =
              committed
                  .path("progress")
                  .path("modelReservations")
                  .path(reserved.attempt().reservationKey());
          assertThat(reservation.path("input").asInt()).isEqualTo(reserved.inputBytes());
          assertThat(reservation.path("output").asInt()).isEqualTo(request.maxOutputTokens());
          assertThat(request.maxOutputTokens()).isEqualTo(4096);
          boolean committedBeforeSend =
              !TransactionSynchronizationManager.isActualTransactionActive()
                  && reservation.path("input").asInt() == reserved.inputBytes()
                  && reservation.path("output").asInt() == request.maxOutputTokens()
                  && "CALLING"
                      .equals(
                          jdbc.queryForObject(
                              "SELECT status FROM studio_guided_model_attempts WHERE session_id=? AND attempt_id=?",
                              String.class,
                              sessionId,
                              reserved.attempt().attemptId()));
          assertThat(committedBeforeSend).isTrue();
          sends++;
          var witness =
              C.object()
                  .put("ordinal", sends)
                  .put("reservedInput", reservation.path("input").asInt())
                  .put("reservedOutput", reservation.path("output").asInt())
                  .put("committedBeforeSend", committedBeforeSend)
                  .put("completeServiceInputEnvelopeBytes", reserved.inputBytes() - 2048)
                  .put(
                      "cumulativeInput",
                      committed.path("document").path("counters").path("modelInputTokens").asLong())
                  .put(
                      "cumulativeOutput",
                      committed
                          .path("document")
                          .path("counters")
                          .path("modelOutputTokens")
                          .asLong());
          numericWitnesses.add(witness);
          if (unknownUsage) {
            // This counted controlled call reports usage later, without another provider
            // invocation.
            pendingControlledUsage.add(
                new ControlledLateUsage(reserved.attempt().attemptId(), 20, 40));
          }
          return new GuidedModelResponse(
              unknownUsage ? GuidedModelResponse.Code.TIMEOUT : GuidedModelResponse.Code.BUSY,
              null,
              unknownUsage ? null : 20,
              unknownUsage ? null : 40,
              null);
        };
    var response =
        counted.propose(reserved.request(), new GuidedCallBudget(reserved.deadline(), clock));
    service.translationTransaction(
        controller,
        sessionId,
        1,
        current -> {
          service.settleModel(
              controller,
              sessionId,
              1,
              reserved.attempt().settlementKey(),
              reserved.attempt().reservationKey(),
              response.inputTokens(),
              response.outputTokens());
          store.finishAttempt(
              sessionId,
              reserved.attempt().attemptId(),
              unknownUsage ? "UNKNOWN_CALL" : "REJECTED",
              null,
              response.inputTokens(),
              response.outputTokens());
          return null;
        });
  }

  private void assertFrozenIdentity(Reservation reserved) {
    var stored =
        jdbc.queryForMap(
            "SELECT identity::text AS identity,request_digest FROM studio_guided_model_attempts"
                + " WHERE session_id=? AND attempt_id=?",
            sessionId,
            reserved.attempt().attemptId());
    var identity = C.parse(String.valueOf(stored.get("identity")));
    assertThat(
            GuidedContracts.canonical(identity)
                .equals(GuidedContracts.canonical(reserved.attempt().identity())))
        .isTrue();
    assertThat(identity.path("outputCeiling").asInt()).isEqualTo(4096);
    assertThat(identity.path("inputCeiling").asInt()).isEqualTo(reserved.inputBytes());
    var digest = C.object();
    for (String key :
        List.of(
            "requestId",
            "attempt",
            "kind",
            "projectionHash",
            "planRevision",
            "inputCeiling",
            "outputCeiling")) {
      digest.set(key, identity.path(key));
    }
    assertThat(stored.get("request_digest").equals(GuidedContracts.hash(digest))).isTrue();
  }

  private long attemptCount() {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=?",
        Long.class,
        sessionId);
  }

  private ObjectNode snapshot() {
    return repository.transaction(
        () -> {
          var actual = repository.lock(sessionId);
          return C.object()
              .setAll(
                  Map.of(
                      "document",
                      actual.document().deepCopy(),
                      "progress",
                      actual.progress().deepCopy()));
        });
  }

  private record Reservation(
      GuidedModelRequest request,
      GuidedTranslationStore.Attempt attempt,
      int inputBytes,
      Instant deadline) {}

  private record ControlledLateUsage(String attemptId, int input, int output) {}

  private static void requireNumericEvidence(JsonNode value) {
    if (value.isContainerNode()) {
      value.forEach(GuidedDefaultModelReservationIT::requireNumericEvidence);
    } else {
      assertThat(value.isNumber() || value.isBoolean()).isTrue();
    }
  }

  private static JsonNode versions() {
    return C.parse("{\"contract\":3}");
  }

  private void seedSource() throws Exception {
    testId = UUID.randomUUID();
    var source =
        new AuthoringV2Request(
            2, null, List.of(new AuthoringStep(UUID.randomUUID(), "Open Orders", null)));
    jdbc.update(
        ("INSERT INTO users(id,sso_id,name,email,created_at) VALUES "
            + "(?,'budget-user','Budget','budget@example.invalid',now())"),
        UUID.randomUUID());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES"
            + " ('CSI-123','Orders','Ops','HIGH','budget@example.invalid','Production')");
    jdbc.update(
        ("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,"
                + "variables,authoring,authoring_revision_inputs,created_by,"
                + "created_at,updated_at)")
            + (" VALUES (?,'Model default "
                + "accounting','CSI-123','fixture','chromium',?::jsonb,'[]'::jsonb,"
                + "?::jsonb,?::jsonb,'budget@example.invalid',now(),now())"),
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
      assertThat(principal).isSameAs(user);
      var scope =
          C.object()
              .put("principalId", "budget-user")
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
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM users u JOIN csi_systems c ON c.owner_email=u.email"
                      + " WHERE u.sso_id=? AND c.id=?",
                  Integer.class,
                  session.path("scope").path("principalId").asText(),
                  session.path("scope").path("csiId").asText()))
          .isEqualTo(1);
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
      assertThat(principal).isSameAs(user);
      assertThat(
              new CsiOwnershipEvaluator()
                  .canExecute(principal, session.path("scope").path("csiId").asText()))
          .isTrue();
      assertThat(
              ((BffAuthenticationToken) principal)
                  .getPrincipal()
                  .userId()
                  .equals(session.path("scope").path("principalId").asText()))
          .isTrue();
    }
  }
}
