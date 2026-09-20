package com.citi.put.checks.studio.compile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Seeding for story 10.9's confirmation and sweep tests.
 *
 * <p>Every state these helpers produce is reached through {@link CompileStateService}'s real
 * transitions, never by inserting a {@code ui_test_revisions} row or setting {@code
 * confirmed_revision_id} by hand. A fixture that hand-wrote a confirmed revision would prove only
 * that the route accepts hand-written rows, and AC-21 requires the opposite: the seeding helpers
 * capable of producing a confirmed revision drive the real transition.
 *
 * <p>The one thing written directly is the draft row itself and, in the sweep tests, {@code
 * compile_started_at} backdating — neither is a compile-state transition, and there is no other way
 * to make a clock look old without sleeping for ten minutes.
 */
public final class ConfirmFixtures {

  public static final ObjectMapper MAPPER = new ObjectMapper();

  private ConfirmFixtures() {}

  /** A draft with the given source, {@code STALE}, never compiled. */
  public static UUID seedTest(JdbcTemplate jdbc, String csiId, String owner, List<String> source) {
    UUID id = UUID.randomUUID();
    ArrayNode steps = MAPPER.createArrayNode();
    source.forEach(steps::add);
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Confirmation draft', ?,"
            + " 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb), ?, ?, ?)",
        id,
        csiId,
        steps.toString(),
        owner,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  /**
   * Drives one real compile to {@code AWAITING_CONFIRMATION} and returns the candidate.
   *
   * @return the candidate the route must be given in order to succeed
   */
  public static Candidate awaitConfirmation(
      CompileStateService states, JdbcTemplate jdbc, UUID testId, List<String> source) {
    return awaitConfirmation(states, jdbc, testId, source, "await page.goto('https://a/');");
  }

  /** The same, with a distinguishing artifact body so two compiles produce two artifacts. */
  public static Candidate awaitConfirmation(
      CompileStateService states,
      JdbcTemplate jdbc,
      UUID testId,
      List<String> source,
      String code) {
    CompileRequest request = states.beginCompile(testId);
    CandidateRevision candidate = candidate(source, request.configurationRevision(), code);
    states.publishCandidate(testId, request, candidate);
    UUID revisionId =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
    return new Candidate(
        revisionId,
        candidate.artifactHash(),
        request.sourceRevision(),
        request.configurationRevision());
  }

  /** The four values the frozen confirm body carries. */
  public record Candidate(
      UUID revisionId, String artifactHash, long sourceRevision, long configurationRevision) {}

  public static CandidateRevision candidate(
      List<String> source, long configurationRevision, String code) {
    String canonicalSource = ArtifactCanonicalizer.canonicalSource(source);
    String artifact = ArtifactCanonicalizer.canonicalize(artifactFor(source, code));
    return new CandidateRevision(
        configurationRevision,
        canonicalSource,
        ArtifactCanonicalizer.hash(canonicalSource),
        artifact,
        ArtifactCanonicalizer.hash(artifact),
        CompilePins.SUPPORTED_ARTIFACT_VERSION,
        "{\"browser\":\"chromium\",\"environment\":\"Production\"}",
        "{\"variables\":[],\"secrets\":[]}",
        provenance(),
        "fixture@citi.com");
  }

  public static String artifactFor(List<String> source, String code) {
    ObjectNode artifact = MAPPER.createObjectNode();
    artifact.put("version", CompilePins.SUPPORTED_ARTIFACT_VERSION);
    ArrayNode steps = artifact.putArray("steps");
    for (int index = 0; index < source.size(); index++) {
      ObjectNode step = steps.addObject();
      step.put("stepIndex", index);
      step.put("originalText", source.get(index));
      step.put("code", code);
    }
    return artifact.toString();
  }

  public static String provenance() {
    ObjectNode provenance = MAPPER.createObjectNode();
    provenance.put("model", "stub-model@1");
    provenance.put("promptVersion", CompilePins.PROMPT_VERSION);
    provenance.put("syntaxReferenceVersion", CompilePins.SYNTAX_REFERENCE_VERSION);
    provenance.put("validatorSchemaVersion", "2.0.0");
    provenance.put("languagePolicyVersion", "2.0.0");
    provenance.put("executorVersion", "2.0.0");
    provenance.put("playwrightVersion", "1.63.0");
    provenance.put("artifactSchemaVersion", CompilePins.SUPPORTED_ARTIFACT_VERSION);
    return provenance.toString();
  }

  public static void seedUser(JdbcTemplate jdbc, String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Confirmation User', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  public static void seedCsi(JdbcTemplate jdbc, String csiId, String owner) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Confirmation CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        csiId,
        owner,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
