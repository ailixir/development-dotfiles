package com.citi.put.checks.config;

import java.util.concurrent.Executors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class AsyncConfig {

  @Bean("applicationTaskExecutor")
  public AsyncTaskExecutor applicationTaskExecutor(MdcTaskDecorator decorator) {
    TaskExecutorAdapter adapter =
        new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
    adapter.setTaskDecorator(decorator);
    return adapter;
  }

  @Bean("checkExecutor")
  public AsyncTaskExecutor checkExecutor(
      MdcTaskDecorator decorator,
      @Value("${checks.executor.semaphore-multiplier:4}") int multiplier,
      @Value("${spring.datasource.hikari.maximum-pool-size:10}") int hikariMax) {
    int permits = multiplier * hikariMax;
    SemaphoreBoundedExecutor bounded =
        new SemaphoreBoundedExecutor(Executors.newVirtualThreadPerTaskExecutor(), permits);
    TaskExecutorAdapter adapter = new TaskExecutorAdapter(bounded);
    adapter.setTaskDecorator(decorator);
    return adapter;
  }

  @Bean("uiTestExecutor")
  public AsyncTaskExecutor uiTestExecutor(
      MdcTaskDecorator decorator, @Value("${studio.pool.size:0}") int poolSize) {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(poolSize);
    executor.setMaxPoolSize(Math.max(poolSize, 1));
    executor.setQueueCapacity(0);
    executor.setThreadNamePrefix("ui-test-");
    executor.setTaskDecorator(decorator);
    executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.AbortPolicy());
    executor.initialize();
    return executor;
  }
}
