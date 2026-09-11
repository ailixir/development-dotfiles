package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioConflictException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
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
 * Story 10.8 AC-1 and AC-1b — <b>the compile route against the contract that now declares it.</b>
 *
 * <h2>What this file used to assert, and why it changed</h2>
 *
 * <p>In phase 1 this file recorded a divergence rather than a route. The frozen {@code compileTest}
 * operation declared {@code 202}, {@code 401} and {@code 403} and nothing else, while 10.4's {@code
 * CompileStateService.requireCompilable} already threw {@code TEST_DELETED} and {@code
 * TEST_QUARANTINED} — both {@code 409} — and AC-3 forbids any path that bypasses the service. No
 * implementation could satisfy both, so the case was left unimplemented, its test {@code @Disabled}
 * against AC-1b, and the question escalated under ADR-002 §12 as Class C. Three workarounds were
 * named on the criterion so they could not be quietly taken: {@code 403} (a lie about why), {@code
 * 202}-then-fail-async (a gateway call spent refusing a draft nobody may compile) and widening
 * {@code requireCompilable} (loosening a guard to silence a test).
 *
 * <p><b>ADR-002 §14 ruled, and all three were rejected there too.</b> {@code POST
 * /tests/{id}/compile} answers {@code 409} for a withheld draft carrying the draft's own code, and
 * the two codes stay separate: reporting a quarantined draft as {@code TEST_DELETED} would state
 * that an authored test was deleted, which BRD §9 forbids, and would drive a UI to offer a restore
 * no principal can perform. So the assertions below moved from "the document leaves no code for
 * this" to "the route answers exactly the codes the document declares", and two of them assert the
 * opposite fact they used to — deliberately, and named here so a reader of the history is not left
 * wondering whether a test was weakened to go green.
 *
 * <h2>The mechanism the amendment added</h2>
 *
 * <p>Before §14, the code set a {@code 409} could carry lived only in {@code examples}, which no
 * generator reads and no test can assert is complete — the §INT-4 failure mode one level down, and
 * the reason this file had to read the {@code responses} map by hand to make its point. Every
 * public {@code 409} now carries an exhaustive {@code x-conflict-codes}, so the property is
 * checkable: {@link #theProducedConflictCodesEqualTheOperationsDeclaredSet()} drives every refusal
 * the route can produce and asserts the set on the wire equals the set in the document.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    // ADR-002 §14.4 puts authorization before the lifecycle read, and the local profile's
    // LocalDevAuthFilter injects a checks-admin identity into every request that arrives without
    // one. With it on, every caller is an administrator and the ordering is unassertable — the
    // route would look correct while answering 409 to a principal who should never have learnt the
    // draft exists. Turning it off here is what makes the authorization half decidable at all.
    properties = "checks.local-dev-auth.enabled=false")
@ActiveProfiles("local")
class CompileRouteContractDivergenceTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");
  private static final String OWNER = "divergence-owner@citi.com";
  private static final String STRANGER = "divergence-stranger@citi.com";
  private static final String CSI_ID = "60406";
  private static final String COMPILE_PATH = "/tests/{id}/compile";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static Map<String, Object> contract;

  @Autowired private CompileStateService states;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private TestRestTemplate restTemplate;

  private UUID testId;

  @BeforeAll
  @SuppressWarnings("unchecked")
  static void loadContract() throws IOException {
    contract =
        (Map<String, Object>) new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
  }

  @BeforeEach
  void setUp() {
    seedUser(OWNER);
    seedUser(STRANGER);
    seedCsi();
    testId = seedTest(List.of("Go home"));
  }

  // ── the case AC-1b left red, now answerable ───────────────────────────────

  /**
   * AC-1b, closed by ADR-002 §14.2. Both codes are declared, so a conforming implementation exists
   * and this is the assertion the name always promised.
   *
   * <p>The two halves are one test on purpose: the ruling's whole content is that they are
   * <em>different</em> answers, and a pair of tests that could both pass while the route collapsed
   * them into one code would not notice.
   */
  @Test
  void compilingADeletedTestAnswersTheDeclaredStatusCode() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);
    ResponseEntity<String> deleted = compileAs(owner(), testId);
    assertThat(deleted.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(deleted)).isEqualTo("TEST_DELETED");

    jdbc.update(
        "UPDATE ui_tests SET deleted_at = NULL, quarantined_at = NOW() WHERE id = ?", testId);
    ResponseEntity<String> quarantined = compileAs(owner(), testId);
    assertThat(quarantined.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(quarantined))
        .as(
            "a quarantined draft is intact and returns when its CSI is resolved; reporting it as"
                + " TEST_DELETED would contradict BRD §9 and offer a restore nobody can perform")
        .isEqualTo("TEST_QUARANTINED");
  }

  /**
   * The replacement for {@code theFrozenCompileOperationDeclaresNoConflictResponse}.
   *
   * <p>That test asserted {@code containsExactlyInAnyOrder("202","401","403")}. Its premise was the
   * divergence, the divergence is closed, and the assertion is now false by design. What replaces
   * it is the property §14.6 made checkable and which the old shape could not express: the codes
   * the route <em>produces</em>, collected from the wire, equal the operation's exhaustive {@code
   * x-conflict-codes}. It fails in both directions — a code answered but not declared, and a code
   * declared but not producible.
   */
  @Test
  void theProducedConflictCodesEqualTheOperationsDeclaredSet() {
    Set<String> produced = new LinkedHashSet<>();

    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);
    produced.add(errorCode(compileAs(owner(), testId)));

    jdbc.update(
        "UPDATE ui_tests SET deleted_at = NULL, quarantined_at = NOW() WHERE id = ?", testId);
    produced.add(errorCode(compileAs(owner(), testId)));

    assertThat(produced)
        .as(
            "an implementation that answers 409 with a code outside x-conflict-codes, or that"
                + " cannot produce one in it, is a conformance failure (ADR-002 §14.6)")
        .containsExactlyInAnyOrderElementsOf(conflictCodes(COMPILE_PATH, "409"));
  }

  // ── the siblings that established the divergence was real ────────────────

  @Test
  void theTwoOperationsThatAlreadyCarryTheSameConflictShowHowSmallTheAmendmentIs() {
    assertThat(declaredResponses("/tests/{id}/confirm-compile")).contains("409");
    assertThat(declaredResponses("/tests/{id}/execute")).contains("409");
  }

  /**
   * The guard itself, unchanged. ADR-002 §14.8 item 3 is explicit that {@code requireCompilable}
   * was right and must not move; this asserts it still produces the two codes the route now
   * declares, at the service layer, independently of the route.
   */
  @Test
  void theServiceGuardReallyDoesThrowAConflictForADeletedOrQuarantinedTest() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);
    assertThat(conflictCodeFrom(testId)).isEqualTo("TEST_DELETED");

    jdbc.update(
        "UPDATE ui_tests SET deleted_at = NULL, quarantined_at = NOW() WHERE id = ?", testId);
    assertThat(conflictCodeFrom(testId)).isEqualTo("TEST_QUARANTINED");
  }

  /**
   * The inverse of the phase-1 sibling {@code theOperationIsStillMarkedAsNotYetImplemented}.
   *
   * <p>ADR-002 §14.8 item 5: the marker comes off when the route lands, for this operation only,
   * and {@code x-implemented-by} stays. The second half is what keeps this from being a one-line
   * edit nobody notices — {@code confirmCompile} is 10.9's and must still be marked.
   */
  @Test
  void theOperationIsNoLongerMarkedAsNotYetImplementedAndNoOtherMarkerMoved() {
    assertThat(operationFlag(COMPILE_PATH, "x-not-yet-implemented"))
        .as("T-10.8.1 landed the route, so the marker comes off — for this operation only")
        .isNull();
    assertThat(operationFlag(COMPILE_PATH, "x-implemented-by")).isEqualTo("10.8");
    assertThat(operationFlag("/tests/{id}/confirm-compile", "x-not-yet-implemented"))
        .as("confirm-compile is story 10.9's and nothing here implements it")
        .isEqualTo(Boolean.TRUE);
  }

  // ── the order of refusal, ADR-002 §14.4 ──────────────────────────────────

  /**
   * Authorization precedes the lifecycle read, so a status code is never an existence oracle.
   *
   * <p>The route can answer {@code 409} at all only because the CSI is read through the visibility
   * restriction — the same read that would leak existence if it ran first. Both answers below are
   * compared byte for byte, because a {@code 403} that differed between "withheld draft you may not
   * touch" and "no such draft" would disclose exactly what the ordering exists to hide.
   */
  @Test
  void authorizationIsEvaluatedBeforeTheLifecycleGuard() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);

    ResponseEntity<String> withheld = compileAs(stranger(), testId);
    ResponseEntity<String> absent = compileAs(stranger(), UUID.randomUUID());

    assertThat(withheld.getStatusCode().value()).isEqualTo(403);
    assertThat(absent.getStatusCode().value()).isEqualTo(403);
    assertThat(withheld.getBody()).isEqualTo(absent.getBody());
    assertThat(withheld.getBody()).doesNotContain("TEST_DELETED").doesNotContain(testId.toString());
  }

  /**
   * The lifecycle guard precedes the authoring bounds.
   *
   * <p>The draft below is both withheld and over the step bound, so exactly one of the two refusals
   * can be observed and which one it is decides the order. {@code 409} is the right answer: a bound
   * is something the author can fix, and telling them to fix it would be advice that cannot help.
   */
  @Test
  void theLifecycleGuardIsEvaluatedBeforeTheAuthoringBounds() {
    UUID overLimit = seedTest(steps(101));
    jdbc.update("UPDATE ui_tests SET quarantined_at = NOW() WHERE id = ?", overLimit);

    ResponseEntity<String> response = compileAs(owner(), overLimit);

    assertThat(response.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(response)).isEqualTo("TEST_QUARANTINED");
  }

  // ── the declared 400 codes, with no compile state moved ──────────────────

  /**
   * AC-6, AC-7 and ADR-002 §14.8 item 4 — every {@code 400} the operation declares is answered, and
   * none of them moves the draft's compile state.
   *
   * <p>The second half is the load-bearing one. A route that refused <em>after</em> {@code
   * beginCompile} would answer the same {@code 400} while leaving the draft in {@code COMPILING}
   * with a request identity for an attempt that never ran — the exact shape §4.3 forbids, and one
   * that no assertion on the status code alone would catch.
   */
  @Test
  void theDeclaredBadRequestCodesAreAnsweredWithNoCompileStateMoved() {
    assertThat(declaredResponses(COMPILE_PATH)).contains("400");

    Map<String, UUID> cases =
        Map.of(
            "SOURCE_TOO_MANY_STEPS", seedTest(steps(101)),
            "SOURCE_LINE_TOO_LONG", seedTest(List.of("x".repeat(1025))),
            "SOURCE_TOO_LARGE", seedTest(oversizedSource()),
            "INLINE_CREDENTIAL", seedTest(List.of("Log in with password=hunter2")));

    cases.forEach(
        (expectedCode, id) -> {
          Map<String, Object> before = compileState(id);
          ResponseEntity<String> response = compileAs(owner(), id);

          assertThat(response.getStatusCode().value()).as("%s status", expectedCode).isEqualTo(400);
          assertThat(errorCode(response)).isEqualTo(expectedCode);
          assertThat(response.getBody())
              .as("INLINE_CREDENTIAL names the pattern class and the step, never the matched text")
              .doesNotContain("hunter2");
          assertThat(compileState(id))
              .as("%s: refused before beginCompile, so nothing moved", expectedCode)
              .isEqualTo(before);
        });
  }

  /**
   * AC-1 — the accepted case, over the wire, with the body the document declares.
   *
   * <p>{@code 202} says the request was <em>recorded</em>: the identity below is the one {@code
   * beginCompile} persisted. Whether the attempt then succeeds is asynchronous and is not asserted
   * here — in this profile the gateway is disabled, which is precisely the outage case AC-21 covers
   * and which must not change what this response says.
   */
  @Test
  void aCompilableDraftIsAcceptedWithTheFrozenBody() throws IOException {
    ResponseEntity<String> response = compileAs(owner(), testId);

    assertThat(response.getStatusCode().value()).isEqualTo(202);
    JsonNode body = MAPPER.readTree(response.getBody());
    assertThat(fieldNames(body))
        .as("the wire body carries exactly the frozen CompileAccepted properties")
        .containsExactlyInAnyOrderElementsOf(schemaProperties("CompileAccepted"));
    assertThat(body.path("compileStatus").asText()).isEqualTo("COMPILING");
    assertThat(UUID.fromString(body.path("compileRequestId").asText())).isNotNull();
    assertThat(body.path("sourceRevision").asLong()).isEqualTo(1L);
    assertThat(body.path("configurationRevision").asLong()).isEqualTo(1L);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private ResponseEntity<String> compileAs(HttpHeaders headers, UUID id) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + id + "/compile",
        HttpMethod.POST,
        new HttpEntity<>("", headers),
        String.class);
  }

  private static String errorCode(ResponseEntity<String> response) {
    try {
      return MAPPER.readTree(response.getBody()).path("error").asText();
    } catch (IOException e) {
      throw new AssertionError("response body is not JSON: " + response.getBody(), e);
    }
  }

  private Map<String, Object> compileState(UUID id) {
    return jdbc.queryForMap(
        "SELECT compile_status, compile_request_id, compile_error, current_candidate_revision_id"
            + " FROM ui_tests WHERE id = ?",
        id);
  }

  private String conflictCodeFrom(UUID id) {
    try {
      states.beginCompile(id);
      throw new AssertionError("requireCompilable did not refuse " + id);
    } catch (StudioConflictException e) {
      return e.getCode();
    }
  }

  private static List<String> steps(int count) {
    return java.util.stream.IntStream.rangeClosed(1, count)
        .mapToObj(index -> "Step " + index)
        .toList();
  }

  /** Within the step and line bounds, over the total-bytes bound. */
  private static List<String> oversizedSource() {
    return java.util.stream.IntStream.rangeClosed(1, 100)
        .mapToObj(index -> "y".repeat(1000))
        .collect(Collectors.toList());
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
  private static List<String> conflictCodes(String path, String status) {
    Map<String, Object> responses = responses(path);
    Map<String, Object> response = (Map<String, Object>) responses.get(status);
    assertThat(response).as("%s declares a %s", path, status).isNotNull();
    Object codes = response.get("x-conflict-codes");
    assertThat(codes)
        .as("%s's %s declares no x-conflict-codes; the set would be unassertable", path, status)
        .isInstanceOf(List.class);
    return ((List<Object>) codes).stream().map(String::valueOf).toList();
  }

  private static List<String> declaredResponses(String path) {
    return responses(path).keySet().stream().map(String::valueOf).toList();
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> responses(String path) {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, Object> item = (Map<String, Object>) paths.get(path);
    assertThat(item).as("the contract declares %s", path).isNotNull();
    Map<String, Object> post = (Map<String, Object>) item.get("post");
    return (Map<String, Object>) post.get("responses");
  }

  @SuppressWarnings("unchecked")
  private static Object operationFlag(String path, String key) {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, Object> item = (Map<String, Object>) paths.get(path);
    Map<String, Object> post = (Map<String, Object>) item.get("post");
    return post.get(key);
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

  private static HttpHeaders stranger() {
    return identity(STRANGER, "");
  }

  private UUID seedTest(List<String> source) {
    UUID id = UUID.randomUUID();
    String stepsJson;
    try {
      stepsJson = MAPPER.writeValueAsString(source);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new AssertionError(e);
    }
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Divergence draft', ?,"
            + " 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb), ?, ?, ?)",
        id,
        CSI_ID,
        stepsJson,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Divergence Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Divergence CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
