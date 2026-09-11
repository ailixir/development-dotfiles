package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.Viewport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
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
 * Story 10.9 AC-8 — <b>confirmation is write-once, and the application guard fires before the
 * database guard.</b>
 *
 * <p>V12 installs a trigger that raises on any second write to {@code confirmed_by}/{@code
 * confirmed_at}. That trigger is the backstop, not the mechanism: a second confirmation must be
 * refused by {@code confirm}'s own {@code confirmed_by IS NULL AND confirmed_at IS NULL} term,
 * which matches zero rows and never reaches the trigger at all. The difference is visible on the
 * wire — a {@code 409} the caller can act on, or a {@code 500} from a raised exception — and that
 * is what {@link #reconfirmingTheSameRevisionIsAConflictAndNotAServerError()} asserts.
 *
 * <p>History gains a row; it never loses one. §4.6's "Model changes never rewrite existing
 * revisions" applies to confirmation identity too.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "checks.local-dev-auth.enabled=false")
@ActiveProfiles("local")
class ConfirmationWriteOnceIT {

  private static final String OWNER = "writeonce-owner@citi.com";
  private static final String OTHER_OWNER = "writeonce-other@citi.com";
  private static final String CSI_ID = "60411";
  private static final List<String> SOURCE = List.of("Go home", "Click \"Sign in\"");
  private static final List<String> EDITED = List.of("Go home", "Click \"Log in\"");
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Autowired private CompileStateService states;
  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private TestRestTemplate restTemplate;

  private UUID testId;
  private ConfirmFixtures.Candidate first;

  @BeforeEach
  void setUp() {
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedUser(jdbc, OTHER_OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
    first = ConfirmFixtures.awaitConfirmation(states, jdbc, testId, SOURCE);
    assertThat(confirm(bodyFor(first), OWNER).getStatusCode().value()).isEqualTo(200);
  }

  /**
   * AC-8(a) — a second confirmation of the same revision, with a body that is still exact.
   *
   * <p>Asserted as a {@code 409} and explicitly <b>not</b> a {@code 500}: a status in the 5xx range
   * would mean the request reached V12's trigger and the trigger raised, which is the backstop
   * firing where the guard should have. The stored identity and timestamp are compared byte for
   * byte afterwards, because a refusal that had already rewritten {@code confirmed_at} would still
   * have answered {@code 409}.
   *
   * <p>Falsification: removing {@code confirmed_by IS NULL AND confirmed_at IS NULL} from the
   * revision statement must turn this red. Recorded in the Dev Agent Record.
   */
  @Test
  void reconfirmingTheSameRevisionIsAConflictAndNotAServerError() {
    Map<String, Object> before = confirmationIdentity(first.revisionId());

    ResponseEntity<String> second = confirm(bodyFor(first), OWNER);

    assertThat(second.getStatusCode().value())
        .as(
            "the application guard matches zero rows, so this never reaches V12's write-once"
                + " trigger; a 500 here would mean the trigger fired instead of the guard")
        .isEqualTo(409);
    assertThat(second.getStatusCode().is5xxServerError()).isFalse();
    assertThat(errorCode(second)).isEqualTo("STALE_CANDIDATE");
    assertThat(confirmationIdentity(first.revisionId()))
        .as("the original confirmer and timestamp are byte-unchanged")
        .isEqualTo(before);
  }

  /**
   * AC-8(a), the other caller — a <em>different</em> principal reconfirming is refused identically.
   *
   * <p>This is why the draft's idempotency question was ruled {@code 409}: an idempotent {@code
   * 200} would have to report success to a caller for a revision somebody else approved, telling
   * them they approved something they did not.
   */
  @Test
  void aDifferentPrincipalCannotOverwriteSomebodyElsesConfirmation() {
    ResponseEntity<String> second = confirm(bodyFor(first), OTHER_OWNER);

    assertThat(second.getStatusCode().value()).isEqualTo(409);
    assertThat(confirmedBy(first.revisionId()))
        .as("the recorded confirmer is still the principal that actually confirmed")
        .isEqualTo(OWNER);
  }

  /**
   * AC-8(b) — a second, different revision after an edit and a successful recompile
   * <b>succeeds</b>, and the first revision's confirmation identity survives untouched.
   */
  @Test
  void asecondRevisionConfirmsAndTheFirstRevisionsIdentityIsUntouched() {
    Map<String, Object> firstIdentity = confirmationIdentity(first.revisionId());

    ConfirmFixtures.Candidate second = editAndRecompile();

    assertThat(second.revisionId()).isNotEqualTo(first.revisionId());
    assertThat(confirm(bodyFor(second), OWNER).getStatusCode().value()).isEqualTo(200);

    assertThat(confirmedRevision()).isEqualTo(second.revisionId());
    assertThat(confirmationIdentity(first.revisionId()))
        .as("history gains a row; it never loses one (§4.6)")
        .isEqualTo(firstIdentity);
    assertThat(revisionCount()).isEqualTo(2);
  }

  /**
   * AC-8(c) — a previously confirmed <em>older</em> revision, while a newer candidate awaits.
   *
   * <p>Refused because it is no longer {@code current_candidate_revision_id}. This extends 10.8
   * AC-14 from the service layer to the wire, and it is the shape a tab left open across a
   * recompile actually sends.
   */
  @Test
  void anOlderConfirmedRevisionCannotBeConfirmedAgainWhileANewerCandidateAwaits() {
    ConfirmFixtures.Candidate second = editAndRecompile();
    assertThat(currentCandidate()).isEqualTo(second.revisionId());
    assertThat(compileStatus()).isEqualTo("AWAITING_CONFIRMATION");

    ResponseEntity<String> refused = confirm(bodyFor(first), OWNER);

    assertThat(refused.getStatusCode().value()).isEqualTo(409);
    assertThat(errorCode(refused)).isEqualTo("STALE_CANDIDATE");
    assertThat(confirmedRevision())
        .as("the draft still points at the revision that was actually confirmed")
        .isEqualTo(first.revisionId());
    assertThat(confirmedBy(second.revisionId()))
        .as("and the awaiting candidate was not confirmed by the refused call")
        .isNull();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Edits the source through the real save path, then compiles the edited draft to a candidate. */
  private ConfirmFixtures.Candidate editAndRecompile() {
    studioService.updateTest(
        testId,
        new UITestRequest(
            "Confirmation draft",
            null,
            CSI_ID,
            "Production",
            EDITED,
            List.of(),
            new TestConfiguration("chromium", new Viewport(1920, 1080), 30, "networkidle"),
            first.sourceRevision(),
            first.configurationRevision()));
    return ConfirmFixtures.awaitConfirmation(states, jdbc, testId, EDITED);
  }

  private ResponseEntity<String> confirm(String body, String principal) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", "uid-" + principal);
    headers.set("X-User-Email", principal);
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

  private Map<String, Object> confirmationIdentity(UUID revisionId) {
    return jdbc.queryForMap(
        "SELECT confirmed_by, confirmed_at FROM ui_test_revisions WHERE id = ?", revisionId);
  }

  private String confirmedBy(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private UUID confirmedRevision() {
    return jdbc.queryForObject(
        "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
  }

  private UUID currentCandidate() {
    return jdbc.queryForObject(
        "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
  }

  private String compileStatus() {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private int revisionCount() {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId);
  }

  private static String errorCode(ResponseEntity<String> response) {
    try {
      return MAPPER.readTree(response.getBody()).path("error").asText();
    } catch (IOException e) {
      throw new AssertionError("response body is not JSON: " + response.getBody(), e);
    }
  }
}
