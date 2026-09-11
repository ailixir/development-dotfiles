package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITestExecution;
import java.util.Optional;
import java.util.UUID;

/** Ledger-backed single-execution lookup (AC-13). */
public interface UITestExecutionRepositoryCustom {

  /**
   * Resolves an execution id to its partition locator through {@code studio_dispatch_ledger}, then
   * loads the history row by its real composite key.
   *
   * <p>Returns empty when no ledger row exists. That is not a silent failure: V14 gives every
   * pre-existing execution with a CSI a locator, and quarantined null-CSI history is deliberately
   * unreachable from user-facing paths.
   */
  Optional<UITestExecution> findByExecutionId(UUID executionId);
}
