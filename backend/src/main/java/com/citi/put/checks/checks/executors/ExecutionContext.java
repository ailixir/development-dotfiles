package com.citi.put.checks.checks.executors;

import java.util.Map;
import java.util.UUID;

public record ExecutionContext(
    UUID executionId, String traceId, Map<String, String> resolvedSecrets) {

  public static ExecutionContext of(UUID executionId, String traceId) {
    return new ExecutionContext(executionId, traceId, Map.of());
  }
}
