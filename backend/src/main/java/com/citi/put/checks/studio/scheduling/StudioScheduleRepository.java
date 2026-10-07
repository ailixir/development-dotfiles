package com.citi.put.checks.studio.scheduling;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** JDBC keeps schedule locks and snapshots explicit, outside Hibernate's entity cache. */
@Repository
public class StudioScheduleRepository {
  static final String OCCURRENCE_SELECT =
      """
      SELECT o.*, a.activated_by, a.activated_at,
             l.execution_id, l.execution_accepted_at
        FROM studio_schedule_occurrences o
        JOIN studio_schedule_activations a ON a.id = o.activation_id
        LEFT JOIN studio_dispatch_ledger l ON l.scheduled_occurrence_id = o.id
      """;
  private final JdbcTemplate jdbc;

  public StudioScheduleRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public JdbcTemplate jdbc() {
    return jdbc;
  }

  public Optional<Map<String, Object>> test(UUID id, boolean lock) {
    List<Map<String, Object>> rows =
        jdbc.queryForList("SELECT * FROM ui_tests WHERE id = ?" + (lock ? " FOR UPDATE" : ""), id);
    return rows.stream().findFirst();
  }

  public Optional<Map<String, Object>> schedule(UUID testId, boolean lock) {
    return jdbc
        .queryForList(
            "SELECT * FROM studio_schedules WHERE test_id = ?" + (lock ? " FOR UPDATE" : ""),
            testId)
        .stream()
        .findFirst();
  }

  public Optional<Map<String, Object>> deferred(UUID scheduleId, boolean lock) {
    return jdbc
        .queryForList(
            "SELECT * FROM studio_schedule_occurrences WHERE schedule_id = ? AND decision ="
                + " 'DEFERRED'"
                + (lock ? " FOR UPDATE" : ""),
            scheduleId)
        .stream()
        .findFirst();
  }

  public List<UUID> uncertainties(UUID testId, UUID scheduleId) {
    return jdbc.queryForList(
        """
        SELECT l.execution_id FROM studio_dispatch_ledger l
         WHERE l.test_id = ? AND l.state = 'DONE'
           AND l.terminal_error_code IN ('DISPATCH_UNKNOWN','START_TIMEOUT','STALE')
           AND NOT EXISTS (SELECT 1 FROM studio_schedule_uncertainty_ack a
                            WHERE a.schedule_id = ? AND a.execution_id = l.execution_id)
         ORDER BY l.execution_id
        """,
        UUID.class,
        testId,
        scheduleId);
  }

  public boolean active(UUID testId) {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM studio_dispatch_ledger WHERE test_id = ? AND state <>"
                + " 'DONE')",
            Boolean.class,
            testId));
  }

  public StudioScheduleDtos.Schedule project(Map<String, Object> row) {
    UUID id = uuid(row, "id");
    List<UUID> uncertainty = uncertainties(uuid(row, "test_id"), id);
    String effectiveState = string(row, "state");
    String blockedCode = string(row, "blocked_code");
    if (Boolean.TRUE.equals(row.get("requested_enabled")) && !uncertainty.isEmpty()) {
      // The durable terminal marker already forbids new acceptance; make that effective block
      // visible before the next nominal due tick without writing from a read endpoint.
      effectiveState = "BLOCKED";
      blockedCode = "UNCERTAIN_EXECUTION";
    }
    Map<String, Object> activation =
        uuid(row, "activation_id") == null
            ? Map.of()
            : jdbc.queryForMap(
                "SELECT activated_by, activated_at FROM studio_schedule_activations WHERE id = ?",
                uuid(row, "activation_id"));
    List<StudioScheduleDtos.Occurrence> latest =
        jdbc.query(
            OCCURRENCE_SELECT
                + " WHERE o.schedule_id = ? ORDER BY o.scheduled_at DESC, o.id DESC LIMIT 1",
            this::occurrence,
            id);
    return new StudioScheduleDtos.Schedule(
        id,
        uuid(row, "test_id"),
        string(row, "csi_id"),
        number(row, "version"),
        string(row, "cron_expression"),
        string(row, "time_zone"),
        string(row, "execution_principal"),
        effectiveState,
        Boolean.TRUE.equals(row.get("requested_enabled")),
        blockedCode,
        uuid(row, "activated_revision_id"),
        uuid(row, "activation_id"),
        string(activation, "activated_by"),
        instant(activation, "activated_at"),
        instant(row, "next_due_at"),
        instant(row, "poll_after_at"),
        instant(row, "deleted_at"),
        instant(row, "created_at"),
        instant(row, "updated_at"),
        uncertainty,
        latest.isEmpty() ? null : latest.get(0));
  }

  public StudioScheduleDtos.Page<StudioScheduleDtos.Occurrence> occurrences(
      UUID testId, int page, int size) {
    Long total =
        jdbc.queryForObject(
            "SELECT count(*) FROM studio_schedule_occurrences WHERE test_id = ?",
            Long.class,
            testId);
    List<StudioScheduleDtos.Occurrence> data =
        jdbc.query(
            OCCURRENCE_SELECT
                + " WHERE o.test_id = ? ORDER BY o.scheduled_at DESC, o.id DESC LIMIT ? OFFSET ?",
            this::occurrence,
            testId,
            size,
            (long) page * size);
    long count = total == null ? 0 : total;
    return new StudioScheduleDtos.Page<>(data, page, size, count, (count + size - 1) / size);
  }

  private StudioScheduleDtos.Occurrence occurrence(ResultSet r, int ignored) throws SQLException {
    Long count = r.getObject("missed_count", Long.class);
    return new StudioScheduleDtos.Occurrence(
        r.getObject("id", UUID.class),
        r.getObject("schedule_id", UUID.class),
        r.getLong("schedule_version"),
        r.getObject("test_id", UUID.class),
        r.getString("csi_id"),
        r.getString("environment"),
        r.getString("execution_principal"),
        r.getObject("activation_id", UUID.class),
        r.getObject("activated_revision_id", UUID.class),
        r.getString("activated_by"),
        time(r, "activated_at"),
        time(r, "scheduled_at"),
        r.getTimestamp("local_scheduled_at").toLocalDateTime(),
        r.getString("time_zone"),
        r.getInt("offset_seconds"),
        r.getString("decision"),
        r.getString("code"),
        r.getObject("execution_id", UUID.class),
        time(r, "execution_accepted_at"),
        time(r, "retry_at"),
        time(r, "grace_expires_at"),
        time(r, "created_at"),
        time(r, "updated_at"),
        time(r, "missed_from"),
        time(r, "missed_until"),
        count);
  }

  private static Instant time(ResultSet r, String field) throws SQLException {
    Timestamp value = r.getTimestamp(field);
    return value == null ? null : value.toInstant();
  }

  static Instant instant(Map<String, Object> row, String field) {
    Object value = row.get(field);
    return value instanceof Timestamp t ? t.toInstant() : value instanceof Instant i ? i : null;
  }

  static UUID uuid(Map<String, Object> row, String field) {
    return (UUID) row.get(field);
  }

  static String string(Map<String, Object> row, String field) {
    Object value = row.get(field);
    return value == null ? null : value.toString();
  }

  static long number(Map<String, Object> row, String field) {
    return ((Number) row.get(field)).longValue();
  }

  static Timestamp timestamp(Instant time) {
    return time == null ? null : Timestamp.from(time);
  }
}
