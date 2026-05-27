package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@ActiveProfiles("local")
@TestPropertySource(
    properties = {
      "checks.executor.max-concurrency=2",
      "checks.executor.source-limits.HTTP=2",
      "checks.executor.source-limits.TCP=2",
      "checks.executor.source-limits.SPLUNK=0",
      "checks.executor.source-limits.GRAFANA=0",
      "checks.executor.source-limits.ITRS=0",
      "checks.executor.source-limits.APPDYNAMICS=0",
      "checks.executor.source-limits.UI_TEST=0"
    })
class SemaphoreBoundIT {

  @Autowired
  @Qualifier("checkExecutor")
  AsyncTaskExecutor checkExecutor;

  @Test
  void thirdTaskBlocksUntilOnePriorCompletes() throws Exception {
    CountDownLatch holdLatch = new CountDownLatch(1);
    AtomicInteger concurrentCount = new AtomicInteger(0);
    AtomicInteger maxConcurrent = new AtomicInteger(0);

    Runnable task =
        () -> {
          int current = concurrentCount.incrementAndGet();
          maxConcurrent.updateAndGet(prev -> Math.max(prev, current));
          try {
            holdLatch.await(5, TimeUnit.SECONDS);
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
          } finally {
            concurrentCount.decrementAndGet();
          }
        };

    CompletableFuture<?> f1 = CompletableFuture.runAsync(() -> checkExecutor.execute(task));
    CompletableFuture<?> f2 = CompletableFuture.runAsync(() -> checkExecutor.execute(task));

    Thread.sleep(200);

    CompletableFuture<Long> f3Start = new CompletableFuture<>();
    CompletableFuture.runAsync(
        () -> {
          f3Start.complete(System.currentTimeMillis());
          checkExecutor.execute(task);
        });

    Thread.sleep(200);
    assertThat(maxConcurrent.get()).isLessThanOrEqualTo(2);

    holdLatch.countDown();
    f1.get(5, TimeUnit.SECONDS);
    f2.get(5, TimeUnit.SECONDS);
  }
}
