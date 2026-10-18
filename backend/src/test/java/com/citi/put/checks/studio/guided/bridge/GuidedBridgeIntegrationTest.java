package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
import com.fasterxml.jackson.databind.JsonNode;
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
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
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
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/** Real PostgreSQL + real mutually authenticated HTTPS in both directions + actual Chromium. */
@SpringBootTest(
    classes = GuidedBridgeIntegrationTest.Application.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false"
    })
class GuidedBridgeIntegrationTest {
  static final GuidedContracts CONTRACTS = new GuidedContracts();
  static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");
  static final Path TEMP;
  static final Path DIST;
  static final RunnerTestTls RUNNER_TLS;

  /** The backend's identity toward the runner: also the guided runner client's context. */
  static final SSLContext TLS;

  /** What the runner (a worker calling the backend, or a double standing in for it) presents. */
  static final SSLContext RUNNER_SIDE;

  static final KeyPair ISSUER;
  static final int RUNNER_PORT;
  static final HttpServer APPLICATION;
  static final AtomicInteger NAVIGATIONS = new AtomicInteger(), CONNECTIONS = new AtomicInteger();
  static final AtomicReference<String> RECEIPT = new AtomicReference<>();
  static final String CAPTURE = "  independent-" + UUID.randomUUID() + "-é😀  ";
  static final String PASSWORD_ECHO = "password-canary-" + UUID.randomUUID();
  static final String ORDINARY_ECHO = "  ordinary-canary-" + UUID.randomUUID() + "  ";
  static final AtomicInteger ECHO_NAVIGATIONS = new AtomicInteger(),
      TOGGLE_ATTEMPTS = new AtomicInteger();
  static volatile boolean privacyEcho, nativeToggle;
  static final String CONFIG_INPUT = "configured-" + UUID.randomUUID();
  static final String ORIGIN;
  static volatile boolean replaceTarget,
      wideSession,
      genericRead,
      belowFold,
      multiStep,
      dropCompletionCallbacks;
  static volatile boolean failClaims, corruptClaimResponse;
  static final java.util.concurrent.atomic.AtomicBoolean HOLD_NEXT_REFRESH =
      new java.util.concurrent.atomic.AtomicBoolean();
  static volatile CountDownLatch refreshCallbackHeld = new CountDownLatch(1),
      releaseRefreshCallback = new CountDownLatch(1);
  static volatile long slowNavigationMillis;
  static final java.util.concurrent.atomic.AtomicBoolean HOLD_NEXT_CLAIM =
      new java.util.concurrent.atomic.AtomicBoolean();
  static volatile CountDownLatch claimResponseCaptured = new CountDownLatch(1);
  static volatile CountDownLatch releaseClaimResponse = new CountDownLatch(1);
  static final AtomicInteger MUTATIONS = new AtomicInteger();
  static final AtomicInteger CLICK_RECEIPTS = new AtomicInteger();
  static final AtomicInteger FILL_RECEIPTS = new AtomicInteger();

  static {
    try {
      TEMP = Files.createTempDirectory("guided-bridge-");
      // STUDIO-OBS-009 AC-12 i: no private copy of dist. The harness spawns the real folded entry
      // point and records the digest of what it spawned; the sole rebuild is the F-merge's.
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
              "guided/schemas.json")) {
        hashes.put(
            relative,
            HexFormat.of()
                .formatHex(
                    MessageDigest.getInstance("SHA-256")
                        .digest(Files.readAllBytes(DIST.resolve(relative)))));
      }
      hashes.put(
          "scripts/browser-provenance.mjs",
          HexFormat.of()
              .formatHex(
                  MessageDigest.getInstance("SHA-256")
                      .digest(
                          Files.readAllBytes(
                              Path.of("../studio-runner/scripts/browser-provenance.mjs")))));
      Files.writeString(
          Path.of("/tmp/studio-obs004-tested-worker.json"), workerEvidence.toString());
      // One test CA (lane D3.0): the runner and the backend certificates chain to it, the runner
      // pins
      // the backend certificate, and the backend trusts only the CA.
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
      ORIGIN = "http://127.0.0.1:" + APPLICATION.getAddress().getPort();
      APPLICATION.createContext(
          "/connect",
          exchange -> {
            CONNECTIONS.incrementAndGet();
            byte[] body = "controlled-public-fixture-account".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
          });
      APPLICATION.createContext(
          "/start",
          exchange -> {
            NAVIGATIONS.incrementAndGet();
            if (slowNavigationMillis > 0) {
              try {
                Thread.sleep(slowNavigationMillis);
              } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
              }
            }
            String html =
                "<html><body><main aria-label='Operations'><output aria-label='Order number' "
                    + "data-testid='source'>"
                    + CAPTURE
                    + "</output></main><input aria-label='Destination' data-testid='destination' "
                    + "oninput=\"fetch('/receipt',{method:'POST',body:this.value})\"><button "
                    + "data-testid='replace' onclick=\"document.querySelector('[data-testid=destin"
                    + "ation]').outerHTML='<input data-testid=destination "
                    + "aria-label=Destination>'\">Replace</button><script>setInterval(async()=>{if"
                    + "(await (await fetch('/mutation')).text()==='yes'){document.querySelector('["
                    + "data-testid=destination]').outerHTML='<input data-testid=destination "
                    + "aria-label=Destination>';await "
                    + "fetch('/mutated',{method:'POST'});}},25)</script></body></html>";
            if (genericRead) {
              html =
                  "<html><body><main aria-label='Operations'>"
                      + "<output aria-label='Order reference'>"
                      + CAPTURE
                      + "</output>"
                      + "<label>Destination<textarea oninput=\"fetch('/receipt',"
                      + "{method:'POST',body:this.value})\"></textarea></label>"
                      + "</main></body></html>";
            }
            if (privacyEcho) {
              html =
                  "<html><body><input type='password' aria-label='Login secret' value='"
                      + PASSWORD_ECHO
                      + "'><input aria-label='Ordinary input' value='"
                      + ORDINARY_ECHO
                      + "'></body></html>";
            }
            if (nativeToggle) {
              html =
                  "<html><body><input type='checkbox' aria-label='Prevented toggle' "
                      + "onclick=\"event.preventDefault();fetch('/toggle',{method:'POST'})\">"
                      + "<input type='radio' checked aria-label='Selected radio' "
                      + "onclick=\"fetch('/toggle',{method:'POST'})\"></body></html>";
            }
            if (belowFold) {
              html =
                  html.replace(
                      "</body>",
                      "<div style='height:2200px'></div>"
                          + "<button aria-label='Continue' onclick=\"fetch('/clicked',"
                          + "{method:'POST'})\">Continue</button></body>");
            }
            byte[] body = html.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
          });
      APPLICATION.createContext(
          "/echo",
          exchange -> {
            ECHO_NAVIGATIONS.incrementAndGet();
            byte[] bytes =
                ("<html><body><button>"
                        + PASSWORD_ECHO
                        + "</button><button>"
                        + ORDINARY_ECHO.strip()
                        + "</button></body></html>")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
          });
      APPLICATION.createContext(
          "/toggle",
          exchange -> {
            TOGGLE_ATTEMPTS.incrementAndGet();
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          });
      APPLICATION.createContext(
          "/receipt",
          exchange -> {
            FILL_RECEIPTS.incrementAndGet();
            RECEIPT.set(
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          });
      APPLICATION.createContext(
          "/mutation",
          exchange -> {
            byte[] body = (replaceTarget ? "yes" : "no").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
          });
      APPLICATION.createContext(
          "/mutated",
          exchange -> {
            replaceTarget = false;
            MUTATIONS.incrementAndGet();
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          });
      APPLICATION.createContext(
          "/clicked",
          exchange -> {
            if (exchange.getRequestMethod().equals("POST")) {
              CLICK_RECEIPTS.incrementAndGet();
            }
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          });
      APPLICATION.start();
      DATABASE.start();
      // STUDIO-OBS-012A / ADR-SC-005 D-B: the re-baselined schema head (core V1–V11 + V12–V18).
      Flyway.configure()
          .dataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword())
          .locations("classpath:db/migration")
          .target("22") // STUDIO-OBS-014 S3: governance tables (V19) at head
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
    org.springframework.boot.web.servlet.FilterRegistrationBean<jakarta.servlet.Filter>
        completionFault() {
      jakarta.servlet.Filter filter =
          (request, response, chain) -> {
            String uri = ((jakarta.servlet.http.HttpServletRequest) request).getRequestURI();
            var http = (jakarta.servlet.http.HttpServletResponse) response;
            String callbackKey =
                ((jakarta.servlet.http.HttpServletRequest) request).getHeader("Idempotency-Key");
            if (uri.endsWith("/observations")
                && callbackKey != null
                && callbackKey.startsWith("oref-")
                && HOLD_NEXT_REFRESH.compareAndSet(true, false)) {
              refreshCallbackHeld.countDown();
              try {
                releaseRefreshCallback.await(10, TimeUnit.SECONDS);
              } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
              }
            }
            if (dropCompletionCallbacks && (uri.endsWith("/outcomes") || uri.endsWith("/lifecycle"))
                || failClaims && uri.endsWith("/claim")) {
              http.setStatus(503);
              return;
            }
            if (uri.endsWith("/claim") && (corruptClaimResponse || HOLD_NEXT_CLAIM.get())) {
              var buffered = new org.springframework.web.util.ContentCachingResponseWrapper(http);
              chain.doFilter(request, buffered);
              if (buffered.getStatus() == 202 && corruptClaimResponse) {
                ObjectNode grant =
                    (ObjectNode)
                        CONTRACTS.parse(
                            new String(buffered.getContentAsByteArray(), StandardCharsets.UTF_8));
                grant
                    .withObject("/owner")
                    .put("fence", grant.path("owner").path("fence").asInt() + 1);
                byte[] changed = grant.toString().getBytes(StandardCharsets.UTF_8);
                buffered.resetBuffer();
                buffered.setContentLength(changed.length);
                buffered.getOutputStream().write(changed);
              }
              if (buffered.getStatus() == 202 && HOLD_NEXT_CLAIM.compareAndSet(true, false)) {
                claimResponseCaptured.countDown();
                try {
                  releaseClaimResponse.await(15, TimeUnit.SECONDS);
                } catch (InterruptedException failure) {
                  Thread.currentThread().interrupt();
                }
              }
              buffered.copyBodyToResponse();
              return;
            }
            chain.doFilter(request, response);
          };
      return new org.springframework.boot.web.servlet.FilterRegistrationBean<>(filter);
    }

    @Bean
    DataSource dataSource() {
      return new DriverManagerDataSource(
          DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
    }

    @Bean
    JdbcTemplate jdbc(DataSource source) {
      return new JdbcTemplate(source);
    }

    @Bean
    GuidedContracts contracts() {
      return CONTRACTS;
    }

    @Bean
    GuidedSessionRepository repository(JdbcTemplate jdbc) {
      return new GuidedSessionRepository(
          jdbc,
          new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())),
          CONTRACTS);
    }

    @Bean
    FixtureAccess access(JdbcTemplate jdbc) {
      return new FixtureAccess(jdbc);
    }

    @Bean
    GuidedMaterializationService materialization(JdbcTemplate jdbc) {
      return new GuidedMaterializationService(jdbc, CONTRACTS);
    }

    @Bean
    GuidedSessionService service(
        GuidedSessionRepository repository,
        FixtureAccess access,
        JdbcTemplate jdbc,
        GuidedMaterializationService materialization) {
      var service =
          new GuidedSessionService(
              repository,
              CONTRACTS,
              access,
              new GuidedSessionProperties(true, Map.of()),
              Clock.systemUTC());
      service.installBridge(
          materialization,
          new GuidedPreparationStore(jdbc, CONTRACTS),
          new GuidedBindingStore(jdbc, CONTRACTS, materialization),
          new com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore(jdbc, CONTRACTS));
      // Single path: production always installs translation (GuidedSessionConfiguration).
      service.installTranslation(
          new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, CONTRACTS),
          new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
              jdbc, CONTRACTS));
      // STUDIO-OBS-014 S3: one uniform governed policy for the class (ar-mounted-rules B14).
      com.citi.put.checks.studio.support.ObservedPublicationFixture.installGovernance(
          service,
          jdbc,
          "CSI-123",
          "orders",
          "fixture",
          java.util.List.of(ORIGIN),
          governedPolicy());
      return service;
    }

    @Bean
    GuidedRunnerClient runner() {
      return new GuidedRunnerClient(
          URI.create("https://127.0.0.1:" + RUNNER_PORT),
          TLS,
          () -> token("backend-controller", "controller-1", "studio-guided-runner"),
          CONTRACTS);
    }

    @Bean
    GuidedDispatchService dispatch(
        GuidedSessionService sessions,
        GuidedMaterializationService materialization,
        GuidedRunnerClient runner) {
      var dispatch = new GuidedDispatchService(sessions, materialization, runner);
      sessions.installStopSender(dispatch::stop);
      return dispatch;
    }
  }

  /**
   * The class's governed observation application policy (ar-mounted-rules B14): a structural policy
   * with one business-read grant on {@code <main aria-label='Operations'>}. On pages without that
   * anchor (privacyEcho, nativeToggle, /echo) the grant yields no candidate, so the uniform policy
   * behaves as "no grants" there.
   */
  static ObjectNode governedPolicy() {
    ObjectNode policy =
        CONTRACTS
            .object()
            .put("policyRuleId", "structural-policy")
            .put("allowStructuralDiscovery", true);
    ObjectNode grant =
        CONTRACTS.object().put("policyRuleId", "business-read").put("origin", ORIGIN);
    grant
        .putObject("region")
        .put("kind", "role")
        .put("role", "main")
        .put("name", "Operations")
        .put("exact", true);
    grant.putObject("visibleText").put("classification", "permittedBusinessData");
    grant
        .putObject("controlValue")
        .put("classification", "nonsecretApproved")
        .putArray("types")
        .add("text")
        .add("textarea");
    policy.putArray("readGrants").add(grant);
    return policy;
  }

  static class FixtureAccess implements GuidedSessionAccess, GuidedSessionService.StepVerifier {
    final JdbcTemplate jdbc;

    FixtureAccess(JdbcTemplate jdbc) {
      this.jdbc = jdbc;
    }

    @Override
    public Snapshot resolve(Authentication principal, JsonNode start) {
      assertThat(CONNECTIONS.get()).isGreaterThan(0);
      ObjectNode scope =
          CONTRACTS
              .object()
              .put("principalId", "user-1")
              .put("csiId", "CSI-123")
              .put("environmentId", "fixture")
              .put("applicationId", "orders")
              .put("sourceRevision", "source-1")
              .put("configurationRevision", "config-1")
              .put("modelDataPolicyId", "labels-only-1")
              .putNull("valueTransferPolicyId");
      scope.putArray("approvedOrigins").add(ORIGIN);
      scope
          .putArray("capabilities")
          .add("observe")
          .add("navigate")
          .add("read")
          .add("fill")
          .add("click")
          .add("check")
          .add("uncheck")
          .add("assert");
      var steps = CONTRACTS.object().putArray("steps");
      steps.add(CONTRACTS.object().put("stepId", "step-1").put("requiresAssertion", false));
      if (wideSession) {
        for (int n = 1; n < 100; n++) {
          steps.add(
              CONTRACTS
                  .object()
                  .put("stepId", n + "😀".repeat(250))
                  .put("requiresAssertion", false));
        }
      }
      if (multiStep) {
        steps.add(CONTRACTS.object().put("stepId", "step-2").put("requiresAssertion", false));
      }
      return new Snapshot(scope, steps);
    }

    /** Controlled two-step semantics only; never a production English/question verifier. */
    @Override
    public boolean complete(JsonNode session, JsonNode completion, List<ObjectNode> actions) {
      if (!multiStep
          || !completion.path("stepId").asText().equals("step-1")
          || actions.size() != 2) {
        return false;
      }
      var kinds =
          actions.stream()
              .map(
                  action ->
                      CONTRACTS
                          .parse(
                              jdbc.queryForObject(
                                  "SELECT proposal::text FROM studio_guided_actions WHERE admission_id=?",
                                  String.class,
                                  action.path("admission").path("admissionId").asText()))
                          .path("operation")
                          .path("kind")
                          .asText())
              .toList();
      return kinds.equals(List.of("navigate", "read"))
          && NAVIGATIONS.get() == 1
          && jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_producers WHERE session_id=?",
                  Integer.class,
                  session.path("sessionId").asText())
              == 1;
    }

    @Override
    public void checkCurrent(JsonNode session) {}

    @Override
    public void checkUser(Authentication principal, JsonNode session) {
      GuidedSessionException.require(
          principal instanceof BffAuthenticationToken
              && ((BffAuthenticationToken) principal).getPrincipal().userId().equals("user-1"),
          "FORBIDDEN_SCOPE",
          403);
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {
      String revision =
          jdbc.queryForObject(
              "SELECT revision FROM bridge_fixture_sources WHERE id=1 FOR SHARE", String.class);
      GuidedSessionException.require(
          revision.equals(session.path("scope").path("sourceRevision").asText()),
          "REVISION_CONFLICT",
          409);
      String configurationRevision =
          jdbc.queryForObject(
              "SELECT revision FROM bridge_fixture_configuration WHERE id=1 FOR SHARE",
              String.class);
      GuidedSessionException.require(
          configurationRevision.equals(
              session.path("scope").path("configurationRevision").asText()),
          "REVISION_CONFLICT",
          409);
    }

    @Override
    public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
      String text =
          jdbc.queryForObject("SELECT source FROM bridge_fixture_sources WHERE id=1", String.class);
      return new GuidedSourceReferenceValidator.Sources(
          "source-1",
          "config-1",
          Map.of(
              "step-1",
              new GuidedSourceReferenceValidator.Source(
                  text,
                  List.of(new GuidedSourceReferenceValidator.ClassifiedRegion(0, text.length())))),
          Map.of(
              "config-value",
              new GuidedSourceReferenceValidator.ConfigurationValue(
                  jdbc.queryForObject(
                      "SELECT input_value FROM bridge_fixture_configuration WHERE id=1",
                      String.class),
                  "step-1",
                  "nonsecretText",
                  "fill.value",
                  session.path("scopeHash").asText(),
                  true)));
    }
  }

  @LocalServerPort int backendPort;
  @Autowired GuidedSessionService sessions;
  @Autowired GuidedSessionRepository repository;
  @Autowired GuidedMaterializationService materialization;
  @Autowired GuidedDispatchService dispatch;
  @Autowired GuidedRunnerClient runner;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource fixtureDataSource;
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

  @BeforeEach
  void startWorker(org.junit.jupiter.api.TestInfo testInfo) throws Exception {
    String testName = testInfo.getTestMethod().orElseThrow().getName();
    privacyEcho =
        testName.equals(
            "uncapturedPasswordAndInputEchoesStayPrivateAcrossActualDocumentNavigation");
    nativeToggle =
        testName.equals("preventedNativeToggleNeverCommitsSuccessOrRetries")
            || testName.equals("nativeRadioUncheckIsRefusedBeforeAnyBrowserAttempt");
    ECHO_NAVIGATIONS.set(0);
    TOGGLE_ATTEMPTS.set(0);
    genericRead =
        testInfo
            .getTestMethod()
            .orElseThrow()
            .getName()
            .equals("configuredRegionReadGrantNeedsNoTestIdsOrPerControlRules");
    belowFold =
        testInfo
            .getTestMethod()
            .orElseThrow()
            .getName()
            .equals("belowFoldClickUsesNativeRevealAndOneReceipt");
    CLICK_RECEIPTS.set(0);
    FILL_RECEIPTS.set(0);
    multiStep =
        testInfo
            .getTestMethod()
            .orElseThrow()
            .getName()
            .equals("freshObservationConnectsTwoAuthoredStepsWithoutReplayingProducer");
    genericRead = genericRead || multiStep;
    String isolatedDatabase = "bridge_" + UUID.randomUUID().toString().replace("-", "");
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
    jdbc.execute(
        "CREATE TABLE IF NOT EXISTS bridge_fixture_sources(id integer PRIMARY "
            + "KEY,revision text NOT NULL,source text NOT NULL)");
    jdbc.update(
        "INSERT INTO bridge_fixture_sources VALUES (1,'source-1',?) ON CONFLICT(id) DO "
            + "UPDATE SET revision='source-1',source=excluded.source",
        "Visit "
            + ORIGIN
            + "/start then copy the displayed order into Destination and type fixture-input."
            + (privacyEcho ? " Then visit " + ORIGIN + "/echo." : ""));
    jdbc.execute(
        "CREATE TABLE IF NOT EXISTS bridge_fixture_configuration(id integer PRIMARY KEY,"
            + "revision text NOT NULL,input_value text NOT NULL)");
    jdbc.update(
        "INSERT INTO bridge_fixture_configuration VALUES (1,'config-1',?)"
            + " ON CONFLICT(id) DO UPDATE SET revision='config-1',input_value=excluded.input_value",
        CONFIG_INPUT);
    // STUDIO-OBS-014 S3b: each test runs on a freshly migrated isolated database, so the class's
    // approved governed policy is seeded here; the bean-time seed only reached the base database.
    com.citi.put.checks.studio.support.ObservedPublicationFixture.seedPolicy(
        jdbc, "CSI-123", "orders", "fixture", List.of(ORIGIN), governedPolicy(), "ALLOW");
    HOLD_NEXT_REFRESH.set(false);
    refreshCallbackHeld = new CountDownLatch(1);
    releaseRefreshCallback = new CountDownLatch(1);
    dropCompletionCallbacks = false;
    failClaims = false;
    corruptClaimResponse = false;
    slowNavigationMillis = 0;
    HOLD_NEXT_CLAIM.set(false);
    claimResponseCaptured = new CountDownLatch(1);
    releaseClaimResponse = new CountDownLatch(1);
    NAVIGATIONS.set(0);
    CONNECTIONS.set(0);
    RECEIPT.set(null);
    replaceTarget = false;
    wideSession = false;
    MUTATIONS.set(0);
    Files.writeString(
        TEMP.resolve("worker.jwt"), token("owning-worker", "worker-1", "studio-guided-controller"));
    Path journal = Files.createTempDirectory(TEMP, "journal-");
    // STUDIO-OBS-009 AC-3 / AC-12 h: the one folded entry point over TLS, spawned and reaped by the
    // harness. STUDIO-OBS-013/014 S3: a per-class object store, never a shared default directory.
    workerHarness =
        RunnerProcessHarness.builder(RUNNER_TLS)
            .port(RUNNER_PORT)
            .workDirectory(Files.createTempDirectory(TEMP, "runner-"))
            .callbackBaseUrl("https://localhost:" + backendPort)
            .env(RunnerProcessHarness.KEY_OBJECT_STORE_DIR, TEMP.resolve("objects").toString())
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
    releaseClaimResponse.countDown();
    releaseRefreshCallback.countDown();
    var harness = workerHarness;
    workerHarness = null;
    if (harness != null) {
      // AC-11 k / I-T1: stop the runner and everything it left. The privacy oracle reads the log
      // first; then a clean exit is asserted (exit 0, no force within the guided grace) and no
      // survivor.
      var report = harness.teardown();
      assertThat(Files.readString(harness.logFile()))
          .doesNotContain(CAPTURE, PASSWORD_ECHO, ORDINARY_ECHO.strip());
      report.assertNoSurvivors();
      report.assertCleanExit();
    }
  }

  @AfterAll
  static void close() {
    APPLICATION.stop(0);
    DATABASE.stop();
  }

  @Test
  void actualServiceTransportRejectsWrongAudienceSubjectFenceAndTuple() throws Exception {
    String id = prepareSession();
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    ObjectNode claim =
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("workerId", "worker-1")
            .put("expectedFence", 1);
    claim.set("versions", versions());
    post(
        id,
        "claim",
        claim,
        "audience",
        token("owning-worker", "worker-1", "studio-guided-runner"),
        401);
    post(
        id,
        "claim",
        claim,
        "subject",
        token("owning-worker", "wrong-worker", "studio-guided-controller"),
        403);
    ObjectNode incompatible = context.deepCopy();
    incompatible.withObject("/versions").put("executor", "observed-1");
    // ar-2-r14-stops ruling 2: the runner's closed 409 refusal of an incompatible context is
    // definite, so it surfaces as terminal RUNTIME_INCOMPATIBLE (not the uncertain
    // UNKNOWN_OUTCOME).
    assertThatThrownBy(() -> runner.send("context", incompatible))
        .isInstanceOfSatisfying(
            com.citi.put.checks.studio.guided.session.GuidedSessionException.class,
            refused -> {
              assertThat(refused).hasMessage("RUNTIME_INCOMPATIBLE");
              assertThat(refused.messageCode()).isEqualTo(GuidedRunnerClient.CONTEXT_REFUSED);
              assertThat(refused.retryable()).isFalse();
            });
    ObjectNode wrong = context.deepCopy();
    wrong.put("ownerFence", 2);
    final ObjectNode changed = wrong;
    // Backend callback fence/header disagreement fails even with a valid worker token.
    ObjectNode callback = materialization.identity(changed);
    callback.put("reason", "CONTEXT_LOST");
    post(
        id,
        "lifecycle",
        callback,
        "fence",
        token("owning-worker", "worker-1", "studio-guided-controller"),
        409);
    assertThat(NAVIGATIONS.get()).isZero();
    assertThat(actionCount(id)).isZero();
  }

  int actionCount(String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_actions WHERE session_id=?", Integer.class, id);
  }

  JsonNode action(String id) {
    return CONTRACTS.parse(
        jdbc.queryForObject(
            "SELECT document::text FROM studio_guided_actions WHERE session_id=? ORDER BY "
                + "ordinal LIMIT 1",
            String.class,
            id));
  }

  ObjectNode navigation(String id) {
    ObjectNode proposal = proposal(id, 0, "navigate", null);
    proposal
        .withObject("/operation")
        .put(
            "destinationInputId",
            sessions
                .runnerContext(controller, id, 1)
                .path("authoredInputs")
                .path("inputs")
                .get(0)
                .path("inputId")
                .asText());
    return proposal;
  }

  ObjectNode advanceRequest(String id, JsonNode ledger) {
    return CONTRACTS
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

  @Test
  void callbackAcceptsValidUnicodeSessionLargerThan64KiB() throws Exception {
    wideSession = true;
    String id = prepareSession();
    JsonNode session = repository.transaction(() -> repository.lock(id).document());
    CONTRACTS.validate("v3/session", session);
    assertThat(session.toString().getBytes(StandardCharsets.UTF_8).length)
        .isGreaterThan(65536)
        .isLessThan(1048576);
    dispatch.pushContext(controller, id, 1);
    assertThat(progress(id).path("executionEvidence").path("kind").asText())
        .isEqualTo("initialBlank");
    assertThat(NAVIGATIONS.get()).isZero();
  }

  /**
   * STUDIO-OBS-015 H8: the real worker closes on the first stop, but every acknowledgement of the
   * original send and of both immediate re-sends is lost; the reaper's re-drive then confirms. All
   * four sends carry one canonical body, so one deterministic {@code teardown-<hash>} key: the
   * runner replays its original stop rather than adding a replay entry per attempt.
   */
  @Test
  void stopRetryAfterCloseCompletesConfirmsWithSameKey() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    var digests = new java.util.concurrent.CopyOnWriteArrayList<String>();
    var observer =
        GuidedRunnerClient.class.getDeclaredMethod(
            "observeRequestBytes", java.util.function.Consumer.class);
    observer.setAccessible(true);
    observer.invoke(
        runner,
        (java.util.function.Consumer<byte[]>)
            bytes -> {
              JsonNode body = CONTRACTS.parse(new String(bytes, StandardCharsets.UTF_8));
              if (body.has("reason") && body.path("sessionId").asText().equals(id)) {
                digests.add(GuidedContracts.hash(body));
              }
            });
    var lost = new AtomicInteger();
    sessions.installStopSender(
        (target, reason) -> {
          if (!target.path("sessionId").asText().equals(id)) {
            throw new IllegalStateException("FOREIGN_SESSION");
          }
          dispatch.stop(target, reason);
          if (lost.incrementAndGet() <= 3) {
            throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
          }
        });
    try {
      sessions.cancel(
          user,
          id,
          "cancel",
          CONTRACTS.object().put("schemaVersion", 3).put("reason", "userRequested"));
      await(() -> lost.get() == 3 && !sessions.teardownInFlight(id), 60000);
      assertThat(progress(id).path("teardownStatus").asText()).isEqualTo("PENDING");
      assertThat(progress(id).path("teardownRequest").path("reason").asText())
          .isEqualTo("CANCELLED");
      assertThat(progress(id).path("teardownRequest").path("target").has("authoredInputs"))
          .isFalse();

      sessions.redriveTeardowns(Duration.ofMinutes(15), 32);

      await(() -> progress(id).path("teardownStatus").asText().equals("CONFIRMED"), 30000);
      assertThat(lost.get()).isEqualTo(4);
      assertThat(progress(id).has("teardownRequest")).isFalse();
      assertThat(digests).hasSize(4).containsOnly(digests.getFirst());
    } finally {
      sessions.installStopSender(dispatch::stop);
      observer.invoke(runner, (Object) null);
    }
  }

  /**
   * STUDIO-OBS-009 I-T2 (ruling W1.5 part 1, D5): the guided browser is wedged (SIGSTOP) when the
   * session ends through the backend's normal path. The runner bounds its own close, so the first
   * stop send is answered 200 inside the backend's 15 s deadline (never {@code UNKNOWN_OUTCOME}),
   * the teardown is confirmed, the one capacity slot is free for a second session, and no browser
   * of this runner survives. It needs a {@code dist} that carries the D5 close bound, so it is
   * credited only on the F-merge {@code dist} digest.
   */
  @Test
  void aWedgedGuidedBrowserIsTerminatedInsideTheBackendDeadlineAndTheSlotIsReleased()
      throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    List<RunnerProcessHarness.ProcessFact> browsers = workerHarness.survivingGuidedBrowsers();
    assertThat(browsers).as("the guided launch left its browser under this runner").isNotEmpty();
    assertThat(workerHarness.freeze(browsers)).hasSameSizeAs(browsers);
    var sends = new java.util.concurrent.CopyOnWriteArrayList<String>();
    var millis = new java.util.concurrent.CopyOnWriteArrayList<Long>();
    sessions.installStopSender(
        (target, reason) -> {
          long started = System.nanoTime();
          try {
            dispatch.stop(target, reason);
            sends.add("OK");
          } catch (RuntimeException failure) {
            sends.add(String.valueOf(failure.getMessage()));
            throw failure;
          } finally {
            millis.add(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
          }
        });
    try {
      sessions.cancel(
          user,
          id,
          "cancel",
          CONTRACTS.object().put("schemaVersion", 3).put("reason", "userRequested"));
      await(() -> progress(id).path("teardownStatus").asText().equals("CONFIRMED"), 60000);
    } finally {
      sessions.installStopSender(dispatch::stop);
    }
    assertThat(sends).as("the first stop send was answered 200").first().isEqualTo("OK");
    assertThat(millis.get(0)).as("inside the 15 s backend deadline").isLessThanOrEqualTo(15000L);
    String next = createSession();
    assertThat(dispatch.assign(controller, next, "assignment", "worker-1").path("status").asText())
        .isEqualTo("OWNED");
    assertThat(workerHarness.survivingGuidedBrowsers()).isEmpty();
    workerHarness.teardown().assertNoSurvivors();
  }

  ObjectNode proposalByLocator(String id, int ordinal, String kind, JsonNode locator) {
    ObjectNode proposal = proposal(id, ordinal, kind, null);
    JsonNode selected = null;
    for (JsonNode node : progress(id).path("observation").path("nodes")) {
      for (JsonNode hint : node.path("locatorHints")) {
        if (hint.equals(locator)) {
          assertThat(selected).isNull();
          selected = node;
        }
      }
    }
    assertThat(selected).isNotNull();
    ObjectNode target = proposal.withObject("/target");
    target.remove("kind");
    target.put("nodeId", selected.path("nodeId").asText());
    target.set("locator", locator);
    return proposal;
  }

  @Test
  void assignmentRenewsBeforeContextAndCancellationReleasesItsOnlyCapacitySlot() throws Exception {
    String id = createSession();
    JsonNode owned = dispatch.assign(controller, id, "assignment", "worker-1");
    Instant originalLease = Instant.parse(owned.path("leaseExpiresAt").asText());
    await(() -> claimCount(id) >= 2, 15000);
    assertThat(Instant.parse(session(id).path("owner").path("leaseExpiresAt").asText()))
        .isAfter(originalLease);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
    assertThat(progress(id).has("executionEvidence")).isFalse();
    assertThat(NAVIGATIONS.get()).isZero();
    JsonNode current = dispatch.assign(controller, id, "assignment", "worker-1");
    assertThat(Instant.parse(current.path("leaseExpiresAt").asText())).isAfter(originalLease);
    sessions.cancel(
        user,
        id,
        "cancel-before-context",
        CONTRACTS.object().put("schemaVersion", 3).put("reason", "userRequested"));
    await(() -> progress(id).path("teardownStatus").asText().equals("CONFIRMED"), 5000);
    assertThatThrownBy(() -> runner.send("assign", assignment(id), "assignment"))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThat(
            jdbc.queryForObject(
                "SELECT receipt->>'status' FROM studio_guided_assignments WHERE session_id=?",
                String.class,
                id))
        .isEqualTo("OWNED");
    String next = createSession();
    assertThat(dispatch.assign(controller, next, "assignment", "worker-1").path("status").asText())
        .isEqualTo("OWNED");
    assertThat(NAVIGATIONS.get()).isZero();
  }

  @Test
  void invalidAcknowledgedClaimNeverLaunchesAndUnassignedOrWrongWorkersCannotClaim()
      throws Exception {
    String id = createSession();
    ObjectNode claim =
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("workerId", "worker-1")
            .put("expectedFence", 0);
    claim.set("versions", versions());
    // Adversarial credentials are used only for negative probes, never the positive ownership path.
    post(
        id,
        "claim",
        claim,
        "unassigned",
        token("owning-worker", "worker-1", "studio-guided-controller"),
        403);
    sessions.prepareAssignment(controller, id, "assignment", "worker-1");
    post(
        id,
        "claim",
        claim.deepCopy().put("workerId", "other-worker"),
        "wrong-assignee",
        token("owning-worker", "other-worker", "studio-guided-controller"),
        403);
    corruptClaimResponse = true;
    assertThatThrownBy(() -> dispatch.assign(controller, id, "assignment", "worker-1"))
        .isInstanceOf(GuidedSessionException.class);
    await(() -> session(id).path("state").asText().equals("FAILED"), 5000);
    assertThat(NAVIGATIONS.get()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
  }

  @Test
  void maximumFenceCanBeRenewedBySameOwnerWithoutAnotherAcquisition() throws Exception {
    String id = createSession();
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().withObject("/owner").put("fence", Integer.MAX_VALUE - 1);
          repository.save(current);
          return null;
        });
    JsonNode receipt = dispatch.assign(controller, id, "max-fence", "worker-1");
    assertThat(receipt.path("ownerFence").asInt()).isEqualTo(Integer.MAX_VALUE);
    await(() -> claimCount(id) >= 2, 15000);
    assertThat(session(id).path("owner").path("fence").asInt()).isEqualTo(Integer.MAX_VALUE);
    assertThat(NAVIGATIONS.get()).isZero();
  }

  JsonNode session(String id) {
    return CONTRACTS.parse(
        jdbc.queryForObject(
            "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  JsonNode assignment(String id) {
    return CONTRACTS.parse(
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

  @Test
  void legacyClarificationAnswerCannotResumeObservedV2Session() throws Exception {
    String id = prepareSession();
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().put("state", "AWAITING_CLARIFICATION");
          repository.save(current);
          return null;
        });
    JsonNode before = progress(id).deepCopy();
    // STUDIO-OBS-012A: the v1 contract generation is deleted, so a schemaVersion-1 question is a
    // closed-contract refusal against contracts/v3 (it was RUNTIME_INCOMPATIBLE while the v1
    // schemas still loaded). The literal is the former v1 fixture document, kept as the legacy
    // body.
    ObjectNode legacyQuestion =
        (ObjectNode)
            CONTRACTS.parse(
                "{\"schemaVersion\":1,\"clarificationId\":\"question-1\",\"sessionId\":\"session-1\","
                    + "\"scopeHash\":\"2fec131b52b0144e082e963564fc3d114f068e5ef4d795a82c8f3b5653186861\","
                    + "\"coordinate\":{\"stepId\":\"step-2\",\"ordinal\":0},\"documentId\":\"document-1\","
                    + "\"generation\":1,\"reason\":\"AMBIGUOUS_TARGET\",\"promptCode\":\"CHOOSE_FIELD\","
                    + "\"choices\":[{\"choiceId\":\"choice-1\",\"safeLabel\":\"Order reference\","
                    + "\"nodeId\":\"node-1\",\"bindingId\":null}],\"expiresAt\":\"2026-10-08T03:10:00Z\"}");
    legacyQuestion.put("sessionId", id);
    assertThatThrownBy(
            () -> sessions.clarification(controller, id, 1, "legacy-question", legacyQuestion))
        .hasMessage("INVALID_CONTRACT");

    ObjectNode answer =
        CONTRACTS
            .object()
            .put("schemaVersion", 1)
            .put("clarificationId", "old-question")
            .put("choiceId", "old-choice")
            .put("generation", 0);
    assertThatThrownBy(() -> sessions.clarify(user, id, "legacy-answer", answer))
        .hasMessage("INVALID_CONTRACT");
    assertThat(session(id).path("state").asText()).isEqualTo("AWAITING_CLARIFICATION");
    assertThat(progress(id)).isEqualTo(before);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='clarify'",
                Integer.class,
                id))
        .isZero();
  }

  @Test
  void actualAuthenticatedRawBytesRejectAmbiguityAndUnknownSignedClaims() throws Exception {
    String id = prepareSession();
    ObjectNode claim =
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("workerId", "worker-1")
            .put("expectedFence", 1);
    claim.set("versions", versions());
    String valid = claim.toString();
    var payloads = new java.util.ArrayList<byte[]>();
    for (String raw :
        List.of(
            valid + " {}",
            valid.replace("\"schemaVersion\":3", "\"schemaVersion\":3,\"schemaVersion\":3"),
            valid.replace("\"workerId\":", "\"workerId\":\"worker-1\",\"\\u0077orkerId\":"),
            valid.replace("\"contract\":3", "\"contract\":3,\"contract\":3"),
            valid.replace("\"expectedFence\":1", "\"expectedFence\":1.0"),
            valid.replace("\"expectedFence\":1", "\"expectedFence\":1e0"),
            valid.replace("\"expectedFence\":1", "\"expectedFence\":-0"))) {
      payloads.add(raw.getBytes(StandardCharsets.UTF_8));
    }
    byte[] invalid = valid.getBytes(StandardCharsets.UTF_8);
    int position = valid.indexOf("worker-1");
    invalid[position] = (byte) 0xc3;
    invalid[position + 1] = (byte) 0x28;
    payloads.add(invalid);
    int index = 0;
    for (byte[] payload : payloads) {
      var response =
          rawBackendPost(
              id,
              payload,
              "malformed-" + index++,
              token("owning-worker", "worker-1", "studio-guided-controller"));
      assertThat(response.statusCode()).isEqualTo(422);
      assertThat(CONTRACTS.parseWire(response.body()).path("code").asText())
          .isEqualTo("INVALID_CONTRACT");
    }
    long now = Instant.now().getEpochSecond();
    String claims =
        CONTRACTS
            .object()
            .put("iss", "fixture-issuer")
            .put("sub", "worker-1")
            .put("role", "owning-worker")
            .put("aud", "studio-guided-controller")
            .put("iat", now)
            .put("exp", now + 60)
            .put("unknownSignedClaim", "must-reject")
            .toString();
    String header =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
    String signed =
        header
            + "."
            + Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(claims.getBytes(StandardCharsets.UTF_8));
    Signature signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(ISSUER.getPrivate());
    signature.update(signed.getBytes(StandardCharsets.US_ASCII));
    String jwt =
        signed + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign());
    assertThat(
            rawBackendPost(id, valid.getBytes(StandardCharsets.UTF_8), "malformed-jwt", jwt)
                .statusCode())
        .isEqualTo(401);
    assertThat(
            jdbc.queryForObject(
                ("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND idempotency_key LIK"
                    + "E 'malformed-%'"),
                Integer.class,
                id))
        .isZero();
    assertThat(NAVIGATIONS.get()).isZero();
    assertThat(session(id).path("state").asText()).isEqualTo("PREPARING");
  }

  HttpResponse<byte[]> rawBackendPost(String id, byte[] body, String key, String bearer)
      throws Exception {
    return HttpClient.newBuilder()
        .sslContext(RUNNER_SIDE)
        .build()
        .send(
            HttpRequest.newBuilder(
                    URI.create(
                        "https://localhost:"
                            + backendPort
                            + "/internal/v2/studio/guided-sessions/"
                            + id
                            + "/claim"))
                .header("Authorization", "Bearer " + bearer)
                .header("Content-Type", "application/json")
                .header("Idempotency-Key", key)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .timeout(Duration.ofSeconds(10))
                .build(),
            HttpResponse.BodyHandlers.ofByteArray());
  }

  @Test
  void actualRunnerResponseBoundaryRejectsMalformedUtf8DuplicatesTrailingAndTimestampProfiles()
      throws Exception {
    String id = prepareSession();
    ObjectNode identity = materialization.identity(sessions.runnerContext(controller, id, 1));
    var proxy = com.sun.net.httpserver.HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    proxy.setHttpsConfigurator(
        new com.sun.net.httpserver.HttpsConfigurator(RUNNER_SIDE) {
          @Override
          public void configure(com.sun.net.httpserver.HttpsParameters parameters) {
            var ssl = RUNNER_SIDE.getDefaultSSLParameters();
            ssl.setNeedClientAuth(true);
            parameters.setSSLParameters(ssl);
          }
        });
    AtomicReference<byte[]> responseBytes = new AtomicReference<>();
    proxy.createContext(
        "/",
        exchange -> {
          exchange.getRequestBody().readAllBytes();
          byte[] bytes = responseBytes.get();
          exchange.getResponseHeaders().add("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    proxy.start();
    try {
      var client =
          new GuidedRunnerClient(
              URI.create("https://localhost:" + proxy.getAddress().getPort()),
              TLS,
              () -> token("backend-controller", "controller-1", "studio-guided-runner"),
              CONTRACTS);
      String valid = identity.toString();
      var payloads = new java.util.ArrayList<byte[]>();
      for (String raw :
          List.of(
              valid + " {}",
              valid.replace("\"schemaVersion\":3", "\"schemaVersion\":3,\"schemaVersion\":3"))) {
        payloads.add(raw.getBytes(StandardCharsets.UTF_8));
      }
      byte[] invalid = valid.getBytes(StandardCharsets.UTF_8);
      int position = valid.indexOf("worker-1");
      invalid[position] = (byte) 0xc3;
      invalid[position + 1] = (byte) 0x28;
      payloads.add(invalid);
      for (byte[] bytes : payloads) {
        responseBytes.set(bytes);
        assertThatThrownBy(() -> client.send("context", identity)).hasMessage("INVALID_CONTRACT");
      }
      responseBytes.set(valid.getBytes(StandardCharsets.UTF_8));
      assertThat(client.send("context", identity)).isEqualTo(identity);
      JsonNode intent = assignment(id);
      ObjectNode receipt =
          CONTRACTS.object().put("schemaVersion", 3).put("status", "OWNED").put("ownerFence", 1);
      receipt.set("assignment", intent);
      var vectors =
          CONTRACTS.parse(
              Files.readString(
                  Path.of(
                      "../docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json")));
      for (JsonNode vector : vectors.path("dateTimes")) {
        if (vector.path("accepted").asBoolean()) {
          continue;
        }
        receipt.put("leaseExpiresAt", vector.path("value").asText());
        responseBytes.set(receipt.toString().getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> client.send("assign", intent)).hasMessage("INVALID_CONTRACT");
      }
    } finally {
      proxy.stop(0);
    }
  }

  ObjectNode refreshRequest(String id) {
    ObjectNode request = materialization.identity(sessions.runnerContext(controller, id, 1));
    request.put("expectedGeneration", progress(id).path("generation").asInt());
    return request;
  }

  String createSession() throws Exception {
    var connection =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(URI.create(ORIGIN + "/connect")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    assertThat(connection.statusCode()).isEqualTo(200);
    assertThat(connection.body()).isEqualTo("controlled-public-fixture-account");
    ObjectNode start =
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("testId", "test-1")
            .put("sourceRevision", "source-1")
            .put("configurationRevision", "config-1")
            .put("environmentId", "fixture")
            .put("applicationId", "orders");
    start.set("versions", versions());
    String id =
        sessions.start(user, UUID.randomUUID().toString(), start).path("sessionId").asText();
    // Fixture stand-in for GuidedProductionSessionAccess.initialize: same rows, hand manifest, no
    // acquisition marker; no case here plans or admits.
    repository.transaction(
        () -> {
          JsonNode session = repository.lock(id).document();
          ObjectNode manifest =
              CONTRACTS
                  .object()
                  .put("testId", session.path("testId").asText())
                  .put("sourceRevision", "source-1")
                  .put("configurationRevision", "config-1")
                  .put("policy", "INPUT-POLICY-01-A");
          manifest.set("sourceSteps", session.path("sourceSteps").deepCopy());
          new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, CONTRACTS)
              .initialize(session, manifest);
          return null;
        });
    return id;
  }

  String prepareSession() throws Exception {
    String id = createSession();
    dispatch.assign(controller, id, "assignment", "worker-1");
    materializeSession(id);
    return id;
  }

  void materializeSession(String id) {
    var refs = CONTRACTS.object().putArray("references");
    refs.add(
        CONTRACTS
            .object()
            .put("referenceKind", "sourceSpan")
            .put("sourceRevision", "source-1")
            .put("stepId", "step-1")
            .put("startUtf16", 6)
            .put("endUtf16", 6 + (ORIGIN + "/start").length())
            .put("kind", "destination")
            .put("intendedSlot", "navigate.destination"));
    String source =
        jdbc.queryForObject("SELECT source FROM bridge_fixture_sources WHERE id=1", String.class);
    refs.add(
        CONTRACTS
            .object()
            .put("referenceKind", "sourceSpan")
            .put("sourceRevision", "source-1")
            .put("stepId", "step-1")
            .put("startUtf16", source.lastIndexOf("fixture-input"))
            .put("endUtf16", source.lastIndexOf("fixture-input") + "fixture-input".length())
            .put("kind", "nonsecretText")
            .put("intendedSlot", "fill.value"));
    refs.add(
        CONTRACTS
            .object()
            .put("referenceKind", "configuration")
            .put("configurationRevision", "config-1")
            .put("stepId", "step-1")
            .put("referenceId", "config-value")
            .put("kind", "nonsecretText")
            .put("intendedSlot", "fill.value"));
    if (privacyEcho) {
      int start = source.indexOf(ORIGIN + "/echo");
      refs.add(
          CONTRACTS
              .object()
              .put("referenceKind", "sourceSpan")
              .put("sourceRevision", "source-1")
              .put("stepId", "step-1")
              .put("startUtf16", start)
              .put("endUtf16", start + (ORIGIN + "/echo").length())
              .put("kind", "destination")
              .put("intendedSlot", "navigate.destination"));
    }
    sessions.materialize(controller, id, 1, "materialize", refs);
  }

  ObjectNode proposal(String id, int ordinal, String kind, String testId) {
    JsonNode evidence = progress(id).path("executionEvidence");
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    ObjectNode p =
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("scopeHash", context.path("scopeHash").asText())
            .put("generation", evidence.path("generation").asInt())
            .put("evidenceHash", GuidedContracts.hash(evidence))
            .put("authoredInputsHash", context.path("authoredInputsHash").asText())
            .put("contextRevision", 1);
    p.set("executionEvidence", evidence);
    p.putObject("coordinate").put("stepId", "step-1").put("ordinal", ordinal);
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
        CONTRACTS
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
            .sslContext(RUNNER_SIDE)
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
    return CONTRACTS.parse(response.body());
  }

  JsonNode progress(String id) {
    return CONTRACTS.parse(
        jdbc.queryForObject(
            "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  static ObjectNode versions() {
    return (ObjectNode) CONTRACTS.parse("{\"contract\":3}");
  }

  static String operationHash(JsonNode proposal) {
    ObjectNode identity = CONTRACTS.object();
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
    while (!condition.getAsBoolean() && System.nanoTime() < end) {
      Thread.sleep(25);
    }
    assertThat(condition.getAsBoolean()).isTrue();
  }
}
