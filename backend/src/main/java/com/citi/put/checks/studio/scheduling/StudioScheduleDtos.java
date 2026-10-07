package com.citi.put.checks.studio.scheduling;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/** Typed public scheduling contracts; legacy ui_tests.schedule remains nonoperational. */
public final class StudioScheduleDtos {
  private StudioScheduleDtos() {}

  public record Create(String cronExpression, String timeZone, String executionPrincipal) {}

  public record Update(
      Long expectedVersion, String cronExpression, String timeZone, String executionPrincipal) {}

  public record Enabled(
      Long expectedVersion,
      Boolean enabled,
      UUID confirmedRevisionId,
      List<UUID> acknowledgedUncertaintyExecutionIds) {}

  public record PreviewRequest(String cronExpression, String timeZone) {}

  public record Policy(
      int minIntervalSeconds, int misfireGraceSeconds, String overlap, String dstOverlap) {}

  public record Capability(
      boolean enabled,
      boolean canManage,
      List<String> availableExecutionPrincipals,
      boolean localAuthorizationOnly,
      Policy policy) {}

  public record Preview(
      String normalizedCronExpression,
      String timeZone,
      List<StudioCronResolver.Slot> occurrences,
      Policy policy) {}

  @SuppressWarnings("checkstyle:ParameterNumber")
  public record Schedule(
      UUID id,
      UUID testId,
      String csiId,
      long version,
      String cronExpression,
      String timeZone,
      String executionPrincipal,
      String state,
      boolean requestedEnabled,
      String blockedCode,
      UUID activatedRevisionId,
      UUID activationId,
      String activatedBy,
      Instant activatedAt,
      Instant nextDueAt,
      Instant pollAfterAt,
      Instant deletedAt,
      Instant createdAt,
      Instant updatedAt,
      List<UUID> unacknowledgedUncertaintyExecutionIds,
      Occurrence latestOccurrence) {}

  @SuppressWarnings("checkstyle:ParameterNumber")
  public record Occurrence(
      UUID id,
      UUID scheduleId,
      long scheduleVersion,
      UUID testId,
      String csiId,
      String environment,
      String executionPrincipal,
      UUID activationId,
      UUID activatedRevisionId,
      String activatedBy,
      Instant activatedAt,
      Instant scheduledAt,
      LocalDateTime localScheduledAt,
      String timeZone,
      int offsetSeconds,
      String decision,
      String code,
      UUID executionId,
      Instant acceptedAt,
      Instant retryAt,
      Instant graceExpiresAt,
      Instant createdAt,
      Instant updatedAt,
      Instant missedFrom,
      Instant missedUntil,
      Long missedCount) {}

  public record Page<T>(List<T> data, int page, int size, long totalElements, long totalPages) {}
}
