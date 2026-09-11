package com.citi.put.checks.studio.entity;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Physical identity of a history row (AC-13).
 *
 * <p>{@code ui_test_executions} is range-partitioned by {@code started_at} with primary key {@code
 * (id, started_at)} since V7, so every lookup and update must carry the partition key. A bare
 * {@code WHERE id = ?} would scan every partition and cannot be used to update a row. The globally
 * unique {@code studio_dispatch_ledger.execution_id} is what resolves an execution id to its
 * partition locator.
 */
public class UITestExecutionId implements Serializable {

  private static final long serialVersionUID = 1L;

  private UUID id;
  private Instant startedAt;

  public UITestExecutionId() {}

  public UITestExecutionId(UUID id, Instant startedAt) {
    this.id = id;
    this.startedAt = startedAt;
  }

  public UUID getId() {
    return id;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) {
      return true;
    }
    if (!(other instanceof UITestExecutionId that)) {
      return false;
    }
    return Objects.equals(id, that.id) && Objects.equals(startedAt, that.startedAt);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id, startedAt);
  }

  @Override
  public String toString() {
    return "UITestExecutionId[" + id + " @ " + startedAt + "]";
  }
}
