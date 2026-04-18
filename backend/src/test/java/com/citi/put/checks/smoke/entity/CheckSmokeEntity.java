package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "checks")
public class CheckSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "name", nullable = false)
  public String name;

  @Column(name = "type", nullable = false, length = 20)
  public String type;

  @Column(name = "csi_id", nullable = false, length = 20)
  public String csiId;

  @Column(name = "csi_name", nullable = false)
  public String csiName;

  @Column(name = "status", nullable = false, length = 20)
  public String status;

  @Column(name = "description")
  public String description;

  @Column(name = "environment", length = 50)
  public String environment;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "configuration", nullable = false, columnDefinition = "jsonb")
  public String configuration;

  @Column(name = "schedule_id")
  public UUID scheduleId;

  @Column(name = "last_execution_id")
  public UUID lastExecutionId;

  @Column(name = "last_execution_at")
  public Instant lastExecutionAt;

  @Column(name = "next_execution_at")
  public Instant nextExecutionAt;

  @Column(name = "created_by", nullable = false)
  public String createdBy;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  public Instant updatedAt;

  @Column(name = "deleted_at")
  public Instant deletedAt;
}
