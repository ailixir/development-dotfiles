package com.citi.put.checks.scheduling;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.scheduling.entity.FailedDispatch;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@TestPropertySource(properties = {"checks.dispatch.pending-threshold=3"})
class DispatcherHealthIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired FailedDispatchRepository failedDispatchRepository;
  @Autowired DispatcherHealthIndicator healthIndicator;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
    registry.add("checks.reports.initial-delay-ms", () -> "300000");
    registry.add("checks.scheduling.retry-initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    failedDispatchRepository.deleteAll();
  }

  @Test
  void healthUpWhenNoFailedDispatches() {
    Health health = healthIndicator.health();
    assertThat(health.getStatus()).isEqualTo(Status.UP);
    assertThat(health.getDetails().get("deadLetteredLast24h")).isEqualTo(0L);
    assertThat(health.getDetails().get("pendingRetries")).isEqualTo(0L);
  }

  @Test
  void healthDownWhenDeadLetteredItemsExist() {
    FailedDispatch fd = new FailedDispatch("CHECK", UUID.randomUUID(), "dead error", 1);
    fd.incrementRetry("exhausted");
    failedDispatchRepository.save(fd);

    Health health = healthIndicator.health();
    assertThat(health.getStatus()).isEqualTo(Status.DOWN);
    assertThat((long) health.getDetails().get("deadLetteredLast24h")).isGreaterThan(0);
  }

  @Test
  void healthWarningWhenPendingRetriesExceedThreshold() {
    for (int i = 0; i < 4; i++) {
      failedDispatchRepository.save(
          new FailedDispatch("CHECK", UUID.randomUUID(), "pending error " + i, 3));
    }

    Health health = healthIndicator.health();
    assertThat(health.getStatus()).isEqualTo(new Status("WARNING"));
    assertThat((long) health.getDetails().get("pendingRetries")).isGreaterThanOrEqualTo(3);
  }
}
