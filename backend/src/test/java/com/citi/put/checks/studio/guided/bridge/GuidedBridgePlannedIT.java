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

  /** The code the scripted model answers the next STEP_CODE request with. */
  static volatile String nextCode;

  /** Set in {@code @BeforeEach} for the configuration-reference case only. */
  static volatile boolean configuredInput;

  static {
    try {
      ENV =
          new GuidedBridgeFixture(
              "guided-bridge-planned-",
              Path.of(
                  System.getProperty("java.io.tmpdir"),
                  "studio-obs015-bridge-planned-worker.json"));
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
      ENV.application.createContext(
          "/actions",
          exchange -> {
            byte[] page =
                ("<html><body><main aria-label='Operations'><label>Plan<select>"
                        + "<option>Alpha</option><option>Beta</option></select></label>"
                        + "<label>Destination<input oninput=\"fetch('/receipt',{method:'POST',"
                        + "body:this.value})\"></label><button onclick=\"fetch('/clicked',"
                        + "{method:'POST'})\">Go</button></main></body></html>")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, page.length);
            exchange.getResponseBody().write(page);
            exchange.close();
          });
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
      return new GuidedTranslationProperties(true, 131072, 2048, 60, "worker-1");
    }

    @Bean
    GuidedSourceSnapshotRepository snapshots(StudioRepository repository) {
      return new GuidedSourceSnapshotRepository(repository, ENV.contracts);
    }

    @Bean
    GuidedSourceClassifier classifier(GuidedTranslationProperties props) {
      return new GuidedSourceClassifier(
          ENV.contracts,
          new CredentialPatternScreen(),
          com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    }

    @Bean
    GuidedSourceInputResolver inputs() {
      return new GuidedSourceInputResolver(
          ENV.contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    }

    @Bean
    GuidedProductionSessionAccess access(
        GuidedSourceSnapshotRepository snapshots,
        GuidedSourceClassifier classifier,
        GuidedSourceInputResolver inputs,
        GuidedTranslationStore store) {
      return new GuidedProductionSessionAccess(
          snapshots,
          classifier,
          inputs,
          store,
          new CsiOwnershipEvaluator(),
          com.citi.put.checks.studio.support.TestDomains.FIXTURES,
          new com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver(
              new com.citi.put.checks.studio.secrets.FakeStudioVaultProvider(java.util.Map.of())));
    }

    @Bean
    GuidedMaterializationService materialization(JdbcTemplate jdbc) {
      return new GuidedMaterializationService(
          jdbc, ENV.contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
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
              com.citi.put.checks.studio.support.TestDomains.FIXTURES,
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
      com.citi.put.checks.studio.support.ObservedPublicationFixture.installCsiBudget(service, jdbc);
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
              new GuidedPromptAssembler(
                  ENV.contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES),
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
   * ADR-SC-008: SOURCE_PLAN is S-min, one open obligation per authored step (the configured step
   * carries the classifier's configuration reference); STEP_CODE answers with the code the test set
   * for the next step.
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
      var references = response.putArray("sourceReferences");
      var obligations = response.putArray("obligations");
      String[] intents = {"page", "Destination"};
      for (int i = 0; i < stepIds.size(); i++) {
        var obligation =
            obligations
                .addObject()
                .put("stepId", stepIds.get(i).toString())
                .put("occurrence", 0)
                .put("targetIntent", intents[i])
                .putNull("scopeIntent");
        JsonNode chosen = null;
        for (JsonNode reference : request.path("context").path("configurationReferences")) {
          if (reference.path("stepId").asText().equals(stepIds.get(i).toString())) {
            chosen = reference;
          }
        }
        if (chosen == null) {
          obligation.putNull("referenceIndex");
        } else {
          obligation.put("referenceIndex", references.size());
          ObjectNode reference = chosen.deepCopy();
          reference
              .put("referenceKind", "configuration")
              .put(
                  "configurationRevision",
                  request.path("context").path("configurationRevision").asText());
          if (!reference.path("kind").asText().equals("secretRef")) {
            reference.remove("referenceName");
          }
          references.add(reference);
        }
        obligation.putNull("needId");
        obligation.putArray("uses");
      }
      response.putArray("stepSections");
      return response;
    }
    if (!kind.equals("STEP_CODE")) {
      throw new IllegalStateException("UNEXPECTED_" + kind);
    }
    String code = nextCode;
    if (code == null) {
      throw new IllegalStateException("NO_CODE");
    }
    response.put("status", "CODE").put("code", code).putArray("captures");
    return response;
  }

  /**
   * The authored steps: open the page, then type into Destination (a saved value if configured).
   */
  static List<String> stepTexts() {
    return List.of(
        "Visit " + ENV.origin + "/start",
        configuredInput
            ? "Type <var config> into Destination"
            : "Type fixture-input into Destination");
  }

  /** A step the test runs by hand: its index in the authored list and the code the model writes. */
  record Hand(int stepIndex, String code) {}

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
  static volatile List<UUID> stepIds = List.of();

  @BeforeEach
  void startWorker(org.junit.jupiter.api.TestInfo testInfo) throws Exception {
    String testName = ENV.prepareScenario(testInfo);
    ENV.isolateDatabase(fixtureDataSource);
    // STUDIO-OBS-014 S3b: each test runs on a freshly migrated isolated database, so the class's
    // approved governed policy is seeded here; the bean-time seed only reached the base database.
    // aria-bridge-ruling01 N6: the real source of truth is one ui_tests row (planning IT shape).
    configuredInput =
        testName.equals("authorizedConfigurationReferenceIsAllocatedTransportedAndConsumedExactly");
    PROVIDER_KINDS.clear();
    nextCode = null;
    jdbc.update(
        "INSERT INTO users(id,sso_id,name,email,created_at) VALUES (?,'guided-fixture','Guided"
            + " Test','user-1',now()) ON CONFLICT DO NOTHING",
        UUID.randomUUID());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES"
            + " ('CSI-123','Guided fixture','Ops','HIGH','user-1','Production') ON CONFLICT DO"
            + " NOTHING");
    testId = UUID.randomUUID();
    stepIds = List.of(UUID.randomUUID(), UUID.randomUUID());
    var steps = new ArrayList<AuthoringStep>();
    for (int i = 0; i < stepIds.size(); i++) {
      steps.add(new AuthoringStep(stepIds.get(i), stepTexts().get(i), null));
    }
    var authoring = new AuthoringV2Request(2, null, steps);
    ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    jdbc.update(
        "INSERT INTO ui_tests(id, name, csi_id, environment, browser, steps, variables, authoring,"
            + " authoring_revision_inputs, created_by, created_at, updated_at) VALUES (?, 'Guided"
            + (" bridge','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?::jsonb,?::jsonb,'user"
                + "-1',now(),now())"),
        testId,
        mapper.writeValueAsString(stepTexts()),
        configuredInput
            ? "[{\"name\":\"config\",\"kind\":\"plain\",\"value\":\"" + ENV.configInput + "\"}]"
            : "[]",
        mapper.writeValueAsString(authoring),
        mapper.writeValueAsString(
            AuthoringRevisionIdentity.create(
                authoring, configuredInput ? Map.of("config", ENV.configInput) : Map.of())));
    ENV.resetWorkerState();
    Path journal = ENV.prepareWorkerJournal();
    // The worker is given no `rules`: the read profile is the runner's own constant. This record is
    // what the runner was configured with (no secret); the runner refuses any key it does not
    // enumerate.
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
    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "STEP_CODE");
  }

  @AfterAll
  static void close() {
    ENV.application.stop(0);
    PROVIDER.stop(0);
    ENV.database.stop();
  }

  @Test
  void concurrentPreparationsForSameAdmissionKeyUseOneImmutableAdmission() throws Exception {
    String id = plannedSession();
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
    String id = plannedSession();
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
    String id = plannedSession();
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
    String id = plannedSession();
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
  void currentSourceLockWinsAgainstConcurrentConsume() throws Exception {
    String id = plannedSession();
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
  }

  @Test
  void authorizedConfigurationReferenceIsAllocatedTransportedAndConsumedExactly() throws Exception {
    String id = plannedSession();
    JsonNode input = input(id);
    assertThat(input.path("provenance").path("referenceKind").asText()).isEqualTo("configuration");
    assertThat(input.path("value").asText()).isEqualTo(ENV.configInput);
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    Hand fill = fillStep(id);
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
    String id = plannedSession();
    JsonNode first = admit(id, reserve(id, navigation(id)));
    advance(id, first, "first");
    Hand fill = fillStep(id);
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
  void realWorkerRenewsBeyondInitialLeaseWhilePaused() throws Exception {
    String id = plannedSession();
    Instant firstLease = Instant.parse(session(id).path("owner").path("leaseExpiresAt").asText());
    String hardExpiry = session(id).path("expiresAt").asText();
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
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
    Hand fill = fillStep(id);
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

    assertThat(ENV.receipt.get()).isEqualTo("fixture-input");
  }

  @Test
  void lateRenewalResponseAfterStopCannotReviveContextOrOwnership() throws Exception {
    String id = plannedSession();
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
    String id = plannedSession();
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
    String id = plannedSession();
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
    Hand fill = fillStep(id);
    admit(id, reserve(id, fill));
    // Reserving the second step refreshed the observation once more; ask for the current
    // generation so the refusal below is attributable to the active admission, not to a stale one.
    ObjectNode current = refreshRequest(id);
    assertThat(progress(id).path("generation").asInt())
        .isEqualTo(current.path("expectedGeneration").asInt());
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "active-admission", current))
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
    String id = plannedSession();
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
    String id = plannedSession();
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
    // ADR-SC-007 D1: a refresh names the projection focus (step text and target intents) the
    // outline is keyed by.
    ObjectNode focus = request.putObject("focus");
    focus.put("stepText", "");
    focus.putArray("targetIntents");
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
            .put("environmentId", "fixture");
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
  String plannedSession() throws Exception {
    String id = createSession();
    translation.plan(controller, id, 0, "plan-" + id, command(id));
    assertThat(progress(id).path("translationBootstrap").path("phase").asText()).isEqualTo("READY");
    assertThat(session(id).path("state").asText()).isEqualTo("PROPOSING");
    return id;
  }

  /** The code of the first step: open the controlled page. */
  Hand navigation(String id) {
    return new Hand(0, "await page.goto('" + ENV.origin + "/start');");
  }

  /**
   * The code of the second step: type the authored literal (or the saved value) into Destination.
   */
  Hand fillStep(String id) {
    if (configuredInput) {
      String inputId = configuredInputId(id);
      return new Hand(1, "await page.getByLabel('Destination').fill(inputs['" + inputId + "']);");
    }
    return new Hand(1, "await page.getByLabel('Destination').fill('fixture-input');");
  }

  /** The saved-value input the planner materialized for the second step. */
  String configuredInputId(String id) {
    return input(id).path("inputId").asText();
  }

  JsonNode input(String id) {
    for (JsonNode candidate :
        sessions.runnerContext(controller, id, 1).path("authoredInputs").path("inputs")) {
      if (candidate.path("sourceStepId").asText().equals(stepIds.get(1).toString())) {
        return candidate;
      }
    }
    throw new IllegalStateException("INPUT_MISSING");
  }

  String stepId(String id) {
    return stepIds.get(0).toString();
  }

  /**
   * aria-bridge-ruling01 N8: the planner issues the association. The hand-built proposal only
   * supplies the controlled model's selection ({target, operation} without document/generation and
   * the occurrence); the real advance builds, validates, guards and reserves the obligation, and
   * the spy stops the controller at prepareAndAdmit after that reservation committed (R-3).
   */
  JsonNode reserve(String id, Hand hand) throws Exception {
    for (ObjectNode prior : repository.transaction(() -> repository.actions(id))) {
      assertThat(prior.path("state").asText())
          .as("reserve only after prior actions settle")
          .isEqualTo("SUCCEEDED");
    }
    nextCode = hand.code();
    var stopped = org.mockito.Mockito.spy(dispatch);
    org.mockito.Mockito.doThrow(new AssertionError("process-stop"))
        .when(stopped)
        .admitPrepared(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq(id),
            org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(),
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
            new GuidedPromptAssembler(
                ENV.contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES),
            inputs,
            new GuidedProposalValidator(ENV.contracts),
            new GuidedDependencyPlanner(sessions),
            properties,
            Clock.systemUTC());
    reserving.installDatabase(jdbc);
    boolean reached = false;
    // The first turn may refresh the observation; each call is a new continuation.
    for (int n = 0; n < 4 && !reached; n++) {
      try {
        reserving.advance(controller, id, 1, "reserve-" + UUID.randomUUID(), command(id));
      } catch (AssertionError stop) {
        assertThat(stop).hasMessage("process-stop");
        reached = true;
      }
    }
    assertThat(reached).as("planner reached admitPrepared").isTrue();
    String stepId = stepIds.get(hand.stepIndex()).toString();
    JsonNode association =
        sessions.translationTransaction(
            controller,
            id,
            1,
            current -> {
              for (JsonNode obligation : store.state(id).path("plan").path("obligations")) {
                if (obligation.path("stepId").asText().equals(stepId)) {
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

  static String token(String role, String subject, String audience) {
    return ENV.token(role, subject, audience);
  }
}
