package com.citi.put.checks.reports.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "report_executions")
public class ReportExecution {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(name = "report_id", nullable = false)
  private UUID reportId;

  @Column(nullable = false, length = 20)
  private String status;

  @Column(name = "executed_at", nullable = false)
  private Instant executedAt;

  @Column(name = "recipient_count", nullable = false)
  private int recipientCount;

  @Column(name = "checks_included", nullable = false)
  private int checksIncluded;

  @Column(name = "checks_failed")
  private int checksFailed;

  @Column(name = "generation_duration_ms")
  private Integer generationDurationMs;

  @Column(name = "email_content")
  private String emailContent;

  @Column(name = "error_message")
  private String errorMessage;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected ReportExecution() {}

  public ReportExecution(
      UUID reportId, String status, Instant executedAt, int recipientCount, int checksIncluded) {
    this.reportId = reportId;
    this.status = status;
    this.executedAt = executedAt;
    this.recipientCount = recipientCount;
    this.checksIncluded = checksIncluded;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public UUID getReportId() {
    return reportId;
  }

  public String getStatus() {
    return status;
  }

  public void setStatus(String status) {
    this.status = status;
  }

  public Instant getExecutedAt() {
    return executedAt;
  }

  public int getRecipientCount() {
    return recipientCount;
  }

  public int getChecksIncluded() {
    return checksIncluded;
  }

  public int getChecksFailed() {
    return checksFailed;
  }

  public void setChecksFailed(int checksFailed) {
    this.checksFailed = checksFailed;
  }

  public Integer getGenerationDurationMs() {
    return generationDurationMs;
  }

  public void setGenerationDurationMs(Integer generationDurationMs) {
    this.generationDurationMs = generationDurationMs;
  }

  public String getEmailContent() {
    return emailContent;
  }

  public void setEmailContent(String emailContent) {
    this.emailContent = emailContent;
  }

  public String getErrorMessage() {
    return errorMessage;
  }

  public void setErrorMessage(String errorMessage) {
    this.errorMessage = errorMessage;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
