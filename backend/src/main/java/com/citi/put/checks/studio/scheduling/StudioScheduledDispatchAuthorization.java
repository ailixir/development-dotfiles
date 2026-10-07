package com.citi.put.checks.studio.scheduling;

import com.citi.put.checks.studio.dispatch.DispatchAuthorization.AuthorizationRevokedException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Live unattended grant check remains active even when production of new due work is disabled. */
public class StudioScheduledDispatchAuthorization {
  private final StudioBackgroundAuthorization background;
  private final JdbcTemplate jdbc;

  public StudioScheduledDispatchAuthorization(
      StudioBackgroundAuthorization background, JdbcTemplate jdbc) {
    this.background = background;
    this.jdbc = jdbc;
  }

  public String recheck(
      UUID executionId, UUID testId, String csiId, String principal, String policy) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            """
            SELECT o.environment,o.execution_principal,o.test_id,o.csi_id
              FROM studio_dispatch_ledger l JOIN studio_schedule_occurrences o
                ON o.id=l.scheduled_occurrence_id WHERE l.execution_id=?
            """,
            executionId);
    if (rows.isEmpty()) {
      return policy;
    }
    Map<String, Object> row = rows.get(0);
    if (!testId.equals(row.get("test_id"))
        || !csiId.equals(row.get("csi_id"))
        || !principal.equals(row.get("execution_principal"))) {
      throw new AuthorizationRevokedException(
          "Scheduled execution provenance does not match its grant");
    }
    try {
      background.require(principal, csiId, (String) row.get("environment"));
    } catch (StudioScheduleException ex) {
      throw new AuthorizationRevokedException(
          "Scheduled background grant is unavailable or revoked");
    }
    return policy + "/background:" + principal;
  }
}
