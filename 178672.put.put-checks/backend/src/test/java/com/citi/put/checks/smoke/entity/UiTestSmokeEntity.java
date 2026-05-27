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
@Table(name = "ui_tests")
public class UiTestSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "name", nullable = false)
  public String name;

  @Column(name = "csi_id", length = 20)
  public String csiId;

  @Column(name = "description")
  public String description;

  @Column(name = "environment", nullable = false, length = 50)
  public String environment;

  @Column(name = "browser", nullable = false, length = 20)
  public String browser;

  @Column(name = "viewport_width", nullable = false)
  public Integer viewportWidth;

  @Column(name = "viewport_height", nullable = false)
  public Integer viewportHeight;

  @Column(name = "timeout_seconds", nullable = false)
  public Integer timeoutSeconds;

  @Column(name = "wait_strategy", length = 20)
  public String waitStrategy;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "steps", nullable = false, columnDefinition = "jsonb")
  public String steps;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "variables", columnDefinition = "jsonb")
  public String variables;

  @Column(name = "created_by", nullable = false)
  public String createdBy;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  public Instant updatedAt;

  @Column(name = "last_run_at")
  public Instant lastRunAt;

  @Column(name = "last_run_status", length = 20)
  public String lastRunStatus;

  @Column(name = "deleted_at")
  public Instant deletedAt;
}
