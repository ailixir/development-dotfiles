package com.citi.put.checks.studio.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.StudioDispatchScheduler;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.recovery.PendingReaper;
import com.citi.put.checks.studio.recovery.RunningReaper;
import com.citi.put.checks.studio.recovery.StudioRecoveryScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class StudioLocalSchedulingTest {
  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withUserConfiguration(StudioDispatchScheduler.class, StudioRecoveryScheduler.class)
          .withBean(StudioDispatcher.class, () -> mock(StudioDispatcher.class))
          .withBean(PendingReaper.class, () -> mock(PendingReaper.class))
          .withBean(RunningReaper.class, () -> mock(RunningReaper.class))
          .withBean(
              StudioExecutionProperties.class,
              () ->
                  new StudioExecutionProperties(
                      true, null, null, null, null, null, null, null, null, null, null));

  @Test
  void localAndWorkerDispatchWhenEnabledButApiNeverDoes() {
    for (String profile : new String[] {"local", "worker"}) {
      runner
          .withPropertyValues(
              "spring.profiles.active=" + profile, "studio.execution.dispatcher.enabled=true")
          .run(
              context ->
                  assertThat(context)
                      .hasNotFailed()
                      .hasSingleBean(StudioDispatchScheduler.class)
                      .hasSingleBean(StudioRecoveryScheduler.class));
    }
    runner
        .withPropertyValues(
            "spring.profiles.active=api", "studio.execution.dispatcher.enabled=true")
        .run(
            context ->
                assertThat(context)
                    .hasNotFailed()
                    .doesNotHaveBean(StudioDispatchScheduler.class)
                    .doesNotHaveBean(StudioRecoveryScheduler.class));
    runner
        .withPropertyValues(
            "spring.profiles.active=local", "studio.execution.dispatcher.enabled=false")
        .run(
            context ->
                assertThat(context)
                    .hasNotFailed()
                    .doesNotHaveBean(StudioDispatchScheduler.class)
                    .doesNotHaveBean(StudioRecoveryScheduler.class));
  }
}
