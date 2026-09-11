package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.compile.validator.RunnerDiagnostic;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.Viewport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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

/**
 * Story 10.9 AC-5, AC-6, AC-7, AC-9 — <b>exact confirmation, end to end, against a real
 * PostgreSQL.</b>
 *
 * <p>Every case drives the HTTP route and then reads the database. Asserting the status code alone
 * would be satisfied by an implementation that refused <em>after</em> stamping a confirmation
 * identity onto a revision row, so each refusal additionally asserts that the whole revision table
 * and the whole compile-state projection are byte-unchanged.
 *
 * <p>The four exactness terms are decided by {@code CompileStateService.confirm}'s conditional
 * {@code UPDATE ... WHERE}, never by a read-then-compare in Java. That is what the four
 * perturbations below establish, and the four recorded falsifications in the Dev Agent Record are
 * what establish that each term is load-bearing rather than decorative.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "checks.local-dev-auth.enabled=false")
@ActiveProfiles("local")
class ExactConfirmationIT {

  private static final String OWNER = "exact-owner@citi.com";
  private static final String CSI_ID = "60410";
  private static final List<String> SOURCE = List.of("Go home", "Click \"Sign in\"");
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Autowired private CompileStateService states;
  @Autowired private StudioService studioService;
  @Autowired private DiagnosticsBounder bounder;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private TestRestTemplate restTemplate;

  private UUID testId;
  private ConfirmFixtures.Candidate candidate;

  @BeforeEach
  void setUp() {
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
    candidate = ConfirmFixtures.awaitConfirmation(states, jdbc, testId, SOURCE);
  }

  // ── AC-5: all four fields, or nothing ────────────────────────────────────

  /**
   * AC-5 — each of the four fields perturbed alone is {@code 409 STALE_CANDIDATE} with no write.
   *
   * <p>One perturbation per case, so a term that stopped mattering shows up as exactly one red test
   * rather than as a diffuse failure. Each of the four is falsified by deleting its term from the
   * {@code WHERE} clause; the results are in the Dev Agent Record.
   */
  @Test
  void aWrongRevisionIdIsStaleCandidateAndWritesNothing() {
    assertRefusedWithNoWrite("revisionId", "\"" + UUID.randomUUID() + "\"");
  }

  @Test
  void aWrongArtifactHashIsStaleCandidateAndWritesNothing() {
    assertRefusedWithNoWrite("artifactHash", "\"" + "f".repeat(64) + "\"");
  }

  @Test
  void aSourceRevisionOffByOneIsStaleCandidateAndWritesNothing() {
    assertRefusedWithNoWrite("sourceRevision", String.valueOf(candidate.sourceRevision() + 1));
  }

  @Test
  void aConfigurationRevisionOffByOneIsStaleCandidateAndWritesNothing() {
    assertRefusedWithNoWrite(
        "configurationRevision", String.valueOf(candidate.configurationRevision() + 1));
  }

  // ── AC-6: the stale tab ──────────────────────────────────────────────────

  /**
   * AC-6(a) — a stale tab cannot approve a newer artifact, even when the source text is unchanged.
   *
   * <p>The second compile is of <b>byte-identical source</b>; only the artifact differs, which is
   * exactly the case the epic bullet names and which 10.8 AC-20 makes possible by keeping the
   * compile cache disabled. {@code R2} becomes the current candidate and confirming {@code R1} from
   * the tab that is still showing it is refused.
   */
  @Test
  void aStaleTabCannotApproveANewerArtifactOfTheSameSource() {
    ConfirmFixtures.Candidate second =
        ConfirmFixtures.awaitConfirmation(
            states, jdbc, testId, SOURCE, "await page.goto('https://b/');");

    assertThat(second.revisionId())
        .as("a different artifact for the same source is a new revision row")
        .isNotEqualTo(candidate.revisionId());
    assertThat(currentCandidate()).isEqualTo(second.revisionId());

    ResponseEntity<String> refused = confirm(bodyFor(candidate));

    assertThat(refused.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(refused)).isEqualTo("STALE_CANDIDATE");
    assertThat(confirmedBy(candidate.revisionId())).isNull();
    assertThat(confirmedRevision()).isNull();
  }

  /**
   * AC-6(b) — the byte-identical case, named so it is not later read as a hole.
   *
   * <p>{@code insertOrReuseRevision} resolves {@code (test_id, source_revision,
   * configuration_revision, artifact_hash)} to the row that already carries that identity, so the
   * "stale" tab's revision id is still the current candidate and confirming it <b>succeeds</b>.
   * Nothing unseen is approved: the bytes confirmed are the bytes the tab displayed, and all four
   * fields still match exactly.
   */
  @Test
  void aByteIdenticalRecompileLeavesTheTabsOwnRevisionConfirmable() {
    ConfirmFixtures.Candidate second =
        ConfirmFixtures.awaitConfirmation(states, jdbc, testId, SOURCE);

    assertThat(second.revisionId())
        .as("an identical artifact identity resolves to the same row rather than duplicating it")
        .isEqualTo(candidate.revisionId());
    assertThat(revisionCount()).isEqualTo(1);

    ResponseEntity<String> accepted = confirm(bodyFor(candidate));

    assertThat(accepted.getStatusCode().value()).isEqualTo(200);
    assertThat(confirmedRevision()).isEqualTo(candidate.revisionId());
  }

  // ── AC-7: what moved underneath the tab ──────────────────────────────────

  @Test
  void anEditedSourceUnderneathTheTabIsRefusedAndNamesWhatMoved() {
    studioService.updateTest(testId, request(List.of("Go home", "Click \"Log in\""), 1L, 1L));

    ResponseEntity<String> refused = confirm(bodyFor(candidate));

    assertThat(refused.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(refused)).isEqualTo("STALE_CANDIDATE");
    assertThat(message(refused))
        .as("the message names what moved; §14.3 keeps the code one, because the remedy is one")
        .contains(candidate.revisionId().toString());
    assertThat(confirmedBy(candidate.revisionId())).isNull();
    assertThat(confirmedRevision()).isNull();
  }

  @Test
  void anEditedConfigurationUnderneathTheTabIsRefused() {
    studioService.updateTest(testId, requestWithTimeout(45));

    ResponseEntity<String> refused = confirm(bodyFor(candidate));

    assertThat(refused.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(refused)).isEqualTo("STALE_CANDIDATE");
    assertThat(confirmedBy(candidate.revisionId())).isNull();
  }

  /**
   * AC-7 — a recompile in flight is refused by {@code confirm}'s own {@code AWAITING_CONFIRMATION}
   * precondition, not by anything this story added.
   */
  @Test
  void aRecompileInFlightIsRefusedByTheAwaitingConfirmationPrecondition() {
    states.beginCompile(testId);
    assertThat(compileStatus()).isEqualTo("COMPILING");

    ResponseEntity<String> refused = confirm(bodyFor(candidate));

    assertThat(refused.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(refused)).isEqualTo("STALE_CANDIDATE");
    assertThat(compileStatus())
        .as("a refused confirmation does not settle a compile that is still running")
        .isEqualTo("COMPILING");
    assertThat(confirmedBy(candidate.revisionId())).isNull();
  }

  /** The negative case that must keep working: a rename is none of these (§4.2). */
  @Test
  void aNameOnlyEditLeavesTheCandidateConfirmable() {
    studioService.updateTest(testId, request(SOURCE, 1L, 1L, "Renamed", "A new description"));

    ResponseEntity<String> accepted = confirm(bodyFor(candidate));

    assertThat(accepted.getStatusCode().value()).isEqualTo(200);
    assertThat(confirmedRevision()).isEqualTo(candidate.revisionId());
  }

  // ── AC-9: READY, and the mixed-verdict half ──────────────────────────────

  /**
   * AC-9 — a valid candidate confirmed by its authorized owner settles to {@code READY}, and the
   * {@code 200} body carries the committed state rather than the state the caller asked for.
   */
  @Test
  void aValidCandidateConfirmsToReadyAndRecordsTheAuthenticatedPrincipal() throws IOException {
    ResponseEntity<String> accepted = confirm(bodyFor(candidate));

    assertThat(accepted.getStatusCode().value()).isEqualTo(200);
    JsonNode body = MAPPER.readTree(accepted.getBody());
    assertThat(body.path("compileStatus").asText()).isEqualTo("READY");
    assertThat(body.path("confirmedRevisionId").asText())
        .isEqualTo(candidate.revisionId().toString());
    assertThat(body.path("compileError").isNull()).isTrue();
    assertThat(body.path("compileDiagnostics").isNull()).isTrue();

    assertThat(confirmedBy(candidate.revisionId()))
        .as("confirmed_by is the authenticated principal, never a service identity")
        .isEqualTo(OWNER);
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_at FROM ui_test_revisions WHERE id = ?",
                java.sql.Timestamp.class,
                candidate.revisionId()))
        .isNotNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, testId))
        .isNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?",
                String.class,
                testId))
        .isNull();
  }

  /**
   * AC-9 — a mixed verdict is {@code ok: false} as a whole, and blocks confirmation for good.
   *
   * <p>The recompile routes to {@code publishInvalid}: {@code NEEDS_REVISION}, no revision row
   * written and the candidate cleared. Every subsequent attempt, <b>including one carrying the
   * revision id from before the recompile</b>, is refused — which is the case a tab that was open
   * across the recompile would actually send.
   */
  @Test
  void aMixedVerdictBlocksConfirmationIncludingWithTheOlderRevisionId() {
    CompileRequest request = states.beginCompile(testId);
    ValidationOutcome mixed =
        ValidationOutcome.verdict(
            false,
            "1.0.0",
            List.of(),
            List.of(
                new ValidationOutcome.StepVerdict(0, true, List.of()),
                new ValidationOutcome.StepVerdict(
                    1,
                    false,
                    List.of(
                        new RunnerDiagnostic(
                            "DENIED_NODE", 1, "not expressible", "ForStatement", "for(;;)")))));
    states.publishInvalid(testId, request, bounder.bound(mixed, SOURCE.size(), 1, true));

    assertThat(compileStatus()).isEqualTo("NEEDS_REVISION");
    assertThat(currentCandidate()).isNull();
    assertThat(revisionCount())
        .as("an invalid artifact is never written as a revision, so nothing new appeared")
        .isEqualTo(1);

    ResponseEntity<String> refused = confirm(bodyFor(candidate));

    assertThat(refused.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(refused)).isEqualTo("STALE_CANDIDATE");
    assertThat(confirmedRevision()).isNull();
    assertThat(confirmedBy(candidate.revisionId())).isNull();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /**
   * Perturbs exactly one field, drives the route, and asserts the refusal wrote nothing at all.
   *
   * <p>"Nothing at all" is taken literally: the whole revision table's confirmation columns and the
   * whole compile-state projection are captured before and compared after.
   */
  private void assertRefusedWithNoWrite(String field, String rawValue) {
    Map<String, Object> before = wholeState();

    ResponseEntity<String> response = confirm(bodyWith(field, rawValue));

    assertThat(response.getStatusCode().value()).as("%s perturbed", field).isEqualTo(409);
    assertThat(errorCode(response)).as("%s perturbed", field).isEqualTo("STALE_CANDIDATE");
    assertThat(wholeState())
        .as(
            "%s perturbed: no confirmed_by/confirmed_at on any revision row, no change to"
                + " confirmed_revision_id and no change to compile_status",
            field)
        .isEqualTo(before);
  }

  /** Every column a confirmation could possibly move, for this draft and every revision it has. */
  private Map<String, Object> wholeState() {
    Map<String, Object> state = new LinkedHashMap<>();
    state.put(
        "draft",
        jdbc.queryForMap(
            "SELECT compile_status, confirmed_revision_id, current_candidate_revision_id,"
                + " compile_request_id, compile_error::text, compile_diagnostics::text,"
                + " source_revision, configuration_revision FROM ui_tests WHERE id = ?",
            testId));
    state.put(
        "revisions",
        jdbc.queryForList(
            "SELECT id, confirmed_by, confirmed_at FROM ui_test_revisions"
                + " WHERE test_id = ? ORDER BY id",
            testId));
    return state;
  }

  private ResponseEntity<String> confirm(String body) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", "uid-" + OWNER);
    headers.set("X-User-Email", OWNER);
    headers.set("X-User-Roles", "");
    headers.set("X-User-Csi-Ownership", CSI_ID + ":owner");
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + testId + "/confirm-compile",
        HttpMethod.POST,
        new HttpEntity<>(body, headers),
        String.class);
  }

  private static String bodyFor(ConfirmFixtures.Candidate candidate) {
    return "{\"revisionId\":\""
        + candidate.revisionId()
        + "\",\"artifactHash\":\""
        + candidate.artifactHash()
        + "\",\"sourceRevision\":"
        + candidate.sourceRevision()
        + ",\"configurationRevision\":"
        + candidate.configurationRevision()
        + "}";
  }

  private String bodyWith(String field, String rawValue) {
    try {
      com.fasterxml.jackson.databind.node.ObjectNode object =
          (com.fasterxml.jackson.databind.node.ObjectNode) MAPPER.readTree(bodyFor(candidate));
      object.set(field, MAPPER.readTree(rawValue));
      return object.toString();
    } catch (IOException e) {
      throw new AssertionError(e);
    }
  }

  private UITestRequest request(List<String> steps, long source, long configuration) {
    return request(steps, source, configuration, "Confirmation draft", null);
  }

  private UITestRequest request(
      List<String> steps, long source, long configuration, String name, String description) {
    return new UITestRequest(
        name,
        description,
        CSI_ID,
        "Production",
        steps,
        List.of(),
        new TestConfiguration("chromium", new Viewport(1920, 1080), 30, "networkidle"),
        source,
        configuration);
  }

  private UITestRequest requestWithTimeout(int timeoutSeconds) {
    return new UITestRequest(
        "Confirmation draft",
        null,
        CSI_ID,
        "Production",
        SOURCE,
        List.of(),
        new TestConfiguration("chromium", new Viewport(1920, 1080), timeoutSeconds, "networkidle"),
        1L,
        1L);
  }

  private static String errorCode(ResponseEntity<String> response) {
    return field(response, "error");
  }

  private static String message(ResponseEntity<String> response) {
    return field(response, "message");
  }

  private static String field(ResponseEntity<String> response, String name) {
    try {
      return MAPPER.readTree(response.getBody()).path(name).asText();
    } catch (IOException e) {
      throw new AssertionError("response body is not JSON: " + response.getBody(), e);
    }
  }

  private String compileStatus() {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private UUID currentCandidate() {
    return jdbc.queryForObject(
        "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
  }

  private UUID confirmedRevision() {
    return jdbc.queryForObject(
        "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
  }

  private String confirmedBy(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private int revisionCount() {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId);
  }
}
