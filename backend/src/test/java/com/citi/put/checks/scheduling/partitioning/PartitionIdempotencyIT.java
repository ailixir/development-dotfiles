package com.citi.put.checks.scheduling.partitioning;

import static org.assertj.core.api.Assertions.assertThatNoException;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class PartitionIdempotencyIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired PartitionScheduler partitionScheduler;

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

  @Test
  void runningSchedulerTwiceProducesNoErrors() {
    assertThatNoException().isThrownBy(() -> partitionScheduler.createFuturePartitions());
    assertThatNoException().isThrownBy(() -> partitionScheduler.createFuturePartitions());
  }
}
