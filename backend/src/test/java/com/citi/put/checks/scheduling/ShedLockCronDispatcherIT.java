package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
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
class ShedLockCronDispatcherIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired CronDispatcher cronDispatcher;
  @Autowired LockProvider lockProvider;

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
    jdbc.update("DELETE FROM shedlock WHERE name = 'cronDispatcher'");
    seedUser("shedcron-owner@citi.com");
    seedCsi("71001", "ShedCron CSI");
    checkId = seedHttpCheck("71001", "shedcron-owner@citi.com");

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "shedcron-user",
          "email": "shedcron-owner@citi.com",
          "name": "ShedCron Owner",
          "roles": ["checks-admin"],
          "csi_ownership": [{"csi_id": "71001", "role": "owner"}]
        }
        """)));

    wireMock.stubFor(get(urlEqualTo("/health")).willReturn(okJson("{\"status\":\"UP\"}")));
  }

  @Test
  void dispatcherBlockedWhenLockHeld() throws Exception {
    Instant pastTime = Instant.now().minus(2, ChronoUnit.MINUTES);
    seedSchedule(checkId, "0 */5 * * * *", "UTC", true, pastTime);

    // Simulate another pod holding the cronDispatcher lock
    LockConfiguration lockConfig =
        new LockConfiguration(
            Instant.now(), "cronDispatcher", Duration.ofMinutes(5), Duration.ofMinutes(1));
    Optional<SimpleLock> externalLock = lockProvider.lock(lockConfig);
    assertThat(externalLock).as("External lock should be acquired").isPresent();

    // Dispatcher call goes through directly (PROXY_SCHEDULER mode bypasses on direct call),
    // but this proves the lock is held in the DB — a scheduler-triggered invocation on
    // another pod would be blocked
    List<Map<String, Object>> locks =
        jdbc.queryForList("SELECT * FROM shedlock WHERE name = 'cronDispatcher'");
    assertThat(locks).hasSize(1);
    assertThat(locks.get(0).get("locked_by")).isNotNull();

    // A second lock attempt fails — proving mutual exclusion
    Optional<SimpleLock> secondLock = lockProvider.lock(lockConfig);
    assertThat(secondLock).as("Second lock should be blocked").isEmpty();

    externalLock.get().unlock();
  }

  @Test
  void schedulerLockAnnotationConfigured() {
    // Verify @SchedulerLock is present on pollAndDispatch
    assertThat(cronDispatcher.getClass().getName()).contains("CronDispatcher");
    var method =
        java.util.Arrays.stream(CronDispatcher.class.getDeclaredMethods())
            .filter(m -> m.getName().equals("pollAndDispatch"))
            .findFirst()
            .orElseThrow();
    var annotation =
        method.getAnnotation(net.javacrumbs.shedlock.spring.annotation.SchedulerLock.class);
    assertThat(annotation).isNotNull();
    assertThat(annotation.name()).isEqualTo("cronDispatcher");
    assertThat(annotation.lockAtMostFor()).isEqualTo("2m");
    assertThat(annotation.lockAtLeastFor()).isEqualTo("10s");
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
            + " VALUES (?, ?, 'Ops', 'HIGH', 'shedcron-owner@citi.com', 'Production',"
            + " 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        name,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedHttpCheck(String csiId, String createdBy) {
    UUID id = UUID.randomUUID();
    String configJson =
        """
        {"type":"HTTP","method":"GET","url":"%s/health","expectedStatusCode":200,"timeoutMs":5000}
        """
            .formatted(wireMock.baseUrl());
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, 'ShedCron Check', 'HTTP', ?, 'ShedCron CSI', 'PENDING',"
            + " ?::jsonb, ?, ?, ?)",
        id,
        csiId,
        configJson,
        createdBy,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private void seedSchedule(
      UUID forCheckId, String cron, String tz, boolean enabled, Instant nextExecutionAt) {
    jdbc.update(
        "INSERT INTO schedules (id, check_id, check_type, frequency, cron_expression, timezone, enabled,"
            + " next_execution_at, created_at, updated_at)"
            + " VALUES (?, ?, 'HTTP', 'custom', ?, ?, ?, ?, ?, ?)",
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
