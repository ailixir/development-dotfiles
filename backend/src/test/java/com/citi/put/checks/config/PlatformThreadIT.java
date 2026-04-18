package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@ActiveProfiles("local")
@TestPropertySource(properties = "studio.pool.size=1")
class PlatformThreadIT {

  @Autowired
  @Qualifier("uiTestExecutor")
  AsyncTaskExecutor uiTestExecutor;

  @Test
  void uiTestExecutorUsesPlatformThreads() throws Exception {
    CompletableFuture<Boolean> result = new CompletableFuture<>();
    uiTestExecutor.execute(() -> result.complete(Thread.currentThread().isVirtual()));
    assertThat(result.get()).isFalse();
  }
}
