package com.citi.put.checks.studio.evidence;

import org.springframework.http.HttpStatus;

/**
 * A refusal from {@code GET /executions/{id}/video} that is <b>not</b> an authorization decision.
 *
 * <p>Authorization is {@code StudioAccessDeniedException}, decided before any of these are
 * reachable and by the same code path the snapshot route uses — so none of these statuses is an
 * existence oracle: reaching them at all means the caller was already entitled to read the
 * execution.
 *
 * <p>Each carries the status, the {@code ErrorResponse} code and, where the protocol requires one,
 * a {@code Content-Range} header value.
 */
public class ExecutionVideoException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /** The evidence is not there to serve: no recording, or one that failed or never existed. */
  public static final String NO_EVIDENCE = "VIDEO_UNAVAILABLE";

  /** Logical expiry, judged by the API at {@code videoExpiresAt} (§6.2). */
  public static final String EXPIRED = "VIDEO_EXPIRED";

  /** The requested range cannot be served for an object of this size. */
  public static final String RANGE_NOT_SATISFIABLE = "RANGE_NOT_SATISFIABLE";

  /**
   * The store could not be reached. <b>Undeclared in the frozen contract</b> — ESC-2, escalated to
   * an architect rather than invented (ADR-002 §12 Class C).
   */
  public static final String STORE_UNAVAILABLE = "VIDEO_STORE_UNAVAILABLE";

  private final HttpStatus status;
  private final String code;
  private final String contentRange;

  private ExecutionVideoException(
      HttpStatus status, String code, String contentRange, String message) {
    super(message);
    this.status = status;
    this.code = code;
    this.contentRange = contentRange;
  }

  public HttpStatus getStatus() {
    return status;
  }

  public String getCode() {
    return code;
  }

  /** {@code Content-Range} to send, or {@code null}. */
  public String getContentRange() {
    return contentRange;
  }

  public static ExecutionVideoException noEvidence() {
    return new ExecutionVideoException(
        HttpStatus.NOT_FOUND, NO_EVIDENCE, null, "No evidence for this execution");
  }

  public static ExecutionVideoException expired() {
    return new ExecutionVideoException(
        HttpStatus.GONE, EXPIRED, null, "The recording for this execution has expired");
  }

  /**
   * {@code 416} with {@code Content-Range: bytes} {@code *}{@code /S}, where {@code S} is the size
   * <b>measured from the object</b>.
   */
  public static ExecutionVideoException unsatisfiableRange(long size) {
    return new ExecutionVideoException(
        HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
        RANGE_NOT_SATISFIABLE,
        "bytes */" + size,
        "The requested range cannot be served");
  }

  /**
   * The store was unreachable. Deliberately <b>not</b> {@code 404 No evidence for this execution},
   * which would be a statement about the run that the API has not observed.
   *
   * <p>The message names nothing about the store — not the bucket, not the endpoint, not the key.
   * The cause's message may carry all three and is neither logged at INFO+ nor sent.
   */
  public static ExecutionVideoException storeUnavailable() {
    return new ExecutionVideoException(
        HttpStatus.SERVICE_UNAVAILABLE,
        STORE_UNAVAILABLE,
        null,
        "The evidence store could not be reached; the recording's disposition is unknown");
  }
}
