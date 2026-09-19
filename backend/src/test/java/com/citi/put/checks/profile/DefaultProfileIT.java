package com.citi.put.checks.profile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.CheckController;
import com.citi.put.checks.csi.CsiController;
import com.citi.put.checks.reports.ReportsController;
import com.citi.put.checks.scheduling.partitioning.PartitionScheduler;
import com.citi.put.checks.scheduling.partitioning.RetentionPruner;
import com.citi.put.checks.studio.dispatch.StudioDispatchScheduler;
import com.citi.put.checks.studio.recovery.StudioRecoveryScheduler;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class DefaultProfileIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired ApplicationContext context;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @Test
  void allControllersLoadedByDefault() {
    assertThat(context.getBean(CheckController.class)).isNotNull();
    assertThat(context.getBean(CsiController.class)).isNotNull();
    assertThat(context.getBean(ReportsController.class)).isNotNull();
  }

  @Test
  void partitionSchedulerLoadedByDefault() {
    assertThat(context.getBean(PartitionScheduler.class)).isNotNull();
  }

  /**
   * Studio v1 WP2: a local bootRun is the API and the worker in one JVM, so a run it accepts must
   * also be dispatched and, if the runner never finishes it, reaped. Without these two beans the
   * UI's "Run Test" would sit PENDING forever.
   */
  @Test
  void studioDispatchAndRecoverySchedulesLoadUnderTheLocalProfile() {
    assertThat(context.getBeanNamesForType(StudioDispatchScheduler.class)).hasSize(1);
    assertThat(context.getBeanNamesForType(StudioRecoveryScheduler.class)).hasSize(1);
  }

  @Test
  void retentionPrunerLoadedByDefault() {
    assertThat(context.getBean(RetentionPruner.class)).isNotNull();
  }
}
