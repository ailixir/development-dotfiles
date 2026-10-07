package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Story 10.49 AC-18/19 (decision 2026-10-07 item 5a) — with the staged cutover {@code
 * backend/db/cutover/V19__studio_inference_candidate_identity.sql} applied, a V1 Run compile still
 * reaches {@code READY}, linked to its own compile request, with {@code confirmation_source = RUN}.
 *
 * <p><b>The live chain, not a seeded request.</b> The request row is written by {@code
 * CompileStateService.beginCompile} exactly as {@code CompilePipeline.compile} calls it, and the
 * revision by {@code publishAcceptedCandidate}. {@code
 * InferenceMigrationLatestIT.capturedPublisherAcceptsContextAwareDraftAfterCutover} inserts its own
 * request and so cannot show this.
 *
 * <p><b>Disposable.</b> V19 is forward-only, so it is applied inside one transaction on the test
 * database, together with the same-session drain attestation the runbook requires, and that
 * transaction is always rolled back. PostgreSQL DDL is transactional: the rollback restores the
 * head schema (V19 absent) for every other test in this JVM, which {@link
 * #theCutoverIsRolledBackSoTheHeadSchemaIsUntouched()} checks.
 */
@SpringBootTest
@ActiveProfiles("local")
class RunCompileAfterV19Test {

  private static final Path V19 =
      Path.of("db", "cutover", "V19__studio_inference_candidate_identity.sql");
  private static final String OWNER = "v19-run-owner@citi.com";
  private static final String CSI_ID = "60419";
  private static final List<String> SOURCE = List.of("Go to the home page");
  private static final String CONFIGURATION =
      "{\"browser\":\"chromium\",\"viewport\":{\"width\":1280,\"height\":720},"
          + "\"timeoutSeconds\":30,\"waitStrategy\":\"load\",\"environment\":\"Production\"}";
  private static final String CAPABILITY_PROBE =
      "SELECT NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_ui_test_revisions_identity')"
          + " AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'ui_test_revisions'::regclass"
          + " AND tgname = 'trg_ui_test_revision_require_request' AND NOT tgisinternal)";

  @Autowired private CompileStateService states;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private PlatformTransactionManager transactionManager;

  private UUID testId;

  @BeforeEach
  void setUp() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'V19 Run', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'V19 CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    testId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'V19 Run draft', ?,"
            + " 'Production', 'chromium', CAST('[\"Go to the home page\"]' AS jsonb),"
            + " CAST('[]' AS jsonb), ?, ?, ?)",
        testId,
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void aV1RunCompileReachesReadyLinkedToItsRequestAfterV19() throws Exception {
    String cutover = Files.readString(V19);
    TransactionTemplate transaction = new TransactionTemplate(transactionManager);

    Map<String, Object> observed =
        transaction.execute(
            status -> {
              status.setRollbackOnly(); // V19 must never outlive this test.
              jdbc.execute("SET LOCAL checks.inference_publishers_drained = 'true'");
              jdbc.execute(cutover);
              Map<String, Object> seen = new HashMap<>();
              seen.put("capability", jdbc.queryForObject(CAPABILITY_PROBE, Boolean.class));

              CompileRequest request =
                  states.beginCompile(testId, inputs(), "b".repeat(64), Duration.ofMinutes(4));
              seen.put("result", states.publishAcceptedCandidate(testId, request, candidate()));
              seen.put("requestId", request.requestId());
              seen.putAll(
                  jdbc.queryForMap(
                      "SELECT t.compile_status, r.compile_request_id, r.confirmed_by,"
                          + " r.confirmation_source, t.confirmed_revision_id = r.id AS accepted"
                          + " FROM ui_tests t JOIN ui_test_revisions r"
                          + " ON r.id = t.current_candidate_revision_id WHERE t.id = ?",
                      testId));
              states.recordOutcome(request.requestId(), "PUBLISHED", null, null, null);
              seen.put(
                  "outcomeRevisionId",
                  jdbc.queryForObject(
                      "SELECT outcome->>'revisionId' FROM ui_test_compile_outcomes"
                          + " WHERE request_id = ?",
                      String.class,
                      request.requestId()));
              return seen;
            });

    System.out.println("[10.49 AC-18] after V19: " + observed);
    assertThat(observed.get("capability")).as("V19 really applied in this session").isEqualTo(true);
    assertThat(observed.get("result")).isEqualTo(PublishResult.PUBLISHED);
    assertThat(observed.get("compile_status")).isEqualTo("READY");
    assertThat(observed.get("accepted")).isEqualTo(Boolean.TRUE);
    assertThat(observed.get("compile_request_id")).isEqualTo(observed.get("requestId"));
    assertThat(observed.get("confirmed_by")).isEqualTo(OWNER);
    assertThat(observed.get("confirmation_source")).isEqualTo("RUN");
    assertThat(observed.get("outcomeRevisionId")).as("AC-7: linked after V19").isNotNull();
  }

  @Test
  void theCutoverIsRolledBackSoTheHeadSchemaIsUntouched() {
    assertThat(jdbc.queryForObject(CAPABILITY_PROBE, Boolean.class)).isFalse();
    assertThat(
            jdbc.queryForObject(
                "SELECT to_regclass('uq_ui_test_revisions_identity') IS NOT NULL", Boolean.class))
        .isTrue();
  }

  private CompileInputs inputs() {
    return new CompileInputs(testId, CSI_ID, OWNER, SOURCE, List.of(), List.of(), CONFIGURATION);
  }

  private CandidateRevision candidate() {
    String source = ArtifactCanonicalizer.canonicalSource(SOURCE);
    String artifact =
        ArtifactCanonicalizer.canonicalize(
            "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"Go to the home page\","
                + "\"code\":\"await page.goto('https://example.com');\"}]}");
    return new CandidateRevision(
        1L,
        source,
        ArtifactCanonicalizer.hash(source),
        artifact,
        ArtifactCanonicalizer.hash(artifact),
        1,
        CONFIGURATION,
        inputs().referencesJson(),
        "{\"model\":\"stub-model@1\"}",
        OWNER);
  }
}
