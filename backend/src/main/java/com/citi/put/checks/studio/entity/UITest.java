package com.citi.put.checks.studio.entity;

import com.citi.put.checks.studio.compile.CompileState;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@SQLRestriction("deleted_at IS NULL AND quarantined_at IS NULL")
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

  /** Null identifies an unpromoted legacy row; reads must not synthesize a v2 identity. */
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb")
  private String authoring;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "authoring_revision_inputs", columnDefinition = "jsonb")
  private String authoringRevisionInputs;

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

  /**
   * Quarantined drafts (missing or unregistered CSI, V12) are hidden from every user-facing path
   * and from compile/confirm/execute, but are never deleted or reassigned (BRD §9).
   */
  @Column(name = "quarantined_at")
  private Instant quarantinedAt;

  @Column(name = "source_revision", nullable = false)
  private long sourceRevision = 1L;

  @Column(name = "configuration_revision", nullable = false)
  private long configurationRevision = 1L;

  @Enumerated(EnumType.STRING)
  @Column(name = "compile_status", nullable = false, length = 30)
  private CompileState compileStatus = CompileState.STALE;

  @Column(name = "compile_request_id")
  private UUID compileRequestId;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "compile_error", columnDefinition = "jsonb")
  private String compileError;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "compile_diagnostics", columnDefinition = "jsonb")
  private String compileDiagnostics;

  @Column(name = "current_candidate_revision_id")
  private UUID currentCandidateRevisionId;

  @Column(name = "confirmed_revision_id")
  private UUID confirmedRevisionId;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "authoring_snapshot", columnDefinition = "jsonb")
  private String authoringSnapshot;

  @Column(name = "authoring_hash")
  private String authoringHash;

  @Column(name = "scope_reviewed_by")
  private String scopeReviewedBy;

  @Column(name = "scope_reviewed_at")
  private Instant scopeReviewedAt;

  public String getAuthoringSnapshot() {
    return authoringSnapshot;
  }

  public void setAuthoringSnapshot(String value) {
    authoringSnapshot = value;
  }

  public String getAuthoringHash() {
    return authoringHash;
  }

  public void setAuthoringHash(String value) {
    authoringHash = value;
  }

  public String getScopeReviewedBy() {
    return scopeReviewedBy;
  }

  public void setScopeReviewedBy(String value) {
    scopeReviewedBy = value;
  }

  public Instant getScopeReviewedAt() {
    return scopeReviewedAt;
  }

  public void setScopeReviewedAt(Instant value) {
    scopeReviewedAt = value;
  }

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

  public String getAuthoring() {
    return authoring;
  }

  public void setAuthoring(String authoring) {
    this.authoring = authoring;
  }

  public String getAuthoringRevisionInputs() {
    return authoringRevisionInputs;
  }

  public void setAuthoringRevisionInputs(String authoringRevisionInputs) {
    this.authoringRevisionInputs = authoringRevisionInputs;
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

  public Instant getQuarantinedAt() {
    return quarantinedAt;
  }

  public long getSourceRevision() {
    return sourceRevision;
  }

  public void setSourceRevision(long sourceRevision) {
    this.sourceRevision = sourceRevision;
  }

  public long getConfigurationRevision() {
    return configurationRevision;
  }

  public void setConfigurationRevision(long configurationRevision) {
    this.configurationRevision = configurationRevision;
  }

  public CompileState getCompileStatus() {
    return compileStatus;
  }

  public void setCompileStatus(CompileState compileStatus) {
    this.compileStatus = compileStatus;
  }

  public UUID getCompileRequestId() {
    return compileRequestId;
  }

  public void setCompileRequestId(UUID compileRequestId) {
    this.compileRequestId = compileRequestId;
  }

  public String getCompileError() {
    return compileError;
  }

  public void setCompileError(String compileError) {
    this.compileError = compileError;
  }

  public String getCompileDiagnostics() {
    return compileDiagnostics;
  }

  public void setCompileDiagnostics(String compileDiagnostics) {
    this.compileDiagnostics = compileDiagnostics;
  }

  public UUID getCurrentCandidateRevisionId() {
    return currentCandidateRevisionId;
  }

  public void setCurrentCandidateRevisionId(UUID currentCandidateRevisionId) {
    this.currentCandidateRevisionId = currentCandidateRevisionId;
  }

  public UUID getConfirmedRevisionId() {
    return confirmedRevisionId;
  }

  public void setConfirmedRevisionId(UUID confirmedRevisionId) {
    this.confirmedRevisionId = confirmedRevisionId;
  }
}
