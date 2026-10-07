package com.citi.put.checks.studio;

import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.entity.UITestExecutionId;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import java.time.Instant;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.stereotype.Repository;

/**
 * Ledger-first implementation of {@link UITestExecutionRepositoryCustom}.
 *
 * <p>The list statement is assembled from fixed fragments only: every caller-supplied value is a
 * bound parameter and the sort comes from {@link StudioListQuery.ExecutionSort}, so no request text
 * reaches the query string.
 */
@Repository
public class UITestExecutionRepositoryCustomImpl implements UITestExecutionRepositoryCustom {

  @PersistenceContext private EntityManager entityManager;

  @Override
  public Optional<UITestExecution> findByExecutionId(UUID executionId) {
    List<Instant> locator =
        entityManager
            .createQuery(
                "SELECT l.executionAcceptedAt FROM StudioDispatchLedger l "
                    + "WHERE l.executionId = :executionId",
                Instant.class)
            .setParameter("executionId", executionId)
            .setMaxResults(1)
            .getResultList();
    if (locator.isEmpty()) {
      return Optional.empty();
    }
    return Optional.ofNullable(
        entityManager.find(
            UITestExecution.class, new UITestExecutionId(executionId, locator.get(0))));
  }

  @Override
  public Page<UITestExecution> findPage(
      StudioListQuery.Executions query, Collection<String> readableCsiIds, Pageable pageable) {
    Map<String, Object> parameters = new LinkedHashMap<>();
    String where = where(query, readableCsiIds, parameters);

    TypedQuery<UITestExecution> select =
        entityManager.createQuery(
            "SELECT e FROM UITestExecution e" + where + orderBy(query), UITestExecution.class);
    parameters.forEach(select::setParameter);
    List<UITestExecution> content =
        select
            .setFirstResult((int) pageable.getOffset())
            .setMaxResults(pageable.getPageSize())
            .getResultList();

    return PageableExecutionUtils.getPage(
        content,
        pageable,
        () -> {
          TypedQuery<Long> count =
              entityManager.createQuery(
                  "SELECT COUNT(e) FROM UITestExecution e" + where, Long.class);
          parameters.forEach(count::setParameter);
          return count.getSingleResult();
        });
  }

  private static String where(
      StudioListQuery.Executions query,
      Collection<String> readableCsiIds,
      Map<String, Object> parameters) {
    StringBuilder where = new StringBuilder(" WHERE e.csiId IS NOT NULL");
    if (readableCsiIds != null) {
      where.append(" AND e.csiId IN :readableCsiIds");
      parameters.put("readableCsiIds", readableCsiIds);
    }
    if (query.csiId() != null) {
      where.append(" AND e.csiId = :csiId");
      parameters.put("csiId", query.csiId());
    }
    if (query.testId() != null) {
      where.append(" AND e.testId = :testId");
      parameters.put("testId", query.testId());
    }
    if (query.status() != null) {
      appendStatus(query.status(), where, parameters);
    }
    if (query.search() != null) {
      // Only visible drafts carry a name (the subquery honours UITest's @SQLRestriction), which is
      // the same rule that leaves testName null on runs of a deleted test.
      where.append(
          " AND e.testId IN (SELECT t.id FROM UITest t WHERE LOWER(t.name) LIKE :search"
              + " ESCAPE '!')");
      parameters.put("search", StudioListQuery.containsPattern(query.search()));
    }
    return where.toString();
  }

  /**
   * A cancelled run is persisted as {@code ERROR} with {@code errorCode = CANCELLED} and is shown
   * as "Cancelled" by the MFE ({@code isCancelledOutcome}). {@code CANCELLED} selects exactly those
   * rows and {@code ERROR} selects every other {@code ERROR}, so the two never overlap.
   */
  private static void appendStatus(
      String status, StringBuilder where, Map<String, Object> parameters) {
    if (StudioListQuery.CANCELLED.equals(status)) {
      where.append(" AND e.status = :errorStatus AND e.errorCode = :cancelled");
    } else if (ExecutionStatus.ERROR.equals(status)) {
      where.append(
          " AND e.status = :errorStatus AND (e.errorCode IS NULL OR e.errorCode <> :cancelled)");
    } else {
      where.append(" AND e.status = :status");
      parameters.put("status", status);
      return;
    }
    parameters.put("errorStatus", ExecutionStatus.ERROR);
    parameters.put("cancelled", ExecutionErrorCode.CANCELLED);
  }

  /** The primary order, then the id in the same direction, so equal keys page deterministically. */
  private static String orderBy(StudioListQuery.Executions query) {
    String direction = query.ascending() ? "ASC" : "DESC";
    return " ORDER BY " + primaryOrder(query.sort(), direction) + ", e.id " + direction;
  }

  private static String primaryOrder(StudioListQuery.ExecutionSort sort, String direction) {
    if (sort == StudioListQuery.ExecutionSort.DURATION_MS) {
      // Unfinished runs have no duration; they trail in both directions, newest first.
      return "e.durationMs " + direction + " NULLS LAST, e.startedAt DESC";
    }
    // startedAt is the immutable acceptance instant (public name acceptedAt).
    return "e.startedAt " + direction;
  }
}
