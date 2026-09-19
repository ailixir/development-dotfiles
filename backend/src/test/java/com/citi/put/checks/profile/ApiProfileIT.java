package com.citi.put.checks.profile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.CheckController;
import com.citi.put.checks.csi.CsiController;
import com.citi.put.checks.reports.ReportsController;
import com.citi.put.checks.scheduling.CronDispatcher;
import com.citi.put.checks.scheduling.partitioning.PartitionHealthIndicator;
import com.citi.put.checks.scheduling.partitioning.PartitionScheduler;
import com.citi.put.checks.scheduling.partitioning.RetentionPruner;
import com.citi.put.checks.studio.dispatch.StudioDispatchMetrics;
import com.citi.put.checks.studio.dispatch.StudioDispatchScheduler;
import com.citi.put.checks.studio.recovery.StudioRecoveryScheduler;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Status;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

// Spring Boot test contexts turn metrics export off unless asked; without this the Prometheus
// registry is never built and the scrape endpoint is absent for a reason that is not exposure.
@AutoConfigureObservability(tracing = false)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"local", "api"})
class ApiProfileIT {

  @Autowired ApplicationContext context;
  @Autowired TestRestTemplate restTemplate;
  @Autowired JdbcTemplate jdbc;
  @Autowired PartitionHealthIndicator partitionHealth;

  @Test
  void restControllersLoaded() {
    assertThat(context.getBean(CheckController.class)).isNotNull();
    assertThat(context.getBean(CsiController.class)).isNotNull();
    assertThat(context.getBean(ReportsController.class)).isNotNull();
  }

  @Test
  void cronDispatcherNotLoaded() {
    assertBeanAbsent(CronDispatcher.class);
  }

  @Test
  void partitionSchedulerNotLoaded() {
    assertBeanAbsent(PartitionScheduler.class);
  }

  /**
   * Studio v1 gaps: the scheduler is absent here, but partition creation is not. An API pod used to
   * start with whatever partitions a worker had made, so on a fresh database its health was DOWN
   * and the runs it accepted landed in DEFAULT.
   */
  @Test
  void partitionsAreBootstrappedOnTheApiToo() {
    YearMonth now = YearMonth.now(ZoneOffset.UTC);
    DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy_MM");
    for (String table : List.of("execution_results", "ui_test_executions", "report_executions")) {
      for (int i = 0; i <= 2; i++) {
        String partition = table + "_" + now.plusMonths(i).format(fmt);
        assertThat(
                jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class, partition))
            .as("partition %s exists on an API-only start", partition)
            .isTrue();
      }
    }
    assertThat(partitionHealth.health().getStatus()).isNotEqualTo(Status.DOWN);
  }

  @Test
  void retentionPrunerNotLoaded() {
    assertBeanAbsent(RetentionPruner.class);
  }

  /**
   * Studio v1 WP7. The API is what the public Ingress routes to and SecurityConfig permits
   * /actuator/** without a session, so the scrape endpoint is not served here. The registry is
   * built (see the class annotation) and info is still served, which is what makes the 404 about
   * exposure and not about a missing registry or an unreachable actuator.
   */
  @Test
  void prometheusScrapeIsNotExposedButInfoIs() {
    ResponseEntity<String> info = restTemplate.getForEntity("/actuator/info", String.class);
    assertThat(info.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(context.getBeanNamesForType(PrometheusMeterRegistry.class)).hasSize(1);

    ResponseEntity<String> scrape = restTemplate.getForEntity("/actuator/prometheus", String.class);
    assertThat(scrape.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
  }

  @Test
  void studioDispatchMetricsNotLoaded() {
    assertBeanAbsent(StudioDispatchMetrics.class);
  }

  /** Studio v1 WP2: the local schedules are gated `local & !api`, so an API context has neither. */
  @Test
  void studioDispatchAndRecoverySchedulesNotLoaded() {
    assertBeanAbsent(StudioDispatchScheduler.class);
    assertBeanAbsent(StudioRecoveryScheduler.class);
  }

  private void assertBeanAbsent(Class<?> beanType) {
    try {
      context.getBean(beanType);
      throw new AssertionError(
          "Bean " + beanType.getSimpleName() + " should NOT be loaded in api profile");
    } catch (NoSuchBeanDefinitionException expected) {
      // correct
    }
  }
}
