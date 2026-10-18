package com.citi.put.checks.studio.internal;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.AdmissionResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The admission compare-and-set (AC-17, AC-18, AC-19).
 *
 * <p>One conditional statement carries every precondition — the execution, the current {@code
 * attempt_id}, {@code state = 'DISPATCHING'}, {@code admission_id IS NULL} and a pending deadline
 * that has not passed — and its affected-row count is the verdict. It is never a {@code SELECT}
 * followed by an {@code UPDATE}, and it never depends on a companion write by another class.
 *
 * <p>A duplicate of the <em>same</em> identity is acknowledged idempotently by a second conditional
 * statement that matches {@code (attemptId, runnerInstanceId, admissionId)} <b>exactly</b> — never
 * by "an admission already exists, close enough". A <em>different</em> {@code admissionId} or
 * {@code runnerInstanceId} on an owned attempt is {@code 409}, which is what makes a lost admission
 * response unable to produce a second owner even if a future or misbehaving runner re-admitted.
 *
 * <p>No browser may start without a {@code 200}. That is the property story 10.6 AC-6 obeys and
 * this class supplies.
 */
@Service
public class AdmissionCasService {

  private final StudioDispatchLedgerStatements statements;
  private final StudioExecutionProperties properties;

  @Autowired(required = false)
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observed;

  @Autowired(required = false)
  private org.springframework.jdbc.core.JdbcTemplate observedJdbc;

  @Autowired(required = false)
  private com.citi.put.checks.studio.guided.session.GuidedContracts observedContracts;

  public AdmissionCasService(
      StudioDispatchLedgerStatements statements, StudioExecutionProperties properties) {
    this.statements = statements;
    this.properties = properties;
  }

  /**
   * Grants, re-acknowledges or refuses an admission at {@code now}. Reached only from {@link
   * #claimObserved}: the legacy unauthenticated-binding entry and its {@code
   * /internal/studio/executions/{id}/admission} route were deleted in STUDIO-OBS-014 (inherited
   * obligation P1), because they could take admission ownership of an observed run without the
   * observed authorization check.
   *
   * <p>Defence in depth (ar-ac11-and-refusal-codes.json 2.R1): {@code refusal()}'s cancel-close
   * branch (close {@code ERROR / CANCELLED}, answer {@code EXECUTION_SETTLED}) and its {@code DONE}
   * &rarr; {@code EXECUTION_SETTLED} branch are <b>not reached through {@link #claimObserved}</b>,
   * the only caller: under the same {@code FOR UPDATE} row lock, {@code
   * ObservedReplayAuthorization.check} already refuses a cancelled or settled row with {@code 409
   * CANCELLED} and writes nothing. A cancelled run that was never admitted is then settled {@code
   * ERROR / CANCELLED} by {@code RunningReaper} after the cancel margin. The branches stay as cheap
   * defence, which is also why {@code claimObserved}'s transaction is declared {@code
   * noRollbackFor} the refusal.
   *
   * @throws InternalCallbackException {@code 409} for every refusal, including an unknown execution
   */
  private AdmissionResponse claimAt(UUID pathExecutionId, AdmissionRequest request, Instant now) {
    validate(pathExecutionId, request);
    Instant startDeadlineAt = now.plus(properties.startDeadlineOrDefault());
    // A different origin from pending_deadline_at, which acceptance set from the acceptance
    // instant: queue time and browser runtime are separate budgets (AC-19). An implementation
    // sharing one timestamp fails one of the two halves of that criterion.
    Instant runDeadlineAt = now.plus(properties.runDeadlineOrDefault());

    int admitted =
        statements.admit(
            pathExecutionId,
            request.attemptId(),
            request.admissionId(),
            request.runnerInstanceId(),
            startDeadlineAt,
            runDeadlineAt,
            now);
    if (admitted == 1) {
      return new AdmissionResponse(
          pathExecutionId,
          request.attemptId(),
          request.admissionId(),
          "ADMITTED",
          startDeadlineAt,
          runDeadlineAt);
    }

    int reconfirmed =
        statements.confirmExistingAdmission(
            pathExecutionId,
            request.attemptId(),
            request.admissionId(),
            request.runnerInstanceId());
    if (reconfirmed == 1) {
      Map<String, Object> row = requireRow(pathExecutionId);
      return new AdmissionResponse(
          pathExecutionId,
          request.attemptId(),
          request.admissionId(),
          String.valueOf(row.get("state")),
          instant(row.get("start_deadline_at")),
          instant(row.get("run_deadline_at")));
    }

    throw refusal(pathExecutionId, request, now);
  }

  /**
   * The original CAS and its immutable observed receipt commit together under the real ledger lock.
   */
  @Transactional(noRollbackFor = InternalCallbackException.class)
  public com.fasterxml.jackson.databind.JsonNode claimObserved(
      UUID id,
      com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization.AdmissionPermit
          permit) {
    if (observed == null || observedJdbc == null || observedContracts == null) {
      throw InternalCallbackException.conflict(
          InternalCallbackCodes.ADMISSION_OWNED, "Observed execution is unavailable");
    }
    var request = permit.request();
    var locked =
        observedJdbc.queryForList(
            "SELECT l.execution_id FROM studio_dispatch_ledger l JOIN ui_test_executions e ON"
                + " e.id=l.execution_id AND e.started_at=l.execution_accepted_at WHERE"
                + " l.execution_id=? FOR UPDATE OF l,e",
            id);
    if (locked.isEmpty()) {
      throw InternalCallbackException.conflict(
          InternalCallbackCodes.EXECUTION_UNKNOWN, "Execution unavailable");
    }
    java.time.Instant wall =
        observedJdbc
            .queryForObject("SELECT clock_timestamp()", java.sql.Timestamp.class)
            .toInstant();
    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        permit.expiresAt().isAfter(wall), "AUTHORIZATION_EXPIRED", 409);
    var binding =
        observed
            .binding(id)
            .orElseThrow(
                () ->
                    new com.citi.put.checks.studio.guided.session.GuidedSessionException(
                        "FORBIDDEN_SCOPE", 403));
    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        binding.equals(permit.binding()), "FORBIDDEN_SCOPE", 403);
    observed.check(binding);
    var response =
        claimAt(
            id,
            new AdmissionRequest(
                id,
                UUID.fromString(request.path("attemptId").asText()),
                request.path("runnerInstanceId").asText(),
                UUID.fromString(request.path("admissionId").asText()),
                java.util.Map.of()),
            com.citi.put.checks.studio.guided.publication.PublicationContracts.millisecond(wall));
    var previous =
        observedJdbc.queryForList(
            "SELECT e.observed_admission_receipt::text FROM ui_test_executions e JOIN"
                + " studio_dispatch_ledger l ON l.execution_id=e.id AND"
                + " l.execution_accepted_at=e.started_at WHERE l.execution_id=?",
            String.class,
            id);
    if (!previous.isEmpty() && previous.getFirst() != null) {
      var receipt = observedContracts.parse(previous.getFirst());
      com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
          receipt.path("request").equals(request), "FORBIDDEN_SCOPE", 403);
      return receipt;
    }
    var receipt =
        observedContracts
            .object()
            .put("schemaVersion", 3)
            .put("kind", "observed")
            .put("admissionId", response.admissionId().toString())
            .put(
                "admittedAt",
                com.citi.put.checks.studio.guided.publication.PublicationContracts.time(wall))
            .put(
                "startDeadlineAt",
                com.citi.put.checks.studio.guided.publication.PublicationContracts.time(
                    response.startDeadlineAt()))
            .put(
                "runDeadlineAt",
                com.citi.put.checks.studio.guided.publication.PublicationContracts.time(
                    response.runDeadlineAt()));
    receipt.set("request", request);
    observedContracts.validate("v3/replay-job#/definitions/AdmissionReceipt", receipt);
    int written =
        observedJdbc.update(
            "UPDATE ui_test_executions e SET observed_admission_receipt=?::jsonb FROM"
                + " studio_dispatch_ledger l WHERE l.execution_id=? AND e.id=l.execution_id AND"
                + " e.started_at=l.execution_accepted_at AND e.observed_admission_receipt IS NULL",
            receipt.toString(),
            id);
    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        written == 1, "FORBIDDEN_SCOPE", 403);
    return receipt;
  }

  private void validate(UUID pathExecutionId, AdmissionRequest request) {
    if (request.attemptId() == null
        || request.admissionId() == null
        || request.runnerInstanceId() == null
        || request.runnerInstanceId().isBlank()) {
      throw InternalCallbackException.badRequest(
          InternalCallbackCodes.INVALID_REPORT,
          "attemptId, admissionId and runnerInstanceId are all required");
    }
    if (request.executionId() != null && !request.executionId().equals(pathExecutionId)) {
      throw InternalCallbackException.badRequest(
          InternalCallbackCodes.INVALID_REPORT, "The body's executionId does not match the path");
    }
  }

  /**
   * Classifies a zero-row verdict into the code the contract declares for it. The classification is
   * diagnostic only: the verdict was already taken by the affected-row count, and nothing here can
   * turn a zero into a success.
   */
  private InternalCallbackException refusal(
      UUID executionId, AdmissionRequest request, Instant now) {
    Optional<Map<String, Object>> found = statements.find(executionId);
    if (found.isEmpty()) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.EXECUTION_UNKNOWN,
          "No execution with this id is awaiting admission");
    }
    Map<String, Object> row = found.get();
    String state = String.valueOf(row.get("state"));
    Object attemptId = row.get("attempt_id");
    Object admissionId = row.get("admission_id");
    Instant pendingDeadline = instant(row.get("pending_deadline_at"));

    if (!"DONE".equals(state) && row.get("cancel_requested_at") != null) {
      // Cancelled between the send and this admission. The browser has not started and now never
      // will; the execution ends here rather than waiting for a reaper (ADR-002 §29).
      statements.closeWithError(executionId, ExecutionErrorCode.CANCELLED, now);
      return InternalCallbackException.conflict(
          InternalCallbackCodes.EXECUTION_SETTLED, "This execution was cancelled before admission");
    }
    if ("DONE".equals(state)) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.EXECUTION_SETTLED, "This execution is already settled");
    }
    if (attemptId == null || !attemptId.toString().equals(request.attemptId().toString())) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.ATTEMPT_SUPERSEDED,
          "A different attempt is current for this execution");
    }
    if (admissionId != null) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.ADMISSION_OWNED,
          "This attempt is already owned by a different admission identity");
    }
    if (pendingDeadline != null && !pendingDeadline.isAfter(now)) {
      return InternalCallbackException.conflict(
          InternalCallbackCodes.ADMISSION_EXPIRED,
          "This execution passed its pending deadline before admission arrived");
    }
    return InternalCallbackException.conflict(
        InternalCallbackCodes.TRANSITION_REJECTED,
        "This execution is in state " + state + " and cannot be admitted");
  }

  private Map<String, Object> requireRow(UUID executionId) {
    return statements
        .find(executionId)
        .orElseThrow(
            () ->
                InternalCallbackException.conflict(
                    InternalCallbackCodes.EXECUTION_UNKNOWN, "No execution with this id"));
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
