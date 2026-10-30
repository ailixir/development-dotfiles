package com.citi.put.checks.studio.internal;

import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.internal.dto.ExecutionControl;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Answers {@code GET /internal/studio/executions/{id}/control} (Studio v1 WP4, ADR-002 §29).
 *
 * <p>A single read of the write-once {@code cancel_requested_at}. It writes nothing, so a runner
 * polling it every two seconds costs one primary-key lookup per active run.
 */
@Service
public class ExecutionControlService {

  private final StudioDispatchLedgerStatements statements;

  public ExecutionControlService(StudioDispatchLedgerStatements statements) {
    this.statements = statements;
  }

  /**
   * The control state of one execution.
   *
   * @throws InternalCallbackException {@code 404 EXECUTION_UNKNOWN} for an id with no ledger row
   */
  public ExecutionControl control(UUID executionId) {
    return statements
        .find(executionId)
        .map(
            row ->
                new ExecutionControl(
                    executionId,
                    row.get("cancel_requested_at") != null,
                    row.get("revoked_at") != null))
        .orElseThrow(
            () ->
                InternalCallbackException.notFound(
                    InternalCallbackCodes.EXECUTION_UNKNOWN, "No execution with this id"));
  }
}
