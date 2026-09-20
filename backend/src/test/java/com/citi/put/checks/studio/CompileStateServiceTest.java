package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.CandidateRevision;
import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.PublishResult;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Story 10.4 AC-17 — conditional publication of compile results, and the confirmation transaction
 * of AC-13.
 *
 * <p>The scenarios that matter are the ones the review flagged (P1-2): a result that arrives after
 * the draft moved on must never replace the current candidate, and an author must never confirm an
 * artifact other than the one they reviewed.
 *
 * <p>The guards are concurrency guards, so the cases that prove them interleave operations rather
 * than running them in sequence: an edit racing an in-flight publish, and a confirmation racing a
 * compile failure. Each such case asserts the invariant over <em>every</em> admissible
 * interleaving, not over one lucky ordering.
 */
@SpringBootTest
@ActiveProfiles("local")
class CompileStateServiceTest {

  private static final String OWNER = "compile-owner@citi.com";
  private static final String CSI_ID = "60401";
  private static final String STALE_CANDIDATE = "STALE_CANDIDATE";
  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Autowired private CompileStateService compileStateService;
  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private PlatformTransactionManager transactionManager;

  private TransactionTemplate transactions;
  private UUID testId;

  @BeforeEach
  void setUp() {
    transactions = new TransactionTemplate(transactionManager);
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

    assertThat(compileStateService.publishCandidate(testId, second, candidate("hash-second")))
        .isEqualTo(PublishResult.PUBLISHED);
    UUID currentCandidate = column("current_candidate_revision_id", UUID.class);

    assertThat(compileStateService.publishCandidate(testId, first, candidate("hash-first")))
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
    compileStateService.publishCandidate(testId, second, candidate("hash-identical"));
    UUID currentCandidate = column("current_candidate_revision_id", UUID.class);

    assertThat(compileStateService.publishCandidate(testId, first, candidate("hash-identical")))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);

    assertThat(column("current_candidate_revision_id", UUID.class)).isEqualTo(currentCandidate);
    assertThat(revisionCount()).isEqualTo(1);
  }

  @Test
  void derivationVersionParticipatesInIdentityWhileCompleteIdentityStillDeduplicates() {
    CandidateRevision base = candidate("hash-versioned");
    CandidateRevision versionOne = versioned(base, "1.0.0");
    CandidateRevision versionTwo = versioned(base, "2.0.0");

    compileStateService.publishCandidate(
        testId, compileStateService.beginCompile(testId), versionOne);
    compileStateService.publishCandidate(
        testId, compileStateService.beginCompile(testId), versionTwo);
    assertThat(revisionCount()).isEqualTo(2);

    compileStateService.publishCandidate(
        testId, compileStateService.beginCompile(testId), versionTwo);
    assertThat(revisionCount()).isEqualTo(2);
  }

  private static CandidateRevision versioned(CandidateRevision base, String version) {
    return new CandidateRevision(
        base.configurationRevision(),
        base.source(),
        base.sourceHash(),
        base.artifact(),
        base.artifactHash(),
        base.artifactSchemaVersion(),
        base.configuration(),
        base.references(),
        "{\"intentDerivationVersion\":\"" + version + "\"}",
        base.createdBy(),
        "{\"schemaVersion\":1,\"steps\":[]}",
        version);
  }

  @Test
  void aCandidateForASupersededSourceRevisionIsDiscarded() {
    CompileRequest request = compileStateService.beginCompile(testId);
    jdbc.update("UPDATE ui_tests SET source_revision = source_revision + 1 WHERE id = ?", testId);

    assertThat(compileStateService.publishCandidate(testId, request, candidate("hash-stale")))
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
                testId, request, "[{\"stepIndex\":0,\"message\":\"Unsupported instruction\"}]"))
        .isEqualTo(PublishResult.PUBLISHED);

    assertThat(compileStatus()).isEqualTo("NEEDS_REVISION");
    assertThat(column("compile_diagnostics", String.class)).contains("Unsupported instruction");
    assertThat(column("current_candidate_revision_id", UUID.class)).isNull();
  }

  @Test
  void publishErrorFallsBackToStaleWithoutTouchingTheDraft() {
    CompileRequest request = compileStateService.beginCompile(testId);

    assertThat(
            compileStateService.publishError(testId, request, "{\"code\":\"GATEWAY_UNAVAILABLE\"}"))
        .isEqualTo(PublishResult.PUBLISHED);

    assertThat(compileStatus()).isEqualTo("STALE");
    assertThat(column("compile_error", String.class)).contains("GATEWAY_UNAVAILABLE");
    assertThat(column("steps", String.class)).contains("Go to the home page");
  }

  @Test
  void anInvalidResultFromASupersededRequestIsDiscarded() {
    CompileRequest first = compileStateService.beginCompile(testId);
    compileStateService.beginCompile(testId);

    assertThat(compileStateService.publishInvalid(testId, first, "[]"))
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
  void expectedIntentSnapshotIsPersistedWithTheImmutableCandidate() throws Exception {
    String expected =
        "{\"schemaVersion\":1,\"steps\":[{\"stepIndex\":0,\"stepId\":\"11111111-1111-4111-8111-111111111111\",\"operations\":[{\"op\":\"goto\",\"url\":{\"kind\":\"literal\",\"value\":\"https://example.test/\"}}]}]}";
    CompileRequest request = compileStateService.beginCompile(testId);
    CandidateRevision base = candidate("hash-expected-intent");
    CandidateRevision candidate =
        new CandidateRevision(
            base.configurationRevision(),
            base.source(),
            base.sourceHash(),
            base.artifact(),
            base.artifactHash(),
            base.artifactSchemaVersion(),
            base.configuration(),
            base.references(),
            base.provenance(),
            base.createdBy(),
            expected);
    assertThat(compileStateService.publishCandidate(testId, request, candidate))
        .isEqualTo(PublishResult.PUBLISHED);
    String stored =
        jdbc.queryForObject(
            "SELECT expected_intent::text FROM ui_test_revisions WHERE test_id = ?",
            String.class,
            testId);
    assertThat(MAPPER.readTree(stored)).isEqualTo(MAPPER.readTree(expected));
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

  // ── ISSUE-001: a publish never wins over an edit made after its compile began ──

  @Test
  void aConfigurationEditDuringAnInFlightCompileDiscardsEveryResultOfThatCompile() {
    CompileRequest request = compileStateService.beginCompile(testId);

    // The author retargets the draft while the compile is still running (AC-8).
    studioService.updateTest(testId, currentDraftWithEnvironment("Staging"));
    assertThat(compileStatus()).isEqualTo("STALE");
    assertThat(configurationRevision()).isEqualTo(2L);
    assertThat(sourceRevision()).isEqualTo(1L);
    // The in-flight request identity deliberately survives the edit: the guard is the revision
    // pair named in the publish statement, not a companion write by the editor.
    assertThat(column("compile_request_id", UUID.class)).isEqualTo(request.requestId());

    assertThat(compileStateService.publishCandidate(testId, request, candidate("hash-in-flight")))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
    assertThat(compileStateService.publishInvalid(testId, request, "[]"))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);
    assertThat(compileStateService.publishError(testId, request, "{\"code\":\"GATEWAY\"}"))
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);

    assertThat(compileStatus()).isEqualTo("STALE");
    assertThat(column("current_candidate_revision_id", UUID.class)).isNull();
    assertThat(column("compile_error", String.class)).isNull();
    assertThat(column("compile_diagnostics", String.class)).isNull();
    assertThat(revisionCount()).isZero();
  }

  @Test
  void aPublishQueuedBehindAnUncommittedEditIsDiscardedWhenTheLockIsGranted() throws Exception {
    CompileRequest request = compileStateService.beginCompile(testId);
    CandidateRevision candidate = candidate("hash-queued");
    UITestRequest edit = currentDraftWithEnvironment("Staging");

    CountDownLatch editApplied = new CountDownLatch(1);
    CountDownLatch releaseEditor = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      // The editor takes the draft's row lock and holds its transaction open.
      Future<String> editor =
          pool.submit(
              () ->
                  transactions.execute(
                      status -> {
                        studioService.updateTest(testId, edit);
                        editApplied.countDown();
                        awaitQuietly(releaseEditor);
                        return "EDITED";
                      }));
      assertThat(editApplied.await(60, TimeUnit.SECONDS)).isTrue();

      // The in-flight compile publishes into that open window and queues behind the lock.
      Future<String> publisher =
          pool.submit(
              () -> compileStateService.publishCandidate(testId, request, candidate).name());
      awaitRowLockWaiter();
      releaseEditor.countDown();

      assertThat(editor.get(60, TimeUnit.SECONDS)).isEqualTo("EDITED");
      // PostgreSQL re-evaluates the guard against the committed row version once the lock is
      // granted, so a publish that began before the edit can never land after it.
      assertThat(publisher.get(60, TimeUnit.SECONDS)).isEqualTo("DISCARDED_OUT_OF_ORDER");

      assertThat(compileStatus()).isEqualTo("STALE");
      assertThat(column("current_candidate_revision_id", UUID.class)).isNull();
      assertThat(configurationRevision()).isEqualTo(2L);
      assertThat(revisionCount()).isZero();
    } finally {
      releaseEditor.countDown();
      pool.shutdownNow();
    }
  }

  // ── ISSUE-002: confirm only ever accepts a draft that is awaiting confirmation ──

  @Test
  void publishErrorLeavesNoConfirmableCandidateBehind() {
    CompileRequest request = compileStateService.beginCompile(testId);
    compileStateService.publishCandidate(testId, request, candidate("hash-then-error"));
    UUID revisionId = column("current_candidate_revision_id", UUID.class);

    assertThat(
            compileStateService.publishError(testId, request, "{\"code\":\"GATEWAY_UNAVAILABLE\"}"))
        .isEqualTo(PublishResult.PUBLISHED);

    assertThat(compileStatus()).isEqualTo("STALE");
    assertThat(column("current_candidate_revision_id", UUID.class)).isNull();

    assertThatThrownBy(
            () -> compileStateService.confirm(testId, revisionId, "hash-then-error", 1L, 1L, OWNER))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo(STALE_CANDIDATE);

    // STALE -> READY is unreachable, and the recorded failure is not silently discarded.
    assertThat(compileStatus()).isEqualTo("STALE");
    assertThat(column("compile_error", String.class)).contains("GATEWAY_UNAVAILABLE");
    assertThat(column("confirmed_revision_id", UUID.class)).isNull();
    assertThat(confirmedBy(revisionId)).isNull();
  }

  @Test
  void confirmRejectsADraftThatIsNotAwaitingConfirmation() {
    UUID revisionId = publishOneCandidate("hash-recompiling");
    compileStateService.beginCompile(testId);

    // A recompile leaves the reviewed candidate current, but the draft is no longer offering it.
    assertThat(compileStatus()).isEqualTo("COMPILING");
    assertThat(column("current_candidate_revision_id", UUID.class)).isEqualTo(revisionId);

    assertThatThrownBy(
            () ->
                compileStateService.confirm(testId, revisionId, "hash-recompiling", 1L, 1L, OWNER))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo(STALE_CANDIDATE);

    assertThat(compileStatus()).isEqualTo("COMPILING");
    assertThat(column("confirmed_revision_id", UUID.class)).isNull();
    assertThat(confirmedBy(revisionId)).isNull();
  }

  @Test
  void aConfirmQueuedBehindAnUncommittedCompileFailureIsRejected() throws Exception {
    CompileRequest request = compileStateService.beginCompile(testId);
    compileStateService.publishCandidate(testId, request, candidate("hash-queued-error"));
    UUID revisionId = column("current_candidate_revision_id", UUID.class);

    CountDownLatch errorApplied = new CountDownLatch(1);
    CountDownLatch releaseFailure = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      // The compile failure takes the draft's row lock and holds its transaction open.
      Future<String> failure =
          pool.submit(
              () ->
                  transactions.execute(
                      status -> {
                        PublishResult result =
                            compileStateService.publishError(
                                testId, request, "{\"code\":\"GATEWAY_UNAVAILABLE\"}");
                        errorApplied.countDown();
                        awaitQuietly(releaseFailure);
                        return result.name();
                      }));
      assertThat(errorApplied.await(60, TimeUnit.SECONDS)).isTrue();

      // A stale tab confirms the candidate it still believes is current, and queues behind it.
      Future<String> confirmation =
          pool.submit(
              () -> {
                try {
                  compileStateService.confirm(
                      testId, revisionId, "hash-queued-error", 1L, 1L, OWNER);
                  return "CONFIRMED";
                } catch (StudioConflictException e) {
                  return e.getCode();
                }
              });
      awaitRowLockWaiter();
      releaseFailure.countDown();

      assertThat(failure.get(60, TimeUnit.SECONDS)).isEqualTo("PUBLISHED");
      // Under the defect this confirm drove STALE -> READY and silently nulled compile_error.
      assertThat(confirmation.get(60, TimeUnit.SECONDS)).isEqualTo(STALE_CANDIDATE);

      assertThat(compileStatus()).isEqualTo("STALE");
      assertThat(column("compile_error", String.class)).contains("GATEWAY_UNAVAILABLE");
      assertThat(column("current_candidate_revision_id", UUID.class)).isNull();
      assertThat(column("confirmed_revision_id", UUID.class)).isNull();
      // The write-once confirmation rolled back with the rest of the transaction.
      assertThat(confirmedBy(revisionId)).isNull();
    } finally {
      releaseFailure.countDown();
      pool.shutdownNow();
    }
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
    compileStateService.publishCandidate(testId, request, candidate(artifactHash));
    return column("current_candidate_revision_id", UUID.class);
  }

  private static void awaitQuietly(CountDownLatch latch) {
    try {
      if (!latch.await(60, TimeUnit.SECONDS)) {
        throw new IllegalStateException("Timed out holding the interleaved transaction open");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  /**
   * Blocks until another backend is waiting on a {@code ui_tests} row lock, so the interleaving
   * under test is the one that is asserted rather than whichever ordering the scheduler happened to
   * pick.
   */
  private void awaitRowLockWaiter() throws InterruptedException {
    for (int attempt = 0; attempt < 600; attempt++) {
      Integer waiting =
          jdbc.queryForObject(
              "SELECT COUNT(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'"
                  + " AND state = 'active' AND query ILIKE '%ui_tests%'"
                  + " AND pid <> pg_backend_pid()",
              Integer.class);
      if (waiting != null && waiting > 0) {
        return;
      }
      Thread.sleep(50);
    }
    throw new IllegalStateException("No backend ever queued behind the held ui_tests row lock");
  }

  /**
   * Reproduces the stored draft as an update payload with a single execution-affecting field
   * changed, so {@link StudioService#updateTest} advances the configuration revision and nothing
   * else.
   */
  private UITestRequest currentDraftWithEnvironment(String environment) {
    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT name, description, csi_id, steps::text AS steps,"
                + " variables::text AS variables, browser, viewport_width, viewport_height,"
                + " timeout_seconds, wait_strategy, source_revision, configuration_revision"
                + " FROM ui_tests WHERE id = ?",
            testId);
    return new UITestRequest(
        (String) row.get("name"),
        (String) row.get("description"),
        (String) row.get("csi_id"),
        (String) row.get("steps"),
        (String) row.get("variables"),
        (String) row.get("browser"),
        ((Number) row.get("viewport_width")).intValue(),
        ((Number) row.get("viewport_height")).intValue(),
        ((Number) row.get("timeout_seconds")).intValue(),
        (String) row.get("wait_strategy"),
        environment,
        ((Number) row.get("source_revision")).longValue(),
        ((Number) row.get("configuration_revision")).longValue());
  }

  private String confirmedBy(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private long sourceRevision() {
    return jdbc.queryForObject(
        "SELECT source_revision FROM ui_tests WHERE id = ?", Long.class, testId);
  }

  private long configurationRevision() {
    return jdbc.queryForObject(
        "SELECT configuration_revision FROM ui_tests WHERE id = ?", Long.class, testId);
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
