package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
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
import com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore;
import com.citi.put.checks.studio.guided.translation.GuidedDependencyPlanner;
import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess;
import com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler;
import com.citi.put.checks.studio.guided.translation.GuidedProposalValidator;
import com.citi.put.checks.studio.guided.translation.GuidedResponseParser;
import com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier;
import com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver;
import com.citi.put.checks.studio.guided.translation.GuidedSourceSnapshotRepository;
import com.citi.put.checks.studio.guided.translation.GuidedStepVerifier;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationService;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationStore;
import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * STUDIO-OBS-015 (aria-bridge-ruling01 §4): the joined bridge cases that need a positive admission,
 * driven by planner-issued obligations. Real PostgreSQL, real mutually authenticated HTTPS in both
 * directions, actual Chromium, the real {@link GuidedTranslationService} planner against a
 * controlled model provider over real HTTP, and the production internal admissions route.
 *
 * <p>Rules (ruling §1): the test never writes plan, obligation, manifest or translation-state rows
 * and never calls the store's plan/obligation/admission writers (R-1). The only model is the
 * controlled provider, which only selects an obligation and a {@code {target, operation}} (R-2). A
 * reservation is taken by the real {@code advance}, stopped by a spy at {@code prepareAndAdmit}
 * after the reservation committed (R-3), and admitted through the internal route with the planner's
 * key and bytes. Hand-crafted proposals are used only as refusal probes (R-4). Test-side session
 * writes only narrow and then restore the state they narrowed from (R-5).
 */
@SpringBootTest(
    classes = GuidedBridgePlannedIT.Application.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false",
      "spring.jpa.hibernate.ddl-auto=none"
    })
class GuidedBridgePlannedIT {
  static final GuidedBridgeFixture ENV;

  // aria-bridge-ruling01 N5: the controlled model provider (R-2). It only selects.
  static final HttpServer PROVIDER;
  static final List<String> PROVIDER_KINDS = new CopyOnWriteArrayList<>();

  /** The per-session SOURCE_PLAN template the provider answers with. */
  static volatile ObjectNode sourcePlan;

  /** The per-reservation NEXT_ACTION selection: an occurrence and a {target, operation}. */
  static volatile Selection nextSelection;

  /** Set in {@code @BeforeEach} for the configuration-reference case only. */
  static volatile boolean configuredInput;

  record Selection(int occurrence, ObjectNode action) {}

  static {
    try {
      ENV =
          new GuidedBridgeFixture(
              "guided-bridge-planned-", Path.of("/tmp/studio-obs015-bridge-planned-worker.json"));
      PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      PROVIDER.createContext(
          "/",
          exchange -> {
            try {
              JsonNode wire =
                  ENV.contracts.parse(
                      new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
              JsonNode request =
                  ENV.contracts.parse(
                      wire.path("contents").get(0).path("parts").get(0).path("text").asText());
              ObjectNode envelope = ENV.contracts.object();
              envelope
                  .putArray("candidates")
                  .addObject()
                  .put("finishReason", "STOP")
                  .putObject("content")
                  .putArray("parts")
                  .addObject()
                  .put("text", providerResponse(request).toString());
              envelope
                  .putObject("usageMetadata")
                  .put("promptTokenCount", 100)
                  .put("candidatesTokenCount", 100);
              byte[] output = envelope.toString().getBytes(StandardCharsets.UTF_8);
              exchange.getResponseHeaders().add("Content-Type", "application/json");
              exchange.sendResponseHeaders(200, output.length);
              exchange.getResponseBody().write(output);
            } catch (RuntimeException failure) {
              // Fail fast and visibly: the @AfterEach provider-kind check names the fault.
              PROVIDER_KINDS.add("PROVIDER_FAULT:" + failure.getMessage());
              exchange.sendResponseHeaders(500, -1);
            } finally {
              exchange.close();
            }
          });
      PROVIDER.start();
      ENV.start();
    } catch (Exception failure) {
      throw new ExceptionInInitializerError(failure);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    ENV.properties(registry);
  }

  /**
   * aria-bridge-ruling01 N4: GuidedPlanningIntegrationTest's application shape with the bridge's
   * internal routes only. No GuidedTranslationCoordinator or GuidedSessionReaper is registered, so
   * no scheduler can advance a reservation behind the test.
   */
  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration(exclude = FlywayAutoConfiguration.class)
  @EntityScan("com.citi.put.checks")
  @EnableJpaRepositories("com.citi.put.checks.studio")
  @Import({
    GuidedInternalController.class,
    GuidedInternalSecurity.class,
    GuidedWireBodyAdvice.class
  })
  static class Application {
    @Bean
    org.springframework.boot.web.servlet.FilterRegistrationBean<jakarta.servlet.Filter>
        completionFault() {
      return ENV.completionFault();
    }

    @Bean
    DataSource dataSource() {
      return new DriverManagerDataSource(
          ENV.database.getJdbcUrl(), ENV.database.getUsername(), ENV.database.getPassword());
    }

    @Bean
    GuidedContracts contracts() {
      return ENV.contracts;
    }

    /** JDBC and JPA (StudioRepository.findByIdForUpdate) share one transaction. */
    @Bean
    GuidedSessionRepository repository(JdbcTemplate jdbc, PlatformTransactionManager manager) {
      return new GuidedSessionRepository(jdbc, new TransactionTemplate(manager), ENV.contracts);
    }

    @Bean
    GuidedTranslationStore translationStore(JdbcTemplate jdbc) {
      return new GuidedTranslationStore(jdbc, ENV.contracts);
    }

    @Bean
    GuidedClarificationContextStore questions(JdbcTemplate jdbc) {
      return new GuidedClarificationContextStore(jdbc, ENV.contracts);
    }

    @Bean
    GuidedTranslationProperties properties() {
      return new GuidedTranslationProperties(
          true, true, List.of("orders"), List.of("fixture"), 131072, 2048, 60, "worker-1");
    }

    @Bean
    GuidedSourceSnapshotRepository snapshots(StudioRepository repository) {
      return new GuidedSourceSnapshotRepository(repository, ENV.contracts);
    }

    @Bean
    GuidedSourceClassifier classifier(GuidedTranslationProperties props) {
      return new GuidedSourceClassifier(ENV.contracts, props, new CredentialPatternScreen());
    }

    @Bean
    GuidedSourceInputResolver inputs() {
      return new GuidedSourceInputResolver(ENV.contracts);
    }

    @Bean
    GuidedStepVerifier verifier(GuidedTranslationStore store) {
      return new GuidedStepVerifier(store);
    }

    private com.citi.put.checks.studio.guided.publication.ObservedReplayPins fixturePins() {
      var policy =
          ENV.contracts
              .object()
              .put("version", 1)
              .put("policyId", "fixture-policy")
              .put("policyVersion", "1")
              .put("applicationId", "orders")
              .put("environment", "fixture")
              .put("entryPolicyId", "blank");
      policy.putArray("allowedOrigins").add(ENV.origin);
      policy.putArray("rules");
      policy.putNull("applicationPolicy");
      return new com.citi.put.checks.studio.guided.publication.ObservedReplayPins(
          ENV.contracts,
          new com.citi.put.checks.studio.guided.publication.ObservedReplayProperties(
              true, 30000, 1048576, 4194304, 2097152, "[]", "[" + policy + "]", 1280, 720));
    }

    @Bean
    GuidedProductionSessionAccess access(
        GuidedSourceSnapshotRepository snapshots,
        GuidedSourceClassifier classifier,
        GuidedSourceInputResolver inputs,
        GuidedTranslationStore store,
        GuidedStepVerifier verifier) {
      return new GuidedProductionSessionAccess(
          snapshots,
          classifier,
          inputs,
          store,
          verifier,
          new CsiOwnershipEvaluator(),
          fixturePins(),
          new com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver(
              new com.citi.put.checks.studio.secrets.FakeStudioVaultProvider(java.util.Map.of()),
              (principal, csi, env, secret) -> true),
          (principal, csi, env, secret) -> true);
    }

    @Bean
    GuidedMaterializationService materialization(JdbcTemplate jdbc) {
      return new GuidedMaterializationService(jdbc, ENV.contracts);
    }

    @Bean
    GuidedSessionService sessions(
        GuidedSessionRepository repository,
        GuidedProductionSessionAccess access,
        JdbcTemplate jdbc,
        GuidedMaterializationService materialization,
        GuidedTranslationStore store,
        GuidedClarificationContextStore questions) {
      var service =
          new GuidedSessionService(
              repository,
              ENV.contracts,
              access,
              new GuidedSessionProperties(true, Map.of()),
              Clock.systemUTC());
      service.installBridge(
          materialization,
          new GuidedPreparationStore(jdbc, ENV.contracts),
          new GuidedBindingStore(jdbc, ENV.contracts, materialization),
          new GuidedAssignmentStore(jdbc, ENV.contracts));
      service.installTranslation(store, questions);
      service.installEvidence(
          new com.citi.put.checks.studio.guided.evidence.RecordedGuidedEvidenceProjection(
              new com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceRepository(jdbc),
              new com.citi.put.checks.studio.guided.evidence.GuidedRecordingProperties(null),
              false,
              ENV.contracts));
      // STUDIO-OBS-014 S3: one uniform governed policy for the class (ar-mounted-rules B14); the
      // migrated reads rely on its business-read grant.
      com.citi.put.checks.studio.support.ObservedPublicationFixture.installGovernance(
          service,
          jdbc,
          "CSI-123",
          "orders",
          "fixture",
          java.util.List.of(ENV.origin),
          governedPolicy());
      return service;
    }

    @Bean
    HttpRunnerDispatchClient runner() {
      return new HttpRunnerDispatchClient(
          URI.create("https://127.0.0.1:" + ENV.runnerPort),
          ENV.tls,
          () -> token("backend-controller", "controller-1", "studio-guided-runner"),
          ENV.contracts);
    }

    @Bean
    GuidedDispatchService dispatch(
        GuidedSessionService sessions,
        GuidedMaterializationService materialization,
        HttpRunnerDispatchClient runner) {
      var dispatch = new GuidedDispatchService(sessions, materialization, runner);
      sessions.installStopSender(dispatch::stop);
      return dispatch;
    }

    @Bean(destroyMethod = "close")
    GenAiGatewayTransport transport() throws Exception {
      var props =
          new StudioGatewayProperties(
              "http://127.0.0.1:" + PROVIDER.getAddress().getPort(),
              "project",
              "global",
              "model",
              new StudioGatewayProperties.Credentials("none", null),
              Duration.ofSeconds(60),
              1,
              131072,
              65536,
              StudioGatewayProperties.DEFAULT_MAX_OUTPUT_TOKENS,
              StudioGatewayProperties.ThinkingLevel.LOW,
              StudioGatewayProperties.ProviderFeatures.ALL);
      return new GenAiGatewayTransport(props);
    }

    @Bean
    GuidedLlmGatewayClient gateway(GenAiGatewayTransport transport) {
      return new GenAiGuidedLlmGatewayClient(transport, new GuidedResponseParser(ENV.contracts));
    }

    @Bean
    GuidedTranslationService translation(
        GuidedSessionService sessions,
        GuidedSessionRepository repository,
        GuidedTranslationStore store,
        GuidedClarificationContextStore questions,
        GuidedDispatchService dispatch,
        GuidedLlmGatewayClient gateway,
        GuidedSourceInputResolver inputs,
        GuidedTranslationProperties properties,
        JdbcTemplate jdbc) {
      var service =
          new GuidedTranslationService(
              sessions,
              repository,
              store,
              questions,
              dispatch,
              gateway,
              ENV.contracts,
              new GuidedPromptAssembler(ENV.contracts),
              inputs,
              new GuidedProposalValidator(ENV.contracts),
              new GuidedDependencyPlanner(sessions),
              properties,
              Clock.systemUTC());
      service.installDatabase(jdbc);
      return service;
    }
  }

  /**
   * The class's governed observation application policy (ar-mounted-rules B14): a structural policy
   * with one business-read grant on {@code <main aria-label='Operations'>}. On pages without that
   * anchor (privacyEcho, nativeToggle, /echo) the grant yields no candidate, so the uniform policy
   * behaves as "no grants" there.
   */
  static ObjectNode governedPolicy() {
    return ENV.governedPolicy();
  }

  /**
   * aria-bridge-ruling01 N5. SOURCE_PLAN answers with the session's template; for the configuration
   * case it appends the classifier's {@code fill.value} configuration reference
   * (GuidedPlanningIntegrationTest's saved-source shape). NEXT_ACTION selects the remaining
   * obligation of the requested occurrence and a {target, operation}. Every bridge-authority field
   * is built server-side.
   */
  static ObjectNode providerResponse(JsonNode request) {
    String kind = request.path("kind").asText();
    PROVIDER_KINDS.add(kind);
    ObjectNode response =
        ENV.contracts
            .object()
            .put("schemaVersion", 3)
            .put("kind", kind)
            .put("requestId", request.path("requestId").asText());
    if (kind.equals("SOURCE_PLAN")) {
      ObjectNode plan = sourcePlan.deepCopy();
      if (plan.path("useConfiguration").asBoolean()) {
        plan.remove("useConfiguration");
        ObjectNode saved = null;
        for (JsonNode reference : request.path("context").path("configurationReferences")) {
          if (reference.path("intendedSlot").asText().equals("fill.value")) {
            saved = reference.deepCopy();
          }
        }
        if (saved == null) {
          throw new IllegalStateException("CONFIGURATION_REFERENCE_MISSING");
        }
        saved.put("referenceKind", "configuration").put("configurationRevision", "1");
        // The closed public configuration-reference shape permits referenceName only for secretRef.
        if (!saved.path("kind").asText().equals("secretRef")) {
          saved.remove("referenceName");
        }
        plan.withArray("sourceReferences").add(saved);
      }
      return (ObjectNode) response.setAll(plan);
    }
    if (!kind.equals("NEXT_ACTION")) {
      throw new IllegalStateException("UNEXPECTED_" + kind);
    }
    Selection next = nextSelection;
    if (next == null) {
      throw new IllegalStateException("NO_SELECTION");
    }
    JsonNode chosen = null;
    for (JsonNode obligation : request.path("context").path("obligations")) {
      if (obligation.path("occurrence").asInt() == next.occurrence()) {
        chosen = obligation;
      }
    }
    if (chosen == null) {
      throw new IllegalStateException("UNPLANNED_OCCURRENCE");
    }
    response
        .put("status", "ACTION")
        .put("obligationId", chosen.path("obligationId").asText())
        .putNull("question")
        .set("action", next.action().deepCopy());
    return response;
  }

  /** GuidedPlanningIntegrationTest's obligation template, verbatim. */
  static ObjectNode obligation(
      String step, int occurrence, String kind, String target, Integer reference, String need) {
    ObjectNode item =
        ENV.contracts
            .object()
            .put("stepId", step)
            .put("occurrence", occurrence)
            .put("operationKind", kind)
            .put("targetIntent", target)
            .putNull("scopeIntent")
            .putNull("predicate");
    if (reference == null) {
      item.putNull("referenceIndex");
    } else {
      item.put("referenceIndex", reference);
    }
    if (need == null) {
      item.putNull("needId");
    } else {
      item.put("needId", need);
    }
    return item;
  }

  /** The single authored step; the configuration case declares and references a plain input. */
  static String sourceText() {
    return "Visit "
        + ENV.origin
        + "/start then copy the displayed order into Destination and type fixture-input."
        + (configuredInput ? " Use <var config>." : "");
  }

  @LocalServerPort int backendPort;
  @Autowired GuidedSessionService sessions;
  @Autowired GuidedSessionRepository repository;
  @Autowired GuidedMaterializationService materialization;
  @Autowired GuidedDispatchService dispatch;
  @Autowired HttpRunnerDispatchClient runner;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource fixtureDataSource;
  @Autowired GuidedTranslationStore store;
  @Autowired GuidedClarificationContextStore questions;
  @Autowired GuidedTranslationService translation;
  @Autowired GuidedLlmGatewayClient gateway;
  @Autowired GuidedSourceInputResolver inputs;
  @Autowired GuidedTranslationProperties properties;
  final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");
  final Authentication user =
      new BffAuthenticationToken(
          new UserIdentity(
              "user-1",
              "fixture@example.test",
              "Fixture",
              "Test",
              List.of(),
              List.of(new CsiOwnershipEntry("CSI-123", "owner"))));
  RunnerProcessHarness workerHarness;
  UUID testId;
  UUID step;

  @BeforeEach
  void startWorker(org.junit.jupiter.api.TestInfo testInfo) throws Exception {
    String testName = ENV.prepareScenario(testInfo);
    ENV.isolateDatabase(fixtureDataSource);
    // STUDIO-OBS-014 S3b: each test runs on a freshly migrated isolated database, so the class's
    // approved governed policy is seeded here; the bean-time seed only reached the base database.
    com.citi.put.checks.studio.support.ObservedPublicationFixture.seedPolicy(
        jdbc, "CSI-123", "orders", "fixture", List.of(ENV.origin), governedPolicy(), "ALLOW");
    // aria-bridge-ruling01 N6: the real source of truth is one ui_tests row (planning IT shape).
    configuredInput =
        testName.equals("authorizedConfigurationReferenceIsAllocatedTransportedAndConsumedExactly");
    PROVIDER_KINDS.clear();
    sourcePlan = null;
    nextSelection = null;
    jdbc.update(
        "INSERT INTO users(id,sso_id,name,email,created_at) VALUES (?,'guided-fixture','Guided"
            + " Test','user-1',now()) ON CONFLICT DO NOTHING",
        UUID.randomUUID());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES"
            + " ('CSI-123','Guided fixture','Ops','HIGH','user-1','Production') ON CONFLICT DO"
            + " NOTHING");
    testId = UUID.randomUUID();
    step = UUID.randomUUID();
    var authoring =
        new AuthoringV2Request(2, null, List.of(new AuthoringStep(step, sourceText(), null)));
    ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    jdbc.update(
        "INSERT INTO ui_tests(id, name, csi_id, environment, browser, steps, variables, authoring,"
            + " authoring_revision_inputs, created_by, created_at, updated_at) VALUES (?, 'Guided"
            + (" bridge','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?::jsonb,?::jsonb,'user"
                + "-1',now(),now())"),
        testId,
        mapper.writeValueAsString(List.of(sourceText())),
        configuredInput
            ? "[{\"name\":\"config\",\"kind\":\"plain\",\"value\":\"" + ENV.configInput + "\"}]"
            : "[]",
        mapper.writeValueAsString(authoring),
        mapper.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())));
    ENV.resetWorkerState();
    Path journal = ENV.prepareWorkerJournal();
    // STUDIO-OBS-014 S3 (RK-2, ar-mounted-rules): the worker is given neither `rules` nor
    // `applicationPolicy`; the class's governed policy (governedPolicy()) is frozen into each
    // session and reaches the worker in the hash-bound context. This record is what the runner was
    // configured with (no secret); the runner refuses any key it does not enumerate.
    ObjectNode config =
        ENV.contracts
            .object()
            .put("workerId", "worker-1")
            .put("host", "127.0.0.1")
            .put("port", ENV.runnerPort)
            .put("journalDirectory", journal.toString())
            .put("controllerIssuer", "fixture-issuer")
            .put("controllerSubject", "controller-1")
            .put("callbackBaseUrl", "https://localhost:" + backendPort);
    Files.writeString(ENV.temp.resolve("worker.json"), config.toString());
    // STUDIO-OBS-009 AC-3 / AC-12 h: the one folded entry point over TLS, spawned and reaped by the
    // harness. STUDIO-OBS-013/014 S3: a per-class object store, never a shared default directory.
    workerHarness = ENV.startWorker(journal, backendPort);
    workerHarness.awaitReady(Duration.ofSeconds(60));
  }

  @AfterEach
  void closeWorker() throws Exception {
    ENV.releaseClaimResponse.countDown();
    ENV.releaseRefreshCallback.countDown();
    var harness = workerHarness;
    workerHarness = null;
    ENV.closeWorker(harness);
    // aria-bridge-ruling01 §4.5: the controlled model only ever plans and selects.
    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "NEXT_ACTION");
  }

  @AfterAll
  static void close() {
    ENV.application.stop(0);
    PROVIDER.stop(0);
    ENV.database.stop();
  }

  @Test
  void realBlankReadConsumerHasIndependentReceiptsAndNoSecondDispatch() throws Exception {
    String id = plannedSession(planDataflow());
    assertThat(ENV.connections.get()).isEqualTo(1);
    assertThat(ENV.navigations.get()).isZero();
    JsonNode blank = progress(id).path("executionEvidence");
    assertThat(blank.path("origin").isNull()).isTrue();
    assertThat(blank.path("kind").asText()).isEqualTo("initialBlank");
    ObjectNode navigate = proposal(id, 0, "navigate", null);
    navigate.withObject("/operation").put("destinationInputId", inputId(id, 0));
    JsonNode navigateAssociation = reserve(id, navigate);
    JsonNode first = admit(id, navigateAssociation);
    JsonNode firstConsumed = advance(id, first, "first");
    assertThat(ENV.navigations.get()).isEqualTo(1);
    assertThat(progress(id).path("executionEvidence").path("kind").asText())
        .isEqualTo("observedDocument");
    assertThat(advance(id, first, "first").path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(advance(id, first, "new-key").path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(ENV.navigations.get()).isEqualTo(1);
    String binding = bindingId(id, "order");
    ObjectNode premature = proposal(id, 1, "fill", "destination");
    premature
        .withObject("/operation")
        .set("value", ENV.contracts.object().put("kind", "binding").put("bindingId", binding));
    // Negative probe (R-4): a hand-crafted consumer before its producer is refused.
    JsonNode refusedOrder =
        post(
            id,
            "admissions",
            premature,
            "before-producer",
            token("backend-controller", "controller-1", "studio-guided-controller"),
            422);
    assertThat(refusedOrder.path("code").asText()).isEqualTo("MISSING_SOURCE");
    assertThat(actionCount(id)).isEqualTo(1);
    ObjectNode read = proposal(id, 1, "read", "source");
    read.withObject("/operation")
        .put("bindingId", binding)
        .set(
            "recipe",
            ENV.contracts
                .object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", "business-read"));
    JsonNode readLedger = admit(id, reserve(id, read));
    advance(id, readLedger, "read");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_producers WHERE session_id=?",
                Integer.class,
                id))
        .isEqualTo(1);
    ObjectNode callback = materialization.identity(sessions.runnerContext(controller, id, 1));
    callback.set(
        "ledger",
        ENV.contracts.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                readLedger.path("admission").path("admissionId").asText())));
    JsonNode receipt =
        ENV.contracts
            .parse(
                jdbc.queryForObject(
                    "SELECT document::text FROM studio_guided_producers WHERE session_id=?",
                    String.class,
                    id))
            .path("availability");
    callback.set("availability", receipt);
    int revision =
        sessions.runnerContext(controller, id, 1).path("materializationRevision").asInt();
    post(
        id,
        "outcomes",
        callback,
        "duplicate-read",
        token("owning-worker", "worker-1", "studio-guided-controller"),
        202);
    assertThat(sessions.runnerContext(controller, id, 1).path("materializationRevision").asInt())
        .isEqualTo(revision);
    ObjectNode changedReceipt = callback.deepCopy();
    changedReceipt.withObject("/availability").put("bindingId", "changed");
    post(
        id,
        "outcomes",
        changedReceipt,
        "changed-receipt",
        token("owning-worker", "worker-1", "studio-guided-controller"),
        409);
    ObjectNode valueLeak = callback.deepCopy();
    valueLeak.withObject("/availability").put("value", ENV.capture);
    JsonNode refused =
        post(
            id,
            "outcomes",
            valueLeak,
            "private-value",
            token("owning-worker", "worker-1", "studio-guided-controller"),
            422);
    assertThat(refused.toString()).doesNotContain(ENV.capture);
    ObjectNode fill = proposal(id, 2, "fill", "destination");
    fill.withObject("/operation")
        .set("value", ENV.contracts.object().put("kind", "binding").put("bindingId", binding));
    JsonNode fillLedger = admit(id, reserve(id, fill));
    advance(id, fillLedger, "fill");

    long styleScope008BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePoll1 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(ENV.receipt.get() != null) && System.nanoTime() < styleScope008BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope008BridgePoll = new BridgePoll1();
    if (!styleScope008BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgePlannedIT: application fill receipt")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope008BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope008BridgePoll.initialAwaitTick) {
                    styleScope008BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope008BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope008BridgePoll.terminal) {
          styleScope008BridgePoll.step();
        }
      }
    }
    if (styleScope008BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope008BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(ENV.receipt.get() != null).isTrue();

    assertThat(ENV.receipt.get()).isEqualTo(ENV.capture);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_consumer_edges WHERE session_id=?",
                Integer.class,
                id))
        .isEqualTo(1);
    String persisted =
        jdbc.queryForObject(
            "SELECT string_agg(document::text,'') FROM studio_guided_producers WHERE session_id=?",
            String.class,
            id);
    assertThat(persisted).doesNotContain(ENV.capture, "valueHash", "length", "sample");
    JsonNode admittedNavigate = navigateAssociation.path("proposal");
    assertThat(
            GuidedContracts.hash(
                ENV.contracts.object().set("coordinate", admittedNavigate.path("coordinate"))))
        .hasSize(64);
    assertThat(firstConsumed.path("operationHash").asText())
        .isEqualTo(operationHash(admittedNavigate));
    ObjectNode fake = (ObjectNode) admittedNavigate.deepCopy();
    fake.withObject("/executionEvidence").put("origin", ENV.origin);
    assertThat(operationHash(fake)).isNotEqualTo(operationHash(admittedNavigate));
    sessions.cancel(
        user,
        id,
        "cancel",
        ENV.contracts.object().put("schemaVersion", 3).put("reason", "userRequested"));

    long styleScope009BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePoll2 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(progress(id).path("teardownStatus").asText().equals("CONFIRMED"))
              && System.nanoTime() < styleScope009BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope009BridgePoll = new BridgePoll2();
    if (!styleScope009BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgePlannedIT: teardown confirmed")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope009BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope009BridgePoll.initialAwaitTick) {
                    styleScope009BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope009BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope009BridgePoll.terminal) {
          styleScope009BridgePoll.step();
        }
      }
    }
    if (styleScope009BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope009BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(progress(id).path("teardownStatus").asText().equals("CONFIRMED")).isTrue();

    assertThatThrownBy(() -> sessions.runnerContext(controller, id, 1)).hasMessage("CANCELLED");
    // ar-mounted-rules qaOracle (3), moved from the retired configured-region case: the mounted
    // worker.json carries neither `rules` nor `applicationPolicy`; the read above was authorized by
    // the governed policy alone.
    JsonNode mounted = ENV.contracts.parse(Files.readString(ENV.temp.resolve("worker.json")));
    assertThat(mounted.has("rules")).isFalse();
    assertThat(mounted.has("applicationPolicy")).isFalse();
    // aria-bridge-ruling01 §4.3: compensating DB oracle for the retired private-echo case.
    assertThat(
            jdbc.queryForObject(
                "SELECT string_agg(response::text,'') FROM studio_guided_commands WHERE namespace=?",
                String.class,
                id))
        .doesNotContain(ENV.capture.strip());
  }

  @Test
  void concurrentPreparationsForSameAdmissionKeyUseOneImmutableAdmission() throws Exception {
    String id = plannedSession(planNav());
    JsonNode association = reserve(id, navigation(id));
    var admissions =
        race(
            () ->
                dispatch.prepareAndAdmit(
                    controller,
                    id,
                    1,
                    association.path("admissionKey").asText(),
                    association.path("proposal")),
            () ->
                dispatch.prepareAndAdmit(
                    controller,
                    id,
                    1,
                    association.path("admissionKey").asText(),
                    association.path("proposal")));
    assertThat(admissions.get(0).path("admission")).isEqualTo(admissions.get(1).path("admission"));
    assertThat(actionCount(id)).isEqualTo(1);
    advance(id, admissions.get(0), "once");
    assertThat(ENV.navigations.get()).isEqualTo(1);
  }

  @Test
  void concurrentSameAndNewKeysHaveOneRealDispatch() throws Exception {
    String id = plannedSession(planNav());
    JsonNode ledger = admit(id, reserve(id, navigation(id)));
    ObjectNode request = advanceRequest(id, ledger);
    var results =
        race(
            () -> dispatch.dispatch(controller, id, 1, "same", request),
            () -> dispatch.dispatch(controller, id, 1, "same", request),
            () -> dispatch.dispatch(controller, id, 1, "other", request));
    assertThat(results).hasSize(3);
    assertThat(ENV.navigations.get()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE route='v2-consume'",
                Integer.class))
        .isEqualTo(2);
  }

  @Test
  void nestedRollbackAndLostWinnerNeverManufactureSendAuthority() throws Exception {
    String id = plannedSession(planNav());
    JsonNode ledger = admit(id, reserve(id, navigation(id)));
    ObjectNode request = advanceRequest(id, ledger);
    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> sessions.consume(controller, id, 1, "nested", request)))
        .hasMessage("RUNTIME_INCOMPATIBLE");
    assertThat(action(id).path("dispatchCount").asInt()).isZero();
    var results =
        race(
            () -> sessions.consume(controller, id, 1, "one", request),
            () -> sessions.consume(controller, id, 1, "two", request));
    assertThat(
            results.stream().filter(GuidedSessionService.WonConsumption.class::isInstance).count())
        .isEqualTo(1);
    assertThat(
            results.stream().filter(GuidedSessionService.AlreadyConsumed.class::isInstance).count())
        .isEqualTo(1);
    // Simulated controller death after commit/before send. Restart/status/cache has no permit.
    new GuidedDispatchService(sessions, materialization, runner)
        .dispatch(controller, id, 1, "after-restart", request);
    assertThat(ENV.navigations.get()).isZero();
    sessions.lostAcknowledgment(id);
    assertThat(action(id).path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> sessions.consume(controller, id, 1, "late", request))
        .hasMessage("UNKNOWN_OUTCOME");
  }

  @Test
  void actualDeferredCommitFailureSendsNothingAndRollsBackConsumption() throws Exception {
    String id = plannedSession(planNav());
    JsonNode ledger = admit(id, reserve(id, navigation(id)));
    ObjectNode request = advanceRequest(id, ledger);
    jdbc.execute(
        "CREATE FUNCTION bridge_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ "
            + "BEGIN RAISE EXCEPTION 'injected commit failure'; END $$");
    jdbc.execute(
        "CREATE CONSTRAINT TRIGGER bridge_fail_commit AFTER INSERT ON "
            + "studio_guided_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN "
            + "(NEW.route='v2-consume') EXECUTE FUNCTION bridge_fail_commit()");
    try {
      // The repository shares the JPA transaction manager (ruling N4, as in production), which
      // reports a failed commit as JpaSystemException; the base class used a JDBC manager.
      assertThatThrownBy(() -> dispatch.dispatch(controller, id, 1, "failed-commit", request))
          .isInstanceOf(org.springframework.orm.jpa.JpaSystemException.class)
          .hasMessageContaining("Unable to commit")
          .rootCause()
          .hasMessageContaining("injected commit failure");
      assertThat(ENV.navigations.get()).isZero();
      assertThat(action(id).path("dispatchCount").asInt()).isZero();
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_commands WHERE route='v2-consume'",
                  Integer.class))
          .isZero();
    } finally {
      jdbc.execute("DROP TRIGGER bridge_fail_commit ON studio_guided_commands");
      jdbc.execute("DROP FUNCTION bridge_fail_commit()");
    }
    dispatch.dispatch(controller, id, 1, "after-rollback", request);
    assertThat(ENV.navigations.get()).isEqualTo(1);
  }

  @Test
  void currentSourceLockWinsAgainstConcurrentConsumeAndCumulativeAllocationsCannotBeErased()
      throws Exception {
    String id = plannedSession(planDataflow());
    JsonNode ledger = admit(id, reserve(id, navigation(id)));
    ObjectNode request = advanceRequest(id, ledger);
    var locked = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var edit =
          executor.submit(
              () ->
                  repository.transaction(
                      () -> {
                        jdbc.queryForObject(
                            "SELECT source_revision FROM ui_tests WHERE id=? FOR UPDATE",
                            Long.class,
                            testId);
                        locked.countDown();
                        try {
                          release.await();
                        } catch (InterruptedException failure) {
                          Thread.currentThread().interrupt();
                          throw new IllegalStateException(failure);
                        }
                        jdbc.update(
                            "UPDATE ui_tests SET source_revision=source_revision+1 WHERE id=?",
                            testId);
                        return null;
                      }));
      assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
      var consume = executor.submit(() -> dispatch.dispatch(controller, id, 1, "blocked", request));
      Thread.sleep(100);
      assertThat(consume.isDone()).isFalse();
      release.countDown();
      edit.get(5, TimeUnit.SECONDS);
      assertThatThrownBy(() -> consume.get(5, TimeUnit.SECONDS))
          .hasCauseInstanceOf(GuidedSessionException.class);
    }
    assertThat(ENV.navigations.get()).isZero();
    assertThat(action(id).path("dispatchCount").asInt()).isZero();
    jdbc.update("UPDATE ui_tests SET source_revision=1 WHERE id=?", testId);
    jdbc.update(
        "UPDATE ui_tests SET configuration_revision=configuration_revision+1 WHERE id=?", testId);
    assertThatThrownBy(
            () -> dispatch.dispatch(controller, id, 1, "configuration-revision", request))
        .hasMessage("REVISION_CONFLICT");
    assertThat(ENV.navigations.get()).isZero();
    assertThat(action(id).path("dispatchCount").asInt()).isZero();
    jdbc.update("UPDATE ui_tests SET configuration_revision=1 WHERE id=?", testId);
    // A direct controller allocation call (precedent: planning IT, ReplayIT) is not obligation
    // authority; the planner already allocated this need at bootstrap.
    ObjectNode need =
        ENV.contracts.object().put("needId", "order").put("producerStepId", stepId(id));
    need.putArray("consumers")
        .add(ENV.contracts.object().put("stepId", stepId(id)).put("argumentSlot", "fill.value"));
    JsonNode allocation = sessions.allocateBinding(controller, id, 1, "allocate", need);
    assertThat(allocation.path("bindingId").asText()).isEqualTo(bindingId(id, "order"));
    ObjectNode more = need.deepCopy();
    ((com.fasterxml.jackson.databind.node.ArrayNode) more.path("consumers"))
        .add(
            ENV.contracts
                .object()
                .put("stepId", stepId(id))
                .put("argumentSlot", "assert.expected"));
    assertThat(sessions.allocateBinding(controller, id, 1, "append", more).path("bindingId"))
        .isEqualTo(allocation.path("bindingId"));
    assertThatThrownBy(() -> sessions.allocateBinding(controller, id, 1, "erase", need))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_guided_allocations SET "
                        + "document=jsonb_set(document,'{consumers}','[]'::jsonb) WHERE session_id=?",
                    id))
        .isInstanceOf(org.springframework.dao.DataAccessException.class);
    assertThat(
            sessions
                .runnerContext(controller, id, 1)
                .path("allocations")
                .get(0)
                .path("consumers")
                .size())
        .isEqualTo(2);
  }

  @Test
  void actualApplicationReplacementAfterPrepareNeverActsOnReplacement() throws Exception {
    String id = plannedSession(planNavLit());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            ENV.contracts
                .object()
                .put("kind", "authoredLiteral")
                .put("sourceInputId", inputId(id, 1)));
    JsonNode admitted = admit(id, reserve(id, fill));
    ENV.replaceTarget = true;

    long styleScope010BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePoll3 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(ENV.mutations.get() > 0) && System.nanoTime() < styleScope010BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope010BridgePoll = new BridgePoll3();
    if (!styleScope010BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgePlannedIT: DOM replacement receipt")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope010BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope010BridgePoll.initialAwaitTick) {
                    styleScope010BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope010BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope010BridgePoll.terminal) {
          styleScope010BridgePoll.step();
        }
      }
    }
    if (styleScope010BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope010BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(ENV.mutations.get() > 0).isTrue();

    advance(id, admitted, "stale-target");
    JsonNode result =
        ENV.contracts.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                admitted.path("admission").path("admissionId").asText()));
    assertThat(result.path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(result.path("state").asText()).isEqualTo("FAILED");
    assertThat(result.path("outcomeCode").asText()).isEqualTo("TARGET_CHANGED");
    assertThat(ENV.receipt.get()).isNull();
    assertThat(ENV.navigations.get()).isEqualTo(1);
  }

  @Test
  void producerReceiptAndOutcomeRollbackTogetherAfterRealReadAndNoReplay() throws Exception {
    String id = plannedSession(planDataflow());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode read = proposal(id, 1, "read", "source");
    read.withObject("/operation")
        .put("bindingId", bindingId(id, "order"))
        .set(
            "recipe",
            ENV.contracts
                .object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", "business-read"));
    JsonNode admission = admit(id, reserve(id, read));
    jdbc.execute(
        "CREATE FUNCTION bridge_fail_producer() RETURNS trigger LANGUAGE plpgsql AS $$ "
            + "BEGIN RAISE EXCEPTION 'injected producer failure'; END $$");
    jdbc.execute(
        "CREATE TRIGGER bridge_fail_producer AFTER INSERT ON studio_guided_producers FOR "
            + "EACH ROW EXECUTE FUNCTION bridge_fail_producer()");
    try {
      advance(id, admission, "read-with-lost-callback");
    } finally {
      jdbc.execute("DROP TRIGGER bridge_fail_producer ON studio_guided_producers");
      jdbc.execute("DROP FUNCTION bridge_fail_producer()");
    }

    long styleScope011BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePollProducerRollback {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(jdbc.queryForObject(
                      "SELECT state FROM studio_guided_sessions WHERE session_id=?",
                      String.class,
                      id)
                  .equals("UNKNOWN_OUTCOME"))
              && System.nanoTime() < styleScope011BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope011BridgePoll = new BridgePollProducerRollback();
    if (!styleScope011BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgePlannedIT: producer rollback unknown outcome")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope011BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope011BridgePoll.initialAwaitTick) {
                    styleScope011BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope011BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope011BridgePoll.terminal) {
          styleScope011BridgePoll.step();
        }
      }
    }
    if (styleScope011BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope011BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(
            jdbc.queryForObject(
                    "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id)
                .equals("UNKNOWN_OUTCOME"))
        .isTrue();

    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_producers WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
    JsonNode stored =
        ENV.contracts.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                admission.path("admission").path("admissionId").asText()));
    assertThat(stored.path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(
            () -> dispatch.dispatch(controller, id, 1, "retry", advanceRequest(id, admission)))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThat(ENV.navigations.get()).isEqualTo(1);
    assertThat(ENV.receipt.get()).isNull();
  }

  @Test
  void authorizedConfigurationReferenceIsAllocatedTransportedAndConsumedExactly() throws Exception {
    String id = plannedSession(planConfig());
    JsonNode input = input(id, 1);
    assertThat(input.path("provenance").path("referenceKind").asText()).isEqualTo("configuration");
    assertThat(input.path("value").asText()).isEqualTo(ENV.configInput);
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            ENV.contracts
                .object()
                .put("kind", "authoredLiteral")
                .put("sourceInputId", input.path("inputId").asText()));
    advance(id, admit(id, reserve(id, fill)), "configured-fill");

    long styleScope012BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePoll4 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(ENV.receipt.get() != null) && System.nanoTime() < styleScope012BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope012BridgePoll = new BridgePoll4();
    if (!styleScope012BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgePlannedIT: application fill receipt")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope012BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope012BridgePoll.initialAwaitTick) {
                    styleScope012BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope012BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope012BridgePoll.terminal) {
          styleScope012BridgePoll.step();
        }
      }
    }
    if (styleScope012BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope012BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(ENV.receipt.get() != null).isTrue();

    assertThat(ENV.receipt.get()).isEqualTo(ENV.configInput);
    assertThat(
            jdbc.queryForObject(
                "SELECT string_agg(document::text,'') FROM studio_guided_actions WHERE session_id=?",
                String.class,
                id))
        .doesNotContain(ENV.configInput);
  }

  @Test
  void lateOldAcknowledgementDoesNotDowngradeNewerConsumedAction() throws Exception {
    String id = plannedSession(planNavLit());
    JsonNode first = admit(id, reserve(id, navigation(id)));
    advance(id, first, "first");
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            ENV.contracts
                .object()
                .put("kind", "authoredLiteral")
                .put("sourceInputId", inputId(id, 1)));
    JsonNode second = admit(id, reserve(id, fill));
    sessions.consume(controller, id, 1, "second", advanceRequest(id, second));
    sessions.lostAcknowledgment(id, first.path("admission").path("admissionId").asText());
    assertThat(
            jdbc.queryForObject(
                "SELECT document->>'state' FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                second.path("admission").path("admissionId").asText()))
        .isEqualTo("DISPATCHING");
    assertThat(
            jdbc.queryForObject(
                "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id))
        .isEqualTo("ACTING");
    sessions.lostAcknowledgment(id, second.path("admission").path("admissionId").asText());
    assertThat(
            jdbc.queryForObject(
                "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id))
        .isEqualTo("UNKNOWN_OUTCOME");
  }

  @Test
  void realWorkerRenewsBeyondInitialLeaseWhilePausedAndPreservesCapturedValue() throws Exception {
    String id = plannedSession(planDataflow());
    Instant firstLease = Instant.parse(session(id).path("owner").path("leaseExpiresAt").asText());
    String hardExpiry = session(id).path("expiresAt").asText();
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    String binding = bindingId(id, "order");
    ObjectNode read = proposal(id, 1, "read", "source");
    read.withObject("/operation")
        .put("bindingId", binding)
        .set(
            "recipe",
            ENV.contracts
                .object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", "business-read"));
    advance(id, admit(id, reserve(id, read)), "read");
    // Trusted coordinator test setup ONLY (R-5 round trip); this does not implement005 question
    // semantics/UI.
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().put("state", "AWAITING_CLARIFICATION");
          repository.save(current);
          return null;
        });
    JsonNode originalProgress = progress(id);
    String producer =
        jdbc.queryForObject(
            "SELECT document::text FROM studio_guided_producers WHERE session_id=?",
            String.class,
            id);

    long styleScope013BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(35000);
    class BridgePoll5 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(Instant.now().isAfter(firstLease.plusMillis(500)))
              && System.nanoTime() < styleScope013BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope013BridgePoll = new BridgePoll5();
    if (!styleScope013BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgePlannedIT: first lease plus 500 ms")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope013BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope013BridgePoll.initialAwaitTick) {
                    styleScope013BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope013BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope013BridgePoll.terminal) {
          styleScope013BridgePoll.step();
        }
      }
    }
    if (styleScope013BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope013BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(Instant.now().isAfter(firstLease.plusMillis(500))).isTrue();

    assertThat(session(id).path("state").asText()).isEqualTo("AWAITING_CLARIFICATION");
    assertThat(session(id).path("owner").path("fence").asInt()).isEqualTo(1);
    assertThat(Instant.parse(session(id).path("owner").path("leaseExpiresAt").asText()))
        .isAfter(firstLease);
    assertThat(session(id).path("expiresAt").asText()).isEqualTo(hardExpiry);
    assertThat(progress(id)).isEqualTo(originalProgress);
    assertThat(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_producers WHERE session_id=?",
                String.class,
                id))
        .isEqualTo(producer);
    assertThat(claimCount(id)).isGreaterThanOrEqualTo(3);
    assertThat(ENV.navigations.get()).isEqualTo(1);
    // The planner's assignment key (GuidedTranslationService.plan), so the duplicate keeps meaning.
    JsonNode duplicate = dispatch.assign(controller, id, "translation-assignment", "worker-1");
    assertThat(duplicate.path("assignment")).isEqualTo(assignment(id));
    assertThat(Instant.parse(duplicate.path("leaseExpiresAt").asText())).isAfter(firstLease);
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().put("state", "PROPOSING");
          repository.save(current);
          return null;
        });
    ObjectNode fill = proposal(id, 2, "fill", "destination");
    fill.withObject("/operation")
        .set("value", ENV.contracts.object().put("kind", "binding").put("bindingId", binding));
    advance(id, admit(id, reserve(id, fill)), "fill-after-renewal");

    long styleScope014BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePoll6 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(ENV.receipt.get() != null) && System.nanoTime() < styleScope014BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope014BridgePoll = new BridgePoll6();
    if (!styleScope014BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgePlannedIT: application fill receipt")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope014BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope014BridgePoll.initialAwaitTick) {
                    styleScope014BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope014BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope014BridgePoll.terminal) {
          styleScope014BridgePoll.step();
        }
      }
    }
    if (styleScope014BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope014BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(ENV.receipt.get() != null).isTrue();

    assertThat(ENV.receipt.get()).isEqualTo(ENV.capture);
  }

  @Test
  void lateRenewalResponseAfterStopCannotReviveContextOrOwnership() throws Exception {
    String id = plannedSession(planNav());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode oldContext = sessions.runnerContext(controller, id, 1);
    ENV.holdNextClaim.set(true);
    assertThat(ENV.claimResponseCaptured.await(15, TimeUnit.SECONDS)).isTrue();
    sessions.cancel(
        user,
        id,
        "cancel-delayed-renewal",
        ENV.contracts.object().put("schemaVersion", 3).put("reason", "userRequested"));

    long styleScope015BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePoll7 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(progress(id).path("teardownStatus").asText().equals("CONFIRMED"))
              && System.nanoTime() < styleScope015BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope015BridgePoll = new BridgePoll7();
    if (!styleScope015BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgePlannedIT: teardown confirmed")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope015BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope015BridgePoll.initialAwaitTick) {
                    styleScope015BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope015BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope015BridgePoll.terminal) {
          styleScope015BridgePoll.step();
        }
      }
    }
    if (styleScope015BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope015BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(progress(id).path("teardownStatus").asText().equals("CONFIRMED")).isTrue();

    ENV.releaseClaimResponse.countDown();
    Thread.sleep(200);
    assertThatThrownBy(() -> runner.send("assign", assignment(id), "assignment"))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> runner.send("context", oldContext)).hasMessage("UNKNOWN_OUTCOME");
    assertThat(session(id).path("state").asText()).isEqualTo("CANCELLED");
    assertThat(ENV.navigations.get()).isEqualTo(1);
  }

  @Test
  void committedObservationRecoversLostHttpResponseWithoutAnotherCollection() throws Exception {
    String id = plannedSession(planNav());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode request = refreshRequest(id);
    int before = session(id).path("counters").path("observations").asInt();
    var proxy = com.sun.net.httpserver.HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    proxy.setHttpsConfigurator(
        new com.sun.net.httpserver.HttpsConfigurator(ENV.runnerSide) {
          @Override
          public void configure(com.sun.net.httpserver.HttpsParameters parameters) {
            var ssl = ENV.runnerSide.getDefaultSSLParameters();
            ssl.setNeedClientAuth(true);
            parameters.setSSLParameters(ssl);
          }
        });
    AtomicInteger requests = new AtomicInteger();
    proxy.createContext(
        "/",
        exchange -> {
          try {
            JsonNode body =
                ENV.contracts.parse(
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            runner.send("observe", body, exchange.getRequestHeaders().getFirst("Idempotency-Key"));
            requests.incrementAndGet();
            // Replace only the final runner response after the real callback already committed.
            exchange.sendResponseHeaders(503, -1);
          } catch (RuntimeException failure) {
            exchange.sendResponseHeaders(500, -1);
          } finally {
            exchange.close();
          }
        });
    proxy.start();
    try {
      var faultClient =
          new HttpRunnerDispatchClient(
              URI.create("https://localhost:" + proxy.getAddress().getPort()),
              ENV.tls,
              () -> token("backend-controller", "controller-1", "studio-guided-runner"),
              ENV.contracts);
      var faultDispatch = new GuidedDispatchService(sessions, materialization, faultClient);
      JsonNode result = faultDispatch.observe(controller, id, 1, "lost-refresh-response", request);
      assertThat(result.path("observation")).isEqualTo(progress(id).path("observation"));
      assertThat(faultDispatch.observe(controller, id, 1, "lost-refresh-response", request))
          .isEqualTo(result);
      assertThat(requests.get()).isEqualTo(1);
      assertThat(session(id).path("counters").path("observations").asInt()).isEqualTo(before + 1);
      assertThat(ENV.navigations.get()).isEqualTo(1);
    } finally {
      proxy.stop(0);
    }
  }

  @Test
  void refreshRefusesActiveAdmissionUnresolvedPauseStaleScopeBudgetAndCancellation()
      throws Exception {
    String id = plannedSession(planNavLit());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode request = refreshRequest(id);
    ObjectNode wrong = request.deepCopy().put("contextId", "foreign-context");
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "wrong-context", wrong))
        .hasMessage("STALE_FENCE");
    // R-5: the forced pause and the counter ceiling are round trips to the exact prior state.
    int observations = session(id).path("counters").path("observations").asInt();
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().put("state", "AWAITING_CLARIFICATION");
          repository.save(current);
          return null;
        });
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "paused-refresh", request))
        .hasMessage("STALE_GENERATION");
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().put("state", "PROPOSING");
          current
              .document()
              .withObject("/counters")
              .put(
                  "observations",
                  current.document().path("limits").path("maxObservations").asInt());
          repository.save(current);
          return null;
        });
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "over-budget", request))
        .hasMessage("BUDGET_EXCEEDED");
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().withObject("/counters").put("observations", observations);
          repository.save(current);
          return null;
        });
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            ENV.contracts
                .object()
                .put("kind", "authoredLiteral")
                .put("sourceInputId", inputId(id, 1)));
    admit(id, reserve(id, fill));
    // The refusal below is attributable to the active admission, not to a stale generation.
    assertThat(progress(id).path("generation").asInt())
        .isEqualTo(request.path("expectedGeneration").asInt());
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "active-admission", request))
        .hasMessage("STALE_GENERATION");
    sessions.cancel(
        user,
        id,
        "cancel",
        ENV.contracts.object().put("schemaVersion", 3).put("reason", "userRequested"));
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "after-cancel", request))
        .hasMessage("CANCELLED");
    assertThat(ENV.navigations.get()).isEqualTo(1);
    assertThat(ENV.fillReceipts.get()).isZero();
  }

  @Test
  void concurrentRefreshRetriesJoinOneCollectionAndOneCommittedGeneration() throws Exception {
    String id = plannedSession(planNav());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode request = refreshRequest(id);
    int observations = session(id).path("counters").path("observations").asInt();
    var results =
        race(
            () -> dispatch.observe(controller, id, 1, "same-refresh", request),
            () -> dispatch.observe(controller, id, 1, "same-refresh", request));
    assertThat(results.get(0)).isEqualTo(results.get(1));
    assertThat(session(id).path("counters").path("observations").asInt())
        .isEqualTo(observations + 1);
    assertThat(actionCount(id)).isEqualTo(1);
    assertThat(ENV.navigations.get()).isEqualTo(1);
  }

  @Test
  void cancelDuringRefreshRejectsLateCallbackWithoutBrowserMutation() throws Exception {
    String id = plannedSession(planNav());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode request = refreshRequest(id);
    int generation = progress(id).path("generation").asInt();
    ENV.holdNextRefresh.set(true);
    try (var executor = java.util.concurrent.Executors.newSingleThreadExecutor()) {
      var collecting =
          executor.submit(
              () -> {
                try {
                  dispatch.observe(controller, id, 1, "cancel-refresh", request);
                  return "unexpected-success";
                } catch (RuntimeException failure) {
                  return failure.getMessage();
                }
              });
      assertThat(ENV.refreshCallbackHeld.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(session(id).path("state").asText()).isEqualTo("OBSERVING");
      assertThatThrownBy(
              () -> dispatch.observe(controller, id, 1, "different-inflight-key", request))
          .hasMessage("STALE_GENERATION");
      sessions.cancel(
          user,
          id,
          "cancel-refresh",
          ENV.contracts.object().put("schemaVersion", 3).put("reason", "userRequested"));
      ENV.releaseRefreshCallback.countDown();
      assertThat(collecting.get(10, TimeUnit.SECONDS))
          .isIn("CANCELLED", "UNKNOWN_OUTCOME", "STALE_FENCE");
    }
    assertThat(session(id).path("state").asText()).isEqualTo("CANCELLED");
    assertThat(progress(id).path("generation").asInt()).isEqualTo(generation);
    assertThat(ENV.navigations.get()).isEqualTo(1);
    assertThat(ENV.fillReceipts.get()).isZero();
  }

  int actionCount(String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_actions WHERE session_id=?", Integer.class, id);
  }

  JsonNode action(String id) {
    return ENV.contracts.parse(
        jdbc.queryForObject(
            "SELECT document::text FROM studio_guided_actions WHERE session_id=? ORDER BY "
                + "ordinal LIMIT 1",
            String.class,
            id));
  }

  ObjectNode navigation(String id) {
    ObjectNode proposal = proposal(id, 0, "navigate", null);
    proposal.withObject("/operation").put("destinationInputId", inputId(id, 0));
    return proposal;
  }

  ObjectNode advanceRequest(String id, JsonNode ledger) {
    return ENV.contracts
        .object()
        .put("schemaVersion", 3)
        .put("sessionId", id)
        .put("ownerFence", 1)
        .put("admissionId", ledger.path("admission").path("admissionId").asText())
        .put("operationHash", ledger.path("operationHash").asText());
  }

  @SafeVarargs
  static <T> List<T> race(Callable<T>... calls) throws Exception {
    var start = new CountDownLatch(1);
    try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
      var futures = new ArrayList<Future<T>>();
      for (var call : calls) {
        futures.add(
            pool.submit(
                () -> {
                  start.await();
                  return call.call();
                }));
      }
      start.countDown();
      var results = new ArrayList<T>();
      for (var future : futures) {
        results.add(future.get(20, TimeUnit.SECONDS));
      }
      return results;
    }
  }

  JsonNode session(String id) {
    return ENV.contracts.parse(
        jdbc.queryForObject(
            "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  JsonNode assignment(String id) {
    return ENV.contracts.parse(
        jdbc.queryForObject(
            "SELECT intent::text FROM studio_guided_assignments WHERE session_id=?",
            String.class,
            id));
  }

  int claimCount(String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='claim'",
        Integer.class,
        id);
  }

  ObjectNode refreshRequest(String id) {
    ObjectNode request = materialization.identity(sessions.runnerContext(controller, id, 1));
    request.put("expectedGeneration", progress(id).path("generation").asInt());
    return request;
  }

  /** Production start: GuidedProductionSessionAccess initializes translation state in `start`. */
  String createSession() throws Exception {
    var connection =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(URI.create(ENV.origin + "/connect")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    assertThat(connection.statusCode()).isEqualTo(200);
    assertThat(connection.body()).isEqualTo("controlled-public-fixture-account");
    ObjectNode start =
        ENV.contracts
            .object()
            .put("schemaVersion", 3)
            .put("testId", testId.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", "fixture")
            .put("applicationId", "orders");
    start.set("versions", versions());
    return sessions.start(user, UUID.randomUUID().toString(), start).path("sessionId").asText();
  }

  /** GuidedPlanningIntegrationTest's planning command, verbatim. */
  ObjectNode command(String id) {
    return repository.transaction(
        () -> {
          var session = repository.lock(id);
          return ENV.contracts
              .object()
              .put("schemaVersion", 3)
              .put("sessionId", id)
              .put("expectedSourceRevision", "1")
              .put("expectedConfigurationRevision", "1")
              .put("expectedPlanRevision", store.state(id).path("planRevision").asInt());
        });
  }

  /**
   * aria-bridge-ruling01 N7: start through production access, then the real planner plans,
   * materializes, allocates and delivers the bootstrap context against the controlled provider.
   */
  String plannedSession(ObjectNode template) throws Exception {
    sourcePlan = template;
    String id = createSession();
    translation.plan(controller, id, 0, "plan-" + id, command(id));
    assertThat(progress(id).path("translationBootstrap").path("phase").asText()).isEqualTo("READY");
    assertThat(session(id).path("state").asText()).isEqualTo("PROPOSING");
    return id;
  }

  ObjectNode span(String kind, String slot, int start, int end) {
    return ENV.contracts
        .object()
        .put("referenceKind", "sourceSpan")
        .put("sourceRevision", "1")
        .put("stepId", step.toString())
        .put("startUtf16", start)
        .put("endUtf16", end)
        .put("kind", kind)
        .put("intendedSlot", slot);
  }

  /** The authored navigation destination. */
  ObjectNode destinationReference() {
    return span("destination", "navigate.destination", 6, 6 + (ENV.origin + "/start").length());
  }

  /** The authored literal {@code fixture-input}. */
  ObjectNode literalReference() {
    int start = sourceText().lastIndexOf("fixture-input");
    return span("nonsecretText", "fill.value", start, start + "fixture-input".length());
  }

  ObjectNode planTemplate(List<ObjectNode> references, List<ObjectNode> obligations) {
    ObjectNode plan = ENV.contracts.object();
    references.forEach(plan.putArray("sourceReferences")::add);
    obligations.forEach(plan.putArray("obligations")::add);
    plan.putArray("needs");
    return plan;
  }

  /** PLAN_NAV: refs [R0]; navigate(0, page, ref 0). */
  ObjectNode planNav() {
    return planTemplate(
        List.of(destinationReference()),
        List.of(obligation(step.toString(), 0, "navigate", "page", 0, null)));
  }

  /** PLAN_NAV_LIT: refs [R0, R1]; navigate(0, page, ref 0), fill(1, destination, ref 1). */
  ObjectNode planNavLit() {
    return planTemplate(
        List.of(destinationReference(), literalReference()),
        List.of(
            obligation(step.toString(), 0, "navigate", "page", 0, null),
            obligation(step.toString(), 1, "fill", "destination", 1, null)));
  }

  /**
   * PLAN_DATAFLOW: refs [R0]; navigate(0, page, ref 0), read(1, source, need order), fill(2,
   * destination, need order); need order produced and consumed by the one step.
   */
  ObjectNode planDataflow() {
    ObjectNode plan =
        planTemplate(
            List.of(destinationReference()),
            List.of(
                obligation(step.toString(), 0, "navigate", "page", 0, null),
                obligation(step.toString(), 1, "read", "source", null, "order"),
                obligation(step.toString(), 2, "fill", "destination", null, "order")));
    plan.withArray("needs")
        .addObject()
        .put("needId", "order")
        .put("producerStepId", step.toString())
        .putArray("consumers")
        .addObject()
        .put("stepId", step.toString())
        .put("argumentSlot", "fill.value");
    return plan;
  }

  /**
   * PLAN_CONFIG: refs [R0] plus the classified configuration reference the provider appends as
   * index 1; navigate(0, page, ref 0), fill(1, destination, ref 1).
   */
  ObjectNode planConfig() {
    ObjectNode plan =
        planTemplate(
            List.of(destinationReference()),
            List.of(
                obligation(step.toString(), 0, "navigate", "page", 0, null),
                obligation(step.toString(), 1, "fill", "destination", 1, null)));
    plan.put("useConfiguration", true);
    return plan;
  }

  String stepId(String id) {
    return session(id).path("sourceSteps").get(0).path("stepId").asText();
  }

  /** The planner's binding for a need, from the accepted plan (read only). */
  String bindingId(String id, String needId) {
    return repository.transaction(
        () -> {
          for (JsonNode need : store.state(id).path("plan").path("needs")) {
            if (need.path("needId").asText().equals(needId)) {
              return need.path("bindingId").asText();
            }
          }
          throw new IllegalStateException("NEED_MISSING");
        });
  }

  /**
   * The authored input whose provenance equals the accepted plan's source reference (the
   * validator's own equality, GuidedProposalValidator.action).
   */
  JsonNode input(String id, int referenceIndex) {
    JsonNode reference =
        repository.transaction(
            () ->
                store
                    .state(id)
                    .path("plan")
                    .path("sourceReferences")
                    .path(referenceIndex)
                    .deepCopy());
    JsonNode found = null;
    for (JsonNode candidate :
        sessions.runnerContext(controller, id, 1).path("authoredInputs").path("inputs")) {
      if (candidate.path("provenance").equals(reference)) {
        assertThat(found).as("one input per planned reference").isNull();
        found = candidate;
      }
    }
    assertThat(found).as("materialized input for planned reference %s", referenceIndex).isNotNull();
    return found;
  }

  String inputId(String id, int referenceIndex) {
    return input(id, referenceIndex).path("inputId").asText();
  }

  /**
   * aria-bridge-ruling01 N8: the planner issues the association. The hand-built proposal only
   * supplies the controlled model's selection ({target, operation} without document/generation and
   * the occurrence); the real advance builds, validates, guards and reserves the obligation, and
   * the spy stops the controller at prepareAndAdmit after that reservation committed (R-3).
   */
  JsonNode reserve(String id, JsonNode hand) throws Exception {
    for (ObjectNode prior : repository.transaction(() -> repository.actions(id))) {
      assertThat(prior.path("state").asText())
          .as("reserve only after prior actions settle")
          .isEqualTo("SUCCEEDED");
    }
    ObjectNode action = ENV.contracts.object();
    ObjectNode target = hand.path("target").deepCopy();
    target.remove(List.of("documentId", "generation"));
    action.set("target", target);
    action.set("operation", hand.path("operation").deepCopy());
    int occurrence = hand.path("coordinate").path("ordinal").asInt();
    nextSelection = new Selection(occurrence, action);
    var stopped = org.mockito.Mockito.spy(dispatch);
    org.mockito.Mockito.doThrow(new AssertionError("process-stop"))
        .when(stopped)
        .prepareAndAdmit(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq(id),
            org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any());
    var reserving =
        new GuidedTranslationService(
            sessions,
            repository,
            store,
            questions,
            stopped,
            gateway,
            ENV.contracts,
            new GuidedPromptAssembler(ENV.contracts),
            inputs,
            new GuidedProposalValidator(ENV.contracts),
            new GuidedDependencyPlanner(sessions),
            properties,
            Clock.systemUTC());
    reserving.installDatabase(jdbc);
    boolean reached = false;
    // Acquisition may answer WAIT before the NEXT_ACTION call; each retry is a new continuation.
    for (int n = 0; n < 3 && !reached; n++) {
      try {
        reserving.advance(controller, id, 1, "reserve-" + UUID.randomUUID(), command(id));
      } catch (AssertionError stop) {
        assertThat(stop).hasMessage("process-stop");
        reached = true;
      }
    }
    assertThat(reached).as("planner reached prepareAndAdmit").isTrue();
    JsonNode association =
        sessions.translationTransaction(
            controller,
            id,
            1,
            current -> {
              for (JsonNode obligation : store.state(id).path("plan").path("obligations")) {
                if (obligation.path("occurrence").asInt() == occurrence) {
                  return store.obligation(id, obligation.path("obligationId").asText());
                }
              }
              return null;
            });
    assertThat(association).as("planner-issued association").isNotNull();
    assertThat(association.path("admissionId").isNull()).isTrue();
    assertThat(association.path("admissionKey").asText()).startsWith("obligation-");
    return association;
  }

  /** The production internal admissions route with the planner-issued key and proposal bytes. */
  JsonNode admit(String id, JsonNode association) throws Exception {
    return post(
        id,
        "admissions",
        association.path("proposal"),
        association.path("admissionKey").asText(),
        token("backend-controller", "controller-1", "studio-guided-controller"),
        202);
  }

  ObjectNode proposal(String id, int ordinal, String kind, String testId) {
    JsonNode evidence = progress(id).path("executionEvidence");
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    ObjectNode p =
        ENV.contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("scopeHash", context.path("scopeHash").asText())
            .put("generation", evidence.path("generation").asInt())
            .put("evidenceHash", GuidedContracts.hash(evidence))
            .put("authoredInputsHash", context.path("authoredInputsHash").asText())
            .put("contextRevision", 1);
    p.set("executionEvidence", evidence);
    p.putObject("coordinate").put("stepId", stepId(id)).put("ordinal", ordinal);
    p.putObject("operation").put("kind", kind);
    ObjectNode target =
        p.putObject("target")
            .put("documentId", evidence.path("documentId").asText())
            .put("generation", evidence.path("generation").asInt());
    if (testId == null) {
      target.put("kind", "page");
    } else {
      JsonNode selected = null;
      for (JsonNode node : progress(id).path("observation").path("nodes")) {
        for (JsonNode hint : node.path("locatorHints")) {
          if (hint.path("kind").asText().equals("testId")
              && hint.path("value").asText().equals(testId)) {
            selected = node;
          }
        }
      }
      assertThat(selected).isNotNull();
      target.put("nodeId", selected.path("nodeId").asText());
      target.putObject("locator").put("kind", "testId").put("value", testId).put("exact", true);
    }
    return p;
  }

  JsonNode advance(String id, JsonNode ledger, String key) throws Exception {
    return post(
        id,
        "advance",
        ENV.contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("ownerFence", 1)
            .put("admissionId", ledger.path("admission").path("admissionId").asText())
            .put("operationHash", ledger.path("operationHash").asText()),
        key,
        token("backend-controller", "controller-1", "studio-guided-controller"),
        202);
  }

  JsonNode post(String id, String route, JsonNode body, String key, String token, int expected)
      throws Exception {
    var response =
        HttpClient.newBuilder()
            .sslContext(ENV.runnerSide)
            .build()
            .send(
                HttpRequest.newBuilder(
                        URI.create(
                            "https://localhost:"
                                + backendPort
                                + "/internal/v2/studio/guided-sessions/"
                                + id
                                + "/"
                                + route))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .header("Idempotency-Key", key)
                    .header("X-Owner-Fence", "1")
                    .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                    .timeout(Duration.ofSeconds(25))
                    .build(),
                HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as("%s: %s", route, response.body()).isEqualTo(expected);
    return ENV.contracts.parse(response.body());
  }

  JsonNode progress(String id) {
    return ENV.contracts.parse(
        jdbc.queryForObject(
            "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  static ObjectNode versions() {
    return (ObjectNode) ENV.contracts.parse("{\"contract\":3}");
  }

  static String operationHash(JsonNode proposal) {
    ObjectNode identity = ENV.contracts.object();
    identity.set("coordinate", proposal.path("coordinate"));
    identity.set("origin", proposal.path("executionEvidence").path("origin"));
    identity.set(
        "locator",
        proposal.path("target").has("locator")
            ? proposal.path("target").path("locator")
            : com.fasterxml.jackson.databind.node.NullNode.instance);
    identity.set("operation", proposal.path("operation"));
    return GuidedContracts.hash(identity);
  }

  static String token(String role, String subject, String audience) {
    return ENV.token(role, subject, audience);
  }
}
