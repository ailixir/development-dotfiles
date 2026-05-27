package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class VirtualThreadIT {

  @Autowired
  @Qualifier("applicationTaskExecutor")
  AsyncTaskExecutor defaultExecutor;

  @Autowired
  @Qualifier("checkExecutor")
  AsyncTaskExecutor checkExecutor;

  @Test
  void defaultExecutorUsesVirtualThreads() throws Exception {
    CompletableFuture<Boolean> result = new CompletableFuture<>();
    defaultExecutor.execute(() -> result.complete(Thread.currentThread().isVirtual()));
    assertThat(result.get()).isTrue();
  }

  @Test
  void checkExecutorUsesVirtualThreads() throws Exception {
    CompletableFuture<Boolean> result = new CompletableFuture<>();
    checkExecutor.execute(() -> result.complete(Thread.currentThread().isVirtual()));
    assertThat(result.get()).isTrue();
  }
}
