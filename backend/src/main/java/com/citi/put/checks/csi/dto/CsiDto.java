package com.citi.put.checks.csi.dto;

import com.citi.put.checks.csi.entity.CsiSystem;
import java.time.Instant;
import java.util.Map;

public record CsiDto(
    String id,
    String name,
    String description,
    String businessUnit,
    String criticality,
    String ownerEmail,
    String environment,
    String status,
    Map<String, Object> metadata,
    Instant createdAt,
    Instant updatedAt) {

  public static CsiDto from(CsiSystem entity) {
    return new CsiDto(
        entity.getId(),
        entity.getName(),
        entity.getDescription(),
        entity.getBusinessUnit(),
        entity.getCriticality(),
        entity.getOwnerEmail(),
        entity.getEnvironment(),
        entity.getStatus(),
        entity.getMetadata(),
        entity.getCreatedAt(),
        entity.getUpdatedAt());
  }
}
