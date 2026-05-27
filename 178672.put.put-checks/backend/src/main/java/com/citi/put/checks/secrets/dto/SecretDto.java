package com.citi.put.checks.secrets.dto;

import com.citi.put.checks.secrets.entity.Secret;
import java.time.Instant;
import java.util.UUID;

public record SecretDto(
    UUID id,
    String referenceId,
    String label,
    String scope,
    String lastFour,
    String createdBy,
    Instant createdAt,
    Instant expiresAt) {

  public static SecretDto from(Secret entity) {
    return new SecretDto(
        entity.getId(),
        entity.getReferenceId(),
        entity.getLabel(),
        entity.getScope(),
        entity.getLastFour(),
        entity.getOwner(),
        entity.getCreatedAt(),
        entity.getExpiresAt());
  }
}
