package com.citi.put.checks.studio.entity;

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
@Table(name = "ui_tests")
@SQLRestriction("deleted_at IS NULL")
public class UITest {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(nullable = false)
  private String name;

  private String description;

  @Column(name = "csi_id", length = 20)
  private String csiId;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", nullable = false)
  private String steps;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private String variables;

  @Column(nullable = false, length = 20)
  private String browser;

  @Column(name = "viewport_width", nullable = false)
  private int viewportWidth = 1920;

  @Column(name = "viewport_height", nullable = false)
  private int viewportHeight = 1080;

  @Column(name = "timeout_seconds", nullable = false)
  private int timeoutSeconds = 30;

  @Column(name = "wait_strategy", length = 20)
  private String waitStrategy = "networkidle";

  @Column(nullable = false, length = 50)
  private String environment;

  @Column(length = 20)
  private String status = "PAUSED";

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private String schedule;

  @Column(name = "created_by", nullable = false)
  private String createdBy;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "last_run_at")
  private Instant lastRunAt;

  @Column(name = "last_run_status", length = 20)
  private String lastRunStatus;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  protected UITest() {}

  public UITest(
      String name,
      String description,
      String csiId,
      String steps,
      String variables,
      String browser,
      int viewportWidth,
      int viewportHeight,
      String environment,
      String createdBy) {
    this.name = name;
    this.description = description;
    this.csiId = csiId;
    this.steps = steps;
    this.variables = variables;
    this.browser = browser;
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.environment = environment;
    this.createdBy = createdBy;
    this.status = "PAUSED";
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

  public String getDescription() {
    return description;
  }

  public void setDescription(String description) {
    this.description = description;
  }

  public String getCsiId() {
    return csiId;
  }

  public void setCsiId(String csiId) {
    this.csiId = csiId;
  }

  public String getSteps() {
    return steps;
  }

  public void setSteps(String steps) {
    this.steps = steps;
  }

  public String getVariables() {
    return variables;
  }

  public void setVariables(String variables) {
    this.variables = variables;
  }

  public String getBrowser() {
    return browser;
  }

  public void setBrowser(String browser) {
    this.browser = browser;
  }

  public int getViewportWidth() {
    return viewportWidth;
  }

  public void setViewportWidth(int viewportWidth) {
    this.viewportWidth = viewportWidth;
  }

  public int getViewportHeight() {
    return viewportHeight;
  }

  public void setViewportHeight(int viewportHeight) {
    this.viewportHeight = viewportHeight;
  }

  public int getTimeoutSeconds() {
    return timeoutSeconds;
  }

  public void setTimeoutSeconds(int timeoutSeconds) {
    this.timeoutSeconds = timeoutSeconds;
  }

  public String getWaitStrategy() {
    return waitStrategy;
  }

  public void setWaitStrategy(String waitStrategy) {
    this.waitStrategy = waitStrategy;
  }

  public String getEnvironment() {
    return environment;
  }

  public void setEnvironment(String environment) {
    this.environment = environment;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public String getSchedule() {
    return schedule;
  }

  public void setSchedule(String schedule) {
    this.schedule = schedule;
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

  public Instant getLastRunAt() {
    return lastRunAt;
  }

  public void setLastRunAt(Instant lastRunAt) {
    this.lastRunAt = lastRunAt;
  }

  public String getLastRunStatus() {
    return lastRunStatus;
  }

  public void setLastRunStatus(String lastRunStatus) {
    this.lastRunStatus = lastRunStatus;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }

  public void setDeletedAt(Instant deletedAt) {
    this.deletedAt = deletedAt;
  }
}
