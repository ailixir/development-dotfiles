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

/**
 * Immutable compiled candidate for a UI test (Architecture §4.2, §8.1).
 *
 * <p>Rows are written once. The database trigger {@code trg_ui_test_revisions_write_once} rejects
 * any UPDATE touching a column other than {@code confirmed_by}/{@code confirmed_at}, and rejects a
 * second confirmation. Nothing in ordinary test CRUD may alter revision history.
 */
@Entity
@Table(name = "ui_test_revisions")
public class UITestRevision {

  @Id
  @GeneratedValue(strategy = GenerationType.AUTO)
  private UUID id;

  @Column(name = "test_id", nullable = false, updatable = false)
  private UUID testId;

  @Column(name = "csi_id", nullable = false, length = 20, updatable = false)
  private String csiId;

  @Column(name = "source_revision", nullable = false, updatable = false)
  private long sourceRevision;

  @Column(name = "configuration_revision", nullable = false, updatable = false)
  private long configurationRevision;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", nullable = false, updatable = false)
  private String source;

  @Column(name = "source_hash", nullable = false, length = 64, updatable = false)
  private String sourceHash;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", nullable = false, updatable = false)
  private String artifact;

  @Column(name = "artifact_hash", nullable = false, length = 64, updatable = false)
  private String artifactHash;

  @Column(name = "artifact_schema_version", nullable = false, updatable = false)
  private int artifactSchemaVersion;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", nullable = false, updatable = false)
  private String configuration;

  /** Declared variable/secret references. {@code references} is a reserved SQL keyword. */
  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "\"references\"", columnDefinition = "jsonb", nullable = false, updatable = false)
  private String references;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", nullable = false, updatable = false)
  private String provenance;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(columnDefinition = "jsonb", updatable = false)
  private String authoring;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "authoring_revision_inputs", columnDefinition = "jsonb", updatable = false)
  private String authoringRevisionInputs;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "expected_intent", columnDefinition = "jsonb", updatable = false)
  private String expectedIntent;

  @Column(name = "intent_derivation_version", length = 32, updatable = false)
  private String intentDerivationVersion;

  @Column(name = "created_by", nullable = false, updatable = false)
  private String createdBy;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "confirmed_by")
  private String confirmedBy;

  @Column(name = "confirmed_at")
  private Instant confirmedAt;

  protected UITestRevision() {}

  public UUID getId() {
    return id;
  }

  public UUID getTestId() {
    return testId;
  }

  public String getCsiId() {
    return csiId;
  }

  public long getSourceRevision() {
    return sourceRevision;
  }

  public long getConfigurationRevision() {
    return configurationRevision;
  }

  public String getSource() {
    return source;
  }

  public String getSourceHash() {
    return sourceHash;
  }

  public String getArtifact() {
    return artifact;
  }

  public String getArtifactHash() {
    return artifactHash;
  }

  public int getArtifactSchemaVersion() {
    return artifactSchemaVersion;
  }

  public String getConfiguration() {
    return configuration;
  }

  public String getReferences() {
    return references;
  }

  public String getProvenance() {
    return provenance;
  }

  public String getAuthoring() {
    return authoring;
  }

  public String getAuthoringRevisionInputs() {
    return authoringRevisionInputs;
  }

  public String getExpectedIntent() {
    return expectedIntent;
  }

  public String getIntentDerivationVersion() {
    return intentDerivationVersion;
  }

  public String getCreatedBy() {
    return createdBy;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public String getConfirmedBy() {
    return confirmedBy;
  }

  public Instant getConfirmedAt() {
    return confirmedAt;
  }
}
