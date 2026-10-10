package com.citi.put.checks.studio.guided.session;

import java.util.Map;
import java.util.UUID;

/** Data-free failures: never expose page content, credentials or foreign scope. */
public final class GuidedSessionException extends RuntimeException {
  private final int status;

  public GuidedSessionException(String code, int status) {
    super(code);
    this.status = status;
  }

  public int status() {
    return status;
  }

  public Map<String, Object> response() {
    return Map.of(
        "schemaVersion",
        1,
        "code",
        getMessage(),
        "messageCode",
        getMessage(),
        "requestId",
        UUID.randomUUID().toString(),
        "retryable",
        false);
  }

  public static void require(boolean condition, String code, int status) {
    if (!condition) {
      throw new GuidedSessionException(code, status);
    }
  }
}
