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
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.Socket;
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
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.X509Certificate;
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
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
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
  static final Path WORKER_SNAPSHOT;
  static final SSLContext TLS;
  static final KeyPair ISSUER;
  static final int RUNNER_PORT;
  static final String FINGERPRINT;
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
      WORKER_SNAPSHOT = TEMP.resolve("worker-dist");
      Path sourceBuild = Path.of("../studio-runner/dist").toAbsolutePath().normalize();
      try (var files = Files.walk(sourceBuild)) {
        for (Path source : files.toList()) {
          Path target = WORKER_SNAPSHOT.resolve(sourceBuild.relativize(source).toString());
          if (Files.isDirectory(source)) {
            Files.createDirectories(target);
          } else {
            Files.copy(source, target);
          }
        }
      }
      Files.writeString(TEMP.resolve("package.json"), "{\"type\":\"module\"}");
      Files.createSymbolicLink(
          TEMP.resolve("node_modules"), Path.of("../studio-runner/node_modules").toRealPath());
      ObjectNode workerEvidence = CONTRACTS.object().put("snapshot", WORKER_SNAPSHOT.toString());
      ObjectNode hashes = workerEvidence.putObject("sha256");
      for (String relative :
          List.of(
              "run/guidedMain.js",
              "run/browser.js",
              "guided/runtime.js",
              "guided/transport.js",
              "guided/schemas.json")) {
        hashes.put(
            relative,
            HexFormat.of()
                .formatHex(
                    MessageDigest.getInstance("SHA-256")
                        .digest(Files.readAllBytes(WORKER_SNAPSHOT.resolve(relative)))));
      }
      Files.writeString(
          Path.of("/tmp/studio-obs004-tested-worker.json"), workerEvidence.toString());
      command(
          "openssl",
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          TEMP.resolve("tls.key").toString(),
          "-out",
          TEMP.resolve("tls.crt").toString(),
          "-days",
          "2",
          "-subj",
          "/CN=localhost",
          "-addext",
          "subjectAltName=DNS:localhost,IP:127.0.0.1");
      command(
          "openssl",
          "pkcs12",
          "-export",
          "-inkey",
          TEMP.resolve("tls.key").toString(),
          "-in",
          TEMP.resolve("tls.crt").toString(),
          "-out",
          TEMP.resolve("tls.p12").toString(),
          "-passout",
          "pass:fixture");
      command(
          "keytool",
          "-importcert",
          "-noprompt",
          "-alias",
          "fixture",
          "-file",
          TEMP.resolve("tls.crt").toString(),
          "-keystore",
          TEMP.resolve("trust.p12").toString(),
          "-storetype",
          "PKCS12",
          "-storepass",
          "fixture");
      KeyStore keyStore = KeyStore.getInstance("PKCS12");
      try (var input = Files.newInputStream(TEMP.resolve("tls.p12"))) {
        keyStore.load(input, "fixture".toCharArray());
      }
      var keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
      keys.init(keyStore, "fixture".toCharArray());
      var trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      trust.init(keyStore);
      TLS = SSLContext.getInstance("TLS");
      TLS.init(keys.getKeyManagers(), trust.getTrustManagers(), new SecureRandom());
      X509Certificate certificate =
          (X509Certificate) keyStore.getCertificate(keyStore.aliases().nextElement());
      FINGERPRINT =
          HexFormat.ofDelimiter(":")
              .withUpperCase()
              .formatHex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
      var generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      ISSUER = generator.generateKeyPair();
      Files.writeString(
          TEMP.resolve("issuer.pub"),
          "-----BEGIN PUBLIC KEY-----\n"
              + Base64.getMimeEncoder(64, new byte[] {10})
                  .encodeToString(ISSUER.getPublic().getEncoded())
              + "\n-----END PUBLIC KEY-----\n");
      try (var socket = new java.net.ServerSocket(0)) {
        RUNNER_PORT = socket.getLocalPort();
      }
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
                "<html><body><span data-testid='source'>"
                    + CAPTURE
                    + "</span><input aria-label='Destination' data-testid='destination' "
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
      Flyway.configure()
          .dataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword())
          .locations("classpath:db/migration")
          .target("30")
          .load()
          .migrate();
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
    registry.add("server.ssl.enabled", () -> true);
    registry.add("server.ssl.key-store", () -> TEMP.resolve("tls.p12").toString());
    registry.add("server.ssl.key-store-password", () -> "fixture");
    registry.add("server.ssl.key-store-type", () -> "PKCS12");
    registry.add("server.ssl.trust-store", () -> TEMP.resolve("trust.p12").toString());
    registry.add("server.ssl.trust-store-password", () -> "fixture");
    registry.add("server.ssl.client-auth", () -> "need");
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
      return service;
    }

    @Bean
    GuidedRunnerClient runner() {
      return new GuidedRunnerClient(
          URI.create("https://localhost:" + RUNNER_PORT),
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
              .put("accountRef", "account-1")
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
      return new Snapshot(
          scope,
          steps,
          CONTRACTS
              .object()
              .put("mode", "configuredAccount")
              .put("connectionId", "controlled-public-fixture-account"));
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
  Process worker;
  Path workerLog;

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
    jdbc.execute(
        "TRUNCATE studio_guided_consumer_edges,studio_guided_producers,studio_guided"
            + "_allocations,studio_guided_preparations,studio_guided_materializations,stud"
            + "io_guided_evidence,studio_guided_commands,studio_guided_actions,studio_guid"
            + "ed_sessions CASCADE");
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
    ObjectNode config =
        CONTRACTS
            .object()
            .put("workerId", "worker-1")
            .put("host", "127.0.0.1")
            .put("port", RUNNER_PORT)
            .put("journalDirectory", Files.createTempDirectory(TEMP, "journal-").toString())
            .put("tlsKeyFile", TEMP.resolve("tls.key").toString())
            .put("tlsCertFile", TEMP.resolve("tls.crt").toString())
            .put("tlsCaFile", TEMP.resolve("tls.crt").toString())
            .put("controllerIssuer", "fixture-issuer")
            .put("controllerSubject", "controller-1")
            .put("controllerPublicKeyFile", TEMP.resolve("issuer.pub").toString())
            .put("controllerCertificateFingerprint256", FINGERPRINT)
            .put("callbackBaseUrl", "https://localhost:" + backendPort)
            .put("callbackTokenFile", TEMP.resolve("worker.jwt").toString());
    config
        .putArray("rules")
        .add(
            CONTRACTS
                .object()
                .put("testId", "source")
                .put("name", "Order number")
                .put("policyRuleId", "order-policy")
                .put("classification", "permittedBusinessData"))
        .add(
            CONTRACTS
                .object()
                .put("testId", "destination")
                .put("name", "Destination")
                .put("accessibleName", "Destination")
                .put("policyRuleId", "destination-policy")
                .put("classification", "nonsecretApproved"));
    if (genericRead) {
      config.putArray("rules");
      ObjectNode policy =
          config
              .putObject("applicationPolicy")
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
    }
    if (belowFold || privacyEcho || nativeToggle) {
      config
          .putObject("applicationPolicy")
          .put("policyRuleId", "structural-policy")
          .put("allowStructuralDiscovery", true);
    }
    Path mounted = TEMP.resolve("worker.json");
    Files.writeString(mounted, config.toString());
    workerLog = Files.createTempFile(TEMP, "worker-", ".log");
    var process =
        new ProcessBuilder("node", WORKER_SNAPSHOT.resolve("run/guidedMain.js").toString());
    process.environment().put("STUDIO_GUIDED_CONFIG_FILE", mounted.toString());
    process.redirectErrorStream(true).redirectOutput(workerLog.toFile());
    worker = process.start();
    await(
        () -> {
          try (var socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", RUNNER_PORT), 100);
            return true;
          } catch (Exception ignored) {
            return false;
          }
        },
        10000);
  }

  @AfterEach
  void closeWorker() throws Exception {
    releaseClaimResponse.countDown();
    releaseRefreshCallback.countDown();
    if (worker != null) {
      worker.destroy();
      if (!worker.waitFor(5, TimeUnit.SECONDS)) {
        worker.destroyForcibly();
      }
    }
    assertThat(Files.readString(workerLog))
        .doesNotContain(CAPTURE, PASSWORD_ECHO, ORDINARY_ECHO.strip());
  }

  @AfterAll
  static void close() {
    APPLICATION.stop(0);
    DATABASE.stop();
  }

  @Test
  void realBlankReadConsumerHasIndependentReceiptsAndNoSecondDispatch() throws Exception {
    String id = prepareSession();
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    assertThat(CONNECTIONS.get()).isEqualTo(1);
    assertThat(NAVIGATIONS.get()).isZero();
    dispatch.pushContext(controller, id, 1);
    JsonNode blank = progress(id).path("executionEvidence");
    assertThat(blank.path("origin").isNull()).isTrue();
    assertThat(blank.path("kind").asText()).isEqualTo("initialBlank");
    ObjectNode navigate = proposal(id, 0, "navigate", null);
    navigate
        .withObject("/operation")
        .put(
            "destinationInputId",
            context.path("authoredInputs").path("inputs").get(0).path("inputId").asText());
    JsonNode first = admit(id, navigate);
    JsonNode firstConsumed = advance(id, first, "first");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(progress(id).path("executionEvidence").path("kind").asText())
        .isEqualTo("observedDocument");
    assertThat(advance(id, first, "first").path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(advance(id, first, "new-key").path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    ObjectNode need =
        CONTRACTS.object().put("needId", "order-need").put("producerStepId", "step-1");
    need.putArray("consumers")
        .add(CONTRACTS.object().put("stepId", "step-1").put("argumentSlot", "fill.value"));
    JsonNode allocation = sessions.allocateBinding(controller, id, 1, "allocation", need);
    ObjectNode premature = proposal(id, 1, "fill", "destination");
    premature
        .withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "binding")
                .put("bindingId", allocation.path("bindingId").asText()));
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
        .put("bindingId", allocation.path("bindingId").asText())
        .set(
            "recipe",
            CONTRACTS
                .object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", "order-policy"));
    JsonNode readLedger = admit(id, read);
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
        CONTRACTS.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                readLedger.path("admission").path("admissionId").asText())));
    JsonNode receipt =
        CONTRACTS
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
    valueLeak.withObject("/availability").put("value", CAPTURE);
    JsonNode refused =
        post(
            id,
            "outcomes",
            valueLeak,
            "private-value",
            token("owning-worker", "worker-1", "studio-guided-controller"),
            422);
    assertThat(refused.toString()).doesNotContain(CAPTURE);
    ObjectNode fill = proposal(id, 2, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "binding")
                .put("bindingId", allocation.path("bindingId").asText()));
    JsonNode fillLedger = admit(id, fill);
    advance(id, fillLedger, "fill");
    await(() -> RECEIPT.get() != null, 5000);
    assertThat(RECEIPT.get()).isEqualTo(CAPTURE);
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
    assertThat(persisted).doesNotContain(CAPTURE, "valueHash", "length", "sample");
    assertThat(
            GuidedContracts.hash(CONTRACTS.object().set("coordinate", navigate.path("coordinate"))))
        .hasSize(64);
    assertThat(firstConsumed.path("operationHash").asText()).isEqualTo(operationHash(navigate));
    ObjectNode fake = navigate.deepCopy();
    fake.withObject("/executionEvidence").put("origin", ORIGIN);
    assertThat(operationHash(fake)).isNotEqualTo(operationHash(navigate));
    sessions.cancel(
        user,
        id,
        "cancel",
        CONTRACTS.object().put("schemaVersion", 2).put("reason", "userRequested"));
    await(() -> progress(id).path("teardownStatus").asText().equals("CONFIRMED"), 5000);
    assertThatThrownBy(() -> sessions.runnerContext(controller, id, 1)).hasMessage("CANCELLED");
  }

  @Test
  void concurrentPreparationsForSameAdmissionKeyUseOneImmutableAdmission() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    ObjectNode proposal = navigation(id);
    var admissions =
        race(
            () -> dispatch.prepareAndAdmit(controller, id, 1, "same-admission", proposal),
            () -> dispatch.prepareAndAdmit(controller, id, 1, "same-admission", proposal));
    assertThat(admissions.get(0).path("admission")).isEqualTo(admissions.get(1).path("admission"));
    assertThat(actionCount(id)).isEqualTo(1);
    advance(id, admissions.get(0), "once");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
  }

  @Test
  void concurrentSameAndNewKeysHaveOneRealDispatch() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    JsonNode ledger = admit(id, navigation(id));
    ObjectNode request = advanceRequest(id, ledger);
    var results =
        race(
            () -> dispatch.dispatch(controller, id, 1, "same", request),
            () -> dispatch.dispatch(controller, id, 1, "same", request),
            () -> dispatch.dispatch(controller, id, 1, "other", request));
    assertThat(results).hasSize(3);
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE route='v2-consume'",
                Integer.class))
        .isEqualTo(2);
  }

  @Test
  void nestedRollbackAndLostWinnerNeverManufactureSendAuthority() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    JsonNode ledger = admit(id, navigation(id));
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
    assertThat(NAVIGATIONS.get()).isZero();
    sessions.lostAcknowledgment(id);
    assertThat(action(id).path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> sessions.consume(controller, id, 1, "late", request))
        .hasMessage("UNKNOWN_OUTCOME");
  }

  @Test
  void actualDeferredCommitFailureSendsNothingAndRollsBackConsumption() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    JsonNode ledger = admit(id, navigation(id));
    ObjectNode request = advanceRequest(id, ledger);
    jdbc.execute(
        "CREATE FUNCTION bridge_fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$ "
            + "BEGIN RAISE EXCEPTION 'injected commit failure'; END $$");
    jdbc.execute(
        "CREATE CONSTRAINT TRIGGER bridge_fail_commit AFTER INSERT ON "
            + "studio_guided_commands DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN "
            + "(NEW.route='v2-consume') EXECUTE FUNCTION bridge_fail_commit()");
    try {
      assertThatThrownBy(() -> dispatch.dispatch(controller, id, 1, "failed-commit", request))
          .isInstanceOf(org.springframework.transaction.TransactionException.class);
      assertThat(NAVIGATIONS.get()).isZero();
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
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
  }

  @Test
  void cancellationBeforeAndAfterConsumePreventsFutureWorkAndPreservesUncertainty()
      throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    JsonNode ledger = admit(id, navigation(id));
    ObjectNode request = advanceRequest(id, ledger);
    sessions.consume(controller, id, 1, "consumed", request);
    sessions.cancel(
        user,
        id,
        "cancel",
        CONTRACTS.object().put("schemaVersion", 2).put("reason", "userRequested"));
    await(() -> progress(id).path("teardownStatus").asText().equals("CONFIRMED"), 5000);
    assertThat(NAVIGATIONS.get()).isZero();
    assertThat(action(id).path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> dispatch.dispatch(controller, id, 1, "late", request))
        .hasMessage("CANCELLED");
  }

  @Test
  void currentSourceLockWinsAgainstConcurrentConsumeAndCumulativeAllocationsCannotBeErased()
      throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    JsonNode ledger = admit(id, navigation(id));
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
                            "SELECT source FROM bridge_fixture_sources WHERE id=1 FOR UPDATE",
                            String.class);
                        locked.countDown();
                        try {
                          release.await();
                        } catch (InterruptedException failure) {
                          Thread.currentThread().interrupt();
                          throw new IllegalStateException(failure);
                        }
                        jdbc.update(
                            "UPDATE bridge_fixture_sources SET revision='changed' WHERE id=1");
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
    assertThat(NAVIGATIONS.get()).isZero();
    assertThat(action(id).path("dispatchCount").asInt()).isZero();
    jdbc.update("UPDATE bridge_fixture_sources SET revision='source-1' WHERE id=1");
    jdbc.update("UPDATE bridge_fixture_configuration SET revision='changed' WHERE id=1");
    assertThatThrownBy(
            () -> dispatch.dispatch(controller, id, 1, "configuration-revision", request))
        .hasMessage("REVISION_CONFLICT");
    assertThat(NAVIGATIONS.get()).isZero();
    assertThat(action(id).path("dispatchCount").asInt()).isZero();
    jdbc.update("UPDATE bridge_fixture_configuration SET revision='config-1' WHERE id=1");
    ObjectNode need = CONTRACTS.object().put("needId", "need").put("producerStepId", "step-1");
    need.putArray("consumers")
        .add(CONTRACTS.object().put("stepId", "step-1").put("argumentSlot", "fill.value"));
    JsonNode allocation = sessions.allocateBinding(controller, id, 1, "allocate", need);
    ObjectNode more = need.deepCopy();
    ((com.fasterxml.jackson.databind.node.ArrayNode) more.path("consumers"))
        .add(CONTRACTS.object().put("stepId", "step-1").put("argumentSlot", "assert.expected"));
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
  void actualServiceTransportRejectsWrongAudienceSubjectFenceAndTuple() throws Exception {
    String id = prepareSession();
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    ObjectNode claim =
        CONTRACTS
            .object()
            .put("schemaVersion", 2)
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
    assertThatThrownBy(() -> runner.send("context", incompatible)).hasMessage("UNKNOWN_OUTCOME");
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
        .put("schemaVersion", 2)
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
    CONTRACTS.validate("v2/session", session);
    assertThat(session.toString().getBytes(StandardCharsets.UTF_8).length)
        .isGreaterThan(65536)
        .isLessThan(1048576);
    dispatch.pushContext(controller, id, 1);
    assertThat(progress(id).path("executionEvidence").path("kind").asText())
        .isEqualTo("initialBlank");
    assertThat(NAVIGATIONS.get()).isZero();
  }

  @Test
  void actualApplicationReplacementAfterPrepareNeverActsOnReplacement() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "authoredLiteral")
                .put(
                    "sourceInputId",
                    sessions
                        .runnerContext(controller, id, 1)
                        .path("authoredInputs")
                        .path("inputs")
                        .get(1)
                        .path("inputId")
                        .asText()));
    JsonNode admitted = admit(id, fill);
    replaceTarget = true;
    await(() -> MUTATIONS.get() > 0, 5000);
    advance(id, admitted, "stale-target");
    JsonNode result =
        CONTRACTS.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                admitted.path("admission").path("admissionId").asText()));
    assertThat(result.path("dispatchCount").asInt()).isEqualTo(1);
    assertThat(result.path("state").asText()).isEqualTo("FAILED");
    assertThat(result.path("outcomeCode").asText()).isEqualTo("TARGET_CHANGED");
    assertThat(RECEIPT.get()).isNull();
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
  }

  @Test
  void producerReceiptAndOutcomeRollbackTogetherAfterRealReadAndNoReplay() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode need = CONTRACTS.object().put("needId", "read-need").put("producerStepId", "step-1");
    need.putArray("consumers")
        .add(CONTRACTS.object().put("stepId", "step-1").put("argumentSlot", "fill.value"));
    JsonNode allocation = sessions.allocateBinding(controller, id, 1, "allocate", need);
    ObjectNode read = proposal(id, 1, "read", "source");
    read.withObject("/operation")
        .put("bindingId", allocation.path("bindingId").asText())
        .set(
            "recipe",
            CONTRACTS
                .object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", "order-policy"));
    JsonNode admission = admit(id, read);
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
    await(
        () ->
            jdbc.queryForObject(
                    "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id)
                .equals("UNKNOWN_OUTCOME"),
        5000);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_producers WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
    JsonNode stored =
        CONTRACTS.parse(
            jdbc.queryForObject(
                "SELECT document::text FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                admission.path("admission").path("admissionId").asText()));
    assertThat(stored.path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(
            () -> dispatch.dispatch(controller, id, 1, "retry", advanceRequest(id, admission)))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(RECEIPT.get()).isNull();
  }

  @Test
  void cancellationBeforeConsumptionRevokesAndMissingStopAckNeverConfirmsTeardown()
      throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    JsonNode admission = admit(id, navigation(id));
    worker.destroyForcibly();
    assertThat(worker.waitFor(5, TimeUnit.SECONDS)).isTrue();
    sessions.cancel(
        user,
        id,
        "cancel",
        CONTRACTS.object().put("schemaVersion", 2).put("reason", "userRequested"));
    assertThatThrownBy(
            () -> dispatch.dispatch(controller, id, 1, "late", advanceRequest(id, admission)))
        .hasMessage("CANCELLED");
    assertThat(action(id).path("state").asText()).isEqualTo("REVOKED");
    assertThat(action(id).path("dispatchCount").asInt()).isZero();
    Thread.sleep(150);
    assertThat(progress(id).path("teardownStatus").asText()).isEqualTo("PENDING");
    assertThat(NAVIGATIONS.get()).isZero();
  }

  @Test
  void authorizedConfigurationReferenceIsAllocatedTransportedAndConsumedExactly() throws Exception {
    String id = prepareSession();
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    JsonNode input = context.path("authoredInputs").path("inputs").get(2);
    assertThat(input.path("provenance").path("referenceKind").asText()).isEqualTo("configuration");
    assertThat(input.path("value").asText()).isEqualTo(CONFIG_INPUT);
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "authoredLiteral")
                .put("sourceInputId", input.path("inputId").asText()));
    advance(id, admit(id, fill), "configured-fill");
    await(() -> RECEIPT.get() != null, 5000);
    assertThat(RECEIPT.get()).isEqualTo(CONFIG_INPUT);
    assertThat(
            jdbc.queryForObject(
                "SELECT string_agg(document::text,'') FROM studio_guided_actions WHERE session_id=?",
                String.class,
                id))
        .doesNotContain(CONFIG_INPUT);
  }

  @Test
  void configuredRegionReadGrantNeedsNoTestIdsOrPerControlRules() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode need =
        CONTRACTS.object().put("needId", "generic-order").put("producerStepId", "step-1");
    need.putArray("consumers")
        .add(CONTRACTS.object().put("stepId", "step-1").put("argumentSlot", "fill.value"));
    JsonNode allocation = sessions.allocateBinding(controller, id, 1, "generic-allocation", need);
    ObjectNode sourceLocator =
        CONTRACTS
            .object()
            .put("kind", "role")
            .put("role", "status")
            .put("name", "Order reference")
            .put("exact", true);
    ObjectNode read = proposalByLocator(id, 1, "read", sourceLocator);
    read.withObject("/operation")
        .put("bindingId", allocation.path("bindingId").asText())
        .set(
            "recipe",
            CONTRACTS
                .object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", "business-read"));
    advance(id, admit(id, read), "generic-read");
    ObjectNode fill =
        proposalByLocator(
            id,
            2,
            "fill",
            CONTRACTS.object().put("kind", "label").put("value", "Destination").put("exact", true));
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "binding")
                .put("bindingId", allocation.path("bindingId").asText()));
    advance(id, admit(id, fill), "generic-fill");
    await(() -> RECEIPT.get() != null, 5000);
    assertThat(RECEIPT.get()).isEqualTo(CAPTURE);
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_producers WHERE session_id=?",
                Integer.class,
                id))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_consumer_edges WHERE session_id=?",
                Integer.class,
                id))
        .isEqualTo(1);
    assertThat(Files.readString(TEMP.resolve("worker.json"))).contains("\"rules\":[]");
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
  void httpSuccessWithoutCommittedCompletionCallbackIsUnknownAndNeverRetried() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    JsonNode admission = admit(id, navigation(id));
    dropCompletionCallbacks = true;
    advance(id, admission, "lost-callback");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(action(id).path("state").asText()).isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(
            () -> dispatch.dispatch(controller, id, 1, "again", advanceRequest(id, admission)))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
  }

  @Test
  void lateOldAcknowledgementDoesNotDowngradeNewerConsumedAction() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    JsonNode first = admit(id, navigation(id));
    advance(id, first, "first");
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "authoredLiteral")
                .put(
                    "sourceInputId",
                    sessions
                        .runnerContext(controller, id, 1)
                        .path("authoredInputs")
                        .path("inputs")
                        .get(1)
                        .path("inputId")
                        .asText()));
    JsonNode second = admit(id, fill);
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
    String id = prepareSession();
    Instant firstLease = Instant.parse(session(id).path("owner").path("leaseExpiresAt").asText());
    String hardExpiry = session(id).path("expiresAt").asText();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode need =
        CONTRACTS.object().put("needId", "retained-read").put("producerStepId", "step-1");
    need.putArray("consumers")
        .add(CONTRACTS.object().put("stepId", "step-1").put("argumentSlot", "fill.value"));
    JsonNode binding = sessions.allocateBinding(controller, id, 1, "retained-binding", need);
    ObjectNode read = proposal(id, 1, "read", "source");
    read.withObject("/operation")
        .put("bindingId", binding.path("bindingId").asText())
        .set(
            "recipe",
            CONTRACTS
                .object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", "order-policy"));
    advance(id, admit(id, read), "read");
    // Trusted coordinator test setup ONLY; this does not implement005 question semantics/UI.
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
    await(() -> Instant.now().isAfter(firstLease.plusMillis(500)), 35000);
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
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    JsonNode duplicate = dispatch.assign(controller, id, "assignment", "worker-1");
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
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "binding")
                .put("bindingId", binding.path("bindingId").asText()));
    advance(id, admit(id, fill), "fill-after-renewal");
    await(() -> RECEIPT.get() != null, 5000);
    assertThat(RECEIPT.get()).isEqualTo(CAPTURE);
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
        CONTRACTS.object().put("schemaVersion", 2).put("reason", "userRequested"));
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
  void renewalWhileBrowserDispatchIsBusyDoesNotResetOrRepeatTheAction() throws Exception {
    String id = prepareSession();
    Instant originalLease =
        Instant.parse(session(id).path("owner").path("leaseExpiresAt").asText());
    dispatch.pushContext(controller, id, 1);
    JsonNode admission = admit(id, navigation(id));
    long delay = Duration.between(Instant.now(), originalLease.minusMillis(21500)).toMillis();
    if (delay > 0) {
      Thread.sleep(delay);
    }
    slowNavigationMillis = 3000;
    advance(id, admission, "busy-navigation");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(action(id).path("state").asText()).isEqualTo("SUCCEEDED");
    assertThat(claimCount(id)).isGreaterThanOrEqualTo(2);
    assertThat(session(id).path("owner").path("fence").asInt()).isEqualTo(1);
    assertThat(session(id).path("state").asText()).isEqualTo("PROPOSING");
  }

  @Test
  void failedRenewalStopsWithoutUsingUnacknowledgedLeaseOrReclaiming() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    JsonNode intent = assignment(id);
    failClaims = true;
    await(() -> session(id).path("state").asText().equals("FAILED"), 15000);
    assertThatThrownBy(() -> runner.send("assign", intent, "assignment"))
        .hasMessage("UNKNOWN_OUTCOME");
    failClaims = false;
    Thread.sleep(200);
    assertThat(session(id).path("state").asText()).isEqualTo("FAILED");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThatThrownBy(() -> dispatch.assign(controller, id, "retry", "worker-1"))
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void lateRenewalResponseAfterStopCannotReviveContextOrOwnership() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode oldContext = sessions.runnerContext(controller, id, 1);
    HOLD_NEXT_CLAIM.set(true);
    assertThat(claimResponseCaptured.await(15, TimeUnit.SECONDS)).isTrue();
    sessions.cancel(
        user,
        id,
        "cancel-delayed-renewal",
        CONTRACTS.object().put("schemaVersion", 2).put("reason", "userRequested"));
    await(() -> progress(id).path("teardownStatus").asText().equals("CONFIRMED"), 5000);
    releaseClaimResponse.countDown();
    Thread.sleep(200);
    assertThatThrownBy(() -> runner.send("assign", assignment(id), "assignment"))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThatThrownBy(() -> runner.send("context", oldContext)).hasMessage("UNKNOWN_OUTCOME");
    assertThat(session(id).path("state").asText()).isEqualTo("CANCELLED");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
  }

  @Test
  void invalidAcknowledgedClaimNeverLaunchesAndUnassignedOrWrongWorkersCannotClaim()
      throws Exception {
    String id = createSession();
    ObjectNode claim =
        CONTRACTS
            .object()
            .put("schemaVersion", 2)
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
  void restartedWorkerCannotReclaimExistingAssignmentOrReplayBrowserEffects() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    JsonNode intent = assignment(id);
    worker.destroyForcibly();
    assertThat(worker.waitFor(5, TimeUnit.SECONDS)).isTrue();
    var process =
        new ProcessBuilder("node", WORKER_SNAPSHOT.resolve("run/guidedMain.js").toString());
    process.environment().put("STUDIO_GUIDED_CONFIG_FILE", TEMP.resolve("worker.json").toString());
    process
        .redirectErrorStream(true)
        .redirectOutput(ProcessBuilder.Redirect.appendTo(workerLog.toFile()));
    worker = process.start();
    await(
        () -> {
          try (var socket = new Socket()) {
            socket.connect(new InetSocketAddress("127.0.0.1", RUNNER_PORT), 100);
            return true;
          } catch (Exception ignored) {
            return false;
          }
        },
        10000);
    assertThatThrownBy(() -> runner.send("assign", intent, "after-restart"))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(claimCount(id)).isEqualTo(1);
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
  void belowFoldClickUsesNativeRevealAndOneReceipt() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode click =
        proposalByLocator(
            id,
            1,
            "click",
            CONTRACTS
                .object()
                .put("kind", "role")
                .put("role", "button")
                .put("name", "Continue")
                .put("exact", true));
    JsonNode admission = admit(id, click);
    advance(id, admission, "below-fold");
    await(() -> CLICK_RECEIPTS.get() == 1, 5000);
    assertThat(
            jdbc.queryForObject(
                "SELECT document->>'state' FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                admission.path("admission").path("admissionId").asText()))
        .isEqualTo("SUCCEEDED");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(CLICK_RECEIPTS.get()).isEqualTo(1);
    advance(id, admission, "duplicate-below-fold");
    assertThat(CLICK_RECEIPTS.get()).isEqualTo(1);
  }

  @Test
  void freshObservationConnectsTwoAuthoredStepsWithoutReplayingProducer() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode need =
        CONTRACTS.object().put("needId", "cross-step-order").put("producerStepId", "step-1");
    need.putArray("consumers")
        .add(CONTRACTS.object().put("stepId", "step-2").put("argumentSlot", "fill.value"));
    JsonNode allocation =
        sessions.allocateBinding(controller, id, 1, "cross-step-allocation", need);
    ObjectNode read =
        proposalByLocator(
            id,
            1,
            "read",
            CONTRACTS
                .object()
                .put("kind", "role")
                .put("role", "status")
                .put("name", "Order reference")
                .put("exact", true));
    read.withObject("/operation")
        .put("bindingId", allocation.path("bindingId").asText())
        .set(
            "recipe",
            CONTRACTS
                .object()
                .put("kind", "visibleText")
                .put("classification", "permittedBusinessData")
                .put("policyRuleId", "business-read"));
    advance(id, admit(id, read), "cross-step-read");
    JsonNode producer = sessions.runnerContext(controller, id, 1).path("producers").deepCopy();
    assertThat(producer.size()).isEqualTo(1);
    JsonNode countsBefore = session(id).path("counters").deepCopy();
    sessions.completeStep(
        controller, id, 1, "first-step-complete", CONTRACTS.object().put("stepId", "step-1"));
    assertThat(session(id).path("state").asText()).isEqualTo("OBSERVING");
    assertThat(progress(id).path("stepIndex").asInt()).isEqualTo(1);
    ObjectNode request = refreshRequest(id);
    JsonNode result = dispatch.observe(controller, id, 1, "refresh-step-2", request);
    assertThat(result.path("observation").path("generation").asInt())
        .isEqualTo(request.path("expectedGeneration").asInt() + 1);
    assertThat(session(id).path("counters").path("actions"))
        .isEqualTo(countsBefore.path("actions"));
    assertThat(session(id).path("counters").path("observations").asInt())
        .isEqualTo(countsBefore.path("observations").asInt() + 1);
    assertThat(dispatch.observe(controller, id, 1, "refresh-step-2", request)).isEqualTo(result);
    assertThat(runner.send("observe", request, "refresh-step-2")).isEqualTo(result);
    ObjectNode changed =
        request
            .deepCopy()
            .put("expectedGeneration", request.path("expectedGeneration").asInt() + 1);
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "refresh-step-2", changed))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    assertThat(sessions.runnerContext(controller, id, 1).path("producers")).isEqualTo(producer);
    ObjectNode fill =
        proposalByLocator(
            id,
            0,
            "fill",
            CONTRACTS.object().put("kind", "label").put("value", "Destination").put("exact", true));
    fill.withObject("/coordinate").put("stepId", "step-2");
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "binding")
                .put("bindingId", allocation.path("bindingId").asText()));
    advance(id, admit(id, fill), "second-step-fill");
    await(() -> RECEIPT.get() != null, 5000);
    assertThat(RECEIPT.get()).isEqualTo(CAPTURE);
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(FILL_RECEIPTS.get()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_producers WHERE session_id=?",
                Integer.class,
                id))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT document->'coordinate'->>'stepId' FROM studio_guided_actions"
                    + " WHERE session_id=? AND ordinal=0 AND step_id='step-2'",
                String.class,
                id))
        .isEqualTo("step-2");
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "refresh-step-2", request))
        .hasMessage("STALE_GENERATION");
  }

  @Test
  void committedObservationRecoversLostHttpResponseWithoutAnotherCollection() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode request = refreshRequest(id);
    int before = session(id).path("counters").path("observations").asInt();
    var proxy = com.sun.net.httpserver.HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    proxy.setHttpsConfigurator(
        new com.sun.net.httpserver.HttpsConfigurator(TLS) {
          @Override
          public void configure(com.sun.net.httpserver.HttpsParameters parameters) {
            var ssl = TLS.getDefaultSSLParameters();
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
                CONTRACTS.parse(
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
          new GuidedRunnerClient(
              URI.create("https://localhost:" + proxy.getAddress().getPort()),
              TLS,
              () -> token("backend-controller", "controller-1", "studio-guided-runner"),
              CONTRACTS);
      var faultDispatch = new GuidedDispatchService(sessions, materialization, faultClient);
      JsonNode result = faultDispatch.observe(controller, id, 1, "lost-refresh-response", request);
      assertThat(result.path("observation")).isEqualTo(progress(id).path("observation"));
      assertThat(faultDispatch.observe(controller, id, 1, "lost-refresh-response", request))
          .isEqualTo(result);
      assertThat(requests.get()).isEqualTo(1);
      assertThat(session(id).path("counters").path("observations").asInt()).isEqualTo(before + 1);
      assertThat(NAVIGATIONS.get()).isEqualTo(1);
    } finally {
      proxy.stop(0);
    }
  }

  @Test
  void refreshRefusesActiveAdmissionUnresolvedPauseStaleScopeBudgetAndCancellation()
      throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode request = refreshRequest(id);
    ObjectNode wrong = request.deepCopy().put("contextId", "foreign-context");
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "wrong-context", wrong))
        .hasMessage("STALE_FENCE");
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
          current.document().withObject("/counters").put("observations", 1);
          repository.save(current);
          return null;
        });
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "authoredLiteral")
                .put(
                    "sourceInputId",
                    sessions
                        .runnerContext(controller, id, 1)
                        .path("authoredInputs")
                        .path("inputs")
                        .get(1)
                        .path("inputId")
                        .asText()));
    admit(id, fill);
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "active-admission", request))
        .hasMessage("STALE_GENERATION");
    sessions.cancel(
        user,
        id,
        "cancel",
        CONTRACTS.object().put("schemaVersion", 2).put("reason", "userRequested"));
    assertThatThrownBy(() -> dispatch.observe(controller, id, 1, "after-cancel", request))
        .hasMessage("CANCELLED");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(FILL_RECEIPTS.get()).isZero();
  }

  @Test
  void concurrentRefreshRetriesJoinOneCollectionAndOneCommittedGeneration() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
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
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
  }

  @Test
  void cancelDuringRefreshRejectsLateCallbackWithoutBrowserMutation() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode request = refreshRequest(id);
    int generation = progress(id).path("generation").asInt();
    HOLD_NEXT_REFRESH.set(true);
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
      assertThat(refreshCallbackHeld.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(session(id).path("state").asText()).isEqualTo("OBSERVING");
      assertThatThrownBy(
              () -> dispatch.observe(controller, id, 1, "different-inflight-key", request))
          .hasMessage("STALE_GENERATION");
      sessions.cancel(
          user,
          id,
          "cancel-refresh",
          CONTRACTS.object().put("schemaVersion", 2).put("reason", "userRequested"));
      releaseRefreshCallback.countDown();
      assertThat(collecting.get(10, TimeUnit.SECONDS))
          .isIn("CANCELLED", "UNKNOWN_OUTCOME", "STALE_FENCE");
    }
    assertThat(session(id).path("state").asText()).isEqualTo("CANCELLED");
    assertThat(progress(id).path("generation").asInt()).isEqualTo(generation);
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(FILL_RECEIPTS.get()).isZero();
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
    ObjectNode legacyQuestion =
        CONTRACTS
            .parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/fixtures.json")))
            .path("documents")
            .path("clarification")
            .deepCopy();
    legacyQuestion.put("sessionId", id);
    assertThatThrownBy(
            () -> sessions.clarification(controller, id, 1, "legacy-question", legacyQuestion))
        .hasMessage("RUNTIME_INCOMPATIBLE");

    ObjectNode answer =
        CONTRACTS
            .object()
            .put("schemaVersion", 1)
            .put("clarificationId", "old-question")
            .put("choiceId", "old-choice")
            .put("generation", 0);
    assertThatThrownBy(() -> sessions.clarify(user, id, "legacy-answer", answer))
        .hasMessage("RUNTIME_INCOMPATIBLE");
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
  void supportedV2AnswerResumesTrustedQuestionFixtureThenRefreshPreservesHistoricalSelection()
      throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode oldProposal = proposal(id, 1, "fill", "destination");
    oldProposal
        .withObject("/operation")
        .set(
            "value",
            CONTRACTS
                .object()
                .put("kind", "authoredLiteral")
                .put(
                    "sourceInputId",
                    sessions
                        .runnerContext(controller, id, 1)
                        .path("authoredInputs")
                        .path("inputs")
                        .get(1)
                        .path("inputId")
                        .asText()));
    String selectedNode = oldProposal.path("target").path("nodeId").asText();
    ObjectNode question =
        CONTRACTS
            .object()
            .put("schemaVersion", 2)
            .put("sessionId", id)
            .put("scopeHash", session(id).path("scopeHash").asText())
            .put("clarificationId", "controlled-question")
            .put("generation", progress(id).path("generation").asInt())
            .put("documentId", progress(id).path("documentId").asText())
            .put("reason", "AMBIGUOUS_TARGET")
            .put("promptCode", "CHOOSE_FIELD")
            .put("expiresAt", java.time.Instant.now().plusSeconds(20).toString());
    question.set("coordinate", oldProposal.path("coordinate"));
    question
        .putArray("choices")
        .add(
            CONTRACTS
                .object()
                .put("choiceId", "destination-choice")
                .put("safeLabel", "Destination")
                .put("nodeId", selectedNode)
                .putNull("bindingId"));
    // Trusted question producer setup only: production v2 question schema/semantics belong to005.
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.progress().set("clarification", question);
          current.document().put("state", "AWAITING_CLARIFICATION");
          repository.save(current);
          return null;
        });
    ObjectNode answer =
        CONTRACTS
            .object()
            .put("schemaVersion", 2)
            .put("clarificationId", "controlled-question")
            .put("choiceId", "destination-choice")
            .put("generation", question.path("generation").asInt());
    assertThat(
            sessions.clarify(user, id, "answer-controlled-question", answer).path("state").asText())
        .isEqualTo("OBSERVING");
    JsonNode selection = sessions.clarificationSelection(controller, id, 1, "controlled-question");
    assertThat(selection.path("nodeId").asText()).isEqualTo(selectedNode);
    JsonNode refreshed = dispatch.observe(controller, id, 1, "after-answer", refreshRequest(id));
    assertThat(refreshed.path("observation").path("generation").asInt())
        .isGreaterThan(question.path("generation").asInt());
    assertThat(sessions.clarificationSelection(controller, id, 1, "controlled-question"))
        .isEqualTo(selection);
    assertThatThrownBy(
            () -> dispatch.prepareAndAdmit(controller, id, 1, "historical-proposal", oldProposal))
        .isInstanceOf(GuidedSessionException.class);
    assertThat(actionCount(id)).isEqualTo(1);
    ObjectNode current = proposal(id, 1, "fill", "destination");
    current.withObject("/operation").set("value", oldProposal.path("operation").path("value"));
    advance(id, admit(id, current), "fresh-selected-destination");
    await(() -> RECEIPT.get() != null, 5000);
    assertThat(RECEIPT.get()).isEqualTo("fixture-input");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(FILL_RECEIPTS.get()).isEqualTo(1);
  }

  @Test
  void actualAuthenticatedRawBytesRejectAmbiguityAndUnknownSignedClaims() throws Exception {
    String id = prepareSession();
    ObjectNode claim =
        CONTRACTS
            .object()
            .put("schemaVersion", 2)
            .put("sessionId", id)
            .put("workerId", "worker-1")
            .put("expectedFence", 1);
    claim.set("versions", versions());
    String valid = claim.toString();
    var payloads = new java.util.ArrayList<byte[]>();
    for (String raw :
        List.of(
            valid + " {}",
            valid.replace("\"schemaVersion\":2", "\"schemaVersion\":2,\"schemaVersion\":2"),
            valid.replace("\"workerId\":", "\"workerId\":\"worker-1\",\"\\u0077orkerId\":"),
            valid.replace("\"contract\":2", "\"contract\":2,\"contract\":2"),
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
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND idempotency_key LIKE 'malformed-%'",
                Integer.class, id))
        .isZero();
    assertThat(NAVIGATIONS.get()).isZero();
    assertThat(session(id).path("state").asText()).isEqualTo("PREPARING");
  }

  HttpResponse<byte[]> rawBackendPost(String id, byte[] body, String key, String bearer)
      throws Exception {
    return HttpClient.newBuilder()
        .sslContext(TLS)
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
        new com.sun.net.httpserver.HttpsConfigurator(TLS) {
          @Override
          public void configure(com.sun.net.httpserver.HttpsParameters parameters) {
            var ssl = TLS.getDefaultSSLParameters();
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
              valid.replace("\"schemaVersion\":2", "\"schemaVersion\":2,\"schemaVersion\":2"))) {
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
          CONTRACTS.object().put("schemaVersion", 2).put("status", "OWNED").put("ownerFence", 1);
      receipt.set("assignment", intent);
      var vectors =
          CONTRACTS.parse(
              Files.readString(
                  Path.of(
                      "../docs/specs/studio-observed-authoring/contracts/v2/wire-parity.fixtures.json")));
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

  @Test
  void uncapturedPasswordAndInputEchoesStayPrivateAcrossActualDocumentNavigation()
      throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "private-source-page");
    assertThat(progress(id).path("observation").toString())
        .doesNotContain(PASSWORD_ECHO, ORDINARY_ECHO.strip());
    ObjectNode navigate = proposal(id, 1, "navigate", null);
    navigate
        .withObject("/operation")
        .put(
            "destinationInputId",
            sessions
                .runnerContext(controller, id, 1)
                .path("authoredInputs")
                .path("inputs")
                .get(3)
                .path("inputId")
                .asText());
    advance(id, admit(id, navigate), "echo-page");
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    assertThat(ECHO_NAVIGATIONS.get()).isEqualTo(1);
    assertThat(progress(id).path("observation").toString())
        .doesNotContain(PASSWORD_ECHO, ORDINARY_ECHO.strip());
    assertThat(
            jdbc.queryForObject(
                "SELECT string_agg(response::text,'') FROM studio_guided_commands WHERE namespace=?",
                String.class,
                id))
        .doesNotContain(PASSWORD_ECHO, ORDINARY_ECHO.strip());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_producers WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
    assertThat(actionCount(id)).isEqualTo(2);
    assertThat(session(id).path("state").asText()).isEqualTo("PROPOSING");
  }

  @Test
  void preventedNativeToggleNeverCommitsSuccessOrRetries() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode check =
        proposalByLocator(
            id,
            1,
            "check",
            CONTRACTS
                .object()
                .put("kind", "role")
                .put("role", "checkbox")
                .put("name", "Prevented toggle")
                .put("exact", true));
    JsonNode admission = admit(id, check);
    advance(id, admission, "prevented-check");
    await(() -> TOGGLE_ATTEMPTS.get() == 1, 5000);
    String admissionId = admission.path("admission").path("admissionId").asText();
    assertThat(
            jdbc.queryForObject(
                "SELECT document->>'state' FROM studio_guided_actions WHERE admission_id=?",
                String.class,
                admissionId))
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThatThrownBy(
            () ->
                dispatch.dispatch(
                    controller, id, 1, "no-toggle-retry", advanceRequest(id, admission)))
        .isInstanceOf(GuidedSessionException.class);
    assertThat(TOGGLE_ATTEMPTS.get()).isEqualTo(1);
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
  }

  @Test
  void nativeRadioUncheckIsRefusedBeforeAnyBrowserAttempt() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    advance(id, admit(id, navigation(id)), "navigate");
    ObjectNode uncheck =
        proposalByLocator(
            id,
            1,
            "uncheck",
            CONTRACTS
                .object()
                .put("kind", "role")
                .put("role", "radio")
                .put("name", "Selected radio")
                .put("exact", true));
    assertThatThrownBy(
            () -> dispatch.prepareAndAdmit(controller, id, 1, "unsupported-radio-uncheck", uncheck))
        .isInstanceOf(GuidedSessionException.class);
    assertThat(actionCount(id)).isEqualTo(1);
    assertThat(TOGGLE_ATTEMPTS.get()).isZero();
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
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
            .put("schemaVersion", 2)
            .put("testId", "test-1")
            .put("sourceRevision", "source-1")
            .put("configurationRevision", "config-1")
            .put("environmentId", "fixture")
            .put("applicationId", "orders")
            .put("accountRef", "account-1");
    start.set("versions", versions());
    String id =
        sessions.start(user, UUID.randomUUID().toString(), start).path("sessionId").asText();
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
            .put("schemaVersion", 2)
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

  JsonNode admit(String id, JsonNode proposal) throws Exception {
    return post(
        id,
        "admissions",
        proposal,
        UUID.randomUUID().toString(),
        token("backend-controller", "controller-1", "studio-guided-controller"),
        202);
  }

  JsonNode advance(String id, JsonNode ledger, String key) throws Exception {
    return post(
        id,
        "advance",
        CONTRACTS
            .object()
            .put("schemaVersion", 2)
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
            .sslContext(TLS)
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
    return (ObjectNode)
        CONTRACTS.parse(
            "{\"contract\":2,\"learnedPlan\":2,\"observation\":2,\"guidedPolicy\":2,\"re"
                + "ferencePolicy\":3,\"lowering\":1,\"artifact\":2,\"language\":\"observed-2\""
                + ",\"executor\":\"observed-2\"}");
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

  static void command(String... arguments) throws Exception {
    var process =
        new ProcessBuilder(arguments)
            .redirectErrorStream(true)
            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
            .start();
    assertThat(process.waitFor()).isZero();
  }

  static void await(java.util.function.BooleanSupplier condition, long timeout) throws Exception {
    long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeout);
    while (!condition.getAsBoolean() && System.nanoTime() < end) {
      Thread.sleep(25);
    }
    assertThat(condition.getAsBoolean()).isTrue();
  }
}
