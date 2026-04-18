package com.citi.put.checks.smoke;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class MaterializedViewIT {

  @Autowired private JdbcTemplate jdbc;

  @Test
  void csiMetricsAggregatesAfterRefresh() {
    String email = "mv-" + UUID.randomUUID() + "@citigroup.com";
    String csiId = String.valueOf(System.nanoTime() % 100_000_000L);

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) "
            + "VALUES (?, ?, 'MV', ?, ?, true)",
        UUID.randomUUID(),
        "sso-" + UUID.randomUUID(),
        email,
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality,"
            + " owner_email, environment, status, created_at, updated_at) "
            + "VALUES (?, 'MV CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)",
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    // 3 PASSING + 1 FAILING + 1 WARNING = 60% passing (3/5).
    insertCheck(csiId, email, "PASSING");
    insertCheck(csiId, email, "PASSING");
    insertCheck(csiId, email, "PASSING");
    insertCheck(csiId, email, "FAILING");
    insertCheck(csiId, email, "WARNING");

    jdbc.execute("REFRESH MATERIALIZED VIEW csi_metrics_current");

    Long total =
        jdbc.queryForObject(
            "SELECT total_checks FROM csi_metrics_current WHERE csi_id = ?", Long.class, csiId);
    Long passing =
        jdbc.queryForObject(
            "SELECT passing_checks FROM csi_metrics_current WHERE csi_id = ?", Long.class, csiId);
    BigDecimal health =
        jdbc.queryForObject(
            "SELECT health_percentage FROM csi_metrics_current WHERE csi_id = ?",
            BigDecimal.class,
            csiId);

    assertThat(total).isEqualTo(5L);
    assertThat(passing).isEqualTo(3L);
    assertThat(health).isEqualByComparingTo("60.0000000000000000");
  }

  private void insertCheck(String csiId, String email, String status) {
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status,"
            + " configuration, created_by, created_at, updated_at) "
            + "VALUES (?, 'MV Check', 'HTTP', ?, 'MV CSI', ?,"
            + " '{\"type\":\"HTTP\"}'::jsonb, ?, ?, ?)",
        UUID.randomUUID(),
        csiId,
        status,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
