package com.citi.put.checks.studio.scheduling;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Called only under the existing authoring test lock; does not depend on capability enablement. */
@Component
public class StudioScheduleInvalidation {
  private final JdbcTemplate jdbc;

  public StudioScheduleInvalidation(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void invalidate(UUID testId, String code) {
    jdbc.queryForList("SELECT id FROM studio_schedules WHERE test_id = ? FOR UPDATE", testId);
    settle(testId, "REFUSED", code);
    jdbc.update(
        """
        UPDATE studio_schedules SET state='BLOCKED', blocked_code=?, version=version+1,
               updated_at=now()
         WHERE test_id=? AND requested_enabled=true AND deleted_at IS NULL
           AND (state <> 'BLOCKED' OR blocked_code IS DISTINCT FROM ?)
        """,
        code,
        testId,
        code);
  }

  public void settle(UUID testId, String decision, String code) {
    jdbc.update(
        """
        UPDATE studio_schedule_occurrences SET decision=?,code=?,retry_at=NULL,
               retry_attempts=0,updated_at=now()
         WHERE test_id=? AND decision='DEFERRED'
        """,
        decision,
        code,
        testId);
  }
}
