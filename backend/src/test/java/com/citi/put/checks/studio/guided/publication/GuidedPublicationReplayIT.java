package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.account.ReplayAccountAccess;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationStore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
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
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Actual production application, Core/SDK HTTP, authenticated guided worker and ordinary recorded
 * child.
 */
@SpringBootTest(
    classes = {ChecksApplication.class, GuidedPublicationReplayIT.Accounts.class},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false",
      "spring.jpa.hibernate.ddl-auto=none",
      "studio.execution.dispatcher.enabled=false"
    })
@ActiveProfiles("test")
@org.junit.jupiter.api.TestInstance(org.junit.jupiter.api.TestInstance.Lifecycle.PER_CLASS)
@org.junit.jupiter.api.TestMethodOrder(org.junit.jupiter.api.MethodOrderer.OrderAnnotation.class)
class GuidedPublicationReplayIT {
  static final GuidedContracts C = new GuidedContracts();
  static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
  static final String ONE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      TWO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      THREE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  static final String COOKIE = "controlled-core-cookie",
      SERVICE = "controlled-runner-service",
      CALLBACK = "controlled-callback-service";
  static final String SAVED = "PRIVATE-SAVED-" + UUID.randomUUID();
  static final Path TEMP;
  static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:15-alpine");
  static final HttpServer APP, PROVIDER;
  static final String ORIGIN, URL;
  static final int GUIDED_PORT, NORMAL_PORT, BACKEND_PORT;
  static final SSLContext TLS, PREVIOUS_TLS;
  static final KeyPair ISSUER;
  static final String FINGERPRINT;
  static final ObjectNode CATALOG, POLICY;
  static final List<String> RECEIPTS = new CopyOnWriteArrayList<>(),
      VALUES = new CopyOnWriteArrayList<>(),
      MODEL_WIRE = new CopyOnWriteArrayList<>(),
      MODEL_KINDS = new CopyOnWriteArrayList<>();
  static final AtomicInteger NAVIGATIONS = new AtomicInteger(),
      CORE_CALLS = new AtomicInteger(),
      LEGACY_MODEL_CALLS = new AtomicInteger(),
      PROVIDER_FAILURES = new AtomicInteger();
  static final List<String> TEXT;
  static volatile String coreRole = "owner";
  static volatile long accountLifetimeMs = 30000;
  static volatile UUID preReadyId;
  static final java.util.concurrent.atomic.AtomicBoolean FAIL_TERMINAL_COMMIT =
      new java.util.concurrent.atomic.AtomicBoolean();
  static final java.util.concurrent.atomic.AtomicBoolean HOLD_TERMINAL_RETRY =
      new java.util.concurrent.atomic.AtomicBoolean();
  static final AtomicInteger TERMINAL_ROLLBACKS = new AtomicInteger(),
      PRE_READY_NEGATIVE_CASES = new AtomicInteger();
  static final List<JsonNode> RECEIVED_FAILURE_REPORTS = new CopyOnWriteArrayList<>();
  static volatile java.util.concurrent.CountDownLatch retryPaused =
      new java.util.concurrent.CountDownLatch(1);
  static volatile java.util.concurrent.CountDownLatch retryRelease =
      new java.util.concurrent.CountDownLatch(1);

  static volatile boolean asynchronousPage;
  static volatile boolean askTimingSource, delayTimingModel;
  static volatile boolean observedChoicePage, askObservedChoice;
  static volatile java.util.function.Consumer<JsonNode> beforeObservedQuestion;
  static final List<JsonNode> CHOICE_RECEIPTS = new CopyOnWriteArrayList<>();
  static volatile String timingSourceText;
  static final List<String> NAVIGATION_PATHS = new CopyOnWriteArrayList<>();
  static final java.util.concurrent.ConcurrentMap<Integer, java.util.concurrent.CountDownLatch>
      ASYNC_RECEIPTS = new java.util.concurrent.ConcurrentHashMap<>();
  static final List<String> PASSIVE_REPLAY = new CopyOnWriteArrayList<>();
  static final List<String> REPLAY_INVOCATIONS = new CopyOnWriteArrayList<>();
  static Process guidedWorker, ordinaryWorker;

  static {
    try {
      TEMP = Files.createTempDirectory("obs006-joined-");
      try (ServerSocket socket = new ServerSocket(0)) {
        BACKEND_PORT = socket.getLocalPort();
      }
      try (ServerSocket socket = new ServerSocket(0)) {
        GUIDED_PORT = socket.getLocalPort();
      }
      try (ServerSocket socket = new ServerSocket(0)) {
        NORMAL_PORT = socket.getLocalPort();
      }
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
      KeyStore store = KeyStore.getInstance("PKCS12");
      try (var in = Files.newInputStream(TEMP.resolve("tls.p12"))) {
        store.load(in, "fixture".toCharArray());
      }
      var keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
      keys.init(store, "fixture".toCharArray());
      var trusts = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      trusts.init(store);
      TLS = SSLContext.getInstance("TLS");
      TLS.init(keys.getKeyManagers(), trusts.getTrustManagers(), new SecureRandom());
      PREVIOUS_TLS = SSLContext.getDefault();
      SSLContext.setDefault(TLS);
      X509Certificate cert = (X509Certificate) store.getCertificate(store.aliases().nextElement());
      FINGERPRINT =
          HexFormat.ofDelimiter(":")
              .withUpperCase()
              .formatHex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
      var generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      ISSUER = generator.generateKeyPair();
      Files.writeString(
          TEMP.resolve("issuer.pub"),
          "-----BEGIN PUBLIC KEY-----\n"
              + Base64.getMimeEncoder(64, new byte[] {10})
                  .encodeToString(ISSUER.getPublic().getEncoded())
              + "\n-----END PUBLIC KEY-----\n");
      Files.writeString(
          TEMP.resolve("controller.jwt"),
          token("backend-controller", "controller-1", "studio-guided-runner"));
      Files.writeString(
          TEMP.resolve("coordinator.jwt"),
          token("backend-controller", "controller-1", "studio-guided-controller"));
      APP = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      ORIGIN = "http://127.0.0.1:" + APP.getAddress().getPort();
      URL = ORIGIN + "/flow";
      TEXT =
          List.of(
              "Open " + URL + " and read the Order reference.",
              "Enter that order reference in Destination. London is deliberately authored.",
              "Click Submit then check Confirmation appears.");
      APP.createContext(
          "/api/v1/users/me",
          exchange -> {
            CORE_CALLS.incrementAndGet();
            boolean cookie =
                ("put_session=" + COOKIE).equals(exchange.getRequestHeaders().getFirst("Cookie"));
            byte[] bytes =
                ("{\"user_id\":\"user-1\",\"email\":\"fixture@example.invalid\",\"n"
                        + "ame\":\"Fixture\",\"department\":\"Test\",\"roles\":[],\"csi_owne"
                        + "rship\":[{\"csi_id\":\"CSI-123\",\"role\":\""
                        + coreRole
                        + "\"}]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(cookie ? 200 : 401, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
          });
      APP.createContext(
          "/flow",
          exchange -> {
            int run = NAVIGATIONS.incrementAndGet();
            NAVIGATION_PATHS.add(exchange.getRequestURI().toString());
            String fresh = "  fresh-" + run + "-" + UUID.randomUUID() + "-é😀  ";
            VALUES.add(fresh);
            String html =
                "<!doctype html><html><head><title>Operations</title></head><body><main"
                    + " aria-label='Operations'><output aria-label='Order reference'>"
                    + fresh
                    + "</output><label for='destination'>Destination</label><textarea"
                    + " id='destination'></textarea><output id='done' aria-label='Confirmation'"
                    + " hidden>Submitted</output><button"
                    + " id='submit'>Submit</button></main><script>document.getElementByI"
                    + "d('submit').onclick=()=>{document.getElementById('done').hidden=f"
                    + "alse;fetch('/receipt',{method:'POST',body:document.getElementById"
                    + "('destination').value});};</script></body></html>";
            if (asynchronousPage) {
              html =
                  "<!doctype html><html><head><title>Operations</title></head><body>"
                      + "<main aria-label='Operations'><output aria-label='Order reference'>"
                      + fresh
                      + "</output><label for='destination'>Destination</label><textarea"
                      + " id='destination'></textarea><button"
                      + " id='submit'>Submit</button></main><script>"
                      + " document.getElementById('submit').onclick=async()=>{const r=await"
                      + " fetch('/receipt?run="
                      + run
                      + "',{method:'POST',body:document.getElementById('destination').value});if(r.ok){const"
                      + " out=document.createElement('output');out.setAttribute('aria-label',"
                      + "'Confirmation');out.textContent='Submitted';document.querySelector('main').append(out)}}"
                      + ";</script></body></html>";
            }
            if (observedChoicePage) {
              html =
                  "<!doctype html><html><head><title>Operations</title></head><body><main"
                      + " aria-label='Operations'><output aria-label='Order reference'>"
                      + fresh
                      + "</output><label for='destination'>Destination</label><textarea"
                      + " id='destination'></textarea><label for='alternate'>Alternate"
                      + " destination</label><textarea id='alternate'></textarea><output id='done'"
                      + " aria-label='Confirmation' hidden>Submitted</output><button"
                      + " id='submit'>Submit</button></main><script>document.getElementById('submit').onclick=()=>{"
                      + "document.getElementById('done').hidden=false;fetch('/receipt?choice=true',{method:'POST',"
                      + "body:JSON.stringify({chosen:document.getElementById('alternate').value,"
                      + "unchosen:document.getElementById('destination').value})});};</script></body></html>";
            }
            byte[] bytes = html.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
          });
      APP.createContext(
          "/receipt",
          exchange -> {
            String body =
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if ("choice=true".equals(exchange.getRequestURI().getQuery())) {
              JsonNode receipt = C.parse(body);
              CHOICE_RECEIPTS.add(receipt);
              RECEIPTS.add(receipt.path("chosen").asText());
              exchange.sendResponseHeaders(204, -1);
            } else if (exchange.getRequestURI().getQuery() != null) {
              RECEIPTS.add(body);
              int run = Integer.parseInt(exchange.getRequestURI().getQuery().substring(4));
              var release = new java.util.concurrent.CountDownLatch(1);
              ASYNC_RECEIPTS.put(run, release);
              boolean acknowledged;
              try {
                acknowledged = release.await(20, java.util.concurrent.TimeUnit.SECONDS);
              } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                acknowledged = false;
              }
              exchange.sendResponseHeaders(acknowledged ? 204 : 503, -1);
            } else {
              RECEIPTS.add(body);
              exchange.sendResponseHeaders(204, -1);
            }
            exchange.close();
          });
      APP.createContext(
          "/acquisition",
          exchange -> {
            String result =
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (asynchronousPage) {
              PASSIVE_REPLAY.add(result);
              if (result.equals("ABSENT")) {
                ASYNC_RECEIPTS.values().forEach(java.util.concurrent.CountDownLatch::countDown);
              }
            }
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          });
      APP.createContext(
          "/invocation",
          exchange -> {
            String operation =
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            if (asynchronousPage || observedChoicePage) {
              REPLAY_INVOCATIONS.add(operation);
            }
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
          });
      APP.setExecutor(java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor());
      APP.start();
      PROVIDER = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      PROVIDER.createContext(
          "/",
          exchange -> {
            String raw =
                new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            MODEL_WIRE.add(raw);
            try {
              JsonNode wire = C.parse(raw);
              JsonNode request =
                  C.parse(wire.path("contents").get(0).path("parts").get(0).path("text").asText());
              if (!request.has("kind")) {
                LEGACY_MODEL_CALLS.incrementAndGet();
                throw new IllegalStateException("Unexpected compiler gateway request");
              }
              MODEL_KINDS.add(request.path("kind").asText());
              ObjectNode reply = C.object();
              reply
                  .putArray("candidates")
                  .addObject()
                  .put("finishReason", "STOP")
                  .putObject("content")
                  .put("role", "model")
                  .putArray("parts")
                  .addObject()
                  .put("text", model(request).toString());
              reply
                  .putObject("usageMetadata")
                  .put("promptTokenCount", 20)
                  .put("candidatesTokenCount", 40)
                  .put("thoughtsTokenCount", 0)
                  .put("toolUsePromptTokenCount", 0)
                  .put("totalTokenCount", 60);
              byte[] bytes = reply.toString().getBytes(StandardCharsets.UTF_8);
              exchange.getResponseHeaders().set("Content-Type", "application/json");
              exchange.sendResponseHeaders(200, bytes.length);
              exchange.getResponseBody().write(bytes);
            } catch (RuntimeException failure) {
              PROVIDER_FAILURES.incrementAndGet();
              exchange.sendResponseHeaders(500, -1);
            }
            exchange.close();
          });
      PROVIDER.start();
      String root =
          Path.of("../studio-runner/dist").toAbsolutePath().normalize().toUri().toString();
      String generated =
          command(
              "node",
              "--input-type=module",
              "-e",
              "import {readFileSync} from 'node:fs';import"
                  + " {OBSERVED_PROFILE,hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH} from '"
                  + root
                  + "validator/observedReferencePolicy.js';const r=JSON.parse(readFileSync(new"
                  + " URL('"
                  + root
                  + "runtime-versions.json'),'utf8'));console.log(JSON.stringify({prof"
                  + "ile:OBSERVED_PROFILE,build:{profileHash:hashObserved(OBSERVED_PRO"
                  + "FILE),schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH,referenceBundl"
                  + "eHash:r.observedReferenceBundleHash,chromiumBuild:r.observedChrom"
                  + "iumBuild,executableImageDigest:'"
                  + "c".repeat(64)
                  + "'}}));");
      CATALOG = (ObjectNode) C.parse(generated.strip());
      Files.writeString(TEMP.resolve("catalog.json"), CATALOG.toString());
      POLICY =
          C.object()
              .put("version", 1)
              .put("policyId", "orders-read")
              .put("policyVersion", "1")
              .put("applicationId", "orders")
              .put("environment", "fixture")
              .put("accountRef", "account-1")
              .put("entryPolicyId", "blank");
      POLICY.putArray("allowedOrigins").add(ORIGIN);
      POLICY.putArray("rules");
      ObjectNode appPolicy =
          POLICY
              .putObject("applicationPolicy")
              .put("policyRuleId", "structural-policy")
              .put("allowStructuralDiscovery", true);
      ObjectNode grant =
          appPolicy
              .putArray("readGrants")
              .addObject()
              .put("policyRuleId", "business-read")
              .put("origin", ORIGIN);
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
      Files.writeString(
          TEMP.resolve("policies.json"), C.object().putArray("policies").add(POLICY).toString());
      DB.start();
    } catch (Exception failure) {
      throw new ExceptionInInitializerError(failure);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry r) {
    r.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
    r.add("spring.datasource.url", DB::getJdbcUrl);
    r.add("spring.datasource.username", DB::getUsername);
    r.add("spring.datasource.password", DB::getPassword);
    r.add("server.port", () -> BACKEND_PORT);
    r.add("checks.core-service.base-url", () -> ORIGIN);
    r.add("server.ssl.enabled", () -> true);
    r.add("server.ssl.key-store", () -> TEMP.resolve("tls.p12").toString());
    r.add("server.ssl.key-store-password", () -> "fixture");
    r.add("server.ssl.key-store-type", () -> "PKCS12");
    r.add("server.ssl.trust-store", () -> TEMP.resolve("trust.p12").toString());
    r.add("server.ssl.trust-store-password", () -> "fixture");
    r.add("server.ssl.client-auth", () -> "want");
    r.add("studio.guided-authoring.enabled", () -> true);
    r.add(
        "studio.guided-authoring.service-public-key",
        () -> Base64.getEncoder().encodeToString(ISSUER.getPublic().getEncoded()));
    r.add("studio.guided-authoring.service-issuer", () -> "fixture-issuer");
    r.add("studio.guided-authoring.mtls-required", () -> true);
    r.add("studio.guided-authoring.runner-origin", () -> "https://localhost:" + GUIDED_PORT);
    r.add(
        "studio.guided-authoring.controller-token-file",
        () -> TEMP.resolve("controller.jwt").toString());
    r.add("studio.guided-authoring.translation.enabled", () -> true);
    r.add("studio.guided-authoring.translation.allow-authored-nonsecret", () -> true);
    r.add("studio.guided-authoring.translation.applications", () -> "orders");
    r.add("studio.guided-authoring.translation.environments", () -> "fixture");
    r.add("studio.guided-authoring.translation.worker-id", () -> "worker-1");
    r.add(
        "studio.guided-authoring.translation.controller-origin",
        () -> "https://localhost:" + BACKEND_PORT);
    r.add(
        "studio.guided-authoring.translation.controller-token-file",
        () -> TEMP.resolve("coordinator.jwt").toString());
    r.add("studio.guided-authoring.translation.poll-ms", () -> 100);
    r.add("studio.guided.publication.enabled", () -> true);
    r.add("studio.observed-replay.enabled", () -> true);
    r.add(
        "studio.observed-replay.catalog-json",
        () -> C.object().putArray("catalog").add(CATALOG).toString());
    r.add(
        "studio.observed-replay.policies-json",
        () -> C.object().putArray("policies").add(POLICY).toString());
    r.add("studio.runner.base-url", () -> "http://127.0.0.1:" + NORMAL_PORT);
    r.add("studio.runner.service-identity-token", () -> SERVICE);
    r.add("studio.execution.callback.service-token", () -> CALLBACK);
    r.add("studio.scheduling.poll-interval-ms", () -> "3600000");
    r.add("studio.execution.enabled", () -> true);
    r.add("studio.execution.video-store.provider", () -> "local");
    r.add("studio.execution.video-store.directory", () -> TEMP.resolve("objects").toString());
    r.add("studio.compile.gateway.provider", () -> "vertex");
    r.add(
        "studio.compile.gateway.endpoint",
        () -> "http://127.0.0.1:" + PROVIDER.getAddress().getPort());
    r.add("studio.compile.gateway.project", () -> "fixture");
    r.add("studio.compile.gateway.location", () -> "global");
    r.add("studio.compile.gateway.model", () -> "controlled");
    r.add("studio.compile.gateway.credentials.mode", () -> "none");
  }

  @TestConfiguration
  static class Accounts {
    @Bean
    com.citi.put.checks.studio.internal.ProgressReportService.ReportCommitHook
        observedCommitFault() {
      return id -> {
        if (id.equals(preReadyId) && FAIL_TERMINAL_COMMIT.compareAndSet(true, false)) {
          TERMINAL_ROLLBACKS.incrementAndGet();
          throw new IllegalStateException("Controlled observed terminal commit rollback");
        }
      };
    }

    @Bean
    org.springframework.boot.web.servlet.FilterRegistrationBean<jakarta.servlet.Filter>
        observedReportCapture() {
      jakarta.servlet.Filter filter =
          (request, response, chain) -> {
            var http = (jakarta.servlet.http.HttpServletRequest) request;
            UUID target = preReadyId;
            boolean capture =
                target != null
                    && http.getRequestURI()
                        .equals("/internal/studio/executions/" + target + "/progress")
                    && http.getHeader("X-Observed-Negative-Probe") == null;
            if (!capture) {
              chain.doFilter(request, response);
              return;
            }
            if (HOLD_TERMINAL_RETRY.get() && TERMINAL_ROLLBACKS.get() > 0) {
              retryPaused.countDown();
              try {
                if (!retryRelease.await(10, java.util.concurrent.TimeUnit.SECONDS)) {
                  throw new jakarta.servlet.ServletException("Controlled retry barrier timed out");
                }
              } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new jakarta.servlet.ServletException("Controlled retry barrier interrupted");
              }
            }
            var wrapped =
                new org.springframework.web.util.ContentCachingRequestWrapper(http, 262144);
            try {
              chain.doFilter(wrapped, response);
            } finally {
              if (wrapped.getContentAsByteArray().length > 0) {
                try {
                  RECEIVED_FAILURE_REPORTS.add(C.parseWire(wrapped.getContentAsByteArray()));
                } catch (RuntimeException invalid) {
                  /* Original production parsing still owns the response. */
                }
              }
            }
          };
      var registration = new org.springframework.boot.web.servlet.FilterRegistrationBean<>(filter);
      registration.addUrlPatterns("/internal/studio/executions/*");
      return registration;
    }

    @Bean
    @Primary
    GuidedProductionSessionAccess.AccountAccess controlledLearningAccount() {
      return new GuidedProductionSessionAccess.AccountAccess() {
        public GuidedSessionAccess.Snapshot resolve(
            org.springframework.security.core.Authentication user, JsonNode request) {
          ObjectNode scope =
              C.object()
                  .put("principalId", "user-1")
                  .put("csiId", "CSI-123")
                  .put("environmentId", "fixture")
                  .put("applicationId", "orders")
                  .put("accountRef", "account-1")
                  .put("sourceRevision", "1")
                  .put("configurationRevision", "1")
                  .put("modelDataPolicyId", "approved-authored-A")
                  .putNull("valueTransferPolicyId");
          scope.putArray("approvedOrigins").add(ORIGIN);
          scope
              .putArray("capabilities")
              .add("observe")
              .add("navigate")
              .add("read")
              .add("fill")
              .add("click")
              .add("assert");
          return new GuidedSessionAccess.Snapshot(
              scope,
              C.object().putArray("steps"),
              C.object()
                  .put("mode", "configuredAccount")
                  .put("connectionId", "controlled-account-only"));
        }

        public void checkCurrent(JsonNode session) {}
      };
    }

    @Bean
    @Primary
    ReplayAccountAccess controlledReplayAccount() {
      return new ReplayAccountAccess() {
        public AccountAuthorization authorize(ReplayAccountRequest input) {
          JsonNode q = input.document();
          ObjectNode a =
              C.object()
                  .put("version", 1)
                  .put("grantId", UUID.randomUUID().toString())
                  .put("providerId", "fixture");
          for (String k :
              List.of("executionId", "attemptId", "revisionDigest", "scope", "issuedAt")) {
            a.set(k, q.path(k));
          }
          Instant expiry = Instant.parse(q.path("issuedAt").asText()).plusMillis(accountLifetimeMs);
          Instant maximum = Instant.parse(q.path("latestExpiry").asText());
          if (expiry.isAfter(maximum)) {
            expiry = maximum;
          }
          a.put("scopeHash", GuidedContracts.hash(q.path("scope")))
              .put("expiresAt", PublicationContracts.time(expiry));
          return new AccountAuthorization(a);
        }

        public AccountHandle issueHandle(AccountAuthorization a, JsonNode grant) {
          ObjectNode h =
              C.object().put("version", 1).put("opaqueHandle", "controlled-account-handle");
          h.set("authorization", a.document());
          return new AccountHandle(h);
        }

        public boolean isCurrent(AccountAuthorization a, Instant now) {
          return Instant.parse(a.document().path("expiresAt").asText()).isAfter(now);
        }
      };
    }
  }

  @LocalServerPort int port;
  @Autowired JdbcTemplate jdbc;
  @Autowired GuidedSessionRepository sessions;
  @Autowired GuidedTranslationStore plans;
  @Autowired StudioDispatcher dispatcher;
  @Autowired com.citi.put.checks.studio.scheduling.StudioSchedulingProperties scheduling;
  @Autowired com.citi.put.checks.studio.scheduling.StudioScheduleProcessor scheduleProcessor;

  private UUID publishedTestId;
  private String currentPublishedSession;
  private JsonNode currentPublishedReceipt;

  @Test
  @org.junit.jupiter.api.Order(1)
  void actualLearningPublishesWithoutEffectsThenTwoOrdinaryRunsRecaptureFreshValues()
      throws Exception {
    startWorkers();
    // The real service-token filter precedes Spring path/body binding. These refusals have no
    // execution row and cannot reach the admission CAS or either model gateway.
    assertThat(observedAdmissionHttp("not-a-uuid", "{}").statusCode()).isEqualTo(400);
    assertThat(observedAdmissionHttp(UUID.randomUUID().toString(), null).statusCode())
        .isEqualTo(400);
    assertThat(observedAdmissionHttp(UUID.randomUUID().toString(), "{}").statusCode())
        .isEqualTo(422);
    for (var probe :
        List.of(
            Map.entry(
                "https://localhost:" + port + "/internal/v2/studio/guided-sessions/probe/plans",
                "studio-guided-runner"),
            Map.entry(
                "https://localhost:"
                    + GUIDED_PORT
                    + "/internal/v2/studio/guided-sessions/probe/observe",
                "studio-guided-controller"))) {
      var bad =
          HttpRequest.newBuilder(URI.create(probe.getKey()))
              .header(
                  "Authorization",
                  "Bearer " + token("backend-controller", "controller-1", probe.getValue()))
              .header("Content-Type", "application/json")
              .header("Idempotency-Key", UUID.randomUUID().toString())
              .header("X-Owner-Fence", "1")
              .POST(HttpRequest.BodyPublishers.ofString("{}"))
              .build();
      var refused =
          HttpClient.newBuilder()
              .sslContext(TLS)
              .build()
              .send(bad, HttpResponse.BodyHandlers.ofString());
      assertThat(refused.statusCode()).isIn(401, 403);
    }
    jdbc.update(
        "INSERT INTO users(id,sso_id,name,email,created_at) VALUES"
            + " (?,'user-1','Fixture','fixture@example.invalid',now()) ON CONFLICT DO NOTHING",
        UUID.randomUUID());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES"
            + " ('CSI-123','Orders','Ops','HIGH','fixture@example.invalid','Production') ON"
            + " CONFLICT DO NOTHING");
    UUID testId = UUID.randomUUID();
    var authoring =
        new AuthoringV2Request(
            2,
            null,
            List.of(
                new AuthoringStep(UUID.fromString(ONE), TEXT.get(0), null),
                new AuthoringStep(UUID.fromString(TWO), TEXT.get(1), null),
                new AuthoringStep(UUID.fromString(THREE), TEXT.get(2), null)));
    jdbc.update(
        "INSERT INTO"
            + " ui_tests(id,name,csi_id,environment,browser,steps,variables,auth"
            + "oring,authoring_revision_inputs,created_by,created_at,updated_at)"
            + " VALUES (?,'Observed"
            + " publication','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?:"
            + ":jsonb,?::jsonb,'fixture@example.invalid',now(),now())",
        testId,
        JSON.writeValueAsString(TEXT),
        "[{\"name\":\"saved\",\"kind\":\"plain\",\"value\":\"" + SAVED + "\"}]",
        JSON.writeValueAsString(authoring),
        JSON.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())));
    ObjectNode start =
        C.object()
            .put("schemaVersion", 2)
            .put("testId", testId.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", "fixture")
            .put("applicationId", "orders")
            .put("accountRef", "account-1");
    start.set("versions", versions());
    JsonNode started =
        publicCall("/api/v3/studio/guided-sessions", start, 202, UUID.randomUUID().toString());
    String id = started.path("session").path("sessionId").asText();
    assertThat(id).isNotBlank();
    JsonNode acquisition =
        sessions.transaction(
            () -> sessions.lock(id).progress().path("translationAcquisition").deepCopy());
    assertThat(acquisition.path("allowanceMs").asLong()).isEqualTo(30000);
    assertThat(acquisition.path("policy").asText()).isEqualTo("passive-target-1");
    assertThat(acquisition.path("sourceRevision").asText()).isEqualTo("1");
    long learningEnd = System.nanoTime() + Duration.ofSeconds(90).toNanos();
    while (System.nanoTime() < learningEnd) {
      JsonNode current = sessions.transaction(() -> sessions.lock(id).document().deepCopy());
      if (current.path("state").asText().equals("FINALIZING")) {
        break;
      }
      if (List.of("FAILED", "EXPIRED", "UNKNOWN_OUTCOME", "CANCELLED")
          .contains(current.path("state").asText())) {
        break;
      }
      Thread.sleep(50);
    }
    var learningState = sessions.transaction(() -> sessions.lock(id));
    ObjectNode diagnostic =
        C.object()
            .put("state", learningState.document().path("state").asText())
            .put("errorCode", learningState.progress().path("errorCode").asText());
    diagnostic
        .put("providerFailures", PROVIDER_FAILURES.get())
        .put("submits", RECEIPTS.size())
        .put("navigations", NAVIGATIONS.get());
    if (!MODEL_WIRE.isEmpty()) {
      JsonNode last =
          C.parse(
              C.parse(MODEL_WIRE.getLast())
                  .path("contents")
                  .get(0)
                  .path("parts")
                  .get(0)
                  .path("text")
                  .asText());
      var nodes = diagnostic.putArray("lastObservedNames");
      for (JsonNode node : last.path("context").path("observation").path("nodes")) {
        nodes
            .addObject()
            .setAll(
                Map.of(
                    "name",
                    node.path("name"),
                    "role",
                    node.path("role"),
                    "visible",
                    node.path("visible")));
      }
    }
    diagnostic.set("counters", learningState.document().path("counters"));
    diagnostic.set("modelKinds", JSON.valueToTree(MODEL_KINDS));
    Files.writeString(TEMP.resolve("learning-status.json"), diagnostic.toPrettyString());
    assertThat(learningState.document().path("state").asText())
        .as("%s logs=%s", diagnostic, TEMP)
        .isEqualTo("FINALIZING");
    assertThat(RECEIPTS).containsExactly(VALUES.get(0));
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    int learningCalls = MODEL_WIRE.size();
    assertThat(learningCalls).isPositive();
    String key = UUID.randomUUID().toString();
    JsonNode finalize =
        C.object()
            .put("schemaVersion", 2)
            .put("expectedSourceRevision", "1")
            .put("expectedConfigurationRevision", "1");
    JsonNode receipt =
        publicCall("/api/v3/studio/guided-sessions/" + id + "/finalize", finalize, 200, key);
    assertThat(publicCall("/api/v3/studio/guided-sessions/" + id + "/finalize", finalize, 200, key))
        .isEqualTo(receipt);
    assertThat(MODEL_WIRE).hasSize(learningCalls);
    assertThat(RECEIPTS).hasSize(1);
    assertThat(NAVIGATIONS.get()).isEqualTo(1);
    String artifact =
        jdbc.queryForObject(
            "SELECT artifact::text FROM ui_test_revisions WHERE id=?",
            String.class,
            UUID.fromString(receipt.path("revisionId").asText()));
    String artifactHash = GuidedContracts.hash(C.parse(artifact));
    for (int run = 0; run < 2; run++) {
      JsonNode accepted =
          publicCall(
              "/api/v1/studio/tests/" + testId + "/execute",
              C.object(),
              202,
              UUID.randomUUID().toString());
      UUID executionId = UUID.fromString(accepted.path("executionId").asText());
      assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
      long end = System.nanoTime() + Duration.ofSeconds(45).toNanos();
      String state;
      do {
        state =
            jdbc.queryForObject(
                "SELECT status FROM ui_test_executions WHERE id=?", String.class, executionId);
        if (List.of("PASSED", "FAILED", "ERROR").contains(state)) {
          break;
        }
        Thread.sleep(50);
      } while (System.nanoTime() < end);
      assertThat(state)
          .as("execution %s; runner log %s", executionId, TEMP.resolve("ordinary.log"))
          .isEqualTo("PASSED");
      assertThat(
              jdbc.queryForObject(
                  "SELECT observed_admission_receipt IS NOT NULL FROM ui_test_executions WHERE"
                      + " id=?",
                  Boolean.class,
                  executionId))
          .isTrue();
      assertThat(
              jdbc.queryForObject(
                  "SELECT artifact_hash FROM ui_test_revisions WHERE id=?",
                  String.class,
                  UUID.fromString(receipt.path("revisionId").asText())))
          .isEqualTo(artifactHash);
    }
    assertThat(NAVIGATIONS.get()).isEqualTo(3);
    assertThat(RECEIPTS).containsExactlyElementsOf(VALUES);
    assertThat(VALUES).doesNotHaveDuplicates();
    assertThat(MODEL_WIRE).hasSize(learningCalls);
    assertThat(LEGACY_MODEL_CALLS.get()).isZero();
    for (String raw : MODEL_WIRE) {
      assertThat(raw).doesNotContain(SAVED);
      for (String value : VALUES) {
        assertThat(raw).doesNotContain(value);
      }
    }
    assertThat(String.join("\n", MODEL_WIRE)).contains("London");
    JsonNode result =
        publicCall("/api/v3/studio/guided-sessions/" + id + "/result", null, 200, null);
    assertThat(result.path("learnedFromThisRun").asBoolean()).isTrue();
    assertThat(result.path("replayVerified").asBoolean()).isFalse();
    assertThat(result.path("currentReadiness").path("ready").asBoolean()).isTrue();
    // Read the genuinely published row from new production application instances. No account
    // override is installed there: historical receipt reads do not require live account authority.
    coreRole = "viewer";
    int callsBeforeHistory = CORE_CALLS.get();
    assertThat(publicCall("/api/v3/studio/guided-sessions/" + id + "/finalize", finalize, 200, key))
        .isEqualTo(receipt);
    assertThat(CORE_CALLS.get()).isGreaterThan(callsBeforeHistory);
    historicalReplica(id, receipt, true, true, "READY");
    historicalReplica(id, receipt, false, true, "REPLAY_DISABLED");
    historicalReplica(id, receipt, true, false, "RUNTIME_INCOMPATIBLE");
    assertThat(MODEL_WIRE).hasSize(learningCalls);
    assertThat(LEGACY_MODEL_CALLS.get()).isZero();
    assertThat(RECEIPTS).hasSize(3);
    assertThat(NAVIGATIONS.get()).isEqualTo(3);
    ObjectNode evidence =
        C.object()
            .put("controlledProviderCalls", learningCalls)
            .put("initialSubmits", 1)
            .put("finalizationSubmits", 0)
            .put("ordinaryReplays", 2)
            .put("artifactHash", artifactHash)
            .put("productionImage", "NOT_ASSERTED_CONTROLLED_LOCAL_CATALOG");
    evidence.set("catalog", CATALOG);
    evidence.set("learningKinds", JSON.valueToTree(MODEL_KINDS));
    evidence.set(
        "counters",
        sessions.transaction(() -> sessions.lock(id).document().path("counters").deepCopy()));
    Files.writeString(TEMP.resolve("joined-evidence.json"), evidence.toPrettyString());
    schedulerAndNewHead(testId, id, start, finalize, receipt);
    publishedTestId = testId;
  }

  @Test
  @org.junit.jupiter.api.Order(2)
  void queuedAndPreReadyRefusals() throws Exception {
    UUID testId = publishedTestId;
    assertThat(testId)
        .as("Requires the genuinely published revision from the preceding integration flow")
        .isNotNull();
    coreRole = "owner";
    int submits = RECEIPTS.size(), navigations = NAVIGATIONS.get(), models = MODEL_WIRE.size();
    JsonNode cancelled =
        publicCall(
            "/api/v1/studio/tests/" + testId + "/execute",
            C.object(),
            202,
            UUID.randomUUID().toString());
    UUID cancelledId = UUID.fromString(cancelled.path("executionId").asText());
    publicCall(
        "/api/v1/studio/executions/" + cancelledId + "/cancel",
        C.object(),
        202,
        UUID.randomUUID().toString());
    assertThat(dispatcher.dispatchOnce()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT error_code FROM ui_test_executions WHERE id=?", String.class, cancelledId))
        .isEqualTo("CANCELLED");
    accountLifetimeMs = 1000;
    JsonNode expired;
    try {
      expired =
          publicCall(
              "/api/v1/studio/tests/" + testId + "/execute",
              C.object(),
              202,
              UUID.randomUUID().toString());
    } finally {
      accountLifetimeMs = 30000;
    }
    UUID expiredId = UUID.fromString(expired.path("executionId").asText());
    String expiresAt =
        jdbc.queryForObject(
            "SELECT observed_revision_binding->'replayGrant'->>'expiresAt' FROM ui_test_executions"
                + " WHERE id=?",
            String.class,
            expiredId);
    Thread.sleep(
        Math.max(1, Duration.between(Instant.now(), Instant.parse(expiresAt)).toMillis() + 30));
    assertThat(dispatcher.dispatchOnce()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT error_code FROM ui_test_executions WHERE id=?", String.class, expiredId))
        .isEqualTo("AUTHORIZATION_REVOKED");
    for (UUID id : List.of(cancelledId, expiredId)) {
      assertThat(
              jdbc.queryForObject(
                  "SELECT observed_admission_receipt IS NULL AND browser_started_at IS NULL FROM"
                      + " ui_test_executions WHERE id=?",
                  Boolean.class,
                  id))
          .isTrue();
    }
    Files.deleteIfExists(TEMP.resolve("account-apply-entered"));
    Files.writeString(TEMP.resolve("account-state.json"), "{\"pause\":true,\"fail\":true}");
    JsonNode accepted =
        publicCall(
            "/api/v1/studio/tests/" + testId + "/execute",
            C.object(),
            202,
            UUID.randomUUID().toString());
    String id = accepted.path("executionId").asText();
    UUID failureId = UUID.fromString(id);
    preReadyId = failureId;
    var noReceipt =
        callback(
            failureId,
            failureReport(
                failureId,
                observedBinding(failureId),
                com.fasterxml.jackson.databind.node.NullNode.instance),
            CALLBACK);
    assertThat(noReceipt.statusCode()).isEqualTo(409);
    assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
    long enteredDeadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
    while (!Files.exists(TEMP.resolve("account-apply-entered"))
        && System.nanoTime() < enteredDeadline) {
      Thread.sleep(20);
    }
    assertThat(Files.exists(TEMP.resolve("account-apply-entered"))).isTrue();
    invalidPreReadyReports(failureId);
    var beforeRollback = failureState(failureId);
    HOLD_TERMINAL_RETRY.set(true);
    FAIL_TERMINAL_COMMIT.set(true);
    Files.writeString(TEMP.resolve("account-state.json"), "{\"pause\":false,\"fail\":true}");
    try {
      assertThat(retryPaused.await(10, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      assertThat(TERMINAL_ROLLBACKS.get()).isEqualTo(1);
      assertThat(failureState(failureId)).isEqualTo(beforeRollback);
    } finally {
      HOLD_TERMINAL_RETRY.set(false);
      retryRelease.countDown();
    }
    JsonNode snapshot = null;
    long until = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (System.nanoTime() < until) {
      snapshot = publicCall("/api/v1/studio/executions/" + id, null, 200, null);
      if (snapshot.path("streamComplete").asBoolean()) {
        break;
      }
      Thread.sleep(50);
    }
    assertThat(snapshot).isNotNull();
    assertThat(snapshot.path("streamComplete").asBoolean()).isTrue();
    assertThat(snapshot.path("status").asText()).isIn("FAILED", "ERROR");
    assertThat(snapshot.path("startedAt").isNull()).isTrue();
    assertThat(snapshot.path("stepResults")).hasSize(3);
    for (JsonNode step : snapshot.path("stepResults")) {
      assertThat(step.path("status").asText()).isEqualTo("SKIPPED");
      assertThat(step.path("offsetMs").isNull()).isTrue();
      assertThat(step.path("durationMs").isNull()).isTrue();
    }
    assertThat(snapshot.path("video").path("status").asText()).isEqualTo("AVAILABLE");
    // The account failure was closed orderly; recording partiality is independent of outcome.
    assertThat(snapshot.path("video").path("partial").asBoolean()).isFalse();
    try (var stored = Files.walk(TEMP.resolve("objects"))) {
      Path video =
          stored
              .filter(
                  path ->
                      path.toString().contains("/" + id + "/") && path.toString().endsWith(".webm"))
              .findFirst()
              .orElseThrow();
      byte[] bytes = Files.readAllBytes(video);
      assertThat(bytes.length).isGreaterThanOrEqualTo(512);
      assertThat(java.util.Arrays.copyOf(bytes, 4))
          .containsExactly((byte) 0x1a, (byte) 0x45, (byte) 0xdf, (byte) 0xa3);
    }
    var videoResponse =
        HttpClient.newBuilder()
            .sslContext(TLS)
            .build()
            .send(
                HttpRequest.newBuilder(
                        URI.create(
                            "https://localhost:" + port + snapshot.path("videoPath").asText()))
                    .header("Cookie", "put_session=" + COOKIE)
                    .header("Range", "bytes=0-3")
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofByteArray());
    assertThat(videoResponse.statusCode()).isEqualTo(206);
    assertThat(videoResponse.body())
        .containsExactly((byte) 0x1a, (byte) 0x45, (byte) 0xdf, (byte) 0xa3);
    assertThat(snapshot.toString()).doesNotContain(SAVED);
    long captureDeadline = System.nanoTime() + Duration.ofSeconds(2).toNanos();
    while (RECEIVED_FAILURE_REPORTS.size() < 2 && System.nanoTime() < captureDeadline) {
      Thread.sleep(10);
    }
    assertThat(RECEIVED_FAILURE_REPORTS).hasSizeGreaterThanOrEqualTo(2);
    for (JsonNode actual : RECEIVED_FAILURE_REPORTS) {
      assertThat(actual.path("kind").asText()).isEqualTo("FINAL");
      assertThat(actual.toString()).doesNotContain(SAVED);
    }
    JsonNode actualFinal = RECEIVED_FAILURE_REPORTS.getLast();
    var terminal = failureState(failureId);
    var duplicate = callback(failureId, actualFinal, CALLBACK);
    assertThat(duplicate.statusCode()).isEqualTo(200);
    assertThat(C.parse(duplicate.body()).path("applied").asBoolean()).isFalse();
    ObjectNode changedDuplicate = ((ObjectNode) actualFinal).deepCopy();
    changedDuplicate.withObject("/outcome").put("errorMessage", "INTERNAL_ERROR");
    var ignored = callback(failureId, changedDuplicate, CALLBACK);
    assertThat(ignored.statusCode()).isEqualTo(200);
    assertThat(C.parse(ignored.body()).path("applied").asBoolean()).isFalse();
    assertThat(failureState(failureId)).isEqualTo(terminal);
    ObjectNode late = ((ObjectNode) actualFinal).deepCopy().put("runnerSequence", 2);
    assertThat(callback(failureId, late, CALLBACK).statusCode()).isEqualTo(409);
    assertThat(failureState(failureId)).isEqualTo(terminal);
    assertThat(Files.readString(TEMP.resolve("ordinary.log"))).doesNotContain(SAVED);
    preReadyId = null;

    Files.writeString(TEMP.resolve("account-state.json"), "{\"fail\":false}");
    assertThat(RECEIPTS).hasSize(submits);
    assertThat(NAVIGATIONS.get()).isEqualTo(navigations);
    assertThat(MODEL_WIRE).hasSize(models);
    assertThat(LEGACY_MODEL_CALLS.get()).isZero();
    Files.writeString(
        TEMP.resolve("queued-and-pre-ready-evidence.json"),
        C.object()
            .put("cancelBeforeDispatch", true)
            .put("expiredGrantBeforeDispatch", true)
            .put("accountApplyFailureRecording", true)
            .put("negativeCallbackAndImmutableCases", PRE_READY_NEGATIVE_CASES.get())
            .put("actualCommitRollbacks", TERMINAL_ROLLBACKS.get())
            .put("extraNavigations", 0)
            .put("extraSubmits", 0)
            .put("extraProviderCalls", 0)
            .toPrettyString());
  }

  private ObjectNode failureReport(UUID id, JsonNode binding, JsonNode receipt) {
    ObjectNode report =
        C.object()
            .put("executionId", id.toString())
            .put("attemptId", binding.path("attemptId").asText())
            .put(
                "admissionId",
                receipt.isNull()
                    ? UUID.randomUUID().toString()
                    : receipt.path("admissionId").asText())
            .put(
                "runnerInstanceId",
                receipt.isNull()
                    ? "observed-fixture"
                    : receipt.path("request").path("runnerInstanceId").asText())
            .put("kind", "FINAL")
            .put("runnerSequence", 1)
            .put("reportedAt", Instant.now().toString())
            .putNull("browserStartedAt")
            .put("logsTruncated", false)
            .put("payloadReduced", false);
    var steps = report.putArray("steps");
    int count =
        jdbc.queryForObject(
            "SELECT jsonb_array_length(source) FROM ui_test_revisions WHERE id=?",
            Integer.class,
            UUID.fromString(binding.path("revisionId").asText()));
    for (int i = 0; i < count; i++) {
      steps
          .addObject()
          .put("stepIndex", i)
          .put("status", "SKIPPED")
          .putNull("startedAtMs")
          .putNull("finishedAtMs")
          .putNull("durationMs")
          .putNull("failure");
    }
    report.putArray("logs");
    report
        .putObject("runtimeVersions")
        .put("observedProfile", binding.path("requiredProfile").toString())
        .put("observedBuild", binding.path("requiredBuild").toString());
    report
        .putObject("outcome")
        .put("result", "ERROR")
        .put("errorCode", "RUN_ERROR")
        .put("errorMessage", "ACCOUNT_UNKNOWN");
    report
        .putObject("evidence")
        .putNull("videoKey")
        .putNull("manifestKey")
        .put("state", "UNAVAILABLE")
        .put("partial", false);
    return report;
  }

  private HttpResponse<String> callback(UUID id, JsonNode body, String bearer) throws Exception {
    var request =
        HttpRequest.newBuilder(
                URI.create(
                    "https://localhost:"
                        + port
                        + "/internal/studio/executions/"
                        + id
                        + "/progress"))
            .header("Authorization", "Bearer " + bearer)
            .header("X-Observed-Negative-Probe", "1")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build();
    return HttpClient.newBuilder()
        .sslContext(TLS)
        .build()
        .send(request, HttpResponse.BodyHandlers.ofString());
  }

  private Map<String, Object> failureState(UUID id) {
    return jdbc.queryForMap(
        "SELECT"
            + " e.status,e.browser_started_at,e.ended_at,e.snapshot_revision,e.video_key,e.video_status,"
            + " l.state AS"
            + " ledger_state,l.last_runner_sequence,l.attempt_id,l.admission_id,l.runner_instance_id"
            + " FROM ui_test_executions e JOIN studio_dispatch_ledger l ON l.execution_id=e.id AND"
            + " l.execution_accepted_at=e.started_at WHERE e.id=?",
        id);
  }

  private JsonNode observedBinding(UUID id) {
    return C.parse(
        jdbc.queryForObject(
            "SELECT observed_revision_binding::text FROM ui_test_executions WHERE id=?",
            String.class,
            id));
  }

  private void invalidPreReadyReports(UUID id) throws Exception {
    JsonNode binding = observedBinding(id);
    JsonNode receipt =
        C.parse(
            jdbc.queryForObject(
                "SELECT observed_admission_receipt::text FROM ui_test_executions WHERE id=?",
                String.class,
                id));
    ObjectNode baseline = failureReport(id, binding, receipt);
    var before = failureState(id);
    assertThat(before.get("ledger_state")).isEqualTo("ADMITTED");
    assertThat(before.get("last_runner_sequence")).isEqualTo(0L);
    assertThat(before.get("browser_started_at")).isNull();
    var mutations = new java.util.LinkedHashMap<String, java.util.function.Consumer<ObjectNode>>();
    mutations.put("wrong execution", r -> r.put("executionId", UUID.randomUUID().toString()));
    mutations.put("wrong attempt", r -> r.put("attemptId", UUID.randomUUID().toString()));
    mutations.put("wrong admission", r -> r.put("admissionId", UUID.randomUUID().toString()));
    mutations.put("wrong worker", r -> r.put("runnerInstanceId", "another-worker"));
    mutations.put("sequence zero", r -> r.put("runnerSequence", 0));
    mutations.put("first sequence two", r -> r.put("runnerSequence", 2));
    mutations.put("STARTED without origin", r -> r.put("kind", "STARTED"));
    mutations.put("PROGRESS before start", r -> r.put("kind", "PROGRESS"));
    mutations.put("forged origin", r -> r.put("browserStartedAt", Instant.now().toString()));
    mutations.put("PASSED outcome", r -> r.withObject("/outcome").put("result", "PASSED"));
    mutations.put(
        "FAILED assertion outcome", r -> r.withObject("/outcome").put("result", "FAILED"));
    mutations.put(
        "unsupported outer code", r -> r.withObject("/outcome").put("errorCode", "STEP_FAILED"));
    mutations.put(
        "unbounded private reason", r -> r.withObject("/outcome").put("errorMessage", SAVED));
    for (String code :
        List.of(
            "READ_REFUSED",
            "ASSERTION_FAILED",
            "REFERENCE_REFUSED",
            "OUTCOME_UNKNOWN",
            "account_unknown")) {
      mutations.put(
          "unsupported inner " + code, r -> r.withObject("/outcome").put("errorMessage", code));
    }
    for (String field : List.of("startedAtMs", "finishedAtMs", "durationMs")) {
      mutations.put("zero " + field, r -> ((ObjectNode) r.path("steps").get(0)).put(field, 0));
      mutations.put("positive " + field, r -> ((ObjectNode) r.path("steps").get(0)).put(field, 1));
    }
    for (String status : List.of("PENDING", "RUNNING", "PASS", "FAIL")) {
      mutations.put(
          "executed step " + status,
          r -> ((ObjectNode) r.path("steps").get(0)).put("status", status));
    }
    mutations.put(
        "step failure",
        r -> ((ObjectNode) r.path("steps").get(0)).put("failure", "forged failure"));
    mutations.put(
        "duplicate coordinate", r -> ((ObjectNode) r.path("steps").get(1)).put("stepIndex", 0));
    mutations.put("out of range", r -> ((ObjectNode) r.path("steps").get(0)).put("stepIndex", 99));
    mutations.put(
        "null coordinate", r -> ((ObjectNode) r.path("steps").get(0)).putNull("stepIndex"));
    mutations.put(
        "missing coordinate",
        r -> ((com.fasterxml.jackson.databind.node.ArrayNode) r.path("steps")).remove(2));
    mutations.put(
        "reduced incomplete",
        r -> {
          r.put("payloadReduced", true);
          ((com.fasterxml.jackson.databind.node.ArrayNode) r.path("steps")).remove(2);
        });
    mutations.put(
        "extra coordinate",
        r ->
            ((com.fasterxml.jackson.databind.node.ArrayNode) r.path("steps"))
                .add(r.path("steps").get(0).deepCopy()));
    mutations.put(
        "null step",
        r ->
            ((com.fasterxml.jackson.databind.node.ArrayNode) r.path("steps"))
                .set(0, com.fasterxml.jackson.databind.node.NullNode.instance));
    mutations.put(
        "log reading",
        r ->
            r.putArray("logs")
                .addObject()
                .put("atMs", 0)
                .put("level", "info")
                .put("message", SAVED));
    mutations.put(
        "claimed foreign revision", r -> r.put("revisionId", UUID.randomUUID().toString()));
    for (var mutation : mutations.entrySet()) {
      ObjectNode invalid = baseline.deepCopy();
      mutation.getValue().accept(invalid);
      var response = callback(id, invalid, CALLBACK);
      assertThat(response.statusCode())
          .as(mutation.getKey() + ": " + response.body())
          .isIn(400, 409);
      assertThat(response.body()).doesNotContain(SAVED);
      assertThat(failureState(id)).as(mutation.getKey()).isEqualTo(before);
    }
    assertThat(callback(id, baseline, "untrusted-service").statusCode()).isIn(401, 403);
    assertThat(failureState(id)).isEqualTo(before);
    for (String field : List.of("observed_revision_binding", "observed_admission_receipt")) {
      assertThatThrownBy(
              () -> jdbc.update("UPDATE ui_test_executions SET " + field + "=NULL WHERE id=?", id))
          .hasMessageContaining("observed execution identity immutable");
    }
    ObjectNode foreign =
        ((ObjectNode) binding).deepCopy().put("revisionId", UUID.randomUUID().toString());
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE ui_test_executions SET observed_revision_binding=?::jsonb WHERE id=?",
                    foreign.toString(),
                    id))
        .hasMessageContaining("observed execution identity immutable");
    ObjectNode otherReceipt =
        ((ObjectNode) receipt).deepCopy().put("admissionId", UUID.randomUUID().toString());
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE ui_test_executions SET observed_admission_receipt=?::jsonb WHERE id=?",
                    otherReceipt.toString(),
                    id))
        .hasMessageContaining("observed execution identity immutable");
    assertThat(failureState(id)).isEqualTo(before);
    PRE_READY_NEGATIVE_CASES.set(mutations.size() + 5);
  }

  @Test
  @org.junit.jupiter.api.Order(3)
  void editedSourceKeepsHistoricalReceiptWithoutRegainingReplayReadiness() throws Exception {
    assertThat(publishedTestId).isNotNull();
    assertThat(currentPublishedReceipt).isNotNull();
    coreRole = "owner";
    int models = MODEL_WIRE.size(), submissions = RECEIPTS.size(), navigations = NAVIGATIONS.get();
    JsonNode draft =
        publicCall(
            "/api/v1/studio/tests/" + publishedTestId + "?authoringSchemaVersion=2",
            null,
            200,
            null);
    ObjectNode changed = C.object();
    for (String field :
        List.of(
            "authoringSchemaVersion",
            "globalContext",
            "steps",
            "name",
            "description",
            "csiId",
            "environment",
            "variables",
            "configuration",
            "sourceRevision",
            "configurationRevision")) {
      changed.set(field, draft.path(field).deepCopy());
    }
    ((ObjectNode) changed.path("steps").get(0)).put("text", TEXT.get(0) + " Updated source.");
    var request =
        HttpRequest.newBuilder(
                URI.create("https://localhost:" + port + "/api/v1/studio/tests/" + publishedTestId))
            .header("Cookie", "put_session=" + COOKIE)
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", UUID.randomUUID().toString())
            .PUT(HttpRequest.BodyPublishers.ofString(changed.toString()))
            .build();
    var response =
        HttpClient.newBuilder()
            .sslContext(TLS)
            .build()
            .send(request, HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
    assertThat(C.parse(response.body()).path("sourceRevision").asLong()).isEqualTo(2);
    JsonNode refused =
        publicCall(
            "/api/v1/studio/tests/" + publishedTestId + "/execute",
            C.object(),
            409,
            UUID.randomUUID().toString());
    assertThat(refused.toString()).contains("COMPILE_REQUIRED");
    coreRole = "viewer";
    JsonNode historical =
        publicCall(
            "/api/v3/studio/guided-sessions/" + currentPublishedSession + "/result",
            null,
            200,
            null);
    assertThat(historical.path("publication").path("receipt")).isEqualTo(currentPublishedReceipt);
    assertThat(historical.path("currentReadiness").path("code").asText())
        .isEqualTo("SOURCE_CHANGED");
    assertThat(historical.path("currentReadiness").path("ready").asBoolean()).isFalse();
    JsonNode finalRequest =
        C.object()
            .put("schemaVersion", 2)
            .put("expectedSourceRevision", "1")
            .put("expectedConfigurationRevision", "1");
    assertThat(
            publicCall(
                "/api/v3/studio/guided-sessions/" + currentPublishedSession + "/finalize",
                finalRequest,
                200,
                UUID.randomUUID().toString()))
        .isEqualTo(currentPublishedReceipt);
    assertThat(MODEL_WIRE).hasSize(models);
    assertThat(LEGACY_MODEL_CALLS.get()).isZero();
    assertThat(RECEIPTS).hasSize(submissions);
    assertThat(NAVIGATIONS.get()).isEqualTo(navigations);
    coreRole = "owner";
  }

  /**
   * Both revision heads come from genuine explicit learning; only activation setup is relational.
   */
  private void schedulerAndNewHead(
      UUID testId,
      String originalSession,
      JsonNode start,
      JsonNode finalize,
      JsonNode originalReceipt)
      throws Exception {
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_schedules WHERE test_id=?", Integer.class, testId))
        .isZero();
    UUID schedule = UUID.randomUUID(),
        oldRevision = UUID.fromString(originalReceipt.path("revisionId").asText());
    jdbc.update(
        "INSERT INTO"
            + " studio_schedules(id,test_id,csi_id,cron_expression,time_zone,execution_principal,created_by,updated_by)"
            + " VALUES (?,?,'CSI-123','0 * * * *"
            + " *','UTC','user-1','fixture@example.invalid','fixture@example.invalid')",
        schedule,
        testId);
    UUID activation = arrangeActivation(schedule, testId, oldRevision, 2);
    Map<String, Object> before = activationIdentity(schedule);
    coreRole = "owner";
    int priorSubmits = RECEIPTS.size(), priorCalls = MODEL_WIRE.size();
    JsonNode started =
        publicCall("/api/v3/studio/guided-sessions", start, 202, UUID.randomUUID().toString());
    String secondSession = started.path("session").path("sessionId").asText();
    assertThat(secondSession).isNotEqualTo(originalSession);
    awaitFinalizing(secondSession);
    assertThat(RECEIPTS).hasSize(priorSubmits + 1);
    assertThat(RECEIPTS.getLast()).isEqualTo(VALUES.getLast());
    int afterLearningCalls = MODEL_WIRE.size();
    assertThat(afterLearningCalls).isGreaterThan(priorCalls);
    JsonNode nextReceipt =
        publicCall(
            "/api/v3/studio/guided-sessions/" + secondSession + "/finalize",
            finalize,
            200,
            UUID.randomUUID().toString());
    assertThat(nextReceipt.path("revisionId")).isNotEqualTo(originalReceipt.path("revisionId"));
    currentPublishedSession = secondSession;
    currentPublishedReceipt = nextReceipt.deepCopy();
    assertThat(activationIdentity(schedule)).isEqualTo(before);
    assertThat(RECEIPTS).hasSize(priorSubmits + 1);
    assertThat(MODEL_WIRE).hasSize(afterLearningCalls);
    int executions =
        jdbc.queryForObject(
            "SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?", Integer.class, testId);
    scheduling.setEnabled(true);
    try {
      assertThat(scheduleProcessor.process(testId)).isEqualTo("ACTIVATION_REVISION_MISMATCH");
      assertThat(activationIdentity(schedule)).isEqualTo(before);
      assertThat(
              jdbc.queryForObject(
                  "SELECT activation_id FROM studio_schedules WHERE id=?", UUID.class, schedule))
          .isEqualTo(activation);
      UUID currentActivation =
          arrangeActivation(
              schedule, testId, UUID.fromString(nextReceipt.path("revisionId").asText()), 4);
      Map<String, Object> current = activationIdentity(schedule);
      assertThat(scheduleProcessor.process(testId)).isEqualTo("OBSERVED_SCHEDULE_AUTH_REQUIRED");
      assertThat(activationIdentity(schedule)).isEqualTo(current);
      assertThat(
              jdbc.queryForObject(
                  "SELECT activation_id FROM studio_schedules WHERE id=?", UUID.class, schedule))
          .isEqualTo(currentActivation);
    } finally {
      scheduling.setEnabled(false);
    }
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?",
                Integer.class,
                testId))
        .isEqualTo(executions);
    assertThat(dispatcher.dispatchOnce()).isZero();
    assertThat(RECEIPTS).hasSize(priorSubmits + 1);
    assertThat(MODEL_WIRE).hasSize(afterLearningCalls);
    coreRole = "viewer";
    JsonNode historic =
        publicCall(
            "/api/v3/studio/guided-sessions/" + originalSession + "/result", null, 200, null);
    assertThat(historic.path("publication").path("receipt")).isEqualTo(originalReceipt);
    assertThat(historic.path("currentReadiness").path("code").asText()).isEqualTo("HEAD_CHANGED");
    assertThat(
            publicCall(
                "/api/v3/studio/guided-sessions/" + originalSession + "/finalize",
                finalize,
                200,
                UUID.randomUUID().toString()))
        .isEqualTo(originalReceipt);
    coreRole = "none";
    publicCall("/api/v3/studio/guided-sessions/" + originalSession + "/result", null, 403, null);
    coreRole = "owner";
    ObjectNode proof =
        C.object()
            .put("separateExplicitLearningRuns", 1)
            .put("additionalLearningSubmits", 1)
            .put("finalizationSubmits", 0)
            .put("schedulerExecutions", 0)
            .put("activationMismatch", true)
            .put("unattendedAuthorityRefused", true)
            .put("historicalHeadChanged", true);
    Files.writeString(TEMP.resolve("scheduler-history-evidence.json"), proof.toPrettyString());
  }

  @Test
  @org.junit.jupiter.api.Order(4)
  void asynchronousReceiptRequiresPassiveLearningAndTwoFreshRecordedReplays() throws Exception {
    int beforeModels = MODEL_WIRE.size(),
        beforeNavigations = NAVIGATIONS.get(),
        beforeReceipts = RECEIPTS.size(),
        beforeFailures = PROVIDER_FAILURES.get();
    UUID testId = createSource(TEXT);
    Files.writeString(TEMP.resolve("account-state.json"), "{}");
    accountLifetimeMs = 30000;
    asynchronousPage = true;
    try {
      String id = startLearning(testId);
      long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
      JsonNode missingCheckpoint = null;
      while (System.nanoTime() < deadline) {
        JsonNode checkpoint =
            sessions.transaction(
                () -> {
                  var session = sessions.lock(id);
                  JsonNode progress = session.progress();
                  JsonNode marker = progress.path("translationAcquisition");
                  JsonNode active = marker.path("active");
                  boolean missing = true;
                  for (JsonNode node : progress.path("observation").path("nodes")) {
                    if (node.path("name").asText().equals("Confirmation")) {
                      missing = false;
                    }
                  }
                  for (JsonNode action : sessions.actions(id)) {
                    if (action.path("coordinate").path("stepId").asText().equals(THREE)
                        && action.path("coordinate").path("ordinal").asInt() == 0
                        && action.path("state").asText().equals("SUCCEEDED")
                        && marker.path("totalExtraPolls").asInt() > 0
                        && active.path("pending").isNull()
                        && active.path("lastGeneration").equals(progress.path("generation"))
                        && progress.path("generation").asInt() > action.path("generation").asInt()
                        && missing) {
                      return C.object()
                          .put("generation", progress.path("generation").asInt())
                          .put("extraPolls", marker.path("totalExtraPolls").asInt())
                          .put("observationHash", progress.path("observationHash").asText());
                    }
                  }
                  return null;
                });
        var receiptRelease = ASYNC_RECEIPTS.get(beforeNavigations + 1);
        if (checkpoint != null && receiptRelease != null) {
          assertThat(RECEIPTS).hasSize(beforeReceipts + 1);
          missingCheckpoint = checkpoint;
          receiptRelease.countDown();
          break;
        }
        Thread.sleep(10);
      }
      assertThat(missingCheckpoint)
          .as("real committed missing-target observation; logs %s", TEMP)
          .isNotNull();
      awaitFinalizing(id);
      JsonNode marker =
          sessions.transaction(
              () -> sessions.lock(id).progress().path("translationAcquisition").deepCopy());
      assertThat(marker.path("totalExtraPolls").asInt()).isBetween(1, 32);
      assertThat(RECEIPTS).hasSize(beforeReceipts + 1);
      assertThat(NAVIGATIONS.get()).isEqualTo(beforeNavigations + 1);
      assertThat(MODEL_KINDS.subList(beforeModels, MODEL_KINDS.size()))
          .containsExactly(
              "SOURCE_PLAN",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION");
      int learnedCalls = MODEL_WIRE.size();
      JsonNode receipt =
          publicCall(
              "/api/v3/studio/guided-sessions/" + id + "/finalize",
              C.object()
                  .put("schemaVersion", 2)
                  .put("expectedSourceRevision", "1")
                  .put("expectedConfigurationRevision", "1"),
              200,
              UUID.randomUUID().toString());
      assertThat(RECEIPTS).hasSize(beforeReceipts + 1);
      assertThat(NAVIGATIONS.get()).isEqualTo(beforeNavigations + 1);
      assertThat(MODEL_WIRE).hasSize(learnedCalls);
      UUID revision = UUID.fromString(receipt.path("revisionId").asText());
      String artifact =
          jdbc.queryForObject(
              "SELECT artifact::text FROM ui_test_revisions WHERE id=?", String.class, revision);
      String artifactHash =
          jdbc.queryForObject(
              "SELECT artifact_hash FROM ui_test_revisions WHERE id=?", String.class, revision);
      for (int run = 0; run < 2; run++) {
        int beforeAbsent = java.util.Collections.frequency(PASSIVE_REPLAY, "ABSENT");
        JsonNode accepted =
            publicCall(
                "/api/v1/studio/tests/" + testId + "/execute",
                C.object(),
                202,
                UUID.randomUUID().toString());
        UUID execution = UUID.fromString(accepted.path("executionId").asText());
        assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
        long end = System.nanoTime() + Duration.ofSeconds(45).toNanos();
        JsonNode snapshot = null;
        do {
          snapshot = publicCall("/api/v1/studio/executions/" + execution, null, 200, null);
          if (snapshot.path("streamComplete").asBoolean()) {
            break;
          }
          Thread.sleep(30);
        } while (System.nanoTime() < end);
        assertThat(snapshot.path("status").asText())
            .as("async replay logs %s", TEMP)
            .isEqualTo("PASSED");
        assertThat(snapshot.path("video").path("status").asText()).isEqualTo("AVAILABLE");
        assertThat(java.util.Collections.frequency(PASSIVE_REPLAY, "ABSENT"))
            .isGreaterThan(beforeAbsent);
        assertThat(
                jdbc.queryForObject(
                    "SELECT artifact::text FROM ui_test_revisions WHERE id=?",
                    String.class,
                    revision))
            .isEqualTo(artifact);
        assertThat(
                jdbc.queryForObject(
                    "SELECT artifact_hash FROM ui_test_revisions WHERE id=?",
                    String.class,
                    revision))
            .isEqualTo(artifactHash);
      }
      assertThat(REPLAY_INVOCATIONS)
          .containsExactly("read", "fill", "click", "assert", "read", "fill", "click", "assert");
      assertThat(NAVIGATIONS.get()).isEqualTo(beforeNavigations + 3);
      assertThat(RECEIPTS.subList(beforeReceipts, RECEIPTS.size()))
          .containsExactlyElementsOf(VALUES.subList(beforeNavigations, VALUES.size()));
      assertThat(VALUES.subList(beforeNavigations, VALUES.size())).doesNotHaveDuplicates();
      assertThat(MODEL_WIRE).hasSize(learnedCalls);
      assertThat(LEGACY_MODEL_CALLS.get()).isZero();
      assertThat(PROVIDER_FAILURES.get()).isEqualTo(beforeFailures);
      ObjectNode metrics =
          C.object()
              .put("learningSubmits", 1)
              .put("finalizationEffects", 0)
              .put("freshReplays", 2)
              .put("sourcePlanCalls", 1)
              .put("nextActionCalls", 5)
              .put("verifyStepCalls", 0)
              .put("replayModelCalls", 0)
              .put("artifactHash", artifactHash);
      metrics.set("committedMissingCheckpoint", missingCheckpoint);
      metrics.set("passiveLearning", marker);
      metrics.set("passiveReplayStates", JSON.valueToTree(PASSIVE_REPLAY));
      metrics.set("nativeInvocations", JSON.valueToTree(REPLAY_INVOCATIONS));
      Files.writeString(TEMP.resolve("async-evidence.json"), metrics.toPrettyString());
    } finally {
      asynchronousPage = false;
      ASYNC_RECEIPTS.values().forEach(java.util.concurrent.CountDownLatch::countDown);
    }
  }

  @Test
  @org.junit.jupiter.api.Order(5)
  void modelAndSourceQuestionTimeDoNotConsumePassiveBrowserAllowance() throws Exception {
    int models = MODEL_WIRE.size(), navigations = NAVIGATIONS.get(), receipts = RECEIPTS.size();
    timingSourceText =
        "Open " + URL + " or " + URL + "?alternative=two and read the Order reference.";
    UUID testId = createSource(List.of(timingSourceText, TEXT.get(1), TEXT.get(2)), 1);
    askTimingSource = true;
    delayTimingModel = true;
    try {
      String id = startLearning(testId);
      long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
      String state = "";
      while (System.nanoTime() < deadline) {
        state = sessions.transaction(() -> sessions.lock(id).document().path("state").asText());
        if (state.equals("AWAITING_CLARIFICATION")) {
          break;
        }
        Thread.sleep(20);
      }
      assertThat(state).isEqualTo("AWAITING_CLARIFICATION");
      JsonNode question =
          publicCall("/api/v3/studio/guided-sessions/" + id + "/clarification", null, 200, null);
      assertThat(question.path("phase").asText()).isEqualTo("source");
      String selected = null;
      for (JsonNode choice : question.path("choices")) {
        if (choice
            .path("safeLabel")
            .asText()
            .equals("Use authored text: " + URL + "?alternative=two")) {
          selected = choice.path("choiceId").asText();
        }
      }
      assertThat(selected).isNotBlank();
      Thread.sleep(1250);
      JsonNode beforeAnswer =
          sessions.transaction(
              () -> sessions.lock(id).progress().path("translationAcquisition").deepCopy());
      assertThat(beforeAnswer.path("allowanceMs").asLong()).isEqualTo(1000);
      assertThat(beforeAnswer.path("totalExtraPolls").asInt()).isZero();
      publicCall(
          "/api/v3/studio/guided-sessions/" + id + "/clarify",
          C.object()
              .put("schemaVersion", 2)
              .put("clarificationId", question.path("clarificationId").asText())
              .put("generation", 0)
              .put("choiceId", selected),
          202,
          UUID.randomUUID().toString());
      awaitFinalizing(id);
      JsonNode marker =
          sessions.transaction(
              () -> sessions.lock(id).progress().path("translationAcquisition").deepCopy());
      assertThat(marker.path("allowanceMs").asLong()).isEqualTo(1000);
      assertThat(marker.path("totalExtraPolls").asInt()).isZero();
      assertThat(marker.path("active").path("usedMs").asLong()).isZero();
      assertThat(delayTimingModel).isFalse();
      assertThat(NAVIGATION_PATHS.subList(navigations, NAVIGATION_PATHS.size()))
          .containsExactly("/flow?alternative=two");
      assertThat(RECEIPTS).hasSize(receipts + 1);
      assertThat(RECEIPTS.getLast()).isEqualTo(VALUES.getLast());
      assertThat(MODEL_KINDS.subList(models, MODEL_KINDS.size()))
          .containsExactly(
              "SOURCE_PLAN",
              "SOURCE_PLAN",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION");
      int calls = MODEL_WIRE.size();
      publicCall(
          "/api/v3/studio/guided-sessions/" + id + "/finalize",
          C.object()
              .put("schemaVersion", 2)
              .put("expectedSourceRevision", "1")
              .put("expectedConfigurationRevision", "1"),
          200,
          UUID.randomUUID().toString());
      assertThat(MODEL_WIRE).hasSize(calls);
      assertThat(RECEIPTS).hasSize(receipts + 1);
      assertThat(NAVIGATIONS.get()).isEqualTo(navigations + 1);
      Files.writeString(
          TEMP.resolve("source-question-timing-evidence.json"),
          C.object()
              .put("humanDelayMs", 1250)
              .put("modelDelayMs", 1250)
              .put("sourceStepTimeoutMs", 1000)
              .put("passiveExtraPolls", 0)
              .put("usedPassiveMs", 0)
              .put("sourcePlanCalls", 2)
              .put("nextActionCalls", 5)
              .put("finalizationEffects", 0)
              .put("sourceChoice", "alternative=two")
              .toPrettyString());
    } finally {
      askTimingSource = false;
      delayTimingModel = false;
    }
  }

  @Test
  @org.junit.jupiter.api.Order(6)
  void absentTargetStopsOnAllowanceOrCancellationWithoutRepeatingSubmittedWork() throws Exception {
    for (boolean cancel : List.of(false, true)) {
      int navigations = NAVIGATIONS.get(), receipts = RECEIPTS.size(), calls = MODEL_WIRE.size();
      UUID test = createSource(TEXT, cancel ? 30 : 1);
      asynchronousPage = true;
      try {
        String id = startLearning(test);
        long until = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        JsonNode checkpoint = null;
        while (System.nanoTime() < until) {
          var current = sessions.transaction(() -> sessions.lock(id));
          JsonNode marker = current.progress().path("translationAcquisition");
          if (marker.path("totalExtraPolls").asInt() > 0
              && ASYNC_RECEIPTS.containsKey(navigations + 1)) {
            checkpoint = marker.deepCopy();
            break;
          }
          Thread.sleep(10);
        }
        assertThat(checkpoint).as("real passive wait before stopping; logs %s", TEMP).isNotNull();
        if (cancel) {
          publicCall(
              "/api/v3/studio/guided-sessions/" + id + "/cancel",
              C.object().put("schemaVersion", 2).put("reason", "userRequested"),
              202,
              UUID.randomUUID().toString());
        }
        String expected = cancel ? "CANCELLED" : "FAILED";
        until = System.nanoTime() + Duration.ofSeconds(10).toNanos();
        String state = "";
        while (System.nanoTime() < until) {
          state = sessions.transaction(() -> sessions.lock(id).document().path("state").asText());
          if (state.equals(expected)) {
            break;
          }
          Thread.sleep(20);
        }
        assertThat(state).as("delayed terminal; logs %s", TEMP).isEqualTo(expected);
        var stopped = sessions.transaction(() -> sessions.lock(id));
        if (!cancel) {
          assertThat(stopped.progress().path("errorCode").asText()).isEqualTo("BUDGET_EXCEEDED");
          assertThat(
                  stopped
                      .progress()
                      .path("translationAcquisition")
                      .path("active")
                      .path("usedMs")
                      .asLong())
              .isEqualTo(1000);
        }
        var actions = sessions.transaction(() -> sessions.actions(id));
        assertThat(actions).hasSize(4);
        assertThat(actions).allMatch(a -> a.path("state").asText().equals("SUCCEEDED"));
        assertThat(MODEL_KINDS.subList(calls, MODEL_KINDS.size()))
            .containsExactly(
                "SOURCE_PLAN", "NEXT_ACTION", "NEXT_ACTION", "NEXT_ACTION", "NEXT_ACTION");
        assertThat(RECEIPTS).hasSize(receipts + 1);
        assertThat(NAVIGATIONS.get()).isEqualTo(navigations + 1);
        int stoppedCalls = MODEL_WIRE.size();
        ASYNC_RECEIPTS.get(navigations + 1).countDown();
        // The real application response may now arrive, but stopped authority cannot continue.
        Thread.sleep(350);
        List<ObjectNode> lateActions = sessions.transaction(() -> sessions.actions(id));
        assertThat(lateActions).isEqualTo(actions);
        String lateState =
            sessions.transaction(() -> sessions.lock(id).document().path("state").asText());
        assertThat(lateState).isEqualTo(expected);
        assertThat(MODEL_WIRE).hasSize(stoppedCalls);
        assertThat(RECEIPTS).hasSize(receipts + 1);
        assertThat(NAVIGATIONS.get()).isEqualTo(navigations + 1);
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM ui_test_revisions WHERE test_id=?", Integer.class, test))
            .isZero();
      } finally {
        asynchronousPage = false;
        ASYNC_RECEIPTS.values().forEach(java.util.concurrent.CountDownLatch::countDown);
      }
    }
  }

  @Test
  @org.junit.jupiter.api.Order(7)
  void observedAlternateChoiceSurvivesHumanAndModelDelayAndTwoFreshRecordedReplays()
      throws Exception {
    int models = MODEL_WIRE.size(), navigations = NAVIGATIONS.get(), receipts = RECEIPTS.size();
    int choiceReceipts = CHOICE_RECEIPTS.size(), invocations = REPLAY_INVOCATIONS.size();
    int providerFailures = PROVIDER_FAILURES.get();
    UUID testId = createSource(TEXT, 1);
    observedChoicePage = true;
    askObservedChoice = true;
    try {
      String id = startLearning(testId);
      awaitState(id, "AWAITING_CLARIFICATION");
      JsonNode question =
          publicCall("/api/v3/studio/guided-sessions/" + id + "/clarification", null, 200, null);
      assertThat(question.path("phase").asText()).isEqualTo("observed");
      JsonNode selected = null;
      for (JsonNode choice : question.path("choices")) {
        if (choice.path("safeLabel").asText().equals("Alternate destination")) {
          selected = choice;
        }
      }
      assertThat(selected).isNotNull();
      JsonNode identity =
          C.parse(
              jdbc.queryForObject(
                  "SELECT identity::text FROM studio_guided_clarification_contexts WHERE"
                      + " session_id=? AND clarification_id=?",
                  String.class,
                  id,
                  question.path("clarificationId").asText()));
      JsonNode capture = identity.path("questionCapture");
      JsonNode originalObservation =
          C.parse(
              jdbc.queryForObject(
                  "SELECT observation::text FROM studio_guided_publication_observations WHERE"
                      + " session_id=? AND observation_hash=?",
                  String.class,
                  id,
                  capture.path("observationHash").asText()));
      assertThat(GuidedContracts.hash(originalObservation))
          .isEqualTo(capture.path("observationHash").asText());
      assertThat(originalObservation.path("generation")).isEqualTo(question.path("generation"));
      assertThat(RECEIPTS).hasSize(receipts);
      Thread.sleep(1250);
      publicCall(
          "/api/v3/studio/guided-sessions/" + id + "/clarify",
          C.object()
              .put("schemaVersion", 2)
              .put("clarificationId", question.path("clarificationId").asText())
              .put("generation", question.path("generation").asInt())
              .put("choiceId", selected.path("choiceId").asText()),
          202,
          UUID.randomUUID().toString());
      awaitFinalizing(id);
      JsonNode marker =
          sessions.transaction(
              () -> sessions.lock(id).progress().path("translationAcquisition").deepCopy());
      assertThat(marker.path("allowanceMs").asLong()).isEqualTo(1000);
      assertThat(marker.path("totalExtraPolls").asInt()).isZero();
      assertThat(marker.path("active").path("usedMs").asLong()).isZero();
      var proofRows =
          jdbc.queryForList(
              "SELECT observed_choice_receipt::text AS receipt,proposal::text AS proposal FROM"
                  + " studio_guided_publication_preparations WHERE session_id=? AND"
                  + " observed_choice_receipt IS NOT NULL",
              id);
      assertThat(proofRows).hasSize(1);
      JsonNode witnessReceipt = C.parse((String) proofRows.getFirst().get("receipt"));
      JsonNode exercised = C.parse((String) proofRows.getFirst().get("proposal"));
      assertThat(witnessReceipt.path("acceptedChoiceId")).isEqualTo(selected.path("choiceId"));
      assertThat(witnessReceipt.path("answer").path("nodeId")).isEqualTo(selected.path("nodeId"));
      assertThat(exercised.path("target").path("nodeId")).isNotEqualTo(selected.path("nodeId"));
      assertThat(exercised.path("generation").asInt())
          .isGreaterThan(question.path("generation").asInt());
      assertThat(exercised.path("target").path("locator").path("name").asText())
          .isEqualTo("Alternate destination");
      JsonNode currentPlan = sessions.transaction(() -> plans.state(id).path("plan").deepCopy());
      assertThat(
              GuidedPlanBuilder.unique(
                      currentPlan.path("obligations"),
                      "obligationId",
                      witnessReceipt.path("obligationId").asText())
                  .path("targetIntent")
                  .asText())
          .isEqualTo("Destination");
      assertThat(CHOICE_RECEIPTS).hasSize(choiceReceipts + 1);
      assertThat(CHOICE_RECEIPTS.getLast().path("chosen").asText()).isEqualTo(VALUES.getLast());
      assertThat(CHOICE_RECEIPTS.getLast().path("unchosen").asText()).isEmpty();
      assertThat(MODEL_KINDS.subList(models, MODEL_KINDS.size()))
          .containsExactly(
              "SOURCE_PLAN",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION",
              "NEXT_ACTION");
      int calls = MODEL_WIRE.size();
      JsonNode published =
          publicCall(
              "/api/v3/studio/guided-sessions/" + id + "/finalize",
              C.object()
                  .put("schemaVersion", 2)
                  .put("expectedSourceRevision", "1")
                  .put("expectedConfigurationRevision", "1"),
              200,
              UUID.randomUUID().toString());
      assertThat(MODEL_WIRE).hasSize(calls);
      assertThat(RECEIPTS).hasSize(receipts + 1);
      assertThat(NAVIGATIONS.get()).isEqualTo(navigations + 1);
      UUID revision = UUID.fromString(published.path("revisionId").asText());
      String artifact =
          jdbc.queryForObject(
              "SELECT artifact::text FROM ui_test_revisions WHERE id=?", String.class, revision);
      String artifactHash =
          jdbc.queryForObject(
              "SELECT artifact_hash FROM ui_test_revisions WHERE id=?", String.class, revision);
      for (int run = 0; run < 2; run++) {
        JsonNode accepted =
            publicCall(
                "/api/v1/studio/tests/" + testId + "/execute",
                C.object(),
                202,
                UUID.randomUUID().toString());
        UUID execution = UUID.fromString(accepted.path("executionId").asText());
        assertThat(dispatcher.dispatchOnce()).isEqualTo(1);
        long end = System.nanoTime() + Duration.ofSeconds(45).toNanos();
        JsonNode snapshot;
        do {
          snapshot = publicCall("/api/v1/studio/executions/" + execution, null, 200, null);
          if (snapshot.path("streamComplete").asBoolean()) {
            break;
          }
          Thread.sleep(30);
        } while (System.nanoTime() < end);
        assertThat(snapshot.path("status").asText())
            .as("observed choice logs %s", TEMP)
            .isEqualTo("PASSED");
        assertThat(snapshot.path("video").path("status").asText()).isEqualTo("AVAILABLE");
        assertThat(
                jdbc.queryForObject(
                    "SELECT artifact::text FROM ui_test_revisions WHERE id=?",
                    String.class,
                    revision))
            .isEqualTo(artifact);
        assertThat(
                jdbc.queryForObject(
                    "SELECT artifact_hash FROM ui_test_revisions WHERE id=?",
                    String.class,
                    revision))
            .isEqualTo(artifactHash);
      }
      assertThat(REPLAY_INVOCATIONS.subList(invocations, REPLAY_INVOCATIONS.size()))
          .containsExactly("read", "fill", "click", "assert", "read", "fill", "click", "assert");
      assertThat(NAVIGATIONS.get()).isEqualTo(navigations + 3);
      assertThat(RECEIPTS).hasSize(receipts + 3);
      assertThat(CHOICE_RECEIPTS).hasSize(choiceReceipts + 3);
      for (int i = 0; i < 3; i++) {
        assertThat(CHOICE_RECEIPTS.get(choiceReceipts + i).path("chosen").asText())
            .isEqualTo(VALUES.get(navigations + i));
        assertThat(CHOICE_RECEIPTS.get(choiceReceipts + i).path("unchosen").asText()).isEmpty();
      }
      assertThat(VALUES.subList(navigations, VALUES.size())).doesNotHaveDuplicates();
      assertThat(MODEL_WIRE).hasSize(calls);
      assertThat(LEGACY_MODEL_CALLS.get()).isZero();
      assertThat(PROVIDER_FAILURES.get()).isEqualTo(providerFailures);
      ObjectNode metrics =
          C.object()
              .put("humanDelayMs", 1250)
              .put("modelDelayMs", 1250)
              .put("sourceStepTimeoutMs", 1000)
              .put("learningSubmits", 1)
              .put("finalizationEffects", 0)
              .put("freshRecordedReplays", 2)
              .put("replayModelCalls", 0)
              .put("bindingReadRetries", 0)
              .put("artifactHash", artifactHash);
      metrics.set("originalQuestionCapture", capture);
      metrics.set("preparationReceipt", witnessReceipt);
      metrics.set(
          "chosenAndUnchosenReceipts",
          JSON.valueToTree(CHOICE_RECEIPTS.subList(choiceReceipts, CHOICE_RECEIPTS.size())));
      metrics.set(
          "nativeInvocations",
          JSON.valueToTree(REPLAY_INVOCATIONS.subList(invocations, REPLAY_INVOCATIONS.size())));
      Files.writeString(TEMP.resolve("observed-choice-evidence.json"), metrics.toPrettyString());
    } finally {
      observedChoicePage = false;
      askObservedChoice = false;
      beforeObservedQuestion = null;
    }
  }

  @Test
  @org.junit.jupiter.api.Order(8)
  void originalQuestionDriftAndSqlCaptureRefusalRollbackAndCommitUsageWithoutAnotherCall()
      throws Exception {
    observedChoicePage = true;
    try {
      for (String mode : List.of("observation-body-drift", "sql-capture")) {
        int calls = MODEL_WIRE.size(), receipts = RECEIPTS.size();
        askObservedChoice = true;
        if (mode.equals("observation-body-drift")) {
          beforeObservedQuestion =
              context ->
                  sessions.transaction(
                      () -> {
                        var current = sessions.lock(context.path("sessionId").asText());
                        // Preserve the reserved attempt identity so this reaches actual question
                        // capture. The acknowledged hash must reject a changed sanitized body.
                        current
                            .progress()
                            .withObject("/observation")
                            .put("scopeHash", "0".repeat(64));
                        sessions.save(current);
                        return null;
                      });
        } else {
          beforeObservedQuestion = null;
          jdbc.execute(
              "CREATE FUNCTION fixture_reject_question_capture() RETURNS trigger LANGUAGE plpgsql"
                  + " AS $$ BEGIN IF EXISTS(SELECT 1 FROM studio_guided_clarification_contexts"
                  + " WHERE session_id=NEW.session_id) THEN RAISE EXCEPTION 'injected original"
                  + " question capture failure'; END IF; RETURN NEW; END $$");
          jdbc.execute(
              "CREATE TRIGGER fixture_reject_question_capture BEFORE INSERT ON"
                  + " studio_guided_publication_observations FOR EACH ROW EXECUTE FUNCTION"
                  + " fixture_reject_question_capture()");
        }
        String id = startLearning(createSource(TEXT));
        try {
          awaitState(id, "FAILED");
          JsonNode result =
              publicCall("/api/v3/studio/guided-sessions/" + id + "/result", null, 200, null);
          assertThat(result.path("errorCode").asText()).isEqualTo("INVALID_CONTRACT");
          assertThat(MODEL_WIRE).hasSize(calls + 4);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND"
                          + " status='REJECTED' AND safe_result IS NULL AND input_tokens=20 AND"
                          + " output_tokens=40",
                      Integer.class,
                      id))
              .isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_clarification_contexts WHERE"
                          + " session_id=?",
                      Integer.class,
                      id))
              .isZero();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_publication_preparations WHERE"
                          + " session_id=? AND observed_choice_receipt IS NOT NULL",
                      Integer.class,
                      id))
              .isZero();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_publication_observations WHERE"
                          + " session_id=?",
                      Integer.class,
                      id))
              .isEqualTo(1);
          assertThat(
                  jdbc.queryForObject(
                      "SELECT count(*) FROM studio_guided_publications WHERE session_id=?",
                      Integer.class,
                      id))
              .isZero();
          JsonNode counters =
              sessions.transaction(() -> sessions.lock(id).document().path("counters").deepCopy());
          assertThat(counters.path("modelProposals").asInt()).isEqualTo(4);
          assertThat(counters.path("modelInputTokens").asLong()).isPositive();
          assertThat(counters.path("modelOutputTokens").asLong()).isPositive();
          Thread.sleep(1100);
          assertThat(MODEL_WIRE).hasSize(calls + 4);
          assertThat(RECEIPTS).hasSize(receipts);
          assertThat(LEGACY_MODEL_CALLS.get()).isZero();
          ObjectNode metrics =
              C.object()
                  .put("mode", mode)
                  .put("modelCalls", 4)
                  .put("rejectedAttemptInputTokens", 20)
                  .put("rejectedAttemptOutputTokens", 40)
                  .put("rolledBackContexts", 0)
                  .put("rolledBackQuestionObservations", 0)
                  .put("publishedRows", 0)
                  .put("laterGatewayCalls", 0)
                  .put("publicErrorCode", "INVALID_CONTRACT");
          metrics.set("committedCounters", counters);
          Files.writeString(
              TEMP.resolve("question-refusal-" + mode + ".json"), metrics.toPrettyString());
        } finally {
          beforeObservedQuestion = null;
          if (mode.equals("sql-capture")) {
            jdbc.execute(
                "DROP TRIGGER fixture_reject_question_capture ON"
                    + " studio_guided_publication_observations");
            jdbc.execute("DROP FUNCTION fixture_reject_question_capture()");
          }
        }
      }
    } finally {
      observedChoicePage = false;
      askObservedChoice = false;
      beforeObservedQuestion = null;
    }
  }

  private void awaitState(String id, String expected) throws Exception {
    long end = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (System.nanoTime() < end) {
      String state =
          sessions.transaction(() -> sessions.lock(id).document().path("state").asText());
      if (state.equals(expected)) {
        return;
      }
      if (List.of("FAILED", "EXPIRED", "UNKNOWN_OUTCOME", "CANCELLED").contains(state)) {
        throw new AssertionError("Expected " + expected + " but got " + state + "; logs " + TEMP);
      }
      Thread.sleep(20);
    }
    throw new AssertionError("Expected " + expected + "; logs " + TEMP);
  }

  private HttpResponse<String> observedAdmissionHttp(String execution, String body)
      throws Exception {
    HttpRequest request =
        HttpRequest.newBuilder(
                URI.create(
                    "https://localhost:"
                        + port
                        + "/internal/studio/executions/"
                        + execution
                        + "/observed-admission"))
            .header("Authorization", "Bearer " + CALLBACK)
            .header("Content-Type", "application/json")
            .POST(
                body == null
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(body))
            .build();
    return HttpClient.newBuilder()
        .sslContext(TLS)
        .build()
        .send(request, HttpResponse.BodyHandlers.ofString());
  }

  private UUID createSource(List<String> texts) throws Exception {
    return createSource(texts, 30);
  }

  private UUID createSource(List<String> texts, int timeoutSeconds) throws Exception {
    UUID id = UUID.randomUUID();
    var authoring =
        new AuthoringV2Request(
            2,
            null,
            List.of(
                new AuthoringStep(UUID.fromString(ONE), texts.get(0), null),
                new AuthoringStep(UUID.fromString(TWO), texts.get(1), null),
                new AuthoringStep(UUID.fromString(THREE), texts.get(2), null)));
    jdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,authoring,"
            + "authoring_revision_inputs,timeout_seconds,created_by,created_at,updated_at) VALUES"
            + " (?,'Delayed observed','CSI-123','fixture','chromium',?::jsonb,'[]'::jsonb,?::jsonb,"
            + "?::jsonb,?,'fixture@example.invalid',now(),now())",
        id,
        JSON.writeValueAsString(texts),
        JSON.writeValueAsString(authoring),
        JSON.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())),
        timeoutSeconds);
    return id;
  }

  private String startLearning(UUID id) throws Exception {
    ObjectNode start =
        C.object()
            .put("schemaVersion", 2)
            .put("testId", id.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", "fixture")
            .put("applicationId", "orders")
            .put("accountRef", "account-1");
    start.set("versions", versions());
    return publicCall("/api/v3/studio/guided-sessions", start, 202, UUID.randomUUID().toString())
        .path("session")
        .path("sessionId")
        .asText();
  }

  private void awaitFinalizing(String id) throws Exception {
    long end = System.nanoTime() + Duration.ofSeconds(90).toNanos();
    while (System.nanoTime() < end) {
      String state =
          sessions.transaction(() -> sessions.lock(id).document().path("state").asText());
      if (List.of("FINALIZING", "FAILED", "EXPIRED", "UNKNOWN_OUTCOME", "CANCELLED")
          .contains(state)) {
        assertThat(state).as("second explicit learning; logs %s", TEMP).isEqualTo("FINALIZING");
        return;
      }
      Thread.sleep(50);
    }
    throw new AssertionError("Second explicit learning did not finalize; logs " + TEMP);
  }

  private UUID arrangeActivation(UUID schedule, UUID testId, UUID revision, long version) {
    UUID activation = UUID.randomUUID();
    Instant due =
        Instant.now()
            .truncatedTo(java.time.temporal.ChronoUnit.MINUTES)
            .minusSeconds(version == 2 ? 60 : 30);
    sessions.transaction(
        () -> {
          jdbc.update(
              "INSERT INTO studio_schedule_activations(id, schedule_id, test_id, csi_id,"
                  + " schedule_version, revision_id, environment, execution_principal,"
                  + " activated_by) VALUES"
                  + " (?,?,?,'CSI-123',?,?,'fixture','user-1','fixture@example.invalid')",
              activation,
              schedule,
              testId,
              version,
              revision);
          if (version == 4) {
            jdbc.update(
                "UPDATE studio_schedules SET cron_expression='30 * * * * *' WHERE id=?", schedule);
          }
          jdbc.update(
              "UPDATE studio_schedules SET version=?, state='ENABLED', requested_enabled=true,"
                  + " blocked_code=NULL, activated_revision_id=?, activation_id=?, next_due_at=?,"
                  + " poll_after_at=? WHERE id=?",
              version,
              revision,
              activation,
              java.sql.Timestamp.from(due),
              java.sql.Timestamp.from(due),
              schedule);
          return null;
        });
    return activation;
  }

  private Map<String, Object> activationIdentity(UUID schedule) {
    return jdbc.queryForMap(
        "SELECT a.* FROM studio_schedule_activations a JOIN studio_schedules s ON"
            + " s.activation_id=a.id WHERE s.id=?",
        schedule);
  }

  private void historicalReplica(
      String id, JsonNode receipt, boolean replay, boolean support, String readinessCode)
      throws Exception {
    Map<String, Object> settings = new java.util.LinkedHashMap<>();
    settings.put("spring.datasource.driver-class-name", "org.postgresql.Driver");
    settings.put("spring.datasource.url", DB.getJdbcUrl());
    settings.put("spring.datasource.username", DB.getUsername());
    settings.put("spring.datasource.password", DB.getPassword());
    settings.put("server.port", "0");
    settings.put("server.ssl.enabled", "false");
    settings.put("spring.jmx.enabled", "false");
    settings.put("spring.main.banner-mode", "off");
    settings.put("logging.level.root", "WARN");
    settings.put("checks.core-service.base-url", ORIGIN);
    settings.put("studio.guided-authoring.enabled", "true");
    settings.put(
        "studio.guided-authoring.service-public-key",
        Base64.getEncoder().encodeToString(ISSUER.getPublic().getEncoded()));
    settings.put("studio.guided-authoring.translation.enabled", "false");
    settings.put("studio.guided.publication.enabled", "false");
    settings.put("studio.observed-replay.enabled", replay);
    settings.put(
        "studio.observed-replay.catalog-json",
        support ? C.object().putArray("catalog").add(CATALOG).toString() : "[]");
    settings.put(
        "studio.observed-replay.policies-json",
        C.object().putArray("policies").add(POLICY).toString());
    settings.put("studio.compile.gateway.provider", "disabled");
    settings.put("studio.compile.gateway.model", "benign-new-learning-default");
    settings.put("studio.execution.dispatcher.enabled", "false");
    try (var replica =
        new org.springframework.boot.builder.SpringApplicationBuilder(ChecksApplication.class)
            .profiles("test")
            .initializers(
                context ->
                    context
                        .getEnvironment()
                        .getPropertySources()
                        .addFirst(
                            new org.springframework.core.env.MapPropertySource(
                                "observed-history-fixture", settings)))
            .run("--spring.profiles.active=test", "--checks.local-dev-auth.enabled=false")) {
      assertThat(replica.getEnvironment().getActiveProfiles()).containsExactly("test");
      int localPort =
          ((org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext)
                  replica)
              .getWebServer()
              .getPort();
      var request =
          HttpRequest.newBuilder(
                  URI.create(
                      "http://localhost:"
                          + localPort
                          + "/api/v3/studio/guided-sessions/"
                          + id
                          + "/result"))
              .header("Cookie", "put_session=" + COOKIE)
              .GET()
              .build();
      int before = CORE_CALLS.get();
      var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
      assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
      assertThat(CORE_CALLS.get()).isGreaterThan(before);
      JsonNode result = C.parse(response.body());
      assertThat(result.path("publication").path("receipt")).isEqualTo(receipt);
      assertThat(result.path("currentReadiness").path("code").asText()).isEqualTo(readinessCode);
      assertThat(result.path("learnedFromThisRun").asBoolean()).isTrue();
      assertThat(result.path("replayVerified").asBoolean()).isFalse();
      assertThat(result.path("evidence").path("video").isNull()).isTrue();
    }
  }

  private void startWorkers() throws Exception {
    Files.writeString(
        TEMP.resolve("worker.jwt"), token("owning-worker", "worker-1", "studio-guided-controller"));
    ObjectNode config =
        C.object()
            .put("workerId", "worker-1")
            .put("host", "127.0.0.1")
            .put("port", GUIDED_PORT)
            .put("journalDirectory", TEMP.resolve("journal").toString())
            .put("tlsKeyFile", TEMP.resolve("tls.key").toString())
            .put("tlsCertFile", TEMP.resolve("tls.crt").toString())
            .put("tlsCaFile", TEMP.resolve("tls.crt").toString())
            .put("controllerIssuer", "fixture-issuer")
            .put("controllerSubject", "controller-1")
            .put("controllerPublicKeyFile", TEMP.resolve("issuer.pub").toString())
            .put("controllerCertificateFingerprint256", FINGERPRINT)
            .put("callbackBaseUrl", "https://localhost:" + port)
            .put("callbackTokenFile", TEMP.resolve("worker.jwt").toString());
    config.putArray("rules");
    config.set("applicationPolicy", POLICY.path("applicationPolicy"));
    Files.writeString(TEMP.resolve("worker.json"), config.toString());
    var guided =
        new ProcessBuilder(
            "node",
            Path.of("../studio-runner/dist/run/guidedMain.js")
                .toAbsolutePath()
                .normalize()
                .toString());
    guided.environment().put("STUDIO_GUIDED_CONFIG_FILE", TEMP.resolve("worker.json").toString());
    guided.redirectErrorStream(true).redirectOutput(TEMP.resolve("guided.log").toFile());
    guidedWorker = guided.start();
    String root = Path.of("../studio-runner/dist").toAbsolutePath().normalize().toUri().toString();
    String browsers =
        System.getenv()
            .getOrDefault(
                "PLAYWRIGHT_BROWSERS_PATH",
                Path.of(System.getProperty("user.home"), "Library", "Caches", "ms-playwright")
                    .toString());
    ObjectNode startup =
        C.object()
            .put("STUDIO_RUNNER_OBSERVED_CATALOG_FILE", TEMP.resolve("catalog.json").toString())
            .put("STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST", "c".repeat(64))
            .put("PLAYWRIGHT_BROWSERS_PATH", browsers);
    Files.writeString(TEMP.resolve("account-state.json"), "{\"fail\":false}");
    String account =
        "const provider={async consume(){return {capability:{}}},async prepare(x){return x},async"
            + " apply(x,context,signal){const fs=await import('node:fs');const"
            + " state=()=>JSON.parse(fs.readFileSync("
            + JSON.writeValueAsString(TEMP.resolve("account-state.json").toString())
            + ", 'utf8'));fs.writeFileSync("
            + JSON.writeValueAsString(TEMP.resolve("account-apply-entered").toString())
            + ",'entered');while(state().pause){if(signal.aborted)throw new"
            + " Error('cancelled');await new Promise(r=>setTimeout(r,20));}if(state().fail)throw"
            + " new Error("
            + JSON.writeValueAsString(SAVED)
            + ");return x},async dispose(){}};";
    Path child = TEMP.resolve("account-child.mjs");
    Files.writeString(
        child,
        "import {startChild} from '"
            + root
            + "run/child.js';import {loadObservedBuild} from '"
            + root
            + "compat/runtime-versions.js';import {playwrightBrowserFactory} from '"
            + root
            + "run/browser.js';"
            + "const launch=playwrightBrowserFactory.launch.bind(playwrightBrowserFactory);"
            + "playwrightBrowserFactory.launch=async request=>{const handle=await launch(request);"
            + "const create=handle.createObservationSession.bind(handle);"
            + "handle.createObservationSession=config=>{const session=create(config),"
            + "acquire=session.acquire.bind(session),invoke=session.invoke.bind(session);"
            + "session.acquire=async request=>{const result=await acquire(request);"
            + "if(request.locator.kind==='role'&&request.locator.name==='Confirmation')"
            + "await fetch('"
            + ORIGIN
            + "/acquisition',{method:'POST',body:result.kind});return result;};"
            + "session.invoke=async (...args)=>{const result=await invoke(...args);"
            + "await fetch('"
            + ORIGIN
            + "/invocation',{method:'POST',body:args[0].operation.kind});"
            + "return result;};return session;};return handle;};"
            + account
            + "startChild(process,{observedBuild:loadObservedBuild("
            + startup
            + "),observedAccounts:new Map([['fixture',provider]])});");
    ObjectNode env =
        C.object()
            .put("STUDIO_RUNNER_PORT", Integer.toString(NORMAL_PORT))
            .put("STUDIO_RUNNER_HOST", "127.0.0.1")
            .put("STUDIO_RUNNER_SERVICE_IDENTITY", SERVICE)
            .put("STUDIO_RUNNER_CALLBACK_IDENTITY", CALLBACK)
            .put("STUDIO_RUNNER_CALLBACK_BASE_URL", "https://localhost:" + port)
            .put("STUDIO_RUNNER_INSTANCE_ID", "observed-fixture")
            .put("STUDIO_RUNNER_SCRATCH_DIR", TEMP.resolve("scratch").toString())
            .put("STUDIO_RUNNER_OBJECT_STORE_DIR", TEMP.resolve("objects").toString());
    Path server = TEMP.resolve("ordinary.mjs");
    Files.writeString(
        server,
        "import {createApplication} from '"
            + root
            + "server/application.js';import {loadConfig} from '"
            + root
            + "server/config.js';import {createChildBrowserLauncher} from '"
            + root
            + "run/launcher.js';import {loadObservedBuild,loadRuntimeVersions} from '"
            + root
            + "compat/runtime-versions.js';import {playwrightBrowserFactory} from '"
            + root
            + "run/browser.js';"
            + "const launch=playwrightBrowserFactory.launch.bind(playwrightBrowserFactory);"
            + "playwrightBrowserFactory.launch=async request=>{const handle=await launch(request);"
            + "const create=handle.createObservationSession.bind(handle);"
            + "handle.createObservationSession=config=>{const session=create(config),"
            + "acquire=session.acquire.bind(session),invoke=session.invoke.bind(session);"
            + "session.acquire=async request=>{const result=await acquire(request);"
            + "if(request.locator.kind==='role'&&request.locator.name==='Confirmation')"
            + "await fetch('"
            + ORIGIN
            + "/acquisition',{method:'POST',body:result.kind});return result;};"
            + "session.invoke=async (...args)=>{const result=await invoke(...args);"
            + "await fetch('"
            + ORIGIN
            + "/invocation',{method:'POST',body:args[0].operation.kind});"
            + "return result;};return session;};return handle;};"
            + account
            + "const build=loadObservedBuild("
            + startup
            + ");const"
            + " launcher=createChildBrowserLauncher({recording:{width:1280,heigh"
            + "t:720},stepTimeoutMs:30000,launchTimeoutMs:30000,maxFailureMessag"
            + "eLength:400,seekOriginCalibrationMs:0,childModulePath:"
            + JSON.writeValueAsString(child.toString())
            + "});const app=createApplication(loadConfig("
            + env
            + "),{launcher,runtimeVersions:loadRuntimeVersions(),observed:{build,policies:["
            + POLICY
            + "],accounts:new"
            + " Map([['fixture',provider]]),validationEnabled:true,replayEnabled:true}});await"
            + " app.start();process.on('SIGTERM',()=>{void"
            + " app.drain().then(()=>process.exit(0));});");
    var ordinary = new ProcessBuilder("node", server.toString());
    ordinary.environment().put("NODE_EXTRA_CA_CERTS", TEMP.resolve("tls.crt").toString());
    ordinary.environment().put("PLAYWRIGHT_BROWSERS_PATH", browsers);
    ordinary.redirectErrorStream(true).redirectOutput(TEMP.resolve("ordinary.log").toFile());
    ordinaryWorker = ordinary.start();
    for (int wanted : new int[] {GUIDED_PORT, NORMAL_PORT}) {
      long until = System.nanoTime() + Duration.ofSeconds(20).toNanos();
      boolean ready = false;
      while (System.nanoTime() < until) {
        try (var socket = new java.net.Socket("127.0.0.1", wanted)) {
          ready = true;
          break;
        } catch (java.io.IOException pending) {
          Thread.sleep(30);
        }
      }
      assertThat(ready).as("worker port %s logs at %s", wanted, TEMP).isTrue();
    }
  }

  private JsonNode invoke(String id, String route) throws Exception {
    JsonNode session = sessions.transaction(() -> sessions.lock(id).document().deepCopy());
    ObjectNode body =
        C.object()
            .put("schemaVersion", 2)
            .put("sessionId", id)
            .put("expectedSourceRevision", "1")
            .put("expectedConfigurationRevision", "1")
            .put("expectedPlanRevision", plans.state(id).path("planRevision").asInt());
    HttpRequest request =
        HttpRequest.newBuilder(
                URI.create(
                    "https://localhost:"
                        + port
                        + "/internal/v2/studio/guided-sessions/"
                        + id
                        + "/"
                        + route))
            .header(
                "Authorization",
                "Bearer " + token("backend-controller", "controller-1", "studio-guided-controller"))
            .header("X-Owner-Fence", session.path("owner").path("fence").asText())
            .header("Idempotency-Key", UUID.randomUUID().toString())
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build();
    var response =
        HttpClient.newBuilder()
            .sslContext(TLS)
            .build()
            .send(request, HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as("%s; logs %s", response.body(), TEMP).isEqualTo(202);
    return C.parse(response.body());
  }

  private JsonNode publicCall(String path, JsonNode body, int status, String key) throws Exception {
    var builder =
        HttpRequest.newBuilder(URI.create("https://localhost:" + port + path))
            .header("Cookie", "put_session=" + COOKIE);
    if (body == null) {
      builder.GET();
    } else {
      builder
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(body.toString()));
      if (key != null) {
        builder.header("Idempotency-Key", key);
      }
    }
    var response =
        HttpClient.newBuilder()
            .sslContext(TLS)
            .build()
            .send(builder.build(), HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode())
        .as("%s %s; logs %s", path, response.body(), TEMP)
        .isEqualTo(status);
    return C.parse(response.body());
  }

  private static JsonNode versions() throws Exception {
    return C.parse(
            Files.readString(
                Path.of("../docs/specs/studio-observed-authoring/contracts/v2/fixtures.json")))
        .path("documents")
        .path("versions");
  }

  private static ObjectNode model(JsonNode request) {
    String kind = request.path("kind").asText();
    JsonNode context = request.path("context");
    ObjectNode result =
        C.object()
            .put("schemaVersion", 2)
            .put("kind", kind)
            .put("requestId", request.path("requestId").asText());
    if (kind.equals("SOURCE_PLAN")) {
      if (askTimingSource) {
        askTimingSource = false;
        var choices =
            result.putObject("question").put("reason", "AMBIGUOUS_BINDING").putArray("choices");
        for (int i = 0; i < 2; i++) {
          String destination = i == 0 ? URL : URL + "?alternative=two";
          int start = i == 0 ? 5 : timingSourceText.indexOf(destination, 6);
          ObjectNode reference =
              C.object()
                  .put("referenceKind", "sourceSpan")
                  .put("sourceRevision", "1")
                  .put("stepId", ONE)
                  .put("startUtf16", start)
                  .put("endUtf16", start + destination.length())
                  .put("kind", "destination")
                  .put("intendedSlot", "navigate.destination");
          ObjectNode meaning = C.object();
          meaning.set("reference", reference);
          meaning.set(
              "need",
              C.object()
                  .put("stepId", ONE)
                  .put("occurrence", 0)
                  .put("operationKind", "navigate")
                  .put("argumentSlot", "navigate.destination"));
          choices
              .addObject()
              .put("choiceId", "timing-" + i)
              .put(
                  "safeLabel",
                  i == 0 ? "Primary authored destination" : "Alternative authored destination")
              .set("meaning", meaning);
        }
        return result;
      }
      result
          .putArray("sourceReferences")
          .addObject()
          .put("referenceKind", "sourceSpan")
          .put("sourceRevision", "1")
          .put("stepId", ONE)
          .put("startUtf16", 5)
          .put("endUtf16", 5 + URL.length())
          .put("kind", "destination")
          .put("intendedSlot", "navigate.destination");
      if (!context.path("clarificationSelections").isEmpty()) {
        result
            .withArray("sourceReferences")
            .set(0, context.path("clarificationSelections").get(0).path("reference"));
      }
      var items = result.putArray("obligations");
      items.add(obligation(ONE, 0, "navigate", "page", 0, null));
      items.add(obligation(ONE, 1, "read", "Order reference", null, "order"));
      items.add(obligation(TWO, 0, "fill", "Destination", null, "order"));
      items.add(obligation(THREE, 0, "click", "Submit", null, null));
      items.add(
          obligation(THREE, 1, "assert", "Confirmation", null, null).put("predicate", "visible"));
      result
          .putArray("needs")
          .addObject()
          .put("needId", "order")
          .put("producerStepId", ONE)
          .putArray("consumers")
          .addObject()
          .put("stepId", TWO)
          .put("argumentSlot", "fill.value");
      return result;
    }
    if (delayTimingModel) {
      delayTimingModel = false;
      try {
        Thread.sleep(1250);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException("Fixture interrupted");
      }
    }
    JsonNode obligation = context.path("obligations").get(0);
    String op = obligation.path("operationKind").asText();
    if (askObservedChoice && op.equals("fill")) {
      askObservedChoice = false;
      try {
        Thread.sleep(1250);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException("Fixture interrupted");
      }
      result.put("status", "CLARIFICATION").putNull("obligationId").putNull("action");
      var choices =
          result.putObject("question").put("reason", "AMBIGUOUS_BINDING").putArray("choices");
      for (String name : List.of("Destination", "Alternate destination")) {
        JsonNode node = null;
        for (JsonNode candidate : context.path("observation").path("nodes")) {
          if (candidate.path("name").asText().equals(name)) {
            node = candidate;
          }
        }
        if (node == null) {
          throw new IllegalStateException("Expected observed choice missing");
        }
        ObjectNode meaning =
            C.object()
                .put("obligationId", obligation.path("obligationId").asText())
                .put("nodeId", node.path("nodeId").asText())
                .putNull("bindingId");
        meaning.set(
            "locator",
            C.object()
                .put("kind", "role")
                .put("role", "textbox")
                .put("name", name)
                .put("exact", true));
        choices
            .addObject()
            .put("choiceId", "provider-" + choices.size())
            .put("safeLabel", name)
            .set("meaning", meaning);
      }
      var hook = beforeObservedQuestion;
      if (hook != null) {
        hook.accept(context);
      }
      return result;
    }
    result
        .put("status", "ACTION")
        .put("obligationId", obligation.path("obligationId").asText())
        .putNull("question");
    ObjectNode action = result.putObject("action"),
        operation = action.putObject("operation").put("kind", op),
        target = action.putObject("target");
    if (op.equals("navigate")) {
      target.put("kind", "page");
      operation.put("destinationInputId", context.path("inputs").get(0).path("inputId").asText());
    } else {
      JsonNode node = null;
      for (JsonNode candidate : context.path("observation").path("nodes")) {
        if (candidate.path("name").equals(obligation.path("targetIntent"))) {
          node = candidate;
        }
      }
      if (node == null) {
        throw new IllegalStateException("Expected controlled node missing");
      }
      target
          .put("nodeId", node.path("nodeId").asText())
          .putObject("locator")
          .put("kind", "role")
          .put("role", node.path("role").asText())
          .put("name", node.path("name").asText())
          .put("exact", true);
      if (op.equals("read")) {
        operation
            .put("bindingId", context.path("needs").get(0).path("bindingId").asText())
            .putObject("recipe")
            .put("kind", "visibleText")
            .put("classification", "permittedBusinessData")
            .put("policyRuleId", "business-read");
      }
      if (op.equals("fill")) {
        operation
            .putObject("value")
            .put("kind", "binding")
            .put("bindingId", context.path("needs").get(0).path("bindingId").asText());
      }
      if (op.equals("assert")) {
        operation.put("predicate", "visible").putNull("expected");
      }
    }
    return result;
  }

  private static ObjectNode obligation(
      String step, int occurrence, String op, String target, Integer reference, String need) {
    ObjectNode o =
        C.object()
            .put("stepId", step)
            .put("occurrence", occurrence)
            .put("operationKind", op)
            .put("targetIntent", target)
            .putNull("predicate")
            .put("needId", need);
    if (reference == null) {
      o.putNull("referenceIndex");
    } else {
      o.put("referenceIndex", reference);
    }
    return o;
  }

  private static String token(String role, String subject, String audience) throws Exception {
    var encoder = Base64.getUrlEncoder().withoutPadding();
    String header =
        encoder.encodeToString(
            "{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
    ObjectNode claims =
        C.object()
            .put("iss", "fixture-issuer")
            .put("sub", subject)
            .put("aud", audience)
            .put("role", role)
            .put("exp", Instant.now().plusSeconds(299).getEpochSecond())
            .put("iat", Instant.now().minusSeconds(1).getEpochSecond());
    String unsigned =
        header + "." + encoder.encodeToString(claims.toString().getBytes(StandardCharsets.UTF_8));
    Signature signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(ISSUER.getPrivate());
    signature.update(unsigned.getBytes(StandardCharsets.UTF_8));
    return unsigned + "." + encoder.encodeToString(signature.sign());
  }

  private static String command(String... args) throws Exception {
    Process p = new ProcessBuilder(args).redirectErrorStream(true).start();
    String output = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    if (!p.waitFor(30, java.util.concurrent.TimeUnit.SECONDS) || p.exitValue() != 0) {
      throw new IllegalStateException(output);
    }
    return output;
  }

  @AfterAll
  static void stop() throws Exception {
    retryRelease.countDown();
    if (guidedWorker != null) {
      guidedWorker.destroy();
    }
    if (ordinaryWorker != null) {
      ordinaryWorker.destroy();
    }
    PROVIDER.stop(0);
    APP.stop(0);
    DB.stop();
    SSLContext.setDefault(PREVIOUS_TLS);
  }
}
