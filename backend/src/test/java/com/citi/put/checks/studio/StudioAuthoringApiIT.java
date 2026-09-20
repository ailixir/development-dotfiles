package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.citi.put.checks.studio.compile.CompilePipeline;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Real controller, authentication, validation, transaction and PostgreSQL parity tests. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class StudioAuthoringApiIT {
  private static final String BASE = "/api/v1/studio/tests";
  private static final String OWNER = "authoring-api@citi.com";
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper mapper;
  @Autowired JdbcTemplate jdbc;
  @MockBean CompilePipeline compilePipeline;

  @BeforeEach
  void seed() {
    jdbc.update(
        "INSERT INTO users (id,sso_id,name,email,created_at,is_active) "
            + "VALUES (?,?,?, ?,?,true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "authoring-api",
        "Author",
        OWNER,
        Timestamp.from(Instant.now()));
    jdbc.update(
        "INSERT INTO csi_systems "
            + "(id,name,business_unit,criticality,owner_email,environment,status,created_at,updated_at) "
            + "VALUES ('60406','Authoring','BU','HIGH',?,'Production','OPERATIONAL',?,?) "
            + "ON CONFLICT (id) DO NOTHING",
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void sharedValidSourcesRoundTripWithExactValuesAndRevisionIdentity() throws Exception {
    for (JsonNode fixture : fixtures("context-authoring-valid.json")) {
      if (!fixture.has("request")) {
        continue;
      }
      ObjectNode request = body(fixture.path("request"));
      JsonNode created = send(post(BASE), request, 201);
      JsonNode read =
          send(
              get(BASE + "/" + created.path("id").asText() + "?authoringSchemaVersion=2"),
              null,
              200);
      assertThat(read.path("steps")).isEqualTo(created.path("steps"));
      assertThat(read.path("sourceRevision").asLong()).isEqualTo(1);
      assertThat(read.path("configurationRevision").asLong()).isEqualTo(1);
      for (int i = 0; i < request.path("steps").size(); i++) {
        assertThat(read.path("steps").get(i).path("text"))
            .isEqualTo(request.path("steps").get(i).path("text"));
        assertThat(read.path("steps").get(i).path("id"))
            .isEqualTo(request.path("steps").get(i).path("id"));
      }
      if (fixture.path("name").asText().contains("login")) {
        assertThat(read.path("steps").toString())
            .contains("secretRef", "/login", "/reports/protected");
      }
    }
  }

  @Test
  void sharedInvalidSourcesAreRejectedBeforePersistence() throws Exception {
    for (JsonNode fixture : fixtures("context-authoring-invalid.json")) {
      JsonNode response = send(post(BASE), body(fixture.path("request")), 400);
      assertThat(mapper.convertValue(fixture.path("expectedCategories"), String[].class))
          .as(fixture.path("name").asText())
          .contains(response.path("error").asText());
    }
  }

  @Test
  void contextOnlySourceOnlyAndCombinedWritesIncrementEachDimensionOnceAndStaleWritesChangeNothing()
      throws Exception {
    ObjectNode request = body(valid("exact-literals"));
    JsonNode created = send(post(BASE), request, 201);
    String url = BASE + "/" + created.path("id").asText();
    tokens(request, created);
    request
        .putObject("globalContext")
        .putArray("entries")
        .addObject()
        .put("kind", "text")
        .put("value", "  context 雪\n  ");
    JsonNode contextual = send(put(url), request, 200);
    assertThat(contextual.path("sourceRevision").asLong()).isEqualTo(1);
    assertThat(contextual.path("configurationRevision").asLong()).isEqualTo(2);
    assertThat(send(put(url), request, 409).path("error").asText()).isEqualTo("STALE_REVISION");
    assertStableAuthoring(send(get(url + "?authoringSchemaVersion=2"), null, 200), contextual);
    tokens(request, contextual);
    ((ObjectNode) request.path("steps").get(0)).put("text", "edited");
    JsonNode changed = send(put(url), request, 200);
    assertThat(changed.path("sourceRevision").asLong()).isEqualTo(2);
    assertThat(changed.path("configurationRevision").asLong()).isEqualTo(2);
    tokens(request, changed);
    request.put("environment", "Staging");
    request
        .putObject("globalContext")
        .putArray("entries")
        .addObject()
        .put("kind", "text")
        .put("value", "also changed");
    JsonNode both = send(put(url), request, 200);
    assertThat(both.path("configurationRevision").asLong()).isEqualTo(3);
    assertThat(send(get(url), null, 200).path("steps").get(0).asText()).isEqualTo("edited");
  }

  @Test
  void legacyNegotiationNeverMintsIdsUntilExplicitV2Save() throws Exception {
    ObjectNode legacy = body(mapper.createObjectNode().set("steps", validLegacy().path("steps")));
    JsonNode created = send(post(BASE), legacy, 201);
    String url = BASE + "/" + created.path("id").asText();
    assertThat(send(get(url + "?authoringSchemaVersion=2"), null, 409).path("error").asText())
        .isEqualTo("LEGACY_AUTHORING");
    assertThat(send(get(url), null, 200).path("steps")).isEqualTo(legacy.path("steps"));
    assertThat(
            jdbc.queryForObject(
                "SELECT authoring IS NULL FROM ui_tests WHERE id=?",
                Boolean.class,
                UUID.fromString(created.path("id").asText())))
        .isTrue();
    ObjectNode promoted = body(validExpectedLegacy());
    tokens(promoted, created);
    JsonNode saved = send(put(url), promoted, 200);
    assertThat(saved.path("sourceRevision").asLong()).isEqualTo(1);
    assertThat(saved.path("configurationRevision").asLong()).isEqualTo(2);
    assertThat(send(get(url + "?authoringSchemaVersion=2"), null, 200).path("steps"))
        .isEqualTo(saved.path("steps"));
  }

  @Test
  void csiRefusalsAndMissingRevisionTokensLeaveTheDraftUnchanged() throws Exception {
    ObjectNode request = body(valid("exact-literals"));
    JsonNode created = send(post(BASE), request, 201);
    String url = BASE + "/" + created.path("id").asText();
    send(put(url), request, 400);
    tokens(request, created);
    request.put("csiId", "60499");
    assertThat(send(put(url), request, 409).path("error").asText()).isEqualTo("CSI_IMMUTABLE");
    mvc.perform(
            get(url + "?authoringSchemaVersion=2")
                .header("X-User-Id", "reader")
                .header("X-User-Email", OWNER)
                .header("X-User-Roles", "checks-user")
                .header("X-User-Csi-Ownership", "60499:owner"))
        .andExpect(status().isForbidden());
    assertThat(send(get(url + "?authoringSchemaVersion=2"), null, 200)).isEqualTo(created);
  }

  private ObjectNode body(JsonNode source) {
    ObjectNode body = ((ObjectNode) source).deepCopy();
    body.put("name", "Authoring API").put("csiId", "60406").put("environment", "Production");
    body.putArray("variables");
    body.putObject("configuration")
        .put("browser", "chromium")
        .put("timeoutSeconds", 30)
        .put("waitStrategy", "load")
        .putObject("viewport")
        .put("width", 1280)
        .put("height", 720);
    return body;
  }

  private void tokens(ObjectNode body, JsonNode response) {
    body.set("sourceRevision", response.path("sourceRevision"));
    body.set("configurationRevision", response.path("configurationRevision"));
  }

  private JsonNode send(MockHttpServletRequestBuilder call, JsonNode body, int expected)
      throws Exception {
    call.header("X-User-Id", "authoring-api")
        .header("X-User-Email", OWNER)
        .header("X-User-Roles", "checks-user")
        .header("X-User-Csi-Ownership", "60406:owner")
        .contentType("application/json");
    if (body != null) {
      call.content(body.toString());
    }
    return mapper.readTree(
        new String(
            mvc.perform(call)
                .andExpect(status().is(expected))
                .andReturn()
                .getResponse()
                .getContentAsByteArray(),
            StandardCharsets.UTF_8));
  }

  private static void assertStableAuthoring(JsonNode actual, JsonNode expected) {
    assertThat(actual.path("authoringSchemaVersion"))
        .isEqualTo(expected.path("authoringSchemaVersion"));
    assertThat(actual.path("globalContext")).isEqualTo(expected.path("globalContext"));
    assertThat(actual.path("steps")).isEqualTo(expected.path("steps"));
    assertThat(actual.path("sourceRevision")).isEqualTo(expected.path("sourceRevision"));
    assertThat(actual.path("configurationRevision"))
        .isEqualTo(expected.path("configurationRevision"));
  }

  private JsonNode fixtures(String file) throws Exception {
    return mapper
        .readTree(Files.readString(Path.of("../docs/specs/studio/examples", file)))
        .path("cases");
  }

  private JsonNode valid(String name) throws Exception {
    for (JsonNode fixture : fixtures("context-authoring-valid.json")) {
      if (fixture.path("name").asText().equals(name)) {
        return fixture.path("request");
      }
    }
    throw new IllegalArgumentException(name);
  }

  private JsonNode validLegacy() throws Exception {
    return fixtures("context-authoring-valid.json").get(0).path("legacy");
  }

  private JsonNode validExpectedLegacy() throws Exception {
    return fixtures("context-authoring-valid.json").get(0).path("expected");
  }
}
