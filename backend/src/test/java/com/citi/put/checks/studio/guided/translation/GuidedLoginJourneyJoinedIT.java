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
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver;
import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.citi.put.checks.studio.support.RunnerTestTls;
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
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.SSLContext;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
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
 * W53 (STUDIO-OBS-009/010, real-stack case 432): the whole controller-to-runner path of the login
 * journey on the real target page, with a scripted model. The model only ever plans and selects:
 * SOURCE_PLAN covers the authored steps and NEXT_ACTION picks the first remaining obligation with
 * the observation's OWN exported node and hint. Nothing else is stubbed: real PostgreSQL, the
 * production {@code GuidedTranslationService.advance} loop (recover, refresh, verify, call, apply,
 * runner prepare, admit, dispatch), mutually authenticated HTTPS in both directions, and the real
 * folded runner with actual Chromium.
 *
 * <p>The page is the byte-identical HTML and CSP of {@code target432-core/helpers.mjs} (a Username
 * + Password login that posts to {@code /login}). The defect this guards: a Username fill whose
 * proposal was refused by the runner's prepare (TARGET_CHANGED) before any action row existed, so
 * the controller silently re-asked the model until the proposal budget was spent.
 *
 * <p>Trimmed from {@code GuidedFocusMutationJoinedIT}'s scaffolding; it spawns the runner, so it is
 * listed in {@code runnerSpawningTestClasses}.
 */
@SpringBootTest(
    classes = GuidedLoginJourneyJoinedIT.Application.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false",
      "spring.jpa.hibernate.ddl-auto=none"
    })
class GuidedLoginJourneyJoinedIT {
  static final GuidedContracts CONTRACTS = new GuidedContracts();
  static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");
  static final Path TEMP;
  static final RunnerTestTls RUNNER_TLS;
  static final SSLContext TLS;
  static final KeyPair ISSUER;
  static final int RUNNER_PORT;
  static final HttpServer APPLICATION;
  static final String ORIGIN;
  static final HttpServer PROVIDER;
  static final List<String> PROVIDER_KINDS = new CopyOnWriteArrayList<>();
  static final List<String> LOGIN_POSTS = new CopyOnWriteArrayList<>();
  static final FakeStudioVaultProvider VAULT = new FakeStudioVaultProvider(Map.of());

  static final String USERNAME = "studio-local-user";
  static final String PASSWORD = "Z9y8X7w6V5u4T3s2R1q0P9o8";
  static final String CSP =
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

  /**
   * target432-core/helpers.mjs {@code page()}, {@code loginPage} and {@code choosePage}, verbatim.
   */
  static String page(String content) {
    return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Synthetic"
        + " visual106</title></head><body><main><p>Synthetic test data</p>"
        + content
        + "</main></body></html>";
  }

  static final String LOGIN_PAGE =
      page(
          "<h1>Synthetic visual106 login</h1><form method=\"post\" action=\"/login\">"
              + "<label>Username<input name=\"username\" type=\"text\" autocomplete=\"off\""
              + " required></label><label>Password<input name=\"password\" type=\"password\""
              + " autocomplete=\"off\" required></label><button"
              + " type=\"submit\">Sign in</button></form>");
  static final String CHOOSE_PAGE =
      page(
          "<h1>Choose workspace</h1><section aria-label=\"Primary workspace\"><h2>Primary"
              + " workspace</h2><form method=\"get\" action=\"/protected/primary\"><button"
              + " type=\"submit\""
              + " data-testid=\"open-primary\">Open</button></form></section><section"
              + " aria-label=\"Secondary workspace\"><h2>Secondary workspace</h2><form"
              + " method=\"get\" action=\"/protected/secondary\"><button type=\"submit\""
              + " data-testid=\"open-secondary\">Open</button></form></section>");

  /**
   * Round 057 (region-qualified labels): two "Open" buttons in one region, for the case where the
   * author's region does not single out the target.
   */
  static final String CHOOSE_SAME_REGION_PAGE =
      page(
          "<h1>Choose workspace</h1><section aria-label=\"Primary workspace\"><h2>Primary"
              + " workspace</h2><form method=\"get\" action=\"/protected/a\"><button"
              + " type=\"submit\" data-testid=\"open-a\">Open</button></form><form"
              + " method=\"get\" action=\"/protected/b\"><button type=\"submit\""
              + " data-testid=\"open-b\">Open</button></form></section>");

  /** "regions" (Primary and Secondary workspace) or "same" (both buttons in Primary workspace). */
  static volatile String chooseVariant = "regions";

  /** The /protected/* pages the browser reached, in order: where an Open click actually landed. */
  static final List<String> LANDINGS = new CopyOnWriteArrayList<>();

  /** The scopeIntent the scripted model puts on the step-5 Open obligation (null: unqualified). */
  static volatile String openScope = null;

  static volatile boolean outsideScopeAttack;
  static final AtomicInteger MALICIOUS_ACTIONS = new AtomicInteger();
  static final AtomicInteger PREPARE_CALLS = new AtomicInteger();
  static final AtomicInteger DISPATCH_CALLS = new AtomicInteger();
  static final List<String> WIRE_DIAGNOSTICS = new CopyOnWriteArrayList<>();

  /** The target intents of the NEXT_ACTION requests, in order (one entry per model call). */
  static final List<String> NEXT_ACTION_INTENTS = new CopyOnWriteArrayList<>();

  /** The authored steps of the current test (set before the session is created). */
  static volatile List<UUID> stepIds = List.of();

  static volatile List<String> stepTexts = List.of();

  /**
   * Opt-in (environment {@code W53_REAL_VERTEX}): the one real-provider journey replaces the
   * scripted model. Off by default, so every other case keeps the scripted provider and makes no
   * network call.
   */
  static final boolean REAL = System.getenv("W53_REAL_VERTEX") != null;

  /**
   * A hard cap on provider sends in the real run; a failed call stops all later sends (no retries).
   */
  static final int REAL_CALL_CAP =
      System.getenv("W53_REAL_CAP") == null ? 12 : Integer.parseInt(System.getenv("W53_REAL_CAP"));

  static final List<String> REAL_CALLS = new CopyOnWriteArrayList<>();
  static final AtomicInteger REAL_COUNT = new AtomicInteger();
  static final AtomicBoolean REAL_ABORTED = new AtomicBoolean();
  static volatile String lastFailure = "none";
  static volatile String lastUsage = "-";

  static {
    try {
      TEMP = Files.createTempDirectory("guided-login-journey-");
      RUNNER_TLS = RunnerTestTls.shared();
      TLS = RUNNER_TLS.backendTls().sslContext();
      var generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      ISSUER = generator.generateKeyPair();
      Files.writeString(
          TEMP.resolve("issuer.pub"),
          "-----BEGIN PUBLIC KEY-----\n"
              + Base64.getMimeEncoder(64, new byte[] {10})
                  .encodeToString(ISSUER.getPublic().getEncoded())
              + "\n-----END PUBLIC KEY-----\n");
      RUNNER_PORT = RunnerProcessHarness.exclusivelyFreePort();
      APPLICATION = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      ORIGIN = "http://localhost:" + APPLICATION.getAddress().getPort();
      APPLICATION.createContext(
          "/",
          exchange -> {
            byte[] body;
            int status = 200;
            String location = null;
            String path = exchange.getRequestURI().getPath();
            if (exchange.getRequestMethod().equals("POST") && path.equals("/login")) {
              LOGIN_POSTS.add(
                  new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
              status = 303;
              location = "/choose";
              body = new byte[0];
            } else if (path.equals("/choose")) {
              body =
                  (chooseVariant.equals("same") ? CHOOSE_SAME_REGION_PAGE : CHOOSE_PAGE)
                      .getBytes(StandardCharsets.UTF_8);
            } else if (path.startsWith("/protected/")) {
              LANDINGS.add(path);
              body = page("<h1>Opened " + path + "</h1>").getBytes(StandardCharsets.UTF_8);
            } else {
              body = LOGIN_PAGE.getBytes(StandardCharsets.UTF_8);
            }
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.getResponseHeaders().add("Cache-Control", "no-store");
            exchange.getResponseHeaders().add("Content-Security-Policy", CSP);
            if (location != null) {
              exchange.getResponseHeaders().add("Location", location);
            }
            exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
            if (body.length > 0) {
              exchange.getResponseBody().write(body);
            }
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
              PROVIDER_KINDS.add("PROVIDER_FAULT:" + failure);
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
          .target("29")
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
    DataSource dataSource() {
      return new DriverManagerDataSource(
          DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
    }

    @Bean
    GuidedContracts contracts() {
      return CONTRACTS;
    }

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
          true, REAL ? 65536 : 131072, REAL ? 4096 : 2048, REAL ? 150 : 60, "worker-1");
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
    GuidedStepVerifier verifier(GuidedTranslationStore store) {
      return new GuidedStepVerifier(store);
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
          com.citi.put.checks.studio.support.TestDomains.FIXTURES,
          new VaultStudioReferenceResolver(VAULT));
    }

    @Bean
    GuidedMaterializationService materialization(JdbcTemplate jdbc) {
      return new GuidedMaterializationService(
          jdbc, CONTRACTS, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
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
          org.mockito.Mockito.spy(
              new GuidedSessionService(
                  repository,
                  CONTRACTS,
                  access,
                  new GuidedSessionProperties(true, Map.of()),
                  com.citi.put.checks.studio.support.TestDomains.FIXTURES,
                  Clock.systemUTC()));
      org.mockito.Mockito.doAnswer(
              invocation -> {
                safeWireSchema("outcome", invocation.getArgument(4));
                return invocation.callRealMethod();
              })
          .when(service)
          .outcomeV2(
              org.mockito.ArgumentMatchers.any(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.anyLong(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.any());
      org.mockito.Mockito.doAnswer(
              invocation -> {
                JsonNode body = invocation.getArgument(4);
                safeWireSchema("observation", body);
                try {
                  GuidedOutline.requireConsistent(body.path("observation"));
                } catch (RuntimeException refused) {
                  WIRE_DIAGNOSTICS.add("OBSERVATION_REF_ROLE_ORDINAL_REFUSED");
                }
                return invocation.callRealMethod();
              })
          .when(service)
          .observeV2(
              org.mockito.ArgumentMatchers.any(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.anyLong(),
              org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.any());
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
      com.citi.put.checks.studio.support.ObservedPublicationFixture.installCsiBudget(service, jdbc);
      return service;
    }

    @Bean
    HttpRunnerDispatchClient runner() {
      return new HttpRunnerDispatchClient(
          URI.create("https://127.0.0.1:" + RUNNER_PORT),
          TLS,
          () -> token("backend-controller", "controller-1", "studio-guided-runner"),
          CONTRACTS) {
        @Override
        public JsonNode send(String operation, JsonNode body, String key) {
          if (operation.equals("prepare")) {
            PREPARE_CALLS.incrementAndGet();
          }
          return super.send(operation, body, key);
        }

        @Override
        public JsonNode send(String operation, JsonNode body, String key, Instant deadline) {
          if (operation.equals("dispatch")) {
            DISPATCH_CALLS.incrementAndGet();
          }
          safeWireSchema(operation, body);
          try {
            return super.send(operation, body, key, deadline);
          } catch (RuntimeException refusal) {
            for (var frame : java.util.Arrays.stream(refusal.getStackTrace()).limit(8).toList()) {
              WIRE_DIAGNOSTICS.add(
                  frame.getClassName() + "." + frame.getMethodName() + ":" + frame.getLineNumber());
            }
            throw refusal;
          }
        }
      };
    }

    @Bean
    GuidedDispatchService dispatch(
        GuidedSessionService sessions,
        GuidedMaterializationService materialization,
        HttpRunnerDispatchClient runner) {
      var dispatch = new GuidedDispatchService(sessions, materialization, runner);
      dispatch.installReferences(new VaultStudioReferenceResolver(VAULT));
      sessions.installStopSender(dispatch::stop);
      return dispatch;
    }

    @Bean(destroyMethod = "close")
    GenAiGatewayTransport transport() throws Exception {
      if (REAL) {
        // The case's local configuration: direct Vertex, application-default credentials (never
        // printed).
        return new GenAiGatewayTransport(
            new StudioGatewayProperties(
                "https://aiplatform.googleapis.com",
                "epicagentai",
                "global",
                "gemini-3.8-flash",
                new StudioGatewayProperties.Credentials("application-default", null),
                Duration.ofSeconds(150),
                4,
                262144,
                262144,
                StudioGatewayProperties.DEFAULT_MAX_OUTPUT_TOKENS,
                StudioGatewayProperties.ThinkingLevel.LOW,
                StudioGatewayProperties.ProviderFeatures.ALL));
      }
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
      if (REAL) {
        return new RecordingGateway(
            new GenAiGuidedLlmGatewayClient(
                recordingTransport(transport), new GuidedResponseParser(CONTRACTS)));
      }
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

  static final java.util.Map<String, com.networknt.schema.JsonSchema> WIRE_SCHEMAS =
      new java.util.concurrent.ConcurrentHashMap<>();

  static void safeWireSchema(String operation, JsonNode body) {
    try {
      CONTRACTS.validate("v3/bridge#/definitions/" + operation, body);
      return;
    } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException refused) {
      WIRE_DIAGNOSTICS.add(operation + ":ACTUAL_CONTRACT_REJECTED");
    }
    try {
      var schema = WIRE_SCHEMAS.get(operation);
      if (schema == null) {
        JsonNode document =
            CONTRACTS.parse(
                Files.readString(
                    Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v3/bridge.schema.json")));
        JsonNode expanded =
            expandWireSchema(
                document.path("definitions").path(operation), document.path("$id").asText());
        schema =
            com.networknt.schema.JsonSchemaFactory.getInstance(
                    com.networknt.schema.SpecVersion.VersionFlag.V7)
                .getSchema(expanded);
        WIRE_SCHEMAS.put(operation, schema);
      }
      for (var error : schema.validate(body)) {
        WIRE_DIAGNOSTICS.add(operation + ":" + error.getInstanceLocation() + ":" + error.getType());
      }
    } catch (java.io.IOException | RuntimeException unavailable) {
      WIRE_DIAGNOSTICS.add("SCHEMA_DIAGNOSTIC_UNAVAILABLE");
    }
  }

  static JsonNode expandWireSchema(JsonNode schema, String base) throws java.io.IOException {
    if (schema.isObject() && schema.has("$ref")) {
      URI uri = URI.create(base).resolve(schema.path("$ref").asText());
      String file = Path.of(uri.getPath()).getFileName().toString();
      JsonNode document =
          CONTRACTS.parse(
              Files.readString(
                  Path.of("../docs/specs/studio-observed-authoring/contracts/v3").resolve(file)));
      JsonNode target = uri.getFragment() == null ? document : document.at(uri.getFragment());
      return expandWireSchema(target, document.path("$id").asText());
    }
    if (schema.isObject()) {
      ObjectNode expanded = CONTRACTS.object();
      for (var fields = schema.fields(); fields.hasNext(); ) {
        var field = fields.next();
        if (!List.of("$id", "$schema", "definitions").contains(field.getKey())) {
          expanded.set(field.getKey(), expandWireSchema(field.getValue(), base));
        }
      }
      return expanded;
    }
    if (schema.isArray()) {
      var expanded = CONTRACTS.object().putArray("items");
      for (JsonNode child : schema) {
        expanded.add(expandWireSchema(child, base));
      }
      return expanded;
    }
    return schema.deepCopy();
  }

  // ---- the scripted model (it only plans and selects) ----

  static ObjectNode obligation(
      String step, int occurrence, String kind, String target, Integer reference) {
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
    item.putNull("needId");
    return item;
  }

  /** The configuration reference the classifier created for a step and slot (kind-checked). */
  static ObjectNode configurationReference(JsonNode request, String step, String kind) {
    for (JsonNode reference : request.path("context").path("configurationReferences")) {
      if (reference.path("stepId").asText().equals(step)
          && reference.path("intendedSlot").asText().equals("fill.value")
          && reference.path("kind").asText().equals(kind)) {
        ObjectNode saved = reference.deepCopy();
        saved.put("referenceKind", "configuration").put("configurationRevision", "1");
        // The closed public shape permits referenceName only for secretRef.
        if (!kind.equals("secretRef")) {
          saved.remove("referenceName");
        }
        return saved;
      }
    }
    throw new IllegalStateException("CONFIGURATION_REFERENCE_MISSING:" + step + ":" + kind);
  }

  /**
   * SOURCE_PLAN for the authored steps: open /login, fill Username, fill Password, click Sign in.
   */
  static ObjectNode sourcePlan(JsonNode request) {
    String open = stepIds.get(0).toString();
    String user = stepIds.get(1).toString();
    String pass = stepIds.get(2).toString();
    ObjectNode plan = CONTRACTS.object();
    var references = plan.putArray("sourceReferences");
    String destination = ORIGIN + "/login";
    int start = stepTexts.get(0).indexOf(destination);
    references
        .addObject()
        .put("referenceKind", "sourceSpan")
        .put("sourceRevision", "1")
        .put("stepId", open)
        .put("startUtf16", start)
        .put("endUtf16", start + destination.length())
        .put("kind", "destination")
        .put("intendedSlot", "navigate.destination");
    references.add(configurationReference(request, user, "nonsecretText"));
    references.add(configurationReference(request, pass, "secretRef"));
    var obligations = plan.putArray("obligations");
    obligations.add(obligation(open, 0, "navigate", "page", 0));
    obligations.add(obligation(user, 0, "fill", "Username", 1));
    obligations.add(obligation(pass, 0, "fill", "Password", 2));
    if (stepIds.size() > 3) {
      obligations.add(obligation(stepIds.get(3).toString(), 0, "click", "Sign in", null));
    }
    if (stepIds.size() > 4) {
      ObjectNode choose = obligation(stepIds.get(4).toString(), 0, "click", "Open", null);
      if (openScope != null) {
        choose.put("scopeIntent", openScope);
      }
      obligations.add(choose);
    }
    return plan;
  }

  static String inputIdFor(JsonNode request, String step, String kind) {
    for (JsonNode input : request.path("context").path("inputs")) {
      if (input.path("sourceStepId").asText().equals(step)
          && input.path("kind").asText().equals(kind)) {
        return input.path("inputId").asText();
      }
    }
    throw new IllegalStateException("INPUT_MISSING:" + step + ":" + kind);
  }

  /** NEXT_ACTION: the first remaining obligation, naming a ref of the outline the request shows. */
  static ObjectNode nextAction(JsonNode request, ObjectNode response) {
    JsonNode chosen = request.path("context").path("obligations").path(0);
    if (chosen.isMissingNode()) {
      throw new IllegalStateException("NO_REMAINING_OBLIGATION");
    }
    String step = chosen.path("stepId").asText();
    String kind = chosen.path("operationKind").asText();
    String intent = chosen.path("targetIntent").asText();
    NEXT_ACTION_INTENTS.add(intent);
    if (kind.equals("click")
        && intent.equals("Open")
        && !chosen.has("selectedChoice")
        && !outsideScopeAttack) {
      List<GuidedOutline.Line> matches = openCandidates(request, chosen);
      if (matches.size() >= 2) {
        return clarification(request, response, chosen, matches);
      }
      if (matches.isEmpty()) {
        return response.put("status", "UNSUPPORTED").put("reasonCode", "INSUFFICIENT_EVIDENCE");
      }
    }
    ObjectNode action = CONTRACTS.object();
    ObjectNode target = action.putObject("target");
    ObjectNode operation = action.putObject("operation").put("kind", kind);
    switch (kind) {
      case "navigate" -> {
        target.put("kind", "page");
        operation.put("destinationInputId", inputIdFor(request, step, "destination"));
      }
      case "fill" -> {
        if (intent.equals("Password")) {
          target.put("kind", "passwordControl");
          operation
              .putObject("value")
              .put("kind", "secretRef")
              .put("sourceInputId", inputIdFor(request, step, "secretRef"));
        } else {
          selectNode(request, intent, target);
          operation
              .putObject("value")
              .put("kind", "authoredLiteral")
              .put("sourceInputId", inputIdFor(request, step, "nonsecretText"));
        }
      }
      case "click" -> {
        if (outsideScopeAttack && intent.equals("Open")) {
          GuidedOutline.Line malicious =
              shown(request).stream()
                  .filter(
                      line ->
                          "Open".equals(line.name())
                              && regionOf(line).equals("Secondary workspace"))
                  .findFirst()
                  .orElseThrow(() -> new IllegalStateException("ADVERSARIAL_CURRENT_REF_MISSING"));
          target.put("kind", "node").put("ref", malicious.ref());
          MALICIOUS_ACTIONS.incrementAndGet();
        } else if (chosen.has("selectedChoice")) {
          // An accepted choice: the backend names the fresh ref of the element the author chose.
          target.put("kind", "node").put("ref", chosen.path("selectedChoice").path("ref").asText());
        } else if (chosen.path("scopeIntent").isTextual()) {
          // A qualified step: the one element of that name in that region.
          List<GuidedOutline.Line> matches = openCandidates(request, chosen);
          if (matches.size() != 1) {
            throw new IllegalStateException("QUALIFIED_CANDIDATES:" + matches.size());
          }
          target.put("kind", "node").put("ref", matches.getFirst().ref());
        } else {
          selectNode(request, intent, target);
        }
      }
      default -> throw new IllegalStateException("UNSCRIPTED_" + kind);
    }
    response
        .put("status", "ACTION")
        .put("obligationId", chosen.path("obligationId").asText())
        .putNull("question")
        .set("action", action);
    return response;
  }

  /** The shown lines (those with a ref) of the outline the request carries. */
  static List<GuidedOutline.Line> shown(JsonNode request) {
    return GuidedOutline.parse(request.path("context").path("observation").asText()).stream()
        .filter(line -> line.ref() != null)
        .toList();
  }

  private static final java.util.regex.Pattern IN_HINT =
      java.util.regex.Pattern.compile("\\{in=(\"(?:[^\"\\\\]|\\\\.)*\")\\}");

  /** The container the element sits in, from the {@code in="..."} hint of its outline line. */
  static String regionOf(GuidedOutline.Line line) {
    var match = IN_HINT.matcher(line.rest());
    if (!match.find()) {
      return "";
    }
    try {
      String qualified =
          new com.fasterxml.jackson.databind.ObjectMapper().readValue(match.group(1), String.class);
      var named =
          java.util.regex.Pattern.compile("(?:^| > )[a-z][a-z-]* '([^']+)'(?: > |$)")
              .matcher(qualified);
      return named.find() ? named.group(1) : "";
    } catch (java.io.IOException unreadable) {
      throw new IllegalStateException("UNREADABLE_IN_HINT", unreadable);
    }
  }

  /** The shown elements named "Open" (in the named region, when the obligation has one). */
  static List<GuidedOutline.Line> openCandidates(JsonNode request, JsonNode obligation) {
    List<GuidedOutline.Line> matches = new ArrayList<>();
    for (GuidedOutline.Line line : shown(request)) {
      if (line.name() != null
          && line.name().equalsIgnoreCase(obligation.path("targetIntent").asText())
          && (!obligation.path("scopeIntent").isTextual()
              || regionOf(line).equalsIgnoreCase(obligation.path("scopeIntent").asText()))) {
        matches.add(line);
      }
    }
    return matches;
  }

  /** Several elements answer the label: ask, offering exactly those elements by their refs. */
  static ObjectNode clarification(
      JsonNode request,
      ObjectNode response,
      JsonNode obligation,
      List<GuidedOutline.Line> matches) {
    response.put("status", "CLARIFICATION").putNull("obligationId").putNull("action");
    var choices =
        response.putObject("question").put("reason", "AMBIGUOUS_TARGET").putArray("choices");
    int index = 0;
    for (GuidedOutline.Line line : matches) {
      ObjectNode meaning =
          CONTRACTS
              .object()
              .put("obligationId", obligation.path("obligationId").asText())
              .put("ref", line.ref())
              .putNull("bindingId");
      choices
          .addObject()
          .put("choiceId", "choice-" + index++)
          .put("safeLabel", line.name())
          .set("meaning", meaning);
    }
    return response;
  }

  /** What a correct model does: copy the ref of the outline line whose name is the intent. */
  static void selectNode(JsonNode request, String intent, ObjectNode target) {
    for (GuidedOutline.Line line : shown(request)) {
      if (line.name().equalsIgnoreCase(intent)) {
        target.put("kind", "node").put("ref", line.ref());
        return;
      }
    }
    throw new IllegalStateException("NODE_UNAVAILABLE:" + intent);
  }

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
      return (ObjectNode) response.setAll(sourcePlan(request));
    }
    if (!kind.equals("NEXT_ACTION")) {
      throw new IllegalStateException("UNEXPECTED_" + kind);
    }
    return nextAction(request, response);
  }

  // ---- the real-provider run: closed failure classes only, never a message, body or prompt ----

  /**
   * Exception simple-class chain plus the SDK's HTTP status integer; no message, cause text or
   * body.
   */
  static String closedFailure(Throwable error) {
    var classes = new StringBuilder();
    int status = -1;
    int depth = 0;
    for (Throwable current = error; current != null && depth < 6; current = current.getCause()) {
      classes.append(classes.isEmpty() ? "" : ">").append(current.getClass().getSimpleName());
      if (current instanceof com.google.genai.errors.ApiException api) {
        status = api.code();
      }
      depth++;
    }
    return classes + " http=" + status;
  }

  /**
   * Integer usage counters only (prompt, candidates, thoughts, tool-use, total); absent ones print
   * as -.
   */
  static String closedUsage(com.google.genai.types.GenerateContentResponse raw) {
    String finish =
        raw.candidates()
            .map(
                candidates ->
                    candidates.isEmpty()
                        ? "NO_CANDIDATE"
                        : candidates.get(0).finishReason().map(Object::toString).orElse("-"))
            .orElse("NO_CANDIDATE");
    var metadata = raw.usageMetadata();
    if (metadata.isEmpty()) {
      return "finish=" + finish + " usage=none";
    }
    var usage = metadata.get();
    return "finish="
        + finish
        + " prompt="
        + usage.promptTokenCount().map(String::valueOf).orElse("-")
        + " candidates="
        + usage.candidatesTokenCount().map(String::valueOf).orElse("-")
        + " thoughts="
        + usage.thoughtsTokenCount().map(String::valueOf).orElse("-")
        + " toolUse="
        + usage.toolUsePromptTokenCount().map(String::valueOf).orElse("-")
        + " total="
        + usage.totalTokenCount().map(String::valueOf).orElse("-");
  }

  /** True when the action's ref is, verbatim, one of the refs the request's outline shows. */
  static boolean usedShownRef(GuidedModelRequest request, JsonNode action) {
    JsonNode target = action.path("target");
    return target.path("kind").asText().equals("node")
        && GuidedOutline.shownRefs(request.projection().document().path("observation").asText())
            .contains(target.path("ref").asText());
  }

  private static Object invokeReal(Object real, org.mockito.invocation.InvocationOnMock call)
      throws Throwable {
    try {
      return call.getMethod().invoke(real, call.getArguments());
    } catch (java.lang.reflect.InvocationTargetException failure) {
      throw failure.getCause();
    }
  }

  /**
   * A delegating view of the real transport whose lease records where (authenticate or generate) it
   * failed.
   */
  static GenAiGatewayTransport recordingTransport(GenAiGatewayTransport real) {
    return org.mockito.Mockito.mock(
        GenAiGatewayTransport.class,
        org.mockito.Mockito.withSettings()
            .defaultAnswer(
                call -> {
                  Object result = invokeReal(real, call);
                  if (call.getMethod().getName().equals("tryAcquire")
                      && result instanceof GenAiGatewayTransport.Lease lease) {
                    return org.mockito.Mockito.mock(
                        GenAiGatewayTransport.Lease.class,
                        org.mockito.Mockito.withSettings()
                            .defaultAnswer(
                                leaseCall -> {
                                  try {
                                    Object leaseResult = invokeReal(lease, leaseCall);
                                    if (leaseResult
                                        instanceof
                                        com.google.genai.types.GenerateContentResponse raw) {
                                      lastUsage = closedUsage(raw);
                                    }
                                    return leaseResult;
                                  } catch (Throwable failure) {
                                    String phase = leaseCall.getMethod().getName();
                                    if (phase.equals("authenticate") || phase.equals("generate")) {
                                      lastFailure = phase + ":" + closedFailure(failure);
                                    }
                                    throw failure;
                                  }
                                }));
                  }
                  return result;
                }));
  }

  /**
   * At most {@link #REAL_CALL_CAP} sends, and none after the first transport-class failure; records
   * closed facts per call.
   */
  static final class RecordingGateway implements GuidedLlmGatewayClient {
    private final GuidedLlmGatewayClient delegate;

    RecordingGateway(GuidedLlmGatewayClient delegate) {
      this.delegate = delegate;
    }

    @Override
    public GuidedModelResponse propose(GuidedModelRequest request, GuidedCallBudget budget) {
      int number = REAL_COUNT.incrementAndGet();
      if (number > REAL_CALL_CAP || REAL_ABORTED.get()) {
        REAL_CALLS.add(
            "call=" + number + " kind=" + request.kind() + " NOT_SENT (cap or earlier failure)");
        return new GuidedModelResponse(GuidedModelResponse.Code.TRANSPORT, null, null, null, null);
      }
      lastFailure = "none";
      lastUsage = "-";
      long started = System.nanoTime();
      GuidedModelResponse response = delegate.propose(request, budget);
      long millis = (System.nanoTime() - started) / 1_000_000;
      StringBuilder line =
          new StringBuilder("call=" + number)
              .append(" kind=" + request.kind())
              .append(" code=" + response.code())
              .append(" inputTokens=" + (response.inputTokens() == null ? "ABSENT" : "PRESENT"))
              .append(" outputTokens=" + (response.outputTokens() == null ? "ABSENT" : "PRESENT"))
              .append(" maxOutputTokens=" + request.maxOutputTokens())
              .append(" inTokens=" + response.inputTokens())
              .append(" outTokens=" + response.outputTokens())
              .append(" usage[" + lastUsage + "]")
              .append(" ms=" + millis)
              .append(" failure=" + lastFailure);
      if (response.code() == GuidedModelResponse.Code.OK) {
        JsonNode proposal = response.proposal();
        line.append(" status=" + proposal.path("status").asText());
        JsonNode action = proposal.path("action");
        if (action.isObject()) {
          line.append(" operation=" + action.path("operation").path("kind").asText())
              .append(" target=" + action.path("target").path("kind").asText("node"))
              .append(" ref=" + action.path("target").path("ref").asText("-"))
              .append(
                  " valueKind=" + action.path("operation").path("value").path("kind").asText("-"))
              .append(" realShownRef=" + usedShownRef(request, action));
        }
        if (request.kind() == GuidedModelRequest.Kind.SOURCE_PLAN) {
          line.append(" obligations=" + proposal.path("obligations").size());
        }
      } else if (response.code() != GuidedModelResponse.Code.INVALID_RESPONSE) {
        // A transport-class failure stops all later sends. An unparsable answer is the product's
        // own repair
        // path (bounded by the cap), exactly as in the case.
        REAL_ABORTED.set(true);
      }
      REAL_CALLS.add(line.toString());
      return response;
    }
  }

  // ---- the test ----

  @LocalServerPort int backendPort;
  @Autowired GuidedSessionService sessions;
  @Autowired GuidedSessionRepository repository;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource fixtureDataSource;
  @Autowired GuidedTranslationStore store;
  @Autowired GuidedTranslationService translation;
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

  @BeforeEach
  void startWorker() throws Exception {
    String isolatedDatabase = "journey_" + UUID.randomUUID().toString().replace("-", "");
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
    LOGIN_POSTS.clear();
    LANDINGS.clear();
    NEXT_ACTION_INTENTS.clear();
    chooseVariant = "regions";
    openScope = null;
    outsideScopeAttack = false;
    MALICIOUS_ACTIONS.set(0);
    PREPARE_CALLS.set(0);
    DISPATCH_CALLS.set(0);
    WIRE_DIAGNOSTICS.clear();
    REAL_CALLS.clear();
    REAL_COUNT.set(0);
    REAL_ABORTED.set(false);
    jdbc.update(
        "INSERT INTO users(id,sso_id,name,email,created_at) VALUES (?"
            + ",'guided-fixture','Guided"
            + " Test','user-1',now()) ON CONFLICT DO NOTHING",
        UUID.randomUUID());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,ow"
            + "ner_email,environment) VALUES"
            + " ('CSI-123','Guided fixture','Ops','HIGH','user-1','Production') ON CONFLICT DO"
            + " NOTHING");
    testId = UUID.randomUUID();
    stepTexts =
        List.of(
            "Open " + ORIGIN + "/login",
            "Fill Username with <var USER>",
            "Fill Password with <secret PASS>",
            "Click Sign in");
    stepIds = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
    var steps = new ArrayList<AuthoringStep>();
    for (int i = 0; i < stepIds.size(); i++) {
      steps.add(new AuthoringStep(stepIds.get(i), stepTexts.get(i), null));
    }
    var authoring = new AuthoringV2Request(2, null, steps);
    ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    jdbc.update(
        "INSERT INTO ui_tests(id, name, csi_id, environment, browser,"
            + " steps, variables, authoring,"
            + " authoring_revision_inputs, created_by, created_at, updated_"
            + "at) VALUES (?, 'Login"
            + " journey','CSI-123','fixture','chromium',?::jsonb,?::jsonb,?"
            + "::jsonb,?::jsonb,'user"
            + "-1',now(),now())",
        testId,
        mapper.writeValueAsString(stepTexts),
        "[{\"name\":\"USER\",\"kind\":\"plain\",\"value\":\""
            + USERNAME
            + "\"},{\"name\":\"PASS\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"}]",
        mapper.writeValueAsString(authoring),
        mapper.writeValueAsString(
            AuthoringRevisionIdentity.create(authoring, Map.of("USER", USERNAME))));
    VAULT.create(
        VaultScope.of("CSI-123", "fixture", testId),
        "PASS",
        PASSWORD.toCharArray(),
        List.of(ORIGIN));
    Files.writeString(
        TEMP.resolve("worker.jwt"), token("owning-worker", "worker-1", "studio-guided-controller"));
    Path journal = Files.createTempDirectory(TEMP, "journal-");
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
    var harness = workerHarness;
    workerHarness = null;
    if (harness != null) {
      var report = harness.teardown();
      assertThat(Files.readString(harness.logFile())).doesNotContain(PASSWORD);
      report.assertNoSurvivors();
      report.assertCleanExit();
    }
    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "NEXT_ACTION");
  }

  @AfterAll
  static void close() {
    APPLICATION.stop(0);
    PROVIDER.stop(0);
    DATABASE.stop();
  }

  @Test
  void theUsernamePasswordLoginJourneyCompletesStepByStep() throws Exception {
    journey();
  }

  /**
   * Plan, then advance the way the production coordinator does, one turn at a time, until every
   * step is complete. A turn the controller refuses is reported with its code instead of being
   * retried (the coordinator ignores it and asks the model again, which is how the proposal budget
   * used to burn on step 2).
   */
  void journey() throws Exception {
    Assumptions.assumeFalse(
        REAL, "the scripted model is replaced by the real provider in this run");
    String id = createSession();
    translation.plan(controller, id, 0, "plan-" + id, command(id));
    assertThat(progress(id).path("translationBootstrap").path("phase").asText()).isEqualTo("READY");
    List<String> trace = new ArrayList<>();
    int stepIndex = 0;
    for (int turn = 0; turn < 24 && stepIndex < 4; turn++) {
      String failure = null;
      try {
        translation.advance(controller, id, 1, "advance-" + turn, command(id));
      } catch (RuntimeException refusal) {
        failure =
            refusal.getClass().getSimpleName()
                + ":"
                + refusal.getMessage()
                + ":closedWire="
                + WIRE_DIAGNOSTICS;
      }
      stepIndex = progress(id).path("stepIndex").asInt();
      trace.add(
          "turn="
              + turn
              + " stepIndex="
              + stepIndex
              + " state="
              + session(id).path("state").asText()
              + " actions="
              + actionStates(id)
              + " failure="
              + failure);
      if (failure != null && stepIndex < 4) {
        // The production coordinator ignores a refused turn and asks again; stop on the first so
        // the
        // refusal is named instead of burning the proposal budget.
        break;
      }
    }
    assertThat(trace.toString()).contains("actions=[SUCCEEDED, SUCCEEDED, SUCCEEDED");
    assertThat(trace.get(trace.size() - 1)).as(trace.toString()).contains("stepIndex=4");
    assertThat(LOGIN_POSTS).hasSize(1);
    var form = new java.net.URI("http://x/?" + LOGIN_POSTS.get(0)).getQuery();
    assertThat(form).contains("username=" + USERNAME).contains("password=" + PASSWORD);
  }

  // ---- round 057 (user decision): region-qualified step labels, real runner, scripted model ----

  /**
   * Re-creates the authored test with a fifth step. No session exists yet, so deleting and
   * re-inserting the row keeps revision 1.
   */
  void useFiveSteps(String openText, int timeoutSeconds) throws Exception {
    stepTexts =
        List.of(
            "Open " + ORIGIN + "/login",
            "Fill Username with <var USER>",
            "Fill Password with <secret PASS>",
            "Click Sign in",
            openText);
    stepIds = new ArrayList<>();
    var steps = new ArrayList<AuthoringStep>();
    for (String text : stepTexts) {
      UUID id = UUID.randomUUID();
      ((ArrayList<UUID>) stepIds).add(id);
      steps.add(new AuthoringStep(id, text, null));
    }
    var authoring = new AuthoringV2Request(2, null, steps);
    ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    jdbc.update("DELETE FROM ui_tests WHERE id=?", testId);
    jdbc.update(
        "INSERT INTO ui_tests(id, name, csi_id, environment, browser,"
            + " steps, variables, authoring,"
            + " authoring_revision_inputs, timeout_seconds, created_by, created_at, updated_at)"
            + " VALUES (?, 'Qualified label journey','CSI-123','fixture','chromium',?::jsonb,"
            + "?::jsonb,?::jsonb,?::jsonb,?,'user-1',now(),now())",
        testId,
        mapper.writeValueAsString(stepTexts),
        "[{\"name\":\"USER\",\"kind\":\"plain\",\"value\":\""
            + USERNAME
            + "\"},{\"name\":\"PASS\",\"kind\":\"secretRef\",\"secretId\":\"PASS\"}]",
        mapper.writeValueAsString(authoring),
        mapper.writeValueAsString(
            AuthoringRevisionIdentity.create(authoring, Map.of("USER", USERNAME))),
        timeoutSeconds);
  }

  record Turns(String failure, int stepIndex, String state, List<String> trace) {}

  /**
   * Advances like the production coordinator, one turn at a time, until the step index reaches
   * {@code stopAt}, the session waits for a human, or a turn is refused (reported, not retried).
   */
  Turns advanceUntil(String id, int stopAt, int maxTurns) throws Exception {
    List<String> trace = new ArrayList<>();
    String failure = null;
    for (int turn = 0; turn < maxTurns; turn++) {
      String state = session(id).path("state").asText();
      if (progress(id).path("stepIndex").asInt() >= stopAt
          || state.equals("AWAITING_CLARIFICATION")
          || List.of("FAILED", "CANCELLED", "EXPIRED", "SUCCEEDED").contains(state)) {
        break;
      }
      try {
        translation.advance(controller, id, 1, "advance-" + UUID.randomUUID(), command(id));
      } catch (RuntimeException refusal) {
        failure =
            refusal.getClass().getSimpleName()
                + ":"
                + refusal.getMessage()
                + ":closedWire="
                + WIRE_DIAGNOSTICS;
      }
      trace.add(
          "turn="
              + turn
              + " stepIndex="
              + progress(id).path("stepIndex").asInt()
              + " state="
              + session(id).path("state").asText()
              + " actions="
              + actionStates(id)
              + " failure="
              + failure);
      if (failure != null) {
        break;
      }
      if (progress(id).path("stepIndex").asInt() >= 4) {
        Thread.sleep(250);
      }
    }
    return new Turns(
        failure, progress(id).path("stepIndex").asInt(), session(id).path("state").asText(), trace);
  }

  String startAndPlan() {
    String id = createSession();
    translation.plan(controller, id, 0, "plan-" + id, command(id));
    assertThat(progress(id).path("translationBootstrap").path("phase").asText()).isEqualTo("READY");
    return id;
  }

  int clarificationRows(String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_clarification_contexts WHERE session_id=?",
        Integer.class,
        id);
  }

  JsonNode openObligation(String id) {
    JsonNode obligations =
        repository.transaction(() -> store.state(id).path("plan").path("obligations").deepCopy());
    return obligations.get(obligations.size() - 1);
  }

  /** The step-5 Open click, qualified by a region the author wrote: no question, one model call. */
  void qualifiedOpen(String region, String expectedLanding) throws Exception {
    Assumptions.assumeFalse(REAL, "the scripted model is replaced by the real provider here");
    useFiveSteps("Click Open in " + region, 30);
    openScope = region;
    String id = startAndPlan();
    Turns turns = advanceUntil(id, 5, 40);
    assertThat(turns.failure()).as(turns.trace().toString()).isNull();
    assertThat(turns.stepIndex()).as(turns.trace().toString()).isEqualTo(5);
    // The plan carries the bare label and the qualifier; the page's other region was never asked.
    assertThat(openObligation(id).path("targetIntent").asText()).isEqualTo("Open");
    assertThat(openObligation(id).path("scopeIntent").asText()).isEqualTo(region);
    assertThat(clarificationRows(id)).isZero();
    assertThat(NEXT_ACTION_INTENTS)
        .containsExactly("page", "Username", "Password", "Sign in", "Open");
    assertThat(LANDINGS).containsExactly(expectedLanding);
    assertThat(progress(id).path("errorCode").asText("")).isEmpty();
    assertThat(session(id).path("state").asText()).isNotEqualTo("FAILED");
  }

  @Test
  void theQualifiedStepOpensThePrimaryWorkspaceWithoutAQuestion() throws Exception {
    qualifiedOpen("Primary workspace", "/protected/primary");
  }

  @Test
  void theQualifiedStepOpensTheSecondaryWorkspaceNotTheFirstMatch() throws Exception {
    qualifiedOpen("Secondary workspace", "/protected/secondary");
  }

  @Test
  void aRegionThePageDoesNotHaveFailsClosedWithoutClickingEitherButton() throws Exception {
    Assumptions.assumeFalse(REAL, "the scripted model is replaced by the real provider here");
    useFiveSteps("Click Open in Tertiary workspace", 3);
    openScope = "Tertiary workspace";
    String id = startAndPlan();
    Turns turns = advanceUntil(id, 5, 80);
    // Semantic stasis ends redundant acquisition; the scripted provider honestly reports no scope.
    assertThat(turns.failure()).as(turns.trace().toString()).isNull();
    assertThat(session(id).path("state").asText()).isEqualTo("FAILED");
    assertThat(progress(id).path("errorCode").asText()).isEqualTo("UNSUPPORTED_STEP");
    assertThat(NEXT_ACTION_INTENTS)
        .containsExactly("page", "Username", "Password", "Sign in", "Open");
    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "NEXT_ACTION");
    assertThat(LANDINGS).isEmpty();
    assertThat(clarificationRows(id)).isZero();
  }

  @Test
  void anUnqualifiedOpenStillAsksWhichOneWithRegionLabelledChoices() throws Exception {
    Assumptions.assumeFalse(REAL, "the scripted model is replaced by the real provider here");
    useFiveSteps("Click Open", 30);
    String id = startAndPlan();
    Turns turns = advanceUntil(id, 5, 40);
    assertThat(turns.state()).as(turns.trace().toString()).isEqualTo("AWAITING_CLARIFICATION");
    assertThat(openObligation(id).path("scopeIntent").isNull()).isTrue();
    JsonNode question = sessions.read(user, id, "clarification");
    assertThat(question.path("reason").asText()).isEqualTo("AMBIGUOUS_TARGET");
    assertThat(question.path("choices")).hasSize(2);
    String primary = null;
    List<String> regions = new ArrayList<>();
    for (JsonNode choice : question.path("choices")) {
      assertThat(choice.path("safeLabel").asText()).isEqualTo("Open");
      assertThat(choice.path("labelSource").asText()).isEqualTo("PAGE");
      regions.add(choice.path("region").asText());
      if (choice.path("region").asText().equals("Primary workspace")) {
        primary = choice.path("choiceId").asText();
      }
    }
    assertThat(regions).containsExactlyInAnyOrder("Primary workspace", "Secondary workspace");
    answer(id, question, primary);
    Turns resumed = advanceUntil(id, 5, 40);
    assertThat(resumed.failure()).as(resumed.trace().toString()).isNull();
    assertThat(resumed.stepIndex()).isEqualTo(5);
    assertThat(clarificationRows(id)).isEqualTo(1);
    assertThat(LANDINGS).containsExactly("/protected/primary");
  }

  /**
   * ADR-SC-007 D-6: two elements with the same role, name and evidence (here both "Open" in the
   * same region) cannot be told apart by what the backend keeps, so offering them as the choice
   * between them is refused every time. Three refusals end the run as a surface Studio cannot work
   * with, and neither button is clicked.
   */
  @Test
  void twoIdenticalMatchesInTheNamedRegionCannotBeToldApartAndTheRunStopsWithoutClicking()
      throws Exception {
    Assumptions.assumeFalse(REAL, "the scripted model is replaced by the real provider here");
    chooseVariant = "same";
    useFiveSteps("Click Open in Primary workspace", 30);
    openScope = "Primary workspace";
    String id = startAndPlan();
    Turns turns = advanceUntil(id, 5, 40);
    // WI6 ordinal disposition: a complete current duplicate class may be clarified, never
    // auto-selected.
    assertThat(turns.state()).as(turns.trace().toString()).isEqualTo("AWAITING_CLARIFICATION");
    JsonNode question = sessions.read(user, id, "clarification");
    assertThat(question.path("choices")).hasSize(2);
    List<String> labels = new ArrayList<>();
    for (JsonNode choice : question.path("choices")) {
      labels.add(choice.path("safeLabel").asText());
    }
    assertThat(labels).containsExactlyInAnyOrder("Open (1 of 2)", "Open (2 of 2)");
    assertThat(clarificationRows(id)).isEqualTo(1);
    assertThat(LANDINGS).isEmpty();
    sessions.cancel(
        user,
        id,
        "cancel-ordinal",
        CONTRACTS.object().put("schemaVersion", 3).put("reason", "userRequested"));
    assertThat(session(id).path("state").asText()).isEqualTo("CANCELLED");
    assertThat(LANDINGS).isEmpty();
  }

  @Test
  void aValidOpenRefOutsideTheAuthoredRegionNeverPreparesOrInvokes() throws Exception {
    Assumptions.assumeFalse(REAL, "scripted adversarial provider is separate from the real opt-in");
    useFiveSteps("Click Open in Primary workspace", 30);
    openScope = "Primary workspace";
    String id = startAndPlan();
    Turns prefix = advanceUntil(id, 4, 40);
    assertThat(prefix.failure()).as(prefix.trace().toString()).isNull();
    assertThat(prefix.stepIndex()).isEqualTo(4);
    int prepares = PREPARE_CALLS.get(), dispatches = DISPATCH_CALLS.get();
    outsideScopeAttack = true;
    Turns refused = advanceUntil(id, 5, 40);
    assertThat(MALICIOUS_ACTIONS.get()).isPositive();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_model_attempts WHERE session_id=? AND"
                    + " kind='NEXT_ACTION' AND status='REJECTED' AND"
                    + " rejection_gate='NEXT_TARGET_INTENT'",
                Integer.class,
                id))
        .isPositive();
    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "NEXT_ACTION");
    assertThat(refused.stepIndex()).isEqualTo(4);
    assertThat(PREPARE_CALLS.get()).isEqualTo(prepares);
    assertThat(DISPATCH_CALLS.get()).isEqualTo(dispatches);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_actions WHERE session_id=? AND step_id=?",
                Integer.class,
                id,
                stepIds.get(4).toString()))
        .isZero();
    assertThat(LANDINGS).isEmpty();
    assertThat(clarificationRows(id)).isZero();
  }

  void answer(String id, JsonNode question, String choiceId) {
    assertThat(choiceId).isNotNull();
    sessions.clarify(
        user,
        id,
        "answer-" + UUID.randomUUID(),
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("clarificationId", question.path("clarificationId").asText())
            .put("generation", question.path("generation").asInt())
            .put("choiceId", choiceId));
  }

  /**
   * Opt-in (environment {@code W53_REAL_VERTEX}): the same four-step journey with the REAL direct
   * Vertex provider instead of the scripted model, at most {@link #REAL_CALL_CAP} provider sends,
   * no retry after a failed one. It prints only closed facts per call and per turn.
   */
  @Test
  void theRealVertexModelDrivesStepsOneToFour() throws Exception {
    Assumptions.assumeTrue(REAL, "set W53_REAL_VERTEX to run the real-provider journey");
    List<String> trace = new ArrayList<>();
    String id = createSession();
    try {
      translation.plan(controller, id, 0, "plan-" + id, command(id));
      trace.add("plan ok state=" + session(id).path("state").asText());
    } catch (RuntimeException refusal) {
      trace.add("plan failure=" + refusal.getClass().getSimpleName() + ":" + refusal.getMessage());
    }
    int stepIndex = progress(id).path("stepIndex").asInt();
    for (int turn = 0; turn < 10 && stepIndex < 4 && !REAL_ABORTED.get(); turn++) {
      String failure = null;
      try {
        translation.advance(controller, id, 1, "advance-" + turn, command(id));
      } catch (RuntimeException refusal) {
        failure =
            refusal.getClass().getSimpleName()
                + ":"
                + refusal.getMessage()
                + ":closedWire="
                + WIRE_DIAGNOSTICS;
      }
      stepIndex = progress(id).path("stepIndex").asInt();
      trace.add(
          "turn="
              + turn
              + " stepIndex="
              + stepIndex
              + " state="
              + session(id).path("state").asText()
              + " actions="
              + actionStates(id)
              + " failure="
              + failure);
      if (failure != null) {
        break;
      }
      if (session(id)
          .path("state")
          .asText()
          .matches("AWAITING_CLARIFICATION|FAILED|CANCELLED|EXPIRED|UNKNOWN_OUTCOME")) {
        break;
      }
    }
    var report =
        new StringBuilder("W53REAL calls(sent<=" + REAL_CALL_CAP + ")=" + REAL_CALLS.size() + "\n");
    REAL_CALLS.forEach(line -> report.append("W53REAL ").append(line).append('\n'));
    trace.forEach(line -> report.append("W53REAL ").append(line).append('\n'));
    report.append(
        "W53REAL sessionState="
            + session(id).path("state").asText()
            + " errorCode="
            + progress(id).path("errorCode").asText("-")
            + " loginPosts="
            + LOGIN_POSTS.size()
            + "\n");
    System.out.print(report);
    String reportFile = System.getenv("W53_REPORT_FILE");
    if (reportFile != null) {
      Files.writeString(Path.of(reportFile), report.toString());
    }
    // The run is a measurement: it asserts only the cap, never the model's behaviour.
    assertThat(REAL_CALLS.stream().filter(line -> !line.contains("NOT_SENT")).count())
        .isLessThanOrEqualTo(REAL_CALL_CAP);
  }

  List<String> actionStates(String id) {
    return jdbc.queryForList(
        "SELECT document->>'state' FROM studio_guided_actions WHERE s"
            + "ession_id=? ORDER BY ordinal",
        String.class,
        id);
  }

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
}
