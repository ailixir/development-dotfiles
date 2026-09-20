package com.citi.put.checks.studio.dispatch;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.StringJoiner;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Every conditional statement the dispatch ledger is moved by (AC-3, AC-21, AC-23).
 *
 * <p>Three rules hold for every statement in this class, and they are the reason it exists as one
 * class rather than as methods scattered over the services that call them.
 *
 * <ol>
 *   <li><b>The guard is intrinsic to the statement.</b> Every precondition — the identity, the
 *       sequence, the current state and the permitted target — sits in the {@code WHERE} of the
 *       statement that performs the change. No precondition is established by a preceding {@code
 *       SELECT}, by a Java-side check the statement then trusts, or by a companion write in another
 *       class. Story 10.4's QA round rejected those alternatives because the next writer of the
 *       same columns silently reopens the hole.
 *   <li><b>The affected-row count is the verdict.</b> {@code 1} is success and {@code 0} is the
 *       conflict. {@code 0} is never treated as success and never retried into success.
 *   <li><b>A visible change and its revision are one statement.</b> {@code snapshot_revision =
 *       snapshot_revision + 1} is written by the same {@code UPDATE} that makes the change, so a
 *       revision can neither be assigned for a change that did not commit nor omitted for one that
 *       did.
 * </ol>
 *
 * <p>The report-application statements are single statements built from data-modifying CTEs. The
 * first CTE locks the ledger row with the whole ownership and ordering predicate on it; PostgreSQL
 * re-evaluates that predicate against the committed row version once the lock is granted, exactly
 * as a conditional {@code UPDATE} does, so two racing deliveries serialize on the ledger row and
 * the loser matches nothing. The history row is then updated only for rows the guard returned, and
 * the ledger state advances only for history rows that were actually written. Nothing in the chain
 * can commit half of a report.
 *
 * <p>{@code ui_test_executions.snapshot_revision} is the authoritative monotonic revision: it is
 * the SSE event id and the {@code revision} of the public snapshot. The ledger's own {@code
 * snapshot_revision} column is not written by this story; the history row is the single allocator,
 * because two allocators for one number is how they diverge.
 */
@Component
public class StudioDispatchLedgerStatements {

  /**
   * The permitted transition matrix, embedded in SQL so that it is part of the statement rather
   * than a Java opinion about it. {@link DispatchState#permittedTransitions()} mirrors this list
   * and a test asserts the two agree.
   *
   * <p>Nothing leaves {@code DONE}: no pair below starts there.
   */
  public static final String TRANSITION_MATRIX =
      """
      (VALUES ('QUEUED','CLAIMED'),
              ('CLAIMED','DISPATCHING'),
              ('DISPATCHING','ADMITTED'),
              ('ADMITTED','RUNNING'),
              ('ADMITTED','FINALIZING'),
              ('RUNNING','FINALIZING'),
              ('FINALIZING','DONE'),
              ('CLAIMED','QUEUED'),
              ('DISPATCHING','QUEUED'),
              ('QUEUED','DONE'),
              ('CLAIMED','DONE'),
              ('DISPATCHING','DONE'),
              ('ADMITTED','DONE'),
              ('RUNNING','DONE'))
      """;

  private final JdbcTemplate jdbc;

  public StudioDispatchLedgerStatements(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  /**
   * The general-purpose transition, used by the reapers and the kill switch and by the transition
   * matrix test. The permitted set is inside the statement: a disallowed pair matches the {@code
   * VALUES} list nowhere and updates zero rows, and so does any pair leaving {@code DONE}.
   */
  public int transition(UUID executionId, DispatchState from, DispatchState to) {
    return jdbc.update(
        """
        UPDATE studio_dispatch_ledger
           SET state = ?, updated_at = now()
         WHERE execution_id = ?
           AND state = ?
           AND (?, ?) IN
        """
            + TRANSITION_MATRIX,
        to.name(),
        executionId,
        from.name(),
        from.name(),
        to.name());
  }

  /**
   * Claims one queued row for a dispatcher (AC-12). {@code QUEUED} plus an expired-or-absent lease
   * is the whole predicate, so two dispatchers racing one row produce exactly one {@code 1}.
   */
  public int claim(UUID executionId, String owner, Instant leaseExpiresAt, Instant now) {
    return jdbc.update(
        """
        UPDATE studio_dispatch_ledger
           SET state = 'CLAIMED', lease_owner = ?, lease_expires_at = ?, updated_at = now()
         WHERE execution_id = ?
           AND state = 'QUEUED'
           AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
        """,
        owner,
        Timestamp.from(leaseExpiresAt),
        executionId,
        Timestamp.from(now));
  }

  /**
   * Selects and claims the oldest claimable queued rows in <b>one</b> statement (Studio v1 WP8).
   *
   * <p>This is the dispatcher's pass-time claim. It replaces "read a queued batch, then {@link
   * #claim} each id" — a shape in which two dispatchers read the same batch and every row one of
   * them lost cost the other a round trip that updated nothing. Here the selection takes {@code FOR
   * UPDATE SKIP LOCKED}, so a concurrent dispatcher's selection passes over a row this statement is
   * claiming instead of queueing behind it, and the statement returns only rows it actually moved.
   * There is no id to lose a race on afterwards.
   *
   * <p>What does not change is the claim itself: {@code QUEUED} plus an expired-or-absent lease is
   * still the whole predicate, re-stated in the outer {@code WHERE} so it is re-evaluated against
   * the committed row once the lock is held; the lease owner and expiry written are the same; the
   * back-edges ({@link #releaseClaim}, {@link #returnAfterDefiniteRefusal}) are untouched.
   *
   * <p>The selection is a CTE, not {@code WHERE execution_id IN (SELECT ... LIMIT ?)}. PostgreSQL
   * may re-evaluate an uncorrelated {@code IN} subquery per outer row, and the {@code LIMIT} then
   * bounds each evaluation rather than the statement — measured on this codebase by {@link
   * com.citi.put.checks.studio.compile.CompileStateService#sweepAbandoned}'s story. A CTE is
   * evaluated once, so {@code limit} is a bound on how many rows this statement claims.
   *
   * @param owner the claiming dispatcher's lease owner
   * @param leaseExpiresAt the lease written onto every claimed row
   * @param now the instant a lease must have expired by for its row to be claimable
   * @param limit the most rows this statement may claim
   * @param excluded rows this statement must not claim even when claimable — the dispatcher passes
   *     the rows it has already attempted in the current pass, so a row a {@code 429} returned to
   *     the queue waits for the next pass exactly as it did when the pass worked from a fixed batch
   * @return the claimed execution ids, oldest acceptance first; empty when nothing was claimable
   */
  public List<UUID> claimQueued(
      String owner, Instant leaseExpiresAt, Instant now, int limit, Collection<UUID> excluded) {
    if (limit <= 0) {
      throw new IllegalArgumentException("claimQueued needs a positive limit, not " + limit);
    }
    List<Map.Entry<UUID, Timestamp>> claimed =
        jdbc.query(
            """
            WITH claimable AS (
                SELECT execution_id
                  FROM studio_dispatch_ledger
                 WHERE state = 'QUEUED'
                   AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
                   AND execution_id <> ALL (CAST(? AS uuid[]))
                 ORDER BY execution_accepted_at
                 LIMIT ?
                   FOR UPDATE SKIP LOCKED
            )
            UPDATE studio_dispatch_ledger l
               SET state = 'CLAIMED', lease_owner = ?, lease_expires_at = ?, updated_at = now()
              FROM claimable c
             WHERE l.execution_id = c.execution_id
               AND l.state = 'QUEUED'
               AND (l.lease_expires_at IS NULL OR l.lease_expires_at <= ?)
            RETURNING l.execution_id, l.execution_accepted_at
            """,
            (rs, rowNum) ->
                Map.entry(
                    rs.getObject("execution_id", UUID.class),
                    rs.getTimestamp("execution_accepted_at")),
            Timestamp.from(now),
            uuidArrayLiteral(excluded),
            limit,
            owner,
            Timestamp.from(leaseExpiresAt),
            Timestamp.from(now));
    // RETURNING carries no order of its own; the CTE's order is restored here.
    return claimed.stream().sorted(Map.Entry.comparingByValue()).map(Map.Entry::getKey).toList();
  }

  /** A PostgreSQL array literal of ids we generated ourselves; UUID text needs no escaping. */
  private static String uuidArrayLiteral(Collection<UUID> ids) {
    StringJoiner literal = new StringJoiner(",", "{", "}");
    if (ids != null) {
      ids.forEach(id -> literal.add(id.toString()));
    }
    return literal.toString();
  }

  /**
   * Commits {@code DISPATCHING} and a fresh attempt id <em>before</em> the send (AC-14). The
   * attempt is written by this statement and by nothing else, and {@code attempt_id IS NULL} is
   * part of the predicate so an attempt can never be silently replaced on a claimed row.
   */
  public int beginDispatch(UUID executionId, String owner, UUID attemptId) {
    return jdbc.update(
        """
        UPDATE studio_dispatch_ledger
           SET state = 'DISPATCHING', attempt_id = ?, updated_at = now()
         WHERE execution_id = ?
           AND state = 'CLAIMED'
           AND lease_owner = ?
           AND attempt_id IS NULL
        """,
        attemptId,
        executionId,
        owner);
  }

  /**
   * Returns a claimed row to the queue when its lease expired and no attempt was ever issued
   * (AC-3). {@code attempt_id IS NULL} is in the predicate: a row that reached {@code DISPATCHING}
   * is never reclaimed this way, whatever its lease says (AC-29).
   */
  public int releaseClaim(UUID executionId) {
    return jdbc.update(
        """
        UPDATE studio_dispatch_ledger
           SET state = 'QUEUED', lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
         WHERE execution_id = ?
           AND state = 'CLAIMED'
           AND attempt_id IS NULL
        """,
        executionId);
  }

  /**
   * Returns a dispatching row to the queue after a <em>definite</em> runner {@code 429} (AC-15).
   * The attempt is cleared by the same statement, which is what makes the next send carry a fresh
   * {@code attempt_id} rather than reusing one the runner may have seen.
   */
  public int returnAfterDefiniteRefusal(UUID executionId, UUID attemptId) {
    return jdbc.update(
        """
        UPDATE studio_dispatch_ledger
           SET state = 'QUEUED', attempt_id = NULL, lease_owner = NULL, lease_expires_at = NULL,
               updated_at = now()
         WHERE execution_id = ?
           AND state = 'DISPATCHING'
           AND attempt_id = ?
           AND admission_id IS NULL
        """,
        executionId,
        attemptId);
  }

  /**
   * The admission compare-and-set (AC-17, AC-18). One conditional statement carrying every
   * precondition: the execution, the current attempt, {@code DISPATCHING}, no admission yet, and a
   * pending deadline that has not passed.
   *
   * <p>The two deadlines are assigned here and derive from different origins than {@code
   * pending_deadline_at}, which acceptance set (AC-19).
   *
   * <p>{@code cancel_requested_at IS NULL} is in the predicate (Studio v1 WP4). A cancel that lands
   * between the dispatcher's send and the runner's admission request marks a {@code DISPATCHING}
   * row, and this is the statement that makes the mark binding: the runner is refused before it
   * launches anything, so a cancelled run never starts a browser however the two requests race.
   */
  public int admit(
      UUID executionId,
      UUID attemptId,
      UUID admissionId,
      String runnerInstanceId,
      Instant startDeadlineAt,
      Instant runDeadlineAt,
      Instant now) {
    return jdbc.update(
        """
        UPDATE studio_dispatch_ledger
           SET state = 'ADMITTED', admission_id = ?, runner_instance_id = ?,
               start_deadline_at = ?, run_deadline_at = ?, updated_at = now()
         WHERE execution_id = ?
           AND attempt_id = ?
           AND state = 'DISPATCHING'
           AND admission_id IS NULL
           AND (pending_deadline_at IS NULL OR pending_deadline_at > ?)
           AND cancel_requested_at IS NULL
        """,
        admissionId,
        runnerInstanceId,
        Timestamp.from(startDeadlineAt),
        Timestamp.from(runDeadlineAt),
        executionId,
        attemptId,
        Timestamp.from(now));
  }

  /**
   * The idempotent re-admission (AC-17): a second conditional statement matching the identity
   * <em>exactly</em>, never "an admission already exists, close enough". A row that has reached
   * {@code DONE} is excluded, so a settled execution refuses rather than re-acknowledges.
   */
  public int confirmExistingAdmission(
      UUID executionId, UUID attemptId, UUID admissionId, String runnerInstanceId) {
    return jdbc.update(
        """
        UPDATE studio_dispatch_ledger
           SET updated_at = now()
         WHERE execution_id = ?
           AND attempt_id = ?
           AND admission_id = ?
           AND runner_instance_id = ?
           AND state IN ('ADMITTED', 'RUNNING', 'FINALIZING')
        """,
        executionId,
        attemptId,
        admissionId,
        runnerInstanceId);
  }

  /**
   * Applies a {@code STARTED} report (AC-21, AC-22, AC-23).
   *
   * <p>{@code RUNNING} and {@code browser_started_at} are written here and nowhere else — never on
   * a dispatch call, never on a {@code 202}, never by a reaper. {@code started_at} is the history
   * partition key and the public {@code acceptedAt}: it appears in the {@code WHERE} and never in
   * the {@code SET}, because changing it would move the row between partitions.
   */
  public int applyStarted(
      UUID executionId,
      UUID attemptId,
      UUID admissionId,
      String runnerInstanceId,
      long runnerSequence,
      Instant browserStartedAt,
      String stepResultsJson,
      String logsJson,
      boolean logsTruncated,
      String runtimeVersionsJson) {
    Integer applied =
        jdbc.queryForObject(
            """
            WITH owner AS (
              SELECT execution_id, execution_accepted_at
                FROM studio_dispatch_ledger
               WHERE execution_id = ?
                 AND attempt_id = ?
                 AND admission_id = ?
                 AND runner_instance_id = ?
                 AND last_runner_sequence < ?
                 AND state = 'ADMITTED'
               FOR UPDATE
            ),
            history AS (
              UPDATE ui_test_executions e
                 SET status = 'RUNNING',
                     browser_started_at = CAST(? AS timestamptz),
                     step_results = CAST(? AS jsonb),
                     logs = CAST(? AS jsonb),
                     logs_truncated = ?,
                     runtime_versions = CAST(? AS jsonb),
                     snapshot_revision = e.snapshot_revision + 1
                FROM owner o
               WHERE e.id = o.execution_id
                 AND e.started_at = o.execution_accepted_at
                 AND e.status = 'PENDING'
              RETURNING e.id
            ),
            ledger AS (
              UPDATE studio_dispatch_ledger d
                 SET state = 'RUNNING', last_runner_sequence = ?, updated_at = now()
                FROM history h
               WHERE d.execution_id = h.id
              RETURNING d.execution_id
            )
            SELECT count(*) FROM ledger
            """,
            Integer.class,
            executionId,
            attemptId,
            admissionId,
            runnerInstanceId,
            runnerSequence,
            Timestamp.from(browserStartedAt),
            stepResultsJson,
            logsJson,
            logsTruncated,
            runtimeVersionsJson,
            runnerSequence);
    return applied == null ? 0 : applied;
  }

  /** Applies a {@code PROGRESS} report while the run is {@code RUNNING} (AC-21, AC-23). */
  public int applyProgress(
      UUID executionId,
      UUID attemptId,
      UUID admissionId,
      String runnerInstanceId,
      long runnerSequence,
      String stepResultsJson,
      String logsJson,
      boolean logsTruncated,
      String runtimeVersionsJson) {
    Integer applied =
        jdbc.queryForObject(
            """
            WITH owner AS (
              SELECT execution_id, execution_accepted_at
                FROM studio_dispatch_ledger
               WHERE execution_id = ?
                 AND attempt_id = ?
                 AND admission_id = ?
                 AND runner_instance_id = ?
                 AND last_runner_sequence < ?
                 AND state = 'RUNNING'
               FOR UPDATE
            ),
            history AS (
              UPDATE ui_test_executions e
                 SET step_results = CAST(? AS jsonb),
                     logs = CAST(? AS jsonb),
                     logs_truncated = ?,
                     runtime_versions = CAST(? AS jsonb),
                     snapshot_revision = e.snapshot_revision + 1
                FROM owner o
               WHERE e.id = o.execution_id
                 AND e.started_at = o.execution_accepted_at
                 AND e.status = 'RUNNING'
              RETURNING e.id
            ),
            ledger AS (
              UPDATE studio_dispatch_ledger d
                 SET last_runner_sequence = ?, updated_at = now()
                FROM history h
               WHERE d.execution_id = h.id
              RETURNING d.execution_id
            )
            SELECT count(*) FROM ledger
            """,
            Integer.class,
            executionId,
            attemptId,
            admissionId,
            runnerInstanceId,
            runnerSequence,
            stepResultsJson,
            logsJson,
            logsTruncated,
            runtimeVersionsJson,
            runnerSequence);
    return applied == null ? 0 : applied;
  }

  /**
   * Applies a {@code FINAL} report (AC-21, AC-23, AC-25).
   *
   * <p>The ledger moves {@code RUNNING → FINALIZING}, not straight to {@code DONE}: {@code
   * FINALIZING} is exactly the window in which the outcome is known and the evidence disposition is
   * not. {@link #closeFinalized(UUID)} closes it once evidence settles, and that closure is a
   * dispatch-state change with no visible snapshot change, so it bumps no revision.
   *
   * <p>{@code error_code} is written from the API's own vocabulary only; a runner-supplied code
   * never reaches this parameter (AC-16).
   *
   * <p><b>The one {@code ADMITTED} path</b> (Studio v1 WP4, ADR-002 §29): a run cancelled before
   * its browser reported a start sends its {@code FINAL} without a {@code STARTED}. It is applied
   * only when the ledger records a cancel, and the edge {@code ADMITTED → FINALIZING} exists in the
   * matrix for that case alone. Every other report still needs {@code RUNNING}.
   */
  public int applyFinal(
      UUID executionId,
      UUID attemptId,
      UUID admissionId,
      String runnerInstanceId,
      long runnerSequence,
      String status,
      String errorCode,
      Instant endedAt,
      Integer durationMs,
      String stepResultsJson,
      String logsJson,
      boolean logsTruncated,
      String runtimeVersionsJson,
      String videoKey,
      String videoStatus,
      String videoError,
      Boolean videoPartial,
      Instant videoExpiresAt,
      String manifestKey) {
    Integer applied =
        jdbc.queryForObject(
            """
            WITH owner AS (
              SELECT execution_id, execution_accepted_at, state
                FROM studio_dispatch_ledger
               WHERE execution_id = ?
                 AND attempt_id = ?
                 AND admission_id = ?
                 AND runner_instance_id = ?
                 AND last_runner_sequence < ?
                 AND (state = 'RUNNING'
                      OR (state = 'ADMITTED' AND cancel_requested_at IS NOT NULL))
               FOR UPDATE
            ),
            history AS (
              UPDATE ui_test_executions e
                 SET status = ?,
                     error_code = CAST(? AS varchar),
                     ended_at = CAST(? AS timestamptz),
                     duration_ms = CAST(? AS integer),
                     step_results = CAST(? AS jsonb),
                     logs = CAST(? AS jsonb),
                     logs_truncated = ?,
                     runtime_versions = CAST(? AS jsonb),
                     video_key = CAST(? AS text),
                     video_status = CAST(? AS varchar),
                     video_error = CAST(? AS text),
                     video_partial = CAST(? AS boolean),
                     video_expires_at = CAST(? AS timestamptz),
                     snapshot_revision = e.snapshot_revision + 1
                FROM owner o
               WHERE e.id = o.execution_id
                 AND e.started_at = o.execution_accepted_at
                 AND (e.status = 'RUNNING' OR (e.status = 'PENDING' AND o.state = 'ADMITTED'))
              RETURNING e.id
            ),
            ledger AS (
              UPDATE studio_dispatch_ledger d
                 SET state = 'FINALIZING', last_runner_sequence = ?,
                     manifest_key = CAST(? AS text),
                     updated_at = now()
                FROM history h
               WHERE d.execution_id = h.id
              RETURNING d.execution_id
            )
            SELECT count(*) FROM ledger
            """,
            Integer.class,
            executionId,
            attemptId,
            admissionId,
            runnerInstanceId,
            runnerSequence,
            status,
            errorCode,
            endedAt == null ? null : Timestamp.from(endedAt),
            durationMs,
            stepResultsJson,
            logsJson,
            logsTruncated,
            runtimeVersionsJson,
            videoKey,
            videoStatus,
            videoError,
            videoPartial,
            videoExpiresAt == null ? null : Timestamp.from(videoExpiresAt),
            runnerSequence,
            manifestKey);
    return applied == null ? 0 : applied;
  }

  /**
   * Settles evidence on an already-finalized execution without touching the outcome (AC-25).
   *
   * <p>{@code status} and {@code error_code} are absent from the {@code SET} list, which is the
   * criterion: an upload failure never overwrites a known assertion outcome. The revision moves,
   * because {@code streamComplete} flipping is a visible change.
   */
  public int settleEvidence(
      UUID executionId,
      UUID attemptId,
      UUID admissionId,
      String runnerInstanceId,
      long runnerSequence,
      String videoKey,
      String videoStatus,
      String videoError,
      Boolean videoPartial,
      Instant videoExpiresAt,
      String logsJson,
      boolean logsTruncated) {
    Integer applied =
        jdbc.queryForObject(
            """
            WITH owner AS (
              SELECT execution_id, execution_accepted_at
                FROM studio_dispatch_ledger
               WHERE execution_id = ?
                 AND attempt_id = ?
                 AND admission_id = ?
                 AND runner_instance_id = ?
                 AND last_runner_sequence < ?
                 AND state = 'FINALIZING'
               FOR UPDATE
            ),
            history AS (
              UPDATE ui_test_executions e
                 SET video_key = ?,
                     video_status = ?,
                     video_error = ?,
                     video_partial = ?,
                     video_expires_at = ?,
                     logs = CAST(? AS jsonb),
                     logs_truncated = ?,
                     snapshot_revision = e.snapshot_revision + 1
                FROM owner o
               WHERE e.id = o.execution_id
                 AND e.started_at = o.execution_accepted_at
                 AND e.status IN ('PASSED', 'FAILED', 'ERROR')
              RETURNING e.id
            ),
            ledger AS (
              UPDATE studio_dispatch_ledger d
                 SET last_runner_sequence = ?, updated_at = now()
                FROM history h
               WHERE d.execution_id = h.id
              RETURNING d.execution_id
            )
            SELECT count(*) FROM ledger
            """,
            Integer.class,
            executionId,
            attemptId,
            admissionId,
            runnerInstanceId,
            runnerSequence,
            videoKey,
            videoStatus,
            videoError,
            videoPartial,
            videoExpiresAt == null ? null : Timestamp.from(videoExpiresAt),
            logsJson,
            logsTruncated,
            runnerSequence);
    return applied == null ? 0 : applied;
  }

  /**
   * The cancel compare-and-set (Studio v1 WP4, ADR-002 §29). One statement, and its result is the
   * verdict.
   *
   * <p>The predicate is the whole precondition: the row is not terminal, has not reached {@code
   * FINALIZING} (its outcome is already known, so there is nothing left to cancel), and carries no
   * earlier request — which is what makes a second cancel match nothing and answer {@code 409}.
   *
   * <ul>
   *   <li><b>{@code QUEUED} or {@code CLAIMED}</b> — nothing was sent, so the execution is closed
   *       here and now: history {@code ERROR / CANCELLED} with its revision bumped, ledger {@code
   *       DONE}. A dispatcher holding the claim then fails its own {@code beginDispatch}, so no
   *       runner is ever called for it.
   *   <li><b>{@code DISPATCHING}, {@code ADMITTED} or {@code RUNNING}</b> — only the request is
   *       recorded. The admission CAS refuses a marked row, the dispatcher relays the rest to the
   *       runner, and the running reaper closes whatever nobody finished. The public snapshot does
   *       not change, so no revision is spent.
   * </ul>
   *
   * @return the ledger state after the statement — {@code DONE} when the execution was closed, the
   *     unchanged dispatched state when the request was recorded — or empty when nothing matched
   */
  public Optional<String> requestCancel(UUID executionId, String principal, Instant now) {
    List<String> states =
        jdbc.queryForList(
            """
            WITH target AS (
              SELECT execution_id, execution_accepted_at, state
                FROM studio_dispatch_ledger
               WHERE execution_id = ?
                 AND state IN ('QUEUED', 'CLAIMED', 'DISPATCHING', 'ADMITTED', 'RUNNING')
                 AND cancel_requested_at IS NULL
               FOR UPDATE
            ),
            history AS (
              UPDATE ui_test_executions e
                 SET status = 'ERROR',
                     error_code = 'CANCELLED',
                     ended_at = COALESCE(e.ended_at, CAST(? AS timestamptz)),
                     snapshot_revision = e.snapshot_revision + 1
                FROM target t
               WHERE e.id = t.execution_id
                 AND e.started_at = t.execution_accepted_at
                 AND t.state IN ('QUEUED', 'CLAIMED')
                 AND e.status = 'PENDING'
              RETURNING e.id
            ),
            ledger AS (
              UPDATE studio_dispatch_ledger d
                 SET cancel_requested_at = CAST(? AS timestamptz),
                     cancel_requested_by = ?,
                     state = CASE
                               WHEN EXISTS (SELECT 1 FROM history h WHERE h.id = d.execution_id)
                               THEN 'DONE'
                               ELSE d.state
                             END,
                     updated_at = now()
                FROM target t
               WHERE d.execution_id = t.execution_id
                 AND (t.state IN ('DISPATCHING', 'ADMITTED', 'RUNNING')
                      OR EXISTS (SELECT 1 FROM history h WHERE h.id = t.execution_id))
              RETURNING d.state
            )
            SELECT state FROM ledger
            """,
            String.class,
            executionId,
            Timestamp.from(now),
            Timestamp.from(now),
            principal);
    return states.isEmpty() ? Optional.empty() : Optional.of(states.get(0));
  }

  /** True when a cancel has been recorded for this execution. The column is write-once. */
  public boolean isCancelRequested(UUID executionId) {
    Integer count =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM studio_dispatch_ledger
             WHERE execution_id = ? AND cancel_requested_at IS NOT NULL
            """,
            Integer.class,
            executionId);
    return count != null && count > 0;
  }

  /**
   * Marked rows whose run the runner holds and has not yet acknowledged a relayed cancel for.
   *
   * <p>{@code DISPATCHING} is absent on purpose: a row that has not been admitted holds no run on
   * any runner, and the admission CAS already refuses it. Only {@code ADMITTED} and {@code RUNNING}
   * rows have something to stop.
   */
  public List<UUID> findCancelsToRelay(int limit) {
    return jdbc.queryForList(
        """
        SELECT execution_id FROM studio_dispatch_ledger
         WHERE cancel_requested_at IS NOT NULL
           AND cancel_relayed_at IS NULL
           AND state IN ('ADMITTED', 'RUNNING')
         ORDER BY cancel_requested_at
         LIMIT ?
        """,
        UUID.class,
        limit);
  }

  /**
   * Records that the runner acknowledged the relayed cancel, so no later pass sends it again.
   * Conditional on a request existing and no acknowledgement yet: a racing second relay records
   * nothing.
   */
  public int markCancelRelayed(UUID executionId, Instant now) {
    return jdbc.update(
        """
        UPDATE studio_dispatch_ledger
           SET cancel_relayed_at = ?, updated_at = now()
         WHERE execution_id = ?
           AND cancel_requested_at IS NOT NULL
           AND cancel_relayed_at IS NULL
        """,
        Timestamp.from(now),
        executionId);
  }

  /**
   * Cancelled rows nobody finished: requested at or before {@code requestedBy} and still
   * dispatched. The running reaper closes them {@code ERROR / CANCELLED} (ADR-002 §29).
   */
  public List<UUID> findUnfinishedCancels(Instant requestedBy, int limit) {
    return jdbc.queryForList(
        """
        SELECT execution_id FROM studio_dispatch_ledger
         WHERE cancel_requested_at IS NOT NULL
           AND cancel_requested_at <= ?
           AND state IN ('DISPATCHING', 'ADMITTED', 'RUNNING')
         ORDER BY cancel_requested_at
         LIMIT ?
        """,
        UUID.class,
        Timestamp.from(requestedBy),
        limit);
  }

  /** Closes a finalized row once outcome and evidence are both settled. Bumps no revision. */
  public int closeFinalized(UUID executionId) {
    return transition(executionId, DispatchState.FINALIZING, DispatchState.DONE);
  }

  /**
   * Terminates an execution with an API-assigned error code (AC-11, AC-13a, AC-15, AC-29, AC-30).
   *
   * <p>One statement: the ledger row is closed and the history row is written terminal with its
   * revision incremented, both conditional on the row still being non-terminal. A second pass
   * therefore changes nothing and bumps no revision, which is the reapers' and the kill switch's
   * idempotency.
   *
   * <p>The ledger close is derived from the history write rather than from the row lock alone, so
   * that an execution whose outcome is <em>already</em> settled cannot be silently closed without
   * its evidence being settled too. That is a structural guarantee rather than a matter of which
   * query happened to select the row.
   */
  public int closeWithError(UUID executionId, String errorCode, Instant endedAt) {
    return close(executionId, errorCode, endedAt, false);
  }

  /**
   * {@link #closeWithError}, for the reapers: a row whose cancel has been recorded is closed {@code
   * ERROR / CANCELLED} whatever {@code errorCode} the reaper would otherwise name it (Studio v1
   * WP16). The user asked for the run to stop, and it stopped; a {@code START_TIMEOUT}, {@code
   * STALE} or {@code DISPATCH_UNKNOWN} on a row the user cancelled would report a fault nobody saw.
   *
   * <p>The choice is made inside the statement, against the row it has locked, so a cancel recorded
   * between the reaper's selection and its close still decides the code. A separate read would
   * leave exactly that window open.
   */
  public int closeByReaper(UUID executionId, String errorCode, Instant endedAt) {
    return close(executionId, errorCode, endedAt, true);
  }

  private int close(
      UUID executionId, String errorCode, Instant endedAt, boolean cancelledIfRequested) {
    Integer applied =
        jdbc.queryForObject(
            """
            WITH owner AS (
              SELECT execution_id, execution_accepted_at, state, cancel_requested_at
                FROM studio_dispatch_ledger
               WHERE execution_id = ?
                 AND state <> 'DONE'
               FOR UPDATE
            ),
            history AS (
              UPDATE ui_test_executions e
                 SET status = 'ERROR',
                     error_code = CASE
                                    WHEN ? AND o.cancel_requested_at IS NOT NULL THEN 'CANCELLED'
                                    ELSE CAST(? AS varchar)
                                  END,
                     ended_at = COALESCE(e.ended_at, CAST(? AS timestamptz)),
                     snapshot_revision = e.snapshot_revision + 1
                FROM owner o
               WHERE e.id = o.execution_id
                 AND e.started_at = o.execution_accepted_at
                 AND e.status IN ('PENDING', 'RUNNING')
              RETURNING e.id
            ),
            ledger AS (
              UPDATE studio_dispatch_ledger d
                 SET state = 'DONE', updated_at = now()
                FROM owner o, history h
               WHERE d.execution_id = o.execution_id
                 AND h.id = o.execution_id
                 AND (o.state, 'DONE') IN
            """
                + TRANSITION_MATRIX
                + """
              RETURNING d.execution_id
            )
            SELECT count(*) FROM ledger
            """,
            Integer.class,
            executionId,
            cancelledIfRequested,
            errorCode,
            Timestamp.from(endedAt));
    return applied == null ? 0 : applied;
  }

  /**
   * Applies a reconciled terminal outcome read from the result manifest (AC-31).
   *
   * <p>One statement, and every precondition is in it: the ledger row is still non-terminal and the
   * history row is still un-finalized. That is what makes "the manifest wins <b>before</b>
   * finalization and loses <b>after</b> it" a property of the statement rather than of the order in
   * which two services happened to run.
   *
   * <p>{@code error_code} is the API's own vocabulary; a manifest-supplied runner code is recorded
   * in the diagnostic text and never here, exactly as for a delivered report (AC-16).
   */
  public int applyReconciledOutcome(
      UUID executionId,
      String status,
      String errorCode,
      Instant endedAt,
      String videoKey,
      String videoStatus,
      Instant videoExpiresAt) {
    Integer applied =
        jdbc.queryForObject(
            """
            WITH owner AS (
              SELECT execution_id, execution_accepted_at
                FROM studio_dispatch_ledger
               WHERE execution_id = ?
                 AND state <> 'DONE'
               FOR UPDATE
            ),
            history AS (
              UPDATE ui_test_executions e
                 SET status = ?,
                     error_code = CAST(? AS varchar),
                     ended_at = COALESCE(e.ended_at, CAST(? AS timestamptz)),
                     video_key = COALESCE(e.video_key, CAST(? AS text)),
                     video_status = COALESCE(e.video_status, CAST(? AS varchar)),
                     video_expires_at = COALESCE(e.video_expires_at, CAST(? AS timestamptz)),
                     snapshot_revision = e.snapshot_revision + 1
                FROM owner o
               WHERE e.id = o.execution_id
                 AND e.started_at = o.execution_accepted_at
                 AND e.status IN ('PENDING', 'RUNNING')
              RETURNING e.id
            ),
            ledger AS (
              UPDATE studio_dispatch_ledger d
                 SET state = 'DONE', updated_at = now()
                FROM history h
               WHERE d.execution_id = h.id
              RETURNING d.execution_id
            )
            SELECT count(*) FROM ledger
            """,
            Integer.class,
            executionId,
            status,
            errorCode,
            endedAt == null ? null : Timestamp.from(endedAt),
            videoKey,
            videoStatus,
            videoExpiresAt == null ? null : Timestamp.from(videoExpiresAt));
    return applied == null ? 0 : applied;
  }

  /**
   * Settles evidence on a finalized execution from the reaper side, <b>preserving the check
   * outcome</b> (AC-30).
   *
   * <p>{@code status} and {@code error_code} are absent from the {@code SET} list. An evidence
   * deadline passing is not a verdict about whether the test passed, and the one implementation
   * that would quietly make it one is the implementation this statement's shape rules out.
   *
   * <p>The revision moves, because {@code streamComplete} flipping is a visible change (AC-23) —
   * and the guard makes the write idempotent: once evidence is no longer {@code PROCESSING}, a
   * second pass matches nothing and bumps nothing.
   */
  public int settleEvidenceByReaper(UUID executionId, String videoStatus, String videoError) {
    Integer applied =
        jdbc.queryForObject(
            """
            WITH owner AS (
              SELECT execution_id, execution_accepted_at
                FROM studio_dispatch_ledger
               WHERE execution_id = ?
                 AND state <> 'DONE'
               FOR UPDATE
            ),
            history AS (
              UPDATE ui_test_executions e
                 SET video_status = ?,
                     video_error = CAST(? AS text),
                     snapshot_revision = e.snapshot_revision + 1
                FROM owner o
               WHERE e.id = o.execution_id
                 AND e.started_at = o.execution_accepted_at
                 AND e.status IN ('PASSED', 'FAILED', 'ERROR')
                 AND (e.video_status IS NULL OR e.video_status = 'PROCESSING')
              RETURNING e.id
            ),
            ledger AS (
              UPDATE studio_dispatch_ledger d
                 SET state = 'DONE', updated_at = now()
                FROM history h
               WHERE d.execution_id = h.id
              RETURNING d.execution_id
            )
            SELECT count(*) FROM ledger
            """,
            Integer.class,
            executionId,
            videoStatus,
            videoError);
    return applied == null ? 0 : applied;
  }

  /**
   * Rows the <b>pending</b> reaper may act on (AC-29): {@code QUEUED} or {@code CLAIMED} with an
   * expired lease. {@code DISPATCHING} is absent from this query by construction — a row that
   * reached it may already have started a browser, whatever its lease says.
   */
  public List<UUID> findReclaimable(Instant now, int limit) {
    return jdbc.queryForList(
        """
        SELECT execution_id FROM studio_dispatch_ledger
         WHERE state IN ('QUEUED', 'CLAIMED')
           AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
         ORDER BY execution_accepted_at
         LIMIT ?
        """,
        UUID.class,
        Timestamp.from(now),
        limit);
  }

  /** Non-terminal rows past their pending deadline, in any pre-admission state (AC-29). */
  public List<UUID> findPastPendingDeadline(Instant now, int limit) {
    return jdbc.queryForList(
        """
        SELECT execution_id FROM studio_dispatch_ledger
         WHERE state IN ('QUEUED', 'CLAIMED', 'DISPATCHING')
           AND pending_deadline_at IS NOT NULL
           AND pending_deadline_at <= ?
         ORDER BY execution_accepted_at
         LIMIT ?
        """,
        UUID.class,
        Timestamp.from(now),
        limit);
  }

  /**
   * Admitted rows past their start deadline — the index V13 built for exactly this (AC-30).
   *
   * <p>A row with a recorded cancel is excluded (Studio v1 WP16): {@link #findUnfinishedCancels}
   * owns it, on the cancel budget's margin rather than the start deadline, so the start deadline
   * can neither close it before a healthy runner has finished stopping nor name it START_TIMEOUT.
   */
  public List<UUID> findPastStartDeadline(Instant now, int limit) {
    return jdbc.queryForList(
        """
        SELECT execution_id FROM studio_dispatch_ledger
         WHERE state = 'ADMITTED'
           AND start_deadline_at IS NOT NULL
           AND start_deadline_at <= ?
           AND cancel_requested_at IS NULL
         ORDER BY start_deadline_at
         LIMIT ?
        """,
        UUID.class,
        Timestamp.from(now),
        limit);
  }

  /**
   * Running rows past their total runtime deadline (AC-30). Heartbeats never move this. A row with
   * a recorded cancel is excluded for the same reason as {@link #findPastStartDeadline}.
   */
  public List<UUID> findPastRunDeadline(Instant now, int limit) {
    return jdbc.queryForList(
        """
        SELECT execution_id FROM studio_dispatch_ledger
         WHERE state = 'RUNNING'
           AND run_deadline_at IS NOT NULL
           AND run_deadline_at <= ?
           AND cancel_requested_at IS NULL
         ORDER BY run_deadline_at
         LIMIT ?
        """,
        UUID.class,
        Timestamp.from(now),
        limit);
  }

  /** Outcome known, evidence still unsettled past its deadline (AC-30, third condition). */
  public List<UUID> findEvidenceUnsettled(Instant now, int limit) {
    return jdbc.queryForList(
        """
        SELECT l.execution_id
          FROM studio_dispatch_ledger l
          JOIN ui_test_executions e
            ON e.id = l.execution_id AND e.started_at = l.execution_accepted_at
         WHERE l.state = 'FINALIZING'
           AND e.status IN ('PASSED', 'FAILED', 'ERROR')
           AND (e.video_status IS NULL OR e.video_status = 'PROCESSING')
           AND l.run_deadline_at IS NOT NULL
           AND l.run_deadline_at <= ?
         ORDER BY l.run_deadline_at
         LIMIT ?
        """,
        UUID.class,
        Timestamp.from(now),
        limit);
  }

  /** The ledger row, or empty. Used for diagnostics and for classifying a zero-row verdict. */
  public Optional<Map<String, Object>> find(UUID executionId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            "SELECT * FROM studio_dispatch_ledger WHERE execution_id = ?", executionId);
    return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
  }

  /**
   * True when this exact identity has already had this exact sequence applied (AC-21). A
   * re-delivered, byte-identical report is the same owner obeying the retry-until-acknowledged rule
   * the API itself imposed, so it is answered {@code 200} applying nothing — never {@code 409},
   * which on these routes means a <em>competing</em> party and makes the runner stop and audit.
   */
  public boolean isAlreadyApplied(
      UUID executionId,
      UUID attemptId,
      UUID admissionId,
      String runnerInstanceId,
      long runnerSequence) {
    Integer count =
        jdbc.queryForObject(
            """
            SELECT count(*) FROM studio_dispatch_ledger
             WHERE execution_id = ?
               AND attempt_id = ?
               AND admission_id = ?
               AND runner_instance_id = ?
               AND last_runner_sequence = ?
            """,
            Integer.class,
            executionId,
            attemptId,
            admissionId,
            runnerInstanceId,
            runnerSequence);
    return count != null && count > 0;
  }
}
