package com.citi.put.checks.secrets.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "secrets")
public class Secret {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(name = "reference_id", nullable = false, unique = true)
  private String referenceId;

  @Column(nullable = false)
  private String label;

  @Column(nullable = false, length = 20)
  private String scope;

  @Column(nullable = false)
  private String owner;

  @Column(name = "last_four", length = 4)
  private String lastFour;

  @Column(name = "encrypted_value")
  private byte[] encryptedValue;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "rotated_at")
  private Instant rotatedAt;

  @Column(name = "expires_at")
  private Instant expiresAt;

  protected Secret() {}

  public Secret(
      String referenceId,
      String label,
      String scope,
      String owner,
      String lastFour,
      byte[] encryptedValue,
      Instant expiresAt) {
    this.referenceId = referenceId;
    this.label = label;
    this.scope = scope;
    this.owner = owner;
    this.lastFour = lastFour;
    this.encryptedValue = encryptedValue;
    this.expiresAt = expiresAt;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public String getReferenceId() {
    return referenceId;
  }

  public String getLabel() {
    return label;
  }

  public void setLabel(String label) {
    this.label = label;
  }

  public String getScope() {
    return scope;
  }

  public void setScope(String scope) {
    this.scope = scope;
  }

  public String getOwner() {
    return owner;
  }

  public String getLastFour() {
    return lastFour;
  }

  public byte[] getEncryptedValue() {
    return encryptedValue;
  }

  public void setEncryptedValue(byte[] encryptedValue) {
    this.encryptedValue = encryptedValue;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getRotatedAt() {
    return rotatedAt;
  }

  public void setRotatedAt(Instant rotatedAt) {
    this.rotatedAt = rotatedAt;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public void setExpiresAt(Instant expiresAt) {
    this.expiresAt = expiresAt;
  }
}
