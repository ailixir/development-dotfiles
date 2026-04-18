package com.citi.put.checks.checks.execution.entity;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

public class ExecutionResultId implements Serializable {
  private UUID id;
  private Instant startedAt;

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
