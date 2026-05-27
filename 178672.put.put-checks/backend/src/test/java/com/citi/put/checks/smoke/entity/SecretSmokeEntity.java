package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "secrets")
public class SecretSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "reference_id", nullable = false, unique = true)
  public String referenceId;

  @Column(name = "label", nullable = false)
  public String label;

  @Column(name = "scope", nullable = false, length = 20)
  public String scope;

  @Column(name = "owner", nullable = false)
  public String owner;

  @Column(name = "last_four", length = 4)
  public String lastFour;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "rotated_at")
  public Instant rotatedAt;

  @Column(name = "expires_at")
  public Instant expiresAt;
}
