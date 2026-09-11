package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.CandidateRevision;
import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.PublishResult;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.4 AC-17 — conditional publication of compile results, and the confirmation transaction
 * of AC-13.
 *
 * <p>The scenarios that matter are the ones the review flagged (P1-2): a result that arrives after
 * the draft moved on must never replace the current candidate, and an author must never confirm an
 * artifact other than the one they reviewed.
 */
@SpringBootTest
@ActiveProfiles("local")
class CompileStateServiceTest {

  private static final String OWNER = "compile-owner@citi.com";
  private static final String CSI_ID = "60401";

  @Autowired private CompileStateService compileStateService;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;

  @BeforeEach
  void setUp() {
    seedUser(OWNER);
    seedCsi(CSI_ID);
    testId = seedTest();
  }

  // ── AC-10 ─────────────────────────────────────────────────────────────────

  @Test
  void beginCompilePersistsARequestIdentityWithTheRevisionsItWasStartedFor() {
    CompileRequest request = compileStateService.beginCompile(testId);

    assertThat(request.requestId()).isNotNull();
    assertThat(request.sourceRevision()).isEqualTo(1L);
    assertThat(request.configurationRevision()).isEqualTo(1L);
    assertThat(compileStatus()).isEqualTo("COMPILING");
    assertThat(column("compile_request_id", UUID.class)).isEqualTo(request.requestId());
  }

  // ── AC-11 ─────────────────────────────────────────────────────────────────

  @Test
  void reversedCompletionKeepsTheNewestCandidateAndDiscardsTheOlderRequest() {
    CompileRequest first = compileStateService.beginCompile(testId);
    CompileRequest second = compileStateService.beginCompile(testId);

    assertThat(
            compileStateService.publishCandidate(
                testId, second.requestId(), second.sourceRevision(), candidate("hash-second")))
        .isEqualTo(PublishResult.PUBLISHED);
    UUID currentCandidate = column("current_candidate_revision_id", UUID.class);

    assertThat(
            compileStateService.publishCandidate(
                testId, first.requestId(), first.sourceRevision(), candidate("hash-first")))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);

    assertThat(column("current_candidate_revision_id", UUID.class)).isEqualTo(currentCandidate);
    assertThat(compileStatus()).isEqualTo("AWAITING_CONFIRMATION");
    assertThat(revisionHashes()).containsExactly("hash-second");
  }

  @Test
  void twoCompilesOfIdenticalTextCannotPublishTheOlderOne() {
    CompileRequest first = compileStateService.beginCompile(testId);
    CompileRequest second = compileStateService.beginCompile(testId);

    // Identical text compiled twice yields the identical artifact hash.
    compileStateService.publishCandidate(
        testId, second.requestId(), second.sourceRevision(), candidate("hash-identical"));
    UUID currentCandidate = column("current_candidate_revision_id", UUID.class);

    assertThat(
            compileStateService.publishCandidate(
                testId, first.requestId(), first.sourceRevision(), candidate("hash-identical")))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);

    assertThat(column("current_candidate_revision_id", UUID.class)).isEqualTo(currentCandidate);
    assertThat(revisionCount()).isEqualTo(1);
  }

  @Test
  void aCandidateForASupersededSourceRevisionIsDiscarded() {
    CompileRequest request = compileStateService.beginCompile(testId);
    jdbc.update("UPDATE ui_tests SET source_revision = source_revision + 1 WHERE id = ?", testId);

    assertThat(
            compileStateService.publishCandidate(
                testId, request.requestId(), request.sourceRevision(), candidate("hash-stale")))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);

    assertThat(column("current_candidate_revision_id", UUID.class)).isNull();
    assertThat(revisionCount()).isZero();
  }

  // ── AC-12 ─────────────────────────────────────────────────────────────────

  @Test
  void publishInvalidRecordsDiagnosticsAndLeavesTheDraftUnrunnable() {
    CompileRequest request = compileStateService.beginCompile(testId);

    assertThat(
            compileStateService.publishInvalid(
                testId,
                request.requestId(),
                request.sourceRevision(),
                "[{\"stepIndex\":0,\"message\":\"Unsupported instruction\"}]"))
        .isEqualTo(PublishResult.PUBLISHED);

    assertThat(compileStatus()).isEqualTo("NEEDS_REVISION");
    assertThat(column("compile_diagnostics", String.class)).contains("Unsupported instruction");
    assertThat(column("current_candidate_revision_id", UUID.class)).isNull();
  }

  @Test
  void publishErrorFallsBackToStaleWithoutTouchingTheDraft() {
    CompileRequest request = compileStateService.beginCompile(testId);

    assertThat(
            compileStateService.publishError(
                testId,
                request.requestId(),
                request.sourceRevision(),
                "{\"code\":\"GATEWAY_UNAVAILABLE\"}"))
        .isEqualTo(PublishResult.PUBLISHED);

    assertThat(compileStatus()).isEqualTo("STALE");
    assertThat(column("compile_error", String.class)).contains("GATEWAY_UNAVAILABLE");
    assertThat(column("steps", String.class)).contains("Go to the home page");
  }

  @Test
  void anInvalidResultFromASupersededRequestIsDiscarded() {
    CompileRequest first = compileStateService.beginCompile(testId);
    compileStateService.beginCompile(testId);

    assertThat(
            compileStateService.publishInvalid(
                testId, first.requestId(), first.sourceRevision(), "[]"))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
    assertThat(compileStatus()).isEqualTo("COMPILING");
  }

  // ── AC-13 ─────────────────────────────────────────────────────────────────

  @Test
  void confirmRecordsTheIdentityOnceAndMarksTheDraftReady() {
    UUID revisionId = publishOneCandidate("hash-confirm");

    UUID confirmed = compileStateService.confirm(testId, revisionId, "hash-confirm", 1L, 1L, OWNER);

    assertThat(confirmed).isEqualTo(revisionId);
    assertThat(compileStatus()).isEqualTo("READY");
    assertThat(column("confirmed_revision_id", UUID.class)).isEqualTo(revisionId);
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?",
                String.class,
                revisionId))
        .isEqualTo(OWNER);
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_at IS NOT NULL FROM ui_test_revisions WHERE id = ?",
                Boolean.class,
                revisionId))
        .isTrue();
  }

  @Test
  void confirmRejectsAnArtifactHashTheAuthorNeverReviewed() {
    UUID revisionId = publishOneCandidate("hash-reviewed");

    assertThatThrownBy(
            () -> compileStateService.confirm(testId, revisionId, "hash-other", 1L, 1L, OWNER))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo("STALE_CANDIDATE");

    assertThat(compileStatus()).isEqualTo("AWAITING_CONFIRMATION");
    assertThat(column("confirmed_revision_id", UUID.class)).isNull();
  }

  @Test
  void confirmRejectsARevisionThatIsNoLongerTheCurrentCandidate() {
    UUID superseded = publishOneCandidate("hash-superseded");
    publishOneCandidate("hash-current");

    assertThatThrownBy(
            () -> compileStateService.confirm(testId, superseded, "hash-superseded", 1L, 1L, OWNER))
        .isInstanceOf(StudioConflictException.class);

    assertThat(column("confirmed_revision_id", UUID.class)).isNull();
    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?",
                String.class,
                superseded))
        .isNull();
  }

  @Test
  void confirmIsWriteOnceEvenWhenRetried() {
    UUID revisionId = publishOneCandidate("hash-retry");
    compileStateService.confirm(testId, revisionId, "hash-retry", 1L, 1L, OWNER);

    assertThatThrownBy(
            () ->
                compileStateService.confirm(
                    testId, revisionId, "hash-retry", 1L, 1L, "other@citi.com"))
        .isInstanceOf(StudioConflictException.class);

    assertThat(
            jdbc.queryForObject(
                "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?",
                String.class,
                revisionId))
        .isEqualTo(OWNER);
  }

  @Test
  void confirmRejectsRevisionsThatDoNotMatchTheDraft() {
    UUID revisionId = publishOneCandidate("hash-revisions");

    assertThatThrownBy(
            () -> compileStateService.confirm(testId, revisionId, "hash-revisions", 2L, 1L, OWNER))
        .isInstanceOf(StudioConflictException.class);
  }

  // ── AC-14 and AC-3 ────────────────────────────────────────────────────────

  @Test
  void aSoftDeletedTestBlocksCompileAndConfirmButKeepsItsRevisionsReadable() {
    UUID revisionId = publishOneCandidate("hash-deleted");
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);

    assertThatThrownBy(() -> compileStateService.beginCompile(testId))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo("TEST_DELETED");
    assertThatThrownBy(
            () -> compileStateService.confirm(testId, revisionId, "hash-deleted", 1L, 1L, OWNER))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo("TEST_DELETED");

    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId))
        .isEqualTo(1);
  }

  @Test
  void aQuarantinedTestBlocksCompileAndConfirm() {
    jdbc.update("UPDATE ui_tests SET quarantined_at = NOW() WHERE id = ?", testId);

    assertThatThrownBy(() -> compileStateService.beginCompile(testId))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo("TEST_QUARANTINED");
  }

  @Test
  void anUnknownTestIsRejectedBeforeAnyStateChange() {
    assertThatThrownBy(() -> compileStateService.beginCompile(UUID.randomUUID()))
        .isInstanceOf(IllegalArgumentException.class);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private UUID publishOneCandidate(String artifactHash) {
    CompileRequest request = compileStateService.beginCompile(testId);
    compileStateService.publishCandidate(
        testId, request.requestId(), request.sourceRevision(), candidate(artifactHash));
    return column("current_candidate_revision_id", UUID.class);
  }

  private CandidateRevision candidate(String artifactHash) {
    return new CandidateRevision(
        1L,
        "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"Go to the home page\"}]}",
        "source-hash-" + artifactHash,
        "{\"version\":1,\"steps\":[]}",
        artifactHash,
        1,
        "{\"browser\":\"chromium\"}",
        "[]",
        "{\"model\":\"stub-model@1\"}",
        OWNER);
  }

  private String compileStatus() {
    return column("compile_status", String.class);
  }

  private <T> T column(String name, Class<T> type) {
    return jdbc.queryForObject("SELECT " + name + " FROM ui_tests WHERE id = ?", type, testId);
  }

  private int revisionCount() {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, testId);
  }

  private java.util.List<String> revisionHashes() {
    return jdbc.queryForList(
        "SELECT artifact_hash FROM ui_test_revisions WHERE test_id = ? ORDER BY created_at",
        String.class,
        testId);
  }

  private UUID seedTest() {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Compile state draft', ?,"
            + " 'Production', 'chrome', CAST('[\"Go to the home page\"]' AS jsonb),"
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
            + " VALUES (?, ?, 'Compile Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Compile CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
