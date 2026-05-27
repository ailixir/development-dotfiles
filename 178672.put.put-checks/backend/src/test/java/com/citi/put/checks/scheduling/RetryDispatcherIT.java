package com.citi.put.checks.scheduling;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.scheduling.entity.FailedDispatch;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.sql.Timestamp;
import java.time.Instant;
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
class RetryDispatcherIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired FailedDispatchRepository failedDispatchRepository;
  @Autowired RetryDispatcher retryDispatcher;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
    registry.add("checks.scheduling.retry-initial-delay-ms", () -> "300000");
    registry.add("checks.reports.initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  private UUID checkId;

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    failedDispatchRepository.deleteAll();
    jdbc.update(
        "UPDATE shedlock SET lock_until = NOW() - INTERVAL '1 minute' WHERE name = 'retryDispatcher'");
    jdbc.update("DELETE FROM shedlock WHERE name = 'retryDispatcher'");

    String email = "retry-" + UUID.randomUUID() + "@citi.com";
    String csiId = String.valueOf(System.nanoTime() % 100_000_000L);
    checkId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Retry User', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Retry CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    String configJson =
        """
        {"type":"HTTP","method":"GET","url":"%s/health","expectedStatusCode":200,"timeoutMs":5000}
        """
            .formatted(wireMock.baseUrl());
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at) VALUES (?, 'Retry Check', 'HTTP', ?, 'Retry CSI',"
            + " 'PENDING', ?::jsonb, ?, ?, ?)",
        checkId,
        csiId,
        configJson,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    wireMock.stubFor(get(urlEqualTo("/health")).willReturn(okJson("{\"status\":\"UP\"}")));
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    "{\"user_id\":\"u\",\"email\":\""
                        + email
                        + "\",\"name\":\"R\",\"roles\":[\"checks-admin\"],"
                        + "\"csi_ownership\":[{\"csi_id\":\""
                        + csiId
                        + "\",\"role\":\"owner\"}]}")));
  }

  @Test
  void retrySucceedsAndDeletesRecord() {
    FailedDispatch fd = new FailedDispatch("CHECK", checkId, "transient error", 3);
    fd = failedDispatchRepository.save(fd);

    retryDispatcher.retrySingle(fd);

    assertThat(failedDispatchRepository.findById(fd.getId()))
        .as("Successful retry should delete the record")
        .isEmpty();
  }

  @Test
  void exponentialBackoffDoublesDelay() {
    UUID fakeCheckId = UUID.randomUUID();
    FailedDispatch fd = new FailedDispatch("CHECK", fakeCheckId, "initial error", 3);
    fd = failedDispatchRepository.save(fd);

    Instant beforeRetry = Instant.now();
    retryDispatcher.retrySingle(fd);

    FailedDispatch updated = failedDispatchRepository.findById(fd.getId()).orElseThrow();
    assertThat(updated.getRetryCount()).isEqualTo(1);
    assertThat(updated.getNextRetryAt())
        .as("Next retry should be ~60s from now (30s * 2^1)")
        .isAfter(beforeRetry.plusSeconds(50));
  }

  @Test
  void deadLetterAfterMaxRetries() {
    UUID fakeCheckId = UUID.randomUUID();
    FailedDispatch fd = new FailedDispatch("CHECK", fakeCheckId, "persistent error", 1);
    fd = failedDispatchRepository.save(fd);

    retryDispatcher.retrySingle(fd);

    FailedDispatch dead = failedDispatchRepository.findById(fd.getId()).orElseThrow();
    assertThat(dead.getRetryCount()).isGreaterThanOrEqualTo(dead.getMaxRetries());
    assertThat(dead.isExhausted()).isTrue();
    assertThat(dead.getNextRetryAt())
        .as("Dead-lettered record should have null next_retry_at")
        .isNull();
  }
}
