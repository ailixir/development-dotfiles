package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.entity.UITestExecutionId;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * History repository for the range-partitioned {@code ui_test_executions} table (AC-13).
 *
 * <p>The physical key is {@code (id, started_at)}. Every lookup and update here carries the
 * partition key, either explicitly through {@link #findByIdAndStartedAt(UUID, Instant)} or by
 * resolving the locator from the dispatch ledger first through {@link
 * UITestExecutionRepositoryCustom#findByExecutionId(UUID)}. No query issues {@code WHERE id = ?}
 * alone.
 *
 * <p>Every list method filters on the execution's own {@code csi_id}, never the parent test's, and
 * never returns a row whose CSI is null — that is the quarantine predicate for history the V14
 * backfill could not resolve (AC-9, AC-14).
 */
public interface UITestExecutionRepository
    extends JpaRepository<UITestExecution, UITestExecutionId>, UITestExecutionRepositoryCustom {

  Optional<UITestExecution> findByIdAndStartedAt(UUID id, Instant startedAt);

  Page<UITestExecution> findByTestIdAndCsiIdIn(
      UUID testId, Collection<String> csiIds, Pageable pageable);

  Page<UITestExecution> findByCsiIdIn(Collection<String> csiIds, Pageable pageable);

  Page<UITestExecution> findByTestIdAndCsiIdIsNotNull(UUID testId, Pageable pageable);

  Page<UITestExecution> findByCsiIdIsNotNull(Pageable pageable);

  /**
   * Finished executions of one test, newest first by {@code (acceptedAt, executionId)}.
   *
   * <p>This is the ordering the last-run projection is defined against (AC-8): an older execution
   * completing late must not overwrite the projection a newer one already wrote.
   */
  @Query(
      """
      SELECT e FROM UITestExecution e
      WHERE e.testId = :testId
        AND e.status IN ('PASSED', 'FAILED', 'ERROR')
      ORDER BY e.startedAt DESC, e.id DESC
      """)
  List<UITestExecution> findTerminalNewestFirst(@Param("testId") UUID testId, Pageable pageable);
}
