package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITestExecution;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Ledger-backed single-execution lookup (AC-13) and the searchable history list (Story 10.46). */
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

  /**
   * One page of execution history matching {@code query}, ordered by its sort and then by id.
   *
   * <p>Scoping is the execution's own immutable {@code csi_id}, never the parent test's, applied in
   * the same statement as the filters and before paging (AC-14). A row whose CSI is null is
   * quarantined history and is never returned, whatever the scope (AC-9). {@code query.csiId()} is
   * an additional equality on that same column, so it can only narrow {@code readableCsiIds}.
   *
   * @param query validated filters and sort; the {@code pageable} sort is ignored
   * @param readableCsiIds the caller's scope, or null when unrestricted
   * @param pageable page number and size only
   * @return the page
   */
  Page<UITestExecution> findPage(
      StudioListQuery.Executions query, Collection<String> readableCsiIds, Pageable pageable);
}
