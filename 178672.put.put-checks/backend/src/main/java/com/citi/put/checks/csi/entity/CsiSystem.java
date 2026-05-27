package com.citi.put.checks.csi.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "csi_systems")
@SQLRestriction("deleted_at IS NULL")
public class CsiSystem {

  @Id
  @Column(length = 20)
  private String id;

  @Column(nullable = false)
  private String name;

  private String description;

  @Column(name = "business_unit", nullable = false, length = 100)
  private String businessUnit;

  @Column(nullable = false, length = 20)
  private String criticality;

  @Column(name = "owner_email", nullable = false)
  private String ownerEmail;

  @Column(nullable = false, length = 20)
  private String environment;

  @Column(nullable = false, length = 20)
  private String status;

  @JdbcTypeCode(SqlTypes.JSON)
  private Map<String, Object> metadata;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  protected CsiSystem() {}

  public String getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getDescription() {
    return description;
  }

  public String getBusinessUnit() {
    return businessUnit;
  }

  public String getCriticality() {
    return criticality;
  }

  public String getOwnerEmail() {
    return ownerEmail;
  }

  public String getEnvironment() {
    return environment;
  }

  public String getStatus() {
    return status;
  }

  public Map<String, Object> getMetadata() {
    return metadata;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }
}
