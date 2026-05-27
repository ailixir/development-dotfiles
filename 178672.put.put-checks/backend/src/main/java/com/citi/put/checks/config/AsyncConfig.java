package com.citi.put.checks.config;

import java.util.concurrent.Executors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.support.TaskExecutorAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class AsyncConfig {

  @Bean("applicationTaskExecutor")
  public AsyncTaskExecutor applicationTaskExecutor(
      MdcTaskDecorator decorator,
      @Value("${checks.executor.app-semaphore-multiplier:2}") int multiplier,
      @Value("${spring.datasource.hikari.maximum-pool-size:10}") int hikariMax) {
    int permits = multiplier * hikariMax;
    SemaphoreBoundedExecutor bounded =
        new SemaphoreBoundedExecutor(Executors.newVirtualThreadPerTaskExecutor(), permits);
    TaskExecutorAdapter adapter = new TaskExecutorAdapter(bounded);
    adapter.setTaskDecorator(decorator);
    return adapter;
  }

  @Bean("checkExecutor")
  public AsyncTaskExecutor checkExecutor(
      MdcTaskDecorator decorator, SourceConcurrencyProperties concurrencyProps) {
    int permits = concurrencyProps.maxConcurrency();
    SemaphoreBoundedExecutor bounded =
        new SemaphoreBoundedExecutor(Executors.newVirtualThreadPerTaskExecutor(), permits);
    TaskExecutorAdapter adapter = new TaskExecutorAdapter(bounded);
    adapter.setTaskDecorator(decorator);
    return adapter;
  }

  @Bean("dispatchExecutor")
  public AsyncTaskExecutor dispatchExecutor(
      MdcTaskDecorator decorator, @Value("${checks.scheduling.batch-size:500}") int batchSize) {
    SemaphoreBoundedExecutor bounded =
        new SemaphoreBoundedExecutor(Executors.newVirtualThreadPerTaskExecutor(), batchSize);
    TaskExecutorAdapter adapter = new TaskExecutorAdapter(bounded);
    adapter.setTaskDecorator(decorator);
    return adapter;
  }

  @Bean("uiTestExecutor")
  @Profile("!worker")
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
