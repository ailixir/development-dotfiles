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
import java.util.concurrent.atomic.AtomicInteger;
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
 * W53 (STUDIO-OBS-009/010, real-stack case 432): the whole controller-to-runner path of the login
 * journey on the real target page, with a scripted model. The model only ever plans and selects:
 * SOURCE_PLAN covers the authored steps and STEP_CODE writes the Playwright code of the first
 * remaining step from the step's own saved values and the observation's outline. Nothing else is
 * stubbed: real PostgreSQL, the production {@code GuidedTranslationService.advance} loop (recover,
 * refresh, verify, call, apply, runner prepare, admit, dispatch), mutually authenticated HTTPS in
 * both directions, and the real folded runner with actual Chromium.
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

  /** The /protected/* pages the browser reached, in order: where an Open click actually landed. */
  static final List<String> LANDINGS = new CopyOnWriteArrayList<>();

  /** Page-resident canaries of the read-only page: Playwright's call log prints such text. */
  static final String CANARY_ATTRIBUTE = "canary-attr-" + UUID.randomUUID();

  static final String CANARY_VALUE = "canary-value-" + UUID.randomUUID();

  /** When set, the code of step {@code i} is {@code CODE_BY_STEP.get(i)} (a test's own script). */
  static volatile List<String> codeByStep;

  static final AtomicInteger PREPARE_CALLS = new AtomicInteger();
  static final AtomicInteger DISPATCH_CALLS = new AtomicInteger();
  static final List<String> WIRE_DIAGNOSTICS = new CopyOnWriteArrayList<>();

  /** The target intents of the STEP_CODE requests, in order (one entry per model call). */
  static final List<String> STEP_INTENTS = new CopyOnWriteArrayList<>();

  /** The authored steps of the current test (set before the session is created). */
  static volatile List<UUID> stepIds = List.of();

  static volatile List<String> stepTexts = List.of();

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
              body = CHOOSE_PAGE.getBytes(StandardCharsets.UTF_8);
            } else if (path.equals("/readonly")) {
              body =
                  page("<h1>Read-only</h1><label>Field<input name=\"field\" type=\"text\""
                          + " readonly value=\""
                          + CANARY_VALUE
                          + "\" data-canary=\""
                          + CANARY_ATTRIBUTE
                          + "\"></label>")
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

  // ---- the scripted model (ADR-SC-008: it plans the steps and writes one step's code) ----

  /** S-min SOURCE_PLAN: one open obligation per authored step, no capture, no use. */
  static ObjectNode sourcePlan(JsonNode request) {
    ObjectNode plan = CONTRACTS.object();
    var references = plan.putArray("sourceReferences");
    var obligations = plan.putArray("obligations");
    String[] intents = {"page", "Username", "Password", "Sign in", "Open"};
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
        if (reference.path("stepId").asText().equals(stepIds.get(i).toString())
            && (reference.path("kind").asText().equals("secretRef")
                || reference.path("kind").asText().equals("nonsecretText"))) {
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
    plan.putArray("stepSections");
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

  /** The secret id (referenceName) of the secretRef configuration reference of the step. */
  static String secretIdFor(JsonNode request, String step) {
    for (JsonNode reference : request.path("context").path("configurationReferences")) {
      if (reference.path("stepId").asText().equals(step)
          && reference.path("kind").asText().equals("secretRef")) {
        return reference.path("referenceName").asText();
      }
    }
    throw new IllegalStateException("SECRET_REFERENCE_MISSING:" + step);
  }

  /** STEP_CODE: the code of the first remaining step, from the step's own saved values. */
  static ObjectNode stepCode(JsonNode request, ObjectNode response) {
    JsonNode chosen = request.path("context").path("obligations").path(0);
    if (chosen.isMissingNode()) {
      throw new IllegalStateException("NO_REMAINING_OBLIGATION");
    }
    String step = chosen.path("stepId").asText();
    String intent = chosen.path("targetIntent").asText();
    STEP_INTENTS.add(intent);
    String code;
    if (codeByStep != null) {
      response
          .put("status", "CODE")
          .put("code", codeByStep.get(stepIds.indexOf(java.util.UUID.fromString(step))))
          .putArray("captures");
      return response;
    }
    switch (intent) {
      case "page" -> code = "await page.goto('" + ORIGIN + "/login');";
      case "Username" ->
          code =
              "await page.getByLabel('Username').fill(inputs['"
                  + inputIdFor(request, step, "nonsecretText")
                  + "']);";
      case "Password" ->
          code =
              "await page.getByLabel('Password').fill(secrets['"
                  + secretIdFor(request, step)
                  + "']);";
      case "Sign in" -> code = "await page.getByRole('button', { name: 'Sign in' }).click();";
      case "Open" -> {
        List<GuidedOutline.Line> matches = openCandidates(request);
        if (!chosen.has("selectedChoice") && matches.size() >= 2) {
          return clarification(request, response, matches);
        }
        // An accepted choice names the element the author picked; open that region's button.
        String region =
            chosen.has("selectedChoice")
                ? regionOfRef(request, chosen.path("selectedChoice").path("ref").asText())
                : "";
        code =
            "await page.getByRole('region', { name: '"
                + region
                + "' }).getByRole('button', { name: 'Open' }).click();";
      }
      default -> throw new IllegalStateException("UNSCRIPTED_" + intent);
    }
    response.put("status", "CODE").put("code", code).putArray("captures");
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

  static String regionOfRef(JsonNode request, String ref) {
    for (GuidedOutline.Line line : shown(request)) {
      if (ref.equals(line.ref())) {
        return regionOf(line);
      }
    }
    throw new IllegalStateException("CHOSEN_REF_NOT_SHOWN");
  }

  /** The shown elements named "Open". */
  static List<GuidedOutline.Line> openCandidates(JsonNode request) {
    List<GuidedOutline.Line> matches = new ArrayList<>();
    for (GuidedOutline.Line line : shown(request)) {
      if (line.name() != null && line.name().equalsIgnoreCase("Open")) {
        matches.add(line);
      }
    }
    return matches;
  }

  /** Several elements answer the label: ask, offering exactly those elements by their refs. */
  static ObjectNode clarification(
      JsonNode request, ObjectNode response, List<GuidedOutline.Line> matches) {
    response.put("status", "CLARIFICATION");
    var choices =
        response.putObject("question").put("reason", "AMBIGUOUS_TARGET").putArray("choices");
    int index = 0;
    for (GuidedOutline.Line line : matches) {
      choices.addObject().put("ref", line.ref()).put("safeLabel", "Option " + ++index);
    }
    return response;
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
    if (!kind.equals("STEP_CODE")) {
      throw new IllegalStateException("UNEXPECTED_" + kind);
    }
    return stepCode(request, response);
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
    STEP_INTENTS.clear();
    codeByStep = null;
    PREPARE_CALLS.set(0);
    DISPATCH_CALLS.set(0);
    WIRE_DIAGNOSTICS.clear();
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
    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "STEP_CODE");
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
                + WIRE_DIAGNOSTICS
                + " RUNNERLOG="
                + runnerLogTail();
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

  /**
   * Re-creates the authored test with a fifth step. No session exists yet, so deleting and
   * re-inserting the row keeps revision 1.
   */
  void useFiveSteps(String openText, int timeoutSeconds) throws Exception {
    useSteps(
        List.of(
            "Open " + ORIGIN + "/login",
            "Fill Username with <var USER>",
            "Fill Password with <secret PASS>",
            "Click Sign in",
            openText),
        timeoutSeconds);
  }

  void useSteps(List<String> texts, int timeoutSeconds) throws Exception {
    stepTexts = texts;
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

  String runnerLogTail() {
    try {
      String log = Files.readString(workerHarness.logFile());
      return log.substring(Math.max(0, log.length() - 3000));
    } catch (java.io.IOException unreadable) {
      return "unreadable";
    }
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

  @Test
  void anUnqualifiedOpenStillAsksWhichOneAndTheAnswerOpensThatWorkspace() throws Exception {
    useFiveSteps("Click Open", 30);
    String id = startAndPlan();
    Turns turns = advanceUntil(id, 5, 40);
    assertThat(turns.state()).as(turns.trace().toString()).isEqualTo("AWAITING_CLARIFICATION");
    JsonNode question = sessions.read(user, id, "clarification");
    assertThat(question.path("reason").asText()).isEqualTo("AMBIGUOUS_TARGET");
    assertThat(question.path("choices")).hasSize(2);
    assertThat(LANDINGS).isEmpty();
    answer(id, question, question.path("choices").get(0).path("choiceId").asText());
    Turns resumed = advanceUntil(id, 5, 40);
    assertThat(resumed.failure()).as(resumed.trace().toString()).isNull();
    assertThat(resumed.stepIndex()).isEqualTo(5);
    assertThat(clarificationRows(id)).isEqualTo(1);
    // The answer, not the first match, decided where the click landed.
    assertThat(LANDINGS).hasSize(1);
    assertThat(LANDINGS.get(0)).startsWith("/protected/");
  }

  /**
   * ADR-SC-008 FR-5 / AC9: the step's own Playwright code fails after its first action (the field
   * is read-only, so the fill times out with a call log that prints the element). Nothing the page
   * showed (its attributes, its prefilled value) may reach a stored row or the runner's log.
   */
  @Test
  void aPostFenceStepFailureLeavesNoPageTextInAnyStoredOrLoggedError() throws Exception {
    useSteps(List.of("Open " + ORIGIN + "/readonly", "Type x into Field"), 30);
    codeByStep =
        List.of(
            "await page.goto('" + ORIGIN + "/readonly');",
            "await page.getByLabel('Field').fill('x', { timeout: 1500 });");
    String id = startAndPlan();
    Turns turns = advanceUntil(id, 2, 40);

    // The first step opened the page; the second step's code ran and failed.
    assertThat(actionStates(id)).as(turns.trace().toString()).startsWith("SUCCEEDED").hasSize(2);
    assertThat(actionStates(id).get(1)).isNotEqualTo("SUCCEEDED");
    assertThat(session(id).path("state").asText()).isNotEqualTo("CANCELLED");
    StringBuilder stored = new StringBuilder();
    for (String table :
        List.of(
            "studio_guided_sessions",
            "studio_guided_actions",
            "studio_guided_model_attempts",
            "studio_guided_preparations")) {
      stored.append(
          String.join(
              "\n",
              jdbc.queryForList(
                  "SELECT row_to_json(t)::text FROM " + table + " t WHERE session_id=?",
                  String.class,
                  id)));
    }
    assertThat(stored.toString())
        .isNotEmpty()
        .doesNotContain(CANARY_ATTRIBUTE)
        .doesNotContain(CANARY_VALUE);
    assertThat(Files.readString(workerHarness.logFile()))
        .doesNotContain(CANARY_ATTRIBUTE)
        .doesNotContain(CANARY_VALUE);
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

  /** The action states in authored step order (every learned step's action has ordinal 0). */
  List<String> actionStates(String id) {
    var rows =
        jdbc.queryForList(
            "SELECT step_id, document->>'state' AS state FROM studio_guided_actions WHERE"
                + " session_id=?",
            id);
    return rows.stream()
        .sorted(
            java.util.Comparator.comparingInt(
                row -> stepIds.indexOf(UUID.fromString(String.valueOf(row.get("step_id"))))))
        .map(row -> String.valueOf(row.get("state")))
        .toList();
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
