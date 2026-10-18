package com.citi.put.checks.studio.guided.session;

import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationStore;
import com.citi.put.checks.studio.secrets.SecretAuditLifecycle;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsExchange;
import com.sun.net.httpserver.HttpsParameters;
import com.sun.net.httpserver.HttpsServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestContext;
import org.springframework.test.context.TestExecutionListener;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Actual services, PostgreSQL and authenticated relay; fixture outcomes are not browser effects.
 */
@TestExecutionListeners(
    listeners = GuidedServiceTransportFaultIT.OwnedCacheListener.class,
    mergeMode = TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(
    classes = GuidedServiceTransportFaultIT.Application.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false"
    })
class GuidedServiceTransportFaultIT {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String ORIGIN = "https://orders.example.test";
  private static final String EMAIL = "service-fault@example.test";
  private static final String ISSUER_NAME = "service-fault-issuer";
  private static final PostgreSQLContainer<?> DATABASE =
      new PostgreSQLContainer<>("postgres:15-alpine");
  private static final Map<UUID, Scenario> BY_TEST = new ConcurrentHashMap<>();
  private static final Map<String, Scenario> BY_SESSION = new ConcurrentHashMap<>();
  private static final ExecutorService PEERS = Executors.newVirtualThreadPerTaskExecutor();
  private static final Path TEMP;
  private static final SSLContext TLS;
  private static final KeyPair ISSUER;
  private static final HttpsServer RELAY;
  private static final JsonNode DOCUMENTS;
  // The one source step must be the shared v3 secretReference fixture's step.
  private static final String STEP_ID;
  private static volatile int backendPort;
  private static volatile JdbcTemplate actualJdbc;
  private static volatile ConfigurableApplicationContext ownedContext;
  private static volatile TestContext ownedTestContext;
  private static final List<SourceStopOwner> STOP_OWNERS =
      new java.util.concurrent.CopyOnWriteArrayList<>();

  static {
    try {
      TEMP = Files.createTempDirectory("guided-service-fault-");
      DOCUMENTS =
          C.parse(
                  Files.readString(
                      Path.of(
                          "../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
              .path("documents");
      STEP_ID = DOCUMENTS.path("secretReference").path("stepId").asText();
      var keys = KeyPairGenerator.getInstance("RSA");
      keys.initialize(2048);
      ISSUER = keys.generateKeyPair();
      TLS = certificate();
      DATABASE.start();
      var source =
          new DriverManagerDataSource(
              DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
      // STUDIO-OBS-014 S3: governance (V19) and recordings (V20) are part of every start; head.
      Flyway.configure().dataSource(source).target("22").load().migrate();
      actualJdbc = new JdbcTemplate(source);
      actualJdbc.update(
          "INSERT INTO users(sso_id,name,email) VALUES ('service-user','fixture',?)", EMAIL);
      actualJdbc.update(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) "
              + "VALUES ('CSI-123','fixture','unit','LOW',?,'Development')",
          EMAIL);
      RELAY = HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
      RELAY.setHttpsConfigurator(
          new HttpsConfigurator(TLS) {
            @Override
            public void configure(HttpsParameters parameters) {
              var ssl = TLS.getDefaultSSLParameters();
              ssl.setNeedClientAuth(true);
              parameters.setSSLParameters(ssl);
            }
          });
      RELAY.setExecutor(PEERS);
      RELAY.createContext(
          "/internal/v2/studio/guided-sessions/", GuidedServiceTransportFaultIT::relay);
      RELAY.start();
    } catch (Exception failure) {
      DATABASE.stop();
      throw new ExceptionInInitializerError(failure);
    }
  }

  enum Mode {
    COMPLETE_200_NO_CALLBACK,
    COMPLETE_200_OWNER_OK,
    COMPLETE_200_OWNER_FAILED,
    COMPLETE_503_NO_CALLBACK,
    COMPLETE_503_OWNER_OK,
    PARTIAL_200_NO_EOF,
    PARTIAL_503_NO_EOF,
    CALLER_EXPIRY_AFTER_CONSUME,
    INTERRUPT_AFTER_HEADERS;

    boolean ownerOk() {
      return this == COMPLETE_200_OWNER_OK || this == COMPLETE_503_OWNER_OK;
    }

    boolean callback() {
      return ownerOk() || this == COMPLETE_200_OWNER_FAILED;
    }

    boolean partial() {
      return this == PARTIAL_200_NO_EOF
          || this == PARTIAL_503_NO_EOF
          || this == CALLER_EXPIRY_AFTER_CONSUME
          || this == INTERRUPT_AFTER_HEADERS;
    }

    int status() {
      return this == COMPLETE_503_NO_CALLBACK
              || this == COMPLETE_503_OWNER_OK
              || this == PARTIAL_503_NO_EOF
          ? 503
          : 200;
    }
  }

  private static final class Scenario {
    final UUID testId = UUID.randomUUID();
    final Mode mode;
    final String canary = "scoped-service-wire-" + UUID.randomUUID();
    final AtomicInteger reads = new AtomicInteger(),
        names = new AtomicInteger(),
        posts = new AtomicInteger();
    final AtomicInteger callbacks = new AtomicInteger();
    final AtomicBoolean certified = new AtomicBoolean(), interrupted = new AtomicBoolean();
    final AtomicReference<byte[]> request = new AtomicReference<>();
    final AtomicReference<char[]> chars = new AtomicReference<>();
    final AtomicReference<Throwable> failure = new AtomicReference<>(),
        peerFailure = new AtomicReference<>();
    final CountDownLatch headers = new CountDownLatch(1), disconnected = new CountDownLatch(1);
    final AtomicInteger stops = new AtomicInteger();
    volatile int stopStatus = 200;
    volatile OperationGate stopGate;
    volatile boolean heldRowSetupCase;
    final AtomicBoolean assignmentTerminated = new AtomicBoolean();
    String sessionId;
    JsonNode source;
    JsonNode configuration;

    Scenario(Mode mode) {
      this.mode = mode;
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry properties) {
    properties.add("server.ssl.enabled", () -> true);
    properties.add("server.ssl.key-store", () -> TEMP.resolve("fixture.p12").toString());
    properties.add("server.ssl.key-store-password", () -> "fixture");
    properties.add("server.ssl.key-store-type", () -> "PKCS12");
    properties.add("server.ssl.trust-store", () -> TEMP.resolve("trust.p12").toString());
    properties.add("server.ssl.trust-store-password", () -> "fixture");
    properties.add("server.ssl.trust-store-type", () -> "PKCS12");
    properties.add("server.ssl.client-auth", () -> "need");
    properties.add(
        "studio.guided-authoring.service-public-key",
        () -> Base64.getEncoder().encodeToString(ISSUER.getPublic().getEncoded()));
    properties.add("studio.guided-authoring.service-issuer", () -> ISSUER_NAME);
    properties.add("studio.guided-authoring.mtls-required", () -> true);
  }

  /** Capture the actual framework cache identity, without constructing a second test manager. */
  public static final class OwnedCacheListener implements TestExecutionListener, Ordered {
    private TestContext capturedTestContext;
    private ConfigurableApplicationContext capturedApplicationContext;

    @Override
    public int getOrder() {
      // afterTestClass runs in reverse: Zonky 3800, this owner 3500, DirtiesContext 3000.
      return 3500;
    }

    @Override
    public void prepareTestInstance(TestContext testContext) {
      assertThat(testContext.getTestClass()).isSameAs(GuidedServiceTransportFaultIT.class);
      var instance = (GuidedServiceTransportFaultIT) testContext.getTestInstance();
      assertThat(testContext.getApplicationContext()).isSameAs(instance.context);
      ownedTestContext = testContext;
      capturedTestContext = testContext;
      capturedApplicationContext = instance.context;
    }

    @Override
    public void afterTestClass(TestContext testContext) throws Exception {
      try {
        assertThat(testContext.getTestClass()).isSameAs(GuidedServiceTransportFaultIT.class);
        assertThat(testContext).isSameAs(capturedTestContext);
        assertThat(ownedTestContext).isSameAs(capturedTestContext);
        assertThat(ownedContext).isSameAs(capturedApplicationContext);
        assertThat(testContext.getApplicationContext()).isSameAs(capturedApplicationContext);
        close();
      } finally {
        capturedTestContext = null;
        capturedApplicationContext = null;
        ownedTestContext = null;
        ownedContext = null;
      }
    }
  }

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration(
      exclude = {DataSourceAutoConfiguration.class, FlywayAutoConfiguration.class})
  @Import({
    GuidedInternalController.class,
    GuidedInternalSecurity.class,
    GuidedWireBodyAdvice.class
  })
  static class Application {
    @Bean
    org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler taskScheduler() {
      var scheduler = new org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler();
      scheduler.setThreadNamePrefix("guided-service-fault-owned-");
      scheduler.setWaitForTasksToCompleteOnShutdown(false);
      scheduler.setAwaitTerminationSeconds(5);
      return scheduler;
    }

    @Bean
    DataSource dataSource() {
      return actualJdbc.getDataSource();
    }

    @Bean
    JdbcTemplate jdbc() {
      return actualJdbc;
    }

    @Bean
    GuidedContracts contracts() {
      return C;
    }

    @Bean
    GuidedSessionRepository repository(JdbcTemplate jdbc) {
      return new GuidedSessionRepository(
          jdbc, new TrackingTransactionTemplate(jdbc.getDataSource()), C);
    }

    @Bean
    GuidedMaterializationService materialization(JdbcTemplate jdbc) {
      return new GuidedMaterializationService(jdbc, C);
    }

    @Bean
    FixtureAccess access(JdbcTemplate jdbc) {
      return new FixtureAccess(jdbc);
    }

    @Bean
    GuidedSessionService sessions(
        GuidedSessionRepository repository,
        GuidedMaterializationService materialization,
        FixtureAccess access) {
      return service(repository, materialization, access, 600);
    }
  }

  @Autowired ConfigurableApplicationContext context;
  @Autowired GuidedSessionRepository repository;
  @Autowired GuidedMaterializationService materialization;
  @Autowired FixtureAccess access;
  @LocalServerPort int port;
  private final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");
  private final Authentication user =
      new BffAuthenticationToken(
          new UserIdentity(
              "user-1",
              EMAIL,
              "Fixture",
              "Actor",
              List.of(),
              List.of(new CsiOwnershipEntry("CSI-123", "owner"))));

  @BeforeEach
  void backendReady() {
    backendPort = port;
    ownedContext = context;
  }

  private static GuidedSessionService service(
      GuidedSessionRepository repository,
      GuidedMaterializationService materialization,
      FixtureAccess access,
      int seconds) {
    return service(actualJdbc, repository, materialization, access, seconds);
  }

  private static GuidedSessionService service(
      JdbcTemplate jdbc,
      GuidedSessionRepository repository,
      GuidedMaterializationService materialization,
      FixtureAccess access,
      int seconds) {
    return service(jdbc, repository, materialization, access, seconds, Clock.systemUTC());
  }

  private static GuidedSessionService service(
      JdbcTemplate jdbc,
      GuidedSessionRepository repository,
      GuidedMaterializationService materialization,
      FixtureAccess access,
      int seconds,
      Clock clock) {
    var service =
        new GuidedSessionService(
            repository,
            C,
            access,
            new GuidedSessionProperties(true, Map.of("maxSessionSeconds", seconds)),
            clock);
    service.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, C),
        new GuidedBindingStore(jdbc, C, materialization),
        new GuidedAssignmentStore(jdbc, C));
    service.installSecretAudit(new SecretAuditLifecycle(jdbc, new SecretUseAuditRecorder(jdbc)));
    // STUDIO-OBS-014 S3: every start needs an approved governed policy for its scope.
    com.citi.put.checks.studio.support.ObservedPublicationFixture.installGovernance(
        service, jdbc, "CSI-123", "orders", "fixture", java.util.List.of(ORIGIN), null);
    return service;
  }

  @ParameterizedTest
  @EnumSource(Mode.class)
  void actualServicesJoinOneConsumedSecretReadAndPostWithAuthenticatedRecovery(Mode mode)
      throws Exception {
    var scenario = new Scenario(mode);
    BY_TEST.put(scenario.testId, scenario);
    var steps = C.object().putArray("steps");
    steps.addObject().put("stepId", STEP_ID).put("text", "Enter <secret PASS> as password.");
    var variables = C.object().putArray("variables");
    variables.addObject().put("name", "PASS").put("kind", "secretRef");
    scenario.source = steps;
    scenario.configuration = variables;
    actualJdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by) "
            + "VALUES (?,'fault fixture','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?)",
        scenario.testId,
        steps.toString(),
        variables.toString(),
        EMAIL);
    var sessions =
        service(
            repository,
            materialization,
            access,
            mode == Mode.CALLER_EXPIRY_AFTER_CONSUME ? 3 : 600);
    var client = client();
    var dispatch = new GuidedDispatchService(sessions, materialization, client);
    dispatch.installReferences(
        new VaultStudioReferenceResolver(
            new CountedProvider(),
            (principal, csi, environment, secret) ->
                principal.equals("user-1")
                    && csi.equals("CSI-123")
                    && environment.equals("fixture")
                    && secret.equals("PASS")));
    sessions.installStopSender(dispatch::stop);
    var observer =
        GuidedRunnerClient.class.getDeclaredMethod(
            "observeRequestBytes", java.util.function.Consumer.class);
    observer.setAccessible(true);
    observer.invoke(
        client,
        (java.util.function.Consumer<byte[]>)
            bytes -> {
              if (scenario.reads.get() == 1 && scenario.posts.get() == 0) {
                scenario.request.set(bytes);
              }
            });
    String id =
        sessions
            .start(
                user,
                UUID.randomUUID().toString(),
                C.object()
                    .put("schemaVersion", 3)
                    .put("testId", scenario.testId.toString())
                    .put("sourceRevision", "source-1")
                    .put("configurationRevision", "config-1")
                    .put("environmentId", "fixture")
                    .put("applicationId", "orders")
                    .set("versions", DOCUMENTS.path("versions")))
            .path("sessionId")
            .asText();
    scenario.sessionId = id;
    BY_SESSION.put(id, scenario);
    repository.transaction(
        () -> {
          var session = repository.lock(id).document();
          var manifest =
              C.object()
                  .put("testId", scenario.testId.toString())
                  .put("sourceRevision", "source-1")
                  .put("configurationRevision", "config-1")
                  .put("policy", "INPUT-POLICY-01-A");
          manifest.set("sourceSteps", steps);
          manifest
              .putArray("configurationReferences")
              .addObject()
              .put("referenceId", "ref-PASS")
              .put("referenceName", "PASS")
              .put("kind", "secretRef")
              .put("stepId", STEP_ID)
              .put("intendedSlot", "fill.value");
          new GuidedTranslationStore(actualJdbc, C).initialize(session, manifest);
          return null;
        });
    dispatch.assign(controller, id, "assign", "worker-1");
    var references = C.object().putArray("references");
    references.add(DOCUMENTS.path("secretReference"));
    sessions.materialize(controller, id, 1, "materialize", references);
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    ObjectNode observation = DOCUMENTS.path("observation").path("observation").deepCopy();
    observation
        .put("sessionId", id)
        .put("scopeHash", context.path("scopeHash").asText())
        .put("observedAt", Instant.now().toString());
    observation.withObject("/coverage").put("passwordControls", 1);
    var envelope = identity(context);
    envelope.set("observation", observation);
    callback(id, "observations", envelope);
    ObjectNode evidence =
        C.object()
            .put("kind", "observedDocument")
            .put("sessionId", id)
            .put("contextId", context.path("contextId").asText())
            .put("documentId", "document-1")
            .put("generation", 1)
            .put("origin", ORIGIN)
            .put("observationHash", GuidedContracts.hash(observation));
    ObjectNode proposal = DOCUMENTS.path("secretAction").deepCopy();
    proposal
        .put("sessionId", id)
        .put("scopeHash", context.path("scopeHash").asText())
        .put("generation", 1)
        .put("evidenceHash", GuidedContracts.hash(evidence))
        .put("authoredInputsHash", context.path("authoredInputsHash").asText());
    proposal.set("executionEvidence", evidence);
    proposal.withObject("/target").put("documentId", "document-1").put("generation", 1);
    proposal
        .withObject("/operation/value")
        .put(
            "sourceInputId",
            context.path("authoredInputs").path("inputs").get(0).path("inputId").asText());
    JsonNode admission = dispatch.prepareAndAdmit(controller, id, 1, "admit", proposal);
    assertThat(admission.path("dispatchCount").asInt()).isZero();
    assertThat(scenario.reads.get()).isZero();
    assertThat(scenario.names.get()).isGreaterThan(0);
    assertThat(scenario.posts.get()).isZero();
    ObjectNode advance =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("ownerFence", 1)
            .put("admissionId", admission.path("admission").path("admissionId").asText())
            .put("operationHash", admission.path("operationHash").asText());
    long start = System.nanoTime();
    var caller =
        Thread.ofVirtual()
            .start(
                () -> {
                  try {
                    dispatch.dispatch(controller, id, 1, "consume", advance);
                  } catch (Throwable failure) {
                    scenario.failure.set(failure);
                  } finally {
                    scenario.interrupted.set(Thread.currentThread().isInterrupted());
                  }
                });
    try {
      if (mode == Mode.INTERRUPT_AFTER_HEADERS) {
        assertThat(scenario.headers.await(4, TimeUnit.SECONDS)).isTrue();
        caller.interrupt();
      }
      caller.join(mode.partial() && mode != Mode.INTERRUPT_AFTER_HEADERS ? 18000 : 5000);
      assertThat(caller.isAlive()).as("actual service call cannot wait for peer EOF").isFalse();
      assertThat(scenario.peerFailure.get()).isNull();
      assertThat(scenario.reads.get()).isEqualTo(1);
      assertThat(scenario.posts.get()).isEqualTo(1);
      assertThat(scenario.certified.get()).isTrue();
      assertThat(scenario.callbacks.get()).isEqualTo(mode.callback() ? 1 : 0);
      assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_commands "
                      + "WHERE namespace=? AND route='v2-consume'",
                  Integer.class,
                  id))
          .isEqualTo(1);
      assertThat(zero(scenario.chars.get()))
          .as("actual provider/SecretValue buffer erased")
          .isTrue();
      assertThat(zero(scenario.request.get()))
          .as("actual owned dispatch request bytes erased")
          .isTrue();
      if (mode.partial()) {
        assertThat(scenario.disconnected.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(Duration.ofNanos(System.nanoTime() - start).toMillis()).isLessThan(17500);
      }
      if (mode == Mode.INTERRUPT_AFTER_HEADERS) {
        assertThat(scenario.interrupted.get()).isTrue();
      }
      if (mode == Mode.CALLER_EXPIRY_AFTER_CONSUME) {
        assertThat(Duration.ofNanos(System.nanoTime() - start).toMillis()).isLessThan(5500);
      }
      if (mode.status() == 503 || mode.partial()) {
        assertThat(scenario.failure.get())
            .isInstanceOf(GuidedSessionException.class)
            .hasMessage("UNKNOWN_OUTCOME");
      } else {
        assertThat(scenario.failure.get()).isNull();
      }
      String expectedState =
          mode.ownerOk()
              ? "SUCCEEDED"
              : mode == Mode.COMPLETE_200_OWNER_FAILED ? "FAILED" : "UNKNOWN_OUTCOME";
      assertThat(action(id).path("state").asText()).isEqualTo(expectedState);
      var rows =
          actualJdbc.queryForList(
              "SELECT row_kind,outcome,usage_outcome,vault_version "
                  + "FROM studio_secret_use_audit WHERE session_id=? ORDER BY row_kind",
              id);
      assertThat(rows).hasSize(2);
      assertThat(rows.get(0))
          .containsEntry("row_kind", "RELEASE")
          .containsEntry("outcome", "RESOLVED")
          .containsEntry("vault_version", "fixture-version-1");
      assertThat(rows.get(1))
          .containsEntry("usage_outcome", mode.ownerOk() ? "USED" : "UNKNOWN_OUTCOME");
      var restarted = service(repository, materialization, access, 600);
      var recovered = new GuidedDispatchService(restarted, materialization, client());
      recovered.installReferences(
          new VaultStudioReferenceResolver(new CountedProvider(), (p, c, e, n) -> true));
      String terminalRefusal =
          mode == Mode.COMPLETE_200_OWNER_FAILED ? "PUBLICATION_CONFLICT" : "UNKNOWN_OUTCOME";
      if (mode == Mode.CALLER_EXPIRY_AFTER_CONSUME) {
        var storedClock =
            actualJdbc.queryForMap(
                "SELECT document->>'expiresAt' AS deadline,document->'owner'->>'leaseExpiresAt' AS lease "
                    + "FROM studio_guided_sessions WHERE session_id=?",
                id);
        Instant recoveryNow = Instant.now();
        assertThat(Instant.parse((String) storedClock.get("deadline")).isAfter(recoveryNow))
            .isFalse();
        assertThat(Instant.parse((String) storedClock.get("lease")).isAfter(recoveryNow)).isFalse();
        terminalRefusal = "STALE_FENCE";
      }
      for (String key : List.of("consume", "new-consume-key")) {
        if (mode.ownerOk()) {
          assertThat(recovered.dispatch(controller, id, 1, key, advance).path("state").asText())
              .isEqualTo("SUCCEEDED");
        } else {
          assertThatThrownBy(() -> recovered.dispatch(controller, id, 1, key, advance))
              .isInstanceOf(GuidedSessionException.class)
              .hasMessage(terminalRefusal);
        }
      }
      assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(scenario.reads.get()).isEqualTo(1);
      assertThat(scenario.posts.get()).isEqualTo(1);
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_commands "
                      + "WHERE namespace=? AND route='v2-consume'",
                  Integer.class,
                  id))
          .isEqualTo(mode.ownerOk() ? 2 : 1);
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_commands "
                      + "WHERE namespace=? AND route='v2-consume' AND response->>'state'='DISPATCHING'",
                  Integer.class,
                  id))
          .isEqualTo(1);
      String persisted =
          actualJdbc.queryForObject(
              "SELECT s.document::text||s.progress::text||"
                  + "a.document::text||a.proposal::text||m.authored_inputs::text FROM studio_guided_sessions s "
                  + "JOIN studio_guided_actions a ON a.session_id=s.session_id "
                  + "JOIN studio_guided_materializations m ON m.session_id=s.session_id WHERE s.session_id=?",
              String.class,
              id);
      assertThat(persisted.contains(scenario.canary)).isFalse();
    } finally {
      caller.interrupt();
      caller.join(3000);
      if (scenario.request.get() != null) {
        Arrays.fill(scenario.request.get(), (byte) 0);
      }
      if (scenario.chars.get() != null) {
        Arrays.fill(scenario.chars.get(), '\0');
      }
    }
  }

  @Test
  void genuinePrivatePgRouteFailureRetainsInterruptedUnknownWithoutInventingTerminalCommit()
      throws Exception {
    try (var route = new PrivatePgRoute(DATABASE.getHost(), DATABASE.getMappedPort(5432))) {
      var routedSource =
          new DriverManagerDataSource(
              "jdbc:postgresql://127.0.0.1:"
                  + route.port()
                  + "/"
                  + DATABASE.getDatabaseName()
                  + "?loggerLevel=OFF",
              DATABASE.getUsername(),
              DATABASE.getPassword());
      var routedJdbc = new JdbcTemplate(routedSource);
      var stopWork = new SourceStopOwner(routedSource);
      route.attach(stopWork);
      var routedRepository =
          new GuidedSessionRepository(routedJdbc, new TrackingTransactionTemplate(routedSource), C);
      var routedMaterialization = new GuidedMaterializationService(routedJdbc, C);
      var routedAccess = new FixtureAccess(routedJdbc);
      assertThat(routedJdbc.getDataSource()).isSameAs(routedSource);
      var scenario = new Scenario(Mode.INTERRUPT_AFTER_HEADERS);
      var sessions =
          service(routedJdbc, routedRepository, routedMaterialization, routedAccess, 600);
      var client = client();
      var dispatch = new GuidedDispatchService(sessions, routedMaterialization, client);
      Thread caller = null;
      Throwable primaryFailure = null;
      try {
        BY_TEST.put(scenario.testId, scenario);
        var steps = C.object().putArray("steps");
        steps.addObject().put("stepId", STEP_ID).put("text", "Enter <secret PASS> as password.");
        var variables = C.object().putArray("variables");
        variables.addObject().put("name", "PASS").put("kind", "secretRef");
        scenario.source = steps;
        scenario.configuration = variables;
        actualJdbc.update(
            "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by) "
                + "VALUES (?,'fault fixture','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?)",
            scenario.testId,
            steps.toString(),
            variables.toString(),
            EMAIL);
        dispatch.installReferences(
            new VaultStudioReferenceResolver(
                new CountedProvider(),
                (principal, csi, environment, secret) ->
                    principal.equals("user-1")
                        && csi.equals("CSI-123")
                        && environment.equals("fixture")
                        && secret.equals("PASS")));
        sessions.installStopSender(
            (contextToStop, reason) -> stopWork.send(dispatch, contextToStop, reason));
        var observer =
            GuidedRunnerClient.class.getDeclaredMethod(
                "observeRequestBytes", java.util.function.Consumer.class);
        observer.setAccessible(true);
        observer.invoke(
            client,
            (java.util.function.Consumer<byte[]>)
                bytes -> {
                  if (scenario.reads.get() == 1 && scenario.posts.get() == 0) {
                    scenario.request.set(bytes);
                  }
                });
        String id =
            sessions
                .start(
                    user,
                    UUID.randomUUID().toString(),
                    C.object()
                        .put("schemaVersion", 3)
                        .put("testId", scenario.testId.toString())
                        .put("sourceRevision", "source-1")
                        .put("configurationRevision", "config-1")
                        .put("environmentId", "fixture")
                        .put("applicationId", "orders")
                        .set("versions", DOCUMENTS.path("versions")))
                .path("sessionId")
                .asText();
        scenario.sessionId = id;
        BY_SESSION.put(id, scenario);
        routedRepository.transaction(
            () -> {
              var session = routedRepository.lock(id).document();
              var manifest =
                  C.object()
                      .put("testId", scenario.testId.toString())
                      .put("sourceRevision", "source-1")
                      .put("configurationRevision", "config-1")
                      .put("policy", "INPUT-POLICY-01-A");
              manifest.set("sourceSteps", steps);
              manifest
                  .putArray("configurationReferences")
                  .addObject()
                  .put("referenceId", "ref-PASS")
                  .put("referenceName", "PASS")
                  .put("kind", "secretRef")
                  .put("stepId", STEP_ID)
                  .put("intendedSlot", "fill.value");
              new GuidedTranslationStore(routedJdbc, C).initialize(session, manifest);
              return null;
            });
        dispatch.assign(controller, id, "assign", "worker-1");
        var references = C.object().putArray("references");
        references.add(DOCUMENTS.path("secretReference"));
        sessions.materialize(controller, id, 1, "materialize", references);
        ObjectNode context = sessions.runnerContext(controller, id, 1);
        ObjectNode observation = DOCUMENTS.path("observation").path("observation").deepCopy();
        observation
            .put("sessionId", id)
            .put("scopeHash", context.path("scopeHash").asText())
            .put("observedAt", Instant.now().toString());
        observation.withObject("/coverage").put("passwordControls", 1);
        var envelope = identity(context);
        envelope.set("observation", observation);
        callback(id, "observations", envelope);
        ObjectNode evidence =
            C.object()
                .put("kind", "observedDocument")
                .put("sessionId", id)
                .put("contextId", context.path("contextId").asText())
                .put("documentId", "document-1")
                .put("generation", 1)
                .put("origin", ORIGIN)
                .put("observationHash", GuidedContracts.hash(observation));
        ObjectNode proposal = DOCUMENTS.path("secretAction").deepCopy();
        proposal
            .put("sessionId", id)
            .put("scopeHash", context.path("scopeHash").asText())
            .put("generation", 1)
            .put("evidenceHash", GuidedContracts.hash(evidence))
            .put("authoredInputsHash", context.path("authoredInputsHash").asText());
        proposal.set("executionEvidence", evidence);
        proposal.withObject("/target").put("documentId", "document-1").put("generation", 1);
        proposal
            .withObject("/operation/value")
            .put(
                "sourceInputId",
                context.path("authoredInputs").path("inputs").get(0).path("inputId").asText());
        JsonNode admission = dispatch.prepareAndAdmit(controller, id, 1, "admit", proposal);
        assertThat(admission.path("dispatchCount").asInt()).isZero();
        assertThat(scenario.reads.get()).isZero();
        assertThat(scenario.names.get()).isGreaterThan(0);
        assertThat(scenario.posts.get()).isZero();
        ObjectNode advance =
            C.object()
                .put("schemaVersion", 3)
                .put("sessionId", id)
                .put("ownerFence", 1)
                .put("admissionId", admission.path("admission").path("admissionId").asText())
                .put("operationHash", admission.path("operationHash").asText());

        caller =
            Thread.ofVirtual()
                .start(
                    () -> {
                      try {
                        dispatch.dispatch(controller, id, 1, "consume", advance);
                      } catch (Throwable failure) {
                        scenario.failure.set(failure);
                      } finally {
                        scenario.interrupted.set(Thread.currentThread().isInterrupted());
                      }
                    });
        assertThat(scenario.headers.await(4, TimeUnit.SECONDS)).isTrue();
        assertThat(scenario.reads.get()).isEqualTo(1);
        assertThat(scenario.posts.get()).isEqualTo(1);
        assertThat(scenario.certified.get()).isTrue();
        assertThat(scenario.callbacks.get()).isZero();
        assertThat(action(id).path("state").asText()).isEqualTo("DISPATCHING");
        assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
        assertConsumedReleaseWithoutTerminalUsage(id);
        assertThat(
                actualJdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_commands "
                        + "WHERE namespace=? AND route='v2-consume'",
                    Integer.class,
                    id))
            .isEqualTo(1);
        route.unavailable();
        assertThat(actualJdbc.queryForObject("SELECT 1", Integer.class)).isEqualTo(1);
        Throwable routeRefusal =
            org.assertj.core.api.Assertions.catchThrowable(
                () -> routedJdbc.queryForObject("SELECT 1", Integer.class));
        assertThat(routeRefusal).isNotNull();
        assertThat(postgresFailure(routeRefusal).getSQLState()).startsWith("08");
        caller.interrupt();
        // Harness safety only: a closed local route does not prove a production DB deadline.
        caller.join(15000);
        assertThat(caller.isAlive())
            .as("genuine local JDBC refusal must finish this probe")
            .isFalse();
        assertThat(scenario.failure.get())
            .isInstanceOf(org.springframework.transaction.CannotCreateTransactionException.class);
        assertThat(postgresFailure(scenario.failure.get()).getSQLState()).startsWith("08");
        assertThat(scenario.failure.get().getSuppressed()).hasSize(1);
        assertThat(scenario.failure.get().getSuppressed()[0])
            .isInstanceOf(GuidedSessionException.class)
            .hasMessage("UNKNOWN_OUTCOME");
        assertThat(((GuidedSessionException) scenario.failure.get().getSuppressed()[0]).status())
            .isEqualTo(409);
        assertThat(scenario.interrupted.get()).isTrue();
        assertThat(zero(scenario.request.get())).isTrue();
        assertThat(zero(scenario.chars.get())).isTrue();
        assertThat(scenario.disconnected.await(3, TimeUnit.SECONDS)).isTrue();
        assertThat(scenario.peerFailure.get()).isNull();
        assertThat(action(id).path("state").asText()).isEqualTo("DISPATCHING");
        assertThat(
                actualJdbc.queryForObject(
                    "SELECT document->>'state' FROM studio_guided_sessions " + "WHERE session_id=?",
                    String.class,
                    id))
            .isEqualTo("ACTING");
        assertThat(
                actualJdbc.queryForObject(
                    "SELECT live FROM studio_guided_materializations " + "WHERE session_id=?",
                    Boolean.class,
                    id))
            .isTrue();
        assertConsumedReleaseWithoutTerminalUsage(id);
        assertThat(
                actualJdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_commands "
                        + "WHERE namespace=? AND route='v2-consume'",
                    Integer.class,
                    id))
            .isEqualTo(1);
        int samePort = route.port();
        route.reopen();
        assertThat(route.port()).isEqualTo(samePort);
        assertThat(routedJdbc.queryForObject("SELECT 1", Integer.class)).isEqualTo(1);
        var restarted =
            service(routedJdbc, routedRepository, routedMaterialization, routedAccess, 600);
        var recovered = new GuidedDispatchService(restarted, routedMaterialization, client());
        recovered.installReferences(
            new VaultStudioReferenceResolver(
                new CountedProvider(),
                (principal, csi, environment, secret) ->
                    principal.equals("user-1")
                        && csi.equals("CSI-123")
                        && environment.equals("fixture")
                        && secret.equals("PASS")));
        restarted.installStopSender(
            (contextToStop, reason) -> stopWork.send(recovered, contextToStop, reason));
        for (String key : List.of("consume", "new-consume-key")) {
          Instant now = Instant.now();
          String lease =
              actualJdbc.queryForObject(
                  "SELECT document->'owner'->>'leaseExpiresAt' "
                      + "FROM studio_guided_sessions WHERE session_id=?",
                  String.class,
                  id);
          if (Instant.parse(lease).isAfter(now)) {
            JsonNode prior = recovered.dispatch(controller, id, 1, key, advance);
            assertThat(prior.path("state").asText()).isEqualTo("DISPATCHING");
            assertThat(prior.path("dispatchCount").asInt()).isEqualTo(1);
          } else {
            assertThatThrownBy(() -> recovered.dispatch(controller, id, 1, key, advance))
                .isInstanceOf(GuidedSessionException.class)
                .hasMessage("STALE_FENCE");
          }
          assertThat(scenario.reads.get()).isEqualTo(1);
          assertThat(scenario.posts.get()).isEqualTo(1);
          assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
          assertConsumedReleaseWithoutTerminalUsage(id);
        }
        // Genuine authorized closure is a separate action, not a claimed failed-helper commit.
        stopWork.expect(id);
        restarted.cancel(
            user,
            id,
            "user-cancel-after-route-restored",
            C.object().put("schemaVersion", 3).put("reason", "userRequested"));
        assertThat(
                actualJdbc.queryForObject(
                    "SELECT document->>'state' FROM studio_guided_sessions " + "WHERE session_id=?",
                    String.class,
                    id))
            .isEqualTo("CANCELLED");
        assertThat(action(id).path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
        assertThat(
                actualJdbc.queryForList(
                    "SELECT usage_outcome FROM studio_secret_use_audit "
                        + "WHERE session_id=? AND row_kind='USAGE'",
                    String.class,
                    id))
            .containsExactly("UNKNOWN_OUTCOME");
        assertThat(scenario.reads.get()).isEqualTo(1);
        assertThat(scenario.posts.get()).isEqualTo(1);
        assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
        awaitActualStop(route, scenario, stopWork);
      } catch (Exception | Error failure) {
        primaryFailure = failure;
        throw failure;
      } finally {
        var cleanupFailures = new java.util.ArrayList<Throwable>();
        boolean restored = false;
        try {
          route.reopen();
          restored = true;
        } catch (Exception | Error failure) {
          cleanupFailures.add(failure);
        }
        boolean callerReaped = caller == null;
        // Always attempt caller cleanup, even if same-port restoration failed.
        if (caller != null) {
          try {
            caller.interrupt();
            caller.join(5000);
            callerReaped = !caller.isAlive();
            if (!callerReaped) {
              cleanupFailures.add(new AssertionError("Actual probe caller was not reaped"));
            }
          } catch (Exception | Error failure) {
            if (failure instanceof InterruptedException) {
              Thread.currentThread().interrupt();
            }
            cleanupFailures.add(failure);
          }
        }
        if (scenario.sessionId != null) {
          if (restored && callerReaped) {
            try {
              var stored =
                  actualJdbc.queryForMap(
                      "SELECT s.document->>'state' AS state,"
                          + "(EXISTS(SELECT 1 FROM studio_guided_materializations m WHERE m.session_id=s.session_id)"
                          + (" OR EXISTS(SELECT 1 FROM studio_guided_assignments a WHERE "
                              + "a.session_id=s.session_id)) AS has_context ")
                          + "FROM studio_guided_sessions s WHERE s.session_id=?",
                      scenario.sessionId);
              if (Boolean.TRUE.equals(stored.get("has_context"))
                  && !java.util.Set.of(
                          "CANCELLED",
                          "FAILED",
                          "EXPIRED",
                          "UNKNOWN_OUTCOME",
                          "SUCCEEDED",
                          "PUBLICATION_CONFLICT")
                      .contains(stored.get("state"))) {
                stopWork.expect(scenario.sessionId);
              }
              sessions.cancel(
                  user,
                  scenario.sessionId,
                  "cleanup-user-cancel",
                  C.object().put("schemaVersion", 3).put("reason", "userRequested"));
            } catch (Exception | Error failure) {
              cleanupFailures.add(failure);
            }
          }
          try {
            awaitActualStop(route, scenario, stopWork);
          } catch (Exception | Error failure) {
            cleanupFailures.add(failure);
          }
        }
        try {
          stopWork.drainUninterruptibly();
        } catch (RuntimeException | Error cleanup) {
          cleanupFailures.add(cleanup);
        }
        if (stopWork.failure.get() != null) {
          cleanupFailures.add(stopWork.failure.get());
        }
        if (stopWork.guardFailure.get() != null) {
          cleanupFailures.add(stopWork.guardFailure.get());
        }
        // Preserve live ownership; never clear a buffer before its actual owner is reaped.
        if (callerReaped) {
          if (scenario.request.get() != null) {
            Arrays.fill(scenario.request.get(), (byte) 0);
          }
          if (scenario.chars.get() != null) {
            Arrays.fill(scenario.chars.get(), '\0');
          }
        }
        if (primaryFailure != null) {
          for (Throwable failure : cleanupFailures) {
            addSuppressedDistinct(primaryFailure, failure);
          }
        } else if (!cleanupFailures.isEmpty()) {
          Throwable first = cleanupFailures.get(0);
          for (int i = 1; i < cleanupFailures.size(); i++) {
            addSuppressedDistinct(first, cleanupFailures.get(i));
          }
          if (first instanceof Exception failure) {
            throw failure;
          }
          if (first instanceof Error failure) {
            throw failure;
          }
          throw new AssertionError(first);
        }
      }
    }
  }

  @Test
  void actualHeldGuidedSessionRowDefersReconciliationUntilOwnHolderReleased() throws Exception {
    try (var route = new PrivatePgRoute(DATABASE.getHost(), DATABASE.getMappedPort(5432))) {
      var setup = new HeldRowSetup();
      Thread caller = null;
      java.sql.Connection lockingConnection = null;
      Throwable primary = null, assertedTransportFailure = null;
      try {
        HeldRowFixture fixture = heldRowFixture(route, setup);
        Scenario scenario = fixture.scenario();
        String id = scenario.sessionId;
        caller =
            Thread.ofVirtual()
                .unstarted(
                    () -> {
                      try {
                        fixture
                            .dispatch()
                            .dispatch(controller, id, 1, "consume", fixture.advance());
                      } catch (Throwable failure) {
                        scenario.failure.set(failure);
                      } finally {
                        scenario.interrupted.set(Thread.currentThread().isInterrupted());
                      }
                    });
        fixture.trace().caller = caller;
        caller.start();
        assertThat(scenario.headers.await(4, TimeUnit.SECONDS)).isTrue();
        assertHeldRowCounters(scenario, id);
        assertThat(scenario.certified.get()).isTrue();
        assertThat(scenario.callbacks.get()).isZero();
        assertConsumedReleaseWithoutTerminalUsage(id);
        lockingConnection = fixture.source().getConnection();
        lockingConnection.setAutoCommit(false);
        var holderSettings =
            heldRowConnectionSettings(lockingConnection, fixture.source(), fixture.jdbc());
        assertNoInheritedLockDeadline(holderSettings);
        int holderPid = ((Number) holderSettings.get("pid")).intValue();
        try (var lock =
            lockingConnection.prepareStatement(
                "SELECT 1 FROM studio_guided_sessions WHERE session_id=? FOR UPDATE")) {
          lock.setString(1, id);
          assertThat(lock.getQueryTimeout()).isZero();
          try (var row = lock.executeQuery()) {
            assertThat(row.next()).as("exact own genuine session row acquired").isTrue();
            assertThat(row.getInt(1)).isEqualTo(1);
            assertThat(row.next()).isFalse();
          }
        }
        assertHeldRowUnresolved(id);
        assertThat(caller.isAlive()).isTrue();
        fixture.trace().observeReconciliation = true;
        caller.interrupt();
        assertThat(fixture.trace().observed.await(5, TimeUnit.SECONDS))
            .as("actual reconciliation connection prerequisite observation")
            .isTrue();
        assertThat(fixture.trace().observationFailure.get()).isNull();
        var settings = fixture.trace().settings.get();
        assertThat(settings).isNotNull();
        assertNoInheritedLockDeadline(settings);
        assertThat(settings.get("definitionTimeout")).isEqualTo(-1);
        assertThat(settings.get("managerDefaultTimeout")).isEqualTo(-1);
        assertThat(settings.get("transactionDeadline")).isEqualTo(false);
        int waiterPid = ((Number) settings.get("pid")).intValue();
        assertThat(waiterPid).isNotEqualTo(holderPid);
        Map<String, Object> wait = awaitOwnRowBlocker(holderPid, waiterPid);
        assertThat(wait.get("pid")).isEqualTo(waiterPid);
        assertThat(wait.get("wait_event_type")).isEqualTo("Lock");
        assertThat(wait.get("owned_blocker")).isEqualTo(true);
        assertThat(wait.get("wait_event")).isNotNull();
        // Closed labels/PIDs only: never collect pg_stat_activity.query or secret-bearing rows.
        var lockRows =
            actualJdbc.queryForList(
                "SELECT pid,locktype,mode,granted FROM pg_locks WHERE pid IN (?,?)",
                holderPid,
                waiterPid);
        assertThat(lockRows)
            .anyMatch(
                row ->
                    waiterPid == ((Number) row.get("pid")).intValue()
                        && Boolean.FALSE.equals(row.get("granted")));
        assertThat(caller.isAlive()).as("real held dependency has not been released").isTrue();
        assertThat(scenario.failure.get()).isNull();
        assertThat(zero(scenario.chars.get())).isTrue();
        assertThat(zero(scenario.request.get())).isTrue();
        assertThat(scenario.disconnected.await(3, TimeUnit.SECONDS)).isTrue();
        assertHeldRowCounters(scenario, id);
        assertHeldRowUnresolved(id);
        assertConsumedReleaseWithoutTerminalUsage(id);
        // Release only this actual retained holder, not another backend or a shared database.
        lockingConnection.rollback();
        lockingConnection.close();
        lockingConnection = null;
        caller.join(10000);
        assertThat(caller.isAlive()).as("harness join after positive dependency release").isFalse();
        assertThat(scenario.failure.get())
            .isInstanceOf(GuidedSessionException.class)
            .hasMessage("UNKNOWN_OUTCOME");
        assertThat(((GuidedSessionException) scenario.failure.get()).status()).isEqualTo(409);
        assertThat(scenario.failure.get().getSuppressed()).isEmpty();
        assertedTransportFailure = scenario.failure.get();
        assertThat(scenario.interrupted.get()).isTrue();
        assertThat(fixture.trace().completionStatus.get())
            .isEqualTo(
                org.springframework.transaction.support.TransactionSynchronization
                    .STATUS_COMMITTED);
        assertThat(fixture.trace().observationFailure.get()).isNull();
        assertThat(fixture.owner().expected).isTrue();
        fixture.owner().drainUninterruptibly();
        assertThat(fixture.owner().failure.get()).isNull();
        assertThat(fixture.owner().guardFailure.get()).isNull();
        assertThat(fixture.owner().initiated.get()).isEqualTo(1);
        assertThat(fixture.owner().confirmationCalls.get()).isEqualTo(1);
        assertThat(action(id).path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
        assertThat(
                actualJdbc.queryForObject(
                    "SELECT document->>'state' FROM studio_guided_sessions WHERE session_id=?",
                    String.class,
                    id))
            .isEqualTo("UNKNOWN_OUTCOME");
        assertThat(
                actualJdbc.queryForList(
                    "SELECT usage_outcome FROM studio_secret_use_audit WHERE session_id=? AND row_kind='USAGE'",
                    String.class,
                    id))
            .containsExactly("UNKNOWN_OUTCOME");
        awaitActualStop(route, scenario, fixture.owner());
        for (String key : List.of("consume", "new-consume-key")) {
          String lease =
              actualJdbc.queryForObject(
                  "SELECT document->'owner'->>'leaseExpiresAt' FROM studio_guided_sessions WHERE session_id=?",
                  String.class,
                  id);
          String refusal =
              Instant.parse(lease).isAfter(Instant.now()) ? "UNKNOWN_OUTCOME" : "STALE_FENCE";
          assertThatThrownBy(
                  () -> fixture.dispatch().dispatch(controller, id, 1, key, fixture.advance()))
              .isInstanceOf(GuidedSessionException.class)
              .hasMessage(refusal);
          assertHeldRowCounters(scenario, id);
        }
        assertThat(scenario.peerFailure.get()).isNull();
        assertThat(zero(scenario.chars.get())).isTrue();
        assertThat(zero(scenario.request.get())).isTrue();
      } catch (Exception | Error failure) {
        primary = failure;
        if (failure instanceof InterruptedException) {
          Thread.currentThread().interrupt();
        }
        throw failure;
      } finally {
        var cleanupFailures = new java.util.ArrayList<Throwable>();
        boolean interrupted = Thread.interrupted();
        try {
          if (lockingConnection != null) {
            try {
              lockingConnection.rollback();
            } catch (Exception | Error cleanup) {
              cleanupFailures.add(cleanup);
            }
            try {
              lockingConnection.close();
            } catch (Exception | Error cleanup) {
              cleanupFailures.add(cleanup);
            }
          }
          // Dependency release is independent of every observation failure. Never kill a backend.
          if (caller != null && caller.isAlive()) {
            if (setup.fixture != null) {
              setup.fixture.trace().observeReconciliation = true;
            }
            caller.interrupt();
          }
          joinUninterruptibly(caller);
          try {
            closeHeldRowSetup(setup, route);
          } catch (Exception | Error cleanup) {
            cleanupFailures.add(cleanup);
          }
          if (setup.owner != null && setup.owner.failure.get() != null) {
            cleanupFailures.add(setup.owner.failure.get());
          }
          if (setup.owner != null && setup.owner.guardFailure.get() != null) {
            cleanupFailures.add(setup.owner.guardFailure.get());
          }
          if (setup.scenario != null
              && setup.scenario.failure.get() != null
              && setup.scenario.failure.get() != assertedTransportFailure) {
            cleanupFailures.add(setup.scenario.failure.get());
          }
          if (setup.trace != null && setup.trace.observationFailure.get() != null) {
            cleanupFailures.add(setup.trace.observationFailure.get());
          }
          if (primary != null) {
            for (Throwable cleanup : cleanupFailures) {
              addSuppressedDistinct(primary, cleanup);
            }
          } else if (!cleanupFailures.isEmpty()) {
            Throwable first = cleanupFailures.getFirst();
            for (int i = 1; i < cleanupFailures.size(); i++) {
              addSuppressedDistinct(first, cleanupFailures.get(i));
            }
            if (first instanceof Exception failure) {
              throw failure;
            }
            if (first instanceof Error failure) {
              throw failure;
            }
            throw new AssertionError(first);
          }
        } finally {
          if (interrupted) {
            Thread.currentThread().interrupt();
          }
        }
      }
    }
  }

  private static void assertHeldRowCounters(Scenario scenario, String id) {
    assertThat(scenario.reads.get()).isEqualTo(1);
    assertThat(scenario.posts.get()).isEqualTo(1);
    assertThat(scenario.callbacks.get()).isZero();
    assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(
            actualJdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='v2-consume'",
                Integer.class,
                id))
        .isEqualTo(1);
  }

  private static void assertHeldRowUnresolved(String id) {
    assertThat(action(id).path("state").asText()).isEqualTo("DISPATCHING");
    assertThat(
            actualJdbc.queryForObject(
                "SELECT document->>'state' FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id))
        .isEqualTo("ACTING");
    assertThat(
            actualJdbc.queryForObject(
                "SELECT live FROM studio_guided_materializations WHERE session_id=?",
                Boolean.class,
                id))
        .isTrue();
  }

  private static Map<String, Object> awaitOwnRowBlocker(int holderPid, int waiterPid)
      throws InterruptedException {
    long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
    while (System.nanoTime() < until) {
      var rows =
          actualJdbc.queryForList(
              "SELECT pid,wait_event_type,wait_event,?=ANY(pg_blocking_pids(pid)) AS owned_blocker "
                  + "FROM pg_stat_activity WHERE pid=? AND wait_event_type='Lock' "
                  + "AND ?=ANY(pg_blocking_pids(pid))",
              holderPid,
              waiterPid,
              holderPid);
      if (rows.size() == 1) {
        return rows.getFirst();
      }
      Thread.sleep(20);
    }
    throw new AssertionError("FAIL_TO_REACH_OWN_ROW_LOCK: no actual owned blocker edge observed");
  }

  private static void assertNoInheritedLockDeadline(Map<String, Object> settings) {
    assertThat(settings.get("lock_timeout"))
        .as("FAIL_TO_REACH_OWN_ROW_LOCK: finite inherited lock timeout changes this branch")
        .isEqualTo("0");
    assertThat(settings.get("statement_timeout"))
        .as("FAIL_TO_REACH_OWN_ROW_LOCK: finite inherited statement timeout changes this branch")
        .isEqualTo("0");
    assertThat(settings.get("idle_in_transaction_session_timeout")).isEqualTo("0");
    assertThat(settings.get("jdbcNetworkTimeoutMillis")).isEqualTo(0);
    assertThat(settings.get("socketTimeout")).isEqualTo("0");
    assertThat(settings.get("jdbcTemplateQueryTimeoutSeconds")).isEqualTo(-1);
    assertThat(settings.get("newStatementQueryTimeoutSeconds")).isEqualTo(0);
    assertThat(settings.get("connectTimeout")).isNotNull();
    // Connect timeout is observed, not confused with an already established SQL lock deadline.
  }

  private static Map<String, Object> heldRowConnectionSettings(
      java.sql.Connection connection, DriverManagerDataSource source, JdbcTemplate jdbc)
      throws java.sql.SQLException {
    var settings = new java.util.LinkedHashMap<String, Object>();
    settings.put("jdbcNetworkTimeoutMillis", connection.getNetworkTimeout());
    settings.put("jdbcTemplateQueryTimeoutSeconds", jdbc.getQueryTimeout());
    var properties = new java.util.Properties();
    if (source.getConnectionProperties() != null) {
      properties.putAll(source.getConnectionProperties());
    }
    var infos =
        java.sql.DriverManager.getDriver(source.getUrl())
            .getPropertyInfo(source.getUrl(), properties);
    for (var info : infos) {
      if (java.util.Set.of("connectTimeout", "socketTimeout").contains(info.name)) {
        settings.put(info.name, info.value);
      }
    }
    try (var statement = connection.createStatement()) {
      settings.put("newStatementQueryTimeoutSeconds", statement.getQueryTimeout());
      try (var pid = statement.executeQuery("SELECT pg_backend_pid()")) {
        assertThat(pid.next()).isTrue();
        settings.put("pid", pid.getInt(1));
      }
      for (String name :
          List.of("lock_timeout", "statement_timeout", "idle_in_transaction_session_timeout")) {
        try (var setting = statement.executeQuery("SHOW " + name)) {
          assertThat(setting.next()).isTrue();
          settings.put(name, setting.getString(1));
        }
      }
    }
    return settings;
  }

  private static final class HeldRowTrace {
    final DriverManagerDataSource source;
    final JdbcTemplate jdbc;
    final SourceStopOwner owner;
    final CountDownLatch observed = new CountDownLatch(1);
    final AtomicReference<Map<String, Object>> settings = new AtomicReference<>();
    final AtomicReference<Throwable> observationFailure = new AtomicReference<>();
    final AtomicInteger completionStatus = new AtomicInteger(-1);
    volatile Thread caller;
    volatile String sessionId;
    volatile Scenario scenario;
    volatile boolean observeReconciliation;

    HeldRowTrace(DriverManagerDataSource source, JdbcTemplate jdbc, SourceStopOwner owner) {
      this.source = source;
      this.jdbc = jdbc;
      this.owner = owner;
    }

    boolean target() {
      // Real headers are emitted only after consume/read/release and accepted dispatch bytes.
      // This also captures honest HTTP-timeout reconciliation if a prerequisite observer is slow.
      return Thread.currentThread() == caller
          && (observeReconciliation || scenario != null && scenario.headers.getCount() == 0);
    }
  }

  private static final class HeldRowTransactionManager extends DataSourceTransactionManager {
    private final HeldRowTrace trace;

    HeldRowTransactionManager(DataSource source, HeldRowTrace trace) {
      super(source);
      this.trace = trace;
    }

    @Override
    protected void doBegin(
        Object transaction, org.springframework.transaction.TransactionDefinition definition) {
      super.doBegin(transaction, definition);
      if (!trace.target()) {
        return;
      }
      try {
        var holder =
            (org.springframework.jdbc.datasource.ConnectionHolder)
                org.springframework.transaction.support.TransactionSynchronizationManager
                    .getResource(trace.source);
        var settings = heldRowConnectionSettings(holder.getConnection(), trace.source, trace.jdbc);
        settings.put("definitionTimeout", definition.getTimeout());
        settings.put("managerDefaultTimeout", getDefaultTimeout());
        settings.put("transactionDeadline", holder.hasTimeout());
        trace.settings.set(settings);
      } catch (Exception | Error observationFailure) {
        // Observation does not replace/reject the real callback or manufacture a SQL failure.
        trace.observationFailure.compareAndSet(null, observationFailure);
      } finally {
        trace.observed.countDown();
      }
    }

    @Override
    protected void prepareSynchronization(
        org.springframework.transaction.support.DefaultTransactionStatus status,
        org.springframework.transaction.TransactionDefinition definition) {
      super.prepareSynchronization(status, definition);
      if (trace.target() && status.isNewSynchronization()) {
        org.springframework.transaction.support.TransactionSynchronizationManager
            .registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                  @Override
                  public int getOrder() {
                    // Pinned Spring sorts ascending; production stop synchronization is LOWEST.
                    return Ordered.HIGHEST_PRECEDENCE;
                  }

                  @Override
                  public void afterCompletion(int completionStatus) {
                    trace.completionStatus.set(completionStatus);
                    if (completionStatus != STATUS_COMMITTED) {
                      return;
                    }
                    try {
                      // Real committed cut only, before the later original callback schedules stop.
                      trace.owner.expect(trace.sessionId);
                    } catch (Throwable observationFailure) {
                      // Spring logs/catches callback failures; retain a sticky test failure
                      // explicitly.
                      if (!trace.observationFailure.compareAndSet(null, observationFailure)) {
                        addSuppressedDistinct(trace.observationFailure.get(), observationFailure);
                      }
                    }
                  }
                });
      }
    }
  }

  private static final class HeldRowTransactionTemplate extends TransactionTemplate {
    private final TrackingTransactionTemplate originalConfirmation;

    HeldRowTransactionTemplate(DataSource source, HeldRowTrace trace) {
      super(new HeldRowTransactionManager(source, trace));
      originalConfirmation = new TrackingTransactionTemplate(source);
    }

    @Override
    public <T> T execute(TransactionCallback<T> callback) {
      if (SourceStopOwner.CONFIRMATION.get() != null) {
        // Existing confirmation owner receives the exact unchanged callback and same source.
        return originalConfirmation.execute(callback);
      }
      return super.execute(callback);
    }
  }

  enum SetupObservationStage {
    NONE,
    AFTER_START_RETURNED,
    AFTER_ASSIGNMENT_PREPARED
  }

  @Test
  void actualHeldSetupObservationFailureAfterStartClosesWithoutNotifyWork() throws Exception {
    actualHeldSetupObservationControl(SetupObservationStage.AFTER_START_RETURNED);
  }

  @Test
  void actualHeldSetupObservationFailureAfterPreparedAssignmentStopsUnclaimedIntent()
      throws Exception {
    actualHeldSetupObservationControl(SetupObservationStage.AFTER_ASSIGNMENT_PREPARED);
  }

  private void actualHeldSetupObservationControl(SetupObservationStage stage) throws Exception {
    var setup = new HeldRowSetup();
    setup.observationStage = stage;
    AssertionError observation = new AssertionError("CONTROLLED_OBSERVATION_FAILURE_" + stage);
    setup.observationError = observation;
    try (var route = new PrivatePgRoute(DATABASE.getHost(), DATABASE.getMappedPort(5432))) {
      Throwable primary = null;
      try {
        heldRowFixture(route, setup);
      } catch (Exception | Error failure) {
        primary = failure;
        if (failure instanceof InterruptedException) {
          Thread.currentThread().interrupt();
        }
      } finally {
        try {
          closeHeldRowSetup(setup, route);
        } catch (Exception | Error cleanup) {
          if (primary != null) {
            addSuppressedDistinct(primary, cleanup);
          } else {
            primary = cleanup;
          }
        }
      }
      if (primary != observation) {
        if (primary instanceof Exception failure) {
          throw failure;
        }
        if (primary instanceof Error failure) {
          throw failure;
        }
        throw new AssertionError("Exact controlled setup observation failure was not reached");
      }
      if (primary.getSuppressed().length != 0) {
        // A real cleanup/confirmation error makes the control fail with its SAME original primary.
        throw observation;
      }
      assertThat(primary).isSameAs(observation);
      assertThat(setup.fixture)
          .as("no full fixture/admission was invented after the observation")
          .isNull();
      Scenario scenario = setup.scenario;
      String id = scenario.sessionId;
      assertThat(
              setup.jdbc.queryForObject(
                  "SELECT document->>'state' FROM studio_guided_sessions WHERE session_id=?",
                  String.class,
                  id))
          .isEqualTo("CANCELLED");
      assertHeldSetupNoEffects(setup);
      assertThat(setup.owner.failure.get()).isNull();
      assertThat(setup.owner.guardFailure.get()).isNull();
      assertThat(setup.cleanupObserverFailure.get()).isNull();
      if (stage == SetupObservationStage.AFTER_START_RETURNED) {
        assertThat(setup.phase).isEqualTo("START_RETURNED");
        assertThat(
                setup.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_assignments WHERE session_id=?",
                    Integer.class,
                    id))
            .isZero();
        assertThat(scenario.stops.get()).isZero();
        assertThat(setup.owner.expected).isFalse();
        assertThat(setup.owner.initiated.get()).isZero();
        assertThat(setup.owner.confirmationCalls.get()).isZero();
        assertThat(setup.owner.completed.getCount())
            .as("no expected operation means no invented completion")
            .isEqualTo(1);
        assertThat(
                setup.jdbc.queryForObject(
                    "SELECT progress->>'teardownStatus' FROM studio_guided_sessions WHERE session_id=?",
                    String.class,
                    id))
            .isNull();
      } else {
        assertThat(setup.phase).isEqualTo("ASSIGNMENT_PREPARED_RETURNED");
        assertThat(scenario.assignmentTerminated.get()).isTrue();
        assertThat(scenario.stops.get()).isEqualTo(1);
        assertThat(setup.owner.expected).isTrue();
        assertThat(setup.owner.initiated.get()).isEqualTo(1);
        assertThat(setup.owner.finished.get()).isEqualTo(1);
        assertThat(setup.owner.confirmationCalls.get()).isEqualTo(1);
        assertThat(setup.owner.operationsComplete()).isTrue();
        assertThat(setup.owner.completed.getCount()).isZero();
        assertThat(
                setup.jdbc.queryForObject(
                    "SELECT progress->>'teardownStatus' FROM studio_guided_sessions WHERE session_id=?",
                    String.class,
                    id))
            .isEqualTo("CONFIRMED");
        assertThat(
                setup.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_assignments WHERE session_id=? AND live",
                    Integer.class,
                    id))
            .isZero();
        assertThat(new GuidedAssignmentStore(setup.jdbc, C).find(id))
            .isEqualTo(setup.observedAssignment);
        var owner =
            C.parse(
                setup.jdbc.queryForObject(
                    "SELECT document->'owner' FROM studio_guided_sessions WHERE session_id=?",
                    String.class,
                    id));
        assertThat(owner.path("workerId").asText()).isEqualTo("unclaimed");
        assertThat(owner.path("fence").asLong())
            .isEqualTo(setup.observedAssignment.path("expectedFence").asLong());
        assertThat(
                setup.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_assignments WHERE session_id=? AND receipt IS NOT NULL",
                    Integer.class,
                    id))
            .isZero();
      }
      assertThat(scenario.peerFailure.get()).isNull();
      assertThat(primary.getSuppressed()).isEmpty();
      assertThat(route.closed).as("closure assertions precede real route destruction").isFalse();
      int diagnosticOrdinal = 0;
      Throwable idleFailure = null;
      try {
        System.out.println(
            "SETUP_ROUTE_IDLE_DIAGNOSTIC "
                + route.countOnlyDiagnostic(++diagnosticOrdinal, stage, "BEFORE"));
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        // The final routed query has finished. Observe actual bridge finalizers without new SQL.
        while (!route.idle() && System.nanoTime() < until) {
          Thread.sleep(20);
        }
        System.out.println(
            "SETUP_ROUTE_IDLE_DIAGNOSTIC "
                + route.countOnlyDiagnostic(++diagnosticOrdinal, stage, "AFTER"));
        assertThat(route.closed).as("route stays open through actual idle observation").isFalse();
        assertThat(route.idle()).isTrue();
      } catch (Exception | Error failure) {
        idleFailure = failure;
        if (failure instanceof InterruptedException) {
          Thread.currentThread().interrupt();
        }
        throw failure;
      } finally {
        if (idleFailure != null) {
          try {
            System.out.println(
                "SETUP_ROUTE_IDLE_DIAGNOSTIC "
                    + route.countOnlyDiagnostic(++diagnosticOrdinal, stage, "FAILURE_FINALLY"));
          } catch (RuntimeException | Error diagnosticFailure) {
            addSuppressedDistinct(idleFailure, diagnosticFailure);
          }
        }
      }
    }
  }

  private void verifyHeldSetupStartBoundary(HeldRowSetup setup) {
    assertThat(setup.observationError).isNotNull();
    assertThat(setup.phase).isEqualTo("START_RETURNED");
    verifyHeldSetupOwnedStartReceipt(setup);
    assertThat(
            setup.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_assignments WHERE session_id=?",
                Integer.class,
                setup.scenario.sessionId))
        .isZero();
    assertHeldSetupNoEffects(setup);
  }

  private void verifyHeldSetupOwnedStartReceipt(HeldRowSetup setup) {
    String principal = ((BffAuthenticationToken) user).getPrincipal().userId();
    String namespace =
        GuidedContracts.hash(
            C.object().put("principal", principal).put("testId", setup.scenario.testId.toString()));
    assertThat(
            setup.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands c "
                    + "JOIN studio_guided_sessions s ON s.session_id=c.response->>'sessionId' "
                    + "WHERE c.namespace=? AND c.route='start' AND c.idempotency_key=? AND c.request_digest=? "
                    + "AND s.session_id=? AND s.document->>'testId'=? AND s.principal_id=?",
                Integer.class,
                namespace,
                setup.startKey,
                GuidedContracts.hash(setup.startRequest),
                setup.scenario.sessionId,
                setup.scenario.testId.toString(),
                principal))
        .isEqualTo(1);
  }

  private void verifyHeldSetupAssignmentBoundary(HeldRowSetup setup) {
    assertThat(setup.observationError).isNotNull();
    assertThat(setup.phase).isEqualTo("ASSIGNMENT_PREPARED_RETURNED");
    verifyHeldSetupOwnedStartReceipt(setup);
    assertThat(new GuidedAssignmentStore(setup.jdbc, C).find(setup.scenario.sessionId))
        .isEqualTo(setup.observedAssignment);
    assertThat(
            setup.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_assignments WHERE session_id=? AND live AND receipt IS NULL",
                Integer.class,
                setup.scenario.sessionId))
        .isEqualTo(1);
    var owner =
        C.parse(
            setup.jdbc.queryForObject(
                "SELECT document->'owner' FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                setup.scenario.sessionId));
    assertThat(owner.path("workerId").asText()).isEqualTo("unclaimed");
    assertThat(owner.path("fence").asLong())
        .isEqualTo(setup.observedAssignment.path("expectedFence").asLong());
    assertThat(setup.owner.expected).isFalse();
    assertThat(setup.scenario.stops.get()).isZero();
    assertHeldSetupNoEffects(setup);
  }

  private static void assertHeldSetupNoEffects(HeldRowSetup setup) {
    String id = setup.scenario.sessionId;
    assertThat(setup.scenario.reads.get()).isZero();
    assertThat(setup.scenario.posts.get()).isZero();
    assertThat(setup.scenario.callbacks.get()).isZero();
    assertThat(setup.scenario.chars.get()).isNull();
    assertThat(setup.scenario.request.get()).isNull();
    assertThat(
            setup.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='v2-consume'",
                Integer.class,
                id))
        .isZero();
    assertThat(
            setup.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_actions WHERE session_id=?", Integer.class, id))
        .isZero();
    assertThat(
            setup.jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
    assertThat(
            setup.jdbc.queryForObject(
                "SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? AND row_kind='RELEASE'",
                Integer.class,
                id))
        .isZero();
  }

  /** Retained before creation; phases describe observed calls, never authorize a forged owner. */
  private static final class HeldRowSetup {
    final String startKey = UUID.randomUUID().toString();
    JdbcTemplate jdbc;
    GuidedSessionRepository repository;
    GuidedMaterializationService materializer;
    GuidedSessionService sessions;
    GuidedDispatchService dispatch;
    SourceStopOwner owner;
    HeldRowTrace trace;
    Scenario scenario;
    ObjectNode startRequest;
    HeldRowFixture fixture;
    String phase = "BEFORE_CREATION";
    SetupObservationStage observationStage = SetupObservationStage.NONE;
    AssertionError observationError;
    ObjectNode observedAssignment;
    final AtomicReference<Throwable> cleanupObserverFailure = new AtomicReference<>();
  }

  private void recoverHeldRowSessionId(HeldRowSetup setup) {
    if (setup.scenario == null || setup.scenario.sessionId != null || setup.startRequest == null) {
      return;
    }
    String principal = ((BffAuthenticationToken) user).getPrincipal().userId();
    String namespace =
        GuidedContracts.hash(
            C.object().put("principal", principal).put("testId", setup.scenario.testId.toString()));
    var ids =
        setup.jdbc.queryForList(
            "SELECT c.response->>'sessionId' FROM studio_guided_commands c "
                + "JOIN studio_guided_sessions s ON s.session_id=c.response->>'sessionId' "
                + "WHERE c.namespace=? AND c.route='start' AND c.idempotency_key=? AND c.request_digest=? "
                + "AND s.document->>'testId'=? AND s.principal_id=?",
            String.class,
            namespace,
            setup.startKey,
            GuidedContracts.hash(setup.startRequest),
            setup.scenario.testId.toString(),
            principal);
    assertThat(ids.size())
        .as("only the exact committed owned start receipt can recover identity")
        .isLessThanOrEqualTo(1);
    if (ids.isEmpty()) {
      throw new AssertionError(
          "No committed owned start identity observed after "
              + setup.phase
              + "; unknown creation is not declared cleaned");
    }
    setup.scenario.sessionId = ids.getFirst();
    setup.trace.sessionId = setup.scenario.sessionId;
    setup.trace.scenario = setup.scenario;
    BY_SESSION.put(setup.scenario.sessionId, setup.scenario);
  }

  private void closeHeldRowSetup(HeldRowSetup setup, PrivatePgRoute route) throws Exception {
    boolean interrupted = Thread.interrupted();
    try {
      closeHeldRowSetupWithClearInterrupt(setup, route);
    } catch (Exception | Error failure) {
      if (failure instanceof InterruptedException) {
        interrupted = true;
      }
      throw failure;
    } finally {
      if (interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }

  private void closeHeldRowSetupWithClearInterrupt(HeldRowSetup setup, PrivatePgRoute route)
      throws Exception {
    var failures = new java.util.ArrayList<Throwable>();
    boolean hasSession = setup.scenario != null && setup.scenario.sessionId != null;
    try {
      recoverHeldRowSessionId(setup);
      hasSession = setup.scenario != null && setup.scenario.sessionId != null;
    } catch (Exception | Error cleanup) {
      failures.add(cleanup);
    }
    if (hasSession) {
      String id = setup.scenario.sessionId;
      try {
        setup.repository.transaction(
            () -> {
              var session = setup.repository.lock(id);
              assertThat(session.document().path("testId").asText())
                  .isEqualTo(setup.scenario.testId.toString());
              assertThat(session.document().path("scope").path("principalId").asText())
                  .isEqualTo(((BffAuthenticationToken) user).getPrincipal().userId());
              if (java.util.Set.of(
                      "CANCELLED",
                      "FAILED",
                      "EXPIRED",
                      "UNKNOWN_OUTCOME",
                      "SUCCEEDED",
                      "PUBLICATION_CONFLICT")
                  .contains(session.document().path("state").asText())) {
                return null;
              }
              ObjectNode notifyContext = null;
              try {
                notifyContext = setup.materializer.context(session.document());
              } catch (GuidedSessionException unavailable) {
                // Same public materializer/fallback selection as the actual service stop path.
              }
              if (notifyContext == null) {
                notifyContext = new GuidedAssignmentStore(setup.jdbc, C).find(id);
              }
              if (notifyContext != null) {
                assertThat(notifyContext.path("sessionId").asText()).isEqualTo(id);
                org.springframework.transaction.support.TransactionSynchronizationManager
                    .registerSynchronization(
                        new org.springframework.transaction.support.TransactionSynchronization() {
                          @Override
                          public int getOrder() {
                            return Ordered.HIGHEST_PRECEDENCE;
                          }

                          @Override
                          public void afterCompletion(int status) {
                            if (status != STATUS_COMMITTED) {
                              return;
                            }
                            try {
                              setup.owner.expect(id);
                            } catch (Throwable observationFailure) {
                              if (!setup.cleanupObserverFailure.compareAndSet(
                                  null, observationFailure)) {
                                addSuppressedDistinct(
                                    setup.cleanupObserverFailure.get(), observationFailure);
                              }
                            }
                          }
                        });
              }
              // Real authenticated public command joined to this actual locked physical
              // transaction.
              setup.sessions.cancel(
                  user,
                  id,
                  "held-row-setup-cleanup-" + setup.startKey,
                  C.object().put("schemaVersion", 3).put("reason", "userRequested"));
              return null;
            });
      } catch (Exception | Error cleanup) {
        failures.add(cleanup);
      }
    }
    if (setup.owner != null) {
      try {
        setup.owner.drainUninterruptibly();
      } catch (RuntimeException | Error cleanup) {
        failures.add(cleanup);
      }
      if (setup.owner.failure.get() != null) {
        failures.add(setup.owner.failure.get());
      }
      if (setup.owner.guardFailure.get() != null) {
        failures.add(setup.owner.guardFailure.get());
      }
    }
    if (setup.cleanupObserverFailure.get() != null) {
      failures.add(setup.cleanupObserverFailure.get());
    }
    if (hasSession) {
      String id = setup.scenario.sessionId;
      try {
        var status =
            setup.jdbc.queryForMap(
                "SELECT document->>'state' AS state,progress->>'teardownStatus' AS teardown "
                    + "FROM studio_guided_sessions WHERE session_id=?",
                id);
        assertThat(
                java.util.Set.of(
                        "CANCELLED",
                        "FAILED",
                        "EXPIRED",
                        "UNKNOWN_OUTCOME",
                        "SUCCEEDED",
                        "PUBLICATION_CONFLICT")
                    .contains(status.get("state")))
            .isTrue();
        assertThat(
                setup.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_materializations WHERE session_id=? AND live",
                    Integer.class,
                    id))
            .isZero();
        assertThat(
                setup.jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_assignments WHERE session_id=? AND live",
                    Integer.class,
                    id))
            .isZero();
        if (setup.owner.expected) {
          assertThat(status.get("teardown")).isEqualTo("CONFIRMED");
          assertThat(setup.owner.operationsComplete()).isTrue();
          int materializations =
              setup.jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                  Integer.class,
                  id);
          if (materializations == 0) {
            assertThat(setup.scenario.assignmentTerminated.get()).isTrue();
            assertThat(setup.scenario.stops.get()).isGreaterThan(0);
          }
        } else {
          assertThat(status.get("teardown"))
              .as("no notify context has no invented confirmation")
              .isNull();
        }
      } catch (Exception | Error cleanup) {
        failures.add(cleanup);
      }
    }
    try {
      long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
      while (!route.idle() && System.nanoTime() < until) {
        Thread.sleep(20);
      }
      assertThat(route.idle()).as("actual setup I/O is idle after real ownership drain").isTrue();
    } catch (Exception | Error cleanup) {
      failures.add(cleanup);
      if (cleanup instanceof InterruptedException) {
        Thread.currentThread().interrupt();
      }
    }
    if (!failures.isEmpty()) {
      Throwable first = failures.getFirst();
      for (int i = 1; i < failures.size(); i++) {
        addSuppressedDistinct(first, failures.get(i));
      }
      if (setup.owner != null) {
        // Honest lifetime failure: existing route/class drains must not destroy unresolved owners.
        // This does not create an expected task, signal genuine completion or mutate app state.
        setup.owner.rejectGuard(first);
      }
      if (first instanceof Exception cleanup) {
        throw cleanup;
      }
      if (first instanceof Error cleanup) {
        throw cleanup;
      }
      throw new AssertionError(first);
    }
  }

  private HeldRowFixture heldRowFixture(PrivatePgRoute route, HeldRowSetup setup) throws Exception {
    var routedSource =
        new DriverManagerDataSource(
            "jdbc:postgresql://127.0.0.1:"
                + route.port()
                + "/"
                + DATABASE.getDatabaseName()
                + "?loggerLevel=OFF",
            DATABASE.getUsername(),
            DATABASE.getPassword());
    var routedJdbc = new JdbcTemplate(routedSource);
    var stopWork = new SourceStopOwner(routedSource);
    route.attach(stopWork);
    var trace = new HeldRowTrace(routedSource, routedJdbc, stopWork);
    var routedRepository =
        new GuidedSessionRepository(
            routedJdbc, new HeldRowTransactionTemplate(routedSource, trace), C);
    var routedMaterialization = new GuidedMaterializationService(routedJdbc, C);
    var routedAccess = new FixtureAccess(routedJdbc);
    var scenario = new Scenario(Mode.INTERRUPT_AFTER_HEADERS);
    scenario.heldRowSetupCase = true;
    var sessions = service(routedJdbc, routedRepository, routedMaterialization, routedAccess, 600);
    var client = client();
    var dispatch = new GuidedDispatchService(sessions, routedMaterialization, client);
    setup.jdbc = routedJdbc;
    setup.repository = routedRepository;
    setup.materializer = routedMaterialization;
    setup.sessions = sessions;
    setup.dispatch = dispatch;
    setup.owner = stopWork;
    setup.trace = trace;
    setup.scenario = scenario;
    setup.phase = "GRAPH_RETAINED";
    BY_TEST.put(scenario.testId, scenario);
    var steps = C.object().putArray("steps");
    steps.addObject().put("stepId", STEP_ID).put("text", "Enter <secret PASS> as password.");
    var variables = C.object().putArray("variables");
    variables.addObject().put("name", "PASS").put("kind", "secretRef");
    scenario.source = steps;
    scenario.configuration = variables;
    actualJdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by) "
            + "VALUES (?,'held-row fixture','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?)",
        scenario.testId,
        steps.toString(),
        variables.toString(),
        EMAIL);
    dispatch.installReferences(
        new VaultStudioReferenceResolver(
            new CountedProvider(),
            (principal, csi, environment, secret) ->
                principal.equals("user-1")
                    && csi.equals("CSI-123")
                    && environment.equals("fixture")
                    && secret.equals("PASS")));
    sessions.installStopSender(
        (contextToStop, reason) -> stopWork.send(dispatch, contextToStop, reason));
    var observer =
        GuidedRunnerClient.class.getDeclaredMethod(
            "observeRequestBytes", java.util.function.Consumer.class);
    observer.setAccessible(true);
    observer.invoke(
        client,
        (java.util.function.Consumer<byte[]>)
            bytes -> {
              if (scenario.reads.get() == 1 && scenario.posts.get() == 0) {
                scenario.request.set(bytes);
              }
            });
    setup.startRequest =
        C.object()
            .put("schemaVersion", 3)
            .put("testId", scenario.testId.toString())
            .put("sourceRevision", "source-1")
            .put("configurationRevision", "config-1")
            .put("environmentId", "fixture")
            .put("applicationId", "orders")
            .set("versions", DOCUMENTS.path("versions"));
    setup.phase = "START_ENTERED";
    String id = sessions.start(user, setup.startKey, setup.startRequest).path("sessionId").asText();
    scenario.sessionId = id;
    trace.sessionId = id;
    trace.scenario = scenario;
    setup.phase = "START_RETURNED";
    BY_SESSION.put(id, scenario);
    if (setup.observationStage == SetupObservationStage.AFTER_START_RETURNED) {
      verifyHeldSetupStartBoundary(setup);
      throw setup.observationError;
    }
    routedRepository.transaction(
        () -> {
          var session = routedRepository.lock(id).document();
          var manifest =
              C.object()
                  .put("testId", scenario.testId.toString())
                  .put("sourceRevision", "source-1")
                  .put("configurationRevision", "config-1")
                  .put("policy", "INPUT-POLICY-01-A");
          manifest.set("sourceSteps", steps);
          manifest
              .putArray("configurationReferences")
              .addObject()
              .put("referenceId", "ref-PASS")
              .put("referenceName", "PASS")
              .put("kind", "secretRef")
              .put("stepId", STEP_ID)
              .put("intendedSlot", "fill.value");
          new GuidedTranslationStore(routedJdbc, C).initialize(session, manifest);
          return null;
        });
    setup.phase = "TRANSLATION_RETURNED";
    if (setup.observationStage == SetupObservationStage.AFTER_ASSIGNMENT_PREPARED) {
      setup.observedAssignment = sessions.prepareAssignment(controller, id, "assign", "worker-1");
      setup.phase = "ASSIGNMENT_PREPARED_RETURNED";
      verifyHeldSetupAssignmentBoundary(setup);
      throw setup.observationError;
    }
    dispatch.assign(controller, id, "assign", "worker-1");
    setup.phase = "ASSIGN_RETURNED";
    var references = C.object().putArray("references");
    references.add(DOCUMENTS.path("secretReference"));
    sessions.materialize(controller, id, 1, "materialize", references);
    setup.phase = "MATERIALIZE_RETURNED";
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    ObjectNode observation = DOCUMENTS.path("observation").path("observation").deepCopy();
    observation
        .put("sessionId", id)
        .put("scopeHash", context.path("scopeHash").asText())
        .put("observedAt", Instant.now().toString());
    observation.withObject("/coverage").put("passwordControls", 1);
    var envelope = identity(context);
    envelope.set("observation", observation);
    callback(id, "observations", envelope);
    ObjectNode evidence =
        C.object()
            .put("kind", "observedDocument")
            .put("sessionId", id)
            .put("contextId", context.path("contextId").asText())
            .put("documentId", "document-1")
            .put("generation", 1)
            .put("origin", ORIGIN)
            .put("observationHash", GuidedContracts.hash(observation));
    ObjectNode proposal = DOCUMENTS.path("secretAction").deepCopy();
    proposal
        .put("sessionId", id)
        .put("scopeHash", context.path("scopeHash").asText())
        .put("generation", 1)
        .put("evidenceHash", GuidedContracts.hash(evidence))
        .put("authoredInputsHash", context.path("authoredInputsHash").asText());
    proposal.set("executionEvidence", evidence);
    proposal.withObject("/target").put("documentId", "document-1").put("generation", 1);
    proposal
        .withObject("/operation/value")
        .put(
            "sourceInputId",
            context.path("authoredInputs").path("inputs").get(0).path("inputId").asText());
    JsonNode admission = dispatch.prepareAndAdmit(controller, id, 1, "admit", proposal);
    assertThat(admission.path("dispatchCount").asInt()).isZero();
    assertThat(scenario.reads.get()).isZero();
    assertThat(scenario.names.get()).isGreaterThan(0);
    assertThat(scenario.posts.get()).isZero();
    ObjectNode advance =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("ownerFence", 1)
            .put("admissionId", admission.path("admission").path("admissionId").asText())
            .put("operationHash", admission.path("operationHash").asText());

    setup.phase = "ADMISSION_RETURNED";
    setup.fixture =
        new HeldRowFixture(
            routedSource, routedJdbc, stopWork, trace, scenario, sessions, dispatch, advance);
    return setup.fixture;
  }

  private record HeldRowFixture(
      DriverManagerDataSource source,
      JdbcTemplate jdbc,
      SourceStopOwner owner,
      HeldRowTrace trace,
      Scenario scenario,
      GuidedSessionService sessions,
      GuidedDispatchService dispatch,
      ObjectNode advance) {}

  @Test
  void composedClaimRevocationCommitsBeforeRefusalAndOriginalStop() throws Exception {
    var owner = new SourceStopOwner(actualJdbc.getDataSource());
    Scenario[] created = new Scenario[1];
    GuidedSessionService[] services = new GuidedSessionService[1];
    Throwable primary = null;
    try {
      var fixture = prepareClaimRelease(owner, created, services, access);
      String id = fixture.scenario().sessionId;
      var release = claimReleaseRows(id);
      var commands = claimCommandRows(id);
      assertThat(release.size()).isEqualTo(1);
      var atSender = new AtomicInteger();
      var senderFailure = new AtomicReference<Throwable>();
      fixture
          .sessions()
          .installStopSender(
              (contextToStop, reason) -> {
                try {
                  // This is the original sender's entry, before send/ACK or confirmation.
                  assertThat(
                          org.springframework.transaction.support.TransactionSynchronizationManager
                              .getResource(actualJdbc.getDataSource()))
                      .isNull();
                  var committed = claimOwnerRow(id);
                  assertThat(committed.get("revoked_at") != null).isTrue();
                  assertThat(C.parse((String) committed.get("document")).path("state").asText())
                      .isEqualTo("CANCELLED");
                  assertThat(C.parse((String) committed.get("progress")).path("errorCode").asText())
                      .isEqualTo("SECRET_USE_REVOKED");
                  assertThat(claimReleaseRows(id).equals(release)).isTrue();
                  assertThat(claimCommandRows(id).equals(commands)).isTrue();
                  assertThat(
                          actualJdbc.queryForObject(
                              "SELECT count(*) FROM studio_secret_use_audit WHERE session_id=? "
                                  + "AND decision_stage='LIVE_RECHECK' AND outcome='REVOKED_MID_RUN'",
                              Integer.class,
                              id))
                      .isEqualTo(1);
                  assertThat(fixture.scenario().stops.get()).isZero();
                  atSender.incrementAndGet();
                } catch (RuntimeException | Error failure) {
                  senderFailure.compareAndSet(null, failure);
                }
                // Observation failures never replace or prevent the original stop operation.
                owner.send(fixture.dispatch(), contextToStop, reason);
              });
      var sweep =
          new com.citi.put.checks.studio.secrets.SecretRevocationSweep(
              actualJdbc,
              (principal, csi, environment, secret) -> false,
              new SecretUseAuditRecorder(actualJdbc),
              new DataSourceTransactionManager(actualJdbc.getDataSource()),
              context.getEnvironment());
      sweep.installGuidedStop(fixture.sessions()::secretRevoked);
      fixture.sessions().installSecretRevocation(sweep);
      owner.expect(id);
      assertThatThrownBy(
              () ->
                  fixture
                      .sessions()
                      .claim(
                          new GuidedInternalSecurity.Identity("worker-1", "owning-worker"),
                          id,
                          "claim-denied",
                          claimRequest(id)))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              failure -> {
                assertThat(failure.getMessage()).isEqualTo("SECRET_USE_REVOKED");
                assertThat(failure.status()).isEqualTo(409);
              });
      var committed = claimOwnerRow(id);
      assertThat(committed.get("revoked_at") != null).isTrue();
      assertThat(C.parse((String) committed.get("document")).path("state").asText())
          .isEqualTo("CANCELLED");
      assertThat(C.parse((String) committed.get("progress")).path("errorCode").asText())
          .isEqualTo("SECRET_USE_REVOKED");
      assertThat(claimCommandRows(id).equals(commands)).isTrue();
      assertThat(claimReleaseRows(id).equals(release)).isTrue();
      owner.drainUninterruptibly();
      assertThat(senderFailure.get() == null).isTrue();
      assertThat(atSender.get()).isEqualTo(1);
      assertThat(owner.initiated.get()).isEqualTo(1);
      assertThat(owner.finished.get()).isEqualTo(1);
      assertThat(owner.confirmationCalls.get()).isEqualTo(1);
      assertThat(fixture.scenario().stops.get()).isEqualTo(1);
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT progress->>'teardownStatus' FROM studio_guided_sessions WHERE session_id=?",
                  String.class,
                  id))
          .isEqualTo("CONFIRMED");
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT live FROM studio_guided_materializations WHERE session_id=?",
                  Boolean.class,
                  id))
          .isFalse();
      assertThat(fixture.scenario().reads.get()).isZero();
      assertThat(fixture.scenario().posts.get()).isZero();
    } catch (Exception | Error failure) {
      primary = failure;
      throw failure;
    } finally {
      closeClaimFixture(owner, created, services, primary);
    }
  }

  @Test
  void permittedComposedClaimSharesTransactionAndPreservesIdempotencyAndRollback()
      throws Exception {
    var owner = new SourceStopOwner(actualJdbc.getDataSource());
    Scenario[] created = new Scenario[1];
    GuidedSessionService[] services = new GuidedSessionService[1];
    var authorizationHolders = new java.util.ArrayList<ClaimResource>();
    var currentHolders = new java.util.ArrayList<ClaimResource>();
    var observing = new AtomicBoolean();
    var observedAccess =
        new FixtureAccess(
            actualJdbc,
            session -> {
              if (observing.get()) {
                currentHolders.add(currentClaimResource());
              }
            });
    Throwable primary = null;
    try {
      var fixture = prepareClaimRelease(owner, created, services, observedAccess);
      String id = fixture.scenario().sessionId;
      var release = claimReleaseRows(id);
      var sweep =
          new com.citi.put.checks.studio.secrets.SecretRevocationSweep(
              actualJdbc,
              (principal, csi, environment, secret) -> {
                if (observing.get()) {
                  authorizationHolders.add(currentClaimResource());
                }
                return principal.equals("user-1")
                    && csi.equals("CSI-123")
                    && environment.equals("fixture")
                    && secret.equals("PASS");
              },
              new SecretUseAuditRecorder(actualJdbc),
              new DataSourceTransactionManager(actualJdbc.getDataSource()),
              context.getEnvironment());
      sweep.installGuidedStop(fixture.sessions()::secretRevoked);
      fixture.sessions().installSecretRevocation(sweep);
      var worker = new GuidedInternalSecurity.Identity("worker-1", "owning-worker");
      ObjectNode request = claimRequest(id);
      observing.set(true);
      JsonNode renewed = fixture.sessions().claim(worker, id, "claim-permitted", request);
      assertClaimResourceIdentity(authorizationHolders, currentHolders);
      var stableOwner = claimOwnerRow(id);
      var stableCommands = claimCommandRows(id);
      var stableAudit =
          actualJdbc.queryForList(
              "SELECT * FROM studio_secret_use_audit WHERE session_id=? ORDER BY id", id);
      assertThat(C.parse((String) stableOwner.get("document")).equals(renewed)).isTrue();
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='claim' "
                      + "AND idempotency_key='claim-permitted'",
                  Integer.class,
                  id))
          .isEqualTo(1);
      authorizationHolders.clear();
      currentHolders.clear();
      JsonNode duplicate = fixture.sessions().claim(worker, id, "claim-permitted", request);
      assertClaimResourceIdentity(authorizationHolders, currentHolders);
      assertThat(duplicate.equals(renewed)).isTrue();
      assertThat(claimOwnerRow(id).equals(stableOwner)).isTrue();
      assertThat(claimCommandRows(id).equals(stableCommands)).isTrue();
      authorizationHolders.clear();
      currentHolders.clear();
      assertThatThrownBy(
              () ->
                  fixture
                      .sessions()
                      .claim(
                          worker,
                          id,
                          "claim-permitted",
                          request.deepCopy().put("expectedFence", 2)))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              failure -> {
                assertThat(failure.getMessage()).isEqualTo("IDEMPOTENCY_CONFLICT");
                assertThat(failure.status()).isEqualTo(409);
              });
      assertClaimResourceIdentity(authorizationHolders, currentHolders);
      assertThat(claimOwnerRow(id).equals(stableOwner)).isTrue();
      assertThat(claimCommandRows(id).equals(stableCommands)).isTrue();
      var rollback = new AssertionError("Controlled caller rollback");
      authorizationHolders.clear();
      currentHolders.clear();
      assertThatThrownBy(
              () ->
                  repository.transaction(
                      () -> {
                        JsonNode inside =
                            fixture.sessions().claim(worker, id, "claim-rollback", request);
                        assertClaimResourceIdentity(authorizationHolders, currentHolders);
                        assertThat(
                                C.parse((String) claimOwnerRow(id).get("document")).equals(inside))
                            .isTrue();
                        assertThat(
                                actualJdbc.queryForObject(
                                    "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='claim' "
                                        + "AND idempotency_key='claim-rollback'",
                                    Integer.class,
                                    id))
                            .isEqualTo(1);
                        throw rollback;
                      }))
          .isSameAs(rollback);
      observing.set(false);
      assertThat(claimOwnerRow(id).equals(stableOwner)).isTrue();
      assertThat(claimCommandRows(id).equals(stableCommands)).isTrue();
      assertThat(
              actualJdbc
                  .queryForList(
                      "SELECT * FROM studio_secret_use_audit WHERE session_id=? ORDER BY id", id)
                  .equals(stableAudit))
          .isTrue();
      assertThat(claimReleaseRows(id).equals(release)).isTrue();
      assertThat(fixture.scenario().reads.get()).isZero();
      assertThat(fixture.scenario().posts.get()).isZero();
    } catch (Exception | Error failure) {
      primary = failure;
      throw failure;
    } finally {
      observing.set(false);
      closeClaimFixture(owner, created, services, primary);
    }
  }

  private GuidedControllerCutFixture prepareClaimRelease(
      SourceStopOwner owner,
      Scenario[] created,
      GuidedSessionService[] services,
      FixtureAccess fixtureAccess)
      throws Exception {
    var fixture = prepareGuidedControllerCut(owner, created, services, fixtureAccess);
    var consumption =
        fixture
            .sessions()
            .consume(
                controller,
                fixture.scenario().sessionId,
                1,
                "claim-fixture-consume",
                fixture.advance());
    assertThat(consumption instanceof GuidedSessionService.WonConsumption).isTrue();
    assertThat(action(fixture.scenario().sessionId).path("dispatchCount").asInt()).isEqualTo(1);
    // Real service/guarded audit decision, controlled metadata; no value provider/native effect.
    fixture
        .sessions()
        .recordSecretDecision(
            fixture.scenario().sessionId,
            fixture.admission(),
            "PASS",
            "fixture-version-1",
            SecretUseAuditRecorder.ResolutionOutcome.RESOLVED);
    return fixture;
  }

  private static ObjectNode claimRequest(String id) {
    return C.object()
        .put("schemaVersion", 3)
        .put("sessionId", id)
        .put("workerId", "worker-1")
        .put("expectedFence", 1)
        .set("versions", DOCUMENTS.path("versions"));
  }

  private static Map<String, Object> claimOwnerRow(String id) {
    return actualJdbc.queryForMap(
        "SELECT document::text,progress::text,revoked_at FROM studio_guided_sessions WHERE session_id=?",
        id);
  }

  private static List<Map<String, Object>> claimCommandRows(String id) {
    return actualJdbc.queryForList(
        "SELECT * FROM studio_guided_commands WHERE namespace=? AND route='claim' ORDER BY idempotency_key",
        id);
  }

  private static List<Map<String, Object>> claimReleaseRows(String id) {
    return actualJdbc.queryForList(
        "SELECT * FROM studio_secret_use_audit WHERE session_id=? AND row_kind='RELEASE' "
            + "AND decision_stage='DISPATCH' ORDER BY id",
        id);
  }

  private record ClaimResource(Object holder, java.sql.Connection connection, boolean active) {}

  private static ClaimResource currentClaimResource() {
    Object holder =
        org.springframework.transaction.support.TransactionSynchronizationManager.getResource(
            actualJdbc.getDataSource());
    java.sql.Connection connection =
        holder instanceof org.springframework.jdbc.datasource.ConnectionHolder h
            ? h.getConnection()
            : null;
    return new ClaimResource(
        holder,
        connection,
        org.springframework.transaction.support.TransactionSynchronizationManager
            .isActualTransactionActive());
  }

  private static void assertClaimResourceIdentity(
      List<ClaimResource> authorization, List<ClaimResource> current) {
    assertThat(authorization.isEmpty()).isFalse();
    assertThat(current.size()).isEqualTo(1);
    var expected = current.getFirst();
    assertThat(expected.active()).isTrue();
    assertThat(expected.holder() != null && expected.connection() != null).isTrue();
    for (ClaimResource observed : authorization) {
      assertThat(observed.active()).isTrue();
      assertThat(observed.holder()).isSameAs(expected.holder());
      assertThat(observed.connection()).isSameAs(expected.connection());
    }
  }

  private void closeClaimFixture(
      SourceStopOwner owner, Scenario[] created, GuidedSessionService[] services, Throwable primary)
      throws Exception {
    var failures = new java.util.ArrayList<Throwable>();
    if (created[0] != null) {
      var scenario = created[0];
      attemptGuidedCutCleanup(
          failures,
          () -> {
            var document =
                repository.transaction(() -> repository.lock(scenario.sessionId).document());
            if (!Set.of(
                    "CANCELLED",
                    "UNKNOWN_OUTCOME",
                    "FAILED",
                    "EXPIRED",
                    "SUCCEEDED",
                    "PUBLICATION_CONFLICT")
                .contains(document.path("state").asText())) {
              owner.expect(scenario.sessionId);
              services[0].cancel(
                  user,
                  scenario.sessionId,
                  UUID.randomUUID().toString(),
                  C.object().put("schemaVersion", 3).put("reason", "userRequested"));
            }
          });
      attemptGuidedCutCleanup(failures, owner::drainUninterruptibly);
      attemptGuidedCutCleanup(
          failures,
          () -> {
            assertThat(owner.failure.get() == null && owner.guardFailure.get() == null).isTrue();
            assertThat(
                    actualJdbc.queryForObject(
                        "SELECT live FROM studio_guided_materializations WHERE session_id=?",
                        Boolean.class,
                        scenario.sessionId))
                .isFalse();
          });
    }
    if (!failures.isEmpty()) {
      GUIDED_CUT_CLEANUP_UNCONFIRMED.set(true);
      if (primary != null) {
        failures.forEach(primary::addSuppressed);
      } else {
        var first = failures.getFirst();
        failures.stream().skip(1).forEach(first::addSuppressed);
        if (first instanceof Exception exception) {
          throw exception;
        }
        throw (Error) first;
      }
    }
  }

  /** Owns the two actual operations, not the unexposed outer common-pool Future. */
  @Test
  void actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost()
      throws Exception {
    runGuidedControllerCut(false);
  }

  @Test
  void actualConsumedGuidedControllerJvmCrashBeforeResolutionReconcilesWithoutReadOrPost()
      throws Exception {
    runGuidedControllerCut(true);
  }

  private static String readStageOrEmpty(Path stage) {
    try {
      return Files.exists(stage) ? Files.readString(stage) : "";
    } catch (IOException unreadableYet) {
      return "";
    }
  }

  private void runGuidedControllerCut(boolean beforeResolve) throws Exception {
    int expectedReads = beforeResolve ? 0 : 1;
    String expectedStage =
        beforeResolve ? "GUIDED_CONSUMED_BEFORE_RESOLVE" : "READ_BEFORE_DECISION";
    var owner = new SourceStopOwner(actualJdbc.getDataSource());
    Scenario[] created = new Scenario[1];
    GuidedSessionService[] controllerService = new GuidedSessionService[1];
    Path scratch =
        Files.createTempDirectory(
            "guided-controller-cut-",
            java.nio.file.attribute.PosixFilePermissions.asFileAttribute(
                java.nio.file.attribute.PosixFilePermissions.fromString("rwx------")));
    var provider =
        com.sun.net.httpserver.HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    var providerPeers = Executors.newVirtualThreadPerTaskExecutor();
    provider.setExecutor(providerPeers);
    Process child = null;
    Throwable primary = null;
    boolean reconciled = false;
    try {
      GuidedControllerCutFixture fixture =
          prepareGuidedControllerCut(owner, created, controllerService);
      Scenario scenario = fixture.scenario();
      String id = scenario.sessionId;
      String admissionId = fixture.admission().path("admission").path("admissionId").asText();
      String path = "/guided-value/" + UUID.randomUUID();
      var providerFailure = new AtomicReference<Throwable>();
      var committedCountAtRead = new AtomicInteger(-1);
      provider.createContext(
          path,
          exchange -> {
            byte[] bytes = null;
            try (exchange) {
              require(exchange.getRequestMethod().equals("GET"), "INVALID_CONTRACT", 422);
              JsonNode actual = action(id);
              require(
                  actual.path("state").asText().equals("DISPATCHING")
                      && actual.path("dispatchCount").asInt() == 1
                      && actual.path("admission").path("admissionId").asText().equals(admissionId),
                  "STALE_FENCE",
                  409);
              require(
                  actualJdbc.queryForObject(
                          "SELECT count(*) FROM studio_secret_use_audit WHERE session_id=?",
                          Integer.class,
                          id)
                      == 0,
                  "INVALID_CONTRACT",
                  422);
              committedCountAtRead.set(actual.path("dispatchCount").asInt());
              scenario.reads.incrementAndGet();
              bytes =
                  C.object()
                      .put("value", scenario.canary)
                      .put("version", "fixture-version-1")
                      .toString()
                      .getBytes(StandardCharsets.UTF_8);
              exchange.sendResponseHeaders(200, bytes.length);
              exchange.getResponseBody().write(bytes);
            } catch (Throwable failure) {
              providerFailure.compareAndSet(null, failure);
            } finally {
              if (bytes != null) {
                Arrays.fill(bytes, (byte) 0);
              }
            }
          });
      provider.start();
      var source = (DriverManagerDataSource) actualJdbc.getDataSource();
      ObjectNode configuration =
          C.object()
              .put("url", source.getUrl())
              .put("username", source.getUsername())
              .put("password", source.getPassword())
              .put("provider", "http://127.0.0.1:" + provider.getAddress().getPort() + path)
              .put("stage", scratch.resolve("stage").toString())
              .put("beforeResolve", beforeResolve)
              .put("sessionId", id)
              .put("testId", scenario.testId.toString())
              .put("consumeKey", "controller-crash-consume")
              .put("tlsKeyStore", TEMP.resolve("fixture.p12").toString())
              .put("tlsTrustStore", TEMP.resolve("trust.p12").toString())
              .put("runner", "https://localhost:" + RELAY.getAddress().getPort())
              .put(
                  "runnerToken",
                  token("backend-controller", "controller-1", "studio-guided-runner"));
      configuration.set("source", scenario.source);
      configuration.set("configuration", scenario.configuration);
      configuration.set("advance", fixture.advance());
      Path config =
          Files.createFile(
              scratch.resolve("configuration.json"),
              java.nio.file.attribute.PosixFilePermissions.asFileAttribute(
                  java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")));
      Files.writeString(config, configuration.toString(), StandardCharsets.UTF_8);
      child =
          new ProcessBuilder(
                  Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                  "-cp",
                  com.citi.put.checks.studio.guided.publication.ObservedResolverProcessCrashIT
                      .childClasspath(),
                  GuidedControllerChild.class.getName(),
                  config.toString())
              .redirectErrorStream(true)
              .redirectOutput(scratch.resolve("child.log").toFile())
              .start();
      Path stageFile = scratch.resolve("stage");
      long stageDeadline = System.nanoTime() + Duration.ofSeconds(25).toNanos();
      // The child creates the marker and then writes its label, so existence is not readiness.
      String stageContent = readStageOrEmpty(stageFile);
      while (!stageContent.equals(expectedStage)
          && System.nanoTime() < stageDeadline
          && child.isAlive()) {
        Thread.sleep(10);
        stageContent = readStageOrEmpty(stageFile);
      }
      assertThat(stageContent)
          .as("controller-cut stage marker (childAlive=%s)", child.isAlive())
          .isEqualTo(expectedStage);
      assertThat(providerFailure.get() == null).isTrue();
      assertThat(committedCountAtRead.get()).isEqualTo(beforeResolve ? -1 : 1);
      assertThat(scenario.reads.get()).isEqualTo(expectedReads);
      assertThat(scenario.posts.get()).isZero();
      JsonNode committed = action(id);
      assertThat(committed.path("state").asText()).isEqualTo("DISPATCHING");
      assertThat(committed.path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(committed.path("admission").path("admissionId").asText()).isEqualTo(admissionId);
      assertThat(committed.path("coordinate").equals(fixture.admission().path("coordinate")))
          .isTrue();
      assertThat(committed.path("ownerFence").asLong()).isEqualTo(1);
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT count(*) FROM studio_secret_use_audit WHERE session_id=?",
                  Integer.class,
                  id))
          .isZero();
      assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
      assertThat(action(id).has("lastSecretReleaseId")).isFalse();
      long killedPid = child.pid();
      child.destroyForcibly();
      assertThat(child.waitFor(10, TimeUnit.SECONDS)).isTrue();
      assertThat(child.exitValue()).isNotZero();
      assertThat(ProcessHandle.of(killedPid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT count(*) FROM studio_secret_use_audit WHERE session_id=?",
                  Integer.class,
                  id))
          .isZero();
      var restarted = service(repository, materialization, access, 600);
      var recovery = new GuidedDispatchService(restarted, materialization, client());
      recovery.installReferences(
          new VaultStudioReferenceResolver(
              new CountedProvider(),
              (principal, csi, environment, name) ->
                  principal.equals("user-1")
                      && csi.equals("CSI-123")
                      && environment.equals("fixture")
                      && name.equals("PASS")));
      for (String key : List.of("controller-crash-consume", "controller-crash-new-key")) {
        assertThat(
                recovery.dispatch(controller, id, 1, key, fixture.advance()).path("state").asText())
            .isEqualTo("DISPATCHING");
      }
      assertThat(scenario.reads.get()).isEqualTo(expectedReads);
      assertThat(scenario.posts.get()).isZero();
      assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
      JsonNode pending = action(id);
      assertThat(pending.path("state").asText()).isEqualTo("DISPATCHING");
      assertThat(pending.path("admission").path("admissionId").asText()).isEqualTo(admissionId);
      owner.expect(id);
      restarted.installStopSender(
          (contextToStop, reason) -> owner.send(recovery, contextToStop, reason));
      // Trusted local recovery after actual owned-JVM exit; not expired-worker or ACK-loss
      // authority.
      restarted.lostAcknowledgment(id, admissionId);
      owner.drainUninterruptibly();
      assertThat(owner.failure.get() == null && owner.guardFailure.get() == null).isTrue();
      assertThat(owner.initiated.get()).isEqualTo(1);
      assertThat(owner.finished.get()).isEqualTo(1);
      assertThat(owner.confirmationCalls.get()).isEqualTo(1);
      assertThat(scenario.stops.get()).isEqualTo(1);
      assertThat(
              C.parse(
                      actualJdbc.queryForObject(
                          "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
                          String.class,
                          id))
                  .path("state")
                  .asText())
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT progress->>'teardownStatus' FROM studio_guided_sessions WHERE session_id=?",
                  String.class,
                  id))
          .isEqualTo("CONFIRMED");
      assertThat(
              actualJdbc.queryForObject(
                  "SELECT live FROM studio_guided_materializations WHERE session_id=?",
                  Boolean.class,
                  id))
          .isFalse();
      assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
      var rows =
          actualJdbc.queryForList("SELECT * FROM studio_secret_use_audit WHERE session_id=?", id);
      assertThat(rows.size()).isEqualTo(1);
      var summary = rows.getFirst();
      assertThat(
              "USAGE".equals(summary.get("row_kind"))
                  && "UNKNOWN_OUTCOME".equals(summary.get("usage_outcome")))
          .isTrue();
      assertThat(admissionId.equals(summary.get("admission_id"))).isTrue();
      assertThat(
              "GUIDED".equals(summary.get("path"))
                  && id.equals(summary.get("session_id"))
                  && scenario.testId.equals(summary.get("test_id"))
                  && "user-1".equals(summary.get("principal_id"))
                  && "CSI-123".equals(summary.get("csi_id"))
                  && "fixture".equals(summary.get("environment"))
                  && "PASS".equals(summary.get("secret_id"))
                  && summary.get("execution_id") == null)
          .isTrue();
      assertThat(
              summary.get("coordinate_step_id").equals(STEP_ID)
                  && ((Number) summary.get("coordinate_ordinal")).intValue() == 0
                  && summary.get("source_reference_id").equals("ref-PASS")
                  && summary.get("attempt_id").equals(id + ":1"))
          .isTrue();
      for (String field :
          List.of("outcome", "release_id", "affected_release_id", "release_seq", "vault_version")) {
        assertThat(summary.get(field) == null).as("honest consumed uncertainty").isTrue();
      }
      for (String key : List.of("controller-crash-consume", "controller-crash-terminal-key")) {
        Instant actualLease =
            Instant.parse(
                C.parse(
                        actualJdbc.queryForObject(
                            "SELECT document->'owner' FROM studio_guided_sessions WHERE session_id=?",
                            String.class,
                            id))
                    .path("leaseExpiresAt")
                    .asText());
        String originalRefusal =
            actualLease.isAfter(Instant.now()) ? "UNKNOWN_OUTCOME" : "STALE_FENCE";
        assertThatThrownBy(() -> recovery.dispatch(controller, id, 1, key, fixture.advance()))
            .isInstanceOf(GuidedSessionException.class)
            .hasMessage(originalRefusal);
      }
      assertThat(
              rows.equals(
                  actualJdbc.queryForList(
                      "SELECT * FROM studio_secret_use_audit WHERE session_id=?", id)))
          .isTrue();
      assertThat(scenario.reads.get()).isEqualTo(expectedReads);
      assertThat(scenario.posts.get()).isZero();
      assertThat(Files.readString(scratch.resolve("child.log")).contains(scenario.canary))
          .isFalse();
      reconciled = true;
    } catch (Exception | Error failure) {
      primary = failure;
      throw failure;
    } finally {
      var failures = new java.util.ArrayList<Throwable>();
      if (child != null) {
        Process owned = child;
        attemptGuidedCutCleanup(
            failures,
            () -> {
              boolean interrupted = Thread.interrupted();
              try {
                if (owned.isAlive()) {
                  owned.destroyForcibly();
                }
                while (owned.isAlive()) {
                  try {
                    owned.waitFor();
                  } catch (InterruptedException interruption) {
                    interrupted = true;
                  }
                }
                assertThat(owned.isAlive()).isFalse();
              } finally {
                if (interrupted) {
                  Thread.currentThread().interrupt();
                }
              }
            });
      }
      Scenario scenario = created[0];
      if (scenario != null && !reconciled) {
        attemptGuidedCutCleanup(
            failures,
            () -> {
              var doc =
                  repository.transaction(
                      () -> repository.lock(scenario.sessionId).document().deepCopy());
              if (!Set.of(
                      "CANCELLED",
                      "UNKNOWN_OUTCOME",
                      "FAILED",
                      "EXPIRED",
                      "SUCCEEDED",
                      "PUBLICATION_CONFLICT")
                  .contains(doc.path("state").asText())) {
                boolean notify =
                    actualJdbc.queryForObject(
                        "SELECT EXISTS(SELECT 1 FROM studio_guided_materializations WHERE session_id=?)"
                            + " OR EXISTS(SELECT 1 FROM studio_guided_assignments WHERE session_id=?)",
                        Boolean.class,
                        scenario.sessionId,
                        scenario.sessionId);
                if (notify) {
                  owner.expect(scenario.sessionId);
                }
                if (repository.actions(scenario.sessionId).stream()
                    .anyMatch(action -> action.path("state").asText().equals("DISPATCHING"))) {
                  controllerService[0].lostAcknowledgment(
                      scenario.sessionId,
                      action(scenario.sessionId).path("admission").path("admissionId").asText());
                } else {
                  controllerService[0].cancel(
                      user,
                      scenario.sessionId,
                      UUID.randomUUID().toString(),
                      C.object()
                          .put("schemaVersion", 3)
                          .put("sessionId", scenario.sessionId)
                          .put("reason", "userRequested"));
                }
              }
            });
      }
      attemptGuidedCutCleanup(failures, owner::drainUninterruptibly);
      attemptGuidedCutCleanup(
          failures,
          () -> {
            assertThat(owner.failure.get() == null && owner.guardFailure.get() == null).isTrue();
          });
      attemptGuidedCutCleanup(failures, () -> provider.stop(0));
      attemptGuidedCutCleanup(failures, providerPeers::shutdownNow);
      attemptGuidedCutCleanup(
          failures,
          () -> assertThat(providerPeers.awaitTermination(10, TimeUnit.SECONDS)).isTrue());
      if (failures.isEmpty()) {
        attemptGuidedCutCleanup(
            failures,
            () -> {
              try (var paths = Files.walk(scratch)) {
                for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                  Files.deleteIfExists(path);
                }
              }
            });
      }
      if (!failures.isEmpty()) {
        GUIDED_CUT_CLEANUP_UNCONFIRMED.set(true);
        if (primary != null) {
          failures.forEach(primary::addSuppressed);
        } else {
          Throwable first = failures.getFirst();
          for (int i = 1; i < failures.size(); i++) {
            first.addSuppressed(failures.get(i));
          }
          if (first instanceof Exception failure) {
            throw failure;
          }
          throw (Error) first;
        }
      }
    }
  }

  @FunctionalInterface
  private interface GuidedCutCleanup {
    void run() throws Exception;
  }

  private static void attemptGuidedCutCleanup(List<Throwable> failures, GuidedCutCleanup action) {
    try {
      action.run();
    } catch (Exception | Error failure) {
      failures.add(failure);
    }
  }

  private static final AtomicBoolean GUIDED_CUT_CLEANUP_UNCONFIRMED = new AtomicBoolean();

  private record GuidedControllerCutFixture(
      Scenario scenario,
      GuidedSessionService sessions,
      GuidedDispatchService dispatch,
      ObjectNode context,
      JsonNode admission,
      ObjectNode advance) {}

  private GuidedControllerCutFixture prepareGuidedControllerCut(
      SourceStopOwner owner, Scenario[] created, GuidedSessionService[] controllerService)
      throws Exception {
    return prepareGuidedControllerCut(owner, created, controllerService, access);
  }

  private GuidedControllerCutFixture prepareGuidedControllerCut(
      SourceStopOwner owner,
      Scenario[] created,
      GuidedSessionService[] controllerService,
      FixtureAccess fixtureAccess)
      throws Exception {
    var scenario = new Scenario(Mode.COMPLETE_200_NO_CALLBACK);
    BY_TEST.put(scenario.testId, scenario);
    var steps = C.object().putArray("steps");
    steps.addObject().put("stepId", STEP_ID).put("text", "Enter <secret PASS> as password.");
    var variables = C.object().putArray("variables");
    variables.addObject().put("name", "PASS").put("kind", "secretRef");
    scenario.source = steps;
    scenario.configuration = variables;
    actualJdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by) "
            + "VALUES (?,'fault fixture','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?)",
        scenario.testId,
        steps.toString(),
        variables.toString(),
        EMAIL);
    var sessions = service(repository, materialization, fixtureAccess, 600);
    var client = client();
    var dispatch = new GuidedDispatchService(sessions, materialization, client);
    dispatch.installReferences(
        new VaultStudioReferenceResolver(
            new CountedProvider(),
            (principal, csi, environment, secret) ->
                principal.equals("user-1")
                    && csi.equals("CSI-123")
                    && environment.equals("fixture")
                    && secret.equals("PASS")));
    sessions.installStopSender(
        (contextToStop, reason) -> owner.send(dispatch, contextToStop, reason));
    String id =
        sessions
            .start(
                user,
                UUID.randomUUID().toString(),
                C.object()
                    .put("schemaVersion", 3)
                    .put("testId", scenario.testId.toString())
                    .put("sourceRevision", "source-1")
                    .put("configurationRevision", "config-1")
                    .put("environmentId", "fixture")
                    .put("applicationId", "orders")
                    .set("versions", DOCUMENTS.path("versions")))
            .path("sessionId")
            .asText();
    scenario.sessionId = id;
    created[0] = scenario;
    controllerService[0] = sessions;
    BY_SESSION.put(id, scenario);
    repository.transaction(
        () -> {
          var session = repository.lock(id).document();
          var manifest =
              C.object()
                  .put("testId", scenario.testId.toString())
                  .put("sourceRevision", "source-1")
                  .put("configurationRevision", "config-1")
                  .put("policy", "INPUT-POLICY-01-A");
          manifest.set("sourceSteps", steps);
          manifest
              .putArray("configurationReferences")
              .addObject()
              .put("referenceId", "ref-PASS")
              .put("referenceName", "PASS")
              .put("kind", "secretRef")
              .put("stepId", STEP_ID)
              .put("intendedSlot", "fill.value");
          new GuidedTranslationStore(actualJdbc, C).initialize(session, manifest);
          return null;
        });
    dispatch.assign(controller, id, "assign", "worker-1");
    var references = C.object().putArray("references");
    references.add(DOCUMENTS.path("secretReference"));
    sessions.materialize(controller, id, 1, "materialize", references);
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    ObjectNode observation = DOCUMENTS.path("observation").path("observation").deepCopy();
    observation
        .put("sessionId", id)
        .put("scopeHash", context.path("scopeHash").asText())
        .put("observedAt", Instant.now().toString());
    observation.withObject("/coverage").put("passwordControls", 1);
    var envelope = identity(context);
    envelope.set("observation", observation);
    callback(id, "observations", envelope);
    ObjectNode evidence =
        C.object()
            .put("kind", "observedDocument")
            .put("sessionId", id)
            .put("contextId", context.path("contextId").asText())
            .put("documentId", "document-1")
            .put("generation", 1)
            .put("origin", ORIGIN)
            .put("observationHash", GuidedContracts.hash(observation));
    ObjectNode proposal = DOCUMENTS.path("secretAction").deepCopy();
    proposal
        .put("sessionId", id)
        .put("scopeHash", context.path("scopeHash").asText())
        .put("generation", 1)
        .put("evidenceHash", GuidedContracts.hash(evidence))
        .put("authoredInputsHash", context.path("authoredInputsHash").asText());
    proposal.set("executionEvidence", evidence);
    proposal.withObject("/target").put("documentId", "document-1").put("generation", 1);
    proposal
        .withObject("/operation/value")
        .put(
            "sourceInputId",
            context.path("authoredInputs").path("inputs").get(0).path("inputId").asText());
    JsonNode admission = dispatch.prepareAndAdmit(controller, id, 1, "admit", proposal);
    assertThat(admission.path("dispatchCount").asInt()).isZero();
    assertThat(scenario.reads.get()).isZero();
    assertThat(scenario.names.get()).isGreaterThan(0);
    assertThat(scenario.posts.get()).isZero();
    ObjectNode advance =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("ownerFence", 1)
            .put("admissionId", admission.path("admission").path("admissionId").asText())
            .put("operationHash", admission.path("operationHash").asText());
    return new GuidedControllerCutFixture(
        scenario, sessions, dispatch, context, admission, advance);
  }

  /** Does not access any enclosing fixture static or initialize a second test context/database. */
  public static final class GuidedControllerChild {
    private GuidedControllerChild() {}

    public static void main(String[] args) throws Exception {
      var json = new com.fasterxml.jackson.databind.ObjectMapper();
      JsonNode cfg = json.readTree(Files.readAllBytes(Path.of(args[0])));
      var contracts = new GuidedContracts();
      var source =
          new DriverManagerDataSource(
              cfg.path("url").asText(),
              cfg.path("username").asText(),
              cfg.path("password").asText());
      var jdbc = new JdbcTemplate(source);
      var transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
      var repo = new GuidedSessionRepository(jdbc, transactions, contracts);
      var materializer = new GuidedMaterializationService(jdbc, contracts);
      String testId = cfg.path("testId").asText();
      GuidedSessionAccess childAccess =
          new GuidedSessionAccess() {
            @Override
            public Snapshot resolve(Authentication actor, JsonNode start) {
              throw new GuidedSessionException(
                  "FORBIDDEN_SCOPE", 403); // Child dispatches existing authority only.
            }

            @Override
            public void checkCurrent(JsonNode session) {
              require(
                  session.path("testId").asText().equals(testId)
                      && session.path("sessionId").asText().equals(cfg.path("sessionId").asText())
                      && session.path("scope").path("principalId").asText().equals("user-1")
                      && session.path("scope").path("csiId").asText().equals("CSI-123")
                      && session.path("scope").path("environmentId").asText().equals("fixture")
                      && jdbc.queryForObject(
                              "SELECT count(*) FROM ui_tests WHERE id=? AND csi_id='CSI-123'"
                                  + " AND environment='fixture' AND deleted_at IS NULL",
                              Integer.class,
                              UUID.fromString(testId))
                          == 1,
                  "FORBIDDEN_SCOPE",
                  403);
            }

            @Override
            public void checkSourceCurrent(JsonNode session) {
              checkCurrent(session);
              var row =
                  jdbc.queryForMap(
                      "SELECT steps::text,variables::text FROM ui_tests WHERE id=? FOR SHARE",
                      UUID.fromString(testId));
              require(
                  contracts.parse((String) row.get("steps")).equals(cfg.path("source"))
                      && contracts
                          .parse((String) row.get("variables"))
                          .equals(cfg.path("configuration")),
                  "REVISION_CONFLICT",
                  409);
            }

            @Override
            public void checkUser(Authentication actor, JsonNode session) {
              checkCurrent(session);
              require(
                  actor instanceof BffAuthenticationToken
                      && ((UserIdentity) actor.getPrincipal())
                          .userId()
                          .equals(session.path("scope").path("principalId").asText())
                      && new CsiOwnershipEvaluator().canExecute(actor, "CSI-123"),
                  "FORBIDDEN_SCOPE",
                  403);
            }

            @Override
            public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
              checkSourceCurrent(session);
              JsonNode sourceSteps = cfg.path("source").path("steps");
              require(sourceSteps.isArray() && sourceSteps.size() == 1, "REVISION_CONFLICT", 409);
              JsonNode sourceStep = sourceSteps.get(0);
              require(
                  sourceStep.path("stepId").asText().equals(STEP_ID)
                      && sourceStep
                          .path("text")
                          .asText()
                          .equals("Enter <secret PASS> as password."),
                  "REVISION_CONFLICT",
                  409);
              return new GuidedSourceReferenceValidator.Sources(
                  "source-1",
                  "config-1",
                  Map.of(
                      sourceStep.path("stepId").asText(),
                      new GuidedSourceReferenceValidator.Source(
                          sourceStep.path("text").asText(), List.of())),
                  Map.of(
                      "ref-PASS",
                      new GuidedSourceReferenceValidator.ConfigurationValue(
                          null,
                          sourceStep.path("stepId").asText(),
                          "secretRef",
                          "fill.value",
                          session.path("scopeHash").asText(),
                          false,
                          "PASS")));
            }
          };
      var service =
          new GuidedSessionService(
              repo,
              contracts,
              childAccess,
              new GuidedSessionProperties(true, Map.of("maxSessionSeconds", 600)),
              Clock.systemUTC());
      service.installBridge(
          materializer,
          new GuidedPreparationStore(jdbc, contracts),
          new GuidedBindingStore(jdbc, contracts, materializer),
          new GuidedAssignmentStore(jdbc, contracts));
      service.installSecretAudit(new SecretAuditLifecycle(jdbc, new SecretUseAuditRecorder(jdbc)));
      // STUDIO-OBS-014 S3: every start needs an approved governed policy for its scope.
      com.citi.put.checks.studio.support.ObservedPublicationFixture.installGovernance(
          service, jdbc, "CSI-123", "orders", "fixture", java.util.List.of(ORIGIN), null);
      KeyStore keys = KeyStore.getInstance("PKCS12");
      try (var input = Files.newInputStream(Path.of(cfg.path("tlsKeyStore").asText()))) {
        keys.load(input, "fixture".toCharArray());
      }
      var km = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
      km.init(keys, "fixture".toCharArray());
      KeyStore trust = KeyStore.getInstance("PKCS12");
      try (var input = Files.newInputStream(Path.of(cfg.path("tlsTrustStore").asText()))) {
        trust.load(input, "fixture".toCharArray());
      }
      var tm = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      tm.init(trust);
      SSLContext tls = SSLContext.getInstance("TLS");
      tls.init(km.getKeyManagers(), tm.getTrustManagers(), new SecureRandom());
      var receiver =
          new GuidedRunnerClient(
              URI.create(cfg.path("runner").asText()),
              tls,
              () -> cfg.path("runnerToken").asText(),
              contracts);
      var dispatch = new GuidedDispatchService(service, materializer, receiver);
      var provider =
          new com.citi.put.checks.studio.guided.publication.ObservedResolverProcessCrashIT
              .FixtureProvider(
              URI.create(cfg.path("provider").asText()),
              Path.of(cfg.path("stage").asText()),
              com.citi.put.checks.studio.guided.publication.ObservedResolverProcessCrashIT.Cut
                  .READ_BEFORE_DECISION);
      var originalResolver =
          new VaultStudioReferenceResolver(
              provider,
              (principal, csi, environment, secret) ->
                  principal.equals("user-1")
                      && csi.equals("CSI-123")
                      && environment.equals("fixture")
                      && secret.equals("PASS"));
      if (cfg.path("beforeResolve").asBoolean()) {
        dispatch.installReferences(
            new com.citi.put.checks.studio.dispatch.StudioReferenceResolver() {
              @Override
              public void preflight(
                  String csi,
                  String environment,
                  UUID test,
                  String principal,
                  com.citi.put.checks.studio.dispatch.ReferenceDeclarations declarations) {
                originalResolver.preflight(csi, environment, test, principal, declarations);
              }

              @Override
              public Resolved resolve(
                  String csi,
                  String environment,
                  UUID test,
                  String principal,
                  com.citi.put.checks.studio.dispatch.ReferenceDeclarations declarations) {
                require(
                    csi.equals("CSI-123")
                        && environment.equals("fixture")
                        && test.toString().equals(cfg.path("testId").asText())
                        && principal.equals("user-1")
                        && declarations.variables().isEmpty()
                        && declarations.secrets().equals(List.of("PASS")),
                    "FORBIDDEN_SCOPE",
                    403);
                // The genuine service consume has committed. The original value resolver/provider
                // has not been entered; the parent verifies that cut independently from PostgreSQL.
                com.citi.put.checks.studio.guided.publication.ObservedResolverProcessCrashIT
                    .pauseGuidedBeforeResolution(Path.of(cfg.path("stage").asText()));
                return originalResolver.resolve(csi, environment, test, principal, declarations);
              }
            });
      } else {
        dispatch.installReferences(originalResolver);
      }
      dispatch.dispatch(
          new GuidedInternalSecurity.Identity("controller-1", "backend-controller"),
          cfg.path("sessionId").asText(),
          1,
          cfg.path("consumeKey").asText(),
          cfg.path("advance"));
      throw new AssertionError("Owned controller cut unexpectedly returned");
    }
  }

  private static final class SourceStopOwner {
    private static final ThreadLocal<SourceStopOwner> CONFIRMATION = new ThreadLocal<>();
    final DataSource source;
    final AtomicInteger initiated = new AtomicInteger(), finished = new AtomicInteger();
    final AtomicInteger confirmationCalls = new AtomicInteger(), drains = new AtomicInteger();
    final AtomicReference<Throwable> failure = new AtomicReference<>(),
        guardFailure = new AtomicReference<>();
    // STUDIO-OBS-015 H8: an uncertain stop is re-sent at most twice at once; each refused send
    // finishes one reservation, and the latches settle only after every permitted send.
    final int sends;
    final CountDownLatch completed, settled;
    final AtomicInteger senderReservations = new AtomicInteger();
    final OperationGate confirmationGate = new OperationGate();
    volatile boolean gateConfirmation;
    volatile boolean expected;
    volatile String sessionId;
    volatile Thread executingThread;

    SourceStopOwner(DataSource source) {
      this(source, 1);
    }

    SourceStopOwner(DataSource source, int sends) {
      this.source = source;
      this.sends = sends;
      this.completed = new CountDownLatch(sends);
      this.settled = new CountDownLatch(sends);
      STOP_OWNERS.add(this);
    }

    synchronized void expect(String id) {
      if (expected) {
        assertThat(sessionId).isEqualTo(id);
        return;
      }
      sessionId = id;
      expected = true;
    }

    void rejectGuard(Throwable problem) {
      guardFailure.compareAndSet(null, problem);
      // Rejection is observable failure, never genuine original-operation completion.
      while (settled.getCount() > 0) {
        settled.countDown();
      }
    }

    void send(GuidedDispatchService sender, ObjectNode context, String reason) {
      try {
        assertThat(expected).as("actual stop must have a preregistered owner").isTrue();
        assertThat(context.path("sessionId").asText()).isEqualTo(sessionId);
        assertThat(CONFIRMATION.get()).isNull();
        assertThat(senderReservations.incrementAndGet()).isLessThanOrEqualTo(sends);
      } catch (RuntimeException | Error problem) {
        rejectGuard(problem);
        throw problem;
      }
      boolean confirmationExpected = false;
      executingThread = Thread.currentThread();
      try {
        // No guard/count rejection intervenes between this original-call entry and forwarding.
        initiated.incrementAndGet();
        sender.stop(context, reason);
        CONFIRMATION.set(this);
        confirmationExpected = true;
      } catch (RuntimeException | Error problem) {
        failure.compareAndSet(null, problem);
        CONFIRMATION.remove();
        throw problem;
      } finally {
        finished.incrementAndGet();
        if (!confirmationExpected) {
          completed.countDown();
          settled.countDown();
        }
      }
    }

    boolean operationsComplete() {
      return guardFailure.get() == null && (!expected || completed.getCount() == 0);
    }

    void observeCompletion() throws InterruptedException {
      completed.await();
    }

    void drainUninterruptibly() {
      if (!expected && guardFailure.get() == null) {
        return;
      }
      drains.incrementAndGet();
      boolean interrupted = Thread.interrupted();
      try {
        while (true) {
          try {
            settled.await();
            Throwable rejected = guardFailure.get();
            if (rejected != null) {
              // The real-completion latch remains pending for rejected/unstarted work.
              // Refuse proxy/context destruction rather than assert that ownership was drained.
              // A fresh guard diagnostic preserves the cause without try-with-resources
              // attempting to self-suppress the same rejected Throwable during close.
              throw new AssertionError(
                  "Rejected/unstarted stop ownership cannot establish actual completion", rejected);
            }
            assertThat(completed.getCount()).isZero();
            return;
          } catch (InterruptedException interruption) {
            interrupted = true;
          }
        }
      } finally {
        if (interrupted) {
          Thread.currentThread().interrupt();
        }
      }
    }
  }

  private static final class TrackingTransactionTemplate extends TransactionTemplate {
    private final DataSource source;

    TrackingTransactionTemplate(DataSource source) {
      super(new DataSourceTransactionManager(source));
      this.source = source;
    }

    @Override
    public <T> T execute(TransactionCallback<T> callback) {
      SourceStopOwner owner = SourceStopOwner.CONFIRMATION.get();
      if (owner == null) {
        return super.execute(callback);
      }
      try {
        assertThat(owner.source).isSameAs(source);
        assertThat(owner.executingThread).isSameAs(Thread.currentThread());
        assertThat(owner.finished.get()).isEqualTo(1);
        assertThat(owner.confirmationCalls.get()).isZero();
      } catch (RuntimeException | Error problem) {
        SourceStopOwner.CONFIRMATION.remove();
        owner.rejectGuard(problem);
        throw problem;
      }
      if (owner.gateConfirmation) {
        owner.confirmationGate.hold();
      }
      try {
        // Original callback, manager/source, actual commit/resource cleanup, exactly once.
        owner.confirmationCalls.incrementAndGet();
        return super.execute(callback);
      } catch (RuntimeException | Error failure) {
        owner.failure.compareAndSet(null, failure);
        throw failure;
      } finally {
        SourceStopOwner.CONFIRMATION.remove();
        owner.completed.countDown();
        owner.settled.countDown();
      }
    }
  }

  private static final class OperationGate {
    final CountDownLatch entered = new CountDownLatch(1), released = new CountDownLatch(1);

    void hold() {
      entered.countDown();
      boolean interrupted = Thread.interrupted();
      try {
        while (true) {
          try {
            released.await();
            return;
          } catch (InterruptedException interruption) {
            interrupted = true;
          }
        }
      } finally {
        if (interrupted) {
          Thread.currentThread().interrupt();
        }
      }
    }

    void release() {
      released.countDown();
    }
  }

  enum StopControl {
    OBSERVATION_FAILURE,
    OBSERVATION_INTERRUPT,
    SENDER_REFUSAL,
    CONFIRMATION_REFUSAL
  }

  @Test
  void actualStopOwnershipDrainsObservationFailureBeforePrivateRouteClose() throws Exception {
    actualStopControl(StopControl.OBSERVATION_FAILURE);
  }

  @Test
  void actualStopOwnershipDrainsObservationInterruptBeforePrivateRouteClose() throws Exception {
    actualStopControl(StopControl.OBSERVATION_INTERRUPT);
  }

  @Test
  void actualStopOwnershipRecordsRealSenderRefusalWithoutConfirmation() throws Exception {
    actualStopControl(StopControl.SENDER_REFUSAL);
  }

  @Test
  void actualStopOwnershipRecordsRealConfirmationRefusalBeforePrivateRouteClose() throws Exception {
    actualStopControl(StopControl.CONFIRMATION_REFUSAL);
  }

  private void actualStopControl(StopControl control) throws Exception {
    boolean priorInterrupt = Thread.interrupted();
    try (var route = new PrivatePgRoute(DATABASE.getHost(), DATABASE.getMappedPort(5432))) {
      var source =
          new DriverManagerDataSource(
              "jdbc:postgresql://127.0.0.1:"
                  + route.port()
                  + "/"
                  + DATABASE.getDatabaseName()
                  + "?loggerLevel=OFF",
              DATABASE.getUsername(),
              DATABASE.getPassword());
      var jdbc = new JdbcTemplate(source);
      // STUDIO-OBS-015 H8: a refused stop is UNKNOWN_OUTCOME and is re-sent twice at once.
      int sends = control == StopControl.SENDER_REFUSAL ? 3 : 1;
      var owner = new SourceStopOwner(source, sends);
      route.attach(owner);
      var repository =
          new GuidedSessionRepository(jdbc, new TrackingTransactionTemplate(source), C);
      var materializer = new GuidedMaterializationService(jdbc, C);
      var sessions = service(jdbc, repository, materializer, new FixtureAccess(jdbc), 600);
      var dispatch = new GuidedDispatchService(sessions, materializer, client());
      dispatch.installReferences(
          new VaultStudioReferenceResolver(
              new CountedProvider(),
              (principal, csi, environment, secret) ->
                  principal.equals("user-1")
                      && csi.equals("CSI-123")
                      && environment.equals("fixture")
                      && secret.equals("PASS")));
      sessions.installStopSender((context, reason) -> owner.send(dispatch, context, reason));
      Scenario scenario = null;
      Throwable primary = null, assertedRefusal = null;
      Thread interruptObserver = null;
      var observerFailure = new AtomicReference<Throwable>();
      var observerRestoredInterrupt = new AtomicBoolean();
      var observationRecorded = new CountDownLatch(1);
      try {
        scenario = materializedStopScenario(sessions, dispatch, repository, jdbc);
        scenario.stopGate = new OperationGate();
        scenario.stopStatus = control == StopControl.SENDER_REFUSAL ? 503 : 200;
        owner.gateConfirmation = control == StopControl.CONFIRMATION_REFUSAL;
        owner.expect(scenario.sessionId);
        sessions.cancel(
            user,
            scenario.sessionId,
            "controlled-user-cancel",
            C.object().put("schemaVersion", 3).put("reason", "userRequested"));
        assertThat(scenario.stopGate.entered.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(owner.operationsComplete()).isFalse();
        assertThat(route.closed).isFalse();
        assertThat(scenario.stops.get()).isEqualTo(1);
        assertThat(scenario.reads.get()).isZero();
        assertThat(scenario.posts.get()).isZero();
        Throwable observation = null;
        if (control == StopControl.OBSERVATION_FAILURE) {
          observation =
              org.assertj.core.api.Assertions.catchThrowable(
                  () ->
                      assertThat(owner.operationsComplete())
                          .as("unfinished genuine stop observation")
                          .isTrue());
          assertThat(observation)
              .isInstanceOf(AssertionError.class)
              .hasMessageContaining("unfinished genuine stop observation");
        } else if (control == StopControl.OBSERVATION_INTERRUPT) {
          // The deliberately interrupted observation has its own actual thread ownership.
          // External interruptions of the test/cleanup thread are never confused with it.
          interruptObserver =
              Thread.ofVirtual()
                  .start(
                      () -> {
                        try {
                          Thread.currentThread().interrupt();
                          Throwable interruptedObservation =
                              org.assertj.core.api.Assertions.catchThrowable(
                                  owner::observeCompletion);
                          assertThat(interruptedObservation)
                              .isInstanceOf(InterruptedException.class);
                          Thread.currentThread().interrupt();
                          observationRecorded.countDown();
                          owner.drainUninterruptibly();
                          observerRestoredInterrupt.set(Thread.currentThread().isInterrupted());
                        } catch (Throwable problem) {
                          observerFailure.set(problem);
                          if (problem instanceof InterruptedException) {
                            Thread.currentThread().interrupt();
                          }
                        } finally {
                          observationRecorded.countDown();
                        }
                      });
          assertThat(observationRecorded.await(5, TimeUnit.SECONDS)).isTrue();
        }
        scenario.stopGate.release();
        if (control == StopControl.CONFIRMATION_REFUSAL) {
          assertThat(owner.confirmationGate.entered.await(5, TimeUnit.SECONDS)).isTrue();
          assertThat(owner.operationsComplete()).isFalse();
          route.unavailable();
          assertThat(actualJdbc.queryForObject("SELECT 1", Integer.class)).isEqualTo(1);
          owner.confirmationGate.release();
        }
        // Drain independently of either intentionally failed observation.
        owner.drainUninterruptibly();
        if (control == StopControl.OBSERVATION_INTERRUPT) {
          joinUninterruptibly(interruptObserver);
          assertThat(observerFailure.get()).isNull();
          assertThat(observerRestoredInterrupt.get())
              .as("owned observation drain restores its actual thread's interrupt at exit")
              .isTrue();
        }
        assertThat(owner.drains.get()).isGreaterThan(0);
        assertThat(owner.initiated.get()).isEqualTo(sends);
        assertThat(owner.finished.get()).isEqualTo(sends);
        assertThat(owner.operationsComplete()).isTrue();
        assertThat(route.closed).as("actual operations finish before route destruction").isFalse();
        if (control == StopControl.SENDER_REFUSAL) {
          assertThat(owner.failure.get())
              .isInstanceOf(GuidedSessionException.class)
              .hasMessage("UNKNOWN_OUTCOME");
          assertThat(((GuidedSessionException) owner.failure.get()).status()).isEqualTo(409);
          assertThat(owner.confirmationCalls.get()).isZero();
          assertUnconfirmedClosedMaterialization(scenario.sessionId);
          assertedRefusal = owner.failure.get();
        } else if (control == StopControl.CONFIRMATION_REFUSAL) {
          assertThat(owner.failure.get())
              .isInstanceOf(org.springframework.transaction.CannotCreateTransactionException.class);
          assertThat(postgresFailure(owner.failure.get()).getSQLState()).startsWith("08");
          assertThat(owner.confirmationCalls.get()).isEqualTo(1);
          assertUnconfirmedClosedMaterialization(scenario.sessionId);
          route.reopen();
          assertThat(jdbc.queryForObject("SELECT 1", Integer.class)).isEqualTo(1);
          assertedRefusal = owner.failure.get();
        } else {
          assertThat(owner.failure.get()).isNull();
          assertThat(owner.confirmationCalls.get()).isEqualTo(1);
          awaitActualStop(route, scenario, owner);
        }
        assertThat(scenario.peerFailure.get()).isNull();
        assertThat(scenario.stops.get()).isEqualTo(sends);
        assertThat(scenario.reads.get()).isZero();
        assertThat(scenario.posts.get()).isZero();
      } catch (Exception | Error failure) {
        primary = failure;
        if (failure instanceof InterruptedException) {
          Thread.currentThread().interrupt();
        }
        throw failure;
      } finally {
        var cleanupFailures = new java.util.ArrayList<Throwable>();
        if (scenario != null && scenario.stopGate != null) {
          scenario.stopGate.release();
        }
        owner.confirmationGate.release();
        // No timeout/observation failure is a substitute for real operation completion.
        try {
          owner.drainUninterruptibly();
        } catch (RuntimeException | Error cleanup) {
          cleanupFailures.add(cleanup);
        }
        joinUninterruptibly(interruptObserver);
        if (owner.failure.get() != null && owner.failure.get() != assertedRefusal) {
          cleanupFailures.add(owner.failure.get());
        }
        if (owner.guardFailure.get() != null) {
          cleanupFailures.add(owner.guardFailure.get());
        }
        if (observerFailure.get() != null) {
          cleanupFailures.add(observerFailure.get());
        }
        try {
          route.reopen();
        } catch (Exception | Error cleanup) {
          cleanupFailures.add(cleanup);
        }
        if (primary != null) {
          for (Throwable cleanup : cleanupFailures) {
            addSuppressedDistinct(primary, cleanup);
          }
        } else if (!cleanupFailures.isEmpty()) {
          Throwable first = cleanupFailures.getFirst();
          for (int i = 1; i < cleanupFailures.size(); i++) {
            addSuppressedDistinct(first, cleanupFailures.get(i));
          }
          if (first instanceof Exception problem) {
            throw problem;
          }
          if (first instanceof Error problem) {
            throw problem;
          }
          throw new AssertionError(first);
        }
      }
    } finally {
      // Keep any newly restored/external interrupt; never reset to only the entry snapshot.
      if (priorInterrupt) {
        Thread.currentThread().interrupt();
      }
    }
  }

  // STUDIO-OBS-015 H8 (aria-h8-h6-ruling01 H8.5): durable, idempotent teardown re-drive. The stub
  // sender answers only for its own session; every other session's stop is refused unsent, so a
  // sweep over this class's shared database never acts on another case's rows.

  private static final Duration TEARDOWN_WINDOW = Duration.ofMinutes(15);
  private static final Duration ABANDONED_WARN_INTERVAL = Duration.ofMinutes(15);

  @Test
  void expiredTeardownConfirmsOnImmediateResendAfterAckTimeout() throws Exception {
    var clock = new OffsetClock();
    var stub =
        new TeardownStub(
            ordinal -> ordinal == 1 ? new GuidedSessionException("UNKNOWN_OUTCOME", 409) : null);
    var sessions = teardownService(clock, stub);
    String id = assignedExpiringSession(sessions, stub);
    var before = new AtomicReference<List<String>>();
    stub.onEntry =
        ordinal -> {
          if (ordinal == 1) {
            before.set(teardownInvariants(id));
          }
        };

    clock.advance(Duration.ofSeconds(31));
    sessions.expire();

    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(stub.calls).hasSize(2).containsOnly(stub.calls.getFirst());
    assertThat(stub.calls.getFirst())
        .isEqualTo(new GuidedAssignmentStore(actualJdbc, C).find(id) + "|EXPIRED");
    assertThat(teardownProgress(id).has("teardownRequest")).isFalse();
    assertThat(teardownState(id)).isEqualTo("EXPIRED");
    assertThat(teardownInvariants(id)).isEqualTo(before.get());
  }

  @Test
  void expiredTeardownConfirmsOnSweepAfterResendsExhausted() throws Exception {
    var clock = new OffsetClock();
    var stub =
        new TeardownStub(
            ordinal -> ordinal <= 3 ? new GuidedSessionException("UNKNOWN_OUTCOME", 409) : null);
    var sessions = teardownService(clock, stub);
    String id = assignedExpiringSession(sessions, stub);

    clock.advance(Duration.ofSeconds(31));
    sessions.expire();

    awaitTeardown(() -> stub.calls.size() == 3 && !sessions.teardownInFlight(id));
    JsonNode pending = teardownProgress(id);
    assertThat(pending.path("teardownStatus").asText()).isEqualTo("PENDING");
    assertThat(pending.path("teardownRequest").path("reason").asText()).isEqualTo("EXPIRED");
    assertThat(pending.path("teardownRequest").path("target"))
        .isEqualTo(new GuidedAssignmentStore(actualJdbc, C).find(id));
    var before = teardownInvariants(id);

    sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);

    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(stub.calls).hasSize(4).containsOnly(stub.calls.getFirst());
    assertThat(teardownProgress(id).has("teardownRequest")).isFalse();
    assertThat(teardownState(id)).isEqualTo("EXPIRED");
    assertThat(teardownInvariants(id)).isEqualTo(before);
  }

  @Test
  void teardownWithoutAckNeverConfirmsAndStopsAfterWindow() throws Exception {
    var clock = new OffsetClock();
    var stub = new TeardownStub(ordinal -> new GuidedSessionException("UNKNOWN_OUTCOME", 409));
    var sessions = teardownService(clock, stub);
    String id = assignedExpiringSession(sessions, stub);
    JsonNode assignment = new GuidedAssignmentStore(actualJdbc, C).find(id);

    clock.advance(Duration.ofSeconds(31));
    sessions.expire();
    awaitTeardown(() -> stub.calls.size() == 3 && !sessions.teardownInFlight(id));
    sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);
    awaitTeardown(() -> stub.calls.size() == 6 && !sessions.teardownInFlight(id));
    var before = teardownInvariants(id);

    clock.advance(TEARDOWN_WINDOW.plusMinutes(1));
    var appender =
        new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
    appender.start();
    var logger =
        (ch.qos.logback.classic.Logger)
            org.slf4j.LoggerFactory.getLogger(GuidedSessionService.class);
    logger.addAppender(appender);
    try {
      sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);
      sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);
      Thread.sleep(300);
      assertThat(warnings(appender)).as("the re-drive sweep itself never warns").isEmpty();
      sessions.reportAbandonedTeardowns(TEARDOWN_WINDOW, ABANDONED_WARN_INTERVAL);
      sessions.reportAbandonedTeardowns(TEARDOWN_WINDOW, ABANDONED_WARN_INTERVAL);
      clock.advance(ABANDONED_WARN_INTERVAL.minusSeconds(5));
      sessions.reportAbandonedTeardowns(TEARDOWN_WINDOW, ABANDONED_WARN_INTERVAL);
      assertThat(warnings(appender)).as("one count-only warning per interval").hasSize(1);
      clock.advance(Duration.ofSeconds(5));
      sessions.reportAbandonedTeardowns(TEARDOWN_WINDOW, ABANDONED_WARN_INTERVAL);
    } finally {
      logger.detachAppender(appender);
    }

    assertThat(stub.calls).hasSize(6);
    assertThat(sessions.teardownInFlight(id)).isFalse();
    JsonNode progress = teardownProgress(id);
    assertThat(progress.path("teardownStatus").asText()).isEqualTo("PENDING");
    assertThat(progress.has("teardownRequest")).isTrue();
    assertThat(teardownState(id)).isEqualTo("EXPIRED");
    assertThat(teardownInvariants(id)).isEqualTo(before);
    var warnings = warnings(appender);
    assertThat(warnings).as("re-asserted once the interval elapses").hasSize(2);
    for (var warning : warnings) {
      assertThat(warning.getArgumentArray()).hasSize(1);
      assertThat(warning.getArgumentArray()[0]).isInstanceOf(Integer.class);
      assertThat((Integer) warning.getArgumentArray()[0]).isGreaterThanOrEqualTo(1);
      assertThat(warning.getFormattedMessage())
          .doesNotContain(id)
          .doesNotContain(assignment.path("assignmentId").asText())
          .doesNotContain("worker-1");
    }
  }

  @Test
  void abandonedTeardownReportQueriesOncePerIntervalAndIsSilentWhenNone() throws Exception {
    var clock = new OffsetClock();
    var spied = org.mockito.Mockito.spy(repository);
    var sessions = service(actualJdbc, spied, materialization, access, 30, clock);
    sessions.installStopSender(new TeardownStub(ordinal -> null));
    org.mockito.Mockito.clearInvocations(spied);
    Duration none = Duration.ofDays(36500); // no row expired a century ago: count is 0
    var appender =
        new ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent>();
    appender.start();
    var logger =
        (ch.qos.logback.classic.Logger)
            org.slf4j.LoggerFactory.getLogger(GuidedSessionService.class);
    logger.addAppender(appender);
    try {
      sessions.reportAbandonedTeardowns(none, ABANDONED_WARN_INTERVAL);
      sessions.reportAbandonedTeardowns(none, ABANDONED_WARN_INTERVAL);
      verify(spied, times(1)).abandonedTeardowns(any(), eq(none));
      clock.advance(ABANDONED_WARN_INTERVAL);
      sessions.reportAbandonedTeardowns(none, ABANDONED_WARN_INTERVAL);
      verify(spied, times(2)).abandonedTeardowns(any(), eq(none));
      verifyNoMoreInteractions(spied); // no other repository call, hence no write
    } finally {
      logger.detachAppender(appender);
    }

    assertThat(warnings(appender)).as("silent when nothing is abandoned").isEmpty();
  }

  private static List<ch.qos.logback.classic.spi.ILoggingEvent> warnings(
      ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender) {
    return appender.list.stream()
        .filter(event -> event.getLevel() == ch.qos.logback.classic.Level.WARN)
        .toList();
  }

  @Test
  void concurrentAfterCompletionAndSweepSendOneStopAtATime() throws Exception {
    var clock = new OffsetClock();
    var stub = new TeardownStub(ordinal -> null);
    var sessions = teardownService(clock, stub);
    String id = assignedExpiringSession(sessions, stub);
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    stub.onEntry =
        ordinal -> {
          if (ordinal == 1) {
            entered.countDown();
            try {
              assertThat(release.await(20, TimeUnit.SECONDS)).isTrue();
            } catch (InterruptedException interrupted) {
              Thread.currentThread().interrupt();
              throw new IllegalStateException(interrupted);
            }
          }
        };

    clock.advance(Duration.ofSeconds(31));
    sessions.expire();
    assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
    try {
      sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);
      Thread.sleep(300);
      assertThat(stub.calls).hasSize(1);
      assertThat(sessions.teardownInFlight(id)).isTrue();
      assertThat(teardownProgress(id).path("teardownStatus").asText()).isEqualTo("PENDING");
    } finally {
      release.countDown();
    }

    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);
    Thread.sleep(300);
    assertThat(stub.calls).hasSize(1);
    assertThat(stub.maxActive.get()).isEqualTo(1);
    assertThat(teardownProgress(id).has("teardownRequest")).isFalse();
  }

  @Test
  void legacyPendingWithoutRequestIsNotRedriven() throws Exception {
    var clock = new OffsetClock();
    // A definite refusal is not uncertain: no immediate re-send.
    var stub = new TeardownStub(ordinal -> new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409));
    var sessions = teardownService(clock, stub);
    String id = assignedExpiringSession(sessions, stub);

    clock.advance(Duration.ofSeconds(31));
    sessions.expire();
    awaitTeardown(() -> stub.calls.size() == 1 && !sessions.teardownInFlight(id));
    // A row written before H8 carries PENDING without the durable request.
    assertThat(
            actualJdbc.update(
                "UPDATE studio_guided_sessions SET progress=progress-'teardownRequest'"
                    + " WHERE session_id=?",
                id))
        .isEqualTo(1);

    sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);
    Thread.sleep(300);

    assertThat(stub.calls).hasSize(1);
    assertThat(teardownProgress(id).path("teardownStatus").asText()).isEqualTo("PENDING");
    assertThat(teardownProgress(id).has("teardownRequest")).isFalse();
  }

  // STUDIO-OBS-015 aria-conflict-stop-ruling01: the transaction that writes PUBLICATION_CONFLICT
  // requests the one monotone teardown (H8), exactly like SUCCEEDED.

  /** The rows conflictBeforeClaim leaves: FINALIZING, then PUBLICATION_CONFLICT plus the hook. */
  private void conflictThenHook(GuidedSessionService sessions, String id) {
    repository.transaction(
        () -> {
          var session = repository.lock(id);
          session.document().put("state", "FINALIZING");
          repository.save(session);
          return null;
        });
    repository.transaction(
        () -> {
          var session = repository.lock(id);
          session.document().put("state", "PUBLICATION_CONFLICT");
          session.progress().put("errorCode", "PUBLICATION_CONFLICT");
          repository.save(session);
          sessions.publicationConflicted(id);
          return null;
        });
  }

  @Test
  void publicationConflictTeardownTargetsTheAssignmentAndConfirms() throws Exception {
    var clock = new OffsetClock();
    var stub = new TeardownStub(ordinal -> null);
    var sessions = teardownService(clock, stub);
    String id = assignedExpiringSession(sessions, stub);
    JsonNode assignment = new GuidedAssignmentStore(actualJdbc, C).find(id);

    conflictThenHook(sessions, id);

    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(stub.calls).containsExactly(assignment + "|UNKNOWN_OUTCOME");
    assertThat(teardownProgress(id).has("teardownRequest")).isFalse();
    assertThat(teardownProgress(id).path("errorCode").asText()).isEqualTo("PUBLICATION_CONFLICT");
    assertThat(teardownState(id)).isEqualTo("PUBLICATION_CONFLICT");
    assertThat(
            actualJdbc.queryForObject(
                "SELECT live FROM studio_guided_assignments WHERE session_id=?", Boolean.class, id))
        .isFalse();
  }

  @Test
  void publicationConflictedIsIdempotentAndFailsClosed() throws Exception {
    var clock = new OffsetClock();
    var stub = new TeardownStub(ordinal -> null);
    var sessions = teardownService(clock, stub);
    String id = assignedExpiringSession(sessions, stub);
    conflictThenHook(sessions, id);
    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    String progress = teardownProgress(id).toString();

    repository.transaction(
        () -> {
          sessions.publicationConflicted(id);
          return null;
        });
    Thread.sleep(300);
    assertThat(stub.calls).hasSize(1);
    assertThat(teardownProgress(id).toString()).isEqualTo(progress);

    assertThatThrownBy(() -> sessions.publicationConflicted(id))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("RUNTIME_INCOMPATIBLE");

    var cancelledStub = new TeardownStub(ordinal -> null);
    var cancelledSessions = teardownService(clock, cancelledStub);
    String cancelled = assignedExpiringSession(cancelledSessions, cancelledStub);
    cancelledSessions.cancel(
        user,
        cancelled,
        UUID.randomUUID().toString(),
        C.object().put("schemaVersion", 3).put("reason", "userRequested"));
    awaitTeardown(
        () -> teardownProgress(cancelled).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(cancelledStub.calls).hasSize(1);
    assertThat(cancelledStub.calls.getFirst()).endsWith("|CANCELLED");

    assertThatThrownBy(
            () ->
                repository.transaction(
                    () -> {
                      cancelledSessions.publicationConflicted(cancelled);
                      return null;
                    }))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("PUBLICATION_CONFLICT");
    Thread.sleep(300);
    assertThat(teardownState(cancelled)).isEqualTo("CANCELLED");
    assertThat(cancelledStub.calls).hasSize(1);
  }

  @Test
  void publicationConflictTeardownIsRedrivenAfterResendsExhausted() throws Exception {
    var clock = new OffsetClock();
    var stub =
        new TeardownStub(
            ordinal -> ordinal <= 3 ? new GuidedSessionException("UNKNOWN_OUTCOME", 409) : null);
    var sessions = teardownService(clock, stub);
    String id = assignedExpiringSession(sessions, stub);
    JsonNode assignment = new GuidedAssignmentStore(actualJdbc, C).find(id);

    conflictThenHook(sessions, id);

    awaitTeardown(() -> stub.calls.size() == 3 && !sessions.teardownInFlight(id));
    JsonNode pending = teardownProgress(id);
    assertThat(pending.path("teardownStatus").asText()).isEqualTo("PENDING");
    assertThat(pending.path("teardownRequest").path("reason").asText())
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThat(pending.path("teardownRequest").path("target")).isEqualTo(assignment);
    var before = teardownInvariants(id);

    sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);

    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(stub.calls).hasSize(4).containsOnly(assignment + "|UNKNOWN_OUTCOME");
    assertThat(teardownState(id)).isEqualTo("PUBLICATION_CONFLICT");
    assertThat(teardownInvariants(id)).isEqualTo(before);
  }

  @Test
  void pendingAppendPublicationConflictTargetsTheAssignment() throws Exception {
    var clock = new OffsetClock();
    var stub =
        new TeardownStub(
            ordinal -> ordinal <= 3 ? new GuidedSessionException("UNKNOWN_OUTCOME", 409) : null);
    var sessions = translationTeardownService(clock, stub);
    String id = materializedTeardownSession(sessions, stub);
    appendPendingDelivery(sessions, id);
    JsonNode assignment = new GuidedAssignmentStore(actualJdbc, C).find(id);

    conflictThenHook(sessions, id);

    awaitTeardown(() -> stub.calls.size() == 3 && !sessions.teardownInFlight(id));
    JsonNode pending = teardownProgress(id);
    assertThat(pending.path("teardownStatus").asText()).isEqualTo("PENDING");
    assertThat(pending.path("teardownRequest").path("target")).isEqualTo(assignment);
    assertThat(pending.path("teardownRequest").path("target").has("assignmentId")).isTrue();
    assertThat(pending.path("teardownRequest").path("target").has("contextRevision")).isFalse();
    assertThat(teardownState(id)).isEqualTo("PUBLICATION_CONFLICT");
    assertThat(
            actualJdbc.queryForObject(
                "SELECT status||'|'||(ack IS NULL) FROM studio_guided_materialization_deliveries"
                    + " WHERE session_id=? AND context_revision=2",
                String.class,
                id))
        .isEqualTo("PENDING|true");
  }

  @Test
  void stopWithoutAStopTargetRecordsNoPendingTeardown() throws Exception {
    var clock = new OffsetClock();
    var stub = new TeardownStub(ordinal -> null);
    var spied = org.mockito.Mockito.spy(materialization);
    var sessions = service(actualJdbc, repository, spied, access, 30, clock);
    sessions.installStopSender(stub);
    String id = assignedExpiringSession(sessions, stub);
    // A stored context from which no stop identity can be formed: no assignmentId, identity fails.
    org.mockito.Mockito.doReturn(C.object().put("sessionId", id))
        .when(spied)
        .context(any(JsonNode.class));
    org.mockito.Mockito.doThrow(new IllegalStateException("NO_IDENTITY"))
        .when(spied)
        .identity(any(JsonNode.class));

    clock.advance(Duration.ofSeconds(31));
    sessions.expire();

    assertThat(teardownState(id)).isEqualTo("EXPIRED");
    JsonNode progress = teardownProgress(id);
    assertThat(progress.has("teardownStatus")).as("no PENDING without a request").isFalse();
    assertThat(progress.has("teardownRequest")).isFalse();
    Thread.sleep(300);
    assertThat(stub.calls).isEmpty();
  }

  // STUDIO-OBS-015 B2B-01 P3 (aria-append-ruling01): while an append delivery is PENDING the runner
  // holds v(n-1) or, if only the ACK was lost, v(n); the durable stop target is the assignment.

  @Test
  void pendingAppendDeliveryTeardownTargetsTheAssignment() throws Exception {
    var clock = new OffsetClock();
    var stub =
        new TeardownStub(
            ordinal -> ordinal <= 3 ? new GuidedSessionException("UNKNOWN_OUTCOME", 409) : null);
    var sessions = translationTeardownService(clock, stub);
    String id = materializedTeardownSession(sessions, stub);
    appendPendingDelivery(sessions, id);
    JsonNode assignment = new GuidedAssignmentStore(actualJdbc, C).find(id);

    sessions.failTranslation(controller, id, 1, "RUNTIME_INCOMPATIBLE");

    awaitTeardown(() -> stub.calls.size() == 3 && !sessions.teardownInFlight(id));
    JsonNode pending = teardownProgress(id);
    assertThat(pending.path("teardownStatus").asText()).isEqualTo("PENDING");
    assertThat(pending.path("teardownRequest").path("target")).isEqualTo(assignment);
    assertThat(pending.path("teardownRequest").path("target").has("assignmentId")).isTrue();
    assertThat(pending.path("teardownRequest").path("target").has("contextRevision")).isFalse();
    String reason = pending.path("teardownRequest").path("reason").asText();

    sessions.redriveTeardowns(TEARDOWN_WINDOW, 32);

    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(stub.calls).hasSize(4).containsOnly(assignment + "|" + reason);
    assertThat(teardownState(id)).isEqualTo("FAILED");
    assertThat(
            actualJdbc.queryForObject(
                "SELECT status||'|'||(ack IS NULL) FROM studio_guided_materialization_deliveries"
                    + " WHERE session_id=? AND context_revision=2",
                String.class,
                id))
        .isEqualTo("PENDING|true");
  }

  @Test
  void noPendingDeliveryKeepsIdentityTarget() throws Exception {
    var clock = new OffsetClock();
    var stub = new TeardownStub(ordinal -> null);
    var sessions = translationTeardownService(clock, stub);
    String id = materializedTeardownSession(sessions, stub);
    ObjectNode identity = materialization.identity(sessions.runnerContext(controller, id, 1));

    sessions.failTranslation(controller, id, 1, "RUNTIME_INCOMPATIBLE");

    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(stub.calls).hasSize(1);
    assertThat(stub.calls.getFirst()).startsWith(identity.toString() + "|");
    assertThat(identity.has("assignmentId")).isFalse();
    assertThat(identity.path("contextRevision").asInt()).isEqualTo(1);
    assertThat(
            actualJdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materialization_deliveries WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
  }

  // STUDIO-OBS-015 B2B-01 L1 (aria-lifecycle-ruling01): while an append delivery is PENDING the
  // owner's identity-kind lifecycle report is accepted at exactly v(n) or v(n-1), and only ends the
  // session; every consuming verification stays refused.

  @Test
  void lifecycleAtPendingAppendIdentityEndsSessionAndChangesNothing() throws Exception {
    var stub = new TeardownStub(ordinal -> null);
    var sessions = translationTeardownService(new OffsetClock(), stub);
    String id = materializedTeardownSession(sessions, stub);
    appendPendingDelivery(sessions, id);
    JsonNode assignment = new GuidedAssignmentStore(actualJdbc, C).find(id);
    ObjectNode frozen = sessions.runnerContext(controller, id, 1);
    String deliveryId = sessions.contextDeliveryId(controller, id, 1);
    ObjectNode request = materialization.identity(frozen).put("reason", "LEASE_LOST");
    assertThat(request.path("contextRevision").asInt()).isEqualTo(2);
    List<String> settled = pendingAppendFacts(id);

    JsonNode stopped = workerLifecycle(sessions, id, 1, "lifecycle-v2", request);

    assertThat(stopped.path("state").asText()).isEqualTo("FAILED");
    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    // CONFIRMED clears the durable request; the one sent target is the stub's record.
    assertThat(assignment.has("assignmentId")).isTrue();
    assertThat(assignment.has("contextRevision")).isFalse();
    assertThat(stub.calls).hasSize(1);
    // w4-qa-ack03 advisory 1: the full assignment|reason; a FAILED stop sends UNKNOWN_OUTCOME.
    assertThat(stub.calls.getFirst()).isEqualTo(assignment + "|UNKNOWN_OUTCOME");
    assertThat(pendingAppendFacts(id)).isEqualTo(settled);
    assertThat(
            actualJdbc.queryForObject(
                "SELECT live FROM studio_guided_materializations WHERE session_id=?",
                Boolean.class,
                id))
        .isFalse();

    ObjectNode ack =
        C.object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("workerId", frozen.path("workerId").asText())
            .put("ownerFence", frozen.path("ownerFence").asInt())
            .put("scopeHash", frozen.path("scopeHash").asText())
            .put("contextId", frozen.path("contextId").asText())
            .put("contextRevision", frozen.path("contextRevision").asInt())
            .put("authoredInputsHash", frozen.path("authoredInputsHash").asText())
            .put("sourceRevision", frozen.path("sourceRevision").asText())
            .put("configurationRevision", frozen.path("configurationRevision").asText())
            .put("materializationRevision", frozen.path("materializationRevision").asInt())
            .put("contextHash", GuidedContracts.hash(frozen))
            .put("deliveryId", deliveryId);
    assertThatThrownBy(() -> sessions.acknowledgeContext(controller, id, 1, ack))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("PUBLICATION_CONFLICT");
    assertThat(pendingAppendFacts(id)).isEqualTo(settled);
  }

  @Test
  void lifecycleAtLastAcknowledgedIdentityEndsSession() throws Exception {
    var stub = new TeardownStub(ordinal -> null);
    var sessions = translationTeardownService(new OffsetClock(), stub);
    String id = materializedTeardownSession(sessions, stub);
    appendPendingDelivery(sessions, id);
    JsonNode assignment = new GuidedAssignmentStore(actualJdbc, C).find(id);
    ObjectNode request =
        materialization
            .identity(sessions.runnerContext(controller, id, 1))
            .put("contextRevision", 1)
            .put("reason", "LEASE_LOST");

    JsonNode stopped = workerLifecycle(sessions, id, 1, "lifecycle-v1", request);

    assertThat(stopped.path("state").asText()).isEqualTo("FAILED");
    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(stub.calls).hasSize(1);
    assertThat(stub.calls.getFirst()).startsWith(assignment + "|");
    assertThat(
            actualJdbc.queryForObject(
                "SELECT status||'|'||(ack IS NULL) FROM studio_guided_materialization_deliveries"
                    + " WHERE session_id=? AND context_revision=2",
                String.class,
                id))
        .isEqualTo("PENDING|true");
  }

  @Test
  void lifecycleAtAnyOtherIdentityIsRefusedWhilePending() throws Exception {
    var stub = new TeardownStub(ordinal -> null);
    var sessions = translationTeardownService(new OffsetClock(), stub);
    String id = materializedTeardownSession(sessions, stub);
    appendPendingDelivery(sessions, id);
    ObjectNode issued =
        materialization
            .identity(sessions.runnerContext(controller, id, 1))
            .put("reason", "LEASE_LOST");
    String state = teardownState(id);
    // w4-qa-ack03 advisory 2: all six terminal states, so the pre-check means "non-terminal".
    assertThat(
            java.util.Set.of(
                "SUCCEEDED",
                "PUBLICATION_CONFLICT",
                "CANCELLED",
                "UNKNOWN_OUTCOME",
                "FAILED",
                "EXPIRED"))
        .doesNotContain(state);
    var refused = new java.util.LinkedHashMap<String, ObjectNode>();
    refused.put("revision-0", issued.deepCopy().put("contextRevision", 0));
    refused.put("revision-3", issued.deepCopy().put("contextRevision", 3));
    refused.put("context-id", issued.deepCopy().put("contextId", UUID.randomUUID().toString()));
    refused.put("envelope-fence-2", issued.deepCopy().put("ownerFence", 2));
    refused.put("scope-hash", issued.deepCopy().put("scopeHash", "0".repeat(64)));
    for (var probe : refused.entrySet()) {
      assertThatThrownBy(() -> workerLifecycle(sessions, id, 1, probe.getKey(), probe.getValue()))
          .as(probe.getKey())
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              refusal -> {
                assertThat(refusal).hasMessage("STALE_FENCE");
                assertThat(refusal.status()).isEqualTo(409);
              });
    }
    assertThatThrownBy(() -> workerLifecycle(sessions, id, 2, "header-fence-2", issued))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            refusal -> {
              assertThat(refusal).hasMessage("STALE_FENCE");
              assertThat(refusal.status()).isEqualTo(409);
            });

    assertThat(teardownState(id)).isEqualTo(state);
    assertThat(teardownProgress(id).has("teardownStatus")).isFalse();
    assertThat(stub.calls).isEmpty();
    assertThat(
            actualJdbc.queryForObject(
                "SELECT status FROM studio_guided_materialization_deliveries"
                    + " WHERE session_id=? AND context_revision=2",
                String.class,
                id))
        .isEqualTo("PENDING");
  }

  @Test
  void consumingVerificationStaysRefusedWhilePending() throws Exception {
    var stub = new TeardownStub(ordinal -> null);
    var sessions = translationTeardownService(new OffsetClock(), stub);
    String id = materializedTeardownSession(sessions, stub);
    appendPendingDelivery(sessions, id);
    ObjectNode v2 = materialization.identity(sessions.runnerContext(controller, id, 1));
    assertThat(v2.path("contextRevision").asInt()).isEqualTo(2);
    JsonNode document = repository.transaction(() -> repository.lock(id).document());

    assertThatThrownBy(() -> materialization.verify(document, v2)).hasMessage("REVISION_CONFLICT");
    assertThatThrownBy(() -> materialization.verifyAndCapture(document, v2))
        .hasMessage("REVISION_CONFLICT");
  }

  @Test
  void lifecycleWithoutPendingDeliveryIsExactlyVerify() throws Exception {
    var stub = new TeardownStub(ordinal -> null);
    var sessions = translationTeardownService(new OffsetClock(), stub);
    String id = materializedTeardownSession(sessions, stub);
    ObjectNode identity = materialization.identity(sessions.runnerContext(controller, id, 1));
    assertThat(identity.path("contextRevision").asInt()).isEqualTo(1);

    assertThatThrownBy(
            () ->
                workerLifecycle(
                    sessions,
                    id,
                    1,
                    "lifecycle-v0",
                    identity.deepCopy().put("contextRevision", 0).put("reason", "LEASE_LOST")))
        .hasMessage("STALE_FENCE");
    assertThat(stub.calls).isEmpty();

    JsonNode stopped =
        workerLifecycle(
            sessions, id, 1, "lifecycle-v1", identity.deepCopy().put("reason", "LEASE_LOST"));

    assertThat(stopped.path("state").asText()).isEqualTo("FAILED");
    awaitTeardown(() -> teardownProgress(id).path("teardownStatus").asText().equals("CONFIRMED"));
    assertThat(stub.calls).hasSize(1);
    assertThat(stub.calls.getFirst()).startsWith(identity.toString() + "|");
    assertThat(identity.has("assignmentId")).isFalse();
    assertThat(
            actualJdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materialization_deliveries WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
  }

  /** The owning worker's identity-kind lifecycle callback with the given fence header. */
  private static JsonNode workerLifecycle(
      GuidedSessionService sessions, String id, long fence, String key, JsonNode request) {
    String worker =
        actualJdbc.queryForObject(
            "SELECT document->'owner'->>'workerId' FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id);
    return sessions.lifecycle(
        new GuidedInternalSecurity.Identity(worker, "owning-worker"), id, fence, key, request);
  }

  /** Ledger 77 facts a lifecycle stop (and a late ACK) must leave unchanged. */
  private static List<String> pendingAppendFacts(String id) {
    var rows = new java.util.ArrayList<String>();
    rows.add(
        actualJdbc.queryForObject(
            "SELECT materialization_revision::text FROM studio_guided_materializations"
                + " WHERE session_id=?",
            String.class,
            id));
    rows.addAll(
        actualJdbc.queryForList(
            "SELECT status||'|'||(ack IS NULL)||'|'||context_hash"
                + " FROM studio_guided_materialization_deliveries WHERE session_id=? ORDER BY 1",
            String.class,
            id));
    for (String table : List.of("studio_guided_allocations", "studio_guided_producers")) {
      rows.add(table);
      rows.addAll(
          actualJdbc.queryForList(
              "SELECT t::text FROM " + table + " t WHERE session_id=? ORDER BY 1",
              String.class,
              id));
    }
    return rows;
  }

  /** The H8 teardown service with production translation state installed (failTranslation). */
  private GuidedSessionService translationTeardownService(OffsetClock clock, TeardownStub stub) {
    var sessions = teardownService(clock, stub);
    sessions.installTranslation(
        new GuidedTranslationStore(actualJdbc, C),
        new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
            actualJdbc, C));
    return sessions;
  }

  /** An assigned session materialized at v1 (fence 1); only its own stops reach the stub. */
  private String materializedTeardownSession(GuidedSessionService sessions, TeardownStub stub) {
    var dispatch = new GuidedDispatchService(sessions, materialization, client());
    var scenario = materializedStopScenario(sessions, dispatch, repository, actualJdbc);
    stub.sessionId = scenario.sessionId;
    return scenario.sessionId;
  }

  /**
   * Appends v2 through the real V21 append path (continuation MATERIALIZE, then one appended input)
   * and issues its frozen context, leaving one PENDING delivery that no runner acknowledged. The
   * fixture's sources resolve only the one secret reference, so the appended input is a copy with a
   * fresh inputId; only the delivery state matters to the stop target.
   */
  private void appendPendingDelivery(GuidedSessionService sessions, String id) {
    repository.transaction(
        () -> {
          new GuidedTranslationStore(actualJdbc, C).continuation(id, "MATERIALIZE");
          return null;
        });
    String appended = UUID.randomUUID().toString();
    assertThat(
            actualJdbc.update(
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
    sessions.runnerContext(controller, id, 1);
    assertThat(
            actualJdbc.queryForObject(
                "SELECT status||'|'||(context_metadata IS NOT NULL)||'|'||(ack IS NULL)"
                    + " FROM studio_guided_materialization_deliveries"
                    + " WHERE session_id=? AND context_revision=2",
                String.class,
                id))
        .isEqualTo("PENDING|true|true");
  }

  /** Stop sender double for one session; {@code outcome} maps the 1-based call to a failure. */
  private static final class TeardownStub
      implements java.util.function.BiConsumer<ObjectNode, String> {
    final java.util.function.IntFunction<RuntimeException> outcome;
    final List<String> calls = new java.util.concurrent.CopyOnWriteArrayList<>();
    final AtomicInteger active = new AtomicInteger(), maxActive = new AtomicInteger();
    volatile java.util.function.IntConsumer onEntry =
        ordinal -> {
          // intentionally empty: no entry hook by default
        };
    volatile String sessionId;

    TeardownStub(java.util.function.IntFunction<RuntimeException> outcome) {
      this.outcome = outcome;
    }

    @Override
    public void accept(ObjectNode target, String reason) {
      if (sessionId == null || !sessionId.equals(target.path("sessionId").asText())) {
        throw new IllegalStateException("FOREIGN_SESSION");
      }
      maxActive.accumulateAndGet(active.incrementAndGet(), Math::max);
      try {
        calls.add(target + "|" + reason);
        int ordinal = calls.size();
        onEntry.accept(ordinal);
        RuntimeException failure = outcome.apply(ordinal);
        if (failure != null) {
          throw failure;
        }
      } finally {
        active.decrementAndGet();
      }
    }
  }

  /** System time plus an adjustable offset; only this case's service reads it. */
  private static final class OffsetClock extends Clock {
    private final AtomicReference<Duration> offset = new AtomicReference<>(Duration.ZERO);

    void advance(Duration by) {
      offset.updateAndGet(current -> current.plus(by));
    }

    @Override
    public java.time.ZoneId getZone() {
      return java.time.ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(java.time.ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return Instant.now().plus(offset.get());
    }
  }

  private GuidedSessionService teardownService(OffsetClock clock, TeardownStub stub) {
    var sessions = service(actualJdbc, repository, materialization, access, 30, clock);
    sessions.installStopSender(stub);
    return sessions;
  }

  /** A 30 s session holding only a prepared assignment: its teardown target is the intent. */
  private String assignedExpiringSession(GuidedSessionService sessions, TeardownStub stub) {
    var scenario = new Scenario(Mode.COMPLETE_200_NO_CALLBACK);
    BY_TEST.put(scenario.testId, scenario);
    var steps = C.object().putArray("steps");
    steps.addObject().put("stepId", STEP_ID).put("text", "Enter <secret PASS> as password.");
    var variables = C.object().putArray("variables");
    variables.addObject().put("name", "PASS").put("kind", "secretRef");
    scenario.source = steps;
    scenario.configuration = variables;
    actualJdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by) "
            + "VALUES (?,'teardown fixture','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?)",
        scenario.testId,
        steps.toString(),
        variables.toString(),
        EMAIL);
    scenario.sessionId =
        sessions
            .start(
                user,
                UUID.randomUUID().toString(),
                C.object()
                    .put("schemaVersion", 3)
                    .put("testId", scenario.testId.toString())
                    .put("sourceRevision", "source-1")
                    .put("configurationRevision", "config-1")
                    .put("environmentId", "fixture")
                    .put("applicationId", "orders")
                    .set("versions", DOCUMENTS.path("versions")))
            .path("sessionId")
            .asText();
    BY_SESSION.put(scenario.sessionId, scenario);
    sessions.prepareAssignment(controller, scenario.sessionId, "teardown-assignment", "worker-1");
    stub.sessionId = scenario.sessionId;
    return scenario.sessionId;
  }

  private static JsonNode teardownProgress(String id) {
    return C.parse(
        actualJdbc.queryForObject(
            "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  private static String teardownState(String id) {
    return actualJdbc.queryForObject(
        "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id);
  }

  /** Every row a teardown re-drive must leave byte-identical (teardown keys excluded). */
  private static List<String> teardownInvariants(String id) {
    var rows = new java.util.ArrayList<String>();
    rows.add(
        actualJdbc.queryForObject(
            "SELECT state||'|'||document::text||'|'||"
                + "(progress-'teardownStatus'-'teardownRequest')::text"
                + " FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
    for (String table :
        List.of(
            "studio_guided_actions",
            "studio_guided_evidence",
            "studio_guided_session_recordings",
            "studio_guided_assignments",
            "studio_guided_materializations",
            "studio_secret_use_audit")) {
      rows.add(table);
      rows.addAll(
          actualJdbc.queryForList(
              "SELECT t::text FROM " + table + " t WHERE session_id=? ORDER BY 1",
              String.class,
              id));
    }
    rows.add("studio_guided_commands");
    rows.addAll(
        actualJdbc.queryForList(
            "SELECT t::text FROM studio_guided_commands t WHERE namespace=? ORDER BY 1",
            String.class,
            id));
    return rows;
  }

  private static void awaitTeardown(java.util.function.BooleanSupplier condition)
      throws InterruptedException {
    long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
    while (!condition.getAsBoolean()) {
      if (System.nanoTime() > until) {
        throw new AssertionError("Teardown condition not reached");
      }
      Thread.sleep(20);
    }
  }

  private static void joinUninterruptibly(Thread ownedThread) {
    if (ownedThread == null) {
      return;
    }
    boolean interrupted = Thread.interrupted();
    try {
      while (ownedThread.isAlive()) {
        try {
          ownedThread.join();
        } catch (InterruptedException interruption) {
          interrupted = true;
        }
      }
    } finally {
      if (interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }

  private static void addSuppressedDistinct(Throwable primary, Throwable addition) {
    if (primary == addition) {
      return;
    }
    for (Throwable existing : primary.getSuppressed()) {
      if (existing == addition) {
        return;
      }
    }
    primary.addSuppressed(addition);
  }

  private static void assertUnconfirmedClosedMaterialization(String id) {
    assertThat(
            actualJdbc.queryForObject(
                "SELECT progress->>'teardownStatus' FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id))
        .isEqualTo("PENDING");
    // STUDIO-OBS-015 H8: the durable value-free stop request survives for the reaper's re-drive.
    assertThat(
            actualJdbc.queryForObject(
                "SELECT progress->'teardownRequest'->>'reason' FROM studio_guided_sessions"
                    + " WHERE session_id=?",
                String.class,
                id))
        .isEqualTo("CANCELLED");
    assertThat(
            actualJdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=? AND live",
                Integer.class,
                id))
        .isZero();
    assertThat(
            actualJdbc.queryForObject(
                "SELECT document->>'state' FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id))
        .isEqualTo("CANCELLED");
  }

  private Scenario materializedStopScenario(
      GuidedSessionService sessions,
      GuidedDispatchService dispatch,
      GuidedSessionRepository repository,
      JdbcTemplate jdbc) {
    var scenario = new Scenario(Mode.COMPLETE_200_NO_CALLBACK);
    BY_TEST.put(scenario.testId, scenario);
    var steps = C.object().putArray("steps");
    steps.addObject().put("stepId", STEP_ID).put("text", "Enter <secret PASS> as password.");
    var variables = C.object().putArray("variables");
    variables.addObject().put("name", "PASS").put("kind", "secretRef");
    scenario.source = steps;
    scenario.configuration = variables;
    actualJdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by) "
            + "VALUES (?,'stop fixture','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?)",
        scenario.testId,
        steps.toString(),
        variables.toString(),
        EMAIL);
    scenario.sessionId =
        sessions
            .start(
                user,
                UUID.randomUUID().toString(),
                C.object()
                    .put("schemaVersion", 3)
                    .put("testId", scenario.testId.toString())
                    .put("sourceRevision", "source-1")
                    .put("configurationRevision", "config-1")
                    .put("environmentId", "fixture")
                    .put("applicationId", "orders")
                    .set("versions", DOCUMENTS.path("versions")))
            .path("sessionId")
            .asText();
    BY_SESSION.put(scenario.sessionId, scenario);
    repository.transaction(
        () -> {
          var manifest =
              C.object()
                  .put("testId", scenario.testId.toString())
                  .put("sourceRevision", "source-1")
                  .put("configurationRevision", "config-1")
                  .put("policy", "INPUT-POLICY-01-A");
          manifest.set("sourceSteps", steps);
          manifest
              .putArray("configurationReferences")
              .addObject()
              .put("referenceId", "ref-PASS")
              .put("referenceName", "PASS")
              .put("kind", "secretRef")
              .put("stepId", STEP_ID)
              .put("intendedSlot", "fill.value");
          new GuidedTranslationStore(jdbc, C)
              .initialize(repository.lock(scenario.sessionId).document(), manifest);
          return null;
        });
    dispatch.assign(controller, scenario.sessionId, "assign", "worker-1");
    var references = C.object().putArray("references");
    references.add(DOCUMENTS.path("secretReference"));
    sessions.materialize(controller, scenario.sessionId, 1, "materialize", references);
    assertThat(
            jdbc.queryForObject(
                "SELECT live FROM studio_guided_materializations WHERE session_id=?",
                Boolean.class,
                scenario.sessionId))
        .isTrue();
    return scenario;
  }

  private static void awaitActualStop(PrivatePgRoute route, Scenario scenario, SourceStopOwner work)
      throws Exception {
    long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
    while (System.nanoTime() < until) {
      assertThat(work.failure.get()).as("actual fixture stop delivery must succeed").isNull();
      var status =
          actualJdbc.queryForMap(
              "SELECT document->>'state' AS state,"
                  + "progress->>'teardownStatus' AS teardown FROM studio_guided_sessions WHERE session_id=?",
              scenario.sessionId);
      int materializations =
          actualJdbc.queryForObject(
              "SELECT count(*) FROM studio_guided_materializations " + "WHERE session_id=?",
              Integer.class,
              scenario.sessionId);
      int live =
          actualJdbc.queryForObject(
              "SELECT count(*) FROM studio_guided_materializations "
                  + "WHERE session_id=? AND live",
              Integer.class,
              scenario.sessionId);
      boolean senderFinished = work.operationsComplete();
      boolean confirmed = "CONFIRMED".equals(status.get("teardown"));
      boolean noContext = materializations == 0 && status.get("teardown") == null;
      if (live == 0
          && senderFinished
          && route.idle()
          && (confirmed || noContext)
          && java.util.Set.of("CANCELLED", "UNKNOWN_OUTCOME", "FAILED", "EXPIRED")
              .contains(status.get("state"))) {
        if (materializations > 0) {
          assertThat(work.initiated.get()).isGreaterThan(0);
          assertThat(status.get("teardown")).isEqualTo("CONFIRMED");
        }
        return;
      }
      Thread.sleep(20);
    }
    throw new AssertionError("Actual stop/confirmation/materialization closure did not complete");
  }

  private static void assertConsumedReleaseWithoutTerminalUsage(String id) {
    assertThat(
            actualJdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands "
                    + "WHERE namespace=? AND route='v2-consume'",
                Integer.class,
                id))
        .isGreaterThanOrEqualTo(1);
    assertThat(
            actualJdbc.queryForObject(
                "SELECT count(*) FROM studio_secret_use_audit "
                    + "WHERE session_id=? AND row_kind='RELEASE' AND outcome='RESOLVED' "
                    + "AND vault_version='fixture-version-1'",
                Integer.class,
                id))
        .isEqualTo(1);
    assertThat(
            actualJdbc.queryForObject(
                "SELECT count(*) FROM studio_secret_use_audit "
                    + "WHERE session_id=? AND row_kind='USAGE'",
                Integer.class,
                id))
        .isZero();
  }

  private static org.postgresql.util.PSQLException postgresFailure(Throwable failure) {
    for (Throwable current = failure; current != null; current = current.getCause()) {
      if (current instanceof org.postgresql.util.PSQLException postgres) {
        return postgres;
      }
    }
    throw new AssertionError("A genuine PostgreSQL driver refusal is required");
  }

  /** Opaque bidirectional JDBC traffic only; no bodies, credentials or authority are recorded. */
  private static final class PrivatePgRoute implements AutoCloseable {
    private final InetSocketAddress target;
    private final List<SourceStopOwner> owners = new java.util.concurrent.CopyOnWriteArrayList<>();

    void attach(SourceStopOwner owner) {
      owners.add(owner);
    }

    private final ExecutorService bridges = Executors.newVirtualThreadPerTaskExecutor();
    private final Set<java.net.Socket> sockets = ConcurrentHashMap.newKeySet();
    private final AtomicInteger activeTransfers = new AtomicInteger();
    private final java.util.Queue<IOException> closeFailures =
        new java.util.concurrent.ConcurrentLinkedQueue<>();
    private volatile java.net.ServerSocket listener;
    private int privatePort;
    private boolean closed;

    PrivatePgRoute(String host, int port) throws IOException {
      target = new InetSocketAddress(host, port);
      try {
        reopen();
      } catch (IOException | RuntimeException | Error failure) {
        bridges.shutdownNow();
        throw failure;
      }
    }

    synchronized int port() {
      return privatePort;
    }

    synchronized void reopen() throws IOException {
      if (closed) {
        throw new IOException("Case-owned PG route is closed");
      }
      if (listener != null && !listener.isClosed()) {
        return;
      }
      var server = new java.net.ServerSocket();
      try {
        server.setReuseAddress(true);
        server.bind(new InetSocketAddress("127.0.0.1", privatePort));
        privatePort = server.getLocalPort();
        listener = server;
        bridges.submit(() -> accept(server));
      } catch (IOException | RuntimeException | Error failure) {
        try {
          server.close();
        } catch (IOException cleanupFailure) {
          failure.addSuppressed(cleanupFailure);
        }
        // Retain a failed-close listener so final cleanup can account for its ownership.
        listener = server.isClosed() ? null : server;
        throw failure;
      }
    }

    private void accept(java.net.ServerSocket server) {
      while (!server.isClosed()) {
        java.net.Socket application = null;
        java.net.Socket database = null;
        try {
          application = server.accept();
          sockets.add(application);
          if (server.isClosed()) {
            closeSocket(application);
            return;
          }
          database = new java.net.Socket();
          sockets.add(database);
          database.connect(target, 3000);
          if (server.isClosed()) {
            closeSocket(application);
            closeSocket(database);
            return;
          }
          java.net.Socket app = application, pg = database;
          beginTransfer(app, pg);
          beginTransfer(pg, app);
        } catch (IOException | java.util.concurrent.RejectedExecutionException failure) {
          closeSocket(application);
          closeSocket(database);
          if (server.isClosed()) {
            return;
          }
        }
      }
    }

    boolean idle() {
      return activeTransfers.get() == 0 && sockets.isEmpty();
    }

    ObjectNode countOnlyDiagnostic(int ordinal, SetupObservationStage stage, String moment) {
      java.net.ServerSocket currentListener = listener;
      // Independent actual scalar observations, not a coherent resource/completion snapshot.
      return C.object()
          .put("ordinal", ordinal)
          .put("stage", stage.name())
          .put("moment", moment)
          .put("activeTransfers", activeTransfers.get())
          .put("trackedSockets", sockets.size())
          .put("closingFailures", closeFailures.size())
          .put("listenerClosed", currentListener == null || currentListener.isClosed())
          .put("routeClosed", closed)
          .put("executorShutdown", bridges.isShutdown())
          .put("executorTerminated", bridges.isTerminated());
    }

    private void beginTransfer(java.net.Socket from, java.net.Socket to) {
      activeTransfers.incrementAndGet();
      try {
        bridges.submit(() -> transfer(from, to));
      } catch (java.util.concurrent.RejectedExecutionException failure) {
        activeTransfers.decrementAndGet();
        throw failure;
      }
    }

    private void transfer(java.net.Socket from, java.net.Socket to) {
      byte[] bytes = new byte[8192];
      try {
        int count;
        while ((count = from.getInputStream().read(bytes)) != -1) {
          to.getOutputStream().write(bytes, 0, count);
          to.getOutputStream().flush();
        }
      } catch (IOException disconnected) {
        // JDBC completion and the explicit private route cut close both opaque sides.
      } finally {
        Arrays.fill(bytes, (byte) 0);
        try {
          closeSocket(from);
          closeSocket(to);
        } finally {
          activeTransfers.decrementAndGet();
        }
      }
    }

    private void closeSocket(java.net.Socket socket) {
      if (socket == null) {
        return;
      }
      try {
        socket.close();
      } catch (IOException failure) {
        closeFailures.add(failure);
      } finally {
        if (socket.isClosed()) {
          sockets.remove(socket);
        }
      }
    }

    synchronized void unavailable() throws IOException {
      IOException listenerFailure = null;
      java.net.ServerSocket previous = listener;
      listener = null;
      if (previous != null) {
        try {
          previous.close();
        } catch (IOException failure) {
          listenerFailure = failure;
          if (!previous.isClosed()) {
            listener = previous;
          }
        }
      }
      // Continue socket cleanup even if closing the listener failed.
      for (var socket : sockets.toArray(java.net.Socket[]::new)) {
        closeSocket(socket);
      }
      if (listenerFailure != null) {
        throw listenerFailure;
      }
    }

    @Override
    public void close() throws Exception {
      // Observation failures never authorize closing beneath the real sender/confirmation.
      for (SourceStopOwner owner : owners) {
        owner.drainUninterruptibly();
      }
      var failures = new java.util.ArrayList<Throwable>();
      synchronized (this) {
        closed = true;
        try {
          unavailable();
        } catch (Exception | Error failure) {
          failures.add(failure);
        }
      }
      bridges.shutdownNow();
      try {
        if (!bridges.awaitTermination(5, TimeUnit.SECONDS)) {
          failures.add(new AssertionError("Case-owned PG bridge tasks were not reaped"));
        }
      } catch (InterruptedException failure) {
        Thread.currentThread().interrupt();
        failures.add(failure);
      }
      IOException closeFailure;
      while ((closeFailure = closeFailures.poll()) != null) {
        failures.add(closeFailure);
      }
      if (!idle()) {
        failures.add(new AssertionError("Case-owned PG sockets still have live owners"));
      }
      if (listener != null && !listener.isClosed()) {
        failures.add(new AssertionError("Case-owned PG listener was not closed"));
      }
      if (!failures.isEmpty()) {
        Throwable first = failures.get(0);
        for (int i = 1; i < failures.size(); i++) {
          if (failures.get(i) != first) {
            first.addSuppressed(failures.get(i));
          }
        }
        if (first instanceof Exception failure) {
          throw failure;
        }
        if (first instanceof Error failure) {
          throw failure;
        }
        throw new AssertionError(first);
      }
    }
  }

  private static ObjectNode action(String id) {
    return (ObjectNode)
        C.parse(
            actualJdbc.queryForObject(
                "SELECT document::text FROM studio_guided_actions WHERE session_id=?",
                String.class,
                id));
  }

  private static final class FixtureAccess implements GuidedSessionAccess {
    private final JdbcTemplate jdbc;
    private final java.util.function.Consumer<JsonNode> currentObserver;

    FixtureAccess(JdbcTemplate jdbc) {
      this(jdbc, null);
    }

    FixtureAccess(JdbcTemplate jdbc, java.util.function.Consumer<JsonNode> currentObserver) {
      this.jdbc = jdbc;
      this.currentObserver = currentObserver;
    }

    @Override
    public Snapshot resolve(Authentication actor, JsonNode start) {
      require(new CsiOwnershipEvaluator().canExecute(actor, "CSI-123"), "FORBIDDEN_SCOPE", 403);
      UUID id = UUID.fromString(start.path("testId").asText());
      require(BY_TEST.containsKey(id), "FORBIDDEN_SCOPE", 403);
      ObjectNode scope = DOCUMENTS.path("session").path("scope").deepCopy();
      scope
          .put("principalId", "user-1")
          .put("csiId", "CSI-123")
          .put("environmentId", "fixture")
          .put("applicationId", "orders")
          .put("sourceRevision", "source-1")
          .put("configurationRevision", "config-1");
      scope.remove("accountRef");
      scope.putArray("approvedOrigins").add(ORIGIN);
      return new Snapshot(
          scope,
          C.object()
              .putArray("steps")
              .add(C.object().put("stepId", STEP_ID).put("requiresAssertion", false)));
    }

    @Override
    public void checkCurrent(JsonNode session) {
      require(
          jdbc.queryForObject(
                  "SELECT count(*) FROM ui_tests WHERE id=? AND csi_id='CSI-123' "
                      + "AND environment='fixture' AND deleted_at IS NULL",
                  Integer.class,
                  UUID.fromString(session.path("testId").asText()))
              == 1,
          "FORBIDDEN_SCOPE",
          403);
      if (currentObserver != null) {
        currentObserver.accept(session);
      }
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {
      UUID id = UUID.fromString(session.path("testId").asText());
      var row =
          jdbc.queryForMap(
              "SELECT steps::text,variables::text FROM ui_tests WHERE id=? FOR SHARE", id);
      var scenario = BY_TEST.get(id);
      require(
          C.parse((String) row.get("steps")).equals(scenario.source)
              && C.parse((String) row.get("variables")).equals(scenario.configuration),
          "REVISION_CONFLICT",
          409);
    }

    @Override
    public void checkUser(Authentication actor, JsonNode session) {
      require(
          actor instanceof BffAuthenticationToken
              && ((UserIdentity) actor.getPrincipal())
                  .userId()
                  .equals(session.path("scope").path("principalId").asText())
              && new CsiOwnershipEvaluator().canExecute(actor, "CSI-123"),
          "FORBIDDEN_SCOPE",
          403);
    }

    @Override
    public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
      checkSourceCurrent(session);
      return new GuidedSourceReferenceValidator.Sources(
          "source-1",
          "config-1",
          Map.of(
              STEP_ID,
              new GuidedSourceReferenceValidator.Source(
                  "Enter <secret PASS> as password.", List.of())),
          Map.of(
              "ref-PASS",
              new GuidedSourceReferenceValidator.ConfigurationValue(
                  null,
                  STEP_ID,
                  "secretRef",
                  "fill.value",
                  session.path("scopeHash").asText(),
                  false,
                  "PASS")));
    }
  }

  private static final class CountedProvider implements StudioVaultProvider {
    @Override
    public String name() {
      return "parent-counted-service-fixture";
    }

    @Override
    public Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String name) {
      Scenario scenario = BY_TEST.get(UUID.fromString(scope.testId()));
      require(
          scenario != null
              && kind == ReferenceKind.SECRET
              && scope.csiId().equals("CSI-123")
              && scope.environment().equals("fixture")
              && name.equals("PASS"),
          "FORBIDDEN_SCOPE",
          403);
      assertThat(action(scenario.sessionId).path("dispatchCount").asInt()).isEqualTo(1);
      scenario.reads.incrementAndGet();
      char[] value = scenario.canary.toCharArray();
      scenario.chars.set(value);
      return Optional.of(new VaultEntry(value, "fixture-version-1", List.of(ORIGIN)));
    }

    @Override
    public List<String> listSecretNames(VaultScope scope) {
      Scenario scenario = BY_TEST.get(UUID.fromString(scope.testId()));
      require(
          scenario != null
              && scope.csiId().equals("CSI-123")
              && scope.environment().equals("fixture"),
          "FORBIDDEN_SCOPE",
          403);
      scenario.names.incrementAndGet();
      return List.of("PASS");
    }

    @Override
    public String create(VaultScope scope, String name, char[] value, List<String> origins) {
      throw new UnsupportedOperationException("fixture is read-only");
    }
  }

  private static GuidedRunnerClient client() {
    return new GuidedRunnerClient(
        URI.create("https://localhost:" + RELAY.getAddress().getPort()),
        TLS,
        () -> token("backend-controller", "controller-1", "studio-guided-runner"),
        C);
  }

  private static ObjectNode identity(JsonNode context) {
    ObjectNode result = C.object();
    for (String field :
        List.of(
            "schemaVersion",
            "sessionId",
            "workerId",
            "ownerFence",
            "scopeHash",
            "contextId",
            "contextRevision",
            "sourceRevision",
            "configurationRevision",
            "versions")) {
      result.set(field, context.path(field).deepCopy());
    }
    return result;
  }

  private static JsonNode callback(String id, String route, JsonNode body) throws Exception {
    try (var http =
        HttpClient.newBuilder().sslContext(TLS).connectTimeout(Duration.ofSeconds(3)).build()) {
      var request =
          HttpRequest.newBuilder(
                  URI.create(
                      "https://localhost:"
                          + backendPort
                          + "/internal/v2/studio/guided-sessions/"
                          + id
                          + "/"
                          + route))
              .timeout(Duration.ofSeconds(5))
              .header(
                  "Authorization",
                  "Bearer " + token("owning-worker", "worker-1", "studio-guided-controller"))
              .header("Content-Type", "application/json")
              .header("Idempotency-Key", UUID.randomUUID().toString())
              .header("X-Owner-Fence", "1")
              .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
              .build();
      var response = http.send(request, HttpResponse.BodyHandlers.ofString());
      assertThat(response.statusCode()).as("authenticated owning-worker %s", route).isEqualTo(202);
      return C.parseWire(response.body().getBytes(StandardCharsets.UTF_8));
    }
  }

  private static void relay(com.sun.net.httpserver.HttpExchange raw) throws IOException {
    var exchange = (HttpsExchange) raw;
    byte[] received = null;
    Scenario scenario = null;
    try {
      assertThat(exchange.getSSLSession().getPeerCertificates().length).isGreaterThan(0);
      authenticateRelay(exchange.getRequestHeaders().getFirst("Authorization"));
      received = exchange.getRequestBody().readAllBytes();
      JsonNode body = C.parseWire(received);
      String id = body.path("sessionId").asText();
      String path = exchange.getRequestURI().getPath();
      boolean heldAssignmentStop = false;
      if (id.isEmpty()
          && path.endsWith("/stop")
          && body.path("kind").asText().equals("assignment")) {
        String actualAssignmentId = body.path("assignment").path("sessionId").asText();
        Scenario ownedSetup = BY_SESSION.get(actualAssignmentId);
        if (ownedSetup != null && ownedSetup.heldRowSetupCase) {
          id = actualAssignmentId;
          heldAssignmentStop = true;
        }
      }
      scenario = BY_SESSION.get(id);
      require(scenario != null, "FORBIDDEN_SCOPE", 403);
      if (heldAssignmentStop) {
        acceptHeldRowAssignmentStop(exchange, scenario, body, id);
      } else if (path.endsWith("/assign")) {
        JsonNode claimed =
            callback(
                id,
                "claim",
                C.object()
                    .put("schemaVersion", 3)
                    .put("sessionId", id)
                    .put("workerId", "worker-1")
                    .put("expectedFence", body.path("expectedFence").asInt())
                    .set("versions", DOCUMENTS.path("versions")));
        var response =
            C.object()
                .put("schemaVersion", 3)
                .put("status", "OWNED")
                .put("ownerFence", claimed.path("owner").path("fence").asInt())
                .put("leaseExpiresAt", claimed.path("owner").path("leaseExpiresAt").asText());
        response.set("assignment", body);
        respond(exchange, 200, response);
      } else if (path.endsWith("/stop")) {
        scenario.stops.incrementAndGet();
        if (scenario.stopGate != null) {
          scenario.stopGate.hold();
        }
        respond(exchange, scenario.stopStatus, identity(body));
      } else if (path.endsWith("/prepare")) {
        var response =
            identity(body)
                .put("preparationId", UUID.randomUUID().toString())
                .put("requestDigest", body.path("requestDigest").asText())
                .put("evidenceHash", body.path("proposal").path("evidenceHash").asText())
                .put(
                    "authoredInputsHash", body.path("proposal").path("authoredInputsHash").asText())
                .put("expiresAt", body.path("expiresAt").asText());
        respond(exchange, 200, response);
      } else if (path.endsWith("/dispatch")) {
        scenario.posts.incrementAndGet();
        scenario.certified.set(true);
        assertThat(action(id).path("dispatchCount").asInt()).isEqualTo(1);
        assertThat(scenario.reads.get()).isEqualTo(1);
        assertThat(body.path("secret").path("value").asText().equals(scenario.canary)).isTrue();
        ObjectNode response = identity(body);
        ObjectNode ledger = body.path("ledger").deepCopy();
        ledger
            .put("state", scenario.mode == Mode.COMPLETE_200_OWNER_FAILED ? "FAILED" : "SUCCEEDED")
            .put(
                "outcomeCode",
                scenario.mode == Mode.COMPLETE_200_OWNER_FAILED ? "TARGET_CHANGED" : "OK");
        response.set("ledger", ledger);
        response.putNull("availability");
        if (scenario.mode.callback()) {
          callback(id, "outcomes", response);
          scenario.callbacks.incrementAndGet();
        }
        if (scenario.mode.partial()) {
          exchange.sendResponseHeaders(scenario.mode.status(), 0);
          try {
            exchange.getResponseBody().write('{');
            exchange.getResponseBody().flush();
            scenario.headers.countDown();
            while (true) {
              exchange.getResponseBody().write(' ');
              exchange.getResponseBody().flush();
              Thread.sleep(20);
            }
          } catch (IOException cancelled) {
            scenario.disconnected.countDown();
          } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
          }
        } else {
          respond(exchange, scenario.mode.status(), response);
        }
      } else {
        respond(exchange, 200, identity(body));
      }
    } catch (Throwable failure) {
      if (scenario != null) {
        scenario.peerFailure.set(failure);
      }
      try {
        exchange.sendResponseHeaders(500, -1);
      } catch (IOException ignored) {
        /* Peer already closed. */
      }
    } finally {
      if (received != null) {
        Arrays.fill(received, (byte) 0);
      }
      exchange.close();
    }
  }

  /**
   * Actual authenticated controlled-relay assignment termination; no physical worker/browser claim.
   */
  private static void acceptHeldRowAssignmentStop(
      HttpsExchange exchange, Scenario scenario, JsonNode body, String id) throws IOException {
    require(scenario.heldRowSetupCase && scenario.sessionId.equals(id), "FORBIDDEN_SCOPE", 403);
    require(
        exchange
                .getRequestURI()
                .getPath()
                .equals("/internal/v2/studio/guided-sessions/" + id + "/stop")
            && exchange.getRequestURI().getRawQuery() == null,
        "INVALID_CONTRACT",
        422);
    var fields = new java.util.HashSet<String>();
    body.fieldNames().forEachRemaining(fields::add);
    require(
        fields.equals(java.util.Set.of("schemaVersion", "kind", "assignment", "reason"))
            && body.path("schemaVersion").isIntegralNumber()
            && body.path("schemaVersion").asInt() == 3
            && body.path("kind").asText().equals("assignment")
            && java.util.Set.of("CANCELLED", "EXPIRED", "REVOKED", "UNKNOWN_OUTCOME")
                .contains(body.path("reason").asText()),
        "INVALID_CONTRACT",
        422);
    C.validate("v3/assignment", body.path("assignment"));
    ObjectNode actualIntent = new GuidedAssignmentStore(actualJdbc, C).find(id);
    require(
        actualIntent != null && actualIntent.equals(body.path("assignment")),
        "FORBIDDEN_SCOPE",
        403);
    JsonNode actualOwner =
        C.parse(
            actualJdbc.queryForObject(
                "SELECT document->'owner' FROM studio_guided_sessions WHERE session_id=?",
                String.class,
                id));
    require(
        actualOwner.isObject()
            && actualOwner.path("workerId").isTextual()
            && actualOwner.path("fence").isIntegralNumber(),
        "INVALID_CONTRACT",
        422);
    long baseFence = actualIntent.path("expectedFence").asLong();
    var receipt = C.object().put("schemaVersion", 3).put("status", "STOPPED");
    receipt.set("assignment", actualIntent);
    if (actualOwner.path("workerId").asText().equals("unclaimed")
        && actualOwner.path("fence").asLong() == baseFence) {
      receipt.putNull("ownerFence").putNull("leaseExpiresAt");
    } else {
      require(
          actualOwner.path("workerId").equals(actualIntent.path("workerId"))
              && actualOwner.path("fence").asLong() == baseFence + 1
              && actualOwner.path("leaseExpiresAt").isTextual(),
          "STALE_FENCE",
          409);
      require(
          !Instant.parse(actualOwner.path("leaseExpiresAt").asText())
              .isAfter(Instant.parse(actualIntent.path("expiresAt").asText())),
          "STALE_FENCE",
          409);
      receipt.set("ownerFence", actualOwner.path("fence"));
      receipt.set("leaseExpiresAt", actualOwner.path("leaseExpiresAt"));
    }
    C.validate("v3/assignment-receipt", receipt);
    scenario.stops.incrementAndGet();
    scenario.assignmentTerminated.set(true);
    // Same canonical HTTP200 accepted by the original backend sender; no grant/launch/renew.
    respond(exchange, 200, receipt);
  }

  private static void respond(HttpsExchange exchange, int status, JsonNode body)
      throws IOException {
    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
    try {
      exchange.getResponseHeaders().set("Content-Type", "application/json");
      exchange.sendResponseHeaders(status, bytes.length);
      exchange.getResponseBody().write(bytes);
    } finally {
      Arrays.fill(bytes, (byte) 0);
    }
  }

  private static String token(String role, String subject, String audience) {
    try {
      var claims =
          C.object()
              .put("iss", ISSUER_NAME)
              .put("sub", subject)
              .put("role", role)
              .put("aud", audience)
              .put("iat", Instant.now().getEpochSecond())
              .put("exp", Instant.now().plusSeconds(120).getEpochSecond());
      var encoder = Base64.getUrlEncoder().withoutPadding();
      String input =
          encoder.encodeToString(
                  "{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8))
              + "."
              + encoder.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
      var signature = Signature.getInstance("SHA256withRSA");
      signature.initSign(ISSUER.getPrivate());
      signature.update(input.getBytes(StandardCharsets.US_ASCII));
      return input + "." + encoder.encodeToString(signature.sign());
    } catch (Exception failure) {
      throw new IllegalStateException("Fixture signing failed", failure);
    }
  }

  private static void authenticateRelay(String authorization) throws Exception {
    require(authorization != null && authorization.startsWith("Bearer "), "UNAUTHENTICATED", 401);
    String[] parts = authorization.substring(7).split("\\.");
    require(parts.length == 3, "UNAUTHENTICATED", 401);
    var decoder = Base64.getUrlDecoder();
    var signature = Signature.getInstance("SHA256withRSA");
    signature.initVerify(ISSUER.getPublic());
    signature.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
    require(signature.verify(decoder.decode(parts[2])), "UNAUTHENTICATED", 401);
    JsonNode claims = C.parseWire(decoder.decode(parts[1]));
    var fields = new java.util.HashSet<String>();
    claims.fieldNames().forEachRemaining(fields::add);
    require(
        fields.equals(Set.of("iss", "sub", "role", "aud", "iat", "exp"))
            && claims.path("iss").asText().equals(ISSUER_NAME)
            && claims.path("sub").asText().equals("controller-1")
            && claims.path("role").asText().equals("backend-controller")
            && claims.path("aud").asText().equals("studio-guided-runner")
            && claims.path("iat").asLong() <= Instant.now().getEpochSecond()
            && claims.path("exp").asLong() > Instant.now().getEpochSecond(),
        "UNAUTHENTICATED",
        401);
  }

  private static SSLContext certificate() throws Exception {
    command(
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        TEMP.resolve("key.pem").toString(),
        "-out",
        TEMP.resolve("cert.pem").toString(),
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost");
    command(
        "openssl",
        "pkcs12",
        "-export",
        "-inkey",
        TEMP.resolve("key.pem").toString(),
        "-in",
        TEMP.resolve("cert.pem").toString(),
        "-out",
        TEMP.resolve("fixture.p12").toString(),
        "-passout",
        "pass:fixture");
    var store = KeyStore.getInstance("PKCS12");
    try (var in = Files.newInputStream(TEMP.resolve("fixture.p12"))) {
      store.load(in, "fixture".toCharArray());
    }
    var keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
    keys.init(store, "fixture".toCharArray());
    var anchors = KeyStore.getInstance("PKCS12");
    anchors.load(null, "fixture".toCharArray());
    var fixtureCertificate = store.getCertificate(store.aliases().nextElement());
    assertThat(fixtureCertificate).isNotNull();
    anchors.setCertificateEntry("fixture-certificate", fixtureCertificate);
    assertThat(anchors.isCertificateEntry("fixture-certificate")).isTrue();
    try (var out = Files.newOutputStream(TEMP.resolve("trust.p12"))) {
      anchors.store(out, "fixture".toCharArray());
    }
    var trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
    trust.init(anchors);
    var tls = SSLContext.getInstance("TLS");
    tls.init(keys.getKeyManagers(), trust.getTrustManagers(), new SecureRandom());
    return tls;
  }

  private static void command(String... command) throws Exception {
    var process = new ProcessBuilder(command).redirectErrorStream(true).start();
    try {
      assertThat(process.waitFor(15, TimeUnit.SECONDS)).isTrue();
      assertThat(process.exitValue()).isZero();
    } finally {
      process.destroyForcibly();
    }
  }

  private static boolean zero(byte[] bytes) {
    if (bytes == null) {
      return false;
    }
    for (byte value : bytes) {
      if (value != 0) {
        return false;
      }
    }
    return true;
  }

  private static boolean zero(char[] chars) {
    if (chars == null) {
      return false;
    }
    for (char value : chars) {
      if (value != 0) {
        return false;
      }
    }
    return true;
  }

  private static void terminateOwnedContextBeforePostgres() {
    assertThat(GUIDED_CUT_CLEANUP_UNCONFIRMED.get())
        .as("new controller cut owned resources must be genuinely closed before dependencies")
        .isFalse();
    for (SourceStopOwner owner : STOP_OWNERS) {
      owner.drainUninterruptibly();
    }
    ConfigurableApplicationContext context = ownedContext;
    assertThat(context).as("this class's actual Spring context was captured").isNotNull();
    TestContext testContext = ownedTestContext;
    assertThat(testContext).as("the actual framework TestContext was captured").isNotNull();
    assertThat(testContext.getTestClass()).isSameAs(GuidedServiceTransportFaultIT.class);
    assertThat(testContext.hasApplicationContext()).isTrue();
    assertThat(testContext.getApplicationContext()).isSameAs(context);
    var executors = new java.util.LinkedHashSet<ExecutorService>();
    var schedulers =
        context.getBeansOfType(org.springframework.scheduling.TaskScheduler.class, false, false);
    assertThat(schedulers)
        .as("actual class-owned scheduler is available for termination proof")
        .isNotEmpty();
    assertThat(schedulers.values())
        .allMatch(
            scheduler ->
                scheduler
                    instanceof org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler);
    for (var scheduler :
        context
            .getBeansOfType(
                org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler.class,
                false,
                false)
            .values()) {
      scheduler.setWaitForTasksToCompleteOnShutdown(false);
      scheduler.setAwaitTerminationSeconds(5);
      executors.add(scheduler.getScheduledExecutor());
    }
    for (var executor :
        context
            .getBeansOfType(
                org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor.class,
                false,
                false)
            .values()) {
      executor.setWaitForTasksToCompleteOnShutdown(false);
      executor.setAwaitTerminationSeconds(5);
      executors.add(executor.getThreadPoolExecutor());
    }
    executors.addAll(context.getBeansOfType(ExecutorService.class, false, false).values());
    boolean interrupted = Thread.interrupted();
    try {
      // Terminate genuine context-owned operations while the actual PG/relay remain available.
      for (ExecutorService executor : executors) {
        executor.shutdownNow();
      }
      for (ExecutorService executor : executors) {
        while (!executor.isTerminated()) {
          try {
            executor.awaitTermination(1, TimeUnit.SECONDS);
          } catch (InterruptedException interruption) {
            interrupted = true;
          }
        }
        assertThat(executor.isTerminated()).isTrue();
      }
      // Framework eviction closes this exact entry; no stale manually closed cache value remains.
      testContext.markApplicationContextDirty(DirtiesContext.HierarchyMode.CURRENT_LEVEL);
      assertThat(context.isActive()).isFalse();
      assertThat(testContext.hasApplicationContext()).isFalse();
    } finally {
      if (interrupted) {
        Thread.currentThread().interrupt();
      }
    }
  }

  static void close() throws Exception {
    // AFTER_CLASS dirtiness idempotently repeats exact-entry eviction after this owned shutdown.
    terminateOwnedContextBeforePostgres();
    RELAY.stop(0);
    PEERS.shutdownNow();
    assertThat(PEERS.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
    DATABASE.stop();
    try (var files = Files.walk(TEMP)) {
      for (Path file : files.sorted(java.util.Comparator.reverseOrder()).toList()) {
        Files.deleteIfExists(file);
      }
    }
  }
}
