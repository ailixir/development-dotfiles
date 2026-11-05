package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.evidence.LocalVideoObjectStore;
import com.citi.put.checks.studio.evidence.VideoObjectServer;
import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.evidence.GuidedRecordingKeys;
import com.citi.put.checks.studio.guided.evidence.GuidedRecordingProperties;
import com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceInternalController;
import com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceRepository;
import com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceService;
import com.citi.put.checks.studio.guided.evidence.GuidedSessionVideoController;
import com.citi.put.checks.studio.guided.evidence.RecordedGuidedEvidenceProjection;
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
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.SSLContext;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
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
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * STUDIO-OBS-009 AC-11 R1 d, the joined proof (W1.5 ruling part 2 §1.4, B-W3): a guided session
 * ends (the owner cancels it) or loses its browser while the owning worker's runner still holds the
 * previous context revision, and the session's recording still settles, plays and seeks to its
 * admitted steps.
 *
 * <p><b>What is real.</b> The real backend (PostgreSQL, the production session, materialization,
 * translation and evidence services behind the mutually authenticated internal chain), the real
 * {@code dist/main.js} runner spawned by {@link RunnerProcessHarness} over TLS, a real Chromium
 * that records the session, the runner's own recording upload into the filesystem store the backend
 * serves from, and the runner's own {@code recording-evidence} callback. The model is the
 * controlled provider of {@code GuidedBridgePlannedIT} (it only selects).
 *
 * <p><b>The hold seam (named here, as the story asks).</b> The session runs two admitted actions (a
 * navigation and a fill) on the real runner at context revision 1. The test then appends context
 * revision 2 through the V21 append path and issues its frozen context, so one delivery is {@code
 * PENDING}, and <em>never pushes it</em>: no code path of this test, and none of the application
 * (no coordinator or reaper is registered), sends that delivery to the runner. The runner therefore
 * holds v(n-1) for as long as the delivery stays pending, which is exactly the state KL-015-R1
 * describes. The database says so too: the head row is v2 and the delivery has no acknowledgement.
 *
 * <p><b>The two faults.</b> (1) The owner ends the session with the production {@code cancel}
 * command; the backend stops the runner's session, which closes its browser in order. The recording
 * is complete, and the runner settles it and reports its lifecycle fact under the only identity it
 * ever applied: revision 1. (2) The session's Chromium is killed with SIGKILL; the runner finds its
 * context lost and does the same, but a killed browser leaves no playable file, so its fact is
 * {@code UNAVAILABLE}. Before the R1 binding the recording-evidence route answered {@code 409
 * STALE_FENCE} to both, and the session kept neither a video nor the runner's account of why.
 *
 * <p><b>The proof</b> (fault 1). The V20 fact exists and is the report's own; the delivery is still
 * {@code PENDING} (recording evidence consumes nothing); the public result is {@code AVAILABLE}
 * with an offset for each dispatched action and one step item; the stored object is served whole
 * and by range through the same {@code VideoObjectServer} the public route uses; the bytes are the
 * ones the runner uploaded. Fault 2 proves the fact is recorded and the public result says {@code
 * UNAVAILABLE} rather than inventing a video.
 *
 * <p>The class is a trimmed copy of {@code GuidedFocusMutationJoinedIT}'s scaffolding (itself a
 * trimmed copy of {@code GuidedBridgePlannedIT}'s), keeping that class's rules: hand-crafted
 * proposals are probes only and the model only ever selects. It adds the evidence beans and the
 * filesystem store. Credit it only on the F-merge {@code dist} digest (AC-12 i): the digest of the
 * spawned {@code dist} is recorded in {@code studio-obs009-r1-joined-worker.json} under {@code
 * java.io.tmpdir}.
 */
@SpringBootTest(
    classes = GuidedEvidencePendingAppendJoinedIT.Application.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false",
      "spring.jpa.hibernate.ddl-auto=none"
    })
class GuidedEvidencePendingAppendJoinedIT {
  static final GuidedContracts CONTRACTS = new GuidedContracts();
  static final TestPostgresDatabase DATABASE = new TestPostgresDatabase();
  static final Path TEMP;
  static final Path OBJECTS;
  static final Path DIST;
  static final RunnerTestTls RUNNER_TLS;

  /** The backend's identity toward the runner: also the guided runner client's context. */
  static final SSLContext TLS;

  /** What the runner (a worker calling the backend, or a double standing in for it) presents. */
  static final SSLContext RUNNER_SIDE;

  static final KeyPair ISSUER;
  static final int RUNNER_PORT;
  static final HttpServer APPLICATION;
  static final String ORIGIN;
  static final AtomicReference<String> RECEIPT = new AtomicReference<>();

  // The controlled model provider. It only selects.
  static final HttpServer PROVIDER;
  static final List<String> PROVIDER_KINDS = new CopyOnWriteArrayList<>();

  /** The authored steps of the current test (set before the session is created). */
  static volatile List<UUID> stepIds = List.of();

  static {
    try {
      TEMP = Files.createTempDirectory("guided-evidence-pending-append-");
      OBJECTS = Files.createDirectories(TEMP.resolve("objects"));
      // STUDIO-OBS-009 AC-12 i: no private copy of dist. The harness spawns the real folded entry
      // point and the digest of what it spawned is recorded below.
      DIST = RunnerProcessHarness.defaultDistDirectory().toAbsolutePath().normalize();
      ObjectNode workerEvidence = CONTRACTS.object().put("snapshot", DIST.toString());
      workerEvidence.put("distDigest", RunnerProcessHarness.distDigestOf(DIST));
      ObjectNode hashes = workerEvidence.putObject("sha256");
      for (String relative :
          List.of(
              "main.js",
              "run/browser.js",
              "guided/runtime.js",
              "guided/transport.js",
              "guided/evidence.js",
              "guided/schemas.json")) {
        hashes.put(
            relative,
            HexFormat.of()
                .formatHex(
                    MessageDigest.getInstance("SHA-256")
                        .digest(Files.readAllBytes(DIST.resolve(relative)))));
      }
      Files.writeString(
          Path.of(System.getProperty("java.io.tmpdir"), "studio-obs009-r1-joined-worker.json"),
          workerEvidence.toString());
      // One test CA (lane D3.0): the runner and the backend certificates chain to it, the runner
      // pins the backend certificate, and the backend trusts only the CA.
      RUNNER_TLS = RunnerTestTls.shared();
      TLS = RUNNER_TLS.backendTls().sslContext();
      RUNNER_SIDE =
          RUNNER_TLS.serverContext(
              Identity.RUNNER, RUNNER_TLS.trustStore(), RUNNER_TLS.trustStorePasswordFile());
      var generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      ISSUER = generator.generateKeyPair();
      Files.writeString(
          TEMP.resolve("issuer.pub"),
          "-----BEGIN PUBLIC KEY-----\n"
              + Base64.getMimeEncoder(64, new byte[] {10})
                  .encodeToString(ISSUER.getPublic().getEncoded())
              + "\n-----END PUBLIC KEY-----\n");
      // AC-12 h: an exclusive bind on both loopback families, outside the database range.
      RUNNER_PORT = RunnerProcessHarness.exclusivelyFreePort();
      APPLICATION = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      ORIGIN = "http://localhost:" + APPLICATION.getAddress().getPort();
      APPLICATION.createContext(
          "/start",
          exchange -> {
            String html =
                "<html><body><main aria-label='Operations'><output aria-label='Order number' "
                    + "data-testid='source'>order-1</output></main><input aria-label='Destination'"
                    + " data-testid='destination' "
                    + "oninput=\"fetch('/receipt',{method:'POST',body:this.value})\"></body></html>";
            byte[] body = html.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
          });
      APPLICATION.createContext(
          "/receipt",
          exchange -> {
            RECEIPT.set(
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          });
      PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      PROVIDER.createContext(
          "/",
          exchange -> {
            try {
              JsonNode wire =
                  CONTRACTS.parse(
                      new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
              JsonNode request =
                  CONTRACTS.parse(
                      wire.path("contents").get(0).path("parts").get(0).path("text").asText());
              ObjectNode envelope = CONTRACTS.object();
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
      APPLICATION.start();
      DATABASE.start();
      Flyway.configure()
          .dataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword())
          .locations("classpath:db/migration")
          .load()
          .migrate();
    } catch (Exception failure) {
      throw new ExceptionInInitializerError(failure);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    RunnerProcessHarness.backendServerSslProperties(RUNNER_TLS)
        .forEach((name, value) -> registry.add(name, () -> value));
    registry.add(
        "studio.guided-authoring.service-public-key",
        () -> Base64.getEncoder().encodeToString(ISSUER.getPublic().getEncoded()));
    registry.add("studio.guided-authoring.service-issuer", () -> "fixture-issuer");
    registry.add("studio.guided-authoring.mtls-required", () -> true);
  }

  /**
   * The bridge's internal routes plus the recording-evidence route (and no coordinator or reaper,
   * so nothing can push the pending delivery or advance a reservation behind the test).
   */
  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration(exclude = FlywayAutoConfiguration.class)
  @EntityScan("com.citi.put.checks")
  @EnableJpaRepositories("com.citi.put.checks.studio")
  @Import({
    GuidedInternalController.class,
    GuidedSessionEvidenceInternalController.class,
    GuidedInternalSecurity.class,
    GuidedWireBodyAdvice.class
  })
  static class Application {
    @Bean
    DataSource dataSource() {
      return new DriverManagerDataSource(
          DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
    }

    @Bean
    GuidedContracts contracts() {
      return CONTRACTS;
    }

    /** JDBC and JPA (StudioRepository.findByIdForUpdate) share one transaction. */
    @Bean
    GuidedSessionRepository repository(JdbcTemplate jdbc, PlatformTransactionManager manager) {
      return new GuidedSessionRepository(jdbc, new TransactionTemplate(manager), CONTRACTS);
    }

    @Bean
    GuidedTranslationStore translationStore(JdbcTemplate jdbc) {
      return new GuidedTranslationStore(jdbc, CONTRACTS);
    }

    @Bean
    GuidedClarificationContextStore questions(JdbcTemplate jdbc) {
      return new GuidedClarificationContextStore(jdbc, CONTRACTS);
    }

    @Bean
    GuidedTranslationProperties properties() {
      return new GuidedTranslationProperties(true, 131072, 2048, 60, "worker-1");
    }

    @Bean
    GuidedSourceSnapshotRepository snapshots(StudioRepository repository) {
      return new GuidedSourceSnapshotRepository(repository, CONTRACTS);
    }

    @Bean
    GuidedSourceClassifier classifier(GuidedTranslationProperties props) {
      return new GuidedSourceClassifier(
          CONTRACTS,
          new CredentialPatternScreen(),
          com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    }

    @Bean
    GuidedSourceInputResolver inputs() {
      return new GuidedSourceInputResolver(
          CONTRACTS, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
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
          jdbc, CONTRACTS, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    }

    @Bean
    GuidedSessionEvidenceRepository evidenceRepository(JdbcTemplate jdbc) {
      return new GuidedSessionEvidenceRepository(jdbc);
    }

    /** The R1 route: the production service over the production derivation. */
    @Bean
    GuidedSessionEvidenceService evidenceService(
        GuidedSessionRepository repository,
        GuidedSessionEvidenceRepository evidence,
        GuidedMaterializationService materialization) {
      return new GuidedSessionEvidenceService(
          repository,
          evidence,
          materialization,
          CONTRACTS,
          new GuidedRecordingProperties(null),
          new StudioExecutionProperties(
              null,
              null,
              null,
              null,
              null,
              null,
              Duration.ofDays(30),
              null,
              null,
              null,
              null,
              null));
    }

    @Bean
    RecordedGuidedEvidenceProjection projection(GuidedSessionEvidenceRepository evidence) {
      // servesRecordings is true: the store below is the one the runner uploads into.
      return new RecordedGuidedEvidenceProjection(
          evidence, new GuidedRecordingProperties(null), true, CONTRACTS);
    }

    @Bean
    GuidedSessionService sessions(
        GuidedSessionRepository repository,
        GuidedProductionSessionAccess access,
        JdbcTemplate jdbc,
        GuidedMaterializationService materialization,
        GuidedTranslationStore store,
        GuidedClarificationContextStore questions,
        RecordedGuidedEvidenceProjection projection) {
      var service =
          new GuidedSessionService(
              repository,
              CONTRACTS,
              access,
              new GuidedSessionProperties(true, Map.of()),
              com.citi.put.checks.studio.support.TestDomains.FIXTURES,
              Clock.systemUTC());
      service.installBridge(
          materialization,
          new GuidedPreparationStore(jdbc, CONTRACTS),
          new GuidedBindingStore(jdbc, CONTRACTS, materialization),
          new GuidedAssignmentStore(jdbc, CONTRACTS));
      service.installTranslation(store, questions);
      service.installEvidence(projection);
      service.installPresentation(new GuidedPublicPresentationProjector(jdbc, CONTRACTS));
      ObservedPublicationFixture.installCsiBudget(service, jdbc);
      return service;
    }

    @Bean
    HttpRunnerDispatchClient runner() {
      return new HttpRunnerDispatchClient(
          URI.create("https://127.0.0.1:" + RUNNER_PORT),
          TLS,
          () -> token("backend-controller", "controller-1", "studio-guided-runner"),
          CONTRACTS);
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
      return new GenAiGuidedLlmGatewayClient(transport, new GuidedResponseParser(CONTRACTS));
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
              CONTRACTS,
              new GuidedPromptAssembler(
                  CONTRACTS, com.citi.put.checks.studio.support.TestDomains.FIXTURES),
              inputs,
              new GuidedProposalValidator(CONTRACTS),
              new GuidedDependencyPlanner(sessions),
              properties,
              Clock.systemUTC());
      service.installDatabase(jdbc);
      return service;
    }
  }

  /**
   * ADR-SC-008: SOURCE_PLAN is S-min (one open obligation per authored step); STEP_CODE answers
   * with the Playwright code of the requested step: open the page, then fill Destination from the
   * step's saved value.
   */
  static ObjectNode providerResponse(JsonNode request) {
    String kind = request.path("kind").asText();
    PROVIDER_KINDS.add(kind);
    ObjectNode response =
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("kind", kind)
            .put("requestId", request.path("requestId").asText());
    if (kind.equals("SOURCE_PLAN")) {
      var references = response.putArray("sourceReferences");
      var obligations = response.putArray("obligations");
      String[] intents = {"page", "Destination", "Done"};
      for (int i = 0; i < stepIds.size(); i++) {
        var obligation =
            obligations
                .addObject()
                .put("stepId", stepIds.get(i).toString())
                .put("occurrence", 0)
                .put("targetIntent", intents[i])
                .putNull("scopeIntent");
        // The classifier's configuration reference for the step's <var>, as the planner returns it.
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
    JsonNode chosen = request.path("context").path("obligations").path(0);
    String step = chosen.path("stepId").asText();
    String code;
    if (stepIds.get(0).toString().equals(step)) {
      code = "await page.goto('" + ORIGIN + "/start');";
    } else {
      String inputId = null;
      for (JsonNode input : request.path("context").path("inputs")) {
        if (input.path("sourceStepId").asText().equals(step)) {
          inputId = input.path("inputId").asText();
        }
      }
      if (inputId == null) {
        throw new IllegalStateException("INPUT_MISSING:" + step);
      }
      code = "await page.getByLabel('Destination').fill(inputs['" + inputId + "']);";
    }
    response.put("status", "CODE").put("code", code).putArray("captures");
    return response;
  }

  /** Open the page, fill Destination from the saved value, and a third step that never runs. */
  static List<String> stepTexts() {
    return List.of(
        "Open " + ORIGIN + "/start",
        "Fill Destination with <var DESTINATION>",
        "Check the page is shown");
  }

  @LocalServerPort int backendPort;
  @Autowired GuidedSessionService sessions;
  @Autowired GuidedSessionRepository repository;
  @Autowired GuidedMaterializationService materialization;
  @Autowired GuidedDispatchService dispatch;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource fixtureDataSource;
  @Autowired GuidedTranslationStore store;
  @Autowired GuidedClarificationContextStore questions;
  @Autowired GuidedTranslationService translation;
  @Autowired GuidedLlmGatewayClient gateway;
  @Autowired GuidedSourceInputResolver inputs;
  @Autowired GuidedTranslationProperties properties;
  @Autowired RecordedGuidedEvidenceProjection projection;
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

  @BeforeEach
  void startWorker() throws Exception {
    // Each test runs on a freshly migrated isolated database.
    String isolatedDatabase = "evidence_" + UUID.randomUUID().toString().replace("-", "");
    var admin =
        new DriverManagerDataSource(
            DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
    new JdbcTemplate(admin).execute("CREATE DATABASE " + isolatedDatabase);
    ((DriverManagerDataSource) fixtureDataSource)
        .setUrl(DATABASE.getJdbcUrl().replace(DATABASE.getDatabaseName(), isolatedDatabase));
    Flyway.configure()
        .dataSource(fixtureDataSource)
        .locations("classpath:db/migration")
        .load()
        .migrate();
    PROVIDER_KINDS.clear();
    RECEIPT.set(null);
    jdbc.update(
        "INSERT INTO users(id,sso_id,name,email,created_at) VALUES (?,'guided-fixture','Guided"
            + " Test','user-1',now()) ON CONFLICT DO NOTHING",
        UUID.randomUUID());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES"
            + " ('CSI-123','Guided fixture','Ops','HIGH','user-1','Production') ON CONFLICT DO"
            + " NOTHING");
    testId = UUID.randomUUID();
    stepIds = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
    var steps = new java.util.ArrayList<AuthoringStep>();
    for (int i = 0; i < stepIds.size(); i++) {
      steps.add(new AuthoringStep(stepIds.get(i), stepTexts().get(i), null));
    }
    var authoring = new AuthoringV2Request(2, null, steps);
    ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    jdbc.update(
        "INSERT INTO ui_tests(id, name, csi_id, environment, browser, steps, variables, authoring,"
            + " authoring_revision_inputs, created_by, created_at, updated_at) VALUES (?, 'Guided"
            + " evidence','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?::jsonb,?::jsonb,'user"
            + "-1',now(),now())",
        testId,
        mapper.writeValueAsString(stepTexts()),
        "[{\"name\":\"DESTINATION\",\"kind\":\"plain\",\"value\":\"fixture-input\"}]",
        mapper.writeValueAsString(authoring),
        mapper.writeValueAsString(
            AuthoringRevisionIdentity.create(authoring, Map.of("DESTINATION", "fixture-input"))));
    Files.writeString(
        TEMP.resolve("worker.jwt"), token("owning-worker", "worker-1", "studio-guided-controller"));
    Path journal = Files.createTempDirectory(TEMP, "journal-");
    // The folded entry point over TLS, spawned and reaped by the harness, recording into the
    // filesystem store this class serves from.
    workerHarness =
        RunnerProcessHarness.builder(RUNNER_TLS)
            .port(RUNNER_PORT)
            .workDirectory(Files.createTempDirectory(TEMP, "runner-"))
            .callbackBaseUrl("https://localhost:" + backendPort)
            .env(RunnerProcessHarness.KEY_OBJECT_STORE_DIR, OBJECTS.toString())
            .guided(
                new RunnerProcessHarness.Guided(
                    "worker-1",
                    journal,
                    "fixture-issuer",
                    "controller-1",
                    TEMP.resolve("issuer.pub"),
                    "https://localhost:" + backendPort,
                    TEMP.resolve("worker.jwt")))
            .start();
    workerHarness.awaitReady(Duration.ofSeconds(60));
  }

  @AfterEach
  void closeWorker() throws Exception {
    var harness = workerHarness;
    workerHarness = null;
    if (harness != null) {
      // AC-11 k / I-T1: stop the runner and everything it left; a clean exit (exit 0, no force
      // within the guided grace) and no survivor are asserted.
      var report = harness.teardown();
      report.assertNoSurvivors();
      report.assertCleanExit();
    }
    // The controlled model only ever plans and selects.
    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "STEP_CODE");
  }

  @AfterAll
  static void close() {
    APPLICATION.stop(0);
    PROVIDER.stop(0);
    DATABASE.stop();
  }

  // ---- the joined proof ----

  /**
   * The owner ends the session (a user cancel, which the backend relays to the runner as a stop)
   * while the runner holds v(n-1). The runner closes its browser in order, so the recording is
   * complete; it settles under v(n-1), the route accepts it, and it plays and seeks.
   */
  @Test
  void aSessionEndedWhileAnAppendIsPendingKeepsARecordingThatSettlesPlaysAndSeeks()
      throws Exception {
    String id = pendingAppendSession();

    // The end: the production cancel command. The backend stops the runner's session; the runner
    // settles the recording under the only identity it ever applied.
    sessions.cancel(
        user,
        id,
        UUID.randomUUID().toString(),
        CONTRACTS.object().put("schemaVersion", 3).put("reason", "userRequested"));
    awaitRecording(id);
    System.out.println("R1D-SESSION-STATE " + sessionState(id));

    // The V20 fact is the runner's own report, accepted at v(n-1).
    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT recording_id,state,partial,worker_id,owner_fence,video_key,manifest_key,"
                + "timings::text AS timings FROM studio_guided_session_recordings"
                + " WHERE session_id=?",
            id);
    System.out.println("R1D-ROW " + row);
    assertThat(row.get("state")).as("the recording is available").isEqualTo("AVAILABLE");
    assertThat(row.get("partial")).as("the browser was closed in order").isEqualTo(false);
    assertThat(sessionState(id)).isEqualTo("CANCELLED");
    assertThat(row.get("worker_id")).isEqualTo("worker-1");
    assertThat(row.get("owner_fence")).isEqualTo(1);
    assertThat(pendingDeliveries(id))
        .as("recording evidence consumes nothing: the delivery is still PENDING")
        .isEqualTo(1);

    // The public result: AVAILABLE, with an offset for each dispatched action and one step item.
    JsonNode result = sessions.read(user, id, "result");
    CONTRACTS.validate("v3/result", result);
    JsonNode video = result.path("evidence").path("video");
    System.out.println("R1D-RESULT-VIDEO " + video);
    assertThat(video.path("status").asText()).as(video.toString()).isEqualTo("AVAILABLE");
    assertTimings(id, result.path("actionTimings"), row);

    // Plays: the stored object is served whole and by range through the public route's server.
    String csi = "CSI-123";
    var keys = GuidedRecordingKeys.derive(csi, id).orElseThrow();
    Path stored = OBJECTS.resolve(keys.videoKey()).normalize();
    assertThat(stored.startsWith(OBJECTS)).isTrue();
    byte[] bytes = Files.readAllBytes(stored);
    System.out.println("R1D-VIDEO bytes=" + bytes.length + " key=" + keys.videoKey());
    assertThat(bytes.length)
        .as("a real recording, larger than the 1 KiB range read")
        .isGreaterThan(1024);
    assertThat(HexFormat.of().formatHex(bytes, 0, 4)).as("WebM/EBML magic").isEqualTo("1a45dfa3");
    var videos =
        new GuidedSessionVideoController(
            new GuidedSessionController(sessions),
            projection,
            new GuidedSessionEvidenceRepository(jdbc),
            new VideoObjectServer(new LocalVideoObjectStore(OBJECTS)));
    ResponseEntity<byte[]> whole =
        videos.getGuidedSessionVideo(id, false, null, user, new MockHttpServletRequest());
    assertThat(whole.getStatusCode().value()).isEqualTo(200);
    assertThat(whole.getBody()).isEqualTo(bytes);
    // Seeks: ranges inside the object, at the start and from the middle to the end.
    ResponseEntity<byte[]> head =
        videos.getGuidedSessionVideo(id, false, "bytes=0-1023", user, new MockHttpServletRequest());
    assertThat(head.getStatusCode().value()).isEqualTo(206);
    assertThat(head.getHeaders().getFirst("Content-Range"))
        .isEqualTo("bytes 0-1023/" + bytes.length);
    assertThat(head.getBody()).isEqualTo(java.util.Arrays.copyOfRange(bytes, 0, 1024));
    int middle = bytes.length / 2;
    ResponseEntity<byte[]> tail =
        videos.getGuidedSessionVideo(
            id, false, "bytes=" + middle + "-", user, new MockHttpServletRequest());
    assertThat(tail.getStatusCode().value()).isEqualTo(206);
    assertThat(tail.getHeaders().getFirst("Content-Range"))
        .isEqualTo("bytes " + middle + "-" + (bytes.length - 1) + "/" + bytes.length);
    assertThat(tail.getBody()).isEqualTo(java.util.Arrays.copyOfRange(bytes, middle, bytes.length));
  }

  /**
   * The browser is killed while the runner holds v(n-1). A killed browser leaves no playable
   * recording, so the runner's fact is {@code UNAVAILABLE} and the session shows no video, and it
   * says so truthfully. Before the R1 binding the route refused even that fact, and the session
   * kept neither a video nor the runner's account of why.
   */
  @Test
  void aSessionLosingItsBrowserWhileAnAppendIsPendingStillRecordsTheRunnersOwnFact()
      throws Exception {
    String id = pendingAppendSession();

    killTheSessionsBrowser();
    awaitRecording(id);
    System.out.println("R1D-LOSS-SESSION-STATE " + sessionState(id));

    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT recording_id,state,partial,worker_id,owner_fence,timings::text AS timings"
                + " FROM studio_guided_session_recordings WHERE session_id=?",
            id);
    System.out.println("R1D-LOSS-ROW " + row);
    assertThat(row.get("state"))
        .as("no playable file: the runner says UNAVAILABLE")
        .isEqualTo("UNAVAILABLE");
    assertThat(row.get("partial")).isEqualTo(false);
    assertThat(row.get("timings")).isEqualTo("[]");
    assertThat(row.get("worker_id")).isEqualTo("worker-1");
    assertThat(row.get("owner_fence")).isEqualTo(1);
    assertThat(pendingDeliveries(id))
        .as("recording evidence consumes nothing: the delivery is still PENDING")
        .isEqualTo(1);
    JsonNode result = sessions.read(user, id, "result");
    CONTRACTS.validate("v3/result", result);
    assertThat(result.path("evidence").path("video").path("status").asText())
        .as(result.path("evidence").path("video").toString())
        .isEqualTo("UNAVAILABLE");
  }

  /**
   * A learn run on the real runner at context revision 1 (a navigation and a fill, both dispatched
   * and succeeded on a real browser), then the hold seam: v2 is appended and issued, and never
   * pushed to the runner.
   */
  String pendingAppendSession() throws Exception {
    String id = createSession();
    translation.plan(controller, id, 0, "plan-" + id, command(id));
    assertThat(progress(id).path("translationBootstrap").path("phase").asText()).isEqualTo("READY");
    for (int turn = 0; turn < 40 && progress(id).path("stepIndex").asInt() < 2; turn++) {
      translation.advance(controller, id, 1, "advance-" + UUID.randomUUID(), command(id));
    }
    assertThat(progress(id).path("stepIndex").asInt()).as("two learned steps").isEqualTo(2);
    assertThat(
            jdbc.queryForList(
                "SELECT document->>'state' FROM studio_guided_actions WHERE session_id=? ORDER BY"
                    + " ordinal",
                String.class,
                id))
        .containsExactly("SUCCEEDED", "SUCCEEDED");
    assertThat(RECEIPT.get())
        .as("the real browser wrote the authored value")
        .isEqualTo("fixture-input");

    ObjectNode issued = appendPendingDelivery(id);
    assertThat(issued.path("contextRevision").asInt()).isEqualTo(2);
    assertThat(pendingDeliveries(id)).as("one delivery nobody acknowledged").isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT context_revision FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id))
        .as("the head row is v2 while the runner holds v1")
        .isEqualTo(2);
    assertThat(recordingRows(id)).as("nothing recorded yet").isZero();
    return id;
  }

  /**
   * Every dispatched action has exactly one reading, the readings are inside the session and in R2
   * order, and the one step item starts where its first action starts: the offsets the player seeks
   * to.
   */
  void assertTimings(String id, JsonNode timings, Map<String, Object> row) {
    assertThat(GuidedContracts.canonical(CONTRACTS.parse(String.valueOf(row.get("timings")))))
        .as("V20 timings are served verbatim")
        .isEqualTo(GuidedContracts.canonical(timings));
    long maxMs =
        jdbc.queryForObject(
            "SELECT (document->'limits'->>'maxSessionSeconds')::bigint * 1000"
                + " FROM studio_guided_sessions WHERE session_id=?",
            Long.class,
            id);
    var dispatched = new HashMap<String, String>();
    for (var action :
        jdbc.queryForList(
            "SELECT admission_id, step_id FROM studio_guided_actions a WHERE session_id=?"
                + " AND (document->>'dispatchCount')::integer = 1",
            id)) {
      dispatched.put(
          String.valueOf(action.get("admission_id")), String.valueOf(action.get("step_id")));
    }
    assertThat(dispatched).as("the learn run dispatched its two actions").hasSize(2);
    var actionItems = new HashMap<String, JsonNode>();
    var stepItems = new HashMap<String, JsonNode>();
    long previousStart = -1;
    for (JsonNode item : timings) {
      long start = item.path("startMs").asLong();
      assertThat(
              item.path("startMs").isIntegralNumber() && start >= previousStart && start <= maxMs)
          .as("startMs bounded and ordered: %s", item)
          .isTrue();
      previousStart = start;
      if (!item.path("endMs").isNull()) {
        assertThat(item.path("endMs").asLong()).isBetween(start, maxMs);
      }
      if (item.path("kind").asText().equals("action")) {
        assertThat(actionItems.put(item.path("admissionId").asText(), item))
            .as("one reading per admission")
            .isNull();
        assertThat(item.path("stepId").asText())
            .isEqualTo(dispatched.get(item.path("admissionId").asText()));
      } else {
        assertThat(item.path("kind").asText()).isEqualTo("step");
        assertThat(stepItems.put(item.path("stepId").asText(), item)).isNull();
      }
    }
    assertThat(actionItems.keySet()).containsExactlyInAnyOrderElementsOf(dispatched.keySet());
    assertThat(stepItems.keySet())
        .containsExactlyInAnyOrderElementsOf(java.util.Set.copyOf(dispatched.values()));
    for (var stepItem : stepItems.entrySet()) {
      long first =
          actionItems.values().stream()
              .filter(item -> item.path("stepId").asText().equals(stepItem.getKey()))
              .mapToLong(item -> item.path("startMs").asLong())
              .min()
              .orElseThrow();
      assertThat(stepItem.getValue().path("startMs").asLong()).isEqualTo(first);
    }
  }

  // ---- the fault ----

  /** SIGKILL for each guided browser process of this runner's tree, each re-checked first. */
  void killTheSessionsBrowser() {
    var browsers = workerHarness.survivingGuidedBrowsers();
    assertThat(browsers).as("the session has a live browser").isNotEmpty();
    for (var fact : browsers) {
      ProcessHandle.of(fact.pid())
          .filter(
              handle ->
                  handle.info().startInstant().isPresent()
                      && handle.info().startInstant().get().equals(fact.startedAt()))
          .ifPresent(ProcessHandle::destroyForcibly);
    }
  }

  /** Waits for the V20 fact; the failure names what the runner did (its log is value-free). */
  void awaitRecording(String id) throws Exception {
    long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(90_000);

    class ItsPollEvidencerecording {
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

          if (!(recordingRows(id) != 1 && System.nanoTime() < end)) {
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
    var styleScope088ItsPoll = new ItsPollEvidencerecording();
    if (!styleScope088ItsPoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("IT-S Evidence-recording")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(java.time.Duration.ZERO)
            .pollInterval(java.time.Duration.ofMillis(50))
            .atMost(java.time.Duration.ofNanos(Math.max(1L, end - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope088ItsPoll.initialAwaitTick) {
                    styleScope088ItsPoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope088ItsPoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException itsTimeout) {
        // Preserve the original last guard/observation and its assertion/error mapping.
        if (!styleScope088ItsPoll.terminal) {
          styleScope088ItsPoll.step();
        }
      }
    }
    if (styleScope088ItsPoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope088ItsPoll.failure instanceof Error error) {
      throw error;
    }

    assertThat(recordingRows(id))
        .as(
            "no recording fact: session state="
                + sessionState(id)
                + ", pending deliveries="
                + pendingDeliveries(id)
                + ", runner log tail="
                + tail(workerHarness.logFile()))
        .isEqualTo(1);
  }

  static String tail(Path file) {
    try {
      String text = Files.readString(file);
      return text.substring(Math.max(0, text.length() - 1500));
    } catch (java.io.IOException unreadable) {
      return "(unreadable)";
    }
  }

  String sessionState(String id) {
    return jdbc.queryForObject(
        "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id);
  }

  int recordingRows(String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_session_recordings WHERE session_id=?",
        Integer.class,
        id);
  }

  int pendingDeliveries(String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_materialization_deliveries"
            + " WHERE session_id=? AND status='PENDING'",
        Integer.class,
        id);
  }

  /**
   * Appends v2 through the V21 append path (continuation MATERIALIZE, then one appended input) and
   * issues its frozen context, leaving one PENDING delivery that no runner acknowledged. The
   * appended input is a copy with a fresh inputId, as in {@code GuidedEvidencePendingAppendIT}.
   */
  ObjectNode appendPendingDelivery(String id) {
    repository.transaction(
        () -> {
          store.continuation(id, "MATERIALIZE");
          return null;
        });
    String appended = UUID.randomUUID().toString();
    assertThat(
            jdbc.update(
                "UPDATE studio_guided_materializations m SET context_revision=m.context_revision+1,"
                    + "materialization_revision=m.materialization_revision+1,"
                    + "authored_inputs=x.inputs,authored_inputs_hash=studio_publication_hash(x.inputs)"
                    + " FROM (SELECT jsonb_set(authored_inputs,'{inputs}',(authored_inputs->'inputs')"
                    + "||jsonb_build_array(jsonb_set(authored_inputs->'inputs'->0,'{inputId}',"
                    + "to_jsonb(?::text)))) AS inputs FROM studio_guided_materializations"
                    + " WHERE session_id=?) x WHERE m.session_id=?",
                appended,
                id,
                id))
        .isEqualTo(1);
    return materialization.identity(sessions.runnerContext(controller, id, 1));
  }

  // ---- the learn run (adapted from GuidedFocusMutationJoinedIT) ----

  String createSession() {
    ObjectNode start =
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("testId", testId.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", "fixture");
    start.set("versions", CONTRACTS.parse("{\"contract\":3}"));
    return sessions.start(user, UUID.randomUUID().toString(), start).path("sessionId").asText();
  }

  ObjectNode command(String id) {
    return repository.transaction(
        () -> {
          repository.lock(id);
          return CONTRACTS
              .object()
              .put("schemaVersion", 3)
              .put("sessionId", id)
              .put("expectedSourceRevision", "1")
              .put("expectedConfigurationRevision", "1")
              .put("expectedPlanRevision", store.state(id).path("planRevision").asInt());
        });
  }

  JsonNode session(String id) {
    return CONTRACTS.parse(
        jdbc.queryForObject(
            "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  JsonNode progress(String id) {
    return CONTRACTS.parse(
        jdbc.queryForObject(
            "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  static String token(String role, String subject, String audience) {
    try {
      long now = Instant.now().getEpochSecond();
      String header =
          Base64.getUrlEncoder()
              .withoutPadding()
              .encodeToString(
                  "{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
      String claims =
          CONTRACTS
              .object()
              .put("iss", "fixture-issuer")
              .put("sub", subject)
              .put("aud", audience)
              .put("role", role)
              .put("iat", now)
              .put("exp", now + 300)
              .toString();
      String signed =
          header
              + "."
              + Base64.getUrlEncoder()
                  .withoutPadding()
                  .encodeToString(claims.getBytes(StandardCharsets.UTF_8));
      Signature signature = Signature.getInstance("SHA256withRSA");
      signature.initSign(ISSUER.getPrivate());
      signature.update(signed.getBytes(StandardCharsets.US_ASCII));
      return signed
          + "."
          + Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign());
    } catch (Exception failure) {
      throw new IllegalStateException(failure);
    }
  }

  static void await(java.util.function.BooleanSupplier condition, long timeout) throws Exception {
    long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeout);

    class ItsPollGuidedEvidencePendingAppendJoinedITcondition {
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

          if (!(!condition.getAsBoolean() && System.nanoTime() < end)) {
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
    var styleScope089ItsPoll = new ItsPollGuidedEvidencePendingAppendJoinedITcondition();
    if (!styleScope089ItsPoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("IT-S GuidedEvidencePendingAppendJoinedIT-condition")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(java.time.Duration.ZERO)
            .pollInterval(java.time.Duration.ofMillis(25))
            .atMost(java.time.Duration.ofNanos(Math.max(1L, end - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope089ItsPoll.initialAwaitTick) {
                    styleScope089ItsPoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope089ItsPoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException itsTimeout) {
        // Preserve the original last guard/observation and its assertion/error mapping.
        if (!styleScope089ItsPoll.terminal) {
          styleScope089ItsPoll.step();
        }
      }
    }
    if (styleScope089ItsPoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope089ItsPoll.failure instanceof Error error) {
      throw error;
    }

    assertThat(condition.getAsBoolean()).isTrue();
  }
}
