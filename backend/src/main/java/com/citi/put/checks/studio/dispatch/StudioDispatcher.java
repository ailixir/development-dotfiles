package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.UITestRevisionRepository;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The dispatcher (AC-12 – AC-16).
 *
 * <p>The ordering here is the reliability guarantee, and each step is a separate transaction on
 * purpose:
 *
 * <ol>
 *   <li><b>Claim.</b> One conditional {@code UPDATE} whose {@code WHERE} carries {@code state =
 *       'QUEUED'} and an expired-or-absent lease. Two dispatchers racing one row produce exactly
 *       one {@code 1}.
 *   <li><b>Recheck and resolve, immediately before the send and after the claim.</b> Authorization
 *       and reference availability are re-verified and reference values are resolved then and only
 *       then. Values are ephemeral: they live inside a try-with-resources and are erased on every
 *       exit path including the error path, and they are written to no ledger column, no history
 *       row, no log line, no retry buffer, no manifest and no SSE payload.
 *   <li><b>Commit {@code DISPATCHING} and a fresh attempt id, then send.</b> The commit is a
 *       transaction of its own and it closes before the HTTP call begins, so a second connection
 *       can observe the committed row while the runner client is still blocked. An {@code
 *       attempt_id} is never reused across attempts.
 *   <li><b>Classify.</b> Exactly three outcomes and no fourth (AC-15). An ambiguous outcome is not
 *       permission to resend: the row stays {@code DISPATCHING} and recovery resolves it.
 * </ol>
 *
 * <p>If the process dies between the commit in step 3 and the send, §5.1 explicitly permits the
 * outcome to end as <em>unknown</em> rather than risk duplicate effects. Ending as unknown is the
 * correct answer there; a "fix" that replays it is the failure.
 */
@Component
public class StudioDispatcher {

  private static final Logger LOGGER = LoggerFactory.getLogger(StudioDispatcher.class);

  private final StudioDispatchLedgerStatements statements;
  private final UITestRevisionRepository revisions;
  private final DispatchAuthorization authorization;
  private final StudioReferenceResolver references;
  private final RunnerDispatchClient runnerClient;
  private final StudioExecutionProperties properties;
  private final ObjectMapper objectMapper;
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transactions;
  private final String callbackBaseUrl;
  private final String instanceId;
  private final Clock clock;

  @Autowired
  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioDispatcher(
      StudioDispatchLedgerStatements statements,
      UITestRevisionRepository revisions,
      DispatchAuthorization authorization,
      StudioReferenceResolver references,
      RunnerDispatchClient runnerClient,
      StudioExecutionProperties properties,
      ObjectMapper objectMapper,
      JdbcTemplate jdbc,
      TransactionTemplate transactions,
      @Value("${studio.execution.callback-base-url:http://put-checks-api:8080}")
          String callbackBaseUrl) {
    this(
        statements,
        revisions,
        authorization,
        references,
        runnerClient,
        properties,
        objectMapper,
        jdbc,
        transactions,
        callbackBaseUrl,
        "dispatcher-" + UUID.randomUUID(),
        Clock.systemUTC());
  }

  @SuppressWarnings("checkstyle:ParameterNumber")
  StudioDispatcher(
      StudioDispatchLedgerStatements statements,
      UITestRevisionRepository revisions,
      DispatchAuthorization authorization,
      StudioReferenceResolver references,
      RunnerDispatchClient runnerClient,
      StudioExecutionProperties properties,
      ObjectMapper objectMapper,
      JdbcTemplate jdbc,
      TransactionTemplate transactions,
      String callbackBaseUrl,
      String instanceId,
      Clock clock) {
    this.statements = statements;
    this.revisions = revisions;
    this.authorization = authorization;
    this.references = references;
    this.runnerClient = runnerClient;
    this.properties = properties;
    this.objectMapper = objectMapper;
    this.jdbc = jdbc;
    this.transactions = transactions;
    this.callbackBaseUrl = callbackBaseUrl;
    this.instanceId = instanceId;
    this.clock = clock;
  }

  /** This dispatcher's lease owner, stable for the life of the bean. */
  public String instanceId() {
    return instanceId;
  }

  /** One pass. Returns how many rows it dispatched. */
  public int dispatchOnce() {
    if (!properties.enabledOrDefault()) {
      return closeUndispatchedWork();
    }
    int dispatched = 0;
    for (UUID executionId : queuedBatch()) {
      if (dispatch(executionId)) {
        dispatched++;
      }
    }
    return dispatched;
  }

  /**
   * The kill switch's second property (AC-11): queued undispatched work is closed
   * <em>explicitly</em> rather than left to a deadline. Admitted, running and finalizing rows are
   * untouched and their reports are still accepted and applied. The closure is idempotent, so a
   * second pass changes nothing and bumps no revision, and re-enabling does not resurrect a closed
   * row.
   */
  public int closeUndispatchedWork() {
    List<UUID> undispatched =
        jdbc.queryForList(
            """
            SELECT execution_id FROM studio_dispatch_ledger
             WHERE state IN ('QUEUED', 'CLAIMED')
             ORDER BY execution_accepted_at
             LIMIT ?
            """,
            UUID.class,
            properties.dispatcherOrDefault().batchSizeOrDefault());
    int closed = 0;
    for (UUID executionId : undispatched) {
      Integer applied =
          transactions.execute(
              status ->
                  statements.closeWithError(
                      executionId, ExecutionErrorCode.DISPATCH_DISABLED, clock.instant()));
      if (applied != null && applied == 1) {
        closed++;
      }
    }
    return closed;
  }

  /** Dispatches one execution. Returns true when a send left the process. */
  public boolean dispatch(UUID executionId) {
    Instant now = clock.instant();
    Instant leaseExpiresAt = now.plus(properties.dispatcherOrDefault().leaseOrDefault());

    Integer claimed =
        transactions.execute(
            status -> statements.claim(executionId, instanceId, leaseExpiresAt, now));
    if (claimed == null || claimed != 1) {
      return false;
    }

    Map<String, Object> row = statements.find(executionId).orElse(null);
    if (row == null) {
      return false;
    }
    UUID testId = (UUID) row.get("test_id");
    String csiId = String.valueOf(row.get("csi_id"));
    String principal = (String) row.get("principal");
    Instant pendingDeadline = instant(row.get("pending_deadline_at"));

    if (pendingDeadline != null && !pendingDeadline.isAfter(now)) {
      close(executionId, ExecutionErrorCode.DISPATCH_FAILED, now);
      return false;
    }

    String policyIdentity;
    try {
      policyIdentity = authorization.recheck(executionId, testId, csiId, principal);
    } catch (DispatchAuthorization.AuthorizationRevokedException e) {
      // A revoked permission is terminal with an explicit code, never a retry and never a skip.
      LOGGER.warn("Studio dispatch refused for execution {}: {}", executionId, e.getMessage());
      close(executionId, ExecutionErrorCode.AUTHORIZATION_REVOKED, now);
      return false;
    }

    UUID revisionId = revisionIdOf(executionId);
    List<String> referenceNames = referenceNames(revisionId);

    UUID attemptId = UUID.randomUUID();
    DispatchOutcome outcome;
    // Resolution happens here and nowhere else, and the values never leave this block.
    try (StudioReferenceResolver.Resolved resolved = references.resolve(csiId, referenceNames)) {
      recordDispatchPolicy(executionId, policyIdentity);

      Integer began =
          transactions.execute(
              status -> statements.beginDispatch(executionId, instanceId, attemptId));
      if (began == null || began != 1) {
        return false;
      }
      // The transaction above has committed. The send happens strictly after it, so a crash here
      // leaves a committed attempt with no send — which §5.1 permits to end as unknown rather
      // than be replayed into a duplicate browser.
      outcome =
          runnerClient.send(
              new RunJob(
                  executionId,
                  attemptId,
                  testId,
                  csiId,
                  revisionId,
                  environmentOf(executionId),
                  referenceNames,
                  callbackBaseUrl));
    } catch (StudioReferenceResolver.ReferenceUnavailableException e) {
      LOGGER.warn("Studio dispatch refused for execution {}: {}", executionId, e.getMessage());
      close(executionId, ExecutionErrorCode.REFERENCE_UNAVAILABLE, now);
      return false;
    }

    applyOutcome(executionId, attemptId, outcome, pendingDeadline, now);
    return true;
  }

  /**
   * The three outcomes (AC-15). The ambiguous branch deliberately does nothing at all: no second
   * send, no second attempt, no state change. The row stays {@code DISPATCHING} and recovery owns
   * it.
   */
  private void applyOutcome(
      UUID executionId,
      UUID attemptId,
      DispatchOutcome outcome,
      Instant pendingDeadline,
      Instant now) {
    switch (outcome.kind()) {
      case ACCEPTED -> {
        // Nothing to write: the admission CAS is the next durable step and the runner owns it.
      }
      case DEFINITE_REFUSAL -> {
        boolean withinDeadline = pendingDeadline == null || pendingDeadline.isAfter(now);
        if (outcome.retryable() && withinDeadline) {
          // Back to QUEUED with the attempt cleared, so the next send carries a fresh attempt_id.
          transactions.execute(
              status -> statements.returnAfterDefiniteRefusal(executionId, attemptId));
        } else {
          close(executionId, ExecutionErrorCode.DISPATCH_FAILED, now);
        }
      }
      case AMBIGUOUS ->
          LOGGER.warn(
              "Studio dispatch for execution {} attempt {} is ambiguous ({}); it is NOT resent and "
                  + "recovery will resolve it against admission, progress and manifest state",
              executionId,
              attemptId,
              outcome.detail());
      default -> throw new IllegalStateException("Unclassified dispatch outcome");
    }
  }

  private void close(UUID executionId, String errorCode, Instant now) {
    transactions.execute(status -> statements.closeWithError(executionId, errorCode, now));
  }

  private List<UUID> queuedBatch() {
    Instant now = clock.instant();
    return jdbc.queryForList(
        """
        SELECT execution_id FROM studio_dispatch_ledger
         WHERE state = 'QUEUED'
           AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
         ORDER BY execution_accepted_at
         LIMIT ?
        """,
        UUID.class,
        Timestamp.from(now),
        properties.dispatcherOrDefault().batchSizeOrDefault());
  }

  /** Declared names from the confirmed revision. Never values; there are none to read here. */
  private List<String> referenceNames(UUID revisionId) {
    if (revisionId == null) {
      return List.of();
    }
    Optional<UITestRevision> revision = revisions.findById(revisionId);
    return revision
        .map(value -> ExecutionReferences.declaredNames(objectMapper, value.getReferences()))
        .orElse(List.of());
  }

  private String environmentOf(UUID executionId) {
    List<String> found =
        jdbc.queryForList(
            """
            SELECT e.environment
              FROM ui_test_executions e
              JOIN studio_dispatch_ledger l
                ON l.execution_id = e.id AND l.execution_accepted_at = e.started_at
             WHERE l.execution_id = ?
            """,
            String.class,
            executionId);
    return found.isEmpty() ? null : found.get(0);
  }

  private UUID revisionIdOf(UUID executionId) {
    List<UUID> found =
        jdbc.queryForList(
            """
            SELECT e.revision_id
              FROM ui_test_executions e
              JOIN studio_dispatch_ledger l
                ON l.execution_id = e.id AND l.execution_accepted_at = e.started_at
             WHERE l.execution_id = ?
            """,
            UUID.class,
            executionId);
    return found.isEmpty() ? null : found.get(0);
  }

  /**
   * Records which policy identity this dispatch ran under (AC-13b).
   *
   * <p>It is written into the execution's own configuration snapshot rather than onto the job body,
   * because putting an approved-target or secret-use policy on the job is a field on a closed
   * runner-consumed body — ADR-002 §12 Class B, architect-first — and O-6 has not been ruled. This
   * bumps no revision: it is not a visible change on the public snapshot.
   */
  private void recordDispatchPolicy(UUID executionId, String policyIdentity) {
    jdbc.update(
        """
        UPDATE ui_test_executions e
           SET configuration_snapshot =
                 COALESCE(e.configuration_snapshot, '{}'::jsonb)
                 || jsonb_build_object('dispatchPolicyIdentity', CAST(? AS text))
          FROM studio_dispatch_ledger l
         WHERE l.execution_id = ?
           AND e.id = l.execution_id
           AND e.started_at = l.execution_accepted_at
           AND e.status = 'PENDING'
        """,
        policyIdentity,
        executionId);
  }

  private static Instant instant(Object value) {
    if (value == null) {
      return null;
    }
    if (value instanceof Timestamp timestamp) {
      return timestamp.toInstant();
    }
    if (value instanceof java.time.OffsetDateTime offset) {
      return offset.toInstant();
    }
    return Instant.parse(String.valueOf(value));
  }
}
