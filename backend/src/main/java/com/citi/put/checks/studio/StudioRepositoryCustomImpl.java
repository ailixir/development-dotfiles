package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.support.PageableExecutionUtils;
import org.springframework.stereotype.Repository;

/**
 * JPQL implementation of {@link StudioRepositoryCustom}.
 *
 * <p>The statement is assembled from fixed fragments only; every caller-supplied value is a bound
 * parameter and the sort comes from the {@link StudioListQuery.TestSort} enumeration, so no request
 * text reaches the query string. Building it here rather than as one {@code &#64;Query} with {@code
 * (:x IS NULL OR …)} guards keeps absent filters out of the plan and allows the {@code NULLS LAST}
 * and {@code LOWER(name)} orderings a derived {@code Sort} cannot express.
 */
@Repository
public class StudioRepositoryCustomImpl implements StudioRepositoryCustom {

  @PersistenceContext private EntityManager entityManager;

  @Override
  public Page<UITest> findPage(
      StudioListQuery.Tests query, Collection<String> readableCsiIds, Pageable pageable) {
    Map<String, Object> parameters = new LinkedHashMap<>();
    String where = where(query, readableCsiIds, parameters);

    TypedQuery<UITest> select =
        entityManager.createQuery("SELECT t FROM UITest t" + where + orderBy(query), UITest.class);
    parameters.forEach(select::setParameter);
    List<UITest> content =
        select
            .setFirstResult((int) pageable.getOffset())
            .setMaxResults(pageable.getPageSize())
            .getResultList();

    return PageableExecutionUtils.getPage(
        content,
        pageable,
        () -> {
          TypedQuery<Long> count =
              entityManager.createQuery("SELECT COUNT(t) FROM UITest t" + where, Long.class);
          parameters.forEach(count::setParameter);
          return count.getSingleResult();
        });
  }

  private static String where(
      StudioListQuery.Tests query,
      Collection<String> readableCsiIds,
      Map<String, Object> parameters) {
    StringBuilder where = new StringBuilder(" WHERE 1 = 1");
    if (readableCsiIds != null) {
      where.append(" AND t.csiId IN :readableCsiIds");
      parameters.put("readableCsiIds", readableCsiIds);
    }
    if (query.csiId() != null) {
      where.append(" AND t.csiId = :csiId");
      parameters.put("csiId", query.csiId());
    }
    if (query.environment() != null) {
      where.append(" AND t.environment = :environment");
      parameters.put("environment", query.environment());
    }
    if (query.search() != null) {
      where.append(
          " AND (LOWER(t.name) LIKE :search ESCAPE '!'"
              + " OR LOWER(COALESCE(t.description, '')) LIKE :search ESCAPE '!')");
      parameters.put("search", StudioListQuery.containsPattern(query.search()));
    }
    if (query.lastRun() != null) {
      if (StudioListQuery.NEVER.equals(query.lastRun())) {
        // The projection writes status and instant together (StudioService#applyLastRunProjection),
        // so a null status is exactly "no finished run yet".
        where.append(" AND t.lastRunStatus IS NULL");
      } else {
        where.append(" AND t.lastRunStatus = :lastRun");
        parameters.put("lastRun", query.lastRun());
      }
    }
    return where.toString();
  }

  /** The primary order, then the id in the same direction, so equal keys page deterministically. */
  private static String orderBy(StudioListQuery.Tests query) {
    String direction = query.ascending() ? "ASC" : "DESC";
    return " ORDER BY " + primaryOrder(query.sort(), direction) + ", t.id " + direction;
  }

  private static String primaryOrder(StudioListQuery.TestSort sort, String direction) {
    switch (sort) {
      case NAME:
        return "LOWER(t.name) " + direction;
      case LAST_RUN_AT:
        // Never-run drafts have no instant; they trail in both directions.
        return "t.lastRunAt " + direction + " NULLS LAST";
      case UPDATED_AT:
      default:
        return "t.updatedAt " + direction;
    }
  }
}
