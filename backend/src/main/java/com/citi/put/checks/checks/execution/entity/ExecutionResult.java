package com.citi.put.checks.checks.execution.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "execution_results")
@IdClass(ExecutionResultId.class)
public class ExecutionResult {

  @Id private UUID id;

  @Id
  @Column(name = "started_at", nullable = false)
  private Instant startedAt;

  @Column(name = "check_id", nullable = false)
  private UUID checkId;

  @Column(nullable = false, length = 20)
  private String status;

  @Column(name = "ended_at", nullable = false)
  private Instant endedAt;

  @Column(name = "duration_ms", nullable = false)
  private int durationMs;

  private String output;

  @Column(name = "error_message")
  private String errorMessage;

  protected ExecutionResult() {}

  public ExecutionResult(
      UUID checkId,
      String status,
      Instant startedAt,
      Instant endedAt,
      int durationMs,
      String output,
      String errorMessage) {
    this.id = UUID.randomUUID();
    this.checkId = checkId;
    this.status = status;
    this.startedAt = startedAt;
    this.endedAt = endedAt;
    this.durationMs = durationMs;
    this.output = output;
    this.errorMessage = errorMessage;
  }

  public UUID getId() {
    return id;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public UUID getCheckId() {
    return checkId;
  }

  public String getStatus() {
    return status;
  }

  public Instant getEndedAt() {
    return endedAt;
  }

  public int getDurationMs() {
    return durationMs;
  }

  public String getOutput() {
    return output;
  }

  public String getErrorMessage() {
    return errorMessage;
  }
}
