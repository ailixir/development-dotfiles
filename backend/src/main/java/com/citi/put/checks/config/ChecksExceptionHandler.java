package com.citi.put.checks.config;

import com.citi.put.checks.reports.ReportNotFoundException;
import com.citi.put.checks.scheduling.ScheduleValidationException;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dispatch.StudioDispatchDisabledException;
import com.citi.put.checks.studio.dispatch.StudioQuotaExceededException;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.evidence.ExecutionVideoException;
import com.citi.put.checks.studio.internal.InternalCallbackException;
import com.citi.put.checks.studio.sse.WatchedExecutionRegistry;
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
        // The content type is set explicitly so the body is written without content negotiation.
        // The SSE route reaches this handler with `Accept: text/event-stream`, and negotiating a
        // JSON error against that Accept header yields a 406 rendered as 500 — which would make
        // the events route and the GET snapshot route disagree about a refusal, and AC-37a's whole
        // point is that a client can tell a 403 apart from a transient disconnect.
        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
        .body(
            Map.of(
                "error",
                StudioAccessDeniedException.CODE,
                "message",
                "You do not have access to this Studio resource"));
  }

  /**
   * The video route's non-authorization refusals (story 10.15; Architecture §6.2, §6.3).
   *
   * <p>Every one of these is reachable only <em>after</em> the caller was authorized to read the
   * execution, so none of them discloses existence — the forbidden and absent cases are both {@code
   * StudioAccessDeniedException} above, and they are answered identically.
   *
   * <p>The content type is set explicitly, for the same reason the forbidden handler sets it: a
   * {@code <video>} element sends {@code Accept: video/webm}, and negotiating a JSON error body
   * against that Accept header would turn an honest {@code 404} or {@code 410} into a {@code 500}.
   *
   * <p>{@code Content-Range: bytes} {@code *}{@code /S} rides along on the {@code 416}, where
   * {@code S} was measured from the object.
   */
  @ExceptionHandler(ExecutionVideoException.class)
  public ResponseEntity<Map<String, String>> handleExecutionVideo(ExecutionVideoException ex) {
    ResponseEntity.BodyBuilder response =
        ResponseEntity.status(ex.getStatus())
            .contentType(org.springframework.http.MediaType.APPLICATION_JSON);
    if (ex.getContentRange() != null) {
      response =
          response.header(org.springframework.http.HttpHeaders.CONTENT_RANGE, ex.getContentRange());
    }
    return response.body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
  }

  /** The kill switch (AC-11, §8.5). Reads, callbacks and recovery are unaffected. */
  @ExceptionHandler(StudioDispatchDisabledException.class)
  public ResponseEntity<Map<String, String>> handleStudioDisabled(
      StudioDispatchDisabledException ex) {
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .body(Map.of("error", ExecutionErrorCode.DISPATCH_DISABLED, "message", ex.getMessage()));
  }

  /**
   * An SSE bound was reached (AC-35, AC-38). A bounded rejection rather than unbounded growth: the
   * client falls back to the GET snapshot route, which is what §5.5 designates it for.
   */
  @ExceptionHandler(WatchedExecutionRegistry.StreamLimitExceededException.class)
  public ResponseEntity<Map<String, String>> handleStreamLimit(
      WatchedExecutionRegistry.StreamLimitExceededException ex) {
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        // Explicit, for the same reason as the forbidden handler: this is reached from a route the
        // client opened with `Accept: text/event-stream`, and negotiating a JSON body against that
        // would turn a bounded rejection into a 500 — which is unbounded growth's symptom, not its
        // refusal.
        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
        .body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
  }

  /** A pending quota is full (AC-9, §5.1.1). */
  @ExceptionHandler(StudioQuotaExceededException.class)
  public ResponseEntity<Map<String, String>> handleStudioQuota(StudioQuotaExceededException ex) {
    return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
        .body(Map.of("error", ex.getCode(), "message", ex.getMessage()));
  }

  /**
   * A declared reference the CSI may not use (§9.2, AC-6).
   *
   * <p>The body names the <em>reference</em> and never its value — not the value, not its length,
   * not {@code lastFour}, not a hash and not a prefix. Preflight resolves nothing that outlives the
   * call, so there is no value in scope here to name even accidentally.
   */
  @ExceptionHandler(StudioReferenceResolver.UnknownReferenceException.class)
  public ResponseEntity<Map<String, String>> handleUnknownReference(
      StudioReferenceResolver.UnknownReferenceException ex) {
    return unknownReference(ex.getReferenceName(), ex.getMessage());
  }

  /**
   * The principal is not entitled to use a declared secret (§9.2, AC-4).
   *
   * <p>Deliberately the same code and the same wording as an unknown reference. They are different
   * facts internally, and telling them apart on the wire would let an unentitled caller learn
   * whether a secret exists — <em>"Secret reference names alone grant no permission"</em> cuts both
   * ways.
   */
  @ExceptionHandler(StudioReferenceResolver.SecretUseNotAuthorizedException.class)
  public ResponseEntity<Map<String, String>> handleSecretUseNotAuthorized(
      StudioReferenceResolver.SecretUseNotAuthorizedException ex) {
    return unknownReference(ex.getReferenceName(), ex.getMessage());
  }

  private static ResponseEntity<Map<String, String>> unknownReference(
      String reference, String message) {
    return ResponseEntity.badRequest()
        .body(Map.of("error", "UNKNOWN_REFERENCE", "reference", reference, "message", message));
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
