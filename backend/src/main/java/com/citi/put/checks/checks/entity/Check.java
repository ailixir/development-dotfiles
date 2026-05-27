package com.citi.put.checks.checks.entity;

import com.citi.put.checks.checks.model.CheckConfiguration;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "checks")
@SQLRestriction("deleted_at IS NULL")
public class Check {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false, length = 50)
  private String type;

  private String description;

  @Column(name = "csi_id", nullable = false, length = 20)
  private String csiId;

  @Column(name = "csi_name", nullable = false)
  private String csiName;

  @Column(nullable = false, length = 20)
  private String status = "PENDING";

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", nullable = false)
  private CheckConfiguration configuration;

  @Column(length = 50)
  private String environment;

  @Column(name = "created_by", nullable = false)
  private String createdBy;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  @Column(name = "last_execution_at")
  private Instant lastExecutionAt;

  @Column(name = "acknowledged_at")
  private Instant acknowledgedAt;

  @Column(name = "assigned_to")
  private String assignedTo;

  protected Check() {}

  public Check(
      String name,
      String type,
      String description,
      String csiId,
      String csiName,
      CheckConfiguration configuration,
      String environment,
      String createdBy) {
    this.name = name;
    this.type = type;
    this.description = description;
    this.csiId = csiId;
    this.csiName = csiName;
    this.configuration = configuration;
    this.environment = environment;
    this.createdBy = createdBy;
    this.createdAt = Instant.now();
    this.updatedAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public void setName(String name) {
    this.name = name;
  }

  public String getType() {
    return type;
  }

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getCsiId() {
    return csiId;
  }

  public String getCsiName() {
    return csiName;
  }

  public String getStatus() {
    return status;
  }

  public CheckConfiguration getConfiguration() {
    return configuration;
  }

  public void setConfiguration(CheckConfiguration configuration) {
    this.configuration = configuration;
  }

  public String getEnvironment() {
    return environment;
  }

  public void setEnvironment(String environment) {
    this.environment = environment;
  }

  public String getCreatedBy() {
    return createdBy;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void setUpdatedAt(Instant updatedAt) {
    this.updatedAt = updatedAt;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }

  public void setDeletedAt(Instant deletedAt) {
    this.deletedAt = deletedAt;
  }

  public Instant getLastExecutionAt() {
    return lastExecutionAt;
  }

  public void setStatus(String status) {
    if (!status.equals(this.status)) {
      this.acknowledgedAt = null;
      this.assignedTo = null;
    }
    this.status = status;
  }

  public void setLastExecutionAt(Instant lastExecutionAt) {
    this.lastExecutionAt = lastExecutionAt;
  }

  public Instant getAcknowledgedAt() {
    return acknowledgedAt;
  }

  public void setAcknowledgedAt(Instant acknowledgedAt) {
    this.acknowledgedAt = acknowledgedAt;
  }

  public String getAssignedTo() {
    return assignedTo;
  }

  public void setAssignedTo(String assignedTo) {
    this.assignedTo = assignedTo;
  }
}
