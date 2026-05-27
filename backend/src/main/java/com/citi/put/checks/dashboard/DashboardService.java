package com.citi.put.checks.dashboard;

import com.citi.put.checks.config.CheckSourceProperties;
import com.citi.put.checks.dashboard.dto.ActivityItemDto;
import com.citi.put.checks.dashboard.dto.AttentionItemDto;
import com.citi.put.checks.dashboard.dto.DashboardSummaryDto;
import com.citi.put.checks.dashboard.dto.DashboardSummaryDto.DashboardCounts;
import com.citi.put.checks.dashboard.dto.ReportSnapshotDto;
import com.citi.put.checks.dashboard.dto.SearchResultDto;
import com.citi.put.checks.dashboard.dto.UpcomingItemDto;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class DashboardService {

  private static final Set<String> ADMIN_ROLES = Set.of("checks-admin", "platform-admin");

  private final EntityManager em;
  private final CheckSourceProperties sourceProperties;

  public DashboardService(EntityManager em, CheckSourceProperties sourceProperties) {
    this.em = em;
    this.sourceProperties = sourceProperties;
  }

  public DashboardSummaryDto getSummary(UserIdentity identity, String csiId) {
    boolean admin = isAdmin(identity);
    List<String> ownedCsiIds = resolveOwnedCsiIds(identity, admin);

    List<String> enabledTypes = sourceProperties.enabledTypeNames();

    StringBuilder sql =
        new StringBuilder(
            """
        SELECT c.status, COUNT(*) AS cnt
        FROM checks c
        WHERE c.deleted_at IS NULL
          AND c.type IN (:enabledTypes)
        """);
    if (csiId != null) {
      sql.append(" AND c.csi_id = :csiId");
    }
    if (!admin) {
      sql.append(" AND c.csi_id IN (:ownedCsiIds)");
    }
    sql.append(" GROUP BY c.status");

    Query query = em.createNativeQuery(sql.toString());
    query.setParameter("enabledTypes", enabledTypes);
    if (csiId != null) {
      query.setParameter("csiId", csiId);
    }
    if (!admin) {
      query.setParameter("ownedCsiIds", ownedCsiIds);
    }

    @SuppressWarnings("unchecked")
    List<Object[]> rows = query.getResultList();

    int passing = 0;
    int failing = 0;
    int warning = 0;

    for (Object[] row : rows) {
      String status = (String) row[0];
      int count = ((Number) row[1]).intValue();
      switch (status) {
        case "PASSING" -> passing = count;
        case "FAILING" -> failing = count;
        case "WARNING" -> warning = count;
        default -> {
          /* PENDING, UNKNOWN — not counted in dashboard summary */
        }
      }
    }

    int muted = countMutedChecks(identity, admin, ownedCsiIds, csiId);

    String overallStatus;
    if (failing > 0) {
      overallStatus = "CRITICAL";
    } else if (warning > 0) {
      overallStatus = "WARNING";
    } else {
      overallStatus = "HEALTHY";
    }

    return new DashboardSummaryDto(
        overallStatus, new DashboardCounts(passing, failing, warning, muted), Instant.now());
  }

  public List<AttentionItemDto> getAttentionItems(UserIdentity identity, String csiId, int limit) {
    boolean admin = isAdmin(identity);
    List<String> ownedCsiIds = resolveOwnedCsiIds(identity, admin);
    List<String> enabledTypes = sourceProperties.enabledTypeNames();

    StringBuilder sql =
        new StringBuilder(
            """
        SELECT c.id, c.name, c.csi_id, c.csi_name, c.status,
               er.started_at AS since,
               COALESCE(er.error_message, 'Threshold exceeded') AS reason,
               c.assigned_to
        FROM checks c
        LEFT JOIN LATERAL (
            SELECT er2.started_at, er2.error_message
            FROM execution_results er2
            WHERE er2.check_id = c.id
            ORDER BY er2.started_at DESC
            LIMIT 1
        ) er ON true
        WHERE c.deleted_at IS NULL
          AND c.acknowledged_at IS NULL
          AND c.status IN ('FAILING', 'WARNING')
          AND c.type IN (:enabledTypes)
        """);

    if (csiId != null) {
      sql.append(" AND c.csi_id = :csiId");
    }
    if (!admin) {
      sql.append(" AND c.csi_id IN (:ownedCsiIds)");
    }
    sql.append(" ORDER BY c.created_at DESC LIMIT :limit");

    Query query = em.createNativeQuery(sql.toString());
    query.setParameter("enabledTypes", enabledTypes);
    if (csiId != null) {
      query.setParameter("csiId", csiId);
    }
    if (!admin) {
      query.setParameter("ownedCsiIds", ownedCsiIds);
    }
    query.setParameter("limit", Math.min(limit, 100));

    @SuppressWarnings("unchecked")
    List<Object[]> rows = query.getResultList();

    return rows.stream()
        .map(
            row ->
                new AttentionItemDto(
                    row[0].toString(),
                    (String) row[1],
                    (String) row[2],
                    (String) row[3],
                    (String) row[4],
                    row[5] != null ? toInstant(row[5]) : null,
                    (String) row[6],
                    (String) row[7]))
        .toList();
  }

  public List<ActivityItemDto> getActivityItems(UserIdentity identity, String csiId, int hours) {
    boolean admin = isAdmin(identity);
    List<String> ownedCsiIds = resolveOwnedCsiIds(identity, admin);
    Instant since = Instant.now().minus(hours, ChronoUnit.HOURS);

    StringBuilder sql =
        new StringBuilder(
            """
        SELECT er.id, er.status, c.name, c.csi_name, er.started_at, er.error_message, c.id AS check_id
        FROM execution_results er
        JOIN checks c ON c.id = er.check_id
        WHERE er.started_at >= :since
          AND c.deleted_at IS NULL
        """);

    if (csiId != null) {
      sql.append(" AND c.csi_id = :csiId");
    }
    if (!admin) {
      sql.append(" AND c.csi_id IN (:ownedCsiIds)");
    }
    sql.append(" ORDER BY er.started_at DESC");

    Query query = em.createNativeQuery(sql.toString());
    query.setParameter("since", since);
    if (csiId != null) {
      query.setParameter("csiId", csiId);
    }
    if (!admin) {
      query.setParameter("ownedCsiIds", ownedCsiIds);
    }

    @SuppressWarnings("unchecked")
    List<Object[]> rows = query.getResultList();

    return rows.stream()
        .map(
            row -> {
              String erStatus = (String) row[1];
              boolean isFail =
                  "FAILURE".equals(erStatus) || "TIMEOUT".equals(erStatus);
              String checkName = (String) row[2];
              String csiName = (String) row[3];
              String errorMessage = (String) row[5];
              String checkId = row[6].toString();

              String title = isFail ? checkName + " failed" : checkName + " recovered";
              String description =
                  isFail
                      ? (errorMessage != null ? errorMessage : "Check execution failed")
                      : "Check is now passing";
              String path = "/checks/details/" + checkId;

              return new ActivityItemDto(
                  row[0].toString(), "EXECUTION", title, description, csiName,
                  toInstant(row[4]), path);
            })
        .toList();
  }

  public List<UpcomingItemDto> getUpcomingItems(UserIdentity identity, String csiId, int limit) {
    boolean admin = isAdmin(identity);
    List<String> ownedCsiIds = resolveOwnedCsiIds(identity, admin);

    StringBuilder sql =
        new StringBuilder(
            """
        SELECT s.check_id, c.name, s.next_execution_at, c.csi_name
        FROM schedules s
        JOIN checks c ON c.id = s.check_id
        WHERE s.enabled = true
          AND s.next_execution_at IS NOT NULL
          AND c.deleted_at IS NULL
        """);

    if (csiId != null) {
      sql.append(" AND c.csi_id = :csiId");
    }
    if (!admin) {
      sql.append(" AND c.csi_id IN (:ownedCsiIds)");
    }
    sql.append(" ORDER BY s.next_execution_at ASC LIMIT :limit");

    Query query = em.createNativeQuery(sql.toString());
    if (csiId != null) {
      query.setParameter("csiId", csiId);
    }
    if (!admin) {
      query.setParameter("ownedCsiIds", ownedCsiIds);
    }
    query.setParameter("limit", Math.min(limit, 100));

    @SuppressWarnings("unchecked")
    List<Object[]> rows = query.getResultList();

    return rows.stream()
        .map(
            row ->
                new UpcomingItemDto(
                    row[0].toString(), (String) row[1], toInstant(row[2]), (String) row[3]))
        .toList();
  }

  @Transactional(readOnly = false)
  public Instant acknowledgeCheck(String checkId) {
    Instant now = Instant.now();
    int updated =
        em.createNativeQuery("UPDATE checks SET acknowledged_at = :now WHERE id = CAST(:id AS uuid)")
            .setParameter("now", now)
            .setParameter("id", checkId)
            .executeUpdate();
    if (updated == 0) {
      throw new IllegalArgumentException("Check not found: " + checkId);
    }
    return now;
  }

  @Transactional(readOnly = false)
  public void assignCheck(String checkId, String assigneeEmail) {
    int updated =
        em.createNativeQuery(
                "UPDATE checks SET assigned_to = :email WHERE id = CAST(:id AS uuid)")
            .setParameter("email", assigneeEmail)
            .setParameter("id", checkId)
            .executeUpdate();
    if (updated == 0) {
      throw new IllegalArgumentException("Check not found: " + checkId);
    }
  }

  public List<ReportSnapshotDto> getReportsSnapshot(String csiId, int limit) {
    try {
      StringBuilder sql =
          new StringBuilder(
              """
          SELECT r.id, r.name, r.next_delivery_at,
                 (SELECT re.status FROM report_executions re
                  WHERE re.report_id = r.id ORDER BY re.executed_at DESC LIMIT 1)
          FROM reports r
          WHERE r.deleted_at IS NULL
            AND r.status = 'active'
          """);
      if (csiId != null) {
        sql.append(
            " AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.sections) s WHERE s->>'csiId' = :csiId)");
      }
      sql.append(" ORDER BY r.next_delivery_at ASC NULLS LAST LIMIT :limit");

      Query query = em.createNativeQuery(sql.toString());
      if (csiId != null) {
        query.setParameter("csiId", csiId);
      }
      query.setParameter("limit", Math.min(limit, 50));

      @SuppressWarnings("unchecked")
      List<Object[]> rows = query.getResultList();

      return rows.stream()
          .map(
              row ->
                  new ReportSnapshotDto(
                      row[0].toString(),
                      (String) row[1],
                      row[2] != null ? toInstant(row[2]) : null,
                      (String) row[3]))
          .toList();
    } catch (jakarta.persistence.PersistenceException e) {
      return List.of();
    }
  }

  public List<SearchResultDto> search(UserIdentity identity, String queryStr, String csiId) {
    boolean admin = isAdmin(identity);
    List<String> ownedCsiIds = resolveOwnedCsiIds(identity, admin);
    String pattern = "%" + queryStr.toLowerCase() + "%";

    List<SearchResultDto> results = new ArrayList<>();

    // Search checks (max 10)
    StringBuilder checkSql =
        new StringBuilder(
            """
        SELECT c.id, c.name, c.csi_name, c.type
        FROM checks c
        WHERE c.deleted_at IS NULL
          AND LOWER(c.name) LIKE :pattern
        """);
    if (csiId != null) {
      checkSql.append(" AND c.csi_id = :csiId");
    }
    if (!admin) {
      checkSql.append(" AND c.csi_id IN (:ownedCsiIds)");
    }
    checkSql.append(" ORDER BY c.name LIMIT 10");

    Query checkQuery = em.createNativeQuery(checkSql.toString());
    checkQuery.setParameter("pattern", pattern);
    if (csiId != null) {
      checkQuery.setParameter("csiId", csiId);
    }
    if (!admin) {
      checkQuery.setParameter("ownedCsiIds", ownedCsiIds);
    }

    @SuppressWarnings("unchecked")
    List<Object[]> checkRows = checkQuery.getResultList();
    for (Object[] row : checkRows) {
      results.add(
          new SearchResultDto(
              row[0].toString(),
              "CHECK",
              (String) row[1],
              (String) row[2],
              "/checks/" + row[0].toString()));
    }

    // Search CSIs (max 10)
    StringBuilder csiSql =
        new StringBuilder(
            """
        SELECT cs.id, cs.name, cs.business_unit
        FROM csi_systems cs
        WHERE cs.deleted_at IS NULL
          AND LOWER(cs.name) LIKE :pattern
        """);
    if (csiId != null) {
      csiSql.append(" AND cs.id = :csiId");
    }
    if (!admin) {
      csiSql.append(" AND cs.id IN (:ownedCsiIds)");
    }
    csiSql.append(" ORDER BY cs.name LIMIT 10");

    Query csiQuery = em.createNativeQuery(csiSql.toString());
    csiQuery.setParameter("pattern", pattern);
    if (csiId != null) {
      csiQuery.setParameter("csiId", csiId);
    }
    if (!admin) {
      csiQuery.setParameter("ownedCsiIds", ownedCsiIds);
    }

    @SuppressWarnings("unchecked")
    List<Object[]> csiRows = csiQuery.getResultList();
    for (Object[] row : csiRows) {
      results.add(
          new SearchResultDto(
              (String) row[0], "CSI", (String) row[1], (String) row[2], "/csi/" + row[0]));
    }

    return results;
  }

  private int countMutedChecks(
      UserIdentity identity, boolean admin, List<String> ownedCsiIds, String csiId) {
    StringBuilder sql =
        new StringBuilder(
            """
        SELECT COUNT(DISTINCT c.id)
        FROM checks c
        JOIN check_tags ct ON ct.check_id = c.id
        JOIN tags t ON t.id = ct.tag_id
        WHERE c.deleted_at IS NULL
          AND LOWER(t.name) = 'muted'
        """);
    if (csiId != null) {
      sql.append(" AND c.csi_id = :csiId");
    }
    if (!admin) {
      sql.append(" AND c.csi_id IN (:ownedCsiIds)");
    }

    Query query = em.createNativeQuery(sql.toString());
    if (csiId != null) {
      query.setParameter("csiId", csiId);
    }
    if (!admin) {
      query.setParameter("ownedCsiIds", ownedCsiIds);
    }

    return ((Number) query.getSingleResult()).intValue();
  }

  private boolean isAdmin(UserIdentity identity) {
    return identity.roles().stream().anyMatch(ADMIN_ROLES::contains);
  }

  private List<String> resolveOwnedCsiIds(UserIdentity identity, boolean admin) {
    if (admin) {
      return List.of();
    }
    List<String> ids =
        identity.csiOwnership().stream().map(CsiOwnershipEntry::csiId).collect(Collectors.toList());
    return ids.isEmpty() ? List.of("__none__") : ids;
  }

  private Instant toInstant(Object value) {
    if (value instanceof Instant instant) {
      return instant;
    }
    if (value instanceof java.sql.Timestamp ts) {
      return ts.toInstant();
    }
    if (value instanceof java.time.OffsetDateTime odt) {
      return odt.toInstant();
    }
    return Instant.parse(value.toString());
  }
}
