package com.citi.put.checks.scheduling.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "failed_dispatches")
public class FailedDispatch {

  private static final long BASE_DELAY_SECONDS = 30;

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(name = "dispatch_type", nullable = false, length = 20)
  private String dispatchType;

  @Column(name = "reference_id", nullable = false)
  private UUID referenceId;

  @Column(name = "retry_count", nullable = false)
  private int retryCount;

  @Column(name = "max_retries", nullable = false)
  private int maxRetries;

  @Column(name = "next_retry_at")
  private Instant nextRetryAt;

  @Column(name = "last_error")
  private String lastError;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected FailedDispatch() {}

  public FailedDispatch(String dispatchType, UUID referenceId, String lastError, int maxRetries) {
    this.dispatchType = dispatchType;
    this.referenceId = referenceId;
    this.retryCount = 0;
    this.maxRetries = maxRetries;
    this.lastError = lastError;
    this.nextRetryAt = Instant.now().plusSeconds(BASE_DELAY_SECONDS);
    this.createdAt = Instant.now();
    this.updatedAt = Instant.now();
  }

  public void incrementRetry(String error) {
    this.retryCount++;
    this.lastError = error;
    this.updatedAt = Instant.now();
    if (this.retryCount < this.maxRetries) {
      long delaySeconds = BASE_DELAY_SECONDS * (1L << this.retryCount);
      this.nextRetryAt = Instant.now().plusSeconds(Math.min(delaySeconds, 120));
    } else {
      this.nextRetryAt = null;
    }
  }

  public boolean isExhausted() {
    return retryCount >= maxRetries;
  }

  public UUID getId() {
    return id;
  }

  public String getDispatchType() {
    return dispatchType;
  }

  public UUID getReferenceId() {
    return referenceId;
  }

  public int getRetryCount() {
    return retryCount;
  }

  public int getMaxRetries() {
    return maxRetries;
  }

  public Instant getNextRetryAt() {
    return nextRetryAt;
  }

  public String getLastError() {
    return lastError;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
