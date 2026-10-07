package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfoService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.23 AC-5 on the <em>current</em> Flyway head rather than V18: V18 is followed by V20–V26
 * in the ordinary startup path while V19 remains manually staged, so the additive guarantees, the
 * baseline query and the writer cutover are re-proven against the schema a real deployment actually
 * reaches. Every case runs in a transaction that is rolled back.
 */
@Testcontainers(disabledWithoutDocker = true)
class InferenceMigrationLatestIT {

  private static final PostgreSQLContainer<?> POSTGRES =
      new PostgreSQLContainer<>("postgres:15-alpine").withDatabaseName("inference_latest");
  private static final String FRESH_DB = "inference_latest_fresh";
  private static final String CSI = "71023";
  private static final String OTHER_CSI = "71024";
  private static final UUID TEST_ID = UUID.randomUUID();
  private static final UUID LEGACY_REVISION = UUID.randomUUID();
  private static final UUID LEGACY_EXECUTION = UUID.randomUUID();
  private static final String HASH = "a".repeat(64);
  private static final String FINGERPRINT = "f".repeat(64);
  private static final String SOURCE = "[\"Click save\"]";
  private static final String CONFIGURATION =
      "{\"browser\":\"chromium\",\"viewport\":{\"width\":1280,\"height\":720},"
          + "\"timeoutSeconds\":30,\"waitStrategy\":\"load\",\"environment\":\"Production\"}";
  private static final String PROVENANCE =
      "{\"validatorSchemaVersion\":\"2.0.0\",\"executorVersion\":\"2.0.0\","
          + "\"playwrightVersion\":\"1.63.0\"}";
  private static final String RUNTIME =
      "{\"validator\":\"2.0.0\",\"executor\":\"2.0.0\",\"playwright\":\"1.63.0\"}";
  private static final String SCOPED =
      "{\"version\":2,\"steps\":[{\"id\":\"00000000-0000-0000-0000-000000000001\","
          + "\"text\":\"Click save\"}],\"scope\":{\"policyVersion\":\"1.0.0\","
          + "\"declaration\":\"STEP_SCOPED\"}}";

  /** Mirrors {@code InferenceCaptureStore.requestIdentityAvailable()} at HEAD. */
  private static final String CAPABILITY_PROBE =
      "SELECT NOT EXISTS (SELECT 1 FROM pg_constraint"
          + " WHERE conrelid='ui_test_revisions'::regclass"
          + " AND conname='uq_ui_test_revisions_identity')"
          + " AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='ui_test_revisions'::regclass"
          + " AND tgname='trg_ui_test_revision_require_request' AND NOT tgisinternal)";

  /** Mirrors the baseline selection in {@code InferenceCaptureStore.persist} at HEAD. */
  private static final String BASELINE_QUERY =
      """
      SELECT r.id, e.id AS execution_id
        FROM ui_test_revisions r
        LEFT JOIN LATERAL (
          SELECT x.id, x.started_at FROM ui_test_executions x
           WHERE x.revision_id = r.id AND x.ui_test_id = r.test_id AND x.csi_id = r.csi_id
             AND x.status = 'PASSED' AND x.execution_scope = 'FULL'
             AND x.configuration_snapshot->>'sourceRevision' = r.source_revision::text
             AND x.configuration_snapshot->>'configurationRevision' = r.configuration_revision::text
             AND x.configuration_snapshot->>'artifactHash' = r.artifact_hash
             AND x.configuration_snapshot->>'browser' = r.configuration->>'browser'
             AND x.configuration_snapshot->>'viewportWidth' = r.configuration->'viewport'->>'width'
             AND x.configuration_snapshot->>'viewportHeight' = r.configuration->'viewport'->>'height'
             AND x.configuration_snapshot->>'timeoutSeconds' = r.configuration->>'timeoutSeconds'
             AND x.configuration_snapshot->>'waitStrategy' = r.configuration->>'waitStrategy'
             AND x.configuration_snapshot->>'environment' = r.configuration->>'environment'
             AND x.runtime_versions->>'validator' = r.provenance->>'validatorSchemaVersion'
             AND x.runtime_versions->>'executor' = r.provenance->>'executorVersion'
             AND x.runtime_versions->>'playwright' = r.provenance->>'playwrightVersion'
           ORDER BY x.started_at DESC, x.id DESC LIMIT 1
        ) e ON TRUE
       WHERE r.test_id = ? AND r.csi_id = ? AND r.confirmed_at IS NOT NULL
         AND r.authoring_snapshot IS NOT NULL AND r.compile_request_id IS NOT NULL
         AND r.compilation_fingerprint = ?
         AND r."references" = CAST(? AS jsonb)
         AND (e.id IS NOT NULL OR (r.authoring_snapshot = CAST(? AS jsonb)
           AND r.source_revision = ? AND r.configuration_revision <> ?))
       ORDER BY r.created_at DESC, r.id DESC LIMIT 1
      """;

  /** The HEAD legacy publisher statement ({@code CompileStateService.INSERT_REVISION}). */
  private static final String LEGACY_WRITER =
      "INSERT INTO ui_test_revisions(test_id,csi_id,source_revision,configuration_revision,"
          + "source,source_hash,artifact,artifact_hash,artifact_schema_version,configuration,"
          + "\"references\",provenance,created_by,reference_policy,intent_derivation_version)"
          + " VALUES('%s','"
          + CSI
          + "',%d,1,'"
          + SOURCE
          + "','"
          + HASH
          + "','{\"version\":1,\"steps\":[]}','%s',1,'"
          + CONFIGURATION
          + "','{}','{}','inference@citi.com',NULL,NULL) ON CONFLICT DO NOTHING RETURNING id";

  private static String legacyFingerprint;
  private static String legacyExecutionFingerprint;

  @BeforeAll
  static void upgrade() throws SQLException {
    POSTGRES.start();
    migrate(POSTGRES.getJdbcUrl(), "17");
    try (Connection c = connect();
        Statement s = c.createStatement()) {
      seedOwners(s);
      s.executeUpdate(draft(TEST_ID, CSI));
      s.executeUpdate(
          "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,configuration_revision,"
              + "source,source_hash,artifact,artifact_hash,artifact_schema_version,configuration,"
              + "\"references\",provenance,created_by,confirmed_by,confirmed_at) VALUES('"
              + LEGACY_REVISION
              + "','"
              + TEST_ID
              + "','"
              + CSI
              + "',1,1,'"
              + SOURCE
              + "','"
              + HASH
              + "','{\"version\":1,\"steps\":[]}','"
              + HASH
              + "',1,'"
              + CONFIGURATION
              + "','{}','"
              + PROVENANCE
              + "','inference@citi.com','inference@citi.com',NOW())");
      // A realistic legacy pass whose snapshot/runtime match its revision exactly: only the
      // missing truthful FULL marker (and missing request identity) keeps it ineligible.
      s.executeUpdate(execution(LEGACY_EXECUTION, TEST_ID, CSI, LEGACY_REVISION, 1, HASH, null));
      legacyFingerprint = scalar(c, LEGACY_REVISIONS_DIGEST);
      legacyExecutionFingerprint = scalar(c, LEGACY_EXECUTIONS_DIGEST);
    }
    migrate(POSTGRES.getJdbcUrl(), null);
    try (Connection c = connect();
        Statement s = c.createStatement()) {
      s.execute("CREATE DATABASE " + FRESH_DB);
    }
    migrate(freshUrl(), null);
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  private static final String LEGACY_REVISIONS_DIGEST =
      "SELECT md5(string_agg(row(id,test_id,csi_id,source_revision,configuration_revision,source,"
          + "source_hash,artifact,artifact_hash,configuration,\"references\",provenance,created_by,"
          + "created_at,confirmed_by,confirmed_at)::text, ',' ORDER BY id)) FROM ui_test_revisions";
  private static final String LEGACY_EXECUTIONS_DIGEST =
      "SELECT md5(string_agg(row(id,ui_test_id,status,started_at,revision_id,csi_id,"
          + "configuration_snapshot,runtime_versions)::text, ',' ORDER BY id))"
          + " FROM ui_test_executions";

  @Test
  void freshAndUpgradedDatabasesReachTheSameHeadWithoutStagedV19() throws SQLException {
    for (String url : List.of(POSTGRES.getJdbcUrl(), freshUrl())) {
      MigrationInfoService info = flyway(url, null).info();
      assertThat(info.pending()).isEmpty();
      try (Connection c = connect(url)) {
        assertThat(scalar(c, "SELECT max(version::int) FROM flyway_schema_history"))
            .isEqualTo(info.current().getVersion().getVersion());
        assertThat(scalar(c, "SELECT count(*) FROM flyway_schema_history WHERE version='19'"))
            .isEqualTo("0");
        assertThat(scalar(c, "SELECT count(*) FROM flyway_schema_history WHERE NOT success"))
            .isEqualTo("0");
        assertThat(scalar(c, CAPABILITY_PROBE)).isEqualTo("f");
        assertThat(scalar(c, "SELECT to_regclass('uq_ui_test_revisions_identity') IS NOT NULL"))
            .isEqualTo("t");
      }
    }
    try (Connection upgraded = connect();
        Connection fresh = connect(freshUrl())) {
      for (String catalog : SCHEMA_CATALOG) {
        assertThat(rows(upgraded, catalog)).as(catalog).isEqualTo(rows(fresh, catalog));
      }
    }
  }

  private static final List<String> SCHEMA_CATALOG =
      List.of(
          "SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable"
              + " FROM information_schema.columns WHERE table_schema='public'"
              + " AND table_name IN ('ui_tests','ui_test_revisions','ui_test_compile_requests',"
              + "'ui_test_compile_outcomes','ui_test_step_identities','ui_test_executions')"
              + " ORDER BY 1",
          "SELECT indexname||':'||indexdef FROM pg_indexes WHERE schemaname='public'"
              + " AND tablename IN ('ui_tests','ui_test_revisions','ui_test_compile_requests',"
              + "'ui_test_compile_outcomes','ui_test_step_identities','ui_test_executions')"
              + " ORDER BY 1",
          "SELECT tgrelid::regclass::text||':'||tgname||':'||tgenabled::text FROM pg_trigger"
              + " WHERE NOT tgisinternal AND tgrelid::regclass::text IN ('ui_tests',"
              + "'ui_test_revisions','ui_test_compile_requests','ui_test_compile_outcomes',"
              + "'ui_test_step_identities','ui_test_executions') ORDER BY 1",
          "SELECT conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid)"
              + " FROM pg_constraint WHERE conrelid::regclass::text IN ('ui_tests',"
              + "'ui_test_revisions','ui_test_compile_requests','ui_test_compile_outcomes',"
              + "'ui_test_step_identities') ORDER BY 1",
          "SELECT p.proname||':'||md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n"
              + " ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'studio_%'"
              + " OR p.proname LIKE 'ui_test_%' OR p.proname LIKE 'capture_%') ORDER BY 1");

  @Test
  void upgradeToHeadRewritesNoHistoryAndInventsNoEligibility() throws SQLException {
    try (Connection c = connect()) {
      assertThat(scalar(c, LEGACY_REVISIONS_DIGEST)).isEqualTo(legacyFingerprint);
      assertThat(scalar(c, LEGACY_EXECUTIONS_DIGEST)).isEqualTo(legacyExecutionFingerprint);
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_revisions WHERE compile_request_id IS NULL"
                      + " AND authoring_snapshot IS NULL AND compilation_fingerprint IS NULL"
                      + " AND authoring IS NULL AND reference_policy IS NULL"))
          .isEqualTo("1");
      assertThat(scalar(c, "SELECT count(*) FROM ui_test_executions WHERE execution_scope IS NULL"))
          .isEqualTo("1");
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_tests WHERE authoring_snapshot IS NULL"
                      + " AND scope_reviewed_at IS NULL"))
          .isEqualTo("1");
      for (String table :
          List.of(
              "ui_test_compile_requests", "ui_test_compile_outcomes", "ui_test_step_identities")) {
        assertThat(scalar(c, "SELECT count(*) FROM " + table)).as(table).isEqualTo("0");
      }
      // Even with a matching fingerprint and the legacy row's own snapshot, nothing is eligible.
      assertThat(baseline(c, TEST_ID, CSI, FINGERPRINT)).isNull();
    }
  }

  @Test
  void everyV18RevisionColumnRemainsImmutableOnTheHeadSchema() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID request = insertRequest(c, TEST_ID, CSI, 2, LEGACY_REVISION, FINGERPRINT);
      UUID sibling = insertRequest(c, TEST_ID, CSI, 2, LEGACY_REVISION, FINGERPRINT);
      UUID revision = UUID.randomUUID();
      s.executeUpdate(candidate(revision, request, "b".repeat(64), PROVENANCE, null));
      String where = " WHERE id='" + revision + "'";
      List<String> tampering =
          List.of(
              "UPDATE ui_test_revisions SET compile_request_id='" + sibling + "'" + where,
              "UPDATE ui_test_revisions SET compile_request_id=NULL" + where,
              "UPDATE ui_test_revisions SET authoring_snapshot='{\"tampered\":true}'" + where,
              "UPDATE ui_test_revisions SET authoring_hash='" + "c".repeat(64) + "'" + where,
              "UPDATE ui_test_revisions SET scope_reviewed_by='other'" + where,
              "UPDATE ui_test_revisions SET scope_reviewed_at=NOW()-INTERVAL '1 day'" + where,
              "UPDATE ui_test_revisions SET compilation_fingerprint='"
                  + "c".repeat(64)
                  + "'"
                  + where,
              "UPDATE ui_test_revisions SET baseline_revision_id=NULL" + where);
      List<String> accepted = new ArrayList<>();
      for (String sql : tampering) {
        if (!rejected(c, sql, "immutable")) {
          accepted.add(sql);
        }
      }
      accepted.forEach(sql -> System.out.println("[AC-5 accepted tampering] " + sql));
      assertThat(accepted).as("V18 revision columns writable on the head schema").isEmpty();
      c.rollback();
    }
  }

  @Test
  void appendOnlyCaptureAndAuthoringGuardsSurviveLaterMigrations() throws SQLException {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID step = UUID.randomUUID();
      s.executeUpdate(
          "INSERT INTO ui_test_step_identities(step_id,test_id,created_by) VALUES('"
              + step
              + "','"
              + TEST_ID
              + "','inference@citi.com')");
      UUID request = insertRequest(c, TEST_ID, CSI, 2, null, FINGERPRINT);
      s.executeUpdate(
          "INSERT INTO ui_test_compile_outcomes(request_id,outcome) VALUES('"
              + request
              + "','{\"state\":\"DISCARDED\"}')");
      reject(c, "UPDATE ui_test_step_identities SET test_id=test_id", "immutable");
      reject(c, "DELETE FROM ui_test_step_identities WHERE step_id='" + step + "'", "immutable");
      reject(c, "UPDATE ui_test_compile_requests SET compilation_plan='{}'", "immutable");
      reject(c, "DELETE FROM ui_test_compile_requests", "immutable");
      reject(c, "UPDATE ui_test_compile_outcomes SET outcome='{}'", "immutable");
      reject(
          c,
          "INSERT INTO ui_test_compile_outcomes(request_id,outcome) VALUES('" + request + "','{}')",
          "duplicate key");
      reject(
          c,
          "UPDATE ui_tests SET authoring_snapshot='"
              + SCOPED
              + "',authoring_hash='"
              + HASH
              + "' WHERE id='"
              + TEST_ID
              + "'",
          "requires a new source_revision");
      reject(
          c,
          candidate(UUID.randomUUID(), request, HASH, PROVENANCE, null)
              .replace("r.configuration,r.\"references\"", "'{}'::jsonb,r.\"references\""),
          "does not match immutable");
      c.rollback();
    }
  }

  @Test
  void historicalExecutionCannotBeRelabelledAsFullEvidence() throws SQLException {
    try (Connection c = transaction()) {
      boolean guarded =
          rejected(
              c,
              "UPDATE ui_test_executions SET execution_scope='FULL' WHERE id='"
                  + LEGACY_EXECUTION
                  + "'",
              "immutable");
      assertThat(guarded).as("NULL execution_scope relabelled FULL by plain DML").isTrue();
      c.rollback();
    }
  }

  @Test
  void baselineSelectionIsScopedDeterministicAndFallsBackWhenEvidenceExpires() throws Exception {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID sibling = UUID.randomUUID();
      UUID foreign = UUID.randomUUID();
      s.executeUpdate(draft(sibling, CSI));
      s.executeUpdate(draft(foreign, OTHER_CSI));
      // Candidates, oldest first. Each has a distinct source revision, so the pre-V19 content
      // identity never collides; created_at is pinned to make the ordering explicit.
      UUID oldPassing = published(c, TEST_ID, CSI, 2, "-5 days", true, FINGERPRINT, PROVENANCE);
      UUID runtimeDrift =
          published(
              c,
              TEST_ID,
              CSI,
              3,
              "-4 days",
              true,
              FINGERPRINT,
              PROVENANCE.replace("1.63.0", "1.62.0"));
      UUID unconfirmed = published(c, TEST_ID, CSI, 4, "-3 days", false, FINGERPRINT, PROVENANCE);
      UUID otherFingerprint =
          published(c, TEST_ID, CSI, 5, "-2 days", true, "e".repeat(64), PROVENANCE);
      UUID tieA = published(c, TEST_ID, CSI, 6, "-1 day", true, FINGERPRINT, PROVENANCE);
      UUID tieB = published(c, TEST_ID, CSI, 7, "-1 day", true, FINGERPRINT, PROVENANCE);
      UUID siblingNewest = published(c, sibling, CSI, 1, "-1 hour", true, FINGERPRINT, PROVENANCE);
      UUID foreignNewest =
          published(c, foreign, OTHER_CSI, 1, "-1 hour", true, FINGERPRINT, PROVENANCE);

      UUID olderFull = pass(c, TEST_ID, CSI, oldPassing, 2, "-4 days", "FULL", "PASSED");
      UUID newestFull = pass(c, TEST_ID, CSI, oldPassing, 2, "-3 days", "FULL", "PASSED");
      pass(c, TEST_ID, CSI, oldPassing, 2, "-2 days", "FULL", "FAILED");
      pass(c, TEST_ID, CSI, oldPassing, 2, "-1 day", null, "PASSED");
      pass(c, TEST_ID, CSI, runtimeDrift, 3, "-3 days", "FULL", "PASSED");
      pass(c, TEST_ID, CSI, unconfirmed, 4, "-2 days", "FULL", "PASSED");
      pass(c, TEST_ID, CSI, otherFingerprint, 5, "-1 day", "FULL", "PASSED");
      UUID tieAPass = pass(c, TEST_ID, CSI, tieA, 6, "-20 hours", "FULL", "PASSED");
      UUID tieBPass = pass(c, TEST_ID, CSI, tieB, 7, "-20 hours", "FULL", "PASSED");
      pass(c, sibling, CSI, siblingNewest, 1, "-10 minutes", "FULL", "PASSED");
      pass(c, foreign, OTHER_CSI, foreignNewest, 1, "-10 minutes", "FULL", "PASSED");

      // Equal created_at: (created_at DESC, id DESC) picks the larger id, with its own evidence.
      boolean bWins = tieB.toString().compareTo(tieA.toString()) > 0;
      assertThat(baseline(c, TEST_ID, CSI, FINGERPRINT))
          .containsExactly(
              (bWins ? tieB : tieA).toString(), (bWins ? tieBPass : tieAPass).toString());
      // Same test id in the wrong CSI selects nothing; foreign rows never leak in.
      assertThat(baseline(c, TEST_ID, OTHER_CSI, FINGERPRINT)).isNull();

      // Retention expires the newest evidence: the next eligible revision is chosen, using its
      // newest PASSED FULL run — not the newer FAILED or unmarked PASSED rows.
      s.executeUpdate(
          "DELETE FROM ui_test_executions WHERE id IN ('" + tieAPass + "','" + tieBPass + "')");
      assertThat(baseline(c, TEST_ID, CSI, FINGERPRINT))
          .containsExactly(oldPassing.toString(), newestFull.toString());
      s.executeUpdate(
          "DELETE FROM ui_test_executions WHERE id IN ('" + newestFull + "','" + olderFull + "')");
      // Absent evidence is ineligible: the planner must select FULL.
      assertThat(baseline(c, TEST_ID, CSI, FINGERPRINT)).isNull();
      // The recorded baselines and their requests outlive the evidence (no retention-blocking FK).
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM ui_test_revisions WHERE id IN ('"
                      + tieA
                      + "','"
                      + tieB
                      + "','"
                      + oldPassing
                      + "')"))
          .isEqualTo("3");
      c.rollback();
    }
  }

  @Test
  void baselineQueryAvoidsExecutionSequentialScansAtLocalHistoryVolume() throws Exception {
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      UUID[] tests = new UUID[40];
      for (int i = 0; i < tests.length; i++) {
        tests[i] = UUID.randomUUID();
        s.executeUpdate(draft(tests[i], CSI));
      }
      // 40 tests x 50 confirmed request-linked revisions, then 40 executions per revision
      // (80,000 rows): mostly unmarked history, one PASSED FULL run in ten.
      StringBuilder ids = new StringBuilder("ARRAY[");
      for (int i = 0; i < tests.length; i++) {
        ids.append(i == 0 ? "" : ",").append('\'').append(tests[i]).append("'::uuid");
      }
      ids.append(']');
      s.execute(
          "INSERT INTO ui_test_compile_requests(request_id,test_id,csi_id,source_revision,"
              + "configuration_revision,source,source_hash,authoring_snapshot,authoring_hash,"
              + "scope_reviewed_by,scope_reviewed_at,configuration,\"references\","
              + "compilation_fingerprint,compilation_plan,created_by,deadline_at)"
              + " SELECT gen_random_uuid(),t,'"
              + CSI
              + "',n,1,'"
              + SOURCE
              + "','"
              + HASH
              + "','"
              + SCOPED
              + "','"
              + HASH
              + "','inference@citi.com',NOW(),'"
              + CONFIGURATION
              + "','{}','"
              + FINGERPRINT
              + "','{\"selectedMode\":\"FULL\"}','inference@citi.com',NOW()+INTERVAL '4 minutes'"
              + " FROM unnest("
              + ids
              + ") t, generate_series(1,50) n");
      s.execute(
          candidateSelect("gen_random_uuid()", "md5(r.request_id::text)||md5(r.test_id::text)")
              + " FROM ui_test_compile_requests r");
      s.execute(
          "UPDATE ui_test_revisions SET confirmed_by='inference@citi.com',"
              + "confirmed_at=created_at WHERE compile_request_id IS NOT NULL");
      s.execute(
          "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,ended_at,revision_id,"
              + "csi_id,configuration_snapshot,runtime_versions,execution_scope)"
              + " SELECT gen_random_uuid(),r.test_id,'PASSED',NOW()-(k||' hours')::interval,"
              + "NOW()-(k||' hours')::interval,r.id,r.csi_id,"
              + "jsonb_build_object('sourceRevision',r.source_revision,'configurationRevision',1,"
              + "'artifactHash',r.artifact_hash,'browser','chromium','viewportWidth',1280,"
              + "'viewportHeight',720,'timeoutSeconds',30,'waitStrategy','load',"
              + "'environment','Production'),'"
              + RUNTIME
              + "',CASE WHEN k % 10 = 0 THEN 'FULL' END"
              + " FROM ui_test_revisions r, generate_series(1,40) k"
              + " WHERE r.compile_request_id IS NOT NULL");
      s.execute("ANALYZE ui_test_revisions");
      s.execute("ANALYZE ui_test_executions");
      String plan;
      try (PreparedStatement p =
          c.prepareStatement("EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) " + BASELINE_QUERY)) {
        bindBaseline(p, tests[17], CSI, FINGERPRINT);
        StringBuilder out = new StringBuilder();
        try (ResultSet r = p.executeQuery()) {
          while (r.next()) {
            out.append(r.getString(1)).append('\n');
          }
        }
        plan = out.toString();
      }
      System.out.println("[AC-5 local-volume baseline plan]\n" + plan);
      assertThat(scalar(c, "SELECT count(*) FROM ui_test_executions")).isEqualTo("80001");
      // All rows land in the DEFAULT partition (the V7 month partitions are empty and cost 0).
      assertThat(plan).contains("Index Scan using ui_test_executions_default_revision_id_");
      assertThat(plan).doesNotContain("Seq Scan on ui_test_executions_default");
      assertThat(plan).contains("Index Scan using idx_ui_test_revisions_eligible");
      assertThat(baseline(c, tests[17], CSI, FINGERPRINT)).isNotNull();
      c.rollback();
    }
  }

  @Test
  void mixedWriterCutoverOnHeadSchema() throws Exception {
    String cutover =
        Files.readString(Path.of("db/cutover/V19__studio_inference_candidate_identity.sql"));
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      // Pre-cutover: the HEAD legacy writer content-deduplicates; capability is absent.
      assertThat(scalar(c, CAPABILITY_PROBE)).isEqualTo("f");
      String legacyBytes = "d".repeat(64);
      assertThat(rows(c, LEGACY_WRITER.formatted(TEST_ID, 2, legacyBytes))).hasSize(1);
      assertThat(rows(c, LEGACY_WRITER.formatted(TEST_ID, 2, legacyBytes))).isEmpty();
      // A pre-V22 binary's conflict target no longer exists: such binaries are below the floor.
      reject(
          c,
          LEGACY_WRITER
              .formatted(TEST_ID, 2, legacyBytes)
              .replace(
                  "ON CONFLICT DO NOTHING",
                  "ON CONFLICT(test_id,source_revision,configuration_revision,artifact_hash)"
                      + " DO NOTHING"),
          "no unique or exclusion constraint");
      // The new publisher cannot be enabled early: two explicit requests with equal bytes
      // collide on the still-present content identity.
      UUID first = insertRequest(c, TEST_ID, CSI, 3, null, FINGERPRINT);
      UUID second = insertRequest(c, TEST_ID, CSI, 3, null, FINGERPRINT);
      UUID firstRevision = UUID.randomUUID();
      s.executeUpdate(candidate(firstRevision, first, HASH, PROVENANCE, null));
      reject(
          c,
          candidate(UUID.randomUUID(), second, HASH, PROVENANCE, null)
              + " ON CONFLICT(compile_request_id) DO NOTHING",
          "uq_ui_test_revisions_identity");

      // Cutover needs the same-session drain attestation, then flips the capability probe.
      reject(c, cutover, "compatible-writer drain barrier");
      s.execute("SET LOCAL checks.inference_publishers_drained='true'");
      s.execute(cutover);
      assertThat(scalar(c, CAPABILITY_PROBE)).isEqualTo("t");
      assertThat(scalar(c, "SELECT to_regclass('uq_ui_test_revisions_identity') IS NULL"))
          .isEqualTo("t");

      // Post-cutover: the legacy path fails loudly instead of silently deduplicating.
      reject(
          c,
          LEGACY_WRITER.formatted(TEST_ID, 4, "e".repeat(64)),
          "requires immutable compile request");
      UUID secondRevision = UUID.randomUUID();
      s.executeUpdate(candidate(secondRevision, second, HASH, PROVENANCE, null));
      assertThat(
              s.executeUpdate(
                  candidate(UUID.randomUUID(), first, HASH, PROVENANCE, null)
                      + " ON CONFLICT(compile_request_id) DO NOTHING"))
          .isZero();
      s.executeUpdate(
          "UPDATE ui_test_revisions SET confirmed_by='first',confirmed_at=NOW() WHERE id='"
              + firstRevision
              + "'");
      assertThat(
              rows(
                  c,
                  "SELECT id||':'||coalesce(confirmed_by,'-') FROM ui_test_revisions"
                      + " WHERE source_revision=3 ORDER BY confirmed_by NULLS LAST"))
          .containsExactly(firstRevision + ":first", secondRevision + ":-");
      // History written before cutover is untouched, including the pre-V18 legacy revision.
      assertThat(
              scalar(c, "SELECT count(*) FROM ui_test_revisions WHERE compile_request_id IS NULL"))
          .isEqualTo("2");
      c.rollback();
    }
  }

  @Test
  void capturedPublisherAcceptsContextAwareDraftAfterCutover() throws Exception {
    String cutover =
        Files.readString(Path.of("db/cutover/V19__studio_inference_candidate_identity.sql"));
    try (Connection c = transaction();
        Statement s = c.createStatement()) {
      s.execute("SET LOCAL checks.inference_publishers_drained='true'");
      s.execute(cutover);
      // A draft authored through the V21 context-aware path; V21's trigger copies it into every
      // revision inserted for this test, and V24 then requires a reference policy.
      s.executeUpdate(
          "UPDATE ui_tests SET authoring='{\"authoringSchemaVersion\":\"2\",\"steps\":[]}'"
              + " WHERE id='"
              + TEST_ID
              + "'");
      UUID request = insertRequest(c, TEST_ID, CSI, 2, null, FINGERPRINT);
      // Column list of CompileStateService.insertCapturedRevision at HEAD (no reference_policy).
      boolean published =
          !rejected(c, candidate(UUID.randomUUID(), request, HASH, PROVENANCE, null), "");
      assertThat(published)
          .as("captured insert for a V21 authoring draft after V19 (HEAD writer column list)")
          .isTrue();
      c.rollback();
    }
  }

  // ---------------------------------------------------------------------------------------------

  private static void seedOwners(Statement s) throws SQLException {
    s.executeUpdate(
        "INSERT INTO users(id,sso_id,name,email,is_active) VALUES"
            + "(gen_random_uuid(),'inference-author','Inference','inference@citi.com',true)");
    for (String csi : List.of(CSI, OTHER_CSI)) {
      s.executeUpdate(
          "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment,"
              + "status) VALUES('"
              + csi
              + "','Inference','Ops','HIGH','inference@citi.com','Production','OPERATIONAL')");
    }
  }

  private static UUID published(
      Connection c,
      UUID test,
      String csi,
      int sourceRevision,
      String age,
      boolean confirmed,
      String fingerprint,
      String provenance)
      throws SQLException {
    UUID request = insertRequest(c, test, csi, sourceRevision, null, fingerprint);
    UUID revision = UUID.randomUUID();
    try (Statement s = c.createStatement()) {
      s.executeUpdate(candidate(revision, request, HASH, provenance, age));
      if (confirmed) {
        s.executeUpdate(
            "UPDATE ui_test_revisions SET confirmed_by='inference@citi.com',confirmed_at=NOW()"
                + " WHERE id='"
                + revision
                + "'");
      }
    }
    return revision;
  }

  private static UUID pass(
      Connection c,
      UUID test,
      String csi,
      UUID revision,
      int sourceRevision,
      String age,
      String scope,
      String status)
      throws SQLException {
    UUID id = UUID.randomUUID();
    try (Statement s = c.createStatement()) {
      s.executeUpdate(
          execution(id, test, csi, revision, sourceRevision, HASH, scope)
              .replace("'PASSED'", "'" + status + "'")
              .replace("NOW(),NOW()", "NOW()+INTERVAL '" + age + "',NOW()+INTERVAL '" + age + "'"));
    }
    return id;
  }

  private static String execution(
      UUID id,
      UUID test,
      String csi,
      UUID revision,
      int sourceRevision,
      String hash,
      String scope) {
    return "INSERT INTO ui_test_executions(id,ui_test_id,status,started_at,ended_at,revision_id,"
        + "csi_id,configuration_snapshot,runtime_versions"
        + (scope == null ? "" : ",execution_scope")
        + ") VALUES('"
        + id
        + "','"
        + test
        + "','PASSED',NOW(),NOW(),'"
        + revision
        + "','"
        + csi
        + "','{\"sourceRevision\":"
        + sourceRevision
        + ",\"configurationRevision\":1,\"artifactHash\":\""
        + hash
        + "\",\"browser\":\"chromium\",\"viewportWidth\":1280,\"viewportHeight\":720,"
        + "\"timeoutSeconds\":30,\"waitStrategy\":\"load\",\"environment\":\"Production\"}','"
        + RUNTIME
        + "'"
        + (scope == null ? "" : ",'" + scope + "'")
        + ")";
  }

  private static List<String> baseline(Connection c, UUID test, String csi, String fingerprint)
      throws SQLException {
    try (PreparedStatement p = c.prepareStatement(BASELINE_QUERY)) {
      bindBaseline(p, test, csi, fingerprint);
      try (ResultSet r = p.executeQuery()) {
        return r.next() ? List.of(r.getString(1), String.valueOf(r.getString(2))) : null;
      }
    }
  }

  private static void bindBaseline(PreparedStatement p, UUID test, String csi, String fingerprint)
      throws SQLException {
    p.setObject(1, test);
    p.setString(2, csi);
    p.setString(3, fingerprint);
    p.setString(4, "{}");
    // A current snapshot no baseline carries, so only execution-backed rows qualify.
    p.setString(5, "{\"current\":true}");
    p.setLong(6, 999);
    p.setLong(7, 1);
  }

  private static Flyway flyway(String jdbcUrl, String target) {
    var config =
        Flyway.configure()
            .dataSource(jdbcUrl, POSTGRES.getUsername(), POSTGRES.getPassword())
            .locations("classpath:db/migration");
    if (target != null) {
      config.target(target);
    }
    return config.load();
  }

  private static void migrate(String jdbcUrl, String target) {
    flyway(jdbcUrl, target).migrate();
  }

  private static String freshUrl() {
    return POSTGRES.getJdbcUrl().replace("inference_latest", FRESH_DB);
  }

  private static Connection connect() throws SQLException {
    return connect(POSTGRES.getJdbcUrl());
  }

  private static Connection connect(String url) throws SQLException {
    return DriverManager.getConnection(url, POSTGRES.getUsername(), POSTGRES.getPassword());
  }

  private static Connection transaction() throws SQLException {
    Connection c = connect();
    c.setAutoCommit(false);
    return c;
  }

  private static void reject(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      assertThatThrownBy(() -> s.execute(sql))
          .isInstanceOf(SQLException.class)
          .hasMessageContaining(message);
    } finally {
      c.rollback(savepoint);
    }
  }

  /** True when the statement fails with the message; false when it succeeds (then undone). */
  private static boolean rejected(Connection c, String sql, String message) throws SQLException {
    var savepoint = c.setSavepoint();
    try (Statement s = c.createStatement()) {
      s.execute(sql);
      return false;
    } catch (SQLException e) {
      System.out.println("[AC-5 rejected] " + e.getMessage().lines().findFirst().orElse(""));
      assertThat(e.getMessage()).contains(message);
      return true;
    } finally {
      c.rollback(savepoint);
    }
  }

  private static String scalar(Connection c, String sql) throws SQLException {
    try (Statement s = c.createStatement();
        ResultSet r = s.executeQuery(sql)) {
      r.next();
      return r.getString(1);
    }
  }

  private static List<String> rows(Connection c, String sql) throws SQLException {
    List<String> out = new ArrayList<>();
    try (Statement s = c.createStatement();
        ResultSet r = s.executeQuery(sql)) {
      while (r.next()) {
        out.add(r.getString(1));
      }
    }
    return out;
  }

  private static String draft(UUID id, String csi) {
    return "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,created_by) VALUES('"
        + id
        + "','Inference','"
        + csi
        + "','Production','chromium','"
        + SOURCE
        + "','inference@citi.com')";
  }

  private static UUID insertRequest(
      Connection c, UUID test, String csi, int sourceRevision, UUID baseline, String fingerprint)
      throws SQLException {
    UUID id = UUID.randomUUID();
    try (Statement s = c.createStatement()) {
      s.executeUpdate(
          "INSERT INTO ui_test_compile_requests(request_id,test_id,csi_id,source_revision,"
              + "configuration_revision,source,source_hash,authoring_snapshot,authoring_hash,"
              + "scope_reviewed_by,scope_reviewed_at,configuration,\"references\","
              + "compilation_fingerprint,compilation_plan,baseline_revision_id,created_by,"
              + "deadline_at) VALUES('"
              + id
              + "','"
              + test
              + "','"
              + csi
              + "',"
              + sourceRevision
              + ",1,'"
              + SOURCE
              + "','"
              + HASH
              + "','"
              + SCOPED
              + "','"
              + HASH
              + "','inference@citi.com',NOW(),'"
              + CONFIGURATION
              + "','{}','"
              + fingerprint
              + "','{\"selectedMode\":\"FULL\"}',"
              + (baseline == null ? "NULL" : "'" + baseline + "'")
              + ",'inference@citi.com',NOW()+INTERVAL '4 minutes')");
    }
    return id;
  }

  /** Same column list and request projection as {@code insertCapturedRevision} at HEAD. */
  private static String candidateSelect(String idExpr, String artifactHashExpr) {
    return "INSERT INTO ui_test_revisions(id,test_id,csi_id,source_revision,"
        + "configuration_revision,source,source_hash,artifact,artifact_hash,"
        + "artifact_schema_version,configuration,\"references\",provenance,created_by,"
        + "compile_request_id,authoring_snapshot,authoring_hash,scope_reviewed_by,"
        + "scope_reviewed_at,compilation_fingerprint,baseline_revision_id) SELECT "
        + idExpr
        + ",r.test_id,r.csi_id,r.source_revision,r.configuration_revision,r.source,"
        + "r.source_hash,'{\"version\":1,\"steps\":[]}',"
        + artifactHashExpr
        + ",1,r.configuration,r.\"references\",'"
        + PROVENANCE
        + "',r.created_by,r.request_id,r.authoring_snapshot,r.authoring_hash,"
        + "r.scope_reviewed_by,r.scope_reviewed_at,r.compilation_fingerprint,"
        + "r.baseline_revision_id";
  }

  private static String candidate(
      UUID id, UUID request, String artifactHash, String provenance, String age) {
    String sql =
        candidateSelect("'" + id + "'", "'" + artifactHash + "'")
                .replace("'" + PROVENANCE + "'", "'" + provenance + "'")
            + " FROM ui_test_compile_requests r WHERE r.request_id='"
            + request
            + "'";
    if (age == null) {
      return sql;
    }
    return sql.replace("compile_request_id,", "compile_request_id,created_at,")
        .replace(",r.request_id,", ",r.request_id,NOW()+INTERVAL '" + age + "',");
  }
}
