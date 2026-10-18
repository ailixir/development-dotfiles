package com.citi.put.checks.studio.guided.policy;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-014 AC-1 (c2b-spec publicRoutes): the five governed-policy routes over real HTTP,
 * through the whole filter chain: status codes, the Studio {@code {error, message}} envelope, the
 * closed {@code policyView} body, and {@code 400 INVALID_POLICY} for a body the closed contract
 * refuses (never the guided 422). Approval records are synthetic.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class ObservationPolicyRouteIT {

  private static final String APPROVERS = "studio-policy-approvers";
  private static final String BASE = "/api/v1/studio/guided-policies";
  private static final String APP = ObservedPublicationFixture.APPLICATION;
  private static final String ENV = "Production";

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    registry.add("studio.guided-authoring.policy.approver-groups", () -> APPROVERS);
  }

  @Autowired private TestRestTemplate http;
  @org.springframework.boot.test.web.server.LocalServerPort private int port;
  @Autowired private JdbcTemplate jdbc;
  private final ObjectMapper json = new ObjectMapper();
  private String csi;
  private String owner;

  @BeforeEach
  void setUp() {
    csi = "R" + UUID.randomUUID().toString().substring(0, 10);
    owner = "route-owner-" + csi + "@citi.com";
    var fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(owner);
    fixtures.seedCsi(csi, owner);
  }

  @Test
  void createReadVersionApproveAndLookupFollowTheContract() throws Exception {
    ResponseEntity<String> created = post(BASE, createBody(), as(owner, csi + ":owner", ""));
    assertThat(created.getStatusCode().value()).as(created.getBody()).isEqualTo(201);
    JsonNode view = json.readTree(created.getBody());
    String id = view.path("policyId").asText();
    assertThat(view.path("activeVersion").isNull()).isTrue();
    assertThat(view.path("latestVersion").asInt()).isEqualTo(1);
    assertThat(view.path("latest").path("document").path("sideEffectStance").asText())
        .isEqualTo("CLARIFY_FIRST");

    assertThat(get(BASE + "/" + id, as(owner, csi + ":owner", "")).getStatusCode().value())
        .isEqualTo(200);
    assertThat(
            get(
                    BASE + "?csiId=" + csi + "&applicationId=" + APP + "&environmentId=" + ENV,
                    as(owner, csi + ":owner", ""))
                .getStatusCode()
                .value())
        .isEqualTo(200);

    ObjectNode version = json.createObjectNode().put("schemaVersion", 3).put("expectedVersion", 1);
    version.set("document", document("ALLOW"));
    assertThat(
            post(BASE + "/" + id + "/versions", version, as(owner, csi + ":owner", ""))
                .getStatusCode()
                .value())
        .isEqualTo(201);
    ResponseEntity<String> stale =
        post(BASE + "/" + id + "/versions", version, as(owner, csi + ":owner", ""));
    assertThat(stale.getStatusCode().value()).isEqualTo(409);
    assertThat(json.readTree(stale.getBody()).path("error").asText()).isEqualTo("STALE_REVISION");

    ObjectNode approval =
        json.createObjectNode().put("schemaVersion", 3).put("approvalRef", "SEC-1");
    ResponseEntity<String> notApprover =
        post(BASE + "/" + id + "/versions/2/approval", approval, as(owner, csi + ":owner", ""));
    assertThat(notApprover.getStatusCode().value()).isEqualTo(403);
    assertThat(json.readTree(notApprover.getBody()).path("error").asText())
        .isEqualTo("STUDIO_FORBIDDEN");
    ResponseEntity<String> approved =
        post(
            BASE + "/" + id + "/versions/2/approval",
            approval,
            as("route-approver@citi.com", "", APPROVERS));
    assertThat(approved.getStatusCode().value()).as(approved.getBody()).isEqualTo(200);
    assertThat(json.readTree(approved.getBody()).path("activeVersion").asInt()).isEqualTo(2);
    assertThat(
            post(
                    BASE + "/" + id + "/versions/1/approval",
                    approval,
                    as("route-approver@citi.com", "", APPROVERS))
                .getStatusCode()
                .value())
        .as("only the latest unapproved version")
        .isEqualTo(409);
  }

  @Test
  void aBodyTheClosedContractRefusesIsA400InvalidPolicyAndWritesNothing() throws Exception {
    ObjectNode body = createBody();
    body.put("unexpected", true);

    ResponseEntity<String> refused = post(BASE, body, as(owner, csi + ":owner", ""));

    assertThat(refused.getStatusCode().value()).isEqualTo(400);
    JsonNode error = json.readTree(refused.getBody());
    assertThat(error.path("error").asText()).isEqualTo("INVALID_POLICY");
    assertThat(error.path("message").asText()).doesNotContain("unexpected");
    assertThat(policies()).isZero();
    assertThat(get(BASE + "/not-a-uuid", as(owner, csi + ":owner", "")).getStatusCode().value())
        .isEqualTo(400);
  }

  @Test
  void forbiddenAndUnknownAreTheSame403AndLookupIs404OnlyAfterAuthorization() throws Exception {
    ResponseEntity<String> stranger =
        post(BASE, createBody(), as("route-stranger@citi.com", "", ""));
    assertThat(stranger.getStatusCode().value()).isEqualTo(403);
    assertThat(policies()).isZero();
    assertThat(
            get(BASE + "/" + UUID.randomUUID(), as(owner, csi + ":owner", ""))
                .getStatusCode()
                .value())
        .isEqualTo(403);
    String lookup = BASE + "?csiId=" + csi + "&applicationId=" + APP + "&environmentId=" + ENV;
    assertThat(get(lookup, as("route-stranger@citi.com", "", "")).getStatusCode().value())
        .isEqualTo(403);
    ResponseEntity<String> missing = get(lookup, as(owner, csi + ":owner", ""));
    assertThat(missing.getStatusCode().value()).isEqualTo(404);
    assertThat(json.readTree(missing.getBody()).path("error").asText())
        .isEqualTo("GUIDED_POLICY_NOT_FOUND");

    assertThat(post(BASE, createBody(), as(owner, csi + ":owner", "")).getStatusCode().value())
        .isEqualTo(201);
    ResponseEntity<String> again = post(BASE, createBody(), as(owner, csi + ":owner", ""));
    assertThat(again.getStatusCode().value()).isEqualTo(409);
    assertThat(json.readTree(again.getBody()).path("error").asText())
        .isEqualTo("GUIDED_POLICY_EXISTS");
  }

  /**
   * QA TEST-004: every policy route declares {@code 401 SessionUnauthorized}. A request with no
   * session is refused 401 with the platform envelope on each of the five routes, and nothing is
   * written. Sent with the JDK client: {@code TestRestTemplate}'s {@code HttpURLConnection} turns a
   * 401 on a streamed POST body into a client exception instead of a response.
   */
  @Test
  void everyPolicyRouteRefusesAnUnauthenticatedRequest401AndWritesNothing() throws Exception {
    String id = UUID.randomUUID().toString();
    String lookup = BASE + "?csiId=" + csi + "&applicationId=" + APP + "&environmentId=" + ENV;
    ObjectNode version = json.createObjectNode().put("schemaVersion", 3).put("expectedVersion", 1);
    version.set("document", document("ALLOW"));
    ObjectNode approval =
        json.createObjectNode().put("schemaVersion", 3).put("approvalRef", "SEC-1");
    var client =
        java.net.http.HttpClient.newBuilder()
            .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
            .build();
    java.util.List<java.net.http.HttpRequest> requests =
        java.util.List.of(
            unauthenticated(lookup, null),
            unauthenticated(BASE + "/" + id, null),
            unauthenticated(BASE, createBody()),
            unauthenticated(BASE + "/" + id + "/versions", version),
            unauthenticated(BASE + "/" + id + "/versions/1/approval", approval));
    for (var request : requests) {
      var response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
      assertThat(response.statusCode())
          .as(request.method() + " " + request.uri().getPath())
          .isEqualTo(401);
      assertThat(json.readTree(response.body()).path("error").isObject())
          .as("platform SessionUnauthorized envelope: %s", response.body())
          .isTrue();
    }
    assertThat(policies()).as("an unauthenticated request writes nothing").isZero();
  }

  private java.net.http.HttpRequest unauthenticated(String path, JsonNode body) {
    var builder =
        java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://localhost:" + port + path))
            .header("Content-Type", "application/json");
    return body == null
        ? builder.GET().build()
        : builder.POST(java.net.http.HttpRequest.BodyPublishers.ofString(body.toString())).build();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private int policies() {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_policies WHERE csi_id=?", Integer.class, csi);
  }

  private ObjectNode createBody() {
    ObjectNode body =
        json.createObjectNode()
            .put("schemaVersion", 3)
            .put("csiId", csi)
            .put("applicationId", APP)
            .put("environmentId", ENV);
    body.set("document", document(null));
    return body;
  }

  private ObjectNode document(String stance) {
    ObjectNode document = json.createObjectNode().put("schemaVersion", 3);
    if (stance != null) {
      document.put("sideEffectStance", stance);
    }
    document.putArray("allowedOrigins").add(ObservedPublicationFixture.ORIGIN);
    document
        .putObject("applicationPolicy")
        .put("policyRuleId", "app")
        .put("allowStructuralDiscovery", true)
        .putArray("readGrants");
    return document;
  }

  private HttpHeaders as(String email, String ownership, String roles) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", roles);
    headers.set("X-User-Csi-Ownership", ownership);
    return ObservedPublicationFixture.withSession(headers);
  }

  private ResponseEntity<String> post(String path, JsonNode body, HttpHeaders headers) {
    return http.exchange(
        path, HttpMethod.POST, new HttpEntity<>(body.toString(), headers), String.class);
  }

  private ResponseEntity<String> get(String path, HttpHeaders headers) {
    return http.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
  }
}
