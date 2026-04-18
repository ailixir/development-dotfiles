package com.citi.put.checks.checks.execution.dto;

import com.citi.put.checks.checks.execution.entity.ExecutionResult;
import java.time.Instant;
import java.util.UUID;

public record ExecutionResultDto(
    UUID id,
    UUID checkId,
    String status,
    Instant startedAt,
    Instant endedAt,
    int durationMs,
    String output,
    String errorMessage) {

  public static ExecutionResultDto from(ExecutionResult entity) {
    return new ExecutionResultDto(
        entity.getId(),
        entity.getCheckId(),
        entity.getStatus(),
        entity.getStartedAt(),
        entity.getEndedAt(),
        entity.getDurationMs(),
        entity.getOutput(),
        entity.getErrorMessage());
  }
}
