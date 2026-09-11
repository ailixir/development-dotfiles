package com.citi.put.checks.studio.internal;

import org.springframework.http.HttpStatus;

/**
 * A refusal on one of the two internal callback routes, carrying the status the frozen contract
 * declares for it and a machine-readable code.
 *
 * <p>The status vocabulary on these routes is narrow on purpose: the contract declares {@code
 * 200/400/401/403/409/413} and no {@code 404}, so an unknown or expired execution is a definite
 * {@code 409} refusal rather than a status the runner has no rule for.
 *
 * <p>{@code 409} on either route means a <b>competing</b> party — a second identity claiming an
 * attempt this one owns — and story 10.6 AC-18 makes the runner stop reporting and raise an audit
 * line on receipt. It is therefore never the answer to a correct actor replaying an identical
 * report: an audit signal that fires on healthy behaviour is one operators learn to ignore.
 */
public class InternalCallbackException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  private final HttpStatus status;
  private final String code;

  public InternalCallbackException(HttpStatus status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public static InternalCallbackException conflict(String code, String message) {
    return new InternalCallbackException(HttpStatus.CONFLICT, code, message);
  }

  public static InternalCallbackException badRequest(String code, String message) {
    return new InternalCallbackException(HttpStatus.BAD_REQUEST, code, message);
  }

  public static InternalCallbackException tooLarge(String code, String message) {
    return new InternalCallbackException(HttpStatus.PAYLOAD_TOO_LARGE, code, message);
  }

  public HttpStatus getStatus() {
    return status;
  }

  public String getCode() {
    return code;
  }
}
