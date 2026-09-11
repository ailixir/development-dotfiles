package com.citi.put.checks.config;

import com.citi.put.checks.reports.ReportNotFoundException;
import com.citi.put.checks.scheduling.ScheduleValidationException;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dispatch.StubStudioReferenceResolver;
import com.citi.put.checks.studio.dispatch.StudioDispatchDisabledException;
import com.citi.put.checks.studio.dispatch.StudioQuotaExceededException;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.internal.InternalCallbackException;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Profile("!worker")
public class ChecksExceptionHandler {

  @ExceptionHandler(com.citi.put.checks.checks.CheckSourceDisabledException.class)
  public ResponseEntity<Map<String, Object>> handleCreationSourceDisabled(
      com.citi.put.checks.checks.CheckSourceDisabledException ex) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
        .body(
            Map.of(
                "error", "CHECK_SOURCE_DISABLED",
                "message", ex.getMessage(),
                "availableTypes", ex.getAvailableTypes()));
  }

  @ExceptionHandler(com.citi.put.checks.checks.executors.CheckSourceDisabledException.class)
  public ResponseEntity<Map<String, String>> handleExecutionSourceDisabled(
      com.citi.put.checks.checks.executors.CheckSourceDisabledException ex) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(Map.of("error", "CHECK_SOURCE_DISABLED", "message", ex.getMessage()));
  }

  @ExceptionHandler(ScheduleValidationException.class)
  public ResponseEntity<Map<String, String>> handleScheduleValidation(
      ScheduleValidationException ex) {
    return ResponseEntity.badRequest()
        .body(Map.of("error", "SCHEDULE_VALIDATION_ERROR", "message", ex.getMessage()));
  }

  /**
   * Studio state conflicts (Architecture §4.2, §9.1): STALE_REVISION, CSI_IMMUTABLE,
   * STALE_CANDIDATE, TEST_DELETED, TEST_QUARANTINED.
   */
  @ExceptionHandler(StudioConflictException.class)
  public ResponseEntity<Map<String, String>> handleStudioConflict(StudioConflictException ex) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
  }

  /**
   * Studio authorization (AC-4a, §9.1). One status and one code for "you may not" and "it is not
   * there" alike, so neither can be used as an existence oracle.
   */
  @ExceptionHandler(StudioAccessDeniedException.class)
  public ResponseEntity<Map<String, String>> handleStudioAccessDenied(
      StudioAccessDeniedException ex) {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(
            Map.of(
                "error",
                StudioAccessDeniedException.CODE,
                "message",
                "You do not have access to this Studio resource"));
  }

  /** The kill switch (AC-11, §8.5). Reads, callbacks and recovery are unaffected. */
  @ExceptionHandler(StudioDispatchDisabledException.class)
  public ResponseEntity<Map<String, String>> handleStudioDisabled(
      StudioDispatchDisabledException ex) {
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .body(Map.of("error", ExecutionErrorCode.DISPATCH_DISABLED, "message", ex.getMessage()));
  }

  /** A pending quota is full (AC-9, §5.1.1). */
  @ExceptionHandler(StudioQuotaExceededException.class)
  public ResponseEntity<Map<String, String>> handleStudioQuota(StudioQuotaExceededException ex) {
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
  }

  /**
   * A declared reference the CSI may not use (AC-10a). The body names the <em>reference</em> and
   * never its value — there is no value here to name, because preflight resolves nothing.
   */
  @ExceptionHandler(StubStudioReferenceResolver.UnknownReferenceException.class)
  public ResponseEntity<Map<String, String>> handleUnknownReference(
      StubStudioReferenceResolver.UnknownReferenceException ex) {
    return ResponseEntity.badRequest()
        .body(
            Map.of(
                "error",
                "UNKNOWN_REFERENCE",
                "reference",
                ex.getReferenceName(),
                "message",
                ex.getMessage()));
  }

  /**
   * The two internal callback routes (AC-17, AC-21, AC-26). The status vocabulary is the narrow one
   * the frozen contract declares — 200/400/401/403/409/413 and no 404.
   */
  @ExceptionHandler(InternalCallbackException.class)
  public ResponseEntity<Map<String, String>> handleInternalCallback(InternalCallbackException ex) {
    return ResponseEntity.status(ex.getStatus())
        .body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
  }

  /** Studio payloads the server will not persist (Architecture §8.3): INVALID_CONFIGURATION. */
  @ExceptionHandler(StudioValidationException.class)
  public ResponseEntity<Map<String, String>> handleStudioValidation(StudioValidationException ex) {
    return ResponseEntity.badRequest()
        .body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException ex) {
    return ResponseEntity.badRequest()
        .body(Map.of("error", "BAD_REQUEST", "message", ex.getMessage()));
  }

  @ExceptionHandler(ReportNotFoundException.class)
  public ResponseEntity<Map<String, String>> handleReportNotFound(ReportNotFoundException ex) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(Map.of("error", "REPORT_NOT_FOUND", "message", ex.getMessage()));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
    String message =
        ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
            .reduce((a, b) -> a + "; " + b)
            .orElse("Validation failed");
    return ResponseEntity.badRequest()
        .body(Map.of("error", "VALIDATION_ERROR", "message", message));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<Map<String, String>> handleUnreadableMessage(
      HttpMessageNotReadableException ex) {
    String message = ex.getMostSpecificCause().getMessage();
    return ResponseEntity.badRequest()
        .body(
            Map.of(
                "error",
                "INVALID_REQUEST_BODY",
                "message",
                message != null ? message : "Malformed request body"));
  }
}
