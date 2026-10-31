package com.citi.put.checks.studio.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * One accepted Studio execution (Architecture §8.1, §8.2).
 *
 * <p>{@code startedAt} is the immutable acceptance instant and the range partition key; it is never
 * rewritten when the browser begins. The public contract exposes it as {@code acceptedAt} and
 * exposes {@link #getBrowserStartedAt()} as {@code startedAt}.
 *
 * <p>{@code endedAt} and {@code durationMs} are nullable: a run that has not finished has neither,
 * and {@code durationMs} measures browser execution only — queue time is a separate budget.
 *
 * <p>Identity is the composite {@code (id, startedAt)} because the table is partitioned; see {@link
 * UITestExecutionId}.
 */
@Entity
@Table(name = "ui_test_executions")
@IdClass(UITestExecutionId.class)
public class UITestExecution {

  @Id private UUID id;

  /** Acceptance instant and partition key. Public name: {@code acceptedAt}. */
  @Id
  @Column(name = "started_at", nullable = false, updatable = false)
  private Instant startedAt;

  @Column(name = "ui_test_id", nullable = false)
  private UUID testId;

  @Column(name = "check_id")
  private UUID checkId;

  @Column(nullable = false, length = 20)
  private String status;

  /** Browser start. Null until an authenticated runner start report is committed (§8.2). */
  @Column(name = "browser_started_at")
  private Instant browserStartedAt;

  @Column(name = "ended_at")
  private Instant endedAt;

  @Column(name = "duration_ms")
  private Integer durationMs;

  @Column(name = "error_code", length = 40)
  private String errorCode;

  /**
   * The named replay cause (STUDIO-OBS-008 T0 ruling A1), written once with the terminal status by
   * the FINAL statement and never rewritten (the FINAL native statement is the only writer; JPA
   * neither inserts nor updates them). All four columns are null, or one of the two shapes the V22
   * table CHECK admits. Historical rows are null: the login detail was never stored.
   */
  @Column(name = "replay_failure_code", insertable = false, updatable = false)
  private String replayFailureCode;

  @Column(name = "replay_failure_step_id", insertable = false, updatable = false)
  private String replayFailureStepId;

  @Column(name = "replay_failure_step_index", insertable = false, updatable = false)
  private Integer replayFailureStepIndex;

  @Column(name = "replay_failure_login_steps_present", insertable = false, updatable = false)
  private Boolean replayFailureLoginStepsPresent;

  /** Immutable confirmed revision. Null for legacy history, which never had one (§8.1). */
  @Column(name = "revision_id")
  private UUID revisionId;

  /** The execution's own CSI. Historical access uses this, never a mutable parent lookup. */
  @Column(name = "csi_id", length = 20)
  private String csiId;

  /** Truthful scope marker; legacy history remains null and is ineligible for reuse. */
  @Column(name = "execution_scope", updatable = false)
  private String executionScope;

  @Column(length = 255)
  private String principal;

  @Column(length = 50)
  private String environment;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "configuration_snapshot", columnDefinition = "jsonb")
  private String configurationSnapshot;

  @Column(name = "trigger_source", updatable = false)
  private String triggerSource;

  @Column(name = "diagnostic", nullable = false, updatable = false)
  private boolean diagnostic;

  @Column(name = "schedule_id", updatable = false)
  private UUID scheduleId;

  @Column(name = "scheduled_at", updatable = false)
  private Instant scheduledAt;

  public boolean isDiagnostic() {
    return diagnostic;
  }

  public void setDiagnostic(boolean value) {
    diagnostic = value;
  }

  public String getTriggerSource() {
    return triggerSource;
  }

  public void setTriggerSource(String value) {
    triggerSource = value;
  }

  public UUID getScheduleId() {
    return scheduleId;
  }

  public void setScheduleId(UUID value) {
    scheduleId = value;
  }

  public Instant getScheduledAt() {
    return scheduledAt;
  }

  public void setScheduledAt(Instant value) {
    scheduledAt = value;
  }

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "step_results", columnDefinition = "jsonb")
  private String stepResults;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private String logs;

  @Column(name = "logs_truncated", nullable = false)
  private boolean logsTruncated;

  /** Object storage key. The browser is only ever given the protected API path (§6.2). */
  @Column(name = "video_key")
  private String videoKey;

  @Column(name = "video_status", length = 20)
  private String videoStatus;

  @Column(name = "video_error")
  private String videoError;

  @Column(name = "video_expires_at")
  private Instant videoExpiresAt;

  @Column(name = "video_partial")
  private Boolean videoPartial;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "runtime_versions", columnDefinition = "jsonb")
  private String runtimeVersions;

  /** Monotonic API snapshot revision; also the SSE event id (§5.5). */
  @Column(name = "snapshot_revision", nullable = false)
  private long snapshotRevision;

  /** Retained for legacy rows only; new code writes {@link #videoKey} instead (AC-7). */
  @Column(name = "video_url")
  private String videoUrl;

  @JdbcTypeCode(SqlTypes.ARRAY)
  @Column(name = "screenshot_urls", columnDefinition = "text[]")
  private String[] screenshotUrls;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "error_details", columnDefinition = "jsonb")
  private String errorDetails;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "observed_revision_binding", columnDefinition = "jsonb", updatable = false)
  private String observedRevisionBinding;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(
      name = "observed_admission_receipt",
      columnDefinition = "jsonb",
      insertable = false,
      updatable = false)
  private String observedAdmissionReceipt;

  public String getObservedRevisionBinding() {
    return observedRevisionBinding;
  }

  public void setObservedRevisionBinding(String binding) {
    this.observedRevisionBinding = binding;
  }

  public String getObservedAdmissionReceipt() {
    return observedAdmissionReceipt;
  }

  protected UITestExecution() {}

  /**
   * Accepts an execution. The row starts {@code PENDING} with no end, no duration and no browser
   * start; those are written when the runner reports (§5.1, §8.2).
   */
  public UITestExecution(UUID testId, String status, Instant acceptedAt, String csiId) {
    this.id = UUID.randomUUID();
    this.testId = testId;
    this.status = status;
    this.startedAt = acceptedAt;
    this.csiId = csiId;
    this.createdAt = Instant.now();
  }

  public UITestExecution(UUID id, UUID testId, String status, Instant acceptedAt, String csiId) {
    this(testId, status, acceptedAt, csiId);
    this.id = java.util.Objects.requireNonNull(id);
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

  /** Acceptance instant and partition key. Exposed publicly as {@code acceptedAt}. */
  public Instant getStartedAt() {
    return startedAt;
  }

  public Instant getBrowserStartedAt() {
    return browserStartedAt;
  }

  public void setBrowserStartedAt(Instant browserStartedAt) {
    this.browserStartedAt = browserStartedAt;
  }

  public Instant getEndedAt() {
    return endedAt;
  }

  public void setEndedAt(Instant endedAt) {
    this.endedAt = endedAt;
  }

  public Integer getDurationMs() {
    return durationMs;
  }

  public void setDurationMs(Integer durationMs) {
    this.durationMs = durationMs;
  }

  public String getErrorCode() {
    return errorCode;
  }

  public void setErrorCode(String errorCode) {
    this.errorCode = errorCode;
  }

  public String getReplayFailureCode() {
    return replayFailureCode;
  }

  public String getReplayFailureStepId() {
    return replayFailureStepId;
  }

  public Integer getReplayFailureStepIndex() {
    return replayFailureStepIndex;
  }

  public Boolean getReplayFailureLoginStepsPresent() {
    return replayFailureLoginStepsPresent;
  }

  /** For fixtures only: production writes the four columns in the FINAL statement, not here. */
  public void setReplayFailure(
      String code, String stepId, Integer stepIndex, Boolean loginStepsPresent) {
    this.replayFailureCode = code;
    this.replayFailureStepId = stepId;
    this.replayFailureStepIndex = stepIndex;
    this.replayFailureLoginStepsPresent = loginStepsPresent;
  }

  public UUID getRevisionId() {
    return revisionId;
  }

  public void setRevisionId(UUID revisionId) {
    this.revisionId = revisionId;
  }

  public String getCsiId() {
    return csiId;
  }

  public String getExecutionScope() {
    return executionScope;
  }

  public void markFullExecution() {
    executionScope = "FULL";
  }

  public String getPrincipal() {
    return principal;
  }

  public void setPrincipal(String principal) {
    this.principal = principal;
  }

  public String getEnvironment() {
    return environment;
  }

  public void setEnvironment(String environment) {
    this.environment = environment;
  }

  public String getConfigurationSnapshot() {
    return configurationSnapshot;
  }

  public void setConfigurationSnapshot(String configurationSnapshot) {
    this.configurationSnapshot = configurationSnapshot;
  }

  public String getStepResults() {
    return stepResults;
  }

  public void setStepResults(String stepResults) {
    this.stepResults = stepResults;
  }

  public String getLogs() {
    return logs;
  }

  public void setLogs(String logs) {
    this.logs = logs;
  }

  public boolean isLogsTruncated() {
    return logsTruncated;
  }

  public void setLogsTruncated(boolean logsTruncated) {
    this.logsTruncated = logsTruncated;
  }

  public String getVideoKey() {
    return videoKey;
  }

  public void setVideoKey(String videoKey) {
    this.videoKey = videoKey;
  }

  public String getVideoStatus() {
    return videoStatus;
  }

  public void setVideoStatus(String videoStatus) {
    this.videoStatus = videoStatus;
  }

  public String getVideoError() {
    return videoError;
  }

  public void setVideoError(String videoError) {
    this.videoError = videoError;
  }

  public Instant getVideoExpiresAt() {
    return videoExpiresAt;
  }

  public void setVideoExpiresAt(Instant videoExpiresAt) {
    this.videoExpiresAt = videoExpiresAt;
  }

  public Boolean getVideoPartial() {
    return videoPartial;
  }

  public void setVideoPartial(Boolean videoPartial) {
    this.videoPartial = videoPartial;
  }

  public String getRuntimeVersions() {
    return runtimeVersions;
  }

  public void setRuntimeVersions(String runtimeVersions) {
    this.runtimeVersions = runtimeVersions;
  }

  public long getSnapshotRevision() {
    return snapshotRevision;
  }

  public void setSnapshotRevision(long snapshotRevision) {
    this.snapshotRevision = snapshotRevision;
  }

  public String getVideoUrl() {
    return videoUrl;
  }

  public String[] getScreenshotUrls() {
    return screenshotUrls == null ? null : screenshotUrls.clone();
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
