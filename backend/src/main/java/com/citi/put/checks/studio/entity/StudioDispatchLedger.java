package com.citi.put.checks.studio.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Globally unique dispatch identity for one execution (Architecture §8.1, AC-6).
 *
 * <p>The history table is partitioned by {@code started_at} and keyed on {@code (id, started_at)},
 * so it can carry neither a globally unique single-column identity nor be the target of a
 * single-column foreign key. This unpartitioned ledger owns that identity and carries {@link
 * #getExecutionAcceptedAt()} as the partition locator used to reach the history row. There is
 * deliberately no foreign key into the partitioned table.
 *
 * <p>{@code (principal, idempotencyKey)} is unique, which is what makes execute idempotency survive
 * across API replicas and restarts — the in-memory idempotency filter alone does not (§5.1).
 *
 * <p>Story 10.7 owns the dispatcher state machine; the state CHECK constraint and the
 * lease/deadline transitions arrive with it.
 */
@Entity
@Table(name = "studio_dispatch_ledger")
public class StudioDispatchLedger {

  public static final String STATE_QUEUED = "QUEUED";
  public static final String STATE_DONE = "DONE";

  @Id
  @Column(name = "execution_id", updatable = false)
  private UUID executionId;

  @Column(name = "execution_accepted_at", nullable = false, updatable = false)
  private Instant executionAcceptedAt;

  @Column(name = "test_id", nullable = false, updatable = false)
  private UUID testId;

  @Column(name = "csi_id", nullable = false, length = 20, updatable = false)
  private String csiId;

  @Column(length = 255, updatable = false)
  private String principal;

  @Column(name = "idempotency_key", length = 200, updatable = false)
  private String idempotencyKey;

  @Column(name = "request_digest", length = 64, updatable = false)
  private String requestDigest;

  @Column(name = "attempt_id")
  private UUID attemptId;

  @Column(name = "admission_id")
  private UUID admissionId;

  @Column(name = "runner_instance_id", length = 255)
  private String runnerInstanceId;

  @Column(nullable = false, length = 20)
  private String state;

  @Column(name = "lease_owner", length = 255)
  private String leaseOwner;

  @Column(name = "lease_expires_at")
  private Instant leaseExpiresAt;

  @Column(name = "pending_deadline_at")
  private Instant pendingDeadlineAt;

  @Column(name = "start_deadline_at")
  private Instant startDeadlineAt;

  @Column(name = "run_deadline_at")
  private Instant runDeadlineAt;

  @Column(name = "last_runner_sequence", nullable = false)
  private long lastRunnerSequence;

  @Column(name = "snapshot_revision", nullable = false)
  private long snapshotRevision;

  @Column(name = "manifest_key")
  private String manifestKey;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected StudioDispatchLedger() {}

  /** Records the acceptance of an execution, together with its durable idempotency mapping. */
  public StudioDispatchLedger(
      UUID executionId,
      Instant executionAcceptedAt,
      UUID testId,
      String csiId,
      String principal,
      String idempotencyKey,
      String requestDigest) {
    this.executionId = executionId;
    this.executionAcceptedAt = executionAcceptedAt;
    this.testId = testId;
    this.csiId = csiId;
    this.principal = principal;
    this.idempotencyKey = idempotencyKey;
    this.requestDigest = requestDigest;
    this.state = STATE_QUEUED;
    this.createdAt = Instant.now();
    this.updatedAt = this.createdAt;
  }

  public UUID getExecutionId() {
    return executionId;
  }

  /** Partition locator: the {@code started_at} value of the history row. */
  public Instant getExecutionAcceptedAt() {
    return executionAcceptedAt;
  }

  public UUID getTestId() {
    return testId;
  }

  public String getCsiId() {
    return csiId;
  }

  public String getPrincipal() {
    return principal;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }

  public String getRequestDigest() {
    return requestDigest;
  }

  public UUID getAttemptId() {
    return attemptId;
  }

  public void setAttemptId(UUID attemptId) {
    this.attemptId = attemptId;
  }

  public UUID getAdmissionId() {
    return admissionId;
  }

  public void setAdmissionId(UUID admissionId) {
    this.admissionId = admissionId;
  }

  public String getRunnerInstanceId() {
    return runnerInstanceId;
  }

  public void setRunnerInstanceId(String runnerInstanceId) {
    this.runnerInstanceId = runnerInstanceId;
  }

  public String getState() {
    return state;
  }

  public void setState(String state) {
    this.state = state;
  }

  public String getLeaseOwner() {
    return leaseOwner;
  }

  public void setLeaseOwner(String leaseOwner) {
    this.leaseOwner = leaseOwner;
  }

  public Instant getLeaseExpiresAt() {
    return leaseExpiresAt;
  }

  public void setLeaseExpiresAt(Instant leaseExpiresAt) {
    this.leaseExpiresAt = leaseExpiresAt;
  }

  public Instant getPendingDeadlineAt() {
    return pendingDeadlineAt;
  }

  public void setPendingDeadlineAt(Instant pendingDeadlineAt) {
    this.pendingDeadlineAt = pendingDeadlineAt;
  }

  public Instant getStartDeadlineAt() {
    return startDeadlineAt;
  }

  public void setStartDeadlineAt(Instant startDeadlineAt) {
    this.startDeadlineAt = startDeadlineAt;
  }

  public Instant getRunDeadlineAt() {
    return runDeadlineAt;
  }

  public void setRunDeadlineAt(Instant runDeadlineAt) {
    this.runDeadlineAt = runDeadlineAt;
  }

  public long getLastRunnerSequence() {
    return lastRunnerSequence;
  }

  public void setLastRunnerSequence(long lastRunnerSequence) {
    this.lastRunnerSequence = lastRunnerSequence;
  }

  public long getSnapshotRevision() {
    return snapshotRevision;
  }

  public void setSnapshotRevision(long snapshotRevision) {
    this.snapshotRevision = snapshotRevision;
  }

  public String getManifestKey() {
    return manifestKey;
  }

  public void setManifestKey(String manifestKey) {
    this.manifestKey = manifestKey;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public void touch() {
    this.updatedAt = Instant.now();
  }
}
