package com.citi.put.checks.profile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.CheckController;
import com.citi.put.checks.csi.CsiController;
import com.citi.put.checks.reports.ReportsController;
import com.citi.put.checks.scheduling.CronDispatcher;
import com.citi.put.checks.scheduling.partitioning.PartitionScheduler;
import com.citi.put.checks.scheduling.partitioning.RetentionPruner;
import com.citi.put.checks.studio.dispatch.StudioDispatchMetrics;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

// Spring Boot test contexts turn metrics export off unless asked; without this the Prometheus
// registry is never built and the scrape endpoint is absent for a reason that is not exposure.
@AutoConfigureObservability(tracing = false)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"local", "api"})
class ApiProfileIT {

  @Autowired ApplicationContext context;
  @Autowired TestRestTemplate restTemplate;

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
