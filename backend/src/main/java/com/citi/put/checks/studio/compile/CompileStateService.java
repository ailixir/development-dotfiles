package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compile-state machine for Studio drafts (Architecture §4.2).
 *
 * <p>Every transition is a conditional statement whose affected-row count is checked; the service
 * never reads a row and writes it back on the strength of what it read. A compile result is
 * published only while the persisted compile request identity <em>and both revisions it was started
 * for</em> are still current, so an out-of-order result — an older compile for identical text, or a
 * compile whose draft was edited while it was in flight — is discarded instead of replacing a newer
 * candidate or overwriting the {@code STALE} that the edit mandated (AC-8, AC-11, AC-12).
 *
 * <p>The revision pair is named inside each conditional statement rather than being enforced by a
 * companion write elsewhere (for example nulling {@code compile_request_id} on edit): PostgreSQL
 * re-evaluates a conditional {@code UPDATE}'s predicate against the committed row version once the
 * row lock is acquired, so no interleaving of editors and publishers can let a publish land on a
 * draft that moved after its compile began, and no future writer of the revision columns can
 * reintroduce the hole by forgetting to clear the request identity.
 *
 * <p>This class owns the transactions only. The HTTP endpoints, prompt assembly, validation, the
 * repair loop and the sweep's <em>schedule</em> live elsewhere; the sweep's <em>statement</em>
 * lives here, because story 10.8 AC-3 requires every compile-state write to go through this class
 * and a scheduler holding SQL would turn that scan red.
 */
@Service
public class CompileStateService {

  private static final Logger LOGGER = LoggerFactory.getLogger(CompileStateService.class);

  private static final String STALE_CANDIDATE = "STALE_CANDIDATE";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static final String INSERT_REVISION =
      """
      INSERT INTO ui_test_revisions (
          test_id, csi_id, source_revision, configuration_revision,
          source, source_hash, artifact, artifact_hash, artifact_schema_version,
          configuration, "references", provenance, created_by)
      VALUES (?, ?, ?, ?,
          CAST(? AS jsonb), ?, CAST(? AS jsonb), ?, ?,
          CAST(? AS jsonb), CAST(? AS jsonb), CAST(? AS jsonb), ?)
      ON CONFLICT (test_id, source_revision, configuration_revision, artifact_hash)
          DO NOTHING
      RETURNING id
      """;

  private static final String SELECT_REVISION_BY_IDENTITY =
      """
      SELECT id FROM ui_test_revisions
       WHERE test_id = ? AND source_revision = ? AND configuration_revision = ?
         AND artifact_hash = ?
      """;

  private final JdbcTemplate jdbc;
  private final StudioRepository studioRepository;

  public CompileStateService(JdbcTemplate jdbc, StudioRepository studioRepository) {
    this.jdbc = jdbc;
    this.studioRepository = studioRepository;
  }

  /**
   * Persists a new compile request identity and moves the draft to {@code COMPILING}, returning the
   * source and configuration revisions the compile is started for. Single statement, one
   * transaction (AC-10).
   */
  @Transactional
  public CompileRequest beginCompile(UUID testId) {
    requireCompilable(testId);
    UUID requestId = UUID.randomUUID();
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            """
            UPDATE ui_tests
               SET compile_request_id  = ?,
                   compile_status      = 'COMPILING',
                   compile_started_at  = NOW(),
                   compile_error       = NULL,
                   compile_diagnostics = NULL
             WHERE id = ? AND deleted_at IS NULL AND quarantined_at IS NULL
            RETURNING source_revision, configuration_revision
            """,
            requestId,
            testId);
    if (rows.isEmpty()) {
      throw new IllegalArgumentException("UI Test not found: " + testId);
    }
    Map<String, Object> row = rows.get(0);
    return new CompileRequest(
        requestId, asLong(row.get("source_revision")), asLong(row.get("configuration_revision")));
  }

  /**
   * Stores a validated candidate as an immutable revision and makes it the current candidate, but
   * only while the supplied compile request identity and <em>both</em> revisions it was started for
   * are still current (AC-8, AC-11). Otherwise nothing is written and {@link
   * PublishResult#DISCARDED_OUT_OF_ORDER} is returned.
   */
  @Transactional
  public PublishResult publishCandidate(
      UUID testId, CompileRequest request, CandidateRevision candidate) {
    requireCompilable(testId);
    requireCandidateMatchesRequest(request, candidate);
    List<Map<String, Object>> guarded = lockCurrentRequest(testId, request);
    if (guarded.isEmpty()) {
      logDiscard(testId, request);
      return PublishResult.DISCARDED_OUT_OF_ORDER;
    }
    String csiId = (String) guarded.get(0).get("csi_id");
    UUID revisionId = insertOrReuseRevision(testId, csiId, request.sourceRevision(), candidate);

    int updated =
        jdbc.update(
            """
            UPDATE ui_tests
               SET current_candidate_revision_id = ?,
                   compile_status                = 'AWAITING_CONFIRMATION',
                   compile_started_at            = NULL,
                   compile_error                 = NULL,
                   compile_diagnostics           = NULL
             WHERE id = ? AND compile_request_id = ? AND source_revision = ?
               AND configuration_revision = ?
               AND deleted_at IS NULL AND quarantined_at IS NULL
            """,
            revisionId,
            testId,
            request.requestId(),
            request.sourceRevision(),
            request.configurationRevision());
    if (updated != 1) {
      // Unreachable while the guard row lock is held; fail loudly rather than half-publish.
      throw new IllegalStateException(
          "Candidate publication lost its guard for test "
              + testId
              + " (request "
              + request.requestId()
              + ")");
    }
    return PublishResult.PUBLISHED;
  }

  /**
   * Records per-step diagnostics for an unrunnable compile result and moves the draft to {@code
   * NEEDS_REVISION}, under the same conditional rule as {@link #publishCandidate} (AC-12).
   */
  @Transactional
  public PublishResult publishInvalid(UUID testId, CompileRequest request, String diagnosticsJson) {
    requireCompilable(testId);
    int updated =
        jdbc.update(
            """
            UPDATE ui_tests
               SET compile_status                = 'NEEDS_REVISION',
                   compile_started_at            = NULL,
                   compile_diagnostics           = CAST(? AS jsonb),
                   compile_error                 = NULL,
                   current_candidate_revision_id = NULL
             WHERE id = ? AND compile_request_id = ? AND source_revision = ?
               AND configuration_revision = ?
               AND deleted_at IS NULL AND quarantined_at IS NULL
            """,
            diagnosticsJson,
            testId,
            request.requestId(),
            request.sourceRevision(),
            request.configurationRevision());
    if (updated != 1) {
      logDiscard(testId, request);
      return PublishResult.DISCARDED_OUT_OF_ORDER;
    }
    return PublishResult.PUBLISHED;
  }

  /**
   * Records a compile failure (for example a gateway outage). The authored draft itself is
   * untouched and stays saved; the compile state falls back to {@code STALE} carrying {@code
   * compile_error} (AC-12, Architecture §4.7).
   *
   * <p>The current candidate is cleared, symmetrically with {@link #publishInvalid}: {@code STALE}
   * means "no candidate for the current revisions", so a failed compile must not leave a
   * confirmable candidate behind that could drive {@code STALE -> READY} and silently discard the
   * recorded error.
   */
  @Transactional
  public PublishResult publishError(UUID testId, CompileRequest request, String errorJson) {
    requireCompilable(testId);
    int updated =
        jdbc.update(
            """
            UPDATE ui_tests
               SET compile_status                = 'STALE',
                   compile_started_at            = NULL,
                   compile_error                 = CAST(? AS jsonb),
                   compile_diagnostics           = NULL,
                   current_candidate_revision_id = NULL
             WHERE id = ? AND compile_request_id = ? AND source_revision = ?
               AND configuration_revision = ?
               AND deleted_at IS NULL AND quarantined_at IS NULL
            """,
            errorJson,
            testId,
            request.requestId(),
            request.sourceRevision(),
            request.configurationRevision());
    if (updated != 1) {
      logDiscard(testId, request);
      return PublishResult.DISCARDED_OUT_OF_ORDER;
    }
    return PublishResult.PUBLISHED;
  }

  /**
   * Confirms exactly the candidate the author reviewed (Architecture §4.2 body {@code {revisionId,
   * artifactHash, sourceRevision, configurationRevision}}).
   *
   * <p>Succeeds only when the draft is actually {@code AWAITING_CONFIRMATION}, the revision is
   * still the current candidate, its artifact hash and revisions match the supplied values, and it
   * has never been confirmed. Any mismatch is a {@code 409 STALE_CANDIDATE} and rolls the whole
   * transaction back, so the write-once confirmation is never partially applied (AC-13).
   *
   * <p>{@code AWAITING_CONFIRMATION} is an explicit precondition, not a consequence of the other
   * checks: confirmation is the exact-revision approval gate of Architecture §4.2 and must only
   * accept the state it was offered from. Without it a draft parked in {@code STALE} by a compile
   * failure, or moved to {@code COMPILING} by a recompile that has not yet published, could still
   * be driven straight to {@code READY} from a stale tab.
   *
   * @return the confirmed revision id
   */
  @Transactional
  public UUID confirm(
      UUID testId,
      UUID revisionId,
      String artifactHash,
      long sourceRevision,
      long configurationRevision,
      String principal) {
    requireCompilable(testId);

    int revisionUpdated =
        jdbc.update(
            """
            UPDATE ui_test_revisions
               SET confirmed_by = ?, confirmed_at = NOW()
             WHERE id = ? AND test_id = ? AND artifact_hash = ?
               AND source_revision = ? AND configuration_revision = ?
               AND confirmed_by IS NULL AND confirmed_at IS NULL
            """,
            principal,
            revisionId,
            testId,
            artifactHash,
            sourceRevision,
            configurationRevision);
    if (revisionUpdated != 1) {
      throw new StudioConflictException(
          STALE_CANDIDATE,
          "Revision "
              + revisionId
              + " is not an unconfirmed candidate matching the supplied"
              + " artifact hash and revisions");
    }

    int testUpdated =
        jdbc.update(
            """
            UPDATE ui_tests
               SET confirmed_revision_id = ?,
                   compile_status        = 'READY',
                   compile_error         = NULL,
                   compile_diagnostics   = NULL
             WHERE id = ? AND current_candidate_revision_id = ?
               AND compile_status = 'AWAITING_CONFIRMATION'
               AND source_revision = ? AND configuration_revision = ?
               AND deleted_at IS NULL AND quarantined_at IS NULL
            """,
            revisionId,
            testId,
            revisionId,
            sourceRevision,
            configurationRevision);
    if (testUpdated != 1) {
      throw new StudioConflictException(
          STALE_CANDIDATE,
          "Revision "
              + revisionId
              + " is not the current candidate of a test "
              + testId
              + " that is awaiting confirmation");
    }
    return revisionId;
  }

  /**
   * Marks abandoned compile requests retryable (story 10.9, AC-18, AC-19; architecture &sect;4.7).
   *
   * <p>A compile that was in flight when its API replica died leaves a row in {@code COMPILING}
   * forever: the per-attempt budget and the late-result drop are held in memory and do not survive
   * a restart. This moves such a row to <strong>exactly the outcome {@link #publishError} produces
   * </strong> — {@code STALE}, a retryable {@code compile_error} carrying a bounded code and
   * nothing else, and the current candidate cleared — so the authoring UI has one state to render
   * for "the last compile did not produce a candidate" rather than two.
   *
   * <h2>Why this clears the request identity, and why no publish guard changes</h2>
   *
   * <p>The three publish transitions condition on {@code compile_request_id} intrinsically and
   * deliberately do <em>not</em> condition on {@code compile_status} — 10.4 made {@code
   * beginCompile} unconditional on status and 10.8 built AC-23 on that. So a naive sweep that moved
   * {@code COMPILING -> STALE} while leaving the request identity intact would let a late result
   * from the swept compile resurrect it, and the tempting fix would be a status term on all three
   * publish guards: a guard change in service of a sweep, touching code three other criteria depend
   * on.
   *
   * <p>Clearing {@code compile_request_id} <em>is</em> what "this compile request is abandoned"
   * means. The existing intrinsic guard then does the work unchanged: a late publish finds no
   * matching request and returns {@link PublishResult#DISCARDED_OUT_OF_ORDER}. No publish guard is
   * modified, widened or given a new term by this method.
   *
   * <h2>Why the statement re-states its own predicate</h2>
   *
   * <p>The age predicate and the status are re-stated in the outer {@code WHERE}, not only in the
   * {@code SELECT ... FOR UPDATE SKIP LOCKED} that chooses the rows. PostgreSQL re-evaluates a
   * conditional {@code UPDATE}'s predicate against the committed row version once the row lock is
   * acquired, so a row that settled between the selection and the update is skipped rather than
   * overwritten. {@code SKIP LOCKED} additionally means concurrent API replicas divide the work
   * instead of contending for it.
   *
   * <p>The selection is a CTE rather than a {@code WHERE id IN (SELECT ... LIMIT n)} subquery, and
   * that is a correctness fix rather than a style choice. The subquery form was written first and
   * measured: with five sweepable rows and a batch size of two it updated <em>five</em>, because
   * the planner is free to re-evaluate an uncorrelated {@code IN} subquery per outer row and the
   * {@code LIMIT} then bounds each evaluation instead of the statement. A CTE is evaluated once, so
   * the batch size is a bound on the statement — which is the only reading under which "the run
   * stops at the cap and the next scheduled run continues" is true.
   *
   * <p>The code recorded is {@link CompileErrorCode#COMPILE_BUDGET_EXCEEDED} rather than a twelfth
   * code invented here. It is literally true: the sweep threshold is validated at startup to exceed
   * the per-request budget, so by the time a row is old enough to be swept its budget has certainly
   * elapsed — the sweep is the durable form of a deadline the process was holding in memory when it
   * died. ADR-002 &sect;16.4 is explicit that needing a new compile error code is a signal the
   * bound being reported was not in &sect;4.3.
   *
   * <p>It writes <strong>no</strong> {@code ui_test_revisions} row and changes <strong>no</strong>
   * {@code confirmed_revision_id}: an abandoned compile never produced a candidate to confirm, and
   * the confirmed history is not this method's to touch.
   *
   * @param threshold how long a row may sit in {@code COMPILING} before it is abandoned
   * @param batchSize the maximum number of rows this run may settle
   * @return how many rows were swept
   */
  @Transactional
  public int sweepAbandoned(Duration threshold, int batchSize) {
    if (threshold == null || threshold.isNegative() || threshold.isZero() || batchSize <= 0) {
      throw new IllegalArgumentException(
          "sweepAbandoned needs a positive threshold and batch size, not "
              + threshold
              + "/"
              + batchSize);
    }
    ObjectNode error = MAPPER.createObjectNode();
    error.put("code", CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
    double thresholdSeconds = threshold.toMillis() / 1000.0d;

    return jdbc.update(
        """
        WITH abandoned AS (
            SELECT id
              FROM ui_tests
             WHERE compile_status = 'COMPILING'
               AND compile_started_at < NOW() - make_interval(secs => ?)
             ORDER BY compile_started_at
             LIMIT ?
               FOR UPDATE SKIP LOCKED
        )
        UPDATE ui_tests t
           SET compile_status                = 'STALE',
               compile_started_at            = NULL,
               compile_request_id            = NULL,
               compile_error                 = CAST(? AS jsonb),
               compile_diagnostics           = NULL,
               current_candidate_revision_id = NULL
          FROM abandoned a
         WHERE t.id = a.id
           AND t.compile_status = 'COMPILING'
           AND t.compile_started_at < NOW() - make_interval(secs => ?)
        """,
        thresholdSeconds,
        batchSize,
        error.toString(),
        thresholdSeconds);
  }

  /**
   * Rejects compile/confirm work for a test that does not exist, was soft-deleted (AC-14) or is
   * quarantined because its CSI is missing or unregistered (AC-3).
   *
   * <p>Public since story 10.8 so the compile pipeline can apply this guard <em>before</em> reading
   * the draft and enforcing authoring limits, rather than reimplementing it. It is a read: it
   * writes no compile-state column and so does not weaken 10.8 AC-3, which requires every
   * transition to go through this class. Deliberately left exactly as 10.4 wrote it — widening it
   * so that a deleted test can be compiled would be loosening a guard to silence a test, which
   * ADR-002 &sect;12 names as the one manoeuvre whose only effect is to hide a failure.
   *
   * @param testId the draft to check
   */
  public void requireCompilable(UUID testId) {
    String state =
        studioRepository
            .findLifecycleState(testId)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + testId));
    if ("DELETED".equals(state)) {
      throw new StudioConflictException(
          "TEST_DELETED", "UI Test " + testId + " is deleted; compile and confirm are blocked");
    }
    if ("QUARANTINED".equals(state)) {
      throw new StudioConflictException(
          "TEST_QUARANTINED",
          "UI Test "
              + testId
              + " is quarantined pending CSI resolution; compile and confirm are"
              + " blocked");
    }
  }

  private List<Map<String, Object>> lockCurrentRequest(UUID testId, CompileRequest request) {
    return jdbc.queryForList(
        """
        SELECT csi_id, configuration_revision
          FROM ui_tests
         WHERE id = ? AND compile_request_id = ? AND source_revision = ?
           AND configuration_revision = ?
           AND deleted_at IS NULL AND quarantined_at IS NULL
           FOR UPDATE
        """,
        testId,
        request.requestId(),
        request.sourceRevision(),
        request.configurationRevision());
  }

  /**
   * Rejects a candidate compiled for a configuration revision other than the one the compile
   * request was started for. The guard clauses check the draft against {@link CompileRequest}, so a
   * divergent {@link CandidateRevision#configurationRevision()} would be stored on a revision row
   * that {@link #confirm} could never match — a programming error in the compile pipeline, not a
   * race.
   */
  private static void requireCandidateMatchesRequest(
      CompileRequest request, CandidateRevision candidate) {
    if (candidate.configurationRevision() != request.configurationRevision()) {
      throw new IllegalArgumentException(
          "Candidate was compiled for configurationRevision "
              + candidate.configurationRevision()
              + " but the compile request was started for "
              + request.configurationRevision());
    }
  }

  private static void logDiscard(UUID testId, CompileRequest request) {
    LOGGER.info(
        "Discarding out-of-order compile result for test {} (request {}, sourceRevision {},"
            + " configurationRevision {})",
        testId,
        request.requestId(),
        request.sourceRevision(),
        request.configurationRevision());
  }

  /**
   * Inserts the candidate as a new immutable revision. An explicit recompile that reproduces an
   * identical artifact for the same revisions resolves to the revision that already carries that
   * identity instead of duplicating it — the unique key {@code (test_id, source_revision,
   * configuration_revision, artifact_hash)} is the artifact identity.
   */
  private UUID insertOrReuseRevision(
      UUID testId, String csiId, long sourceRevision, CandidateRevision candidate) {
    List<UUID> inserted =
        jdbc.queryForList(
            INSERT_REVISION,
            UUID.class,
            testId,
            csiId,
            sourceRevision,
            candidate.configurationRevision(),
            candidate.source(),
            candidate.sourceHash(),
            candidate.artifact(),
            candidate.artifactHash(),
            candidate.artifactSchemaVersion(),
            candidate.configuration(),
            candidate.references(),
            candidate.provenance(),
            candidate.createdBy());
    if (!inserted.isEmpty()) {
      return inserted.get(0);
    }
    return jdbc.queryForObject(
        SELECT_REVISION_BY_IDENTITY,
        UUID.class,
        testId,
        sourceRevision,
        candidate.configurationRevision(),
        candidate.artifactHash());
  }

  private static long asLong(Object value) {
    return ((Number) value).longValue();
  }
}
