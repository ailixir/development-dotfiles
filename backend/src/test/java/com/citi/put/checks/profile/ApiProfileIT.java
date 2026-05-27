package com.citi.put.checks.profile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.CheckController;
import com.citi.put.checks.csi.CsiController;
import com.citi.put.checks.reports.ReportsController;
import com.citi.put.checks.scheduling.CronDispatcher;
import com.citi.put.checks.scheduling.partitioning.PartitionScheduler;
import com.citi.put.checks.scheduling.partitioning.RetentionPruner;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles({"local", "api"})
class ApiProfileIT {

  @Autowired ApplicationContext context;

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
