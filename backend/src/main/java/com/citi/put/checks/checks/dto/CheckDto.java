package com.citi.put.checks.checks.dto;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckConfiguration;
import com.citi.put.checks.scheduling.dto.ScheduleDto;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CheckDto(
    UUID id,
    String name,
    String type,
    String description,
    String csiId,
    String csiName,
    String status,
    CheckConfiguration configuration,
    String environment,
    String createdBy,
    Instant createdAt,
    Instant updatedAt,
    @JsonInclude(JsonInclude.Include.NON_NULL) Instant lastExecutionAt,
    List<String> tags,
    @JsonInclude(JsonInclude.Include.NON_NULL) ScheduleDto schedule,
    @JsonInclude(JsonInclude.Include.NON_NULL) String assignedTo,
    @JsonInclude(JsonInclude.Include.NON_NULL) Instant acknowledgedAt) {

  public static CheckDto from(Check entity, List<String> tags) {
    return from(entity, tags, null);
  }

  public static CheckDto from(Check entity, List<String> tags, ScheduleDto schedule) {
    return new CheckDto(
        entity.getId(),
        entity.getName(),
        entity.getType(),
        entity.getDescription(),
        entity.getCsiId(),
        entity.getCsiName(),
        entity.getStatus(),
        entity.getConfiguration(),
        entity.getEnvironment(),
        entity.getCreatedBy(),
        entity.getCreatedAt(),
        entity.getUpdatedAt(),
        entity.getLastExecutionAt(),
        tags != null ? tags : List.of(),
        schedule,
        entity.getAssignedTo(),
        entity.getAcknowledgedAt());
  }
}
