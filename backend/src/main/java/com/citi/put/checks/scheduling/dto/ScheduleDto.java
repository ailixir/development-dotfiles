package com.citi.put.checks.scheduling.dto;

import com.citi.put.checks.scheduling.entity.Schedule;
import java.time.Instant;
import java.util.UUID;

public record ScheduleDto(
    UUID id,
    UUID checkId,
    UUID uiTestId,
    String frequency,
    String cronExpression,
    String timezone,
    boolean enabled,
    Instant nextExecutionAt,
    Instant createdAt,
    Instant updatedAt) {

  public static ScheduleDto from(Schedule entity) {
    return new ScheduleDto(
        entity.getId(),
        entity.getCheckId(),
        entity.getUiTestId(),
        entity.getFrequency(),
        entity.getCronExpression(),
        entity.getTimezone(),
        entity.isEnabled(),
        entity.getNextExecutionAt(),
        entity.getCreatedAt(),
        entity.getUpdatedAt());
  }
}
