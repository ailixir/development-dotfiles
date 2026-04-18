package com.citi.put.checks.smoke;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class TriggersIT {

  @Autowired private JdbcTemplate jdbc;

  private String userEmail;
  private String csiId;
  private UUID checkId;

  @BeforeEach
  void seed() {
    userEmail = "trig-" + UUID.randomUUID() + "@citigroup.com";
    csiId = String.valueOf(System.nanoTime() % 100_000_000L);
    checkId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) "
            + "VALUES (?, ?, 'Trig', ?, ?, true)",
        UUID.randomUUID(),
        "sso-" + UUID.randomUUID(),
        userEmail,
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality,"
            + " owner_email, environment, status, created_at, updated_at) "
            + "VALUES (?, 'Trig CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)",
        csiId,
        userEmail,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status,"
            + " configuration, created_by, created_at, updated_at) "
            + "VALUES (?, 'Trig Check', 'HTTP', ?, 'Trig CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\"}'::jsonb, ?, ?, ?)",
        checkId,
        csiId,
        userEmail,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void updatedAtTriggerBumpsTimestampOnUpdate() throws InterruptedException {
    Instant before =
        jdbc.queryForObject(
            "SELECT updated_at FROM csi_systems WHERE id = ?", Instant.class, csiId);
    Thread.sleep(10);
    jdbc.update("UPDATE csi_systems SET name = 'Trig CSI (renamed)' WHERE id = ?", csiId);
    Instant after =
        jdbc.queryForObject(
            "SELECT updated_at FROM csi_systems WHERE id = ?", Instant.class, csiId);
    assertThat(after).isAfter(before);
  }

  @Test
  void checkStatusCascadesFromExecutionInsert() {
    OffsetDateTime when = OffsetDateTime.of(2026, 4, 20, 10, 0, 0, 0, ZoneOffset.UTC);
    jdbc.update(
        "INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, created_at) "
            + "VALUES (?, ?, 'FAILURE', ?, ?, 200, ?)",
        UUID.randomUUID(),
        checkId,
        Timestamp.from(when.toInstant()),
        Timestamp.from(when.plusSeconds(1).toInstant()),
        Timestamp.from(Instant.now()));

    String status =
        jdbc.queryForObject("SELECT status FROM checks WHERE id = ?", String.class, checkId);
    Instant lastExec =
        jdbc.queryForObject(
            "SELECT last_execution_at FROM checks WHERE id = ?", Instant.class, checkId);

    assertThat(status).isEqualTo("FAILING");
    assertThat(lastExec).isNotNull();
  }
}
