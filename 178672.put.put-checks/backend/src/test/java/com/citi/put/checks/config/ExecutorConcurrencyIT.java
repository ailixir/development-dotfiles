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
class ExecutorConcurrencyIT {

  static final int MAX_CONCURRENCY = 8;

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired
  @Qualifier("checkExecutor")
  AsyncTaskExecutor checkExecutor;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
    registry.add("checks.executor.max-concurrency", () -> String.valueOf(MAX_CONCURRENCY));
    registry.add("checks.executor.source-limits.HTTP", () -> String.valueOf(MAX_CONCURRENCY));
    registry.add("checks.executor.source-limits.TCP", () -> String.valueOf(MAX_CONCURRENCY));
    registry.add("checks.executor.source-limits.SPLUNK", () -> "0");
    registry.add("checks.executor.source-limits.GRAFANA", () -> "0");
    registry.add("checks.executor.source-limits.ITRS", () -> "0");
    registry.add("checks.executor.source-limits.APPDYNAMICS", () -> "0");
    registry.add("checks.executor.source-limits.UI_TEST", () -> "0");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @Test
  void checkExecutorBoundedByMaxConcurrencyNotHikari() throws InterruptedException {
    int totalTasks = MAX_CONCURRENCY + 4;
    AtomicInteger concurrentCount = new AtomicInteger(0);
    AtomicInteger maxConcurrent = new AtomicInteger(0);
    CountDownLatch allStarted = new CountDownLatch(MAX_CONCURRENCY);
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch allDone = new CountDownLatch(totalTasks);

    for (int i = 0; i < totalTasks; i++) {
      checkExecutor.execute(
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
        .as(
            "Max concurrent tasks should be bounded by max-concurrency (%d), not Hikari pool size",
            MAX_CONCURRENCY)
        .isLessThanOrEqualTo(MAX_CONCURRENCY);

    release.countDown();
    allDone.await(5, TimeUnit.SECONDS);
  }
}
