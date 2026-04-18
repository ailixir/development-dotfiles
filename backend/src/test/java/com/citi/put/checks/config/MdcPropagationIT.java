package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class MdcPropagationIT {

  @Autowired
  @Qualifier("applicationTaskExecutor")
  AsyncTaskExecutor executor;

  @Test
  void mdcContextPropagatesAcrossAsyncBoundary() throws Exception {
    MDC.put("traceId", "test-trace-123");
    MDC.put("userId", "test-user");

    CompletableFuture<String> traceResult = new CompletableFuture<>();
    CompletableFuture<String> userResult = new CompletableFuture<>();

    executor.execute(
        () -> {
          traceResult.complete(MDC.get("traceId"));
          userResult.complete(MDC.get("userId"));
        });

    assertThat(traceResult.get()).isEqualTo("test-trace-123");
    assertThat(userResult.get()).isEqualTo("test-user");

    MDC.clear();
  }
}
