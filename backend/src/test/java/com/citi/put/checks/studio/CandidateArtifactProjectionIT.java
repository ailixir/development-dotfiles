package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.ConfirmFixtures;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.Viewport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.11c AC-26 — <b>the producer ADR-002 §21 authorized, end to end against a real
 * PostgreSQL.</b>
 *
 * <p>Every case drives the HTTP route and then reads the row the value came from. Nothing here is
 * compared against a literal: an expectation transcribed from a fixture is the shape this epic has
 * catalogued as VAC-11, and it would be satisfied by a producer that returned the literal. The hash
 * and the artifact are read back out of {@code ui_test_revisions} and compared byte for byte
 * against what the route published.
 *
 * <p>Every state is reached through {@link CompileStateService}'s real transitions via {@link
 * ConfirmFixtures}, never by writing {@code current_candidate_revision_id} by hand.
 *
 * <p><b>The discriminating case is {@link
 * #theArtifactAndHashBelongToTheCandidateAndNotToTheConfirmedRevision()}.</b> Everywhere else in a
 * draft's life the candidate and the confirmed revision are the same row, so a producer reading the
 * wrong one is green. The only fixture where the two differ is a draft that was confirmed, edited,
 * and recompiled — which is why that sequence is written out here rather than left as an edge case,
 * and why it is the falsification recorded in the story.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "checks.local-dev-auth.enabled=false")
@ActiveProfiles("local")
class CandidateArtifactProjectionIT {

  private static final String OWNER = "candidate-artifact-owner@citi.com";
  private static final String CSI_ID = "60411";
  private static final List<String> SOURCE = List.of("Go home", "Click \"Sign in\"");
  private static final String FIRST_CODE = "await page.goto('https://first/');";
  private static final String SECOND_CODE = "await page.goto('https://second/');";
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Autowired private CompileStateService states;
  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private TestRestTemplate restTemplate;

  private UUID testId;

  @BeforeEach
  void setUp() {
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
  }

  /** AC-26 — the two values on the single read are the persisted ones, compared against the row. */
  @Test
  void aDraftWithACandidatePublishesThePersistedHashAndArtifact() throws IOException {
    ConfirmFixtures.Candidate candidate =
        ConfirmFixtures.awaitConfirmation(states, jdbc, testId, SOURCE, FIRST_CODE);

    JsonNode body = getTest();

    assertThat(body.path("currentCandidateRevisionId").asText())
        .isEqualTo(candidate.revisionId().toString());
    assertThat(body.path("currentCandidateArtifactHash").asText())
        .as("the hash the route published is the one the revision row holds")
        .isEqualTo(persistedHash(candidate.revisionId()));
    assertThat(body.path("currentCandidateArtifact"))
        .as("the artifact the route published is the one the revision row holds")
        .isEqualTo(persistedArtifact(candidate.revisionId()));

    // Not a second expectation: this is what makes the two above discriminating. A producer that
    // returned an empty object, or the draft's steps, or the string "null", would satisfy a
    // presence check and fail here.
    assertThat(body.path("currentCandidateArtifact").path("steps")).hasSize(SOURCE.size());
    assertThat(body.path("currentCandidateArtifact").path("steps").get(0).path("code").asText())
        .isEqualTo(FIRST_CODE);
    assertThat(body.path("currentCandidateArtifactHash").asText()).hasSize(64);
  }

  /** AC-26 — no candidate, no values. A freshly seeded draft has never compiled. */
  @Test
  void aDraftWithNoCandidatePublishesNullForBoth() throws IOException {
    JsonNode body = getTest();

    assertThat(body.path("currentCandidateRevisionId").isNull()).isTrue();
    assertThat(body.hasNonNull("currentCandidateArtifactHash")).isFalse();
    assertThat(body.hasNonNull("currentCandidateArtifact")).isFalse();
    // The keys are present and null rather than absent: the schema declares them, and a client
    // that branches on presence must see the same shape in both states.
    assertThat(body.has("currentCandidateArtifactHash")).isTrue();
    assertThat(body.has("currentCandidateArtifact")).isTrue();
  }

  /**
   * AC-26 — the list projection nulls both on a row that publishes them on the single read.
   *
   * <p>Both routes are driven in <b>one</b> test on purpose. Two tests, one per route, would both
   * pass against a producer that had simply never populated the fields at all: the list's null is
   * only evidence of an omission if the very same draft is known to carry the values one read away.
   */
  @Test
  void theListProjectionNullsBothOnARowThatPublishesThemOnTheSingleRead() throws IOException {
    ConfirmFixtures.Candidate candidate =
        ConfirmFixtures.awaitConfirmation(states, jdbc, testId, SOURCE, FIRST_CODE);

    JsonNode single = getTest();
    assertThat(single.path("currentCandidateArtifactHash").asText())
        .isEqualTo(persistedHash(candidate.revisionId()));
    assertThat(single.hasNonNull("currentCandidateArtifact")).isTrue();

    JsonNode entry = listEntry();
    assertThat(entry.path("id").asText()).isEqualTo(testId.toString());
    assertThat(entry.path("currentCandidateRevisionId").asText())
        .as("the list still says a candidate exists; only the artifact and its hash are withheld")
        .isEqualTo(candidate.revisionId().toString());
    assertThat(entry.hasNonNull("currentCandidateArtifactHash")).isFalse();
    assertThat(entry.hasNonNull("currentCandidateArtifact")).isFalse();
    assertThat(entry.hasNonNull("compileDiagnostics")).isFalse();
  }

  /**
   * AC-26 falsification (ii), as a live test rather than only as a recorded mutation.
   *
   * <p>Confirm R1, edit the source, recompile to R2. The draft now names R2 as its candidate and R1
   * as its confirmed revision, and the two artifacts differ.
   *
   * <p><b>Measured, because the two available mutations are not equally informative.</b> Replacing
   * the read outright with {@code getConfirmedRevisionId()} reddens three of the four cases here,
   * for the uninteresting reason that an unconfirmed draft's confirmed revision is null. The
   * mutation that matters is the one a careless implementation would actually produce — prefer the
   * confirmed revision <em>when there is one</em>, fall back to the candidate — and that one
   * reddens <b>only this test</b>, with the other three green. So this sequence is not an edge case
   * padded onto the file: it is the only case in it that can see the defect.
   */
  @Test
  void theArtifactAndHashBelongToTheCandidateAndNotToTheConfirmedRevision() throws IOException {
    ConfirmFixtures.Candidate first =
        ConfirmFixtures.awaitConfirmation(states, jdbc, testId, SOURCE, FIRST_CODE);
    states.confirm(
        testId,
        first.revisionId(),
        first.artifactHash(),
        first.sourceRevision(),
        first.configurationRevision(),
        OWNER);

    studioService.updateTest(testId, request(List.of("Go home", "Click \"Log in\"")));
    ConfirmFixtures.Candidate second =
        ConfirmFixtures.awaitConfirmation(
            states, jdbc, testId, List.of("Go home", "Click \"Log in\""), SECOND_CODE);

    assertThat(second.revisionId())
        .as("the fixture only discriminates if the two revisions are actually different rows")
        .isNotEqualTo(first.revisionId());
    assertThat(persistedHash(second.revisionId()))
        .as("and if their artifacts actually differ")
        .isNotEqualTo(persistedHash(first.revisionId()));

    JsonNode body = getTest();

    assertThat(body.path("confirmedRevisionId").asText()).isEqualTo(first.revisionId().toString());
    assertThat(body.path("currentCandidateRevisionId").asText())
        .isEqualTo(second.revisionId().toString());
    assertThat(body.path("currentCandidateArtifactHash").asText())
        .isEqualTo(persistedHash(second.revisionId()));
    assertThat(body.path("currentCandidateArtifactHash").asText())
        .as("reading the confirmed revision instead of the candidate lands here")
        .isNotEqualTo(persistedHash(first.revisionId()));
    assertThat(body.path("currentCandidateArtifact"))
        .isEqualTo(persistedArtifact(second.revisionId()));
    assertThat(body.path("currentCandidateArtifact").path("steps").get(0).path("code").asText())
        .isEqualTo(SECOND_CODE);
  }

  /**
   * AC-26 — <b>what actually guarantees the hash and the artifact travel together.</b>
   *
   * <p>{@code UITestDto.from} used to withhold the hash when the artifact came back null, under a
   * comment saying the asymmetry was closed there. @qa deleted that branch and the whole studio
   * package stayed green, because the branch is unreachable: the columns are {@code NOT NULL} and a
   * {@code jsonb} column cannot hold anything that is not already valid JSON, so the parse cannot
   * fail for a revision row. A comment asserting a property over code nothing can exercise is this
   * epic's twenty-first catalogued vacuous shape, and the remedy taken was to move the claim to
   * where it is true and can be checked rather than to invent a hazard for the branch.
   *
   * <p>So the premise is asserted against the <b>live database</b> — {@code information_schema},
   * not the JPA annotations and not the migration text, both of which are copies of it. Making
   * either column nullable reddens this and nothing else.
   *
   * <p>The third assertion is the non-vacuity control: a column on the same table that <em>is</em>
   * nullable comes back {@code YES}, so a query that had silently stopped discriminating — an empty
   * result set, a mis-cased table name — cannot pass this.
   */
  @Test
  void theRevisionRowIsWhatGuaranteesTheArtifactAndItsHashTravelTogether() {
    assertThat(isNullable("artifact"))
        .as("ui_test_revisions.artifact is what makes a candidate's artifact always present")
        .isEqualTo("NO");
    assertThat(isNullable("artifact_hash"))
        .as("and its hash, which is why the producer needs no defence of its own")
        .isEqualTo("NO");
    assertThat(isNullable("confirmed_by"))
        .as("the control: this query can return YES, so NO above means something")
        .isEqualTo("YES");
    assertThat(dataType("artifact"))
        .as("jsonb is why the artifact column cannot hold text that fails to parse")
        .isEqualTo("jsonb");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private String isNullable(String column) {
    return jdbc.queryForObject(
        "SELECT is_nullable FROM information_schema.columns"
            + " WHERE table_name = 'ui_test_revisions' AND column_name = ?",
        String.class,
        column);
  }

  private String dataType(String column) {
    return jdbc.queryForObject(
        "SELECT data_type FROM information_schema.columns"
            + " WHERE table_name = 'ui_test_revisions' AND column_name = ?",
        String.class,
        column);
  }

  private String persistedHash(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private JsonNode persistedArtifact(UUID revisionId) throws IOException {
    String stored =
        jdbc.queryForObject(
            "SELECT artifact FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
    return MAPPER.readTree(stored);
  }

  private JsonNode getTest() throws IOException {
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/studio/tests/" + testId,
            HttpMethod.GET,
            new HttpEntity<>(headers()),
            String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    return MAPPER.readTree(response.getBody());
  }

  private JsonNode listEntry() throws IOException {
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/studio/tests?csiId=" + CSI_ID,
            HttpMethod.GET,
            new HttpEntity<>(headers()),
            String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode page = MAPPER.readTree(response.getBody());
    for (JsonNode entry : page.path("data")) {
      if (testId.toString().equals(entry.path("id").asText())) {
        return entry;
      }
    }
    throw new AssertionError("the list did not return the draft under test: " + page);
  }

  private HttpHeaders headers() {
    HttpHeaders headers = new HttpHeaders();
    headers.set("X-User-Id", "uid-" + OWNER);
    headers.set("X-User-Email", OWNER);
    headers.set("X-User-Roles", "");
    headers.set("X-User-Csi-Ownership", CSI_ID + ":owner");
    return headers;
  }

  private UITestRequest request(List<String> steps) {
    return new UITestRequest(
        "Confirmation draft",
        null,
        CSI_ID,
        "Production",
        steps,
        List.of(),
        new TestConfiguration("chromium", new Viewport(1920, 1080), 30, "networkidle"),
        1L,
        1L);
  }
}
