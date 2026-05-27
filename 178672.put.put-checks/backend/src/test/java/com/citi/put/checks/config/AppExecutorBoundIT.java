package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class AppExecutorBoundIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired
  @Qualifier("applicationTaskExecutor")
  AsyncTaskExecutor appExecutor;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
    registry.add("checks.executor.app-semaphore-multiplier", () -> "1");
    registry.add("spring.datasource.hikari.maximum-pool-size", () -> "5");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @Test
  void semaphoreThrottlesConcurrency() throws InterruptedException {
    int permits = 5;
    int totalTasks = permits + 3;
    AtomicInteger concurrentCount = new AtomicInteger(0);
    AtomicInteger maxConcurrent = new AtomicInteger(0);
    CountDownLatch allStarted = new CountDownLatch(permits);
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch allDone = new CountDownLatch(totalTasks);

    for (int i = 0; i < totalTasks; i++) {
      appExecutor.execute(
          () -> {
            int current = concurrentCount.incrementAndGet();
            maxConcurrent.updateAndGet(max -> Math.max(max, current));
            allStarted.countDown();
            try {
              release.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
              Thread.currentThread().interrupt();
            } finally {
              concurrentCount.decrementAndGet();
              allDone.countDown();
            }
          });
    }

    allStarted.await(3, TimeUnit.SECONDS);
    Thread.sleep(200);

    assertThat(maxConcurrent.get())
        .as("Max concurrent tasks should be bounded by semaphore permits (%d)", permits)
        .isLessThanOrEqualTo(permits);

    release.countDown();
    allDone.await(5, TimeUnit.SECONDS);
  }
}
