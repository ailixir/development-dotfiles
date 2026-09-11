package com.citi.put.checks.config;

import com.citi.put.checks.reports.ReportNotFoundException;
import com.citi.put.checks.scheduling.ScheduleValidationException;
import com.citi.put.checks.studio.StudioConflictException;
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
