package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.SSLContext;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Shared transport/application fixture with one independently owned instance per bridge test class.
 * Planning, source access, reservations, and admission authority remain in their respective tests.
 * The support-folder location intentionally retains the tests' declared guided.session package.
 */
final class GuidedBridgeFixture {
  final GuidedContracts contracts = new GuidedContracts();
  final PostgreSQLContainer<?> database = new PostgreSQLContainer<>("postgres:15-alpine");
  final Path temp;
  final Path dist;
  final RunnerTestTls runnerTls;

  /** The backend's identity toward the runner: also the guided runner client's context. */
  final SSLContext tls;

  /** What the runner (a worker calling the backend, or a double standing in for it) presents. */
  final SSLContext runnerSide;

  final KeyPair issuer;
  final int runnerPort;
  final HttpServer application;
  final AtomicInteger navigations = new AtomicInteger(), connections = new AtomicInteger();
  final AtomicReference<String> receipt = new AtomicReference<>();
  final String capture = "  independent-" + UUID.randomUUID() + "-é😀  ";
  final String passwordEcho = "password-canary-" + UUID.randomUUID();
  final String ordinaryEcho = "  ordinary-canary-" + UUID.randomUUID() + "  ";
  final AtomicInteger echoNavigations = new AtomicInteger(), toggleAttempts = new AtomicInteger();
  volatile boolean privacyEcho, nativeToggle;
  final String configInput = "configured-" + UUID.randomUUID();
  final String origin;
  volatile boolean replaceTarget,
      wideSession,
      genericRead,
      belowFold,
      multiStep,
      dropCompletionCallbacks;
  volatile boolean failClaims, corruptClaimResponse;
  final java.util.concurrent.atomic.AtomicBoolean holdNextRefresh =
      new java.util.concurrent.atomic.AtomicBoolean();
  volatile CountDownLatch refreshCallbackHeld = new CountDownLatch(1),
      releaseRefreshCallback = new CountDownLatch(1);
  volatile long slowNavigationMillis;
  final java.util.concurrent.atomic.AtomicBoolean holdNextClaim =
      new java.util.concurrent.atomic.AtomicBoolean();
  volatile CountDownLatch claimResponseCaptured = new CountDownLatch(1);
  volatile CountDownLatch releaseClaimResponse = new CountDownLatch(1);
  final AtomicInteger mutations = new AtomicInteger();
  final AtomicInteger clickReceipts = new AtomicInteger();
  final AtomicInteger fillReceipts = new AtomicInteger();

  GuidedBridgeFixture(String temporaryPrefix, Path workerEvidencePath) throws Exception {
    temp = Files.createTempDirectory(temporaryPrefix);
    // STUDIO-OBS-009 AC-12 i: no private copy of dist. The harness spawns the real folded entry
    // point and records the digest of what it spawned; the sole rebuild is the F-merge's.
    dist = RunnerProcessHarness.defaultDistDirectory().toAbsolutePath().normalize();
    ObjectNode workerEvidence = contracts.object().put("snapshot", dist.toString());
    workerEvidence.put("distDigest", RunnerProcessHarness.distDigestOf(dist));
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
                      .digest(Files.readAllBytes(dist.resolve(relative)))));
    }
    hashes.put(
        "scripts/browser-provenance.mjs",
        HexFormat.of()
            .formatHex(
                MessageDigest.getInstance("SHA-256")
                    .digest(
                        Files.readAllBytes(
                            Path.of("../studio-runner/scripts/browser-provenance.mjs")))));
    Files.writeString(workerEvidencePath, workerEvidence.toString());
    // One test CA (lane D3.0): the runner and the backend certificates chain to it, the runner
    // pins
    // the backend certificate, and the backend trusts only the CA.
    runnerTls = RunnerTestTls.shared();
    tls = runnerTls.backendTls().sslContext();
    runnerSide =
        runnerTls.serverContext(
            Identity.RUNNER, runnerTls.trustStore(), runnerTls.trustStorePasswordFile());
    var generator = KeyPairGenerator.getInstance("RSA");
    generator.initialize(2048);
    issuer = generator.generateKeyPair();
    Files.writeString(
        temp.resolve("issuer.pub"),
        "-----BEGIN PUBLIC KEY-----\n"
            + Base64.getMimeEncoder(64, new byte[] {10})
                .encodeToString(issuer.getPublic().getEncoded())
            + "\n-----END PUBLIC KEY-----\n");
    // AC-12 h: an exclusive bind on both loopback families, outside the database range.
    runnerPort = RunnerProcessHarness.exclusivelyFreePort();
    application = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    origin = "http://127.0.0.1:" + application.getAddress().getPort();
    application.createContext(
        "/connect",
        exchange -> {
          connections.incrementAndGet();
          byte[] body = "controlled-public-fixture-account".getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(200, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    application.createContext(
        "/start",
        exchange -> {
          navigations.incrementAndGet();
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
                  + capture
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
                    + capture
                    + "</output>"
                    + "<label>Destination<textarea oninput=\"fetch('/receipt',"
                    + "{method:'POST',body:this.value})\"></textarea></label>"
                    + "</main></body></html>";
          }
          if (privacyEcho) {
            html =
                "<html><body><input type='password' aria-label='Login secret' value='"
                    + passwordEcho
                    + "'><input aria-label='Ordinary input' value='"
                    + ordinaryEcho
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
    application.createContext(
        "/echo",
        exchange -> {
          echoNavigations.incrementAndGet();
          byte[] bytes =
              ("<html><body><button>"
                      + passwordEcho
                      + "</button><button>"
                      + ordinaryEcho.strip()
                      + "</button></body></html>")
                  .getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
          exchange.sendResponseHeaders(200, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    application.createContext(
        "/toggle",
        exchange -> {
          toggleAttempts.incrementAndGet();
          exchange.sendResponseHeaders(204, -1);
          exchange.close();
        });
    application.createContext(
        "/receipt",
        exchange -> {
          fillReceipts.incrementAndGet();
          receipt.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
          exchange.sendResponseHeaders(204, -1);
          exchange.close();
        });
    application.createContext(
        "/mutation",
        exchange -> {
          byte[] body = (replaceTarget ? "yes" : "no").getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(200, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    application.createContext(
        "/mutated",
        exchange -> {
          replaceTarget = false;
          mutations.incrementAndGet();
          exchange.sendResponseHeaders(204, -1);
          exchange.close();
        });
    application.createContext(
        "/clicked",
        exchange -> {
          if (exchange.getRequestMethod().equals("POST")) {
            clickReceipts.incrementAndGet();
          }
          exchange.sendResponseHeaders(204, -1);
          exchange.close();
        });
  }

  void start() {
    application.start();
    database.start();
    // STUDIO-OBS-012A / ADR-SC-005 D-B: the re-baselined schema head (core V1–V11 + V12–V18).
    Flyway.configure()
        .dataSource(database.getJdbcUrl(), database.getUsername(), database.getPassword())
        .locations("classpath:db/migration")
        .target("23") // STUDIO-OBS-014 S3: governance tables (V19) at head
        .load()
        .migrate();
  }

  void properties(DynamicPropertyRegistry registry) {
    RunnerProcessHarness.backendServerSslProperties(runnerTls)
        .forEach((name, value) -> registry.add(name, () -> value));
    registry.add(
        "studio.guided-authoring.service-public-key",
        () -> Base64.getEncoder().encodeToString(issuer.getPublic().getEncoded()));
    registry.add("studio.guided-authoring.service-issuer", () -> "fixture-issuer");
    registry.add("studio.guided-authoring.mtls-required", () -> true);
  }

  ObjectNode governedPolicy() {
    ObjectNode policy =
        contracts
            .object()
            .put("policyRuleId", "structural-policy")
            .put("allowStructuralDiscovery", true);
    ObjectNode grant =
        contracts.object().put("policyRuleId", "business-read").put("origin", origin);
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

  String token(String role, String subject, String audience) {
    try {
      long now = Instant.now().getEpochSecond();
      String header =
          Base64.getUrlEncoder()
              .withoutPadding()
              .encodeToString(
                  "{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
      String claims =
          contracts
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
      signature.initSign(issuer.getPrivate());
      signature.update(signed.getBytes(StandardCharsets.US_ASCII));
      return signed
          + "."
          + Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign());
    } catch (Exception failure) {
      throw new IllegalStateException(failure);
    }
  }

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
              && holdNextRefresh.compareAndSet(true, false)) {
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
          if (uri.endsWith("/claim") && (corruptClaimResponse || holdNextClaim.get())) {
            var buffered = new org.springframework.web.util.ContentCachingResponseWrapper(http);
            chain.doFilter(request, buffered);
            if (buffered.getStatus() == 202 && corruptClaimResponse) {
              ObjectNode grant =
                  (ObjectNode)
                      contracts.parse(
                          new String(buffered.getContentAsByteArray(), StandardCharsets.UTF_8));
              grant
                  .withObject("/owner")
                  .put("fence", grant.path("owner").path("fence").asInt() + 1);
              byte[] changed = grant.toString().getBytes(StandardCharsets.UTF_8);
              buffered.resetBuffer();
              buffered.setContentLength(changed.length);
              buffered.getOutputStream().write(changed);
            }
            if (buffered.getStatus() == 202 && holdNextClaim.compareAndSet(true, false)) {
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

  String prepareScenario(org.junit.jupiter.api.TestInfo testInfo) {
    String testName = testInfo.getTestMethod().orElseThrow().getName();
    privacyEcho =
        testName.equals(
            "uncapturedPasswordAndInputEchoesStayPrivateAcrossActualDocumentNavigation");
    nativeToggle =
        testName.equals("preventedNativeToggleNeverCommitsSuccessOrRetries")
            || testName.equals("nativeRadioUncheckIsRefusedBeforeAnyBrowserAttempt");
    echoNavigations.set(0);
    toggleAttempts.set(0);
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
    clickReceipts.set(0);
    fillReceipts.set(0);
    multiStep =
        testInfo
            .getTestMethod()
            .orElseThrow()
            .getName()
            .equals("freshObservationConnectsTwoAuthoredStepsWithoutReplayingProducer");
    genericRead = genericRead || multiStep;
    return testName;
  }

  void isolateDatabase(DataSource fixtureDataSource) {
    String isolatedDatabase = "bridge_" + UUID.randomUUID().toString().replace("-", "");
    var admin =
        new DriverManagerDataSource(
            database.getJdbcUrl(), database.getUsername(), database.getPassword());
    new JdbcTemplate(admin).execute("CREATE DATABASE " + isolatedDatabase);
    ((DriverManagerDataSource) fixtureDataSource)
        .setUrl(database.getJdbcUrl().replace(database.getDatabaseName(), isolatedDatabase));
    Flyway.configure()
        .dataSource(fixtureDataSource)
        .locations("classpath:db/migration")
        .load()
        .migrate();
  }

  void resetWorkerState() {
    holdNextRefresh.set(false);
    refreshCallbackHeld = new CountDownLatch(1);
    releaseRefreshCallback = new CountDownLatch(1);
    dropCompletionCallbacks = false;
    failClaims = false;
    corruptClaimResponse = false;
    slowNavigationMillis = 0;
    holdNextClaim.set(false);
    claimResponseCaptured = new CountDownLatch(1);
    releaseClaimResponse = new CountDownLatch(1);
    navigations.set(0);
    connections.set(0);
    receipt.set(null);
    replaceTarget = false;
    wideSession = false;
    mutations.set(0);
  }

  Path prepareWorkerJournal() throws Exception {
    Files.writeString(
        temp.resolve("worker.jwt"), token("owning-worker", "worker-1", "studio-guided-controller"));
    Path journal = Files.createTempDirectory(temp, "journal-");
    return journal;
  }

  RunnerProcessHarness startWorker(Path journal, int backendPort) throws Exception {
    RunnerProcessHarness workerHarness =
        RunnerProcessHarness.builder(runnerTls)
            .port(runnerPort)
            .workDirectory(Files.createTempDirectory(temp, "runner-"))
            .callbackBaseUrl("https://localhost:" + backendPort)
            .env(RunnerProcessHarness.KEY_OBJECT_STORE_DIR, temp.resolve("objects").toString())
            .guided(
                new RunnerProcessHarness.Guided(
                    "worker-1",
                    journal,
                    "fixture-issuer",
                    "controller-1",
                    temp.resolve("issuer.pub"),
                    "https://localhost:" + backendPort,
                    temp.resolve("worker.jwt")))
            .start();
    return workerHarness;
  }

  void closeWorker(RunnerProcessHarness harness) throws Exception {
    if (harness != null) {
      // AC-11 k / I-T1: stop the runner and everything it left. The privacy oracle reads the log
      // first; then a clean exit is asserted (exit 0, no force within the guided grace) and no
      // survivor.
      var report = harness.teardown();
      assertThat(Files.readString(harness.logFile()))
          .doesNotContain(capture, passwordEcho, ordinaryEcho.strip());
      report.assertNoSurvivors();
      report.assertCleanExit();
    }
  }
}
