package com.citi.put.checks.studio.dto;

import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.entity.UITest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A Studio draft in the frozen typed shape (Architecture §8.3, AC-2).
 *
 * <p>Steps are ordered English lines, variables are typed references, and the execution-affecting
 * configuration is one nested object. Whatever legacy shape the row was written in, it is read back
 * through {@link LegacyStudioAdapter} into this contract.
 */
public record UITestDto(
    UUID id,
    String name,
    String description,
    String csiId,
    String environment,
    List<String> steps,
    List<StudioVariable> variables,
    TestConfiguration configuration,
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
        entity.getEnvironment(),
        LegacyStudioAdapter.parseSteps(entity.getSteps()),
        LegacyStudioAdapter.parseVariables(entity.getVariables()),
        new TestConfiguration(
            LegacyStudioAdapter.normalizeBrowser(entity.getBrowser()),
            LegacyStudioAdapter.viewport(entity.getViewportWidth(), entity.getViewportHeight()),
            entity.getTimeoutSeconds(),
            entity.getWaitStrategy()),
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
