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
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "ui_test_executions")
public class UITestExecution {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(name = "ui_test_id", nullable = false)
  private UUID testId;

  @Column(name = "check_id")
  private UUID checkId;

  @Column(nullable = false, length = 20)
  private String status;

  @Column(name = "started_at", nullable = false)
  private Instant startedAt;

  @Column(name = "ended_at", nullable = false)
  private Instant endedAt;

  @Column(name = "duration_ms", nullable = false)
  private int durationMs;

  @Column(name = "video_url")
  private String videoUrl;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "screenshot_urls", columnDefinition = "text[]")
  private String[] screenshotUrls;

  private String logs;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "error_details", columnDefinition = "jsonb")
  private String errorDetails;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected UITestExecution() {}

  public UITestExecution(UUID testId, String status, Instant startedAt) {
    this.testId = testId;
    this.status = status;
    this.startedAt = startedAt;
    this.endedAt = startedAt;
    this.durationMs = 0;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public UUID getTestId() {
    return testId;
  }

  public UUID getCheckId() {
    return checkId;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public Instant getEndedAt() {
    return endedAt;
  }

  public void setEndedAt(Instant endedAt) {
    this.endedAt = endedAt;
  }

  public int getDurationMs() {
    return durationMs;
  }

  public void setDurationMs(int durationMs) {
    this.durationMs = durationMs;
  }

  public String getVideoUrl() {
    return videoUrl;
  }

  public void setVideoUrl(String videoUrl) {
    this.videoUrl = videoUrl;
  }

  public String[] getScreenshotUrls() {
    return screenshotUrls;
  }

  public String getLogs() {
    return logs;
  }

  public void setLogs(String logs) {
    this.logs = logs;
  }

  public String getErrorDetails() {
    return errorDetails;
  }

  public void setErrorDetails(String errorDetails) {
    this.errorDetails = errorDetails;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
