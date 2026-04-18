package com.citi.put.checks.smoke.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "execution_results")
@IdClass(ExecutionResultSmokeEntity.ExecutionResultId.class)
public class ExecutionResultSmokeEntity {

  @Id
  @Column(name = "id")
  public UUID id;

  @Column(name = "check_id", nullable = false)
  public UUID checkId;

  @Column(name = "status", nullable = false, length = 20)
  public String status;

  @Id
  @Column(name = "started_at", nullable = false)
  public Instant startedAt;

  @Column(name = "ended_at", nullable = false)
  public Instant endedAt;

  @Column(name = "duration_ms", nullable = false)
  public Integer durationMs;

  @Column(name = "output")
  public String output;

  @Column(name = "error_message")
  public String errorMessage;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "metadata", columnDefinition = "jsonb")
  public String metadata;

  @Column(name = "created_at", nullable = false)
  public Instant createdAt;

  public static class ExecutionResultId implements Serializable {
    public UUID id;
    public Instant startedAt;

    public ExecutionResultId() {}

    public ExecutionResultId(UUID id, Instant startedAt) {
      this.id = id;
      this.startedAt = startedAt;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) {
        return true;
      }
      if (!(o instanceof ExecutionResultId that)) {
        return false;
      }
      return Objects.equals(id, that.id) && Objects.equals(startedAt, that.startedAt);
    }

    @Override
    public int hashCode() {
      return Objects.hash(id, startedAt);
    }
  }
}
