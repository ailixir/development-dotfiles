package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.ConfirmFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.yaml.snakeyaml.Yaml;

/**
 * Story 10.9 AC-1, AC-3, AC-4 — {@code POST /tests/{id}/confirm-compile} on the wire.
 *
 * <p>The route is asserted against the frozen document rather than against a restatement of it: the
 * {@code 200} body's field set is read from the {@code TestDto} schema, and the set of {@code 409}
 * codes the route can produce is compared against the operation's own {@code x-conflict-codes} —
 * the mechanism ADR-002 §14.6 introduced so this claim is assertable rather than decorative.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    // ADR-002 §14.4 puts authorization before the lifecycle read, and the local profile's
    // LocalDevAuthFilter injects a checks-admin identity into every request that arrives without
    // one. With it on, every caller is an administrator and the ordering is unassertable.
    properties = "checks.local-dev-auth.enabled=false")
@ActiveProfiles("local")
class ConfirmCompileRouteTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");
  private static final String CONFIRM_PATH = "/tests/{id}/confirm-compile";
  private static final String OWNER = "confirm-owner@citi.com";
  private static final String VIEWER = "confirm-viewer@citi.com";
  private static final String STRANGER = "confirm-stranger@citi.com";
  private static final String CSI_ID = "60409";
  private static final List<String> SOURCE = List.of("Go home", "Click \"Sign in\"");

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static Map<String, Object> contract;

  @Autowired private CompileStateService states;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private TestRestTemplate restTemplate;

  private UUID testId;
  private ConfirmFixtures.Candidate candidate;

  @BeforeAll
  @SuppressWarnings("unchecked")
  static void loadContract() throws IOException {
    contract =
        (Map<String, Object>) new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
  }

  @BeforeEach
  void setUp() {
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedUser(jdbc, VIEWER);
    ConfirmFixtures.seedUser(jdbc, STRANGER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
    candidate = ConfirmFixtures.awaitConfirmation(states, jdbc, testId, SOURCE);
  }

  // ── AC-1: the accepted case, in the frozen shape ─────────────────────────

  @Test
  void anExactConfirmationReturnsTheFrozenTestDtoBody() throws IOException {
    ResponseEntity<String> response = confirmAs(owner(), testId, exactBody());

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode body = MAPPER.readTree(response.getBody());
    assertThat(fieldNames(body))
        .as("the wire body carries exactly the frozen TestDto properties")
        .containsExactlyInAnyOrderElementsOf(schemaProperties("TestDto"));
    assertThat(body.path("compileStatus").asText()).isEqualTo("READY");
    assertThat(body.path("confirmedRevisionId").asText())
        .isEqualTo(candidate.revisionId().toString());
    assertThat(body.path("compileError").isNull()).isTrue();
    assertThat(body.path("compileDiagnostics").isNull()).isTrue();
  }

  /**
   * AC-1 — the produced {@code 409} code set equals the operation's declared one.
   *
   * <p>Collected from the wire, not from a restatement of the document, and it fails in both
   * directions: a code answered but not declared, and a code declared but not producible.
   */
  @Test
  void theProducedConflictCodesEqualTheOperationsDeclaredSet() {
    Set<String> produced = new LinkedHashSet<>();

    produced.add(errorCode(confirmAs(owner(), testId, bodyWith("sourceRevision", 999))));

    UUID deleted = freshCandidate();
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", deleted);
    produced.add(errorCode(confirmAs(owner(), deleted, exactBodyFor(deleted))));

    UUID quarantined = freshCandidate();
    jdbc.update("UPDATE ui_tests SET quarantined_at = NOW() WHERE id = ?", quarantined);
    produced.add(errorCode(confirmAs(owner(), quarantined, exactBodyFor(quarantined))));

    assertThat(produced)
        .as(
            "an implementation that answers 409 with a code outside x-conflict-codes, or that"
                + " cannot produce one in it, is a conformance failure (ADR-002 §14.6)")
        .containsExactlyInAnyOrderElementsOf(conflictCodes());
  }

  @Test
  void theOperationDeclaresNoStatusTheRouteCannotAnswerAndNoneTheRouteAnswersIsUndeclared() {
    assertThat(declaredResponses())
        .as("the frozen operation's response set is exactly what §14.5 ruled")
        .containsExactlyInAnyOrder("200", "400", "401", "403", "409");
  }

  // ── AC-3: the order of refusal (ADR-002 §14.4) ───────────────────────────

  /**
   * Authorization precedes the lifecycle read, so a status code is never an existence oracle.
   *
   * <p>The two {@code 403} bodies are compared byte for byte: a {@code 403} that differed between
   * "withheld draft you may not touch" and "no such draft" would disclose exactly what the ordering
   * exists to hide.
   */
  @Test
  void authorizationIsEvaluatedBeforeTheLifecycleGuard() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);

    ResponseEntity<String> withheld = confirmAs(stranger(), testId, exactBody());
    ResponseEntity<String> absent = confirmAs(stranger(), UUID.randomUUID(), exactBody());

    assertThat(withheld.getStatusCode().value()).isEqualTo(403);
    assertThat(absent.getStatusCode().value()).isEqualTo(403);
    assertThat(withheld.getBody()).isEqualTo(absent.getBody());
    assertThat(withheld.getBody()).doesNotContain("TEST_DELETED").doesNotContain(testId.toString());
  }

  /** §9.1 — confirmation is owner-level. A reader of the CSI is {@code 403}, not {@code 409}. */
  @Test
  void aReaderOfTheCsiIsForbiddenRatherThanToldAboutTheCandidate() {
    ResponseEntity<String> response = confirmAs(viewer(), testId, exactBody());

    assertThat(response.getStatusCode().value()).isEqualTo(403);
    assertThat(response.getBody()).doesNotContain(candidate.revisionId().toString());
    assertThat(compileStatus(testId))
        .as("a refused caller moves nothing")
        .isEqualTo("AWAITING_CONFIRMATION");
  }

  /**
   * The two lifecycle refusals, for an authorized owner, kept separate.
   *
   * <p>One test on purpose: the ruling's whole content is that they are <em>different</em> answers,
   * and a pair of tests that could both pass while the route collapsed them into one code would not
   * notice.
   */
  @Test
  void anAuthorizedOwnerIsRefusedTheTwoLifecycleCodesSeparately() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);
    ResponseEntity<String> deleted = confirmAs(owner(), testId, exactBody());
    assertThat(deleted.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(deleted)).isEqualTo("TEST_DELETED");

    jdbc.update(
        "UPDATE ui_tests SET deleted_at = NULL, quarantined_at = NOW() WHERE id = ?", testId);
    ResponseEntity<String> quarantined = confirmAs(owner(), testId, exactBody());
    assertThat(quarantined.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(quarantined))
        .as(
            "a quarantined draft is intact and returns when its CSI is resolved; reporting it as"
                + " TEST_DELETED would contradict BRD §9 and offer a restore nobody can perform")
        .isEqualTo("TEST_QUARANTINED");
  }

  /**
   * AC-3's one documented exception: <b>bean-validation {@code 400} may precede authorization</b>.
   *
   * <p>It discloses nothing, and that is asserted rather than argued: the same malformed body
   * against a draft that exists and against an id that never did produces the same status from an
   * unauthorized caller, so the {@code 400} cannot be used to probe existence. The authorized
   * caller gets the same {@code 400}, which is what makes it a property of the request rather than
   * of the resource.
   */
  @Test
  void aMalformedBodyIsBadRequestForAuthorizedAndUnauthorizedCallersAlike() {
    String malformed = "{\"revisionId\":\"not-a-uuid\",\"artifactHash\":\"short\"}";

    ResponseEntity<String> unauthorized = confirmAs(stranger(), testId, malformed);
    ResponseEntity<String> unauthorizedAbsent = confirmAs(stranger(), UUID.randomUUID(), malformed);
    ResponseEntity<String> authorized = confirmAs(owner(), testId, malformed);

    assertThat(unauthorized.getStatusCode().value()).isEqualTo(400);
    assertThat(unauthorizedAbsent.getStatusCode().value())
        .as("an id that never existed answers identically, so the 400 discloses nothing")
        .isEqualTo(400);
    assertThat(authorized.getStatusCode().value()).isEqualTo(400);
    assertThat(compileStatus(testId)).isEqualTo("AWAITING_CONFIRMATION");
  }

  /**
   * AC-3's {@code 401} case, <b>not reachable on this branch</b>, and recorded rather than faked.
   *
   * <p>{@code BffSessionAuthenticationFilter.isCoreServiceBypassed()} returns {@code true}
   * unconditionally — a deliberate, temporary bypass while the target platform provides no Core
   * services — so a request carrying no identity headers at all is handed a {@code checks-admin} /
   * {@code platform-admin} identity instead of being refused. There is no caller shape this story
   * can construct that reaches {@code 401} on this route, and removing the bypass is {@code ED-02},
   * which is {@code status: open} and out of this story's scope.
   *
   * <p>Owner: <b>{@code ED-02}</b> (real trusted identity replacing the stubs), which gates stories
   * 10.7, 10.17, 10.18 and 10.19. Recorded as <b>not reachable</b>, never as passing. Its sibling
   * {@link #theUnauthenticatedCaseIsNotReachableWhileTheCoreServiceBypassIsOn()} runs and fails the
   * day the bypass is removed, so this cannot be forgotten quietly.
   */
  @Test
  @Disabled("ED-02: the unconditional Core-service bypass makes 401 unreachable on this branch")
  void anIdentitylessCallerIsUnauthorized() {
    HttpHeaders anonymous = new HttpHeaders();
    anonymous.setContentType(MediaType.APPLICATION_JSON);

    assertThat(confirmAs(anonymous, testId, exactBody()).getStatusCode().value()).isEqualTo(401);
  }

  /**
   * The live half of the gap above: it asserts the bypass is what blocks the {@code 401}, so the
   * disabled test cannot be closed silently or forgotten quietly.
   *
   * <p>This deliberately asserts the <em>current</em> behaviour. When {@code ED-02} lands and the
   * bypass is removed, this test goes red — which is the signal to delete it and enable {@link
   * #anIdentitylessCallerIsUnauthorized()}.
   */
  @Test
  void theUnauthenticatedCaseIsNotReachableWhileTheCoreServiceBypassIsOn() {
    HttpHeaders anonymous = new HttpHeaders();
    anonymous.setContentType(MediaType.APPLICATION_JSON);

    ResponseEntity<String> response = confirmAs(anonymous, testId, exactBody());

    assertThat(response.getStatusCode().value())
        .as(
            "while BffSessionAuthenticationFilter.isCoreServiceBypassed() returns true"
                + " unconditionally, an identity-less caller is admitted as a platform admin and"
                + " this route cannot answer 401. When ED-02 removes the bypass this assertion"
                + " fails and anIdentitylessCallerIsUnauthorized() must be enabled")
        .isNotEqualTo(401);
  }

  // ── AC-4: 400 for anything that is not exactly the declared body ──────────

  /**
   * Every malformed shape is a {@code 400}, and <b>none of them writes anything</b>.
   *
   * <p>The second half is the load-bearing one. A route that validated after calling {@code
   * confirm} would answer the same {@code 400} while having already stamped a confirmation identity
   * onto a revision row — and no assertion on the status code alone would catch it.
   */
  @Test
  void everyMalformedBodyIsBadRequestAndWritesNothing() {
    Map<String, String> cases =
        Map.of(
            "missing revisionId", withoutField("revisionId"),
            "missing artifactHash", withoutField("artifactHash"),
            "missing sourceRevision", withoutField("sourceRevision"),
            "missing configurationRevision", withoutField("configurationRevision"),
            "revisionId is not a UUID", bodyWith("revisionId", "\"not-a-uuid\"", true),
            "artifactHash is 63 characters",
                bodyWith("artifactHash", "\"" + "a".repeat(63) + "\"", true),
            "artifactHash is 65 characters",
                bodyWith("artifactHash", "\"" + "a".repeat(65) + "\"", true),
            "sourceRevision is not an integer", bodyWith("sourceRevision", "\"one\"", true),
            "configurationRevision is not an integer",
                bodyWith("configurationRevision", "\"one\"", true));

    Map<String, Object> before = confirmationState();

    cases.forEach(
        (name, body) -> {
          ResponseEntity<String> response = confirmAs(owner(), testId, body);
          assertThat(response.getStatusCode().value()).as("%s", name).isEqualTo(400);
          assertThat(confirmationState())
              .as("%s: refused before any write", name)
              .isEqualTo(before);
        });
  }

  /**
   * AC-4 — an undeclared extra key is <b>ignored</b>, not rejected.
   *
   * <p>ADR-002 §6.2 closes runner-<em>produced</em> bodies; a client request body is not one, and
   * rejecting an unknown key here would invent a {@code 400} code the frozen operation does not
   * declare. The assertion is that it changes no behaviour and no stored value — the confirmation
   * succeeds exactly as it does without the key, and the key appears nowhere in the row.
   */
  @Test
  void anUndeclaredExtraKeyIsIgnoredRatherThanRejected() {
    String canary = "extra-key-canary-9f1e";
    String body =
        exactBody().replaceFirst("\\{", "{\"somethingNobodyDeclared\":\"" + canary + "\",");

    ResponseEntity<String> response = confirmAs(owner(), testId, body);

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    assertThat(response.getBody()).doesNotContain(canary);
    assertThat(compileStatus(testId)).isEqualTo("READY");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_revisions WHERE test_id = ?"
                    + " AND (source::text LIKE ? OR artifact::text LIKE ?"
                    + "      OR configuration::text LIKE ? OR provenance::text LIKE ?)",
                Integer.class,
                testId,
                "%" + canary + "%",
                "%" + canary + "%",
                "%" + canary + "%",
                "%" + canary + "%"))
        .as("an ignored key is stored nowhere")
        .isZero();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private UUID freshCandidate() {
    UUID id = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
    ConfirmFixtures.awaitConfirmation(states, jdbc, id, SOURCE);
    return id;
  }

  private String exactBodyFor(UUID id) {
    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT t.current_candidate_revision_id AS rid, r.artifact_hash AS hash,"
                + " t.source_revision AS sr, t.configuration_revision AS cr"
                + " FROM ui_tests t JOIN ui_test_revisions r"
                + " ON r.id = t.current_candidate_revision_id WHERE t.id = ?",
            id);
    return body(
        row.get("rid").toString(),
        (String) row.get("hash"),
        ((Number) row.get("sr")).longValue(),
        ((Number) row.get("cr")).longValue());
  }

  private String exactBody() {
    return body(
        candidate.revisionId().toString(),
        candidate.artifactHash(),
        candidate.sourceRevision(),
        candidate.configurationRevision());
  }

  private static String body(String revisionId, String hash, long source, long configuration) {
    return "{\"revisionId\":\""
        + revisionId
        + "\",\"artifactHash\":\""
        + hash
        + "\",\"sourceRevision\":"
        + source
        + ",\"configurationRevision\":"
        + configuration
        + "}";
  }

  private String bodyWith(String field, long value) {
    return bodyWith(field, String.valueOf(value), true);
  }

  /** The exact body with one field's raw JSON value replaced. */
  private String bodyWith(String field, String rawValue, boolean raw) {
    try {
      JsonNode node = MAPPER.readTree(exactBody());
      com.fasterxml.jackson.databind.node.ObjectNode object =
          (com.fasterxml.jackson.databind.node.ObjectNode) node;
      object.set(field, MAPPER.readTree(raw ? rawValue : "\"" + rawValue + "\""));
      return object.toString();
    } catch (IOException e) {
      throw new AssertionError(e);
    }
  }

  private String withoutField(String field) {
    try {
      com.fasterxml.jackson.databind.node.ObjectNode object =
          (com.fasterxml.jackson.databind.node.ObjectNode) MAPPER.readTree(exactBody());
      object.remove(field);
      return object.toString();
    } catch (IOException e) {
      throw new AssertionError(e);
    }
  }

  private ResponseEntity<String> confirmAs(HttpHeaders headers, UUID id, String body) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + id + "/confirm-compile",
        HttpMethod.POST,
        new HttpEntity<>(body, headers),
        String.class);
  }

  private String compileStatus(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, id);
  }

  private Map<String, Object> confirmationState() {
    Map<String, Object> state =
        jdbc.queryForMap(
            "SELECT compile_status, confirmed_revision_id, current_candidate_revision_id"
                + " FROM ui_tests WHERE id = ?",
            testId);
    state.putAll(
        jdbc.queryForMap(
            "SELECT confirmed_by, confirmed_at FROM ui_test_revisions WHERE id = ?",
            candidate.revisionId()));
    return state;
  }

  private static String errorCode(ResponseEntity<String> response) {
    try {
      return MAPPER.readTree(response.getBody()).path("error").asText();
    } catch (IOException e) {
      throw new AssertionError("response body is not JSON: " + response.getBody(), e);
    }
  }

  private static Iterable<String> fieldNames(JsonNode body) {
    Set<String> names = new LinkedHashSet<>();
    body.fieldNames().forEachRemaining(names::add);
    return names;
  }

  @SuppressWarnings("unchecked")
  private static Set<String> schemaProperties(String schemaName) {
    Map<String, Object> components = (Map<String, Object>) contract.get("components");
    Map<String, Object> schemas = (Map<String, Object>) components.get("schemas");
    Map<String, Object> schema = (Map<String, Object>) schemas.get(schemaName);
    assertThat(schema).as("schema %s is declared", schemaName).isNotNull();
    return new LinkedHashSet<>(((Map<String, Object>) schema.get("properties")).keySet());
  }

  @SuppressWarnings("unchecked")
  private static List<String> conflictCodes() {
    Map<String, Object> response = (Map<String, Object>) responses().get("409");
    assertThat(response).as("%s declares a 409", CONFIRM_PATH).isNotNull();
    Object codes = response.get("x-conflict-codes");
    assertThat(codes)
        .as("the 409 declares no x-conflict-codes; the set would be unassertable")
        .isInstanceOf(List.class);
    return ((List<Object>) codes).stream().map(String::valueOf).toList();
  }

  private static List<String> declaredResponses() {
    return responses().keySet().stream().map(String::valueOf).toList();
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> responses() {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, Object> item = (Map<String, Object>) paths.get(CONFIRM_PATH);
    assertThat(item).as("the contract declares %s", CONFIRM_PATH).isNotNull();
    Map<String, Object> post = (Map<String, Object>) item.get("post");
    return (Map<String, Object>) post.get("responses");
  }

  private static HttpHeaders identity(String email, String ownership) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", "uid-" + email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", "");
    headers.set("X-User-Csi-Ownership", ownership);
    return headers;
  }

  private static HttpHeaders owner() {
    return identity(OWNER, CSI_ID + ":owner");
  }

  private static HttpHeaders viewer() {
    return identity(VIEWER, CSI_ID + ":viewer");
  }

  private static HttpHeaders stranger() {
    return identity(STRANGER, "");
  }
}
