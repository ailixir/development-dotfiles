package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
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
 * Story 10.49 (ADR-002 §35.5 items 1-3) — a V1 Run compile records its own compile request with the
 * server-stamped {@code trigger = RUN}, and only that request's own principal is auto-accepted,
 * with {@code confirmation_source = RUN} and the request's deadline rechecked.
 *
 * <p>Every case drives {@link CompileStateService} directly, through the same two calls the V1 Run
 * chain makes ({@code beginCompile} → {@code publishAcceptedCandidate}). Nothing here inserts a row
 * that {@code beginCompile} should have written, except where a test needs a trigger the V1 route
 * can never produce (AC-12), and then the seeded value is one the column's domain admits.
 */
@SpringBootTest
@ActiveProfiles("local")
class RunConfirmationTest {

  private static final String OWNER = "run-confirm-owner@citi.com";
  private static final String OTHER = "run-confirm-other@citi.com";
  private static final String CSI_ID = "60449";
  private static final List<String> SOURCE = List.of("Go to the home page");
  private static final String FINGERPRINT = "a".repeat(64);
  private static final Duration BUDGET = Duration.ofMinutes(4);

  @Autowired private CompileStateService states;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private PlatformTransactionManager transactionManager;

  private UUID testId;

  @BeforeEach
  void setUp() {
    seedUser(OWNER);
    seedUser(OTHER);
    seedCsi();
    testId = seedTest();
  }

  // ── AC-5: one request row per V1 compile, same transaction, trigger = RUN ───────────────────

  @Test
  void aRunCompileStoresItsCompileRequestWithTheServerStampedRunTrigger() {
    CompileRequest request = states.beginCompile(testId, inputs(OWNER), FINGERPRINT, BUDGET);

    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT \"trigger\", created_by, compilation_fingerprint, source_revision,"
                + " configuration_revision, compilation_plan->>'selectedMode' AS mode,"
                + " baseline_revision_id, deadline_at > created_at AS bounded"
                + " FROM ui_test_compile_requests WHERE request_id = ? AND test_id = ?",
            request.requestId(),
            testId);
    assertThat(rows).as("beginCompile must store the V1 compile request").hasSize(1);
    Map<String, Object> row = rows.get(0);
    assertThat(row.get("trigger")).isEqualTo("RUN");
    assertThat(row.get("created_by")).isEqualTo(OWNER);
    assertThat(row.get("compilation_fingerprint")).isEqualTo(FINGERPRINT);
    assertThat(((Number) row.get("source_revision")).longValue())
        .isEqualTo(request.sourceRevision());
    assertThat(((Number) row.get("configuration_revision")).longValue())
        .isEqualTo(request.configurationRevision());
    assertThat(row.get("mode")).isEqualTo("FULL");
    assertThat(row.get("baseline_revision_id")).isNull();
    assertThat(row.get("bounded")).isEqualTo(Boolean.TRUE);
    assertThat(
            jdbc.queryForObject(
                "SELECT compile_request_id FROM ui_tests WHERE id = ?", UUID.class, testId))
        .as("the publication lock reads the request through ui_tests.compile_request_id")
        .isEqualTo(request.requestId());
  }

  @Test
  void theRequestRowAndTheDraftTransitionCommitOrRollBackTogether() {
    TransactionTemplate transaction = new TransactionTemplate(transactionManager);
    UUID requestId =
        transaction.execute(
            status -> {
              CompileRequest request =
                  states.beginCompile(testId, inputs(OWNER), FINGERPRINT, BUDGET);
              assertThat(requestCount(request.requestId()))
                  .as("written inside the caller's transaction")
                  .isEqualTo(1);
              status.setRollbackOnly();
              return request.requestId();
            });

    assertThat(requestCount(requestId)).isZero();
    assertThat(compileStatus()).as("the ui_tests write rolled back with it").isEqualTo("STALE");
  }

  // ── AC-8 / AC-10: RUN + requester → READY, confirmation_source = RUN ────────────────────────

  @Test
  void aRunCompileIsAcceptedForItsRequesterAndRecordedAsARunConfirmation() {
    CompileRequest request = states.beginCompile(testId, inputs(OWNER), FINGERPRINT, BUDGET);

    PublishResult result = states.publishAcceptedCandidate(testId, request, candidate(OWNER));

    assertThat(result).isEqualTo(PublishResult.PUBLISHED);
    assertThat(compileStatus()).isEqualTo("READY");
    Map<String, Object> revision = confirmedRevision();
    assertThat(revision.get("confirmed_by")).isEqualTo(OWNER);
    assertThat(revision.get("confirmed_at")).isNotNull();
    assertThat(revision.get("confirmation_source")).isEqualTo("RUN");
  }

  // ── AC-11: the accepted path refuses a request past its deadline ────────────────────────────

  @Test
  void aRunCompilePastItsRequestDeadlineIsRefusedAndNeverReachesReady() throws Exception {
    CompileRequest request =
        states.beginCompile(testId, inputs(OWNER), FINGERPRINT, Duration.ofMillis(300));
    Thread.sleep(700);

    PublishResult result = null;
    try {
      result = states.publishAcceptedCandidate(testId, request, candidate(OWNER));
    } catch (java.util.concurrent.CancellationException refusedAtTheFinalCas) {
      // Also a refusal: the final CAS rolled the whole publication back.
    }

    assertThat(compileStatus()).isEqualTo("COMPILING");
    assertThat(result).isNotEqualTo(PublishResult.PUBLISHED);
    assertThat(revisionCount()).as("no revision is published past the deadline").isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId))
        .isNull();
    assertThat(requestCount(request.requestId()))
        .as("the refusal came from a real request row's deadline, not a vacuous NOT EXISTS")
        .isEqualTo(1);
  }

  // ── AC-12: a non-RUN trigger is never auto-accepted ─────────────────────────────────────────

  @Test
  void aCompileWhoseRequestTriggerIsNotRunPublishesAwaitingConfirmation() {
    CompileRequest request = states.beginCompile(testId);
    seedRequest(request, "COMPILE_CHANGES", OWNER);

    PublishResult result = states.publishAcceptedCandidate(testId, request, candidate(OWNER));

    assertThat(result).isEqualTo(PublishResult.PUBLISHED);
    assertThat(compileStatus()).isEqualTo("AWAITING_CONFIRMATION");
    assertUnconfirmedCandidate();
  }

  // ── AC-13: a confirmer other than the requester is never auto-accepted ──────────────────────

  @Test
  void aCandidateWhoseConfirmerIsNotTheRequesterPublishesAwaitingConfirmation() {
    CompileRequest request = states.beginCompile(testId, inputs(OWNER), FINGERPRINT, BUDGET);

    PublishResult result = states.publishAcceptedCandidate(testId, request, candidate(OTHER));

    assertThat(result).isEqualTo(PublishResult.PUBLISHED);
    assertThat(compileStatus()).isEqualTo("AWAITING_CONFIRMATION");
    assertUnconfirmedCandidate();
  }

  // ── AC-10: the manual confirmation writes MANUAL ─────────────────────────────────────────────

  @Test
  void theManualConfirmationIsRecordedAsManual() {
    CompileRequest request = states.beginCompile(testId, inputs(OWNER), FINGERPRINT, BUDGET);
    states.publishAcceptedCandidate(testId, request, candidate(OTHER));
    Map<String, Object> candidate = currentCandidate();

    states.confirm(
        testId,
        (UUID) candidate.get("id"),
        (String) candidate.get("artifact_hash"),
        request.sourceRevision(),
        request.configurationRevision(),
        OWNER);

    assertThat(compileStatus()).isEqualTo("READY");
    Map<String, Object> revision = confirmedRevision();
    assertThat(revision.get("confirmed_by")).isEqualTo(OWNER);
    assertThat(revision.get("confirmation_source")).isEqualTo("MANUAL");
  }

  // ── AC-7: measurement of recordOutcome's revisionId lookup before V19 ───────────────────────

  /**
   * Before V19 the accepted revision is written through the legacy content-identity writer, so it
   * carries no {@code compile_request_id} and the outcome's lookup by request id stays null. The
   * linkage is the capability-gated branch (see {@code RunCompileAfterV19Test}); this pins the
   * measured pre-V19 value so a change to it is a deliberate one.
   */
  @Test
  void beforeV19TheOutcomeOfARunCompileCannotNameItsRevision() {
    CompileRequest request = states.beginCompile(testId, inputs(OWNER), FINGERPRINT, BUDGET);
    states.publishAcceptedCandidate(testId, request, candidate(OWNER));

    states.recordOutcome(request.requestId(), "PUBLISHED", null, null, null);

    String revisionId =
        jdbc.queryForObject(
            "SELECT outcome->>'revisionId' FROM ui_test_compile_outcomes WHERE request_id = ?",
            String.class,
            request.requestId());
    System.out.println("[10.49 AC-7] pre-V19 outcome revisionId=" + revisionId);
    assertThat(revisionId).isNull();
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────────

  private CompileInputs inputs(String principal) {
    return new CompileInputs(
        testId, CSI_ID, principal, SOURCE, List.of(), List.of(), configurationJson());
  }

  private String configurationJson() {
    return "{\"browser\":\"chromium\",\"viewport\":{\"width\":1280,\"height\":720},"
        + "\"timeoutSeconds\":30,\"waitStrategy\":\"load\",\"environment\":\"Production\"}";
  }

  private CandidateRevision candidate(String createdBy) {
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
        configurationJson(),
        inputs(createdBy).referencesJson(),
        "{\"model\":\"stub-model@1\"}",
        createdBy);
  }

  private void seedRequest(CompileRequest request, String trigger, String createdBy) {
    jdbc.update(
        "INSERT INTO ui_test_compile_requests (request_id, test_id, csi_id, source_revision,"
            + " configuration_revision, source, source_hash, configuration, \"references\","
            + " compilation_fingerprint, compilation_plan, created_by, deadline_at, \"trigger\")"
            + " VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), ?, CAST(? AS jsonb),"
            + " CAST('{\"variables\":[],\"secrets\":[]}' AS jsonb), ?,"
            + " CAST('{\"selectedMode\":\"FULL\"}' AS jsonb), ?, NOW() + INTERVAL '4 minutes', ?)",
        request.requestId(),
        testId,
        CSI_ID,
        request.sourceRevision(),
        request.configurationRevision(),
        ArtifactCanonicalizer.canonicalSource(SOURCE),
        ArtifactCanonicalizer.hash(ArtifactCanonicalizer.canonicalSource(SOURCE)),
        configurationJson(),
        FINGERPRINT,
        createdBy,
        trigger);
  }

  private void assertUnconfirmedCandidate() {
    Map<String, Object> candidate = currentCandidate();
    assertThat(candidate.get("confirmed_by")).isNull();
    assertThat(candidate.get("confirmed_at")).isNull();
    assertThat(candidate.get("confirmation_source")).isNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId))
        .isNull();
  }

  private Map<String, Object> currentCandidate() {
    return jdbc.queryForMap(
        "SELECT r.id, r.artifact_hash, r.confirmed_by, r.confirmed_at, r.confirmation_source"
            + " FROM ui_tests t JOIN ui_test_revisions r ON r.id = t.current_candidate_revision_id"
            + " WHERE t.id = ?",
        testId);
  }

  private Map<String, Object> confirmedRevision() {
    return jdbc.queryForMap(
        "SELECT r.confirmed_by, r.confirmed_at, r.confirmation_source"
            + " FROM ui_tests t JOIN ui_test_revisions r ON r.id = t.confirmed_revision_id"
            + " WHERE t.id = ?",
        testId);
  }

  private int requestCount(UUID requestId) {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_compile_requests WHERE request_id = ?",
        Integer.class,
        requestId);
  }

  private int revisionCount() {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId);
  }

  private String compileStatus() {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private UUID seedTest() {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Run confirmation draft', ?,"
            + " 'Production', 'chromium', CAST('[\"Go to the home page\"]' AS jsonb),"
            + " CAST('[]' AS jsonb), ?, ?, ?)",
        id,
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Run Confirm', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Run Confirm CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
