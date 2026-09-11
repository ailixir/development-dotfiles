package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.entity.UITest;
import java.time.Instant;
import java.util.UUID;

public record UITestDto(
    UUID id,
    String name,
    String description,
    String csiId,
    String steps,
    String variables,
    String browser,
    int viewportWidth,
    int viewportHeight,
    int timeoutSeconds,
    String waitStrategy,
    String environment,
    String status,
    String schedule,
    String createdBy,
    Instant createdAt,
    Instant updatedAt,
    Instant lastRunAt,
    String lastRunStatus,
    long sourceRevision,
    long configurationRevision,
    CompileState compileStatus,
    UUID currentCandidateRevisionId,
    UUID confirmedRevisionId) {

  public static UITestDto from(UITest entity) {
    return new UITestDto(
        entity.getId(),
        entity.getName(),
        entity.getDescription(),
        entity.getCsiId(),
        entity.getSteps(),
        entity.getVariables(),
        entity.getBrowser(),
        entity.getViewportWidth(),
        entity.getViewportHeight(),
        entity.getTimeoutSeconds(),
        entity.getWaitStrategy(),
        entity.getEnvironment(),
        entity.getStatus(),
        entity.getSchedule(),
        entity.getCreatedBy(),
        entity.getCreatedAt(),
        entity.getUpdatedAt(),
        entity.getLastRunAt(),
        entity.getLastRunStatus(),
        entity.getSourceRevision(),
        entity.getConfigurationRevision(),
        entity.getCompileStatus(),
        entity.getCurrentCandidateRevisionId(),
        entity.getConfirmedRevisionId());
  }
}
