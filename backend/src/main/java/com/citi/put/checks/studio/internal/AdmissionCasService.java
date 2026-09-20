package com.citi.put.checks.studio.internal;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.AdmissionResponse;
import java.sql.Timestamp;
import java.time.Clock;
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
  private final Clock clock;

  @Autowired
  public AdmissionCasService(
      StudioDispatchLedgerStatements statements, StudioExecutionProperties properties) {
    this(statements, properties, Clock.systemUTC());
  }

  AdmissionCasService(
      StudioDispatchLedgerStatements statements,
      StudioExecutionProperties properties,
      Clock clock) {
    this.statements = statements;
    this.properties = properties;
    this.clock = clock;
  }

  /**
   * Grants, re-acknowledges or refuses an admission.
   *
   * <p>The one refusal that writes: a cancel recorded before the admission arrived (Studio v1 WP4).
   * The CAS refused it; the refusal then closes the execution {@code ERROR / CANCELLED} and answers
   * {@code EXECUTION_SETTLED}, which is true by the time the runner reads it. The close is why the
   * transaction does not roll back on the refusal's exception — every other refusal path writes
   * nothing, so there is nothing else a commit could keep.
   *
   * @throws InternalCallbackException {@code 409} for every refusal, including an unknown execution
   */
  @Transactional(noRollbackFor = InternalCallbackException.class)
  public AdmissionResponse claim(UUID pathExecutionId, AdmissionRequest request) {
    validate(pathExecutionId, request);
    Instant now = clock.instant();

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
