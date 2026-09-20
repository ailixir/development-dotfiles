package com.citi.put.checks.studio.compile;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;

/** Request-owned monotonic bounds shared by proposals, transport and validation. */
public final class CompileBudget {
  private final long started = System.nanoTime();
  private final long durationNanos;
  private final List<Runnable> cancellations = new ArrayList<>();
  private boolean cancelled;
  private int proposals;
  private int transports;
  private long inputBytes;
  private long outputBytes;
  private long inputTokens;
  private long outputTokens;
  private boolean usageAvailable = true;
  private int usageReports;

  public CompileBudget(Duration duration) {
    if (duration == null || duration.isZero() || duration.isNegative()) {
      throw new IllegalArgumentException("compile duration must be positive");
    }
    durationNanos = duration.toNanos();
  }

  public synchronized boolean isCancelled() {
    return cancelled || durationNanos - (System.nanoTime() - started) <= 0;
  }

  /** Account actual request bytes and vendor usage; missing usage is never reported as zero. */
  public synchronized void accountInput(int bytes) {
    remaining();
    if (bytes < 0) {
      throw new IllegalArgumentException("negative input bytes");
    }
    inputBytes += bytes;
  }

  public synchronized void accountOutput(int bytes, Integer promptTokens, Integer generatedTokens) {
    remaining();
    if (bytes < 0
        || (promptTokens != null && promptTokens < 0)
        || (generatedTokens != null && generatedTokens < 0)) {
      throw new IllegalArgumentException("negative usage");
    }
    outputBytes += bytes;
    usageReports++;
    usageAvailable = usageAvailable && promptTokens != null && generatedTokens != null;
    if (promptTokens != null) {
      inputTokens += promptTokens;
    }
    if (generatedTokens != null) {
      outputTokens += generatedTokens;
    }
  }

  public synchronized Usage usage() {
    boolean complete = usageAvailable && usageReports > 0 && usageReports == transports;
    return new Usage(
        inputBytes,
        outputBytes,
        complete ? inputTokens : null,
        complete ? outputTokens : null,
        complete);
  }

  public record Usage(
      long inputBytes,
      long outputBytes,
      Long inputTokens,
      Long outputTokens,
      boolean usageAvailable) {}

  public synchronized Duration remaining() {
    long nanos = durationNanos - (System.nanoTime() - started);
    if (cancelled || nanos <= 0) {
      throw new CancellationException("compile budget expired or cancelled");
    }
    return Duration.ofNanos(nanos);
  }

  public Duration cap(Duration perCall) {
    Duration left = remaining();
    return left.compareTo(perCall) < 0 ? left : perCall;
  }

  public synchronized void proposal() {
    remaining();
    if (proposals >= 3) {
      throw new CancellationException("proposal limit exhausted");
    }
    proposals++;
  }

  public synchronized void transport() {
    remaining();
    if (transports >= 9) {
      throw new CancellationException("transport limit exhausted");
    }
    transports++;
  }

  public synchronized int proposals() {
    return proposals;
  }

  public synchronized int transports() {
    return transports;
  }

  /** Registration and cancellation are serialized so cancellation cannot miss a new transport. */
  public synchronized Runnable onCancel(Runnable cancellation) {
    if (cancelled || durationNanos - (System.nanoTime() - started) <= 0) {
      cancellation.run();
      throw new CancellationException("compile budget expired or cancelled");
    }
    cancellations.add(cancellation);
    return () -> removeCancellation(cancellation);
  }

  private synchronized void removeCancellation(Runnable cancellation) {
    cancellations.remove(cancellation);
  }

  public synchronized void cancel() {
    if (!cancelled) {
      cancelled = true;
      for (Runnable action : cancellations) {
        try {
          action.run();
        } catch (RuntimeException ignored) {
          // Continue cancelling other transports even if an adapter's cancellation hook fails.
        }
      }
      cancellations.clear();
      notifyAll();
    }
  }

  public synchronized void backoff(Duration delay) throws InterruptedException {
    long end = System.nanoTime() + cap(delay).toNanos();
    while (true) {
      remaining();
      long wait = end - System.nanoTime();
      if (wait <= 0) {
        return;
      }
      java.util.concurrent.TimeUnit.NANOSECONDS.timedWait(this, wait);
    }
  }
}
