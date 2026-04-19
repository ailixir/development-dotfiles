package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class CronDispatcherDisabledIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired CronDispatcher cronDispatcher;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.dispatcher-enabled", () -> "true");
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  private UUID checkId;

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    seedUser("disabled-owner@citi.com");
    seedCsi("61001", "Disabled CSI");
    checkId = seedHttpCheck("61001", "disabled-owner@citi.com");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "disabled-user",
          "email": "disabled-owner@citi.com",
          "name": "Disabled Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "61001", "role": "owner"}]
        }
        """)));
  }

  @Test
  void disabledScheduleNotDispatched() throws Exception {
    Instant pastTime = Instant.now().minus(1, ChronoUnit.MINUTES);
    seedSchedule(checkId, "0 */5 * * * *", "UTC", false, pastTime);

    cronDispatcher.pollAndDispatch();

    Thread.sleep(1000);

    List<Map<String, Object>> results =
        jdbc.queryForList("SELECT * FROM execution_results WHERE check_id = ?", checkId);
    assertThat(results).isEmpty();
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Test', ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', 'disabled-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedHttpCheck(String csiId, String createdBy) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, 'Disabled Check', 'HTTP', ?, 'Disabled CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"https://example.com\"}'::jsonb,"
            + " ?, ?, ?)",
        id,
        csiId,
        createdBy,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedSchedule(
      UUID forCheckId, String cron, String tz, boolean enabled, Instant nextExecutionAt) {
    jdbc.update(
        "INSERT INTO schedules (id, check_id, frequency, cron_expression, timezone, enabled,"
            + " next_execution_at, created_at, updated_at)"
            + " VALUES (?, ?, 'custom', ?, ?, ?, ?, ?, ?)",
        UUID.randomUUID(),
        forCheckId,
        cron,
        tz,
        enabled,
        Timestamp.from(nextExecutionAt),
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
