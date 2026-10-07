package com.citi.put.checks.scheduling;

import java.time.Duration;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * One implementation of isolated, bounded, completion-delayed polling for every registered target.
 */
public final class SchedulingTargetWorker implements AutoCloseable {
  private static final Logger LOG = LoggerFactory.getLogger(SchedulingTargetWorker.class);
  private final ScheduledTarget target;
  private final SchedulingTicker ticker;
  private final long intervalNanos;
  private final long initialDelayNanos;

  /** Retained across coordinator restart: unfinished old work cannot overlap a new generation. */
  static final class Cadence {
    private boolean inFlight;
    private long eligibleAt;
    private SchedulingTargetWorker owner;
  }

  private final Cadence cadence;
  private final AtomicBoolean closed = new AtomicBoolean();
  private final AtomicBoolean started = new AtomicBoolean();
  private final ThreadPoolExecutor executor;

  public SchedulingTargetWorker(ScheduledTarget target, SchedulingTicker ticker) {
    this(target, ticker, new Cadence());
  }

  SchedulingTargetWorker(ScheduledTarget target, SchedulingTicker ticker, Cadence cadence) {
    this.target = target;
    this.ticker = ticker;
    this.cadence = cadence;
    Duration interval = target.pollInterval();
    Duration initial = target.initialDelay();
    if (interval.isZero() || interval.isNegative() || initial.isNegative()) {
      throw new IllegalArgumentException("Invalid target cadence");
    }
    intervalNanos = interval.toNanos();
    initialDelayNanos = initial.toNanos();
    executor =
        new ThreadPoolExecutor(
            1,
            1,
            0,
            TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(1),
            runnable -> {
              Thread thread = new Thread(runnable, "schedule-target-" + target.targetId());
              thread.setDaemon(true);
              return thread;
            },
            new ThreadPoolExecutor.AbortPolicy());
  }

  public void start() {
    synchronized (cadence) {
      if (!closed.get() && !started.get()) {
        cadence.eligibleAt = ticker.nanos() + initialDelayNanos;
        started.set(true);
      }
    }
  }

  public boolean kick() {
    if (!started.get() || closed.get() || !target.enabled()) {
      return false;
    }
    synchronized (cadence) {
      if (closed.get() || ticker.nanos() - cadence.eligibleAt < 0 || cadence.inFlight) {
        return false;
      }
      cadence.inFlight = true;
      cadence.owner = this;
    }
    try {
      executor.execute(
          () -> {
            try {
              if (!closed.get() && target.enabled()) {
                target.pollAndDispatch();
              }
            } catch (RuntimeException ex) {
              LOG.warn(
                  "Scheduling target {} pass failed ({})",
                  target.targetId(),
                  ex.getClass().getSimpleName());
            } finally {
              releaseClaim();
            }
          });
      return true;
    } catch (RejectedExecutionException ex) {
      releaseClaim();
      return false;
    }
  }

  public boolean inFlight() {
    synchronized (cadence) {
      return cadence.inFlight;
    }
  }

  @Override
  public void close() {
    if (closed.compareAndSet(false, true)) {
      if (!executor.shutdownNow().isEmpty()) {
        releaseClaim();
      }
    }
  }

  private void releaseClaim() {
    synchronized (cadence) {
      if (cadence.owner == this) {
        cadence.eligibleAt = ticker.nanos() + intervalNanos;
        cadence.inFlight = false;
        cadence.owner = null;
      }
    }
  }

  public void awaitStop(long millis) {
    try {
      executor.awaitTermination(Math.max(0, millis), TimeUnit.MILLISECONDS);
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
    }
  }
}
