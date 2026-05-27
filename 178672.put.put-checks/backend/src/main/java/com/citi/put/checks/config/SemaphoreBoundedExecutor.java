package com.citi.put.checks.config;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;

public class SemaphoreBoundedExecutor implements Executor {

  private final Executor delegate;
  private final Semaphore semaphore;

  public SemaphoreBoundedExecutor(Executor delegate, int permits) {
    this.delegate = delegate;
    this.semaphore = new Semaphore(permits);
  }

  @Override
  public void execute(Runnable command) {
    try {
      semaphore.acquire();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new RejectedExecutionException("Interrupted waiting for executor permit", e);
    }
    delegate.execute(
        () -> {
          try {
            command.run();
          } finally {
            semaphore.release();
          }
        });
  }

  public int availablePermits() {
    return semaphore.availablePermits();
  }
}
