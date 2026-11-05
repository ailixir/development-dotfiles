package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.security.CoreServiceClient;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.translation.GenAiGuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationService;
import com.citi.put.checks.studio.readiness.ExecutionReadinessService;
import com.citi.put.checks.support.TestPostgresDatabase;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestContextManager;

/** Boots the real application. The only custom bean is the documented account connection SPI. */
@org.junit.jupiter.api.parallel.Execution(org.junit.jupiter.api.parallel.ExecutionMode.SAME_THREAD)
class ObservedProfileDriftTest {
  static final GuidedContracts CONTRACTS = new GuidedContracts();
  static final String CSI = "PROFILE-CSI",
      PRINCIPAL = "profile-owner",
      ORIGIN = "https://orders.example.test";

  @TestConfiguration(proxyBeanMethods = false)
  static class AccountConnection {}

  static volatile Map<String, String> currentProperties = Map.of();

  @SpringBootTest(
      classes = {ChecksApplication.class, AccountConnection.class},
      webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
      properties = "spring.profiles.active=test")
  @ActiveProfiles("test")
  @DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
  static class ApplicationFixture {
    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
      currentProperties.forEach((key, value) -> registry.add(key, () -> value));
    }
  }

  static final class Peer implements AutoCloseable {
    final HttpServer server;
    final AtomicInteger core = new AtomicInteger(),
        model = new AtomicInteger(),
        validator = new AtomicInteger(),
        other = new AtomicInteger();

    Peer() throws Exception {
      server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      server.createContext(
          "/",
          exchange -> {
            String path = exchange.getRequestURI().getPath();
            int status = 503;
            String result = "{}";
            if (path.equals("/api/v1/users/me")) {
              core.incrementAndGet();
              if ("put_session=profile-session"
                  .equals(exchange.getRequestHeaders().getFirst("Cookie"))) {
                status = 200;
                result =
                    "{\"user_id\":\"profile-owner\",\"email\":\"profile@example.test\",\"name\":\"Profile"
                        + " owner\",\"department\":\"fixture\",\"roles\":[],\"csi_ownership"
                        + "\":[{\"csi_id\":\"PROFILE-CSI\",\"role\":\"owner\"}]}";
              } else {
                status = 401;
              }
            } else if (path.contains("generateContent")) {
              model.incrementAndGet();
            } else if (path.contains("validate")) {
              validator.incrementAndGet();
            } else {
              other.incrementAndGet();
            }
            exchange.getRequestBody().readAllBytes();
            byte[] bytes = result.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
          });
      server.start();
    }

    String origin() {
      return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @Override
    public void close() {
      server.stop(0);
    }
  }

  @ParameterizedTest(name = "ChecksApplication publication={0} replay={1}")
  @CsvSource({"false,false", "false,true", "true,false", "true,true"})
  void realApplicationComposesAllFlagPairsAndRetainsProfileBoundaries(
      boolean publication, boolean replay) throws Exception {
    try (var database = new TestPostgresDatabase();
        var peer = new Peer()) {
      database.start();
      Path controllerToken = Files.createTempFile("profile-controller-", ".token");
      Files.writeString(controllerToken, "synthetic-never-dispatched-controller-token");
      JsonNode fixture =
          CONTRACTS.parse(
              Files.readString(
                  Path.of(
                      "../studio-runner/fixtures/observed-reference/fresh-order-reference.json")));
      JsonNode profile = fixture.path("artifact").path("profile");
      var build =
          CONTRACTS
              .object()
              .put("profileHash", GuidedContracts.hash(profile))
              .put("schemaBundleHash", "a".repeat(64))
              .put("referenceBundleHash", "b".repeat(64))
              .put("executableImageDigest", "c".repeat(64))
              .put("chromiumBuild", "controlled-catalog-not-a-runtime-attestation");
      var entry = CONTRACTS.object();
      entry.set("profile", profile);
      entry.set("build", build);
      var catalog = CONTRACTS.object().putArray("catalog").add(entry);
      String model = "benign-learning-default-" + publication + "-" + replay;
      String[] options = {
        "--spring.profiles.active=test",
        "--server.port=0",
        "--spring.main.banner-mode=off",
        "--logging.level.root=WARN",
        "--spring.datasource.url=" + database.getJdbcUrl(),
        "--spring.datasource.username=" + database.getUsername(),
        "--spring.datasource.password=" + database.getPassword(),
        "--spring.datasource.driver-class-name=org.postgresql.Driver",
        "--spring.datasource.hikari.maximum-pool-size=5",
        "--checks.security.bypass.identity-headers=false",
        "--checks.security.bypass.core-service=false",
        "--checks.security.bypass.csi-read=false",
        "--checks.local-dev-auth.enabled=false",
        "--checks.core-service.base-url=" + peer.origin(),
        "--checks.csi.base-url=" + peer.origin(),
        "--checks.dc.enabled=false",
        "--checks.sources.UI_TEST=true",
        "--checks.scheduling.dispatcher-enabled=false",
        "--checks.reports.delivery-enabled=false",
        "--studio.dispatcher.enabled=false",
        "--studio.guided.publication.enabled=" + publication,
        "--studio.observed-replay.enabled=" + replay,
        "--studio.observed-replay.catalog-json=" + catalog,
        "--studio.guided-authoring.enabled=true",
        "--studio.guided-authoring.translation.enabled=true",
        "--studio.guided-authoring.translation.poll-ms=86400000",
        "--studio.guided-authoring.runner-origin=https://127.0.0.1:"
            + peer.server.getAddress().getPort(),
        "--studio.guided-authoring.translation.controller-origin=https://127.0.0.1:"
            + peer.server.getAddress().getPort(),
        "--studio.guided-authoring.controller-token-file=" + controllerToken,
        "--studio.gateway.provider=vertex",
        "--studio.gateway.endpoint=" + peer.origin(),
        "--studio.gateway.credentials.mode=none",
        "--studio.gateway.project=profile-test",
        "--studio.gateway.location=profile-region",
        "--studio.gateway.model=" + model,
        "--studio.runner.base-url=" + peer.origin(),
        "--studio.runner.service-identity-token=profile-runner-token"
      };
      var properties = new java.util.LinkedHashMap<String, String>();
      for (String option : options) {
        int split = option.indexOf('=');
        properties.put(option.substring(2, split), option.substring(split + 1));
      }
      currentProperties = Map.copyOf(properties);
      var manager = new TestContextManager(ApplicationFixture.class);
      try {
        manager.beforeTestClass();
        manager.prepareTestInstance(new ApplicationFixture());
        var application =
            (ServletWebServerApplicationContext) manager.getTestContext().getApplicationContext();
        assertThat(application.getEnvironment().getActiveProfiles()).containsExactly("test");
        assertThat(application.getBean(GuidedPublicationProperties.class).enabled())
            .isEqualTo(publication);
        assertThat(application.getBean(ObservedReplayProperties.class).enabled()).isEqualTo(replay);
        for (Class<?> type :
            List.of(
                GuidedPlanPublisher.class,
                GuidedPublicationController.class,
                GuidedPublicationResultProjector.class,
                HttpRunnerDispatchClient.class,
                ObservedRevisionVerifier.class,
                ObservedReplayAuthorization.class,
                ExecutionReadinessService.class,
                GuidedTranslationService.class,
                CoreServiceClient.class)) {
          assertThat(application.getBean(type)).as(type.getSimpleName()).isNotNull();
        }
        assertThat(application.getBean(GuidedSessionAccess.class))
            .isInstanceOf(GuidedProductionSessionAccess.class);
        assertThat(application.getBean(GuidedLlmGatewayClient.class))
            .isInstanceOf(GenAiGuidedLlmGatewayClient.class);
        assertThat(application.getBean(StudioGatewayProperties.class).model()).isEqualTo(model);
        ObservedReplayPins pins = application.getBean(ObservedReplayPins.class);
        assertThat(pins.selected()).isEqualTo(entry);
        assertThat(pins.supported(profile, build)).isEqualTo(entry);
        var unsupported =
            PublicationContracts.copy(profile).put("executor", "unsupported-execution");
        assertThatThrownBy(() -> pins.supported(unsupported, build))
            .isInstanceOf(GuidedSessionException.class)
            .hasMessageContaining("RUNTIME_INCOMPATIBLE");
        var revokedBuild = build.deepCopy().put("executableImageDigest", "d".repeat(64));
        assertThatThrownBy(() -> pins.supported(profile, revokedBuild))
            .isInstanceOf(GuidedSessionException.class)
            .hasMessageContaining("RUNTIME_INCOMPATIBLE");
        // Each real context has a distinct learning-model default and the same execution catalog.
        assertThat(
                fixture.path("basis").path("learningProvenance").path("configuredModel").isNull())
            .isTrue();
        assertThat(pins.supported(fixture.path("artifact").path("profile"), build))
            .isEqualTo(entry);
        JdbcTemplate jdbc = application.getBean(JdbcTemplate.class);
        UUID testId = seedAuthoring(jdbc);
        // STUDIO-OBS-014 S3: a learning start needs an approved governed policy for its scope.
        int port = ((ServletWebServerApplicationContext) application).getWebServer().getPort();
        String origin = "http://127.0.0.1:" + port;
        HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
        var start =
            CONTRACTS
                .object()
                .put("schemaVersion", 3)
                .put("testId", testId.toString())
                .put("sourceRevision", "1")
                .put("configurationRevision", "1")
                .put("environmentId", "Development");
        start.set("versions", fixture.path("artifact").path("learnedPlan").path("versions"));
        var started = send(http, origin + "/api/v1/studio/guided-sessions", start);
        assertThat(started.statusCode()).as(started.body()).isEqualTo(202);
        JsonNode response = CONTRACTS.parse(started.body());
        JsonNode view = publication ? response.path("session") : response;
        assertThat(response.path("schemaVersion").asInt()).isEqualTo(3);
        String sessionId = view.path("sessionId").asText();
        assertThat(sessionId).isNotBlank();
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM studio_guided_publication_bases WHERE session_id=?",
                    Integer.class,
                    sessionId))
            .isEqualTo(publication ? 1 : 0);
        if (!publication) {
          assertThat(application.getBean(GuidedPublicationResultProjector.class).started(view))
              .isEqualTo(view);
          assertThat(
                  application
                      .getBean(GuidedPublicationResultProjector.class)
                      .read(null, null, sessionId, false))
              .isEmpty();
          var existing =
              http.send(
                  HttpRequest.newBuilder(
                          URI.create(origin + "/api/v1/studio/guided-sessions/" + sessionId))
                      .header("Cookie", "put_session=profile-session")
                      .GET()
                      .build(),
                  HttpResponse.BodyHandlers.ofString());
          assertThat(existing.statusCode()).as(existing.body()).isEqualTo(200);
          assertThat(CONTRACTS.parse(existing.body()).path("schemaVersion").asInt()).isEqualTo(3);
        }
        var finalize =
            CONTRACTS
                .object()
                .put("schemaVersion", 3)
                .put("expectedSourceRevision", "1")
                .put("expectedConfigurationRevision", "1");
        var refused =
            send(
                http,
                origin + "/api/v1/studio/guided-sessions/" + sessionId + "/finalize",
                finalize);
        assertThat(refused.statusCode()).as(refused.body()).isEqualTo(409);
        assertThat(CONTRACTS.parse(refused.body()).path("code").asText())
            .isEqualTo(
                !publication
                    ? "PUBLICATION_DISABLED"
                    : !replay ? "REPLAY_DISABLED" : "PUBLICATION_CONFLICT");
        if (!replay) {
          assertThatThrownBy(
                  () ->
                      application
                          .getBean(ObservedReplayAuthorizer.class)
                          .authorize(testId, null, null))
              .isInstanceOf(GuidedSessionException.class)
              .hasMessageContaining("RUNTIME_INCOMPATIBLE");
        } else {
          assertThatThrownBy(
                  () ->
                      application
                          .getBean(ObservedReplayAuthorizer.class)
                          .authorize(testId, null, null))
              .isInstanceOf(GuidedSessionException.class)
              .hasMessageContaining("UNAUTHENTICATED");
        }
        assertThatThrownBy(
                () -> application.getBean(ObservedRevisionVerifier.class).verify(UUID.randomUUID()))
            .isInstanceOf(GuidedSessionException.class)
            .hasMessageContaining(replay ? "MISSING_SOURCE" : "RUNTIME_INCOMPATIBLE");
        assertThat(application.getBeansOfType(ObservedReplayAuthorization.class)).hasSize(1);
        for (String table :
            List.of(
                "studio_guided_model_attempts",
                "studio_guided_actions",
                "studio_guided_publications",
                "ui_test_executions")) {
          assertThat(jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class))
              .as(table)
              .isZero();
        }
        assertThat(peer.core.get()).isPositive();
        assertThat(peer.model.get()).isZero();
        assertThat(peer.validator.get()).isZero();
        assertThat(peer.other.get()).isZero();
      } finally {
        try {
          manager.afterTestClass();
        } finally {
          Files.deleteIfExists(controllerToken);
          currentProperties = Map.of();
        }
      }
    }
  }

  static HttpResponse<String> send(HttpClient http, String uri, JsonNode body) throws Exception {
    return http.send(
        HttpRequest.newBuilder(URI.create(uri))
            .timeout(Duration.ofSeconds(20))
            .header("Cookie", "put_session=profile-session")
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", UUID.randomUUID().toString())
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build(),
        HttpResponse.BodyHandlers.ofString());
  }

  static UUID seedAuthoring(JdbcTemplate jdbc) throws Exception {
    jdbc.update(
        "INSERT INTO users(sso_id,name,email) VALUES ('profile-owner','Profile"
            + " owner','profile@example.test') ON CONFLICT(email) DO NOTHING");
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) VALUES"
            + " (?,'Profile','fixture','LOW','profile@example.test','Development') ON CONFLICT(id)"
            + " DO NOTHING",
        CSI);
    UUID testId = UUID.randomUUID();
    var authoring =
        new AuthoringV2Request(
            2,
            null,
            List.of(
                new AuthoringStep(
                    UUID.randomUUID(), "Open https://orders.example.test/start", null)));
    var mapper = new ObjectMapper().findAndRegisterModules();
    jdbc.update(
        "INSERT INTO"
            + " ui_tests(id,name,csi_id,environment,browser,steps,variables,"
            // Authoring identity remains the production v2 input.
            + "created_by,authoring,authoring_revision_inputs)"
            + " VALUES (?,'Profile flags',?,'Development','chromium','[\"Open"
            + " https://orders.example.test/start\"]','[]','profile@example.test',?::jsonb,?::jsonb)",
        testId,
        CSI,
        mapper.writeValueAsString(authoring),
        mapper.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())));
    return testId;
  }
}
