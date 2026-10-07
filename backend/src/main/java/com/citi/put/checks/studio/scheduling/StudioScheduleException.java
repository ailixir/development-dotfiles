package com.citi.put.checks.studio.scheduling;

/** Stable scheduling-only wire refusal; manual Studio error semantics are unchanged. */
public class StudioScheduleException extends RuntimeException {
  private static final long serialVersionUID = 1L;
  private final int status;
  private final String code;

  public StudioScheduleException(int status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  public int getStatus() {
    return status;
  }

  public String getCode() {
    return code;
  }
}
