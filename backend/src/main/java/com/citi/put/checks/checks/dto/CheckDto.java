package com.citi.put.checks.checks.dto;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckConfiguration;
import java.time.Instant;
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
    Instant updatedAt) {

  public static CheckDto from(Check entity) {
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
        entity.getUpdatedAt());
  }
}
