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
@Table(name = "ui_test_executions")
public class UiTestExecutionSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "ui_test_id", nullable = false)
  public UUID uiTestId;

  @Column(name = "check_id")
  public UUID checkId;

  @Column(name = "status", nullable = false, length = 20)
  public String status;

  @Column(name = "started_at", nullable = false)
  public Instant startedAt;

  // Nullable since V14: a run that has not finished has neither an end nor a duration.
  @Column(name = "ended_at")
  public Instant endedAt;

  @Column(name = "duration_ms")
  public Integer durationMs;

  @Column(name = "video_url")
  public String videoUrl;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "screenshot_urls", columnDefinition = "text[]")
  public String[] screenshotUrls;

  // jsonb since V14: the structured, bounded retained log buffer.
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "logs", columnDefinition = "jsonb")
  public String logs;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "error_details", columnDefinition = "jsonb")
  public String errorDetails;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;
}
