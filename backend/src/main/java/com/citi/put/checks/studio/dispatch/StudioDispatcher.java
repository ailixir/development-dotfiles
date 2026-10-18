package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.UITestRevisionRepository;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.citi.put.checks.studio.secrets.VaultProviderUnavailableException;
import com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver.SecretTooLongException;
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
  private final RunnerDispatchClient runnerClient;
  private final StudioExecutionProperties properties;
  private final ObjectMapper objectMapper;
  private final JdbcTemplate jdbc;
  private final TransactionTemplate transactions;
  private final String instanceId;
  private final Clock clock;

  @Autowired(required = false)
  private com.citi.put.checks.studio.secrets.SecretAuditLifecycle secretAudit;

  @Autowired(required = false)
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observed;

  @Autowired
  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioDispatcher(
      StudioDispatchLedgerStatements statements,
      UITestRevisionRepository revisions,
      DispatchAuthorization authorization,
      RunnerDispatchClient runnerClient,
      StudioExecutionProperties properties,
      ObjectMapper objectMapper,
      JdbcTemplate jdbc,
      TransactionTemplate transactions) {
    this(
        statements,
        revisions,
        authorization,
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
    this.runnerClient = runnerClient;
    this.properties = properties;
    this.objectMapper = objectMapper;
    this.jdbc = jdbc;
    this.transactions = transactions;
    this.instanceId = instanceId;
    this.clock = clock;
  }

  void installSecretAudit(com.citi.put.checks.studio.secrets.SecretAuditLifecycle audit) {
    this.secretAudit = audit;
  }

  /** This dispatcher's lease owner, stable for the life of the bean. */
  public String instanceId() {
    return instanceId;
  }

  /**
   * One pass. Returns how many rows it dispatched.
   *
   * <p>The pass begins by relaying recorded cancels (Studio v1 WP4), whatever the kill switch says:
   * the switch stops new browser work, and a cancel only ever stops browser work that already
   * exists.
   */
  public int dispatchOnce() {
    relayCancels();
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
                  statements.closeUndispatchedWithError(
                      executionId, ExecutionErrorCode.DISPATCH_DISABLED, clock.instant()));
      if (applied != null && applied == 1) {
        closed++;
      }
    }
    return closed;
  }

  /**
   * Relays every recorded cancel whose run a runner holds and has not yet acknowledged (Studio v1
   * WP4, ADR-002 §29). Returns how many the runner acknowledged in this pass.
   *
   * <p>One {@code DELETE /v2/runs/{id}} per row per pass. An acknowledged relay — {@code 202}, or
   * {@code 409} for a run that had already finished — is recorded so no later pass repeats it. An
   * unacknowledged one is left for the next pass, because a {@code 404} can mean the request
   * reached a runner pod that does not hold the run; the running reaper bounds how long that goes
   * on by closing the cancel itself.
   *
   * <p>The relay never writes an outcome. The run ends when the runner's {@code FINAL} report lands
   * through the ordinary report path, or when the reaper closes it.
   */
  public int relayCancels() {
    int acknowledged = 0;
    for (UUID executionId :
        statements.findCancelsToRelay(properties.dispatcherOrDefault().batchSizeOrDefault())) {
      RunnerDispatchClient.CancelOutcome outcome = runnerClient.cancel(executionId);
      if (outcome != null && outcome.settled()) {
        Integer marked =
            transactions.execute(
                status -> statements.markCancelRelayed(executionId, clock.instant()));
        if (marked != null && marked == 1) {
          acknowledged++;
        }
      } else {
        LOGGER.info(
            "Studio cancel of execution {} not acknowledged by the runner ({}); the next pass "
                + "retries it",
            executionId,
            outcome);
      }
    }
    return acknowledged;
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
    // A cast, not String.valueOf: a NULL CSI must reach the recheck as null and be refused there.
    String csiId = (String) row.get("csi_id");
    String principal = (String) row.get("principal");
    Instant pendingDeadline = instant(row.get("pending_deadline_at"));

    if (pendingDeadline != null && !pendingDeadline.isAfter(now)) {
      close(executionId, ExecutionErrorCode.DISPATCH_FAILED, now);
      return false;
    }

    // AC-13a, §5.1.3: every claimed attempt (first dispatch, lease-expiry re-claim, post-outage
    // retry) is rechecked here, before the observed binding lookup, refreshRetry's grant minting,
    // any Vault read and any send. A revoked permission is terminal with an explicit code, never a
    // retry and never a skip. The returned policy identity is discarded: the observed binding's
    // currentPolicyHash is the recorded policy identity for this family.
    try {
      authorization.recheck(executionId, testId, csiId, principal);
    } catch (DispatchAuthorization.AuthorizationRevokedException e) {
      LOGGER.warn("Studio dispatch refused for execution {}: authorization revoked", executionId);
      close(executionId, ExecutionErrorCode.AUTHORIZATION_REVOKED, now);
      return false;
    }

    // One execution family (ADR-SC-005): every accepted execution carries an observed binding and
    // is replayed by the observed adapter. A row without one, or a deployment without the observed
    // replay beans, is closed rather than sent anywhere else.
    if (observed != null) {
      var binding = observed.binding(executionId);
      if (binding.isPresent()) {
        return dispatchObserved(executionId, binding.get(), now);
      }
    }
    LOGGER.warn(
        "Studio dispatch refused for execution {}: no observed replay binding is available",
        executionId);
    close(executionId, ExecutionErrorCode.DISPATCH_FAILED, now);
    return false;
  }

  private boolean dispatchObserved(
      UUID id, com.fasterxml.jackson.databind.JsonNode acceptedBinding, Instant now) {
    final JsonNode binding;
    try {
      binding = transactions.execute(status -> observed.refreshRetry(acceptedBinding, instanceId));
    } catch (RuntimeException refusal) {
      close(id, observedRefusalCode(refusal), now);
      return false;
    }
    UUID attempt = UUID.fromString(binding.path("attemptId").asText());
    boolean sendCommitted = false;
    try {
      UITestRevision revision =
          revisions.findById(UUID.fromString(binding.path("revisionId").asText())).orElseThrow();
      ReferenceDeclarations declared =
          ExecutionReferences.declared(objectMapper, revision.getReferences());
      try (var resolvedJob =
          observed.job(
              binding,
              plainVariablesOf(id, declared),
              secretId -> {
                if (secretAudit == null) {
                  throw new IllegalStateException("Missing secret read-entry audit");
                }
                transactions.executeWithoutResult(
                    status -> secretAudit.replayReadEntry(binding, instanceId, secretId));
              })) {
        RunJob job = resolvedJob.runJob();
        int began = beginResolvedObservedDispatch(binding, declared.secrets(), resolvedJob);
        if (began != 1) {
          return false;
        }
        sendCommitted = true;
        DispatchOutcome outcome = runnerClient.send(job);
        // STUDIO-OBS-014 AC-10: one audit event per replay dispatch attempt.
        com.citi.put.checks.studio.guided.audit.StudioActionAudit.replayDispatched(
            binding,
            switch (outcome.kind()) {
              case ACCEPTED ->
                  com.citi.put.checks.studio.guided.audit.StudioActionAudit.Outcome.DISPATCHED;
              case DEFINITE_REFUSAL ->
                  com.citi.put.checks.studio.guided.audit.StudioActionAudit.Outcome
                      .DISPATCH_REFUSED;
              case AMBIGUOUS ->
                  com.citi.put.checks.studio.guided.audit.StudioActionAudit.Outcome
                      .DISPATCH_UNKNOWN;
            });
        applyOutcome(
            id,
            attempt,
            outcome,
            instant(statements.find(id).orElseThrow().get("pending_deadline_at")),
            now);
        return true;
      }
    } catch (VaultProviderUnavailableException failure) {
      settleObservedFailure(binding, failure, null, now);
      return false;
    } catch (StudioReferenceResolver.SecretUseRevokedException failure) {
      settleObservedFailure(binding, failure, ExecutionErrorCode.AUTHORIZATION_REVOKED, now);
      return false;
    } catch (SecretTooLongException failure) {
      settleObservedFailure(binding, failure, ExecutionErrorCode.SECRET_TOO_LONG, now);
      return false;
    } catch (StudioReferenceResolver.ReferenceUnavailableException failure) {
      settleObservedFailure(binding, failure, ExecutionErrorCode.REFERENCE_UNAVAILABLE, now);
      return false;
    } catch (RuntimeException refusal) {
      if (sendCommitted) {
        return true;
      }
      settleObservedFailure(binding, refusal, observedRefusalCode(refusal), now);
      return false;
    }
  }

  /** Captures safe actual resolution facts before the caller erases a refused resolved job. */
  int beginResolvedObservedDispatch(
      JsonNode binding,
      List<String> declaredSecrets,
      com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization.ResolvedJob
          resolvedJob) {
    UUID id = UUID.fromString(binding.path("executionId").asText());
    UUID attempt = UUID.fromString(binding.path("attemptId").asText());
    try {
      Integer began =
          transactions.execute(
              status -> {
                observed.check(binding);
                int rows = statements.beginObservedDispatch(id, instanceId, attempt);
                if (rows == 1 && secretAudit != null) {
                  secretAudit.replayRelease(
                      binding,
                      declaredSecrets,
                      resolvedJob.resolved().secretVersions(),
                      com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome
                          .RESOLVED);
                }
                return rows;
              });
      return began == null ? 0 : began;
    } catch (RuntimeException refusal) {
      var decisions = new java.util.LinkedHashMap<String, StudioReferenceResolver.Decision>();
      resolvedJob
          .resolved()
          .secretVersions()
          .forEach(
              (secret, version) ->
                  decisions.put(
                      secret,
                      new StudioReferenceResolver.Decision(
                          StudioReferenceResolver.DecisionOutcome.RESOLVED, version)));
      StudioReferenceResolver.attachDecisionFacts(refusal, decisions, java.util.Set.of());
      throw refusal;
    }
  }

  /** Genuine pre-send decision and its owner transition commit or roll back as one unit. */
  void settleObservedFailure(
      JsonNode binding, RuntimeException failure, String failureCode, Instant now) {
    UUID id = UUID.fromString(binding.path("executionId").asText());
    UUID attempt = UUID.fromString(binding.path("attemptId").asText());
    transactions.executeWithoutResult(
        status -> {
          if (!statements.lockObservedResolutionOwner(id, instanceId, attempt)) {
            return;
          }
          var owner = statements.find(id).orElseThrow();
          String code =
              owner.get("cancel_requested_at") != null
                  ? ExecutionErrorCode.CANCELLED
                  : owner.get("revoked_at") != null
                      ? ExecutionErrorCode.AUTHORIZATION_REVOKED
                      : failureCode;
          auditObservedFailure(binding, failure);
          if (java.util.Arrays.stream(failure.getSuppressed())
              .anyMatch(StudioReferenceResolver.ResolutionFacts.class::isInstance)) {
            if (secretAudit == null) {
              throw new IllegalStateException("Missing secret no-send audit");
            }
            secretAudit.replayNoSendDecision(
                binding,
                instanceId,
                StudioReferenceResolver.positivelyNotEntered(failure),
                code == null
                    ? com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.NoSendDisposition
                        .REQUEUED
                    : com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.NoSendDisposition
                        .CLOSED);
          }
          int applied =
              code == null
                  ? statements.releaseObservedOutageClaim(id, instanceId, attempt)
                  : statements.closeWithError(id, code, now);
          if (applied != 1) {
            throw new IllegalStateException("Observed failure decision lost its owner transition");
          }
        });
  }

  private static String observedRefusalCode(RuntimeException refusal) {
    if (!(refusal instanceof com.citi.put.checks.studio.guided.session.GuidedSessionException)) {
      return ExecutionErrorCode.DISPATCH_FAILED;
    }
    if ("CANCELLED".equals(refusal.getMessage())) {
      return ExecutionErrorCode.CANCELLED;
    }
    return java.util.Set.of(
                "AUTHORIZATION_EXPIRED",
                "FORBIDDEN_SCOPE",
                "SECRET_USE_REVOKED",
                "SECRET_USE_NOT_AUTHORIZED")
            .contains(refusal.getMessage())
        ? ExecutionErrorCode.AUTHORIZATION_REVOKED
        : ExecutionErrorCode.DISPATCH_FAILED;
  }

  private void auditObservedFailure(JsonNode binding, RuntimeException failure) {
    if (!org.springframework.transaction.support.TransactionSynchronizationManager
        .isActualTransactionActive()) {
      throw new IllegalStateException("Observed failure audit requires its owner transaction");
    }
    if (secretAudit == null) {
      return;
    }
    var decisions = StudioReferenceResolver.decisionFacts(failure);
    if (decisions.isEmpty()) {
      return;
    }
    var declared =
        ExecutionReferences.declared(
            objectMapper,
            jdbc.queryForObject(
                "SELECT \"references\"::text FROM ui_test_revisions WHERE id=?",
                String.class,
                UUID.fromString(binding.path("revisionId").asText())));
    if (!declared.secrets().containsAll(decisions.keySet())) {
      throw new IllegalArgumentException("Undeclared secret decision metadata");
    }
    decisions.forEach(
        (id, decision) ->
            secretAudit.replayRelease(
                binding,
                List.of(id),
                decision.version() == null ? Map.of() : Map.of(id, decision.version()),
                com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome.valueOf(
                    decision.outcome().name())));
    secretAudit.replayNoSend(
        UUID.fromString(binding.path("executionId").asText()),
        UUID.fromString(binding.path("attemptId").asText()));
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
        transactions.executeWithoutResult(
            status -> {
              if (!statements.lockUnadmittedDispatch(executionId, attemptId)) {
                return;
              }
              if (secretAudit != null) {
                secretAudit.replayNoSend(executionId, attemptId);
              }
              var owner = statements.find(executionId).orElseThrow();
              String stopCode =
                  owner.get("cancel_requested_at") != null
                      ? ExecutionErrorCode.CANCELLED
                      : owner.get("revoked_at") != null
                          ? ExecutionErrorCode.AUTHORIZATION_REVOKED
                          : null;
              if (stopCode != null) {
                statements.closeWithError(executionId, stopCode, now);
              } else {
                if (outcome.retryable() && withinDeadline) {
                  statements.returnAfterDefiniteRefusal(executionId, attemptId);
                } else {
                  statements.closeWithError(executionId, ExecutionErrorCode.DISPATCH_FAILED, now);
                }
              }
            });
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

  /** Reads the immutable plain values snapshotted by acceptance, never the mutable draft. */
  private Map<String, String> plainVariablesOf(
      UUID executionId, ReferenceDeclarations declarations) {
    if (declarations.variables().isEmpty()) {
      return Map.of();
    }
    List<String> found =
        jdbc.queryForList(
            """
            SELECT COALESCE(e.configuration_snapshot -> 'variables', '{}'::jsonb)::text
              FROM ui_test_executions e
              JOIN studio_dispatch_ledger l
                ON l.execution_id = e.id AND l.execution_accepted_at = e.started_at
             WHERE l.execution_id = ?
            """,
            String.class,
            executionId);
    if (found.isEmpty()) {
      throw new StudioReferenceResolver.ReferenceUnavailableException(
          declarations.variables().get(0));
    }
    try {
      JsonNode values = objectMapper.readTree(found.get(0));
      if (!values.isObject() || values.size() != declarations.variables().size()) {
        throw new StudioReferenceResolver.ReferenceUnavailableException(
            declarations.variables().get(0));
      }
      Map<String, String> resolved = new java.util.LinkedHashMap<>();
      for (String name : declarations.variables()) {
        JsonNode value = values.get(name);
        if (value == null || !value.isTextual()) {
          throw new StudioReferenceResolver.ReferenceUnavailableException(name);
        }
        resolved.put(name, value.textValue());
      }
      return Map.copyOf(resolved);
    } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
      throw new StudioReferenceResolver.ReferenceUnavailableException(
          declarations.variables().get(0));
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
