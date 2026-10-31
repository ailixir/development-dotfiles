package com.citi.put.checks.corun;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.DispatchOutcome;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.RunJob;
import com.citi.put.checks.studio.dispatch.RunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.dispatch.StudioRunnerProperties;
import com.citi.put.checks.studio.dispatch.StudioRunnerTls;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.CanonicalStudioCodec;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.evidence.VideoEvidenceFixtures;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationBaseRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationRepository;
import com.citi.put.checks.studio.guided.publication.ObservedArtifactLowerer;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.guided.publication.ObservedReplayProperties;
import com.citi.put.checks.studio.guided.publication.PublicationContracts;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.translation.GuidedCallBudget;
import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedModelRequest;
import com.citi.put.checks.studio.guided.translation.GuidedModelResponse;
import com.citi.put.checks.studio.recovery.RunningReaper;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.citi.put.checks.studio.support.RunnerProcessHarness.ProcessFact;
import com.citi.put.checks.studio.support.RunnerProcessHarness.TeardownReport;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.lang.management.ManagementFactory;
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
import java.security.Signature;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingRequestWrapper;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-009 AC-11 base legs on the folded runner (lane F, ruling A16).
 *
 * <p>This class replaces the retired {@code StudioCoRunIT} (the compile-path harness, deleted with
 * the compile path). What is real: the Spring application with its Postgres, its public routes, its
 * dispatcher, ledger, reapers and internal callback routes; the one {@code studio-runner/dist}
 * entry point started by {@link RunnerProcessHarness} over mutual TLS (the honest {@code dist} is
 * the collectors' digest, recorded per runner generation); a real Chromium replaying the published
 * plan against a loopback page. What is injected, and where: the backend side wraps the real {@link
 * HttpRunnerDispatchClient} (a lost acknowledgment is the real send followed by an ambiguous
 * outcome, a duplicate is the same job sent twice), a servlet filter records the runner's real
 * callbacks so that a late one can be replayed byte for byte, and a measurement prelude in the
 * runner process counts what arrives (admissions, cancel relays, replay children). The published
 * plan is seeded through the production publication writers with the loopback origin and the real
 * runner build identity, because the shared fixture's origin and build are synthetic and a real
 * runner refuses them.
 *
 * <p><b>The measure of "zero repeated dispatches".</b> Per run, three independent counters must
 * agree: the dispatcher sent once (backend client), the runner admitted one run and forked one
 * replay child (runner prelude), and the ledger kept one attempt identity. A leg that injects a
 * duplicate on purpose reports the injected request separately and still requires one child.
 *
 * <p>The class writes {@code build/corun/fault-injection-raw.json}; {@code tools/corun-report.mjs}
 * judges it against the JUnit XML and writes the committed evidence document.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT,
    properties = {"spring.main.banner-mode=off", "logging.level.root=WARN"})
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import({ObservedPublicationFixture.FreshAuthority.class, ObservedCoRunIT.Wiring.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ObservedCoRunIT {

  // ── identity of this co-run ──────────────────────────────────────────────

  private static final String CSI_ID = "60491";
  private static final String OWNER = "corun-owner@citi.com";
  private static final String ENVIRONMENT = "Production";
  private static final String RUNNER_INSTANCE_PREFIX = "corun";
  private static final String BUILD_DIGEST = "c".repeat(64);
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final GuidedContracts C = new GuidedContracts();
  private static final Pattern START_FAILED = Pattern.compile("GUIDED_START_FAILED (\\{.*\\})");

  // ── static fixtures: one CA, one dist, one loopback target, one catalog ──

  private static final RunnerTestTls TLS = RunnerTestTls.shared();
  private static final Path DIST;
  private static final String DIST_DIGEST;
  private static final Path TEMP;
  private static final Path OBJECTS;
  private static final int RUNNER_PORT;
  private static final boolean GUIDED = !"0".equals(System.getenv("CORUN_GUIDED"));
  private static final int BACKEND_PORT;
  private static final KeyPair ISSUER;
  private static final String WORKER_ID = "worker-1";
  private static final String SERVICE = "corun-service-" + UUID.randomUUID();
  private static final String CALLBACK = "corun-callback-" + UUID.randomUUID();
  private static final HttpServer TARGET;
  private static final ExecutorService TARGET_THREADS = Executors.newCachedThreadPool();
  private static final String ORIGIN;
  private static final ObjectNode CATALOG;
  private static final String CATALOG_JSON;
  private static final Path CATALOG_FILE;
  private static final AtomicInteger START_HITS = new AtomicInteger();
  private static final AtomicInteger HOLD_HITS = new AtomicInteger();
  private static final AtomicInteger LOGIN_HITS = new AtomicInteger();
  private static final java.util.concurrent.atomic.AtomicReference<String> RECEIPT =
      new java.util.concurrent.atomic.AtomicReference<>();
  private static final String SECRET_NAME = "LOGIN_PW";

  /** Spaces, slash, plus, equals, percent, ampersand, angle brackets and non-ASCII, no quote. */
  private static final String CANARY = "Obs009 Co/run+4c1=%ü&<x>-never-stored";

  private static volatile CountDownLatch holdRelease = new CountDownLatch(1);
  private static volatile CountDownLatch holdEntered = new CountDownLatch(1);
  private static final ObjectNode EVIDENCE = JSON.createObjectNode();
  private static final long STARTED = System.currentTimeMillis();
  private static final Duration ORPHAN_WINDOW = Duration.ofSeconds(90);

  static {
    try {
      TEMP = Files.createTempDirectory("observed-corun-");
      OBJECTS = Files.createDirectories(TEMP.resolve("objects"));
      DIST = RunnerProcessHarness.defaultDistDirectory().toAbsolutePath().normalize();
      DIST_DIGEST = RunnerProcessHarness.distDigestOf(DIST);
      RUNNER_PORT = RunnerProcessHarness.exclusivelyFreePort();
      int backend = RunnerProcessHarness.exclusivelyFreePort();
      while (backend == RUNNER_PORT) {
        backend = RunnerProcessHarness.exclusivelyFreePort();
      }
      BACKEND_PORT = backend;
      var generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      ISSUER = generator.generateKeyPair();
      Files.writeString(
          TEMP.resolve("issuer.pub"),
          "-----BEGIN PUBLIC KEY-----\n"
              + Base64.getMimeEncoder(64, new byte[] {10})
                  .encodeToString(ISSUER.getPublic().getEncoded())
              + "\n-----END PUBLIC KEY-----\n");
      TARGET = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      TARGET.setExecutor(TARGET_THREADS);
      ORIGIN = "http://localhost:" + TARGET.getAddress().getPort();
      TARGET.createContext(
          "/start",
          exchange -> {
            START_HITS.incrementAndGet();
            byte[] page =
                ("<html><head><title>Co-run target</title></head><body>"
                        + "<main aria-label='Operations'>ready</main></body></html>")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, page.length);
            exchange.getResponseBody().write(page);
            exchange.close();
          });
      TARGET.createContext(
          "/hold",
          exchange -> {
            // The black hole: the connection is accepted and never answered until the test lets go.
            HOLD_HITS.incrementAndGet();
            holdEntered.countDown();
            try {
              holdRelease.await(150, TimeUnit.SECONDS);
              byte[] page = "<html><body>late</body></html>".getBytes(StandardCharsets.UTF_8);
              exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
              exchange.sendResponseHeaders(200, page.length);
              exchange.getResponseBody().write(page);
            } catch (InterruptedException | IOException closed) {
              // The browser went away first: that is the point of the leg.
            } finally {
              exchange.close();
            }
          });
      TARGET.createContext(
          "/login",
          exchange -> {
            LOGIN_HITS.incrementAndGet();
            byte[] page =
                ("<html><head><title>Co-run login</title></head><body><main aria-label='Operations'>"
                        + "<input type='password' aria-label='Password' autocomplete='off'"
                        + " oninput=\"fetch('/receipt',{method:'POST',body:this.value})\">"
                        + "</main></body></html>")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, page.length);
            exchange.getResponseBody().write(page);
            exchange.close();
          });
      TARGET.createContext(
          "/receipt",
          exchange -> {
            RECEIPT.set(
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          });
      TARGET.start();
      CATALOG = realCatalog();
      CATALOG_JSON = JSON.createArrayNode().add(CATALOG).toString();
      CATALOG_FILE = Files.writeString(TEMP.resolve("catalog.json"), CATALOG.toString());
      EVIDENCE.put("distDigest", DIST_DIGEST);
      EVIDENCE.put("runnerEntry", "dist/main.js (folded, TLS listener)");
      EVIDENCE.put("target", "loopback http page (no external host)");
      EVIDENCE.put("startedAt", Instant.ofEpochMilli(STARTED).toString());
      EVIDENCE.putObject("legs");
    } catch (Exception failure) {
      throw new ExceptionInInitializerError(failure);
    }
  }

  /**
   * The runner's own build identity, as its loader derives it: the catalog a real runner accepts.
   */
  private static ObjectNode realCatalog() throws IOException, InterruptedException {
    String root = DIST.toUri().toString();
    String script =
        "import {readFileSync} from 'node:fs';"
            + "import {OBSERVED_PROFILE,hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH} from '"
            + root
            + "validator/observedReferencePolicy.js';"
            + "const r=JSON.parse(readFileSync(new URL('"
            + root
            + "runtime-versions.json'),'utf8'));"
            + "console.log(JSON.stringify({profile:OBSERVED_PROFILE,build:{"
            + "profileHash:hashObserved(OBSERVED_PROFILE),"
            + "schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH,"
            + "referenceBundleHash:r.observedReferenceBundleHash,"
            + "chromiumBuild:r.observedChromiumBuild,"
            + "executableImageDigest:'"
            + BUILD_DIGEST
            + "'}}));";
    Process process =
        new ProcessBuilder("node", "--input-type=module", "-e", script)
            .redirectErrorStream(true)
            .start();
    String out = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    if (!process.waitFor(60, TimeUnit.SECONDS) || process.exitValue() != 0) {
      throw new IllegalStateException("cannot derive the runner build identity");
    }
    return (ObjectNode) C.parse(out.strip());
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    // The backend is the TLS server of the runner's callbacks. The replay callback presents no
    // client certificate (unchanged in 009), so client authentication is requested, not required.
    RunnerProcessHarness.backendServerSslProperties(TLS)
        .forEach(
            (name, value) ->
                registry.add(name, () -> name.equals("server.ssl.client-auth") ? "want" : value));
    RunnerProcessHarness.runnerTlsProperties(TLS)
        .forEach((name, value) -> registry.add(name, () -> value));
    registry.add("server.port", () -> BACKEND_PORT);
    registry.add("studio.runner.base-url", () -> "https://127.0.0.1:" + RUNNER_PORT);
    // The guided half of the same folded runner: the public Run of a draft starts a session that
    // the backend's coordinator drives into this runner, with the model replaced at its seam.
    if (GUIDED) {
      registry.add("studio.guided-authoring.enabled", () -> true);
      registry.add(
          "studio.guided-authoring.service-public-key",
          () -> Base64.getEncoder().encodeToString(ISSUER.getPublic().getEncoded()));
      registry.add("studio.guided-authoring.service-issuer", () -> "fixture-issuer");
      registry.add("studio.guided-authoring.mtls-required", () -> true);
      registry.add(
          "studio.guided-authoring.runner-origin", () -> "https://127.0.0.1:" + RUNNER_PORT);
      registry.add(
          "studio.guided-authoring.controller-token-file",
          () -> TEMP.resolve("controller.jwt").toString());
      registry.add("studio.guided-authoring.translation.enabled", () -> true);
      registry.add("studio.guided-authoring.translation.worker-id", () -> WORKER_ID);
      registry.add(
          "studio.guided-authoring.translation.controller-origin",
          () -> "https://localhost:" + BACKEND_PORT);
      registry.add(
          "studio.guided-authoring.translation.controller-token-file",
          () -> TEMP.resolve("coordinator.jwt").toString());
      registry.add("studio.guided-authoring.translation.poll-ms", () -> 200);
      registry.add("studio.guided.publication.enabled", () -> true);
      registry.add("studio.guided-authoring.csi-budget.max-concurrent-sessions", () -> 50);
      registry.add("studio.gateway.provider", () -> "vertex");
      registry.add("studio.gateway.endpoint", () -> ORIGIN);
      registry.add("studio.gateway.project", () -> "fixture");
      registry.add("studio.gateway.location", () -> "global");
      registry.add("studio.gateway.model", () -> "controlled");
      registry.add("studio.gateway.credentials.mode", () -> "none");
    }
    registry.add("studio.runner.service-identity-token", () -> SERVICE);
    registry.add("studio.execution.callback.service-token", () -> CALLBACK);
    registry.add("studio.execution.enabled", () -> true);
    registry.add("studio.execution.video-store.provider", () -> "local");
    registry.add("studio.execution.video-store.directory", () -> OBJECTS.toString());
    registry.add("studio.observed-replay.enabled", () -> "true");
    registry.add("studio.observed-replay.catalog-json", () -> CATALOG_JSON);
  }

  // ── wiring: the faulting client and the callback recorder ────────────────

  @TestConfiguration
  static class Wiring {
    @Bean
    @Primary
    FaultingDispatchClient faultingDispatchClient(
        ObjectMapper mapper,
        StudioExecutionProperties properties,
        StudioRunnerProperties runner,
        StudioRunnerTls tls) {
      return new FaultingDispatchClient(
          new HttpRunnerDispatchClient(mapper, properties, runner, tls));
    }

    @Bean
    @Primary
    FakeStudioVaultProvider fakeVault() {
      return VAULT;
    }

    @Bean
    @Primary
    ScriptedGateway scriptedGateway() {
      return GATEWAY;
    }

    @Bean
    FilterRegistrationBean<OncePerRequestFilter> guidedCallbackRecorder() {
      var registration =
          new FilterRegistrationBean<OncePerRequestFilter>(new GuidedCallbackRecorder());
      registration.addUrlPatterns("/internal/v2/studio/guided-sessions/*");
      registration.setOrder(Integer.MIN_VALUE + 11);
      return registration;
    }

    @Bean
    FilterRegistrationBean<OncePerRequestFilter> callbackRecorder() {
      var registration = new FilterRegistrationBean<OncePerRequestFilter>(new CallbackRecorder());
      registration.addUrlPatterns("/internal/studio/executions/*");
      registration.setOrder(Integer.MIN_VALUE + 10);
      return registration;
    }
  }

  static final ScriptedGateway GATEWAY = new ScriptedGateway();
  static final FakeStudioVaultProvider VAULT = new FakeStudioVaultProvider(Map.of());

  /**
   * The model, replaced at its seam and nowhere else: the source plan is the one the authored step
   * implies (navigate to the authored address), the next action is the navigation itself, and any
   * later call is held until the test lets go. No provider is called, no model is evaluated.
   */
  static final class ScriptedGateway implements GuidedLlmGatewayClient {
    final AtomicInteger sourcePlans = new AtomicInteger();
    final AtomicInteger nextActions = new AtomicInteger();
    final AtomicInteger others = new AtomicInteger();

    void reset() {
      sourcePlans.set(0);
      nextActions.set(0);
      others.set(0);
    }

    @Override
    public GuidedModelResponse propose(GuidedModelRequest request, GuidedCallBudget budget) {
      JsonNode context = request.projection().document();
      ObjectNode reply = JSON.createObjectNode();
      reply
          .put("schemaVersion", 3)
          .put("kind", request.kind().name())
          .put("requestId", request.requestId());
      switch (request.kind()) {
        case SOURCE_PLAN -> {
          sourcePlans.incrementAndGet();
          JsonNode step = context.path("sourceSteps").get(0);
          reply.putArray("sourceReferences");
          reply
              .putArray("obligations")
              .addObject()
              .put("stepId", step.path("stepId").asText())
              .put("occurrence", 0)
              .put("targetIntent", "page")
              .putNull("scopeIntent")
              .putNull("referenceIndex")
              .putNull("needId")
              .putArray("uses");
          reply.putArray("stepSections");
        }
        case STEP_CODE -> {
          nextActions.incrementAndGet();
          String text = context.path("sourceSteps").get(0).path("text").asText();
          String address = text.substring(text.indexOf("http")).replaceAll("[\\s.]+$", "");
          reply
              .put("status", "CODE")
              .put("code", "await page.goto('" + address + "');")
              .putArray("captures");
        }
        default -> {
          others.incrementAndGet();
          return new GuidedModelResponse(GuidedModelResponse.Code.TIMEOUT, null, null, null, null);
        }
      }
      return new GuidedModelResponse(GuidedModelResponse.Code.OK, reply, 20, 40, "controlled");
    }
  }

  /**
   * The real client, observed and, on request, faulted. Every {@link #send} is the dispatcher's
   * (and counted as such); an injected duplicate is the same job on the wire a second time and is
   * counted apart.
   */
  static final class FaultingDispatchClient implements RunnerDispatchClient {
    enum Fault {
      NONE,
      LOSE_ACKNOWLEDGMENT,
      DUPLICATE_REQUEST
    }

    private final HttpRunnerDispatchClient real;
    private final Map<UUID, AtomicInteger> sends = new ConcurrentHashMap<>();
    private final Map<UUID, AtomicInteger> injected = new ConcurrentHashMap<>();
    private final Map<UUID, List<String>> outcomes = new ConcurrentHashMap<>();
    private final Map<UUID, AtomicInteger> cancels = new ConcurrentHashMap<>();
    private volatile Fault next = Fault.NONE;

    FaultingDispatchClient(HttpRunnerDispatchClient real) {
      this.real = real;
    }

    void arm(Fault fault) {
      this.next = fault;
    }

    int sends(UUID execution) {
      return sends.getOrDefault(execution, new AtomicInteger()).get();
    }

    int injected(UUID execution) {
      return injected.getOrDefault(execution, new AtomicInteger()).get();
    }

    int cancels(UUID execution) {
      return cancels.getOrDefault(execution, new AtomicInteger()).get();
    }

    List<String> outcomes(UUID execution) {
      return List.copyOf(outcomes.getOrDefault(execution, List.of()));
    }

    @Override
    public DispatchOutcome send(RunJob job) {
      UUID execution = job.executionId();
      sends.computeIfAbsent(execution, key -> new AtomicInteger()).incrementAndGet();
      Fault fault = next;
      next = Fault.NONE;
      DispatchOutcome outcome = real.send(job);
      record(execution, "send:" + outcome.kind());
      if (fault == Fault.DUPLICATE_REQUEST) {
        injected.computeIfAbsent(execution, key -> new AtomicInteger()).incrementAndGet();
        DispatchOutcome again = real.send(job);
        record(execution, "injected-duplicate:" + again.kind() + ":" + again.detail());
      }
      if (fault == Fault.LOSE_ACKNOWLEDGMENT) {
        // The runner received and admitted the request; the answer is lost on the way back.
        record(execution, "acknowledgment-lost");
        return DispatchOutcome.ambiguous("fault injection: the acknowledgment was lost");
      }
      return outcome;
    }

    @Override
    public CancelOutcome cancel(UUID executionId) {
      cancels.computeIfAbsent(executionId, key -> new AtomicInteger()).incrementAndGet();
      CancelOutcome outcome = real.cancel(executionId);
      record(executionId, "cancel-relay:" + outcome);
      return outcome;
    }

    private void record(UUID execution, String what) {
      outcomes.computeIfAbsent(execution, key -> new CopyOnWriteArrayList<>()).add(what);
    }
  }

  /** One recorded runner callback: enough to send it again byte for byte, never to print. */
  record Callback(
      int ordinal,
      String method,
      String uri,
      UUID execution,
      String route,
      String authorization,
      String contentType,
      byte[] body,
      int status) {}

  /** One recorded guided callback of the runner (a worker call to the backend). */
  record GuidedCallback(
      String session,
      String route,
      String authorization,
      String fence,
      String idempotencyKey,
      String contentType,
      byte[] body,
      int status) {}

  static final List<GuidedCallback> GUIDED_CALLBACKS = new CopyOnWriteArrayList<>();
  private static final Pattern GUIDED_CALLBACK_PATH =
      Pattern.compile(
          "/internal/v2/studio/guided-sessions/([^/]+)/"
              + "(claim|observations|admissions|advance|outcomes|bootstrap-evidence|lifecycle)");

  static final class GuidedCallbackRecorder extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(
        HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
      var wrapped = new ContentCachingRequestWrapper(request, 1 << 20);
      try {
        chain.doFilter(wrapped, response);
      } finally {
        Matcher match = GUIDED_CALLBACK_PATH.matcher(request.getRequestURI());
        if (match.matches()
            && request.getMethod().equals("POST")
            && request.getHeader("X-Corun-Replay") == null) {
          GUIDED_CALLBACKS.add(
              new GuidedCallback(
                  match.group(1),
                  match.group(2),
                  request.getHeader("Authorization"),
                  request.getHeader("X-Owner-Fence"),
                  request.getHeader("Idempotency-Key"),
                  request.getContentType(),
                  wrapped.getContentAsByteArray(),
                  response.getStatus()));
        }
      }
    }
  }

  static final List<Callback> CALLBACKS = new CopyOnWriteArrayList<>();
  private static final Pattern CALLBACK_PATH =
      Pattern.compile("/internal/studio/executions/([0-9a-f-]{36})/([a-z-]+)");

  static final class CallbackRecorder extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(
        HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
      var wrapped = new ContentCachingRequestWrapper(request, 1 << 20);
      try {
        chain.doFilter(wrapped, response);
      } finally {
        Matcher match = CALLBACK_PATH.matcher(request.getRequestURI());
        if (match.matches()
            && request.getMethod().equals("POST")
            && request.getHeader("X-Corun-Replay") == null) {
          CALLBACKS.add(
              new Callback(
                  CALLBACKS.size(),
                  request.getMethod(),
                  request.getRequestURI(),
                  UUID.fromString(match.group(1)),
                  match.group(2),
                  request.getHeader("Authorization"),
                  request.getContentType(),
                  wrapped.getContentAsByteArray(),
                  response.getStatus()));
        }
      }
    }
  }

  // ── injected collaborators ───────────────────────────────────────────────

  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private RunningReaper runningReaper;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private FaultingDispatchClient client;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private ObjectMapper mapper;
  private final int backendPort = BACKEND_PORT;

  private Authentication owner;
  private Publisher publisher;
  private HttpClient http;
  private HttpClient runnerSide;

  /** One runner generation: a process, its measurement file and its place in the evidence. */
  private final class Generation {
    final RunnerProcessHarness harness;
    final Path counters;
    final int ordinal;
    final double loadAtStart;
    TeardownReport report;
    boolean killed;

    Generation(RunnerProcessHarness harness, Path counters, int ordinal) {
      this.harness = harness;
      this.counters = counters;
      this.ordinal = ordinal;
      this.loadAtStart = load();
    }

    JsonNode counts() {
      // The runner replaces the file atomically; a read can still land between two runs of the
      // process, so an unreadable file is retried, never read as zero.
      for (int attempt = 0; attempt < 20; attempt++) {
        try {
          return JSON.readTree(Files.readString(counters));
        } catch (IOException | RuntimeException unreadable) {
          pause(50);
        }
      }
      throw new IllegalStateException("the runner's measurement file is unreadable");
    }

    int posts() {
      return counts().path("posts").asInt();
    }

    int forks() {
      return counts().path("forks").asInt();
    }

    int deletes(UUID execution) {
      return counts().path("deletes").path(execution.toString()).asInt();
    }

    int guided(String route) {
      return counts().path("guided").path(route).asInt();
    }
  }

  private static final AtomicInteger GENERATIONS = new AtomicInteger();
  private Generation runner;
  private final List<Generation> finished = new ArrayList<>();

  @BeforeEach
  void setUp() throws Exception {
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    publisher = new Publisher(jdbc);
    http =
        HttpClient.newBuilder()
            .sslContext(TLS.backendTls().sslContext())
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    runnerSide =
        HttpClient.newBuilder()
            .sslContext(
                TLS.serverContext(
                    RunnerTestTls.Identity.RUNNER, TLS.trustStore(), TLS.trustStorePasswordFile()))
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    holdRelease = new CountDownLatch(1);
    holdEntered = new CountDownLatch(1);
    CALLBACKS.clear();
    GUIDED_CALLBACKS.clear();
    client.arm(FaultingDispatchClient.Fault.NONE);
    GATEWAY.reset();
    refreshTokens();
  }

  /** The three service tokens live five minutes at most; each test gets fresh ones. */
  private static void refreshTokens() throws Exception {
    Files.writeString(
        TEMP.resolve("controller.jwt"),
        token("backend-controller", "controller-1", "studio-guided-runner"));
    Files.writeString(
        TEMP.resolve("coordinator.jwt"),
        token("backend-controller", "controller-1", "studio-guided-controller"));
    Files.writeString(
        TEMP.resolve("worker.jwt"), token("owning-worker", WORKER_ID, "studio-guided-controller"));
  }

  private static String token(String role, String subject, String audience) throws Exception {
    var encoder = Base64.getUrlEncoder().withoutPadding();
    String header =
        encoder.encodeToString(
            "{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
    ObjectNode claims =
        JSON.createObjectNode()
            .put("iss", "fixture-issuer")
            .put("sub", subject)
            .put("aud", audience)
            .put("role", role)
            .put("exp", Instant.now().plusSeconds(299).getEpochSecond())
            .put("iat", Instant.now().minusSeconds(1).getEpochSecond());
    String signed =
        header + "." + encoder.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
    Signature signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(ISSUER.getPrivate());
    signature.update(signed.getBytes(StandardCharsets.US_ASCII));
    return signed + "." + encoder.encodeToString(signature.sign());
  }

  /** Runs per leg. Three by default; CORUN_REPEATS lowers it for a quick local look. */
  private static final int REPEATS =
      Math.max(1, Integer.parseInt(System.getenv().getOrDefault("CORUN_REPEATS", "3")));

  /** Which run of the leg this is (0-based). Run 0 keeps the 30 s default step timeout. */
  private int iteration;

  @FunctionalInterface
  private interface Body {
    void run() throws Exception;
  }

  private void repeat(Body body) throws Exception {
    for (iteration = 0; iteration < REPEATS; iteration++) {
      if (iteration > 0) {
        resetBetweenRuns();
      }
      body.run();
      finishRunner();
    }
  }

  /** What {@code @BeforeEach} gives a test, for the next run of the same leg. */
  private void resetBetweenRuns() throws Exception {
    holdRelease = new CountDownLatch(1);
    holdEntered = new CountDownLatch(1);
    CALLBACKS.clear();
    GUIDED_CALLBACKS.clear();
    client.arm(FaultingDispatchClient.Fault.NONE);
    GATEWAY.reset();
    refreshTokens();
  }

  private void finishRunner() {
    holdRelease.countDown();
    if (runner != null) {
      Generation generation = runner;
      runner = null;
      stop(generation);
    }
  }

  /** The step timeout of a run that is held on purpose: the default first, a shorter one after. */
  private int heldStepTimeoutSeconds() {
    return iteration == 0 ? 30 : 10;
  }

  @AfterEach
  void tearDownRunner() {
    holdRelease.countDown();
    if (runner != null) {
      Generation generation = runner;
      runner = null;
      stop(generation);
    }
  }

  @AfterAll
  static void writeEvidence() throws IOException {
    TARGET.stop(0);
    TARGET_THREADS.shutdownNow();
    EVIDENCE.put("finishedAt", Instant.now().toString());
    Path out = Path.of("build", "corun", "fault-injection-raw.json");
    Files.createDirectories(out.getParent());
    Files.writeString(out, EVIDENCE.toPrettyString() + "\n");
    // The runner logs are already beside the measurements; the work directories (recordings, object
    // store, journals) are the test's own and go.
    try (java.util.stream.Stream<Path> walk = Files.walk(TEMP)) {
      walk.sorted(java.util.Comparator.reverseOrder())
          .forEach(
              path -> {
                try {
                  Files.deleteIfExists(path);
                } catch (IOException stuck) {
                  // A directory that cannot be removed is left for the operating system's cleaner.
                }
              });
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // The legs
  // ═════════════════════════════════════════════════════════════════════════

  /** Leg 0: the seam works at all — one published plan runs to PASSED through the real runner. */
  @Test
  @Order(0)
  void theFoldedRunnerRunsAPublishedObservedPlanToPassed() throws Exception {
    repeat(this::theFoldedRunnerRunsAPublishedObservedPlanToPassedOnce);
  }

  private void theFoldedRunnerRunsAPublishedObservedPlanToPassedOnce() throws Exception {
    startRunner();
    Run run = newRun("base", "/start");

    assertThat(dispatcher.dispatch(run.executionId)).isTrue();
    ExecutionSnapshotDto done = awaitTerminal(run, Duration.ofSeconds(120));

    assertThat(done.status()).as(diagnose(run)).isEqualTo("PASSED");
    assertSingleDispatch(run, 1);
    assertThat(START_HITS.get()).as("the real browser reached the loopback page").isPositive();
    record(run, "base", runner, done, null);
  }

  /**
   * Leg 1, duplicate requests. The public Run is repeated under one idempotency key and answers the
   * same execution; the dispatcher is raced by two threads and sends once; the same job is put on
   * the wire a second time (the injected duplicate); the runner's own callbacks are replayed byte
   * for byte while the run is live. Exactly one replay child ever starts.
   */
  @Test
  @Order(1)
  void duplicateRequestsNeverStartASecondRunWhileTheRunnerIsSaturated() throws Exception {
    repeat(() -> duplicateRequests(1));
  }

  /**
   * As leg 1, with a free slot: the duplicate request is not turned away by capacity, so it reaches
   * the runner's admission call and meets the backend's one admission per attempt.
   */
  @Test
  @Order(2)
  void duplicateRequestsNeverStartASecondRunWhileTheRunnerHasFreeCapacity() throws Exception {
    repeat(() -> duplicateRequests(2));
  }

  private void duplicateRequests(int poolSize) throws Exception {
    startRunner(poolSize);
    String step = "/hold";
    UUID testId =
        new StudioExecutionFixtures(jdbc)
            .seedTest("Co-run duplicate", CSI_ID, OWNER, List.of("Open " + ORIGIN + step));
    publisher.publish(testId);
    String key = UUID.randomUUID().toString();
    String path = "/api/v1/studio/tests/" + testId + "/execute";
    HttpResponse<String> first = publicPost(path, key);
    HttpResponse<String> second = publicPost(path, key);
    assertThat(first.statusCode()).isEqualTo(202);
    assertThat(second.statusCode()).as("the repeated public Run: " + second.body()).isEqualTo(202);
    UUID executionId = UUID.fromString(mapper.readTree(first.body()).path("executionId").asText());
    assertThat(mapper.readTree(second.body()).path("executionId").asText())
        .as("one idempotency key, one execution")
        .isEqualTo(executionId.toString());
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_dispatch_ledger WHERE test_id = ?",
                Integer.class,
                testId))
        .isEqualTo(1);
    Run run = new Run("duplicate", testId, executionId, "Open " + ORIGIN + step);

    client.arm(FaultingDispatchClient.Fault.DUPLICATE_REQUEST);
    ExecutorService racers = Executors.newFixedThreadPool(2);
    try {
      CountDownLatch go = new CountDownLatch(1);
      List<Future<Boolean>> racing = new ArrayList<>();
      for (int i = 0; i < 2; i++) {
        racing.add(
            racers.submit(
                () -> {
                  go.await();
                  return dispatcher.dispatch(executionId);
                }));
      }
      go.countDown();
      int winners = 0;
      for (Future<Boolean> race : racing) {
        if (race.get(60, TimeUnit.SECONDS)) {
          winners++;
        }
      }
      assertThat(winners).as("two dispatchers raced, one claimed the row").isEqualTo(1);
    } finally {
      racers.shutdownNow();
    }

    awaitRunning(run);
    assertThat(holdEntered.await(60, TimeUnit.SECONDS)).as("the browser is mid-step").isTrue();
    Map<String, Object> before = ledger(run);
    ObjectNode replays = JSON.createObjectNode();
    int refusedOrIdempotent = 0;
    for (Callback callback : List.copyOf(CALLBACKS)) {
      if (!callback.execution().equals(executionId)) {
        continue;
      }
      for (int again = 0; again < 2; again++) {
        int status = replay(callback).statusCode();
        replays.put(callback.route() + "#" + callback.ordinal() + "." + again, status);
        refusedOrIdempotent++;
      }
    }
    assertThat(refusedOrIdempotent).as("callbacks replayed while live").isPositive();
    Map<String, Object> after = ledger(run);
    assertThat(after.get("attempt_id")).isEqualTo(before.get("attempt_id"));
    assertThat(after.get("admission_id")).isEqualTo(before.get("admission_id"));
    assertThat(after.get("runner_instance_id")).isEqualTo(before.get("runner_instance_id"));
    assertThat(after.get("state")).isEqualTo("RUNNING");

    holdRelease.countDown();
    ExecutionSnapshotDto done = awaitTerminal(run, Duration.ofSeconds(120));
    assertThat(done.status()).as(diagnose(run)).isEqualTo("PASSED");
    assertSingleDispatch(run, 1);
    assertThat(client.injected(executionId)).isEqualTo(1);
    ObjectNode extra = JSON.createObjectNode();
    extra.put("runnerPoolSize", poolSize);
    extra.put("repeatedPublicRun", 1);
    extra.put("racingDispatchers", 2);
    extra.put("injectedWireDuplicate", 1);
    extra.put("injectedWireDuplicateAnswer", client.outcomes(executionId).toString());
    extra.set("callbackReplayStatuses", replays);
    record(run, "duplicate", runner, done, extra);
  }

  /**
   * Leg 2, acknowledgment loss. The runner receives and admits the request; the answer is lost. The
   * row stays where the contract leaves it (the send is never repeated), the run completes through
   * the runner's own callbacks, and every later dispatcher pass finds nothing to send.
   */
  @Test
  @Order(3)
  void aLostAcknowledgmentIsNeverAResend() throws Exception {
    repeat(this::aLostAcknowledgmentIsNeverAResendOnce);
  }

  private void aLostAcknowledgmentIsNeverAResendOnce() throws Exception {
    startRunner();
    Run run = newRun("ackLoss", "/start");

    client.arm(FaultingDispatchClient.Fault.LOSE_ACKNOWLEDGMENT);
    assertThat(dispatcher.dispatch(run.executionId)).isTrue();
    assertThat(client.outcomes(run.executionId)).contains("acknowledgment-lost");
    String stateAfterLoss = String.valueOf(ledger(run).get("state"));
    assertThat(stateAfterLoss).isIn("DISPATCHING", "ADMITTED", "RUNNING", "FINALIZING", "DONE");
    for (int pass = 0; pass < 3; pass++) {
      dispatcher.dispatchOnce();
      pause(300);
    }
    ExecutionSnapshotDto done = awaitTerminal(run, Duration.ofSeconds(120));

    assertThat(done.status()).as(diagnose(run)).isEqualTo("PASSED");
    dispatcher.dispatchOnce();
    assertSingleDispatch(run, 1);
    ObjectNode lost = JSON.createObjectNode();
    lost.put("ledgerStateRightAfterTheLostAcknowledgment", stateAfterLoss);
    record(run, "ackLoss", runner, done, lost);
  }

  /**
   * Leg 3, public HTTP cancel in the middle of a step. The browser is stuck on a page that never
   * answers; the owner cancels over the public route; the run ends {@code ERROR / CANCELLED}, the
   * browser tree is gone, and nothing is dispatched again.
   */
  @Test
  @Order(4)
  void aPublicCancelMidStepStopsTheLiveBrowserAndEndsCancelled() throws Exception {
    repeat(this::aPublicCancelMidStepStopsTheLiveBrowserAndEndsCancelledOnce);
  }

  private void aPublicCancelMidStepStopsTheLiveBrowserAndEndsCancelledOnce() throws Exception {
    Generation generation = startRunner();
    Run run = newRun("publicCancel", "/hold");
    assertThat(dispatcher.dispatch(run.executionId)).isTrue();
    awaitRunning(run);
    assertThat(holdEntered.await(60, TimeUnit.SECONDS)).as("the browser is mid-step").isTrue();
    List<ProcessFact> tree = generation.harness.captureTree();
    assertThat(tree).as("the runner's replay child and its browser").isNotEmpty();

    long cancelled = System.nanoTime();
    HttpResponse<String> answer =
        publicPost("/api/v1/studio/executions/" + run.executionId + "/cancel", null);
    assertThat(answer.statusCode()).as("public cancel: " + answer.body()).isEqualTo(202);
    ExecutionSnapshotDto done = awaitTerminalPumping(run, Duration.ofSeconds(90));
    long settledMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - cancelled);

    assertThat(done.status()).as(diagnose(run)).isEqualTo("ERROR");
    assertThat(done.errorCode()).isEqualTo("CANCELLED");
    assertThat(settledMillis).as("a public cancel settles inside 30 s").isLessThan(30_000L);
    awaitUntil(
        () -> generation.harness.survivorsOf(tree).isEmpty(),
        Duration.ofSeconds(30),
        "the browser tree of the cancelled run to be gone");
    assertThat(ledger(run).get("state")).isEqualTo("DONE");
    assertSingleDispatch(run, 1);
    ObjectNode extra = JSON.createObjectNode();
    extra.put("cancelToTerminalMs", settledMillis);
    extra.put("browserTreeProcesses", tree.size());
    extra.put("browserTreeSurvivorsAfterSettle", generation.harness.survivorsOf(tree).size());
    record(run, "publicCancel", generation, done, extra);
  }

  /**
   * Leg 4, runner kill in the middle of a run. SIGKILL of the runner while the step is stuck. The
   * browser tree does not outlive it, the row is settled by recovery (never by another dispatch),
   * and the settled row is not changed by anything that arrives later.
   */
  @Test
  @Order(5)
  void aRunnerKillMidRunIsSettledByRecoveryAndNeverRedispatched() throws Exception {
    repeat(this::aRunnerKillMidRunIsSettledByRecoveryAndNeverRedispatchedOnce);
  }

  private void aRunnerKillMidRunIsSettledByRecoveryAndNeverRedispatchedOnce() throws Exception {
    Generation generation = startRunner();
    Run run = newRun("runnerKill", "/hold", heldStepTimeoutSeconds());
    assertThat(dispatcher.dispatch(run.executionId)).isTrue();
    awaitRunning(run);
    assertThat(holdEntered.await(60, TimeUnit.SECONDS)).as("the browser is mid-step").isTrue();

    generation.killed = true;
    List<ProcessFact> tree = generation.harness.kill9();
    assertThat(tree).as("descendants captured before the kill").isNotEmpty();
    long killed = System.nanoTime();
    // How long the runner's children outlive a SIGKILL of the runner: nothing in the runner can
    // reap them, so this measures what they do on their own (observation, with a generous bound).
    ArrayNode vanished = JSON.createArrayNode();
    java.util.Set<Long> gone = new java.util.HashSet<>();
    long deadline = System.nanoTime() + ORPHAN_WINDOW.toNanos();
    while (System.nanoTime() < deadline && gone.size() < tree.size()) {
      for (ProcessFact fact : tree) {
        if (!gone.contains(fact.pid()) && generation.harness.survivorsOf(List.of(fact)).isEmpty()) {
          gone.add(fact.pid());
          vanished
              .addObject()
              .put("process", Path.of(fact.command()).getFileName().toString())
              .put("afterKillMs", TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - killed));
        }
      }
      pause(250);
    }
    boolean reaped = gone.size() == tree.size();
    long reapedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - killed);
    List<ProcessFact> orphans = generation.harness.survivorsOf(tree);

    for (int pass = 0; pass < 3; pass++) {
      dispatcher.dispatchOnce();
    }
    assertThat(snapshot(run).status()).as("nothing settled the row yet").isEqualTo("RUNNING");
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET run_deadline_at = ? WHERE execution_id = ?",
        ago(Duration.ofSeconds(1)),
        run.executionId);
    runningReaper.reapOnce();
    ExecutionSnapshotDto done = snapshot(run);

    assertThat(done.status()).as(diagnose(run)).isEqualTo("ERROR");
    assertThat(done.errorCode()).isEqualTo("STALE");
    dispatcher.dispatchOnce();
    assertThat(client.sends(run.executionId)).as("never a second dispatch").isEqualTo(1);
    assertThat(generation.posts()).isEqualTo(1);
    assertThat(generation.forks()).isEqualTo(1);
    ObjectNode extra = JSON.createObjectNode();
    extra.put("killedProcessesCaptured", tree.size());
    extra.put("browserTreeReaped", reaped);
    extra.put("browserTreeReapedMillis", reapedMillis);
    extra.put("stepTimeoutSeconds", heldStepTimeoutSeconds());
    extra.put("orphanWindowMs", ORPHAN_WINDOW.toMillis());
    extra.put("orphansAfterWindow", orphans.size());
    extra.set("childrenVanished", vanished);
    record(run, "runnerKill", generation, done, extra);
    assertThat(orphans)
        .as("the runner's children are gone within " + ORPHAN_WINDOW + " of a runner kill")
        .isEmpty();
  }

  /**
   * Leg 5, process restart and stale owner. The runner that owned a stuck run is killed and a new
   * runner process starts on the same address. The new process is never sent the old run; the old
   * run is settled by recovery; a new run on the new process passes; and what the old owner already
   * said (its recorded callbacks) is refused when it arrives again, for its own run and for the new
   * run.
   */
  @Test
  @Order(6)
  void aRestartedRunnerIsNeverHandedTheOldRunAndAStaleOwnerIsRefused() throws Exception {
    repeat(this::aRestartedRunnerIsNeverHandedTheOldRunAndAStaleOwnerIsRefusedOnce);
  }

  private void aRestartedRunnerIsNeverHandedTheOldRunAndAStaleOwnerIsRefusedOnce()
      throws Exception {
    Generation first = startRunner();
    Run old = newRun("restartOld", "/hold", heldStepTimeoutSeconds());
    assertThat(dispatcher.dispatch(old.executionId)).isTrue();
    awaitRunning(old);
    assertThat(holdEntered.await(60, TimeUnit.SECONDS)).as("the browser is mid-step").isTrue();
    List<Callback> staleCallbacks = new ArrayList<>();
    for (Callback callback : List.copyOf(CALLBACKS)) {
      if (callback.execution().equals(old.executionId)) {
        staleCallbacks.add(callback);
      }
    }
    assertThat(staleCallbacks).as("the old owner's recorded callbacks").isNotEmpty();
    first.killed = true;
    List<ProcessFact> tree = first.harness.kill9();
    awaitUntil(
        () -> first.harness.survivorsOf(tree).isEmpty(),
        ORPHAN_WINDOW,
        "the first runner's browser tree to be gone");
    stop(first);
    runner = null;
    holdRelease.countDown();

    Generation second = startRunner();
    assertThat(second.ordinal).isEqualTo(first.ordinal + 1);
    for (int pass = 0; pass < 3; pass++) {
      dispatcher.dispatchOnce();
      pause(300);
    }
    assertThat(second.posts()).as("the restarted runner is handed nothing").isZero();
    assertThat(second.forks()).isZero();

    jdbc.update(
        "UPDATE studio_dispatch_ledger SET run_deadline_at = ? WHERE execution_id = ?",
        ago(Duration.ofSeconds(1)),
        old.executionId);
    runningReaper.reapOnce();
    ExecutionSnapshotDto oldDone = snapshot(old);
    assertThat(oldDone.status()).isEqualTo("ERROR");
    assertThat(oldDone.errorCode()).isEqualTo("STALE");

    holdEntered = new CountDownLatch(1);
    holdRelease = new CountDownLatch(1);
    Run fresh = newRun("restartNew", "/start");
    assertThat(dispatcher.dispatch(fresh.executionId)).isTrue();
    ExecutionSnapshotDto freshDone = awaitTerminal(fresh, Duration.ofSeconds(120));
    assertThat(freshDone.status()).as(diagnose(fresh)).isEqualTo("PASSED");
    assertThat(second.posts()).isEqualTo(1);
    assertThat(second.forks()).isEqualTo(1);
    assertThat(client.sends(old.executionId)).isEqualTo(1);
    assertThat(client.sends(fresh.executionId)).isEqualTo(1);

    Map<String, Object> oldBefore = ledger(old);
    Map<String, Object> freshBefore = ledger(fresh);
    long oldRevision = snapshot(old).revision();
    long freshRevision = snapshot(fresh).revision();
    ObjectNode refusals = JSON.createObjectNode();
    for (Callback callback : staleCallbacks) {
      int own = replay(callback).statusCode();
      refusals.put("ownRun." + callback.route() + "#" + callback.ordinal(), own);
      assertThat(own)
          .as("a stale owner's " + callback.route() + " for its settled run: answered, not crashed")
          .isLessThan(500);
      int cross = replay(callback, fresh.executionId).statusCode();
      refusals.put("otherRun." + callback.route() + "#" + callback.ordinal(), cross);
      assertThat(cross)
          .as("a stale owner's " + callback.route() + " for another run")
          .isGreaterThanOrEqualTo(400);
    }
    assertThat(snapshot(old).status()).isEqualTo("ERROR");
    assertThat(snapshot(old).errorCode()).isEqualTo("STALE");
    assertThat(snapshot(fresh).status()).isEqualTo("PASSED");
    assertThat(ledger(old).get("attempt_id")).isEqualTo(oldBefore.get("attempt_id"));
    assertThat(ledger(fresh).get("attempt_id")).isEqualTo(freshBefore.get("attempt_id"));
    assertThat(ledger(old).get("state")).isEqualTo(oldBefore.get("state"));
    assertThat(ledger(old).get("last_runner_sequence"))
        .isEqualTo(oldBefore.get("last_runner_sequence"));
    assertThat(ledger(fresh).get("last_runner_sequence"))
        .isEqualTo(freshBefore.get("last_runner_sequence"));
    assertThat(snapshot(old).revision())
        .as("the settled old run, unchanged")
        .isEqualTo(oldRevision);
    assertThat(snapshot(fresh).revision())
        .as("the finished new run, unchanged")
        .isEqualTo(freshRevision);
    assertThat(ledger(fresh).get("runner_instance_id"))
        .as("the new run is owned by the new process")
        .isNotEqualTo(oldBefore.get("runner_instance_id"));

    ObjectNode extra = JSON.createObjectNode();
    extra.put("stepTimeoutSeconds", heldStepTimeoutSeconds());
    extra.put("firstGeneration", first.ordinal);
    extra.put("secondGeneration", second.ordinal);
    extra.put("secondGenerationPostsBeforeNewRun", 0);
    extra.set("staleCallbackStatuses", refusals);
    record(old, "restart", first, oldDone, extra);
    record(fresh, "restart", second, freshDone, null);
  }

  /**
   * Leg 6, late callbacks. After a run is terminal, every callback the runner sent for it is sent
   * again (admission, started, progress, final). None changes the execution, the ledger or the
   * snapshot revision, and nothing is dispatched again.
   */
  @Test
  @Order(7)
  void lateCallbacksAfterTheTerminalStateChangeNothing() throws Exception {
    repeat(this::lateCallbacksAfterTheTerminalStateChangeNothingOnce);
  }

  private void lateCallbacksAfterTheTerminalStateChangeNothingOnce() throws Exception {
    startRunner();
    Run run = newRun("lateCallback", "/start");
    assertThat(dispatcher.dispatch(run.executionId)).isTrue();
    ExecutionSnapshotDto done = awaitTerminal(run, Duration.ofSeconds(120));
    assertThat(done.status()).as(diagnose(run)).isEqualTo("PASSED");
    awaitUntil(
        () -> "DONE".equals(String.valueOf(ledger(run).get("state"))),
        Duration.ofSeconds(30),
        "the ledger to settle");

    Map<String, Object> before = ledger(run);
    long revision = snapshot(run).revision();
    ObjectNode statuses = JSON.createObjectNode();
    int replayed = 0;
    for (Callback callback : List.copyOf(CALLBACKS)) {
      if (!callback.execution().equals(run.executionId)) {
        continue;
      }
      int status = replay(callback).statusCode();
      statuses.put(callback.route() + "#" + callback.ordinal(), status);
      replayed++;
    }
    assertThat(replayed).as("the runner's own callbacks, sent again").isGreaterThanOrEqualTo(3);
    assertThat(snapshot(run).status()).isEqualTo("PASSED");
    assertThat(snapshot(run).revision()).as("snapshot revision").isEqualTo(revision);
    Map<String, Object> after = ledger(run);
    assertThat(after.get("state")).isEqualTo(before.get("state"));
    assertThat(after.get("attempt_id")).isEqualTo(before.get("attempt_id"));
    assertThat(after.get("last_runner_sequence")).isEqualTo(before.get("last_runner_sequence"));
    dispatcher.dispatchOnce();
    assertSingleDispatch(run, 1);
    ObjectNode extra = JSON.createObjectNode();
    extra.put("callbacksReplayed", replayed);
    extra.set("replayStatuses", statuses);
    record(run, "lateCallback", runner, done, extra);
  }

  /** Leg 7: after every fault above, a fresh runner and a fresh run still pass (WP12 leg 10). */
  @Test
  @Order(8)
  void aRunStillPassesAfterEveryFault() throws Exception {
    repeat(this::aRunStillPassesAfterEveryFaultOnce);
  }

  private void aRunStillPassesAfterEveryFaultOnce() throws Exception {
    startRunner();
    Run run = newRun("afterFaults", "/start");
    assertThat(dispatcher.dispatch(run.executionId)).isTrue();
    ExecutionSnapshotDto done = awaitTerminal(run, Duration.ofSeconds(120));
    assertThat(done.status()).as(diagnose(run)).isEqualTo("PASSED");
    assertSingleDispatch(run, 1);
    record(run, "afterFaults", runner, done, null);
  }

  /**
   * Leg 9, public HTTP cancel of a live guided browser in the middle of an action (the leg the
   * panel QA found untested). A session is started over the public route; the backend's own
   * coordinator drives it into the folded runner (the model is the scripted seam: the plan is the
   * navigation the authored step implies, and the navigation is the next action); the browser is
   * then stuck on a page that never answers. The owner cancels over the public route: the session
   * ends {@code CANCELLED}, the guided browser tree is gone, the one navigation was dispatched
   * once, and the runner's single guided slot is free again.
   */
  @Test
  @Order(9)
  void aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot() throws Exception {
    repeat(this::aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlotOnce);
  }

  private void aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlotOnce()
      throws Exception {
    org.junit.jupiter.api.Assumptions.assumeTrue(GUIDED, "CORUN_GUIDED=0");
    Generation generation = startRunner();
    UUID testId = guidedDraft("Open " + ORIGIN + "/hold");
    HttpResponse<String> started =
        publicJson(
            "/api/v1/studio/guided-sessions",
            UUID.randomUUID().toString(),
            guidedStart(testId).toString());
    assertThat(started.statusCode()).as("public guided start: " + started.body()).isEqualTo(202);
    String sessionId = guidedSessionId(mapper.readTree(started.body()));

    boolean mid = holdEntered.await(120, TimeUnit.SECONDS);
    assertThat(mid)
        .as("the guided browser is navigating mid-action; " + guidedDiagnose(sessionId, generation))
        .isTrue();
    List<ProcessFact> browsers = generation.harness.survivingGuidedBrowsers();
    assertThat(browsers).as("a live guided browser of this runner").isNotEmpty();
    String stateBefore = guidedState(sessionId);
    assertThat(stateBefore).isNotIn("CANCELLED", "FAILED", "EXPIRED", "SUCCEEDED");
    int dispatchesBefore = generation.guided("dispatch");

    long cancelled = System.nanoTime();
    HttpResponse<String> answer =
        publicJson(
            "/api/v1/studio/guided-sessions/" + sessionId + "/cancel",
            UUID.randomUUID().toString(),
            "{\"schemaVersion\":3,\"reason\":\"userRequested\"}");
    assertThat(answer.statusCode()).as("public guided cancel: " + answer.body()).isEqualTo(202);
    awaitUntil(
        () -> guidedState(sessionId).equals("CANCELLED"),
        Duration.ofSeconds(60),
        "the guided session to end CANCELLED; " + guidedDiagnose(sessionId, generation));
    awaitUntil(
        () -> generation.harness.survivingGuidedBrowsers().isEmpty(),
        Duration.ofSeconds(60),
        "the guided browser tree to be gone; " + guidedDiagnose(sessionId, generation));
    long tornDownMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - cancelled);

    assertThat(tornDownMillis)
        .as("a cancelled live guided browser is gone inside the backend's 15 s send deadline")
        .isLessThan(15_000L);
    assertThat(generation.guided("dispatch"))
        .as("the one navigation was dispatched to the runner exactly once")
        .isEqualTo(1);
    assertThat(dispatchesBefore).isEqualTo(1);
    assertThat(generation.guided("stop")).as("the runner was told to stop").isPositive();
    Integer actions =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_actions WHERE session_id = ?",
            Integer.class,
            sessionId);
    assertThat(actions).as("one action, never a repeat").isEqualTo(1);

    // The stale owner: everything the runner said to the backend about this session is said again,
    // by a client that presents the runner's certificate and the runner's own bearer, after the
    // session is over. Whatever the answers are, they change nothing.
    List<GuidedCallback> said = new ArrayList<>();
    for (GuidedCallback callback : GUIDED_CALLBACKS) {
      if (callback.session().equals(sessionId)) {
        said.add(callback);
      }
    }
    assertThat(said).as("the runner's own guided callbacks for the session").isNotEmpty();
    awaitGuidedQuiet(sessionId);
    Integer fenceBefore = guidedFence(sessionId);
    String documentBefore = guidedDocumentHash(sessionId);
    JsonNode documentTreeBefore = guidedColumn(sessionId, "document");
    JsonNode progressTreeBefore = guidedColumn(sessionId, "progress");
    ObjectNode staleStatuses = JSON.createObjectNode();
    int staleReplays = 0;
    int staleAccepted = 0;
    for (GuidedCallback callback : said) {
      int status = replayGuided(callback).statusCode();
      staleStatuses.put(callback.route() + "#" + staleReplays, status);
      staleReplays++;
      if (status >= 200 && status < 300) {
        staleAccepted++;
      }
      assertThat(status).as("a replayed guided " + callback.route() + ": answered").isLessThan(500);
    }
    assertThat(guidedState(sessionId)).as("the replays changed nothing").isEqualTo("CANCELLED");
    assertThat(guidedFence(sessionId)).isEqualTo(fenceBefore);
    if (!guidedDocumentHash(sessionId).equals(documentBefore)) {
      throw new AssertionError(
          "the session document or progress changed under the replays: document fields "
              + changedFields(documentTreeBefore, guidedColumn(sessionId, "document"))
              + ", progress fields "
              + changedFields(progressTreeBefore, guidedColumn(sessionId, "progress")));
    }
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_actions WHERE session_id = ?",
                Integer.class,
                sessionId))
        .isEqualTo(1);
    assertThat(generation.guided("dispatch")).as("and nothing was dispatched").isEqualTo(1);

    ObjectNode node = (ObjectNode) EVIDENCE.with("legs").with("guidedPublicCancel");
    ObjectNode facts = node.withArray("runs").addObject();
    facts.put("sessionDocumentUnchangedByReplays", true);
    facts.put("staleOwnerReplays", staleReplays);
    facts.put("staleOwnerReplaysAnswered2xx", staleAccepted);
    facts.set("staleOwnerReplayStatuses", staleStatuses);
    facts.put("sessionState", guidedState(sessionId));
    facts.put("stateBeforeCancel", stateBefore);
    facts.put("cancelToBrowserTreeGoneMs", tornDownMillis);
    facts.put("guidedBrowsersBeforeCancel", browsers.size());
    facts.put("guidedBrowsersAfter", generation.harness.survivingGuidedBrowsers().size());
    facts.put("runnerDispatchRoutes", generation.guided("dispatch"));
    facts.put("runnerStopRoutes", generation.guided("stop"));
    facts.put("runnerContextRoutes", generation.guided("context"));
    facts.put("runnerAssignRoutes", generation.guided("assign"));
    facts.put("actionRows", actions);
    facts.put("sourcePlanModelCalls", GATEWAY.sourcePlans.get());
    facts.put("nextActionModelCalls", GATEWAY.nextActions.get());
    facts.put("runnerGeneration", generation.ordinal);
    facts.put("distDigest", generation.harness.distDigest());
    facts.put("hostLoadAtRecord", load());
  }

  /**
   * Leg 10, a forced worker kill with a live guided browser (AC-11 k, the listing proof Aria's A13
   * leaves to the co-run). SIGKILL of the folded runner while the guided browser is navigating. The
   * listing of the runner's browser processes is taken before and after; the in-flight action is
   * the one the backend can no longer account for, so the session may only end where an unknown
   * outcome ends; a new runner process on the same address is handed no action.
   */
  @Test
  @Order(10)
  void aGuidedWorkerKillMidActionLeavesNoBrowserAndNeverASecondDispatch() throws Exception {
    repeat(this::aGuidedWorkerKillMidActionLeavesNoBrowserAndNeverASecondDispatchOnce);
  }

  private void aGuidedWorkerKillMidActionLeavesNoBrowserAndNeverASecondDispatchOnce()
      throws Exception {
    org.junit.jupiter.api.Assumptions.assumeTrue(GUIDED, "CORUN_GUIDED=0");
    Generation generation = startRunner();
    UUID testId = guidedDraft("Open " + ORIGIN + "/hold");
    HttpResponse<String> started =
        publicJson(
            "/api/v1/studio/guided-sessions",
            UUID.randomUUID().toString(),
            guidedStart(testId).toString());
    assertThat(started.statusCode()).as("public guided start: " + started.body()).isEqualTo(202);
    String sessionId = guidedSessionId(mapper.readTree(started.body()));
    assertThat(holdEntered.await(120, TimeUnit.SECONDS))
        .as("the guided browser is navigating mid-action; " + guidedDiagnose(sessionId, generation))
        .isTrue();
    List<ProcessFact> tree = generation.harness.captureTree();
    List<ProcessFact> browsers = generation.harness.survivingGuidedBrowsers();
    assertThat(browsers).as("a live guided browser of this runner").isNotEmpty();
    assertThat(generation.guided("dispatch")).isEqualTo(1);

    generation.killed = true;
    generation.harness.kill9();
    long killed = System.nanoTime();
    ArrayNode vanished = JSON.createArrayNode();
    java.util.Set<Long> gone = new java.util.HashSet<>();
    long deadline = System.nanoTime() + ORPHAN_WINDOW.toNanos();
    while (System.nanoTime() < deadline) {
      List<ProcessFact> alive = generation.harness.survivorsOf(tree);
      List<ProcessFact> aliveBrowsers = generation.harness.survivingGuidedBrowsers();
      for (ProcessFact fact : tree) {
        if (!gone.contains(fact.pid()) && !alive.contains(fact)) {
          gone.add(fact.pid());
          vanished
              .addObject()
              .put("process", Path.of(fact.command()).getFileName().toString())
              .put("afterKillMs", TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - killed));
        }
      }
      if (alive.isEmpty() && aliveBrowsers.isEmpty()) {
        break;
      }
      pause(250);
    }
    long listedGoneMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - killed);
    List<ProcessFact> survivorsAfterWindow = generation.harness.survivorsOf(tree);
    List<ProcessFact> guidedAfterWindow = generation.harness.survivingGuidedBrowsers();

    // The in-flight action can no longer be accounted for: where does the session end, and when?
    Set<String> terminal =
        Set.of(
            "SUCCEEDED",
            "PUBLICATION_CONFLICT",
            "FAILED",
            "UNKNOWN_OUTCOME",
            "CANCELLED",
            "EXPIRED");
    long settleDeadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
    while (System.nanoTime() < settleDeadline && !terminal.contains(guidedState(sessionId))) {
      pause(500);
    }
    String settledState = guidedState(sessionId);
    long settledMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - killed);

    stop(generation);
    runner = null;
    Generation second = startRunner();
    for (int pass = 0; pass < 10; pass++) {
      pause(500);
    }
    assertThat(listedGoneMillis)
        .as("the guided browser tree leaves inside the backend's 15 s send deadline of the kill")
        .isLessThan(15_000L);
    assertThat(second.guided("dispatch"))
        .as("the new runner process is handed no action of the killed one")
        .isZero();
    Integer actions =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_guided_actions WHERE session_id = ?",
            Integer.class,
            sessionId);
    assertThat(actions).as("one action, never a repeat").isEqualTo(1);

    ObjectNode node = (ObjectNode) EVIDENCE.with("legs").with("guidedWorkerKill");
    ObjectNode facts = node.withArray("runs").addObject();
    facts.put("processesBeforeKill", tree.size());
    facts.put("guidedBrowsersBeforeKill", browsers.size());
    facts.put("orphanWindowMs", ORPHAN_WINDOW.toMillis());
    facts.put("allListedProcessesGoneAfterMs", listedGoneMillis);
    facts.put("survivorsAfterWindow", survivorsAfterWindow.size());
    facts.put("guidedBrowsersAfterWindow", guidedAfterWindow.size());
    facts.set("processesVanished", vanished);
    facts.put("sessionStateAfterKill", settledState);
    facts.put("sessionSettledAfterMs", settledMillis);
    facts.put("sessionTerminalWithin60s", terminal.contains(settledState));
    facts.put("runnerDispatchRoutes", generation.guided("dispatch"));
    facts.put("newRunnerDispatchRoutes", second.guided("dispatch"));
    facts.put("newRunnerAssignRoutes", second.guided("assign"));
    facts.put("actionRows", actions);
    facts.put("runnerGeneration", generation.ordinal);
    facts.put("newRunnerGeneration", second.ordinal);
    facts.put("distDigest", generation.harness.distDigest());
    facts.put("hostLoadAtRecord", load());
    assertThat(survivorsAfterWindow).as("the killed runner's processes").isEmpty();
    assertThat(guidedAfterWindow).as("its guided browsers").isEmpty();
  }

  private JsonNode guidedColumn(String sessionId, String column) {
    return C.parse(
        jdbc.queryForObject(
            "SELECT " + column + "::text FROM studio_guided_sessions WHERE session_id = ?",
            String.class,
            sessionId));
  }

  /** The names (never the values) of the top-level fields that differ. */
  private static List<String> changedFields(JsonNode before, JsonNode after) {
    java.util.Set<String> names = new java.util.TreeSet<>();
    before.fieldNames().forEachRemaining(names::add);
    after.fieldNames().forEachRemaining(names::add);
    List<String> changed = new ArrayList<>();
    for (String name : names) {
      if (!before.path(name).equals(after.path(name))) {
        changed.add(name);
      }
    }
    return changed;
  }

  /**
   * After a cancel the backend confirms the teardown and the reaper may touch the row on their own
   * threads; the baseline is taken once the row has been the same for three looks in a row and the
   * teardown is confirmed.
   */
  private void awaitGuidedQuiet(String sessionId) {
    long end = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    String last = null;
    int same = 0;
    while (System.nanoTime() < end) {
      String now = guidedDocumentHash(sessionId);
      same = now.equals(last) ? same + 1 : 0;
      last = now;
      boolean confirmed =
          "CONFIRMED".equals(guidedColumn(sessionId, "progress").path("teardownStatus").asText(""));
      if (same >= 3 && confirmed) {
        return;
      }
      pause(300);
    }
  }

  private String guidedDocumentHash(String sessionId) {
    return jdbc.queryForObject(
        "SELECT md5(document::text || progress::text) FROM studio_guided_sessions"
            + " WHERE session_id = ?",
        String.class,
        sessionId);
  }

  /**
   * Leg 11, a secret on the live stack (the D3 canary baton). A secret is saved through the public
   * route (into the Vault double), a published plan declares it, and the real dispatcher resolves
   * it into the real runner's job body; the real browser types it into a password field of the
   * loopback page, which reports what it received. Afterwards every column of every public table is
   * scanned for fifteen forms of the value (D3's scanner), and so are the runner's log, its
   * callbacks as the backend received them, and every file the runner stored.
   */
  @Test
  @Order(11)
  void aSecretReachesTheRealRunnerAndLeavesNoCanaryAnywhere() throws Exception {
    repeat(this::aSecretReachesTheRealRunnerAndLeavesNoCanaryAnywhereOnce);
  }

  private void aSecretReachesTheRealRunnerAndLeavesNoCanaryAnywhereOnce() throws Exception {
    VAULT.clear();
    RECEIPT.set(null);
    Generation generation = startRunner();
    String step = "Open " + ORIGIN + "/login";
    UUID testId =
        new StudioExecutionFixtures(jdbc).seedTest("Co-run secret", CSI_ID, OWNER, List.of(step));
    publisher.publish(testId, List.of(SECRET_NAME));
    String secretBody =
        JSON.writeValueAsString(
            Map.of("name", SECRET_NAME, "value", CANARY, "allowedOrigins", List.of(ORIGIN)));
    HttpResponse<String> saved =
        publicJsonBody("/api/v1/studio/tests/" + testId + "/secrets", null, secretBody);
    assertThat(saved.statusCode()).as("the public secret save").isEqualTo(201);
    HttpResponse<String> accepted =
        publicPost("/api/v1/studio/tests/" + testId + "/execute", UUID.randomUUID().toString());
    assertThat(accepted.statusCode()).as("the public Run: " + accepted.body()).isEqualTo(202);
    Run run =
        new Run(
            "secretCanary",
            testId,
            UUID.fromString(mapper.readTree(accepted.body()).path("executionId").asText()),
            step);

    assertThat(dispatcher.dispatch(run.executionId)).isTrue();
    ExecutionSnapshotDto done = awaitTerminal(run, Duration.ofSeconds(120));

    String typed = RECEIPT.get();
    ObjectNode extra = JSON.createObjectNode();
    extra.put("runStatus", done.status());
    extra.put("canaryTypedByTheRealBrowser", CANARY.equals(typed));
    assertThat(done.status()).as(diagnose(run)).isEqualTo("PASSED");
    assertThat(CANARY.equals(typed))
        .as("the real browser put the value into the page's password field")
        .isTrue();
    assertSingleDispatch(run, 1);

    Object coverage = canary("coverage", jdbc);
    @SuppressWarnings("unchecked")
    Set<String> tables = (Set<String>) coverage.getClass().getMethod("tables").invoke(coverage);
    int columns = (int) coverage.getClass().getMethod("columns").invoke(coverage);
    assertThat(tables)
        .contains("ui_test_executions", "studio_dispatch_ledger", "studio_secret_use_audit");
    assertThat(tables.size()).isGreaterThan(30);
    assertThat(columns).isGreaterThan(200);
    @SuppressWarnings("unchecked")
    List<String> hits = (List<String>) canary("hits", jdbc, CANARY);
    @SuppressWarnings("unchecked")
    Map<String, String> forms = (Map<String, String>) canary("forms", CANARY);
    extra.put("databaseTables", tables.size());
    extra.put("databaseColumns", columns);
    extra.put("canaryForms", forms.size());
    extra.put("databaseHits", hits.size());
    assertThat(hits).as("columns holding any form of the canary").isEmpty();

    // The text surfaces the runner and the callbacks leave: its log, every report as received, its
    // measurement file and every file it stored (recording, manifest).
    List<String> surfaces = new ArrayList<>();
    surfaces.add(Files.readString(generation.harness.logFile(), StandardCharsets.ISO_8859_1));
    surfaces.add(Files.readString(generation.counters, StandardCharsets.ISO_8859_1));
    for (Callback callback : CALLBACKS) {
      surfaces.add(new String(callback.body(), StandardCharsets.ISO_8859_1));
    }
    long storedBytes = 0;
    int storedFiles = 0;
    try (java.util.stream.Stream<Path> walk = Files.walk(OBJECTS)) {
      for (Path file : walk.filter(Files::isRegularFile).toList()) {
        byte[] bytes = Files.readAllBytes(file);
        storedBytes += bytes.length;
        storedFiles++;
        surfaces.add(new String(bytes, StandardCharsets.ISO_8859_1));
      }
    }
    int surfaceHits = 0;
    for (String surface : surfaces) {
      for (String form : forms.values()) {
        if (surface.contains(
                new String(form.getBytes(StandardCharsets.UTF_8), StandardCharsets.ISO_8859_1))
            || surface.contains(form)) {
          surfaceHits++;
        }
      }
    }
    extra.put("surfacesScanned", surfaces.size());
    extra.put("storedFilesScanned", storedFiles);
    extra.put("storedBytesScanned", storedBytes);
    extra.put("surfaceHits", surfaceHits);
    record(run, "secretCanary", generation, done, extra);
    assertThat(surfaceHits).as("the runner's log, reports and stored files").isZero();
  }

  /** D3's scanner, called by name: its enclosing test class is package-private. */
  private static Object canary(String method, Object... arguments) throws Exception {
    Class<?> scan =
        Class.forName("com.citi.put.checks.studio.secrets.DatabaseCanaryScanIT$CanaryScan");
    Class<?>[] types = new Class<?>[arguments.length];
    for (int at = 0; at < arguments.length; at++) {
      types[at] =
          arguments[at] instanceof JdbcTemplate ? JdbcTemplate.class : arguments[at].getClass();
    }
    return scan.getMethod(method, types).invoke(null, arguments);
  }

  private HttpResponse<String> publicJsonBody(String path, String idempotencyKey, String body)
      throws Exception {
    HttpHeaders identity =
        ObservedPublicationFixture.withSession(
            VideoEvidenceFixtures.identity(OWNER, "", CSI_ID + ":owner"));
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create("https://localhost:" + backendPort + path))
            .timeout(Duration.ofSeconds(30))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body));
    identity.forEach((name, values) -> values.forEach(value -> request.header(name, value)));
    if (idempotencyKey != null) {
      request.header("Idempotency-Key", idempotencyKey);
    }
    return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  private Integer guidedFence(String sessionId) {
    return jdbc.queryForObject(
        "SELECT (document->'owner'->>'fence')::int FROM studio_guided_sessions WHERE session_id = ?",
        Integer.class,
        sessionId);
  }

  private HttpResponse<String> replayGuided(GuidedCallback callback) throws Exception {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(
                URI.create(
                    "https://localhost:"
                        + backendPort
                        + "/internal/v2/studio/guided-sessions/"
                        + callback.session()
                        + "/"
                        + callback.route()))
            .timeout(Duration.ofSeconds(30))
            .header("X-Corun-Replay", "1")
            .POST(HttpRequest.BodyPublishers.ofByteArray(callback.body()));
    if (callback.authorization() != null) {
      request.header("Authorization", callback.authorization());
    }
    if (callback.fence() != null) {
      request.header("X-Owner-Fence", callback.fence());
    }
    if (callback.idempotencyKey() != null) {
      request.header("Idempotency-Key", callback.idempotencyKey());
    }
    if (callback.contentType() != null) {
      request.header("Content-Type", callback.contentType());
    }
    return runnerSide.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  private UUID guidedDraft(String step) throws Exception {
    UUID testId = UUID.randomUUID();
    var authoring =
        new AuthoringV2Request(2, null, List.of(new AuthoringStep(UUID.randomUUID(), step, null)));
    jdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by,"
            + "authoring,authoring_revision_inputs) VALUES (?,'Co-run guided',?,?,'chromium',"
            + "'[\"Open\"]','[]',?,?::jsonb,?::jsonb)",
        testId,
        CSI_ID,
        ENVIRONMENT,
        OWNER,
        JSON.writeValueAsString(authoring),
        JSON.writeValueAsString(
            com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity.create(
                authoring, Map.of())));
    return testId;
  }

  private static ObjectNode guidedStart(UUID testId) {
    ObjectNode request =
        C.object()
            .put("schemaVersion", 3)
            .put("testId", testId.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", ENVIRONMENT);
    request.putObject("versions").put("contract", 3);
    return request;
  }

  private static String guidedSessionId(JsonNode started) {
    JsonNode session = started.path("session");
    String id = session.path("sessionId").asText(started.path("sessionId").asText(""));
    assertThat(id).as("the session id in the start answer").isNotBlank();
    return id;
  }

  private String guidedState(String sessionId) {
    return jdbc.queryForObject(
        "SELECT state FROM studio_guided_sessions WHERE session_id = ?", String.class, sessionId);
  }

  private String guidedDiagnose(String sessionId, Generation generation) {
    StringBuilder text = new StringBuilder("session state=");
    try {
      text.append(guidedState(sessionId));
    } catch (RuntimeException unknown) {
      text.append("(none)");
    }
    text.append(" model(plan=")
        .append(GATEWAY.sourcePlans.get())
        .append(", next=")
        .append(GATEWAY.nextActions.get())
        .append(", other=")
        .append(GATEWAY.others.get())
        .append(") runner counts=")
        .append(generation.counts());
    try {
      String log = Files.readString(generation.harness.logFile());
      text.append("\nrunner log tail:\n").append(log.substring(Math.max(0, log.length() - 3000)));
    } catch (IOException | RuntimeException unreadable) {
      text.append("\n(runner log unreadable)");
    }
    return text.toString();
  }

  private HttpResponse<String> publicJson(String path, String idempotencyKey, String body)
      throws Exception {
    HttpHeaders identity =
        ObservedPublicationFixture.withSession(
            VideoEvidenceFixtures.identity(OWNER, "", CSI_ID + ":owner"));
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create("https://localhost:" + backendPort + path))
            .timeout(Duration.ofSeconds(30))
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", idempotencyKey)
            .POST(HttpRequest.BodyPublishers.ofString(body));
    identity.forEach((name, values) -> values.forEach(value -> request.header(name, value)));
    return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  private void awaitRunning(Run run) {
    awaitUntil(
        () -> "RUNNING".equals(String.valueOf(ledger(run).get("state"))),
        Duration.ofSeconds(90),
        "execution " + run.executionId + " to report its browser start");
  }

  private HttpResponse<String> replay(Callback callback) throws Exception {
    return replay(callback, callback.execution());
  }

  /** The recorded request, byte for byte, to this execution's path (or another's). */
  private HttpResponse<String> replay(Callback callback, UUID execution) throws Exception {
    String path = "/internal/studio/executions/" + execution + "/" + callback.route();
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create("https://localhost:" + backendPort + path))
            .timeout(Duration.ofSeconds(30))
            .POST(HttpRequest.BodyPublishers.ofByteArray(callback.body()));
    if (callback.authorization() != null) {
      request.header("Authorization", callback.authorization());
    }
    if (callback.contentType() != null) {
      request.header("Content-Type", callback.contentType());
    }
    // The recorder does not record the test's own replays as the runner's callbacks.
    request.header("X-Corun-Replay", "1");
    return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Fixtures: drafts, publication, public routes
  // ═════════════════════════════════════════════════════════════════════════

  /** One accepted execution under test. */
  private final class Run {
    final String leg;
    final UUID testId;
    final UUID executionId;
    final String firstStep;

    Run(String leg, UUID testId, UUID executionId, String firstStep) {
      this.leg = leg;
      this.testId = testId;
      this.executionId = executionId;
      this.firstStep = firstStep;
    }
  }

  private Run newRun(String leg, String path) throws Exception {
    return newRun(leg, path, 30);
  }

  private Run newRun(String leg, String path, int stepTimeoutSeconds) throws Exception {
    String step = "Open " + ORIGIN + path;
    UUID testId =
        new StudioExecutionFixtures(jdbc).seedTest("Co-run " + leg, CSI_ID, OWNER, List.of(step));
    jdbc.update("UPDATE ui_tests SET timeout_seconds = ? WHERE id = ?", stepTimeoutSeconds, testId);
    publisher.publish(testId);
    String key = UUID.randomUUID().toString();
    HttpResponse<String> accepted = publicPost("/api/v1/studio/tests/" + testId + "/execute", key);
    assertThat(accepted.statusCode()).as("the public Run: " + accepted.body()).isEqualTo(202);
    UUID executionId =
        UUID.fromString(mapper.readTree(accepted.body()).path("executionId").asText());
    return new Run(leg, testId, executionId, step);
  }

  private HttpResponse<String> publicPost(String path, String idempotencyKey) throws Exception {
    HttpHeaders identity =
        ObservedPublicationFixture.withSession(
            VideoEvidenceFixtures.identity(OWNER, "", CSI_ID + ":owner"));
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create("https://localhost:" + backendPort + path))
            .timeout(Duration.ofSeconds(30))
            .POST(HttpRequest.BodyPublishers.noBody());
    identity.forEach((name, values) -> values.forEach(value -> request.header(name, value)));
    if (idempotencyKey != null) {
      request.header("Idempotency-Key", idempotencyKey);
    }
    return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  private ExecutionSnapshotDto snapshot(Run run) {
    return studioService.findExecutionById(run.executionId, owner);
  }

  private ExecutionSnapshotDto awaitTerminal(Run run, Duration timeout) {
    awaitUntil(
        () -> {
          String status = snapshot(run).status();
          return status.equals("PASSED") || status.equals("FAILED") || status.equals("ERROR");
        },
        timeout,
        "execution " + run.executionId + " to settle");
    return snapshot(run);
  }

  /** As {@link #awaitTerminal}, running one dispatcher pass a second (the cancel relay's pass). */
  private ExecutionSnapshotDto awaitTerminalPumping(Run run, Duration timeout) {
    long[] last = {0};
    awaitUntil(
        () -> {
          if (System.nanoTime() - last[0] > TimeUnit.SECONDS.toNanos(1)) {
            last[0] = System.nanoTime();
            dispatcher.dispatchOnce();
          }
          String status = snapshot(run).status();
          return status.equals("PASSED") || status.equals("FAILED") || status.equals("ERROR");
        },
        timeout,
        "execution " + run.executionId + " to settle");
    return snapshot(run);
  }

  private void awaitUntil(BooleanSupplier condition, Duration timeout, String what) {
    long deadline = System.nanoTime() + timeout.toNanos();
    while (System.nanoTime() < deadline) {
      if (condition.getAsBoolean()) {
        return;
      }
      pause(100);
    }
    throw new AssertionError("timed out after " + timeout + " waiting for " + what);
  }

  private static void pause(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(interrupted);
    }
  }

  private Map<String, Object> ledger(Run run) {
    return statements.find(run.executionId).orElseThrow();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // The runner process
  // ═════════════════════════════════════════════════════════════════════════

  private Generation startRunner() throws Exception {
    return startRunner(1);
  }

  private Generation startRunner(int poolSize) throws Exception {
    int ordinal = GENERATIONS.incrementAndGet();
    Path work = Files.createTempDirectory(TEMP, "runner-" + ordinal + "-");
    Path counters = work.resolve("counters.json");
    var spawn =
        RunnerProcessHarness.builder(TLS)
            .port(RUNNER_PORT)
            .workDirectory(work)
            .serviceIdentity(SERVICE)
            .callbackIdentity(CALLBACK)
            .callbackBaseUrl("https://127.0.0.1:" + backendPort)
            .env(RunnerProcessHarness.KEY_OBJECT_STORE_DIR, OBJECTS.toString())
            .env("STUDIO_RUNNER_INSTANCE_ID", RUNNER_INSTANCE_PREFIX + "-" + ordinal)
            .env("STUDIO_RUNNER_POOL_SIZE", Integer.toString(poolSize))
            .env("STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED", "true")
            .env("STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED", "true")
            .env("STUDIO_RUNNER_OBSERVED_CATALOG_FILE", CATALOG_FILE.toString())
            .env("STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST", BUILD_DIGEST)
            .env("NODE_EXTRA_CA_CERTS", TLS.caCertificate().toAbsolutePath().toString())
            .preload(measurementPrelude(counters));
    if (GUIDED) {
      spawn.guided(
          new RunnerProcessHarness.Guided(
              WORKER_ID,
              Files.createDirectories(work.resolve("journal")),
              "fixture-issuer",
              "controller-1",
              TEMP.resolve("issuer.pub"),
              "https://localhost:" + backendPort,
              TEMP.resolve("worker.jwt")));
    }
    RunnerProcessHarness harness = spawn.start();
    runner = new Generation(harness, counters, ordinal);
    try {
      harness.awaitReady(Duration.ofSeconds(60));
    } catch (RuntimeException notReady) {
      stop(runner);
      runner = null;
      throw notReady;
    }
    assertThat(harness.distDigest()).as("the dist this run spawned").isEqualTo(DIST_DIGEST);
    return runner;
  }

  /**
   * Counts what reaches the runner, value-free: admissions ({@code POST /v2/runs}), cancel relays
   * per execution id, and replay children ({@code fork}). No body, header or token is read.
   */
  private static String measurementPrelude(Path counters) throws IOException {
    String file = JSON.writeValueAsString(counters.toString());
    return "import fs from 'node:fs';import https from 'node:https';"
        + "import cp from 'node:child_process';"
        + "import {syncBuiltinESMExports} from 'node:module';"
        + "const file="
        + file
        + ";const state={posts:0,forks:0,probes:0,other:0,deletes:{},guided:{}};"
        + "const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});"
        + "fs.renameSync(file+'.tmp',file);};save();"
        + "const create=https.createServer;"
        + "https.createServer=function(...args){const server=Reflect.apply(create,this,args);"
        + "server.prependListener('request',req=>{"
        + "const url=(req.url||'').split('?')[0];"
        + "if(url.startsWith('/internal/v2/studio/guided-sessions/')){"
        + "const route=url.split('/').at(-1);state.guided[route]=(state.guided[route]||0)+1;}"
        + "else if(req.method==='POST'&&url==='/v2/runs'){state.posts++;}"
        + "else if(req.method==='DELETE'&&url.startsWith('/v2/runs/')){"
        + "const id=url.slice(9);state.deletes[id]=(state.deletes[id]||0)+1;}"
        + "else if(req.method==='GET'&&(url==='/ready'||url==='/health')){state.probes++;}"
        + "else{state.other++;}save();});return server;};"
        + "const fork=cp.fork;cp.fork=function(...args){state.forks++;save();"
        + "return Reflect.apply(fork,this,args);};syncBuiltinESMExports();";
  }

  private void stop(Generation generation) {
    holdRelease.countDown();
    generation.report = generation.harness.teardown();
    finished.add(generation);
    keepLog(generation);
    classifyLaunchLog(generation);
    assertThat(generation.report.survivors())
        .as("no process of runner generation " + generation.ordinal + " survives its teardown")
        .isEmpty();
    if (!generation.killed) {
      generation.report.assertCleanExit();
    }
  }

  /** Keeps the runner's own (redacted) log beside the raw measurements, for the receipt. */
  private static void keepLog(Generation generation) {
    try {
      Path logs = Files.createDirectories(Path.of("build", "corun", "logs"));
      Files.copy(
          generation.harness.logFile(),
          logs.resolve("runner-generation-" + generation.ordinal + ".log"),
          java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException unreadable) {
      // The measurements stand without it; the missing copy is visible in the receipt.
    }
  }

  private static double load() {
    return ManagementFactory.getOperatingSystemMXBean().getSystemLoadAverage();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Measurements and assertions shared by the legs
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * The one place "zero repeated dispatches" is decided for a run: the dispatcher sent once, the
   * runner admitted once (plus the injected duplicates, if any) and forked at most the expected
   * number of children, and the ledger still holds the attempt it first issued.
   */
  private void assertSingleDispatch(Run run, int expectedForks) {
    assertThat(client.sends(run.executionId))
        .as("dispatcher sends for " + run.leg + ": " + client.outcomes(run.executionId))
        .isEqualTo(1);
    assertThat(runner.forks()).as("replay children forked by the runner").isEqualTo(expectedForks);
    assertThat(runner.posts())
        .as("POST /v2/runs that reached the runner")
        .isEqualTo(1 + client.injected(run.executionId));
  }

  private String diagnose(Run run) {
    StringBuilder text = new StringBuilder("execution ").append(run.executionId);
    text.append(" status=").append(snapshot(run).status());
    text.append(" error=").append(snapshot(run).errorCode());
    text.append(" ledger=").append(ledger(run).get("state"));
    text.append(" outcomes=").append(client.outcomes(run.executionId));
    try {
      String log = Files.readString(runner.harness.logFile());
      text.append("\nrunner log tail:\n").append(log.substring(Math.max(0, log.length() - 3000)));
    } catch (IOException | RuntimeException unreadable) {
      text.append("\n(runner log unreadable)");
    }
    return text.toString();
  }

  /** Writes one run's facts into the raw evidence (counts and closed codes only). */
  private void record(
      Run run, String leg, Generation owner, ExecutionSnapshotDto end, ObjectNode extra) {
    ObjectNode legNode = (ObjectNode) EVIDENCE.with("legs").with(leg);
    ArrayNode runs = legNode.withArray("runs");
    ObjectNode facts = runs.addObject();
    facts.put("executionId", run.executionId.toString());
    facts.put("status", end.status());
    facts.put("errorCode", end.errorCode());
    facts.put("dispatcherSends", client.sends(run.executionId));
    facts.put("injectedDuplicates", client.injected(run.executionId));
    facts.put("cancelRelays", client.cancels(run.executionId));
    facts.put("runnerGeneration", owner.ordinal);
    facts.put("runnerPosts", owner.posts());
    facts.put("runnerForks", owner.forks());
    facts.put("runnerDeleteRelays", owner.deletes(run.executionId));
    facts.put("distDigest", owner.harness.distDigest());
    Map<String, Object> row = ledger(run);
    facts.put("ledgerState", String.valueOf(row.get("state")));
    facts.put("attemptIssued", row.get("attempt_id") != null);
    facts.put("admitted", row.get("admission_id") != null);
    facts.put("hostLoadAtRecord", load());
    ArrayNode callbacks = facts.putArray("runnerCallbacks");
    for (Callback callback : CALLBACKS) {
      if (callback.execution().equals(run.executionId)) {
        callbacks.addObject().put("route", callback.route()).put("status", callback.status());
      }
    }
    if (extra != null) {
      facts.set("leg", extra);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // RUNNER-LAUNCH attribution: the REL-001 pointer and the D4 15 s edge
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Reads the runner's log for every {@code GUIDED_START_FAILED} line and classifies it by the
   * story's rules (AC-11 REL-001 pointer, AC-12 15 s edge). A run with no such line is recorded
   * with count 0: absence is reported, never read as a root cause.
   */
  private void classifyLaunchLog(Generation generation) {
    ObjectNode node = JSON.createObjectNode();
    node.put("runnerGeneration", generation.ordinal);
    node.put("loadAtStart", generation.loadAtStart);
    node.put("loadAtEnd", load());
    node.put("distDigest", generation.harness.distDigest());
    node.put("guidedEnabled", GUIDED);
    boolean stopReached = generation.counts().path("guided").path("stop").asInt() > 0;
    node.put("stopRoutesReceived", generation.counts().path("guided").path("stop").asInt());
    ArrayNode lines = node.putArray("guidedStartFailedLines");
    try {
      for (String line : Files.readAllLines(generation.harness.logFile())) {
        Matcher match = START_FAILED.matcher(line);
        if (match.find()) {
          lines.add(classify(JSON.readTree(match.group(1)), stopReached));
        }
      }
    } catch (IOException unreadable) {
      node.put("logUnreadable", true);
    }
    node.put("startFailedCount", lines.size());
    EVIDENCE.withArray("launchAttribution").add(node);
  }

  /**
   * One line, by the rules: an innermost {@code code TIMEOUT} is D4 (at 15 000 ms or more it is the
   * 15 s edge candidate, to be paired with a bootstrap {@code UNKNOWN_OUTCOME}); an innermost
   * {@code code CANCELLED} is exempt only with evidence that a stop reached the runner first;
   * anything else, including a link with {@code kind TIMEOUT}, is a REL-001 recurrence.
   */
  static ObjectNode classify(JsonNode line, boolean stopReachedRunner) {
    ObjectNode out = JSON.createObjectNode();
    JsonNode links = line.path("links");
    JsonNode innermost = links.isEmpty() ? JSON.createObjectNode() : links.get(links.size() - 1);
    long elapsed = line.path("elapsedMs").asLong();
    String code = innermost.path("code").asText("");
    String kind = innermost.path("kind").asText("");
    String verdict;
    if (code.equals("TIMEOUT") && kind.isEmpty()) {
      verdict = elapsed >= 15_000 ? "D4_15S_EDGE_CANDIDATE" : "D4_DEADLINE";
    } else if (code.equals("CANCELLED")) {
      verdict = stopReachedRunner ? "CANCELLED_EXEMPT" : "REL001_RECURRENCE";
    } else {
      verdict = "REL001_RECURRENCE";
    }
    out.put("classification", verdict);
    out.put("operation", line.path("operation").asText());
    out.put("session", line.path("session").asText());
    out.put("elapsedMs", elapsed);
    ArrayNode chain = out.putArray("links");
    for (JsonNode link : links) {
      ObjectNode item = chain.addObject();
      for (String field : List.of("name", "code", "errno", "phase", "loss", "kind")) {
        if (link.has(field)) {
          item.put(field, link.path(field).asText());
        }
      }
    }
    return out;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Publication: the production writers, with a reachable origin and the real build
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Seeds a published observed revision for a draft through the production writers. This is {@link
   * ObservedPublicationFixture#publish} adapted in one respect: the fixture's origin and build
   * identity are constants for a synthetic page, and a real runner refuses them, so the origin here
   * is the loopback target and the catalog is the real runner's own.
   */
  private static final class Publisher {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final GuidedSessionRepository sessions;
    private final GuidedPublicationBaseRepository bases;
    private final GuidedPublicationRepository publications;
    private final ObservedReplayPins pins;

    Publisher(JdbcTemplate jdbc) {
      this.jdbc = jdbc;
      this.tx = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
      this.sessions = new GuidedSessionRepository(jdbc, tx, C);
      this.bases = new GuidedPublicationBaseRepository(jdbc, C);
      this.publications = new GuidedPublicationRepository(jdbc, C);
      this.pins =
          new ObservedReplayPins(
              C,
              new ObservedReplayProperties(
                  true, 30000, 1048576, 4194304, 2097152, CATALOG_JSON, 1280, 720));
    }

    UUID publish(UUID testId) {
      return publish(testId, List.of());
    }

    UUID publish(UUID testId, List<String> secrets) {
      new ObservedPublicationFixture(jdbc).seedCanonicalAuthoring(testId);
      prepareDeclaredSource(testId, secrets);
      JsonNode current = tx.execute(status -> bases.lockCurrent(testId).document());
      String csiId = current.path("csiId").asText();
      String environment = current.path("configuration").path("environment").asText();
      String principal =
          jdbc.queryForObject("SELECT created_by FROM ui_tests WHERE id = ?", String.class, testId);
      String sessionId = "corun-" + UUID.randomUUID();
      Instant now = Instant.now();

      List<JsonNode> steps = new ArrayList<>();
      current.path("authoring").path("steps").forEach(steps::add);
      ObjectNode session =
          C.object()
              .put("schemaVersion", 3)
              .put("createdAt", now.toString())
              .put("sessionId", sessionId)
              .put("testId", testId.toString())
              .put("state", "PREPARING")
              .put("expiresAt", now.plusSeconds(600).toString());
      ObjectNode scope =
          session
              .putObject("scope")
              .put("principalId", principal)
              .put("csiId", csiId)
              .put("environmentId", environment)
              .put("sourceRevision", current.path("sourceRevision").asText())
              .put("configurationRevision", current.path("configurationRevision").asText())
              .put("modelDataPolicyId", "labels-only-1")
              .putNull("valueTransferPolicyId");
      scope.putArray("capabilities").add("observe").add("step");
      session.putObject("versions").put("contract", 3);
      session.set(
          "limits",
          new com.citi.put.checks.studio.guided.session.GuidedSessionProperties(true, Map.of())
              .snapshot(C));
      ObjectNode counters = session.putObject("counters");
      for (String field :
          List.of(
              "actions",
              "observations",
              "modelProposals",
              "modelInputTokens",
              "modelOutputTokens",
              "sanitizedEvidenceBytes")) {
        counters.put(field, 0);
      }
      session.put("scopeHash", GuidedContracts.hash(scope));
      session
          .putObject("owner")
          .put("workerId", "unclaimed")
          .put("fence", 0)
          .put("leaseExpiresAt", now.toString());
      session
          .putObject("runAuthorization")
          .put("authorizationId", UUID.randomUUID().toString())
          .put("kind", "scopedRun")
          .put("principalId", principal)
          .put("scopeHash", session.path("scopeHash").asText())
          .put("authorizedAt", now.toString());
      ArrayNode sessionSteps = session.putArray("sourceSteps");
      steps.forEach(
          step ->
              sessionSteps
                  .addObject()
                  .put("stepId", step.path("id").asText())
                  .put("requiresAssertion", false));
      ObjectNode requirements = pins.requirements(session);
      tx.executeWithoutResult(
          status -> {
            sessions.insert(session);
            GuidedPublicationEvidenceFixture.freezeSource(jdbc, tx, session);
          });
      PublicationContracts.Base base =
          tx.execute(
              status -> {
                sessions.lock(sessionId);
                return bases.capture(session, requirements, Instant.now());
              });
      return commit(sessionId, base, csiId, principal);
    }

    private UUID commit(
        String sessionId, PublicationContracts.Base base, String csiId, String principal) {
      tx.executeWithoutResult(
          status -> {
            var current = sessions.lock(sessionId);
            current.document().put("state", "OBSERVING");
            current
                .document()
                .putObject("owner")
                .put("workerId", "fixture-worker")
                .put("fence", 1)
                .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
            sessions.save(current);
          });
      ObjectNode basis =
          GuidedPublicationEvidenceFixture.completeExistingSession(jdbc, tx, sessionId, base);
      String translationHash = basis.path("translationHash").asText();
      tx.executeWithoutResult(
          status -> {
            var current = sessions.lock(sessionId);
            current.progress().put("stepIndex", current.document().path("sourceSteps").size());
            current.document().put("state", "FINALIZING");
            sessions.save(current);
            jdbc.update(
                "UPDATE studio_guided_translation_state SET continuation='FINALIZING'"
                    + " WHERE session_id=?",
                sessionId);
          });
      ObjectNode supported = pins.selected();
      PublicationContracts.Candidate candidate =
          new ObservedArtifactLowerer(C).lower(basis, supported.path("profile"));

      ObjectNode identity = C.object();
      identity.set("base", base.document());
      identity
          .put("ownerWorkerId", "fixture-worker")
          .put("ownerFence", 1)
          .put("translationHash", translationHash)
          .put("basisHash", GuidedContracts.hash(basis));
      for (String key :
          List.of(
              "learnedPlanHash",
              "artifactHash",
              "referencePolicyHash",
              "operationEquivalenceHash",
              "publicationEvidenceHash",
              "profileHash")) {
        identity.set(key, candidate.hashes().path(key));
      }
      identity.put("validationBuildHash", GuidedContracts.hash(supported.path("build")));
      identity.put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)));
      PublicationContracts.Snapshot snapshot = new PublicationContracts.Snapshot(identity, basis);
      String finalizeKey = "corun-finalize-" + UUID.randomUUID();
      String finalizeDigest = GuidedContracts.hash(C.object().put("sessionId", sessionId));

      PublicationContracts.Attempt attempt =
          tx.execute(
              status -> {
                sessions.lock(sessionId);
                return publications.reserve(
                    new PublicationContracts.Claim(
                        sessionId, finalizeKey, finalizeDigest, snapshot),
                    Instant.now());
              });
      tx.executeWithoutResult(
          status -> {
            sessions.lock(sessionId);
            publications.claim(
                sessionId, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
          });

      // The verdict the runner's validator would give over the claimed snapshot (the publication
      // pipeline is not what this co-run exercises; the replay of the published plan is).
      ObjectNode verdict =
          C.object()
              .put("schemaVersion", 3)
              .put("ok", true)
              .putNull("errorCode")
              .put("attemptId", attempt.attemptId().toString())
              .put("claimId", attempt.claimId().toString())
              .put("snapshotHash", snapshot.hash())
              .put("basisHash", identity.path("basisHash").asText());
      for (String key :
          List.of(
              "artifactHash",
              "learnedPlanHash",
              "referencePolicyHash",
              "operationEquivalenceHash",
              "admissionProvenanceHash",
              "publicationEvidenceHash")) {
        verdict.set(key, candidate.hashes().path(key));
      }
      verdict.set("profile", supported.path("profile"));
      verdict.set("build", supported.path("build"));
      tx.executeWithoutResult(
          status -> {
            sessions.lock(sessionId);
            publications.finish(
                sessionId,
                attempt.attemptId(),
                attempt.claimId(),
                snapshot.hash(),
                PublicationContracts.AttemptStatus.VALIDATED,
                verdict,
                null,
                Instant.now());
          });

      UUID revisionId = UUID.randomUUID();
      PublicationContracts.Commit commit =
          new PublicationContracts.Commit(
              sessionId,
              revisionId,
              attempt.attemptId(),
              attempt.claimId(),
              finalizeKey,
              finalizeDigest,
              snapshot,
              candidate,
              new PublicationContracts.Grant(
                  sessionId, principal, csiId, snapshot.hash(), attempt.validationDeadline()));
      tx.executeWithoutResult(
          status -> {
            sessions.lock(sessionId);
            publications.commit(commit, Instant.now());
          });
      return revisionId;
    }

    /** The source setup that must precede the immutable session and base capture. */
    private void prepareDeclaredSource(UUID testId, List<String> referencedSecrets) {
      try {
        ObjectNode authoring =
            (ObjectNode)
                C.parse(
                    jdbc.queryForObject(
                        "SELECT authoring::text FROM ui_tests WHERE id=?", String.class, testId));
        Map<String, StudioVariable> names = new java.util.LinkedHashMap<>();
        CanonicalStudioCodec.parseVariables(
                jdbc.queryForObject(
                    "SELECT variables::text FROM ui_tests WHERE id=?", String.class, testId))
            .forEach(variable -> names.put(variable.name(), variable));
        ObjectNode first = (ObjectNode) authoring.path("steps").get(0);
        if (!first.path("context").isObject()) {
          first.putObject("context").putArray("entries");
        }
        ObjectNode context = (ObjectNode) first.path("context");
        if (!context.has("evidenceReferences")) {
          context.putArray("evidenceReferences");
        }
        ArrayNode entries = (ArrayNode) context.path("entries");
        for (String secret : referencedSecrets) {
          StudioVariable variable =
              names.values().stream()
                  .filter(
                      candidate ->
                          candidate.kind().equals("secretRef")
                              && secret.equals(candidate.secretId()))
                  .findFirst()
                  .orElse(null);
          if (variable == null) {
            variable = StudioVariable.secretRef(secret, secret);
            names.put(secret, variable);
          }
          boolean present = false;
          for (JsonNode entry : entries) {
            present |=
                entry.path("kind").asText().equals("secretRef")
                    && entry.path("referenceId").asText().equals(variable.name());
          }
          if (!present) {
            entries.addObject().put("kind", "secretRef").put("referenceId", variable.name());
          }
        }
        var source = JSON.treeToValue(authoring, AuthoringV2Request.class);
        Map<String, String> values = new java.util.HashMap<>();
        names
            .values()
            .forEach(
                variable -> {
                  if (variable.kind().equals("plain") && variable.value() != null) {
                    values.put(variable.name(), variable.value());
                  }
                });
        jdbc.update(
            "UPDATE ui_tests SET authoring=?::jsonb,authoring_revision_inputs=?::jsonb,"
                + "variables=?::jsonb WHERE id=?",
            JSON.writeValueAsString(source),
            JSON.writeValueAsString(
                com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity.create(
                    source, values)),
            CanonicalStudioCodec.variablesToJson(new ArrayList<>(names.values())),
            testId);
      } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
        throw new IllegalStateException(failure);
      }
    }
  }

  private static Timestamp ago(Duration age) {
    return Timestamp.from(Instant.now().minus(age));
  }
}
