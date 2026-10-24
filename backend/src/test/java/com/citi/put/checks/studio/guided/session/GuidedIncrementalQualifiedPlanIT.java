package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

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
 * Round 058 (QA round-057 recommendation 1): the incremental {@code SOURCE_PLAN} wiring of {@code
 * scopeIntent}. {@code learnSuffix} must hand the manifest's authored step text to the plan
 * admission, exactly as the full-learn site does; with {@code null} there, no qualified obligation
 * can ever be admitted on the incremental path. Real PostgreSQL, real session service, store and
 * coordinator; only the provider is scripted and {@code repository.incremental()} is a test double
 * that says "this session has a learning base and window" (building a real relearn base needs a
 * published revision and is exercised by the publication ITs). No runner or browser is involved.
 */
class GuidedIncrementalQualifiedPlanIT {
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
  private final MutableClock clock = new MutableClock();
  private JdbcTemplate jdbc;
  private GuidedSessionRepository repository;
  private GuidedSessionService service;
  private GuidedTranslationStore store;
  private GuidedTranslationService translation;
  private GuidedTranslationProperties translationProperties;
  private String sessionId;
  private UUID testId;
  private String stepId;
  private String stepText;

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
  private void fixture(String authoredText) throws Exception {
    Map<String, Integer> limits = Map.of();
    stepText = authoredText;
    gateway.requests.clear();
    gateway.script.clear();
    String database = "incremental_qualified_" + UUID.randomUUID().toString().replace("-", "");
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
    stepId = document().path("sourceSteps").get(0).path("stepId").asText();
    service.prepareAssignment(controller, sessionId, "retry-assignment", "worker-1");
    ObjectNode claim =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", sessionId)
            .put("workerId", "worker-1")
            .put("expectedFence", 0);
    claim.set("versions", C.parse("{\"contract\":3}"));
    service.claim(worker, sessionId, "retry-claim", claim);
    seedMaterialization();
    markBootstrapReady();
    var translationRepository = spy(repository);
    doReturn(incrementalBase()).when(translationRepository).incremental();
    translation =
        new GuidedTranslationService(
            service,
            translationRepository,
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
  }

  /** The live materialization row a bootstrapped session has (no authored inputs). */
  private void seedMaterialization() {
    JsonNode session = document();
    ObjectNode inputs =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", sessionId)
            .put("scopeHash", session.path("scopeHash").asText());
    for (String field : List.of("sourceRevision", "configurationRevision")) {
      inputs.set(field, session.path("scope").path(field));
    }
    inputs.putArray("inputs");
    jdbc.update(
        "INSERT INTO studio_guided_materializations"
            + "(session_id,scope_hash,context_id,context_revision,materialization_revision,"
            + "worker_id,owner_fence,source_revision,configuration_revision,"
            + "authored_inputs_hash,authored_inputs)"
            + " VALUES (?,?,'bootstrap-context',1,1,'worker-1',1,?,?,?,?::jsonb)",
        sessionId,
        session.path("scopeHash").asText(),
        session.path("scope").path("sourceRevision").asText(),
        session.path("scope").path("configurationRevision").asText(),
        GuidedContracts.hash(inputs),
        inputs.toString());
  }

  /** The state a session has once the runner acknowledged the bootstrap context (marker v2). */
  private void markBootstrapReady() {
    repository.transaction(
        () -> {
          var session = repository.lock(sessionId);
          ObjectNode marker = C.object().put("phase", "READY");
          ObjectNode context = marker.putObject("context").put("contextId", "context-1");
          ObjectNode identity = marker.putObject("identity").put("scopeHash", "scope-1");
          marker
              .putObject("metadataAcknowledgement")
              .put("version", 2)
              .put("deliveryId", "delivery-1")
              .put("contextHash", GuidedContracts.hash(context))
              .put("identityHash", GuidedContracts.hash(identity));
          session.progress().set("translationBootstrap", marker);
          repository.save(session);
          return null;
        });
  }

  /** Says only "this session has a learning base"; the window is the real one's shape. */
  private GuidedIncrementalStore incrementalBase() {
    var incremental = mock(GuidedIncrementalStore.class);
    when(incremental.hasBase(sessionId)).thenReturn(true);
    when(incremental.pending(sessionId)).thenReturn(false);
    when(incremental.firstSuffixPending(sessionId)).thenReturn(true);
    when(incremental.learningWindow(any()))
        .thenAnswer(
            call -> {
              ObjectNode window =
                  C.object().put("firstLearnStepId", stepId).put("nextSemanticOrdinal", 0);
              window.putArray("learnableStepIds").add(stepId);
              window.putArray("completedCoordinates");
              window.putArray("availableBindingIds");
              return window;
            });
    return incremental;
  }

  private JsonNode document() {
    return repository.transaction(() -> repository.lock(sessionId).document().deepCopy());
  }

  private JsonNode replan() {
    return translation.replan(controller, sessionId, 1, "replan-key", command());
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

  private JsonNode acceptedPlan() {
    return repository.transaction(() -> store.state(sessionId).path("plan").deepCopy());
  }

  /** A SOURCE_PLAN answer for the one authored step: click "Open" qualified by the region. */
  private Function<GuidedModelRequest, GuidedModelResponse> clickOpen(String scopeIntent) {
    return request -> {
      ObjectNode proposal = C.object().put("status", "PLAN");
      proposal.putArray("sourceReferences");
      ObjectNode obligation =
          proposal
              .putArray("obligations")
              .addObject()
              .put("stepId", stepId)
              .put("occurrence", 0)
              .put("operationKind", "click")
              .put("targetIntent", "Open");
      obligation.put("scopeIntent", scopeIntent);
      obligation.putNull("referenceIndex").putNull("needId").putNull("predicate");
      proposal.putArray("needs");
      return new GuidedModelResponse(GuidedModelResponse.Code.OK, proposal, null, null, "model");
    };
  }

  // ── tests ──────────────────────────────────────────────────────────────────────────────────

  @Test
  void theIncrementalSourcePlanAdmitsAQualifiedStepAgainstTheAuthoredStepText() throws Exception {
    fixture("Click Open in Primary workspace");
    gateway.script.add(clickOpen("Primary workspace"));

    // What follows acceptance (suffix materialization needs a runner) is not under test here.
    Throwable after = catchThrowable(this::replan);

    assertThat(rows()).as("one applied attempt, no repair round").containsExactly("1:APPLIED:-");
    assertThat(gateway.requests).hasSize(1);
    assertThat(
            gateway.requests.getFirst().projection().document().path("learningWindow").isObject())
        .as("the request really is the incremental SOURCE_PLAN")
        .isTrue();
    JsonNode obligation = acceptedPlan().path("obligations").get(0);
    assertThat(obligation.path("stepId").asText()).isEqualTo(stepId);
    assertThat(obligation.path("targetIntent").asText()).isEqualTo("Open");
    assertThat(obligation.path("scopeIntent").asText()).isEqualTo("Primary workspace");
    assertThat(
            after instanceof GuidedSessionException refused
                && refused.getMessage().equals("INVALID_CONTRACT"))
        .as("the qualified obligation was admitted, not refused: %s", after)
        .isFalse();
  }

  @Test
  void theIncrementalSourcePlanStillRefusesAQualifierTheStepTextDoesNotSay() throws Exception {
    fixture("Click Open in Primary workspace");
    gateway.script.addAll(
        List.of(
            clickOpen("Billing workspace"),
            clickOpen("Billing workspace"),
            clickOpen("Billing workspace")));

    assertThatThrownBy(this::replan)
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            e -> {
              assertThat(e.getMessage()).isEqualTo("INVALID_CONTRACT");
              assertThat(e.status()).isEqualTo(422);
            });

    assertThat(rows()).hasSize(3).allMatch(row -> row.contains("REJECTED"));
    assertThat(acceptedPlan().path("obligations").isMissingNode() || acceptedPlan().isNull())
        .as("nothing was accepted")
        .isTrue();
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
            2, null, List.of(new AuthoringStep(UUID.randomUUID(), stepText, null)));
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
        JSON.writeValueAsString(List.of(stepText)),
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
      scope.putArray("capabilities").add("observe").add("click");
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
