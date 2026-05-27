package com.citi.put.checks.scheduling;

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
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@ActiveProfiles("local")
@TestPropertySource(properties = "checks.metrics.concurrent-refresh=false")
class CsiMetricsRefreshIT {

  @Autowired private JdbcTemplate jdbc;
  @Autowired private CsiMetricsRefreshScheduler refreshScheduler;

  @Test
  void schedulerBeanIsLoaded() {
    assertThat(refreshScheduler).isNotNull();
  }

  @Test
  void refreshUpdatesViewAfterNewChecks() {
    String email = "refresh-" + UUID.randomUUID() + "@citigroup.com";
    String csiId = String.valueOf(System.nanoTime() % 100_000_000L);

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) "
            + "VALUES (?, ?, 'Refresh Test', ?, ?, true)",
        UUID.randomUUID(),
        "sso-" + UUID.randomUUID(),
        email,
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality,"
            + " owner_email, environment, status, created_at, updated_at) "
            + "VALUES (?, 'Refresh CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)",
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    insertCheck(csiId, email, "PASSING");
    insertCheck(csiId, email, "FAILING");

    jdbc.execute("REFRESH MATERIALIZED VIEW csi_metrics_current");

    Long total =
        jdbc.queryForObject(
            "SELECT total_checks FROM csi_metrics_current WHERE csi_id = ?", Long.class, csiId);
    assertThat(total).isEqualTo(2L);

    insertCheck(csiId, email, "PASSING");
    insertCheck(csiId, email, "PASSING");

    // Call the refresh via raw JDBC to verify data visibility
    jdbc.execute("REFRESH MATERIALIZED VIEW csi_metrics_current");

    Long updatedTotal =
        jdbc.queryForObject(
            "SELECT total_checks FROM csi_metrics_current WHERE csi_id = ?", Long.class, csiId);
    assertThat(updatedTotal).as("Direct JDBC refresh should see 4 checks").isEqualTo(4L);

    // Insert one more and verify via scheduler method
    insertCheck(csiId, email, "WARNING");
    refreshScheduler.refreshCsiMetrics();

    Long finalTotal =
        jdbc.queryForObject(
            "SELECT total_checks FROM csi_metrics_current WHERE csi_id = ?", Long.class, csiId);
    BigDecimal health =
        jdbc.queryForObject(
            "SELECT health_percentage FROM csi_metrics_current WHERE csi_id = ?",
            BigDecimal.class,
            csiId);

    assertThat(finalTotal).isEqualTo(5L);
    assertThat(health).isEqualByComparingTo("60.0000000000000000");
  }

  private void insertCheck(String csiId, String email, String status) {
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status,"
            + " configuration, created_by, created_at, updated_at) "
            + "VALUES (?, 'Refresh Check', 'HTTP', ?, 'Refresh CSI', ?,"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"https://example.com/health\"}'::jsonb, ?, ?, ?)",
        UUID.randomUUID(),
        csiId,
        status,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
