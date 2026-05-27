package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class DefaultPartitionHealthIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired PartitionHealthIndicator healthIndicator;

  private UUID checkId;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void seed() {
    String email = "dph-" + UUID.randomUUID() + "@citigroup.com";
    String csiId = String.valueOf(System.nanoTime() % 100_000_000L);
    checkId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) "
            + "VALUES (?, ?, 'DPH User', ?, ?, true)",
        UUID.randomUUID(),
        "sso-" + UUID.randomUUID(),
        email,
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality,"
            + " owner_email, environment, status, created_at, updated_at) "
            + "VALUES (?, 'DPH CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)",
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status,"
            + " configuration, created_by, created_at, updated_at) "
            + "VALUES (?, 'DPH Check', 'HTTP', ?, 'DPH CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"https://example.com/health\"}'::jsonb, ?, ?, ?)",
        checkId,
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void healthReportsWarningWhenDefaultPartitionHasRows() {
    OffsetDateTime farFuture = OffsetDateTime.of(2029, 1, 15, 12, 0, 0, 0, ZoneOffset.UTC);
    jdbc.update(
        "INSERT INTO execution_results (id, check_id, status, started_at, ended_at,"
            + " duration_ms, created_at) VALUES (?, ?, 'SUCCESS', ?, ?, 100, ?)",
        UUID.randomUUID(),
        checkId,
        Timestamp.from(farFuture.toInstant()),
        Timestamp.from(farFuture.plusSeconds(1).toInstant()),
        Timestamp.from(Instant.now()));

    Health health = healthIndicator.health();
    assertThat(health.getStatus()).isEqualTo(new Status("WARNING"));
    assertThat(health.getDetails()).containsKey("execution_results_default_rows");
    assertThat(health.getDetails().get("execution_results_default_rows").toString())
        .contains("data landed in default partition");

    jdbc.update("DELETE FROM execution_results_default");
  }

  @Test
  void healthReportsUpWhenDefaultPartitionsAreEmpty() {
    jdbc.update("DELETE FROM execution_results_default");
    jdbc.update("DELETE FROM ui_test_executions_default");
    jdbc.update("DELETE FROM report_executions_default");

    Health health = healthIndicator.health();
    assertThat(health.getStatus()).isEqualTo(Status.UP);
  }
}
