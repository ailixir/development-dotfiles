package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

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
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedInternalController;
import com.citi.put.checks.studio.guided.session.GuidedInternalSecurity;
import com.citi.put.checks.studio.guided.session.GuidedSessionProperties;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.guided.session.GuidedWireBodyAdvice;
import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
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
import java.util.concurrent.CopyOnWriteArrayList;
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
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * STUDIO-OBS-009 AC-7 FOCUS-MUTATION-01 c (T0 ruling A9, rule FM): one guided learn on the real
 * runner, with a field whose focus handler inserts helper text elsewhere on the page. The fill
 * succeeds and the session continues; before the rule, the runner refused the write as {@code
 * POST_FOCUS_CHANGED}, mapped it to {@code UNKNOWN_OUTCOME} and the whole session stopped.
 *
 * <p><b>Runs after the F-merge only.</b> It needs the rebuilt runner {@code dist} (the one that
 * carries the rule) and the spawn lane I migrates. It is a trimmed copy of {@code
 * GuidedBridgePlannedIT}'s scaffolding (same real PostgreSQL, mutually authenticated HTTPS in both
 * directions, controlled model provider over real HTTP, actual Chromium), keeping that class's
 * rules: hand-crafted proposals are refusal probes only, and the model only ever selects.
 *
 * <p>The runner is spawned and reaped by {@code RunnerProcessHarness} as the folded {@code
 * dist/main.js} over TLS (the same hunk lane I applied to {@code GuidedBridgePlannedIT}). Credit
 * this class only on the F-merge {@code dist} digest (AC-12 i).
 */
@SpringBootTest(
    classes = GuidedFocusMutationJoinedIT.Application.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false",
      "spring.jpa.hibernate.ddl-auto=none"
    })
class GuidedFocusMutationJoinedIT {
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

  /**
   * FOCUS-MUTATION-01 page variants: helper text inserted elsewhere on focus; a real target change
   * on focus.
   */
  static volatile boolean focusHelper, focusTargetChange;

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
      TEMP = Files.createTempDirectory("guided-bridge-planned-");
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
          Path.of("/tmp/studio-obs009-focus-mutation-joined-worker.json"),
          workerEvidence.toString());
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
                    + (focusHelper
                        ? "onfocus=\"var p=document.createElement('p');p.textContent='Required "
                            + "field';document.querySelector('main').appendChild(p)\" "
                        : "")
                    + (focusTargetChange
                        ? "onfocus=\"this.setAttribute('name','changed-on-focus')\" "
                        : "")
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
      // STUDIO-OBS-012A / ADR-SC-005 D-B: the re-baselined schema head (core V1–V11 + V12–V18).
      Flyway.configure()
          .dataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword())
          .locations("classpath:db/migration")
          .target("23") // STUDIO-OBS-014 S3: governance tables (V19) at head
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
      return new GuidedTranslationProperties(
          true, true, List.of("orders"), List.of("fixture"), 131072, 2048, 60, "worker-1");
    }

    @Bean
    GuidedSourceSnapshotRepository snapshots(StudioRepository repository) {
      return new GuidedSourceSnapshotRepository(repository, CONTRACTS);
    }

    @Bean
    GuidedSourceClassifier classifier(GuidedTranslationProperties props) {
      return new GuidedSourceClassifier(CONTRACTS, props, new CredentialPatternScreen());
    }

    @Bean
    GuidedSourceInputResolver inputs() {
      return new GuidedSourceInputResolver(CONTRACTS);
    }

    @Bean
    GuidedStepVerifier verifier(GuidedTranslationStore store) {
      return new GuidedStepVerifier(store);
    }

    private com.citi.put.checks.studio.guided.publication.ObservedReplayPins fixturePins() {
      var policy =
          CONTRACTS
              .object()
              .put("version", 1)
              .put("policyId", "fixture-policy")
              .put("policyVersion", "1")
              .put("applicationId", "orders")
              .put("environment", "fixture")
              .put("entryPolicyId", "blank");
      policy.putArray("allowedOrigins").add(ORIGIN);
      policy.putArray("rules");
      policy.putNull("applicationPolicy");
      return new com.citi.put.checks.studio.guided.publication.ObservedReplayPins(
          CONTRACTS,
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
      return new GuidedMaterializationService(jdbc, CONTRACTS);
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
              CONTRACTS,
              access,
              new GuidedSessionProperties(true, Map.of()),
              Clock.systemUTC());
      service.installBridge(
          materialization,
          new GuidedPreparationStore(jdbc, CONTRACTS),
          new GuidedBindingStore(jdbc, CONTRACTS, materialization),
          new GuidedAssignmentStore(jdbc, CONTRACTS));
      service.installTranslation(store, questions);
      service.installEvidence(
          new com.citi.put.checks.studio.guided.evidence.RecordedGuidedEvidenceProjection(
              new com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceRepository(jdbc),
              new com.citi.put.checks.studio.guided.evidence.GuidedRecordingProperties(null),
              false,
              CONTRACTS));
      // STUDIO-OBS-014 S3: one uniform governed policy for the class (ar-mounted-rules B14); the
      // migrated reads rely on its business-read grant.
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
              new GuidedPromptAssembler(CONTRACTS),
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
   * The class's governed observation application policy (ar-mounted-rules B14): a structural policy
   * with one business-read grant on {@code <main aria-label='Operations'>}. On pages without that
   * anchor (privacyEcho, nativeToggle, /echo) the grant yields no candidate, so the uniform policy
   * behaves as "no grants" there.
   */
  /**
   * The service-plane controller identity. {@code GuidedInternalSecurity.Identity} is
   * package-private to the session package this class no longer lives in, and the services under
   * test check {@code instanceof} on that very class, so it is built by reflection.
   */
  static Authentication controllerIdentity() {
    try {
      Class<?> type =
          Class.forName(
              "com.citi.put.checks.studio.guided.session.GuidedInternalSecurity$Identity");
      var constructor = type.getDeclaredConstructor(String.class, String.class);
      constructor.setAccessible(true);
      return (Authentication) constructor.newInstance("controller-1", "backend-controller");
    } catch (ReflectiveOperationException failure) {
      throw new IllegalStateException(failure);
    }
  }

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
        CONTRACTS
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
        CONTRACTS
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
        + ORIGIN
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
  final Authentication controller = controllerIdentity();
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
    // STUDIO-OBS-014 S3b: each test runs on a freshly migrated isolated database, so the class's
    // approved governed policy is seeded here; the bean-time seed only reached the base database.
    com.citi.put.checks.studio.support.ObservedPublicationFixture.seedPolicy(
        jdbc, "CSI-123", "orders", "fixture", List.of(ORIGIN), governedPolicy(), "ALLOW");
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
            ? "[{\"name\":\"config\",\"kind\":\"plain\",\"value\":\"" + CONFIG_INPUT + "\"}]"
            : "[]",
        mapper.writeValueAsString(authoring),
        mapper.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())));
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
    focusHelper = false;
    focusTargetChange = false;
    wideSession = false;
    MUTATIONS.set(0);
    Files.writeString(
        TEMP.resolve("worker.jwt"), token("owning-worker", "worker-1", "studio-guided-controller"));
    Path journal = Files.createTempDirectory(TEMP, "journal-");
    // STUDIO-OBS-014 S3 (RK-2, ar-mounted-rules): the worker is given neither `rules` nor
    // `applicationPolicy`; the class's governed policy (governedPolicy()) is frozen into each
    // session and reaches the worker in the hash-bound context. This record is what the runner was
    // configured with (no secret); the runner refuses any key it does not enumerate.
    ObjectNode config =
        CONTRACTS
            .object()
            .put("workerId", "worker-1")
            .put("host", "127.0.0.1")
            .put("port", RUNNER_PORT)
            .put("journalDirectory", journal.toString())
            .put("controllerIssuer", "fixture-issuer")
            .put("controllerSubject", "controller-1")
            .put("callbackBaseUrl", "https://localhost:" + backendPort);
    Files.writeString(TEMP.resolve("worker.json"), config.toString());
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
    // aria-bridge-ruling01 §4.5: the controlled model only ever plans and selects.
    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "NEXT_ACTION");
  }

  @AfterAll
  static void close() {
    APPLICATION.stop(0);
    PROVIDER.stop(0);
    DATABASE.stop();
  }

  @Test
  void aFillWhoseFocusHandlerInsertsHelperTextElsewhereWritesAndTheSessionContinues()
      throws Exception {
    focusHelper = true;
    String id = plannedSession(planNavLit());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS.object().put("kind", "authoredLiteral").put("sourceInputId", inputId(id, 1)));
    JsonNode ledger = admit(id, reserve(id, fill));
    advance(id, ledger, "helper-fill");
    await(() -> RECEIPT.get() != null, 5000);
    // The write happened, with exactly the authored literal.
    assertThat(RECEIPT.get()).isEqualTo("fixture-input");
    String admission = ledger.path("admission").path("admissionId").asText();
    await(
        () ->
            "SUCCEEDED"
                .equals(
                    jdbc.queryForObject(
                        "SELECT document->>'state' FROM studio_guided_actions WHERE admission_id=?",
                        String.class,
                        admission)),
        5000);
    // The session continues: it is not stopped UNKNOWN_OUTCOME (or failed) by the fill, and the
    // runner never said why it would.
    assertThat(
            jdbc.queryForObject(
                "SELECT state FROM studio_guided_sessions WHERE session_id=?", String.class, id))
        .isNotIn("UNKNOWN_OUTCOME", "FAILED", "CANCELLED", "EXPIRED");
    assertThat(Files.readString(workerHarness.logFile())).doesNotContain("POST_FOCUS_CHANGED");
    assertThat(actionCount(id)).isEqualTo(2);
  }

  @Test
  void aFocusHandlerThatChangesTheTargetItselfStillStopsTheSessionAndWritesNothing()
      throws Exception {
    focusTargetChange = true;
    String id = plannedSession(planNavLit());
    advance(id, admit(id, reserve(id, navigation(id))), "navigate");
    ObjectNode fill = proposal(id, 1, "fill", "destination");
    fill.withObject("/operation")
        .set(
            "value",
            CONTRACTS.object().put("kind", "authoredLiteral").put("sourceInputId", inputId(id, 1)));
    advance(id, admit(id, reserve(id, fill)), "target-fill");
    await(
        () ->
            "UNKNOWN_OUTCOME"
                .equals(
                    jdbc.queryForObject(
                        "SELECT state FROM studio_guided_sessions WHERE session_id=?",
                        String.class,
                        id)),
        10000);
    // At-most-once and the UNKNOWN_OUTCOME mapping are unchanged for a real target change: nothing
    // was written.
    assertThat(RECEIPT.get()).isNull();
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
    proposal.withObject("/operation").put("destinationInputId", inputId(id, 0));
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
                HttpRequest.newBuilder(URI.create(ORIGIN + "/connect")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    assertThat(connection.statusCode()).isEqualTo(200);
    assertThat(connection.body()).isEqualTo("controlled-public-fixture-account");
    ObjectNode start =
        CONTRACTS
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
          return CONTRACTS
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
    return CONTRACTS
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
    return span("destination", "navigate.destination", 6, 6 + (ORIGIN + "/start").length());
  }

  /** The authored literal {@code fixture-input}. */
  ObjectNode literalReference() {
    int start = sourceText().lastIndexOf("fixture-input");
    return span("nonsecretText", "fill.value", start, start + "fixture-input".length());
  }

  ObjectNode planTemplate(List<ObjectNode> references, List<ObjectNode> obligations) {
    ObjectNode plan = CONTRACTS.object();
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
    ObjectNode action = CONTRACTS.object();
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
            CONTRACTS,
            new GuidedPromptAssembler(CONTRACTS),
            inputs,
            new GuidedProposalValidator(CONTRACTS),
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

    class ItsPollGuidedFocusMutationJoinedITcondition {
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
    var itsPoll = new ItsPollGuidedFocusMutationJoinedITcondition();
    if (!itsPoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("IT-S GuidedFocusMutationJoinedIT-condition")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(java.time.Duration.ZERO)
            .pollInterval(java.time.Duration.ofMillis(25))
            .atMost(java.time.Duration.ofNanos(Math.max(1L, end - System.nanoTime())))
            .until(
                () -> {
                  if (itsPoll.initialAwaitTick) {
                    itsPoll.initialAwaitTick = false;
                    return false;
                  }
                  return itsPoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException itsTimeout) {
        // Preserve the original last guard/observation and its assertion/error mapping.
        if (!itsPoll.terminal) {
          itsPoll.step();
        }
      }
    }
    if (itsPoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (itsPoll.failure instanceof Error error) {
      throw error;
    }

    assertThat(condition.getAsBoolean()).isTrue();
  }
}
