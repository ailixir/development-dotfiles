package com.citi.put.checks.studio.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.scheduling.SchedulingTargetWorker;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class StudioSchedulingIsolationTest {
  @Test
  void defaultAndProductionNeverAcceptConfiguredDevelopmentGrants() {
    var properties = new StudioSchedulingProperties();
    var env = new MockEnvironment();
    env.setActiveProfiles("test");
    var authorization = new ConfiguredBackgroundAuthorization(properties, env);
    properties.setLocalGrants(Map.of("123|Production", "service"));
    assertThatThrownBy(() -> authorization.require("service", "123", "Production"))
        .isInstanceOf(StudioScheduleException.class);
    assertThat(authorization.localOnly()).isFalse();
    properties.setLocalGrantsEnabled(true);
    authorization.require("service", "123", "Production");
    assertThatThrownBy(() -> authorization.require("service", "456", "Production"))
        .isInstanceOf(StudioScheduleException.class);
    assertThatThrownBy(() -> authorization.require("service", "123", "Test"))
        .isInstanceOf(StudioScheduleException.class);
    env.setActiveProfiles("worker", "production");
    assertThat(authorization.principals("123", "Production")).isEmpty();
    assertThat(authorization.localOnly()).isFalse();
    env.setActiveProfiles("local", "production");
    assertThatThrownBy(() -> authorization.require("service", "123", "Production"))
        .isInstanceOf(StudioScheduleException.class);
  }

  @Test
  void producerDoesNotBlockTimerOrQueueOverlappingPasses() throws Exception {
    var processor = mock(StudioScheduleProcessor.class);
    var properties = new StudioSchedulingProperties();
    properties.setEnabled(true);
    var began = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    var finished = new CountDownLatch(1);
    var calls = new AtomicInteger();
    when(processor.poll())
        .thenAnswer(
            invocation -> {
              calls.incrementAndGet();
              began.countDown();
              try {
                if (!release.await(10, TimeUnit.SECONDS)) {
                  throw new IllegalStateException("Worker timeout");
                }
              } finally {
                finished.countDown();
              }
              return 1;
            });
    var env = new MockEnvironment();
    env.setActiveProfiles("worker");
    try (var poller =
        new SchedulingTargetWorker(
            new StudioScheduledTarget(processor, properties, env), () -> 0L)) {
      poller.start();
      long start = System.nanoTime();
      poller.kick();
      assertThat(java.time.Duration.ofNanos(System.nanoTime() - start).toMillis()).isLessThan(1000);
      assertThat(began.await(5, TimeUnit.SECONDS)).isTrue();
      for (int i = 0; i < 100; i++) {
        poller.kick();
      }
      assertThat(calls.get()).isEqualTo(1);
      properties.setEnabled(false);
      release.countDown();
      assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
      poller.kick();
      assertThat(calls.get()).isEqualTo(1);
    }
  }
}
