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
  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.citi.put.checks.studio.scheduling.StudioScheduleInvalidation scheduleInvalidation;

  private static final Logger LOGGER = LoggerFactory.getLogger(CompileStateService.class);

  private static final String STALE_CANDIDATE = "STALE_CANDIDATE";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static final String INSERT_REVISION =
      """
      INSERT INTO ui_test_revisions (
      test_id,  csi_id,  source_revision,  configuration_revision,
      source,  source_hash,  artifact,  artifact_hash,
      artifact_schema_version,
      configuration,  "references",  provenance,  created_by,
      reference_policy,
      intent_derivation_version)
      VALUES (?,  ?,  ?,  ?,
      CAST(? AS jsonb),  ?,  CAST(? AS jsonb),  ?,  ?,
      CAST(? AS jsonb),  CAST(? AS jsonb),  CAST(? AS jsonb),  ?,  CAST(?
      AS jsonb),  ?)
      ON CONFLICT DO NOTHING
      RETURNING id
      """;

  private static final String SELECT_REVISION_BY_IDENTITY =
      """
      SELECT id FROM ui_test_revisions
      WHERE test_id = ? AND source_revision = ? AND configuration_revision
      = ?
      AND artifact_hash = ?
      AND expected_intent IS NULL
      AND reference_policy IS NOT DISTINCT FROM CAST(? AS jsonb)
      AND intent_derivation_version IS NOT DISTINCT FROM ?
      """;

  private final JdbcTemplate jdbc;
  private final StudioRepository studioRepository;

  @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entityManager;

  public CompileStateService(JdbcTemplate jdbc, StudioRepository studioRepository) {
    this.jdbc = jdbc;
    this.studioRepository = studioRepository;
  }

  /** Input and request identity captured under one draft lock, before network work. */
  public record Capture(
      CompileRequest request,
      CompileInputs inputs,
      List<com.citi.put.checks.studio.compile.incremental.CompilationPlanner.Step> steps,
      com.citi.put.checks.studio.compile.incremental.CompilationPlanner.Plan plan,
      com.citi.put.checks.studio.compile.incremental.CompilationPlanner.Baseline baseline,
      String authoringHash,
      String fingerprint,
      String baselineProvenance) {}

  /** Commits the capture before pipeline dispatch, including after-commit save callbacks. */
  @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
  public Capture captureForCompilation(
      UUID testId,
      String principal,
      AuthoringLimits limits,
      CredentialPatternScreen screen,
      String fingerprint,
      Duration duration,
      String requestedMode,
      boolean incrementalEnabled,
      Long expectedSource,
      Long expectedConfiguration,
      String expectedAuthoringHash) {
    return capture(
        testId,
        principal,
        limits,
        screen,
        fingerprint,
        duration,
        requestedMode,
        incrementalEnabled,
        expectedSource,
        expectedConfiguration,
        expectedAuthoringHash);
  }

  /** Atomic state operation; callers performing composed database work own their transaction. */
  @Transactional
  public Capture capture(
      UUID testId,
      String principal,
      AuthoringLimits limits,
      CredentialPatternScreen screen,
      String fingerprint,
      Duration duration,
      String requestedMode,
      boolean incrementalEnabled,
      Long expectedSource,
      Long expectedConfiguration,
      String expectedAuthoringHash) {
    requireCompilable(testId);
    var draft =
        studioRepository
            .findByIdForUpdate(testId)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + testId));
    entityManager.refresh(draft);
    CompileInputs inputs = CompileInputs.from(draft, principal);
    limits.requireWithinLimits(inputs.orderedSource());
    screen.requireNoInlineCredentials(inputs.orderedSource());
    if (expectedSource != null
        && (draft.getSourceRevision() != expectedSource
            || expectedConfiguration == null
            || draft.getConfigurationRevision() != expectedConfiguration
            || !java.util.Objects.equals(
                expectedAuthoringHash,
                jdbc.queryForObject(
                    "SELECT authoring_hash FROM ui_tests WHERE id = ?", String.class, testId)))) {
      throw new StudioConflictException("STALE_REVISION", "Reload the current authoring snapshot");
    }
    InferenceCaptureStore store = new InferenceCaptureStore(jdbc);
    if (expectedSource != null && !store.requestIdentityAvailable()) {
      throw new StudioConflictException(
          "INFERENCE_CUTOVER_REQUIRED",
          "Versioned compilation requires the compatible publisher cutover");
    }
    return store.persist(
        beginCompile(testId), inputs, fingerprint, duration, requestedMode, incrementalEnabled);
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
            RETURNING source_revision,  configuration_revision
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
    if (!boundPublicationStatements(request)) {
      logDiscard(testId, request);
      return PublishResult.DISCARDED_OUT_OF_ORDER;
    }
    List<Map<String, Object>> guarded = lockCurrentRequest(testId, request);
    if (guarded.isEmpty()) {
      logDiscard(testId, request);
      return PublishResult.DISCARDED_OUT_OF_ORDER;
    }
    String csiId = (String) guarded.get(0).get("csi_id");
    requirePublicationBudget(request);
    UUID revisionId =
        new InferenceCaptureStore(jdbc).requestIdentityAvailable()
            ? insertCapturedRevision(testId, request, candidate)
            : insertOrReuseRevision(testId, csiId, request.sourceRevision(), candidate);

    requirePublicationBudget(request);
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
            AND NOT EXISTS (SELECT 1 FROM ui_test_compile_requests r
            WHERE r.request_id = ui_tests.compile_request_id
            AND r.deadline_at <= clock_timestamp())
            """,
            revisionId,
            testId,
            request.requestId(),
            request.sourceRevision(),
            request.configurationRevision());
    if (updated != 1) {
      // Throwing rolls back any inserted revision together with the failed final CAS.
      throw new java.util.concurrent.CancellationException("Publication deadline or guard expired");
    }
    return PublishResult.PUBLISHED;
  }

  /**
   * Stores and accepts a validated candidate produced by a save-triggered compile in one
   * transaction.
   *
   * <p>The same request/revision guard used by {@link #publishCandidate} is locked before a
   * revision is inserted, so an edit or newer compile discards the result without leaving even an
   * orphan revision. The reference policy is re-verified from the persisted immutable row before
   * readiness is granted. This keeps save convenient without weakening the fail-closed execution
   * gate: only a validated, current and verifiable revision can reach {@code READY}.
   */
  @Transactional
  public PublishResult publishAcceptedCandidate(
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
    if (!persistedReferencePolicyIsVerified(revisionId, testId)) {
      throw new IllegalStateException(
          "Validated revision "
              + revisionId
              + " does not carry a verifiable immutable reference policy");
    }

    jdbc.update(
        """
        UPDATE ui_test_revisions
        SET confirmed_by = ?,  confirmed_at = NOW()
        WHERE id = ? AND test_id = ?
        AND confirmed_by IS NULL AND confirmed_at IS NULL
        """,
        candidate.createdBy(),
        revisionId,
        testId);

    int updated =
        jdbc.update(
            """
            UPDATE ui_tests
            SET current_candidate_revision_id = ?,
            confirmed_revision_id         = ?,
            compile_status                = 'READY',
            compile_started_at            = NULL,
            compile_error                 = NULL,
            compile_diagnostics           = NULL
            WHERE id = ? AND compile_request_id = ? AND source_revision = ?
            AND configuration_revision = ?
            AND deleted_at IS NULL AND quarantined_at IS NULL
            """,
            revisionId,
            revisionId,
            testId,
            request.requestId(),
            request.sourceRevision(),
            request.configurationRevision());
    if (updated != 1) {
      throw new IllegalStateException(
          "Accepted candidate publication lost its guard for test "
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
    boundSettlementStatements();
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
    boundSettlementStatements();
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
    jdbc.queryForObject("SELECT id FROM ui_tests WHERE id = ? FOR UPDATE", UUID.class, testId);

    List<Map<String, Object>> candidates =
        jdbc.queryForList(
            """
            SELECT source::text AS source,  authoring::text AS authoring,
            authoring_revision_inputs::text AS authoring_inputs,
            reference_policy::text AS reference_policy,
            intent_derivation_version,  provenance::text AS provenance
            FROM ui_test_revisions
            WHERE id = ? AND test_id = ? AND artifact_hash = ?
            AND source_revision = ? AND configuration_revision = ?
            AND confirmed_by IS NULL AND confirmed_at IS NULL
            FOR UPDATE
            """,
            revisionId,
            testId,
            artifactHash,
            sourceRevision,
            configurationRevision);
    if (candidates.isEmpty() || !verifiedReferencePolicy(candidates.get(0))) {
      throw new StudioConflictException(
          STALE_CANDIDATE,
          "Revision " + revisionId + " does not carry a verifiable immutable reference policy");
    }

    int revisionUpdated =
        jdbc.update(
            """
            UPDATE ui_test_revisions
            SET confirmed_by = ?,  confirmed_at = NOW()
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
    if (scheduleInvalidation != null) {
      scheduleInvalidation.invalidate(testId, "ACTIVATION_REVISION_MISMATCH");
    }
    return revisionId;
  }

  private static boolean verifiedReferencePolicy(Map<String, Object> row) {
    return IntentRevisionVerifier.verify(
        text(row.get("source")),
        text(row.get("authoring")),
        text(row.get("authoring_inputs")),
        text(row.get("reference_policy")),
        text(row.get("intent_derivation_version")),
        text(row.get("provenance")));
  }

  private boolean persistedReferencePolicyIsVerified(UUID revisionId, UUID testId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            """
            SELECT source::text AS source,  authoring::text AS authoring,
            authoring_revision_inputs::text AS authoring_inputs,
            reference_policy::text AS reference_policy,
            intent_derivation_version,  provenance::text AS provenance
            FROM ui_test_revisions
            WHERE id = ? AND test_id = ?
            FOR UPDATE
            """,
            revisionId,
            testId);
    return rows.size() == 1 && verifiedReferencePolicy(rows.get(0));
  }

  private static String text(Object value) {
    return value == null ? null : String.valueOf(value);
  }

  /**
   * Confirms a candidate whose captured compile-request identity must still match (story 10.23).
   */
  @Transactional
  public UUID confirmVersioned(
      UUID testId,
      UUID requestId,
      UUID revisionId,
      String artifactHash,
      long sourceRevision,
      long configurationRevision,
      String authoringHash,
      String principal) {
    requireCompilable(testId);
    List<Map<String, Object>> current =
        jdbc.queryForList(
            """
            SELECT t.id FROM ui_tests t JOIN ui_test_revisions r
            ON r.id = t.current_candidate_revision_id AND r.test_id = t.id
            WHERE t.id = ? AND t.compile_request_id = ? AND r.compile_request_id
            = ?
            AND t.authoring_hash = ? AND r.authoring_hash = ? AND r.id = ?
            AND t.source_revision = ? AND t.configuration_revision = ?
            AND t.deleted_at IS NULL AND t.quarantined_at IS NULL
            FOR UPDATE OF t
            """,
            testId,
            requestId,
            requestId,
            authoringHash,
            authoringHash,
            revisionId,
            sourceRevision,
            configurationRevision);
    if (current.isEmpty()) {
      throw new StudioConflictException(
          STALE_CANDIDATE, "Candidate identity or authoring snapshot changed");
    }
    return confirm(
        testId, revisionId, artifactHash, sourceRevision, configurationRevision, principal);
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
        SELECT csi_id,  configuration_revision
        FROM ui_tests
        WHERE id = ? AND compile_request_id = ? AND source_revision = ?
        AND configuration_revision = ?
        AND deleted_at IS NULL AND quarantined_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM ui_test_compile_requests r
        WHERE r.request_id = ? AND r.deadline_at <= clock_timestamp())
        FOR UPDATE
        """,
        testId,
        request.requestId(),
        request.sourceRevision(),
        request.configurationRevision(),
        request.requestId());
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
            candidate.createdBy(),
            candidate.referencePolicy(),
            candidate.intentDerivationVersion());
    if (!inserted.isEmpty()) {
      return inserted.get(0);
    }
    return jdbc.queryForObject(
        SELECT_REVISION_BY_IDENTITY,
        UUID.class,
        testId,
        sourceRevision,
        candidate.configurationRevision(),
        candidate.artifactHash(),
        candidate.referencePolicy(),
        candidate.intentDerivationVersion());
  }

  /** Append-only attempt result; retrying a terminal write cannot replace earlier evidence. */
  @Transactional
  public void recordOutcome(
      UUID requestId, String state, String errorCode, String diagnostics, String usage) {
    boundSettlementStatements();
    jdbc.update(
        """
        INSERT INTO ui_test_compile_outcomes(request_id, outcome)
        SELECT request_id,  jsonb_build_object('state', ?,  'stage',
        'COMPLETE',
        'errorCode', CAST(? AS text), 'diagnostics', CAST(? AS jsonb),
        'usage', CAST(? AS jsonb),
        'revisionId', (SELECT id FROM ui_test_revisions WHERE
        compile_request_id = r.request_id),
        'artifactHash', (SELECT artifact_hash FROM ui_test_revisions WHERE
        compile_request_id = r.request_id))
        FROM ui_test_compile_requests r WHERE request_id = ?
        ON CONFLICT(request_id) DO NOTHING
        """,
        state,
        errorCode,
        diagnostics,
        usage,
        requestId);
  }

  private void requirePublicationBudget(CompileRequest request) {
    if (!boundPublicationStatements(request)) {
      throw new java.util.concurrent.CancellationException("Publication deadline expired");
    }
  }

  private boolean boundPublicationStatements(CompileRequest request) {
    List<Long> remaining =
        jdbc.queryForList(
            """
            SELECT greatest(0, floor(extract(epoch FROM
            deadline_at-clock_timestamp())*1000))::bigint
            FROM ui_test_compile_requests WHERE request_id = ?
            """,
            Long.class,
            request.requestId());
    if (remaining.isEmpty()) {
      return true;
    } // Historical pre-capture state-service callers.
    if (remaining.getFirst() <= 0) {
      return false;
    }
    jdbc.queryForObject(
        "SELECT set_config('statement_timeout',?,true)", String.class, remaining.getFirst() + "ms");
    return true;
  }

  private void boundSettlementStatements() {
    jdbc.queryForObject("SELECT set_config('statement_timeout','2000ms',true)", String.class);
  }

  private UUID insertCapturedRevision(
      UUID testId, CompileRequest request, CandidateRevision candidate) {
    UUID allocatedRevision = UUID.randomUUID();
    String provenance;
    try {
      var document = MAPPER.readTree(candidate.provenance());
      for (var step : document.path("steps")) {
        if (request.requestId().toString().equals(step.path("originalCompileRequestId").asText())
            && step.path("originalRevisionId").isNull()) {
          ((ObjectNode) step).put("originalRevisionId", allocatedRevision.toString());
        }
      }
      provenance = document.toString();
    } catch (java.io.IOException e) {
      throw new IllegalArgumentException("Invalid candidate provenance", e);
    }
    List<UUID> inserted =
        jdbc.queryForList(
            """
            INSERT INTO ui_test_revisions
            (id, test_id, csi_id, source_revision, configuration_revision,
            source, source_hash,
            artifact, artifact_hash, artifact_schema_version, configuration,
            "references", provenance,
            created_by, compile_request_id, authoring_snapshot, authoring_hash,
            scope_reviewed_by,
            scope_reviewed_at, compilation_fingerprint, baseline_revision_id,
            reference_policy, intent_derivation_version)
            SELECT ?, test_id, csi_id, source_revision, configuration_revision,
            source, source_hash,
            CAST(? AS jsonb), ?, ?, configuration, "references", CAST(? AS
            jsonb), created_by,
            request_id, authoring_snapshot, authoring_hash, scope_reviewed_by,
            scope_reviewed_at,
            compilation_fingerprint, baseline_revision_id,
            CAST(? AS jsonb), ?
            FROM ui_test_compile_requests WHERE request_id = ? AND test_id = ?
            ON CONFLICT (compile_request_id) DO NOTHING RETURNING id
            """,
            UUID.class,
            allocatedRevision,
            candidate.artifact(),
            candidate.artifactHash(),
            candidate.artifactSchemaVersion(),
            provenance,
            candidate.referencePolicy(),
            candidate.intentDerivationVersion(),
            request.requestId(),
            testId);
    if (!inserted.isEmpty()) {
      return inserted.getFirst();
    }
    return jdbc.queryForObject(
        "SELECT id FROM ui_test_revisions WHERE compile_request_id = ? AND test_id = ?",
        UUID.class,
        request.requestId(),
        testId);
  }

  private static long asLong(Object value) {
    return ((Number) value).longValue();
  }
}
