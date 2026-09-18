package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.UITestRevisionRepository;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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
 *       one {@code 1}. A pass selects and claims in that same statement ({@link
 *       StudioDispatchLedgerStatements#claimQueued}, {@code FOR UPDATE SKIP LOCKED}), so two
 *       dispatchers draining one backlog take different rows instead of racing for the same ones.
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
 * <p><b>This dispatcher no longer holds a callback base URL.</b> §8.4 makes the callback
 * destination deployment configuration and <em>"never arbitrary job-supplied URL"</em>; the runner
 * reads its own {@code STUDIO_RUNNER_CALLBACK_BASE_URL} and keeps a {@code CALLBACK_SHAPED_KEYS}
 * list to refuse any job that tries to name one. Sending it was tripping that control from the
 * inside, so the field is gone rather than merely unread.
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
      TransactionTemplate transactions) {
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
    StudioExecutionProperties.Dispatcher budget = properties.dispatcherOrDefault();
    int batchSize = budget.batchSizeOrDefault();
    Set<UUID> attempted = new HashSet<>();
    int dispatched = 0;
    // One row per claim, immediately before its own dispatch: the lease clock of each row starts
    // when that row is taken, exactly as it did when the pass claimed ids one by one. Claiming the
    // whole batch up front would start every lease at the top of the pass, and a slow send ahead
    // of a row could expire that row's lease before it was ever attempted.
    for (int taken = 0; taken < batchSize; taken++) {
      Instant now = clock.instant();
      Instant leaseExpiresAt = now.plus(budget.leaseOrDefault());
      List<UUID> claimed =
          transactions.execute(
              status -> statements.claimQueued(instanceId, leaseExpiresAt, now, 1, attempted));
      if (claimed == null || claimed.isEmpty()) {
        break;
      }
      UUID executionId = claimed.get(0);
      attempted.add(executionId);
      if (dispatchClaimed(executionId, now)) {
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

  /** Claims and dispatches one named execution. Returns true when a send left the process. */
  public boolean dispatch(UUID executionId) {
    Instant now = clock.instant();
    Instant leaseExpiresAt = now.plus(properties.dispatcherOrDefault().leaseOrDefault());

    Integer claimed =
        transactions.execute(
            status -> statements.claim(executionId, instanceId, leaseExpiresAt, now));
    if (claimed == null || claimed != 1) {
      return false;
    }
    return dispatchClaimed(executionId, now);
  }

  /**
   * Everything after the claim, for a row this dispatcher has just claimed at {@code now}. Returns
   * true when a send left the process.
   */
  private boolean dispatchClaimed(UUID executionId, Instant now) {
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
    String environment = environmentOf(executionId);

    UITestRevision revision;
    ReferenceDeclarations declarations;
    try {
      revision = revisionId == null ? null : revisions.findById(revisionId).orElse(null);
      if (revision == null) {
        throw new ExecutionReferences.UnreadableReferenceDeclarationException(
            "the confirmed revision this execution snapshotted cannot be read");
      }
      declarations = ExecutionReferences.declared(objectMapper, revision.getReferences());
    } catch (ExecutionReferences.UnreadableReferenceDeclarationException e) {
      // Terminal, not an empty set. The previous `orElse(List.of())` made an unreadable revision a
      // run with no references and no secrets — for a login test, a browser opening a real
      // application with an empty password field. @po ruled the code REFERENCE_UNAVAILABLE
      // (ADR-002 §15.3: a fact about the draft and its environment). The message names the
      // declaration and never the revision's contents (AC-6, AC-10).
      LOGGER.warn("Studio dispatch refused for execution {}: {}", executionId, e.getMessage());
      close(executionId, ExecutionErrorCode.REFERENCE_UNAVAILABLE, now);
      return false;
    }

    UUID attemptId = UUID.randomUUID();
    DispatchOutcome outcome;
    // Resolution happens here and nowhere else, and the values leave this block only on the wire.
    try (StudioReferenceResolver.Resolved resolved =
        references.resolve(csiId, environment, principal, declarations)) {
      recordDispatchPolicy(executionId, policyIdentity, resolved.secretVersions());

      RunJob job;
      try {
        job = job(executionId, attemptId, testId, csiId, revision, declarations, resolved);
      } catch (IllegalStateException e) {
        // The revision's artifact or configuration document could not be read. Not a reference
        // condition, so it does not borrow a reference code; it is a dispatch that could not be
        // made. The message never carries the document.
        LOGGER.warn("Studio dispatch failed for execution {}: {}", executionId, e.getMessage());
        close(executionId, ExecutionErrorCode.DISPATCH_FAILED, now);
        return false;
      }

      Integer began =
          transactions.execute(
              status -> statements.beginDispatch(executionId, instanceId, attemptId));
      if (began == null || began != 1) {
        return false;
      }
      // The transaction above has committed. The send happens strictly after it, so a crash here
      // leaves a committed attempt with no send — which §5.1 permits to end as unknown rather
      // than be replayed into a duplicate browser.
      outcome = runnerClient.send(job);
    } catch (StudioReferenceResolver.SecretUseRevokedException e) {
      // A fact about the principal (ADR-002 §15.2). The send never happened.
      LOGGER.warn("Studio dispatch refused for execution {}: {}", executionId, e.getMessage());
      close(executionId, ExecutionErrorCode.AUTHORIZATION_REVOKED, now);
      return false;
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

  /**
   * Builds the fourteen-field job the frozen contract declares (§8.4, AC-2).
   *
   * <p>Every field has a source and none is invented: the artifact, its hash, the source lines and
   * the configuration come from the confirmed revision the execution snapshotted (§8.1); the CSI is
   * the execution's own immutable value (§9.1); the references are the revision's typed
   * declaration; the two resolved maps are this dispatch's resolution; the deadlines are §8.5's
   * starting values and the revision's own runtime budget, sent faithfully and clamped nowhere (the
   * clamp is the runner's, 10.13 AC-6); and the two keys are §6.2's templates over immutable
   * execution identity. Deriving a key is not writing an object — the objects are story 10.14's.
   *
   * <p>The resolved {@code char[]}s become {@link String}s here because a JSON body is text. That
   * is the residual AC-15 names rather than claims away: {@code Resolved.close()} still erases the
   * arrays on every exit path, and nothing in this process retains a path to the values after the
   * send, but the serializer's transient buffers cannot be erased by any code.
   */
  private RunJob job(
      UUID executionId,
      UUID attemptId,
      UUID testId,
      String csiId,
      UITestRevision revision,
      ReferenceDeclarations declarations,
      StudioReferenceResolver.Resolved resolved) {
    return new RunJob(
        executionId,
        attemptId,
        revision.getId(),
        revision.getArtifactHash(),
        document(revision.getArtifact(), "artifact"),
        LegacyStudioAdapter.parseSteps(revision.getSource()),
        document(revision.getConfiguration(), "configuration"),
        csiId,
        declarations,
        text(resolved.variables()),
        text(resolved.secrets()),
        deadlines(revision),
        RunJob.videoKeyFor(csiId, testId, executionId, attemptId),
        RunJob.manifestKeyFor(csiId, testId, executionId, attemptId));
  }

  /**
   * §8.5's admitted-start value and the revision's own browser runtime budget, sent faithfully.
   *
   * <p>Nothing is clamped here. {@code effectiveRuntimeCapMs(job.deadlines.totalRuntimeMs, maxima)}
   * is the runner's and stays there (10.13 AC-6); two clamps would be two derivations of one bound,
   * which is this epic's most-repeated defect.
   */
  private RunJob.JobDeadlines deadlines(UITestRevision revision) {
    long admittedStartMs = properties.startDeadlineOrDefault().toMillis();
    JsonNode configuration = document(revision.getConfiguration(), "configuration");
    long totalRuntimeMs = configuration.path("timeoutSeconds").asLong(0L) * 1000L;
    if (totalRuntimeMs <= 0) {
      throw new IllegalStateException(
          "the confirmed revision's configuration declares no usable runtime budget");
    }
    return new RunJob.JobDeadlines(admittedStartMs, totalRuntimeMs);
  }

  /** A stored revision document, read as JSON. The message never carries the document. */
  private JsonNode document(String json, String field) {
    if (json == null || json.isBlank()) {
      throw new IllegalStateException("the confirmed revision carries no '" + field + "' document");
    }
    try {
      JsonNode node = objectMapper.readTree(json);
      if (node == null || !node.isObject()) {
        throw new IllegalStateException(
            "the confirmed revision's '" + field + "' document is not an object");
      }
      return node;
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(
          "the confirmed revision's '" + field + "' document is not readable JSON");
    }
  }

  /** The wire form of a resolved map. See {@link #job} for the residual this creates. */
  private static Map<String, String> text(Map<String, char[]> values) {
    Map<String, String> text = new java.util.LinkedHashMap<>();
    values.forEach((name, value) -> text.put(name, new String(value)));
    return text;
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
  private void recordDispatchPolicy(
      UUID executionId, String policyIdentity, Map<String, String> secretVersions) {
    jdbc.update(
        """
        UPDATE ui_test_executions e
           SET configuration_snapshot =
                 COALESCE(e.configuration_snapshot, '{}'::jsonb)
                 || jsonb_build_object('dispatchPolicyIdentity', CAST(? AS text))
                 || jsonb_build_object('secretVaultVersions', CAST(? AS jsonb))
          FROM studio_dispatch_ledger l
         WHERE l.execution_id = ?
           AND e.id = l.execution_id
           AND e.started_at = l.execution_accepted_at
           AND e.status = 'PENDING'
        """,
        policyIdentity,
        versionsJson(secretVersions),
        executionId);
  }

  /**
   * The nonsecret vault version identifiers, as a jsonb document (§4.2, AC-8).
   *
   * <p>No migration: this rides {@code configuration_snapshot}'s jsonb exactly as 10.7's {@code
   * dispatchPolicyIdentity} does, so this story queues behind nothing. The identifiers are opaque
   * strings the provider supplies — never the value, never a hash of it, and never anything two
   * values could be compared with: rotating a value to itself still changes the identifier.
   */
  private String versionsJson(Map<String, String> secretVersions) {
    try {
      return objectMapper.writeValueAsString(secretVersions);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      // Reference ids and opaque identifiers; there is no shape of these that fails to serialize.
      throw new IllegalStateException("vault version identifiers could not be recorded");
    }
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
