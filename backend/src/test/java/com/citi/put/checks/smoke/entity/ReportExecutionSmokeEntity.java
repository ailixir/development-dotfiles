package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "report_executions")
public class ReportExecutionSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "report_id", nullable = false)
  public UUID reportId;

  @Column(name = "status", nullable = false, length = 20)
  public String status;

  @Column(name = "executed_at", nullable = false)
  public Instant executedAt;

  @Column(name = "recipient_count", nullable = false)
  public Integer recipientCount;

  @Column(name = "checks_included", nullable = false)
  public Integer checksIncluded;

  @Column(name = "checks_failed")
  public Integer checksFailed;

  @Column(name = "generation_duration_ms")
  public Integer generationDurationMs;

  @Column(name = "email_content")
  public String emailContent;

  @Column(name = "error_message")
  public String errorMessage;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;
}
