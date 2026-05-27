package com.citi.put.checks.profile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.CheckController;
import com.citi.put.checks.csi.CsiController;
import com.citi.put.checks.dashboard.DashboardController;
import com.citi.put.checks.reports.ReportsController;
import com.citi.put.checks.scheduling.CronDispatcher;
import com.citi.put.checks.scheduling.ReportDeliveryDispatcher;
import com.citi.put.checks.scheduling.ScheduleController;
import com.citi.put.checks.scheduling.partitioning.PartitionScheduler;
import com.citi.put.checks.scheduling.partitioning.RetentionPruner;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"local", "worker"})
@TestPropertySource(properties = "management.server.port=")
class WorkerProfileIT {

  @Autowired ApplicationContext context;
  @Autowired TestRestTemplate restTemplate;

  @Test
  void cronDispatcherBeanExists() {
    assertThat(context.getBean(CronDispatcher.class)).isNotNull();
  }

  @Test
  void partitionSchedulerBeanExists() {
    assertThat(context.getBean(PartitionScheduler.class)).isNotNull();
  }

  @Test
  void retentionPrunerBeanExists() {
    assertThat(context.getBean(RetentionPruner.class)).isNotNull();
  }

  @Test
  void reportDeliveryDispatcherBeanExists() {
    assertThat(context.getBean(ReportDeliveryDispatcher.class)).isNotNull();
  }

  @Test
  void restControllersNotLoaded() {
    assertBeanAbsent(CheckController.class);
    assertBeanAbsent(CsiController.class);
    assertBeanAbsent(DashboardController.class);
    assertBeanAbsent(ReportsController.class);
    assertBeanAbsent(ScheduleController.class);
  }

  @Test
  void actuatorHealthResponds() {
    ResponseEntity<String> response = restTemplate.getForEntity("/actuator/health", String.class);
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void apiEndpointsAreDenied() {
    ResponseEntity<String> response = restTemplate.getForEntity("/api/v1/checks", String.class);
    // Either 403 (denied by WorkerSecurityConfig) or 404 (controllers not loaded)
    assertThat(response.getStatusCode().value())
        .as("API endpoints should not serve traffic in worker mode")
        .isIn(403, 404);
  }

  private void assertBeanAbsent(Class<?> beanType) {
    try {
      context.getBean(beanType);
      throw new AssertionError(
          "Bean " + beanType.getSimpleName() + " should NOT be loaded in worker profile");
    } catch (NoSuchBeanDefinitionException expected) {
      // correct
    }
  }
}
