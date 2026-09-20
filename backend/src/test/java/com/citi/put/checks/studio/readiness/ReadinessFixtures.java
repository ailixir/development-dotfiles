package com.citi.put.checks.studio.readiness;

import com.citi.put.checks.studio.compile.ArtifactCanonicalizer;
import com.citi.put.checks.studio.compile.CandidateRevision;
import com.citi.put.checks.studio.compile.CompilePins;
import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Seeding for the readiness tests: a draft, and a draft that has genuinely been through the compile
 * state machine to a confirmed revision.
 *
 * <p>The confirmation is driven through {@link CompileStateService} rather than by inserting a row,
 * so the fixture cannot accidentally construct a state the real transitions would refuse. A test
 * whose "confirmed" revision was hand-written would prove that the gate accepts hand-written rows.
 */
final class ReadinessFixtures {

  static final String OWNER = "readiness-owner@citi.com";
  static final String CSI_ID = "60402";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private ReadinessFixtures() {}

  /** A draft, {@code STALE}, never compiled. */
  static UUID seedDraft(JdbcTemplate jdbc, List<String> steps) {
    UUID id = UUID.randomUUID();
    ArrayNode stepsJson = MAPPER.createArrayNode();
    steps.forEach(stepsJson::add);
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Readiness draft', ?,"
            + " 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb), ?, ?, ?)",
        id,
        CSI_ID,
        stepsJson.toString(),
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  /**
   * Drives a draft all the way to a confirmed revision through the real transitions.
   *
   * @return the confirmed revision id
   */
  static UUID confirm(
      CompileStateService states, JdbcTemplate jdbc, UUID testId, List<String> steps) {
    return confirm(
        states,
        jdbc,
        testId,
        steps,
        provenance(CompilePins.SYNTAX_REFERENCE_VERSION, "2.0.0"),
        CompilePins.SUPPORTED_ARTIFACT_VERSION);
  }

  /** The same, with a provenance and schema version the caller chooses — for AC-25. */
  static UUID confirm(
      CompileStateService states,
      JdbcTemplate jdbc,
      UUID testId,
      List<String> steps,
      String provenanceJson,
      int artifactSchemaVersion) {
    CompileRequest request = states.beginCompile(testId);
    CandidateRevision candidate =
        candidate(steps, request.configurationRevision(), provenanceJson, artifactSchemaVersion);
    states.publishCandidate(testId, request, candidate);
    UUID revisionId =
        jdbc.queryForObject(
            "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
    states.confirm(
        testId,
        revisionId,
        candidate.artifactHash(),
        request.sourceRevision(),
        request.configurationRevision(),
        OWNER);
    return revisionId;
  }

  /** A candidate whose hashes are produced by the same helper the gate re-derives them with. */
  static CandidateRevision candidate(
      List<String> steps,
      long configurationRevision,
      String provenanceJson,
      int artifactSchemaVersion) {
    String source = ArtifactCanonicalizer.canonicalSource(steps);
    String artifact = ArtifactCanonicalizer.canonicalize(artifactFor(steps));
    return new CandidateRevision(
        configurationRevision,
        source,
        ArtifactCanonicalizer.hash(source),
        artifact,
        ArtifactCanonicalizer.hash(artifact),
        artifactSchemaVersion,
        "{\"browser\":\"chromium\",\"environment\":\"Production\"}",
        "{\"variables\":[],\"secrets\":[]}",
        provenanceJson,
        OWNER);
  }

  /** An index-aligned artifact for the given source, in the §4.4 shape. */
  static String artifactFor(List<String> steps) {
    ObjectNode artifact = MAPPER.createObjectNode();
    artifact.put("version", CompilePins.SUPPORTED_ARTIFACT_VERSION);
    ArrayNode stepNodes = artifact.putArray("steps");
    for (int index = 0; index < steps.size(); index++) {
      ObjectNode step = stepNodes.addObject();
      step.put("stepIndex", index);
      step.put("originalText", steps.get(index));
      step.put("code", "await page.goto('https://example.com/');");
    }
    return artifact.toString();
  }

  static String provenance(String syntaxReferenceVersion, String validatorSchemaVersion) {
    ObjectNode provenance = MAPPER.createObjectNode();
    provenance.put("model", "stub-model@1");
    provenance.put("promptVersion", CompilePins.PROMPT_VERSION);
    provenance.put("syntaxReferenceVersion", syntaxReferenceVersion);
    provenance.put("validatorSchemaVersion", validatorSchemaVersion);
    provenance.put("languagePolicyVersion", validatorSchemaVersion);
    provenance.put("executorVersion", "2.0.0");
    provenance.put("playwrightVersion", "1.63.0");
    provenance.put("artifactSchemaVersion", CompilePins.SUPPORTED_ARTIFACT_VERSION);
    return provenance.toString();
  }

  static void seedUser(JdbcTemplate jdbc, String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Readiness Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  static void seedCsi(JdbcTemplate jdbc, String id) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Readiness CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
